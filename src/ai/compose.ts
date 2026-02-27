import { z } from 'zod';
import type {
  Email,
  LLMAdapter,
  ComposeOptions,
  ComposeResult,
} from '../core/types.js';
import { AiError } from '../core/errors.js';
import { emailToPlainText, truncate } from '../core/utils.js';

const ComposeResultSchema = z.object({
  subject: z.string().optional(),
  text: z.string(),
  html: z.string().optional(),
});

const COMPOSE_SYSTEM_PROMPT = `You are an expert email composer. Write clear, well-structured emails that match the requested tone and purpose.

Guidelines:
- Match the specified tone precisely (professional, casual, friendly, formal, empathetic)
- Respect the requested length constraint (short: 2-4 sentences, medium: 1-2 paragraphs, long: 3+ paragraphs)
- Use appropriate greetings and sign-offs for the tone
- Be concise and avoid filler phrases
- If composing a reply, reference the original email naturally
- Structure longer emails with clear paragraphs
- Write in the specified language (default: English)
- Never include placeholder text like [Your Name] — leave sign-offs open for the user`;

const REWRITE_SYSTEM_PROMPT = `You are an expert writing assistant. Rewrite text to match the requested tone while preserving the original meaning.

Tone guidelines:
- professional: formal language, business appropriate, measured
- casual: relaxed, conversational, approachable
- friendly: warm, personable, enthusiastic but not over the top
- formal: very structured, deferential, traditional
- empathetic: understanding, compassionate, supportive

Preserve the core message and any specific details, names, dates, or facts.`;

export class ComposeEngine {
  constructor(private readonly adapter: LLMAdapter) {}

  async compose(options: ComposeOptions): Promise<ComposeResult> {
    const toneDesc = options.tone ?? 'professional';
    const lengthDesc = options.length ?? 'medium';
    const language = options.language ?? 'English';

    const prompt = `Compose a new email with these parameters:
- Tone: ${toneDesc}
- Length: ${lengthDesc}
- Language: ${language}
${options.context ? `- Context/purpose: ${options.context}` : ''}
${options.instructions ? `- Specific instructions: ${options.instructions}` : ''}

Return JSON with:
- subject: suggested subject line
- text: the email body as plain text
- html: the email body as simple HTML (with <p> tags for paragraphs)`;

    try {
      return await this.adapter.completeJSON(prompt, ComposeResultSchema, {
        systemPrompt: COMPOSE_SYSTEM_PROMPT,
        temperature: 0.7,
      });
    } catch (err) {
      throw new AiError(
        `Failed to compose email: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  async reply(
    email: Email,
    options: ComposeOptions,
  ): Promise<ComposeResult> {
    const originalText = truncate(emailToPlainText(email), 6000);
    const toneDesc = options.tone ?? 'professional';
    const lengthDesc = options.length ?? 'medium';
    const language = options.language ?? 'English';

    const prompt = `Write a reply to this email:

--- Original Email ---
${originalText}
--- End Original ---

Reply parameters:
- Tone: ${toneDesc}
- Length: ${lengthDesc}
- Language: ${language}
${options.context ? `- Additional context: ${options.context}` : ''}
${options.instructions ? `- Specific instructions: ${options.instructions}` : ''}

Return JSON with:
- text: the reply body as plain text (do NOT include the original email in the reply)
- html: the reply body as simple HTML`;

    try {
      return await this.adapter.completeJSON(prompt, ComposeResultSchema, {
        systemPrompt: COMPOSE_SYSTEM_PROMPT,
        temperature: 0.7,
      });
    } catch (err) {
      throw new AiError(
        `Failed to compose reply: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  async rewriteInTone(text: string, tone: string): Promise<string> {
    const prompt = `Rewrite the following text in a ${tone} tone. Return ONLY the rewritten text, nothing else.

Text to rewrite:
${text}`;

    try {
      return await this.adapter.complete(prompt, {
        systemPrompt: REWRITE_SYSTEM_PROMPT,
        temperature: 0.6,
      });
    } catch (err) {
      throw new AiError(
        `Failed to rewrite text: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  async improveWriting(text: string): Promise<string> {
    const prompt = `Improve the following text for clarity, grammar, and conciseness. Preserve the original tone and meaning. Return ONLY the improved text, nothing else.

Text to improve:
${text}`;

    try {
      return await this.adapter.complete(prompt, {
        systemPrompt:
          'You are a professional editor. Improve text for clarity, grammar, and conciseness while preserving the author\'s voice and intent. Fix grammatical errors, remove redundancy, improve sentence structure, and enhance readability.',
        temperature: 0.3,
      });
    } catch (err) {
      throw new AiError(
        `Failed to improve writing: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }
}
