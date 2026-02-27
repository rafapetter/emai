import { z } from 'zod';
import type {
  Email,
  LLMAdapter,
  ExtractionResult,
  ParsedAttachment,
} from '../core/types.js';
import { AiError } from '../core/errors.js';
import { emailToPlainText, truncate } from '../core/utils.js';

const EXTRACT_SYSTEM_PROMPT = `You are a precise data extraction system. Extract structured data from emails based on the provided schema.

Rules:
- Only extract data that is explicitly present in the email content
- Never fabricate or assume data that isn't clearly stated
- For each field, note where in the email the data was found (subject, body, signature, header, attachment)
- If a field cannot be found, use null or omit it
- Parse dates into ISO 8601 format when possible
- Parse monetary amounts as numbers with currency codes
- Extract email addresses, phone numbers, and URLs accurately
- Confidence should reflect how certain you are about the extracted data overall`;

export class ExtractEngine {
  constructor(private readonly adapter: LLMAdapter) {}

  async extract<T>(
    email: Email,
    schema: z.ZodType<T>,
  ): Promise<ExtractionResult<T>> {
    const emailText = truncate(emailToPlainText(email), 10000);

    const attachmentText = email.attachments
      .filter((a) => a.contentType.startsWith('text/'))
      .map((a) => `[Attachment: ${a.filename}]`)
      .join('\n');

    const content = attachmentText
      ? `${emailText}\n\n${attachmentText}`
      : emailText;

    return this.extractFromContent(content, schema);
  }

  async extractFromAttachment<T>(
    attachment: ParsedAttachment,
    schema: z.ZodType<T>,
  ): Promise<ExtractionResult<T>> {
    const content = buildAttachmentContent(attachment);
    return this.extractFromContent(content, schema);
  }

  private async extractFromContent<T>(
    content: string,
    schema: z.ZodType<T>,
  ): Promise<ExtractionResult<T>> {
    const schemaDescription = describeSchema(schema);

    const resultSchema = z.object({
      data: z.unknown(),
      confidence: z.number().min(0).max(1),
      sources: z.array(
        z.object({
          field: z.string(),
          source: z.string(),
          span: z.string().optional(),
        }),
      ),
    });

    const prompt = `Extract structured data from the following content according to this schema:

Schema fields:
${schemaDescription}

Content:
${content}

Return a JSON object with:
- data: the extracted data matching the schema
- confidence: overall confidence score 0-1
- sources: array of { field, source, span } where source describes where the data was found (e.g. "subject", "body paragraph 2", "signature", "attachment") and span is the relevant text snippet`;

    try {
      const raw = await this.adapter.completeJSON(prompt, resultSchema, {
        systemPrompt: EXTRACT_SYSTEM_PROMPT,
        temperature: 0.1,
      });

      const dataResult = schema.safeParse(raw.data);
      if (!dataResult.success) {
        throw new AiError(
          `Extracted data failed schema validation: ${dataResult.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
        );
      }

      return {
        data: dataResult.data,
        confidence: raw.confidence,
        sources: raw.sources,
      };
    } catch (err) {
      if (err instanceof AiError) throw err;
      throw new AiError(
        `Extraction failed: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }
}

function buildAttachmentContent(attachment: ParsedAttachment): string {
  const parts: string[] = [`[File: ${attachment.filename} (${attachment.contentType})]`];

  if (attachment.text) {
    parts.push(attachment.text);
  } else if (attachment.markdown) {
    parts.push(attachment.markdown);
  }

  if (attachment.tables && attachment.tables.length > 0) {
    for (const table of attachment.tables) {
      const header = table.headers.join(' | ');
      const rows = table.rows.map((r) => r.join(' | ')).join('\n');
      parts.push(`Table${table.sheetName ? ` (${table.sheetName})` : ''}:\n${header}\n${rows}`);
    }
  }

  if (attachment.structuredData) {
    parts.push(`Structured data:\n${JSON.stringify(attachment.structuredData, null, 2)}`);
  }

  return parts.join('\n\n');
}

function describeSchema(schema: z.ZodType, prefix = ''): string {
  const lines: string[] = [];

  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodType>;
    for (const [key, value] of Object.entries(shape)) {
      const path = prefix ? `${prefix}.${key}` : key;
      const optional = value instanceof z.ZodOptional ? ' (optional)' : '';
      const type = getZodTypeName(value);
      lines.push(`- ${path}: ${type}${optional}`);

      const inner =
        value instanceof z.ZodOptional ? value.unwrap() : value;
      if (inner instanceof z.ZodObject) {
        lines.push(describeSchema(inner, path));
      }
    }
  }

  return lines.join('\n');
}

function getZodTypeName(schema: z.ZodType): string {
  if (schema instanceof z.ZodString) return 'string';
  if (schema instanceof z.ZodNumber) return 'number';
  if (schema instanceof z.ZodBoolean) return 'boolean';
  if (schema instanceof z.ZodArray) return `array of ${getZodTypeName(schema.element)}`;
  if (schema instanceof z.ZodEnum) return `enum(${(schema.options as string[]).join(', ')})`;
  if (schema instanceof z.ZodOptional) return getZodTypeName(schema.unwrap());
  if (schema instanceof z.ZodNullable) return `${getZodTypeName(schema.unwrap())} | null`;
  if (schema instanceof z.ZodObject) return 'object';
  if (schema instanceof z.ZodRecord) return 'record';
  if (schema instanceof z.ZodDate) return 'date (ISO string)';
  return 'unknown';
}
