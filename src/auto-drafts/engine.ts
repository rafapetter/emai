import { z } from 'zod';
import type { Email, LLMAdapter } from '../core/types.js';
import { AiError } from '../core/errors.js';
import { emailToPlainText, truncate, normalizeSubject, formatEmailAddress } from '../core/utils.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FollowUpSuggestion {
  originalEmailId: string;
  originalSubject: string;
  sentTo: string[];
  daysSinceLastReply: number;
  suggestedDraft: {
    subject: string;
    text: string;
  };
  urgency: 'high' | 'medium' | 'low';
}

export interface AutoDraftOptions {
  /** Minimum days without a reply before suggesting follow-up (default: 3) */
  daysWithoutReply?: number;
  /** Tone for the follow-up draft (default: 'professional') */
  tone?: string;
  /** Maximum number of follow-up suggestions to return (default: 5) */
  maxSuggestions?: number;
}

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const FollowUpDraftSchema = z.object({
  subject: z.string(),
  text: z.string(),
  urgency: z.enum(['high', 'medium', 'low']),
});

// ---------------------------------------------------------------------------
// System Prompt
// ---------------------------------------------------------------------------

const FOLLOW_UP_SYSTEM_PROMPT = `You are an expert email follow-up assistant. You write brief, professional follow-up emails for messages that haven't received a reply.

Guidelines:
- Keep follow-ups short and friendly — 2-4 sentences maximum
- Reference the original email's topic naturally
- Don't be pushy or guilt-tripping
- Match the specified tone
- Use a clear call-to-action when appropriate
- For the subject, use "Re: [original subject]" format
- Assess urgency based on the original email's content and time elapsed:
  - high: Time-sensitive matters, overdue items, or 7+ days without reply
  - medium: Standard business follow-ups, 3-6 days without reply
  - low: Casual follow-ups, informational requests`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysBetween(dateA: Date, dateB: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor(Math.abs(dateA.getTime() - dateB.getTime()) / msPerDay);
}

function isReply(sent: Email, received: Email): boolean {
  // Match by threadId
  if (sent.threadId && received.threadId && sent.threadId === received.threadId) {
    return true;
  }

  // Match by subject normalization (strip Re:/Fwd: prefixes)
  const sentNorm = normalizeSubject(sent.subject).toLowerCase();
  const receivedNorm = normalizeSubject(received.subject).toLowerCase();

  if (sentNorm === receivedNorm) {
    // Check that the received email is from one of the original recipients
    const sentToAddresses = new Set(
      sent.to.map((addr) => addr.address.toLowerCase()),
    );
    const receivedFrom = received.from.address.toLowerCase();

    if (sentToAddresses.has(receivedFrom)) {
      // And that the received email came after the sent email
      return received.date.getTime() > sent.date.getTime();
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class AutoDraftsEngine {
  constructor(private readonly adapter: LLMAdapter) {}

  async generateFollowUp(
    sentEmail: Email,
    daysSinceNoReply: number,
    options?: AutoDraftOptions,
  ): Promise<FollowUpSuggestion> {
    const tone = options?.tone ?? 'professional';
    const recipients = sentEmail.to.map(formatEmailAddress).join(', ');
    const body = truncate(emailToPlainText(sentEmail), 1500);

    const prompt = `Write a follow-up email. The original was sent ${daysSinceNoReply} days ago to ${recipients} about "${sentEmail.subject}".

Tone: ${tone}

Original email:
${body}

Keep it brief and ${tone}. Reference the original topic naturally.

Return JSON with:
- subject: follow-up subject line (use "Re: [original subject]" format)
- text: the follow-up email body
- urgency: "high", "medium", or "low" based on content and days elapsed`;

    try {
      const result = await this.adapter.completeJSON(
        prompt,
        FollowUpDraftSchema,
        { systemPrompt: FOLLOW_UP_SYSTEM_PROMPT, temperature: 0.4 },
      );

      return {
        originalEmailId: sentEmail.id,
        originalSubject: sentEmail.subject,
        sentTo: sentEmail.to.map((addr) => addr.address),
        daysSinceLastReply: daysSinceNoReply,
        suggestedDraft: {
          subject: result.subject,
          text: result.text,
        },
        urgency: result.urgency,
      };
    } catch (err) {
      throw new AiError(
        `Failed to generate follow-up draft: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  async generateFollowUps(
    sentEmails: Email[],
    receivedEmails: Email[],
    options?: AutoDraftOptions,
  ): Promise<FollowUpSuggestion[]> {
    const daysThreshold = options?.daysWithoutReply ?? 3;
    const maxSuggestions = options?.maxSuggestions ?? 5;
    const now = new Date();

    // Step 1: Filter sent emails older than daysWithoutReply
    const oldSentEmails = sentEmails.filter(
      (e) => daysBetween(e.date, now) >= daysThreshold,
    );

    // Step 2: Find unreplied sent emails
    const unreplied = oldSentEmails.filter((sent) => {
      // Check if any received email is a reply to this sent email
      return !receivedEmails.some((received) => isReply(sent, received));
    });

    if (unreplied.length === 0) return [];

    // Step 3: Sort by age (oldest first — most overdue)
    unreplied.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Step 4: Limit to maxSuggestions
    const toProcess = unreplied.slice(0, maxSuggestions);

    // Step 5: Generate follow-ups
    const suggestions: FollowUpSuggestion[] = [];

    for (const sent of toProcess) {
      try {
        const days = daysBetween(sent.date, now);
        const suggestion = await this.generateFollowUp(sent, days, options);
        suggestions.push(suggestion);
      } catch {
        // Skip emails that fail to generate follow-ups
        continue;
      }
    }

    return suggestions;
  }
}
