import { z } from 'zod';
import type {
  Email,
  LLMAdapter,
  ClassificationResult,
  EmailCategory,
} from '../core/types.js';
import { EmailCategorySchema } from '../core/types.js';
import { AiError } from '../core/errors.js';
import { emailToPlainText, truncate } from '../core/utils.js';

const ClassificationResultSchema = z.object({
  category: EmailCategorySchema,
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
  labels: z.array(z.string()),
  sentiment: z.enum(['positive', 'negative', 'neutral']),
  isUrgent: z.boolean(),
  isActionRequired: z.boolean(),
});

const BatchClassificationSchema = z.array(
  z.object({
    emailId: z.string(),
    classification: ClassificationResultSchema,
  }),
);

const CLASSIFY_SYSTEM_PROMPT = `You are an expert email classification system. Analyze emails and categorize them accurately.

Categories:
- primary: Important personal or work emails requiring attention
- social: Social network notifications, friend updates
- promotions: Marketing, deals, offers, advertisements
- updates: Automated updates, confirmations, receipts, statements
- forums: Mailing lists, group discussions, community forums
- spam: Unsolicited bulk email, unwanted messages
- phishing: Suspicious emails attempting to steal information or credentials
- support: Customer support conversations, help desk tickets
- sales: Sales outreach, business proposals, partnership requests
- billing: Invoices, payment notifications, subscription billing
- newsletter: Subscribed newsletters, digests, curated content
- notification: App notifications, alerts, system messages
- personal: Personal correspondence from known contacts
- work: Work-related communications, projects, meetings
- other: Doesn't fit any category above

Analysis guidelines:
- Examine sender address patterns (noreply@, marketing@, support@ etc.)
- Check subject line for urgency indicators, marketing language, or personal tone
- Analyze body content for calls to action, links, personal references
- Consider attachment types if mentioned
- Detect phishing indicators: suspicious links, urgency pressure, credential requests, spoofed domains
- Assess sentiment from language tone and word choice
- Flag urgency based on deadlines, time-sensitive language, or priority indicators
- Mark action-required when explicit tasks, questions, or responses are expected`;

export class ClassifyEngine {
  constructor(private readonly adapter: LLMAdapter) {}

  async classify(email: Email): Promise<ClassificationResult> {
    const emailText = truncate(emailToPlainText(email), 8000);
    const attachmentInfo =
      email.attachments.length > 0
        ? `\nAttachments: ${email.attachments.map((a) => `${a.filename} (${a.contentType})`).join(', ')}`
        : '';

    const prompt = `Classify this email:

${emailText}${attachmentInfo}

Return a JSON object with these fields:
- category: one of the valid categories
- confidence: number 0-1
- reasoning: brief explanation of why this category was chosen
- labels: array of relevant keyword labels
- sentiment: "positive", "negative", or "neutral"
- isUrgent: boolean
- isActionRequired: boolean`;

    try {
      return await this.adapter.completeJSON(
        prompt,
        ClassificationResultSchema,
        { systemPrompt: CLASSIFY_SYSTEM_PROMPT, temperature: 0.1 },
      );
    } catch (err) {
      throw new AiError(
        `Failed to classify email: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  async classifyBatch(
    emails: Email[],
  ): Promise<ClassificationResult[]> {
    if (emails.length === 0) return [];
    if (emails.length === 1) return [await this.classify(emails[0])];

    const emailSummaries = emails
      .map((e, i) => {
        const text = truncate(emailToPlainText(e), 2000);
        return `--- Email ${i + 1} (ID: ${e.id}) ---\n${text}`;
      })
      .join('\n\n');

    const prompt = `Classify each of these ${emails.length} emails:

${emailSummaries}

Return a JSON array where each element has:
- emailId: the email ID
- classification: object with category, confidence, reasoning, labels, sentiment, isUrgent, isActionRequired`;

    try {
      const results = await this.adapter.completeJSON(
        prompt,
        BatchClassificationSchema,
        { systemPrompt: CLASSIFY_SYSTEM_PROMPT, temperature: 0.1 },
      );

      const resultMap = new Map(
        results.map((r) => [r.emailId, r.classification]),
      );

      return emails.map((email) => {
        const result = resultMap.get(email.id);
        if (result) return result;
        return fallbackClassification();
      });
    } catch {
      const results: ClassificationResult[] = [];
      for (const email of emails) {
        results.push(await this.classify(email));
      }
      return results;
    }
  }
}

function fallbackClassification(): ClassificationResult {
  return {
    category: 'other' as EmailCategory,
    confidence: 0,
    reasoning: 'Classification failed — fallback applied',
    labels: [],
    sentiment: 'neutral',
    isUrgent: false,
    isActionRequired: false,
  };
}
