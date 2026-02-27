import { z } from 'zod';
import type {
  Email,
  Thread,
  LLMAdapter,
  SummaryResult,
  EmailAddress,
} from '../core/types.js';
import { AiError } from '../core/errors.js';
import { emailToPlainText, truncate, formatEmailAddress } from '../core/utils.js';

const ActionItemSchema = z.object({
  description: z.string(),
  assignee: z.string().optional(),
  dueDate: z.string().optional(),
  priority: z.enum(['high', 'medium', 'low']),
  status: z.enum(['pending', 'done', 'unknown']),
});

const SummaryResultSchema = z.object({
  summary: z.string(),
  keyPoints: z.array(z.string()),
  participants: z.array(
    z.object({
      name: z.string().optional(),
      address: z.string(),
    }),
  ),
  actionItems: z.array(ActionItemSchema),
  sentiment: z.enum(['positive', 'negative', 'neutral', 'mixed']),
  topicTags: z.array(z.string()),
});

const SUMMARIZE_SYSTEM_PROMPT = `You are an expert email summarizer. Create concise, actionable summaries that capture the essential information.

Guidelines:
- Lead with the most important information
- Identify all action items with assignees and deadlines when mentioned
- Note key decisions made or pending
- Capture the overall tone/sentiment of the communication
- List all participants and their roles in the conversation
- Use clear, professional language
- Tag with relevant topics for organization
- Keep summaries proportional to the original content length`;

export class SummarizeEngine {
  constructor(private readonly adapter: LLMAdapter) {}

  async summarize(email: Email): Promise<SummaryResult> {
    const emailText = truncate(emailToPlainText(email), 10000);

    const prompt = `Summarize this email:

${emailText}

Return JSON with:
- summary: concise 2-3 sentence summary
- keyPoints: array of key points/takeaways
- participants: array of { name, address } for all people mentioned or involved
- actionItems: array of { description, assignee, dueDate, priority, status }
- sentiment: overall sentiment ("positive", "negative", "neutral", or "mixed")
- topicTags: array of relevant topic keywords`;

    try {
      const result = await this.adapter.completeJSON(
        prompt,
        SummaryResultSchema,
        { systemPrompt: SUMMARIZE_SYSTEM_PROMPT, temperature: 0.2 },
      );
      return normalizeSummaryResult(result, [email]);
    } catch (err) {
      throw new AiError(
        `Failed to summarize email: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  async summarizeThread(thread: Thread): Promise<SummaryResult> {
    const emailTexts = thread.emails
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((e, i) => {
        const text = truncate(emailToPlainText(e), 3000);
        return `--- Message ${i + 1} of ${thread.emails.length} (${e.date.toISOString()}) ---\n${text}`;
      })
      .join('\n\n');

    const participantList = thread.participants
      .map(formatEmailAddress)
      .join(', ');

    const prompt = `Summarize this email thread with ${thread.messageCount} messages between: ${participantList}

Subject: ${thread.subject}

${emailTexts}

Return JSON with:
- summary: concise summary of the entire conversation arc
- keyPoints: key points, decisions, and outcomes across all messages
- participants: array of { name, address } for all participants
- actionItems: consolidated action items (deduplicated) with assignees and deadlines
- sentiment: overall thread sentiment
- topicTags: relevant topic keywords`;

    try {
      const result = await this.adapter.completeJSON(
        prompt,
        SummaryResultSchema,
        { systemPrompt: SUMMARIZE_SYSTEM_PROMPT, temperature: 0.2 },
      );
      return normalizeSummaryResult(result, thread.emails);
    } catch (err) {
      throw new AiError(
        `Failed to summarize thread: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  async summarizeBatch(emails: Email[]): Promise<string> {
    if (emails.length === 0) return '';

    const emailSummaries = emails
      .map((e, i) => {
        const from = formatEmailAddress(e.from);
        const text = truncate(
          e.body.text || e.snippet || e.subject,
          500,
        );
        return `${i + 1}. From: ${from} | Subject: ${e.subject} | ${e.date.toISOString()}\n${text}`;
      })
      .join('\n\n');

    const prompt = `Create a digest summary of these ${emails.length} emails. Write a cohesive newsletter-style summary that groups related topics, highlights important items, and gives an overview of all communications.

${emailSummaries}

Write the digest as plain text (not JSON). Use clear sections and bullet points where appropriate.`;

    try {
      return await this.adapter.complete(prompt, {
        systemPrompt:
          'You are an executive assistant creating a daily email digest. Summarize multiple emails into a cohesive, scannable overview. Group by topic, highlight urgent items first, and keep it concise.',
        temperature: 0.4,
      });
    } catch (err) {
      throw new AiError(
        `Failed to create batch summary: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }
}

function normalizeSummaryResult(
  raw: z.infer<typeof SummaryResultSchema>,
  emails: Email[],
): SummaryResult {
  const knownParticipants = new Map<string, EmailAddress>();
  for (const email of emails) {
    addParticipant(knownParticipants, email.from);
    for (const addr of email.to) addParticipant(knownParticipants, addr);
    for (const addr of email.cc) addParticipant(knownParticipants, addr);
  }

  for (const p of raw.participants) {
    if (!knownParticipants.has(p.address.toLowerCase())) {
      knownParticipants.set(p.address.toLowerCase(), {
        name: p.name || undefined,
        address: p.address,
      });
    }
  }

  return {
    summary: raw.summary,
    keyPoints: raw.keyPoints,
    participants: Array.from(knownParticipants.values()),
    actionItems: raw.actionItems,
    sentiment: raw.sentiment,
    topicTags: raw.topicTags,
  };
}

function addParticipant(
  map: Map<string, EmailAddress>,
  addr: EmailAddress,
): void {
  const key = addr.address.toLowerCase();
  if (!map.has(key)) {
    map.set(key, addr);
  }
}
