import { z } from 'zod';
import type {
  Attachment,
  ParsedAttachment,
  AttachmentParseOptions,
  ExtractionResult,
  LLMAdapter,
} from '../core/types.js';
import { EmaiError, AdapterNotConfiguredError } from '../core/errors.js';
import { PdfParser } from './pdf.js';
import { ImageParser } from './image.js';
import { OfficeParser } from './office.js';
import { CsvParser } from './csv.js';
import { VideoParser } from './video.js';

export class AttachmentParser {
  private readonly pdfParser = new PdfParser();
  private readonly imageParser = new ImageParser();
  private readonly officeParser = new OfficeParser();
  private readonly csvParser = new CsvParser();
  private readonly videoParser = new VideoParser();

  async parse(
    attachment: Attachment,
    options: AttachmentParseOptions = {},
  ): Promise<ParsedAttachment> {
    const content = this.getContent(attachment);
    const ct = attachment.contentType.toLowerCase();

    let parsed: ParsedAttachment;

    if (ct === 'application/pdf') {
      parsed = await this.pdfParser.parse(content, options);
    } else if (ct.startsWith('image/')) {
      parsed = await this.imageParser.parse(content, ct, options);
    } else if (this.isOfficeFormat(ct)) {
      parsed = await this.officeParser.parse(content, ct, options);
    } else if (ct === 'text/csv' || ct === 'application/vnd.ms-excel') {
      parsed = await this.csvParser.parse(content, options);
    } else if (ct.startsWith('video/')) {
      parsed = await this.videoParser.parse(content, ct, options);
    } else if (ct.startsWith('text/')) {
      parsed = this.parseText(content, ct, attachment);
    } else {
      parsed = this.parseBestEffort(content, ct, attachment);
    }

    parsed.filename = attachment.filename;
    parsed.contentType = attachment.contentType;
    parsed.size = attachment.size;

    return parsed;
  }

  async toText(
    attachment: Attachment,
    options: AttachmentParseOptions = {},
  ): Promise<string> {
    const parsed = await this.parse(attachment, options);
    return parsed.text ?? parsed.markdown ?? '[No text content extracted]';
  }

  async extract<T>(
    attachment: Attachment,
    schema: z.ZodType<T>,
    adapter: LLMAdapter,
  ): Promise<ExtractionResult<T>> {
    const text = await this.toText(attachment, { depth: 'medium' });

    if (!text || text === '[No text content extracted]') {
      throw new EmaiError(
        'No text content could be extracted from the attachment for structured extraction',
        'PARSE_ERROR',
      );
    }

    const prompt = [
      'Extract structured data from the following document content.',
      'Return a JSON object matching the required schema.',
      '',
      '--- DOCUMENT CONTENT ---',
      text,
      '--- END DOCUMENT ---',
      '',
      'Extract the data and also provide:',
      '- confidence: a number from 0 to 1 indicating how confident you are',
      '- sources: array of { field, source, span } indicating where each field was found',
    ].join('\n');

    const wrapperSchema = z.object({
      data: schema,
      confidence: z.number().min(0).max(1),
      sources: z.array(
        z.object({
          field: z.string(),
          source: z.string(),
          span: z.string().optional(),
        }),
      ),
    });

    const result = await adapter.completeJSON(prompt, wrapperSchema, {
      systemPrompt:
        'You are a document data extraction assistant. Extract structured data accurately from the provided content.',
      temperature: 0.1,
    });

    return {
      data: result.data as T,
      confidence: result.confidence,
      sources: result.sources,
    };
  }

  async describe(attachment: Attachment, adapter: LLMAdapter): Promise<string> {
    if (!adapter.vision) {
      throw new AdapterNotConfiguredError('attachment description (vision)');
    }

    const content = this.getContent(attachment);
    const ct = attachment.contentType.toLowerCase();

    if (ct.startsWith('image/')) {
      return this.imageParser.describe(content, ct, adapter);
    }

    if (ct.startsWith('video/')) {
      const parsed = await this.videoParser.parseDeep(content, ct, adapter);
      return parsed.text ?? '[Unable to describe video content]';
    }

    const text = await this.toText(attachment, { depth: 'medium' });
    return adapter.complete(
      `Describe the following document content concisely:\n\n${text}`,
      {
        systemPrompt: 'You are a document analysis assistant. Provide a clear, concise description.',
        maxTokens: 500,
      },
    );
  }

  async ocr(attachment: Attachment): Promise<string> {
    const content = this.getContent(attachment);
    const ct = attachment.contentType.toLowerCase();

    if (ct.startsWith('image/')) {
      return this.imageParser.ocr(content);
    }

    if (ct === 'application/pdf') {
      const parsed = await this.pdfParser.parse(content, { depth: 'medium' });
      return parsed.text ?? '';
    }

    throw new EmaiError(
      `OCR is not supported for content type: ${attachment.contentType}`,
      'UNSUPPORTED_OPERATION',
    );
  }

  private getContent(attachment: Attachment): Buffer {
    if (!attachment.content) {
      throw new EmaiError(
        `Attachment "${attachment.filename}" has no content. Fetch it from the provider first.`,
        'MISSING_CONTENT',
      );
    }
    return Buffer.from(attachment.content);
  }

  private isOfficeFormat(ct: string): boolean {
    return (
      ct.startsWith('application/vnd.openxmlformats') ||
      ct === 'application/msword' ||
      ct === 'application/vnd.ms-powerpoint'
    );
  }

  private parseText(
    content: Buffer,
    contentType: string,
    attachment: Attachment,
  ): ParsedAttachment {
    const text = content.toString('utf-8');
    return {
      filename: attachment.filename,
      contentType,
      size: content.length,
      text,
      metadata: { format: 'text', encoding: 'utf-8' },
    };
  }

  private parseBestEffort(
    content: Buffer,
    contentType: string,
    attachment: Attachment,
  ): ParsedAttachment {
    let text: string | undefined;
    try {
      const decoded = content.toString('utf-8');
      const nonPrintable = decoded.split('').filter((c) => {
        const code = c.charCodeAt(0);
        return code < 32 && code !== 9 && code !== 10 && code !== 13;
      }).length;

      if (nonPrintable / decoded.length < 0.1) {
        text = decoded;
      }
    } catch {
      // Not decodable as text
    }

    return {
      filename: attachment.filename,
      contentType,
      size: content.length,
      text: text ?? `[Binary content: ${contentType}, ${content.length} bytes]`,
      metadata: {
        format: 'unknown',
        isBinary: !text,
      },
    };
  }
}

export function createAttachmentParser(): AttachmentParser {
  return new AttachmentParser();
}
