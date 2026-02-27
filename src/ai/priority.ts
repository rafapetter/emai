import { z } from 'zod';
import type {
  Email,
  LLMAdapter,
  PriorityResult,
} from '../core/types.js';
import { AiError } from '../core/errors.js';
import { emailToPlainText, truncate, formatEmailAddress } from '../core/utils.js';

const PriorityResultSchema = z.object({
  score: z.number().min(0).max(100),
  level: z.enum(['critical', 'high', 'medium', 'low', 'none']),
  reasoning: z.string(),
  suggestedResponseTime: z.string().optional(),
});

const BatchPrioritySchema = z.array(
  z.object({
    emailId: z.string(),
    priority: PriorityResultSchema,
  }),
);

const PRIORITY_SYSTEM_PROMPT = `You are an intelligent email priority scoring system. Evaluate email importance based on multiple signals.

Scoring criteria (0-100 scale):
- Sender importance (known contact, VIP, boss, client vs. unknown/marketing)
- Subject urgency indicators ("urgent", "asap", "deadline", "action required", "time-sensitive")
- Time sensitivity (mentions specific dates, deadlines, expiring offers)
- Action requirements (explicit requests, questions needing answers, approvals)
- Reply expectations (direct questions, "please respond", "let me know")
- Content importance (financial matters, legal, health, security issues)
- Relationship context (direct vs CC, personal vs. bulk)

Priority levels:
- critical (85-100): Immediate attention needed — urgent deadlines, security issues, VIP requests
- high (65-84): Respond within hours — important requests, time-sensitive matters
- medium (40-64): Respond within a day — standard business communications
- low (15-39): No rush — informational, FYI, newsletters
- none (0-14): No response needed — automated notifications, spam-like

Suggested response times: "immediate", "within 1 hour", "within 4 hours", "today", "within 2 days", "this week", "no response needed"`;

interface PriorityContext {
  userEmail?: string;
  vipList?: string[];
}

export class PriorityEngine {
  constructor(private readonly adapter: LLMAdapter) {}

  async prioritize(
    email: Email,
    context?: PriorityContext,
  ): Promise<PriorityResult> {
    const emailText = truncate(emailToPlainText(email), 8000);
    const contextInfo = buildContextInfo(context);

    const prompt = `Score the priority of this email:

${emailText}
${contextInfo}
Return JSON with:
- score: priority score 0-100
- level: "critical", "high", "medium", "low", or "none"
- reasoning: brief explanation of the priority assessment
- suggestedResponseTime: recommended response timeframe`;

    try {
      return await this.adapter.completeJSON(prompt, PriorityResultSchema, {
        systemPrompt: PRIORITY_SYSTEM_PROMPT,
        temperature: 0.1,
      });
    } catch (err) {
      throw new AiError(
        `Failed to prioritize email: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  async prioritizeBatch(
    emails: Email[],
    context?: PriorityContext,
  ): Promise<Array<{ email: Email; priority: PriorityResult }>> {
    if (emails.length === 0) return [];
    if (emails.length === 1) {
      const priority = await this.prioritize(emails[0], context);
      return [{ email: emails[0], priority }];
    }

    const contextInfo = buildContextInfo(context);
    const emailSummaries = emails
      .map((e, i) => {
        const from = formatEmailAddress(e.from);
        const text = truncate(emailToPlainText(e), 1500);
        return `--- Email ${i + 1} (ID: ${e.id}) ---\nFrom: ${from}\n${text}`;
      })
      .join('\n\n');

    const prompt = `Score the priority of each of these ${emails.length} emails:

${emailSummaries}
${contextInfo}
Return a JSON array where each element has:
- emailId: the email ID
- priority: object with score, level, reasoning, suggestedResponseTime`;

    try {
      const results = await this.adapter.completeJSON(
        prompt,
        BatchPrioritySchema,
        { systemPrompt: PRIORITY_SYSTEM_PROMPT, temperature: 0.1 },
      );

      const resultMap = new Map(
        results.map((r) => [r.emailId, r.priority]),
      );

      const prioritized = emails.map((email) => ({
        email,
        priority: resultMap.get(email.id) ?? fallbackPriority(),
      }));

      prioritized.sort((a, b) => b.priority.score - a.priority.score);
      return prioritized;
    } catch {
      const results: Array<{ email: Email; priority: PriorityResult }> = [];
      for (const email of emails) {
        const priority = await this.prioritize(email, context);
        results.push({ email, priority });
      }
      results.sort((a, b) => b.priority.score - a.priority.score);
      return results;
    }
  }
}

function buildContextInfo(context?: PriorityContext): string {
  if (!context) return '';
  const parts: string[] = [];
  if (context.userEmail) {
    parts.push(`User's email address: ${context.userEmail}`);
  }
  if (context.vipList && context.vipList.length > 0) {
    parts.push(`VIP/important contacts: ${context.vipList.join(', ')}`);
  }
  return parts.length > 0 ? `\nContext:\n${parts.join('\n')}\n` : '';
}

function fallbackPriority(): PriorityResult {
  return {
    score: 50,
    level: 'medium',
    reasoning: 'Priority assessment failed — default applied',
    suggestedResponseTime: 'today',
  };
}
