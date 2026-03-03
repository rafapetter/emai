import { z } from 'zod';
import type { Email, LLMAdapter } from '../core/types.js';
import { AiError } from '../core/errors.js';
import { emailToPlainText, truncate, formatEmailAddress } from '../core/utils.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AskResult {
  answer: string;
  sources: Array<{ emailId: string; subject: string }>;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const AskResponseSchema = z.object({
  answer: z.string(),
  sourceEmailIds: z.array(z.string()),
  confidence: z.number().min(0).max(1),
});

// ---------------------------------------------------------------------------
// System Prompt
// ---------------------------------------------------------------------------

const ASK_SYSTEM_PROMPT = `You are an intelligent email assistant that answers questions based on email content. You have access to the user's emails and should answer questions accurately using only the information available in the provided emails.

Guidelines:
- Answer based ONLY on the email content provided — do not hallucinate or infer beyond what's written
- Cite specific email IDs that contain the information you used to form your answer
- If the answer is not found in the emails, say so clearly
- If the answer is partially found, provide what you can and note what's missing
- Be concise but thorough
- Confidence should reflect how well the emails support your answer:
  - 0.9-1.0: Answer is directly and clearly stated in the emails
  - 0.7-0.8: Answer is strongly implied by email content
  - 0.5-0.6: Answer is partially supported, some inference needed
  - 0.3-0.4: Answer is loosely related to email content
  - 0.0-0.2: Answer not found in emails`;

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class AskEngine {
  constructor(private readonly adapter: LLMAdapter) {}

  async ask(question: string, emails: Email[]): Promise<AskResult> {
    if (emails.length === 0) {
      return {
        answer: 'No emails were provided to search through.',
        sources: [],
        confidence: 0,
      };
    }

    // Build context from emails
    const emailContext = emails
      .map((e) => {
        const from = formatEmailAddress(e.from);
        const body = truncate(
          e.body.text || e.snippet || e.subject,
          200,
        );
        return `[ID: ${e.id}] From: ${from} | Subject: ${e.subject} | Date: ${e.date.toISOString()}\n${body}`;
      })
      .join('\n\n');

    const prompt = `Answer this question based on the emails below. Cite source email IDs.

Question: ${question}

--- Emails ---

${emailContext}

Return JSON with:
- answer: your answer to the question
- sourceEmailIds: array of email IDs that contain relevant information
- confidence: how confident you are in the answer (0.0-1.0)`;

    try {
      const result = await this.adapter.completeJSON(
        prompt,
        AskResponseSchema,
        { systemPrompt: ASK_SYSTEM_PROMPT, temperature: 0.1 },
      );

      // Map sourceEmailIds back to email subjects
      const emailMap = new Map(emails.map((e) => [e.id, e]));
      const sources = result.sourceEmailIds
        .map((id) => {
          const email = emailMap.get(id);
          if (!email) return null;
          return { emailId: id, subject: email.subject };
        })
        .filter((s): s is { emailId: string; subject: string } => s !== null);

      return {
        answer: result.answer,
        sources,
        confidence: result.confidence,
      };
    } catch (err) {
      throw new AiError(
        `Failed to answer question: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }
}
