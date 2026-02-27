import type {
  ParsedAttachment,
  AttachmentParseOptions,
  LLMAdapter,
  ParsedImage,
} from '../core/types.js';
import { tryImport } from '../core/utils.js';
import { EmaiError, AdapterNotConfiguredError } from '../core/errors.js';

interface SharpInstance {
  metadata(): Promise<{
    width?: number;
    height?: number;
    format?: string;
    channels?: number;
    space?: string;
    density?: number;
    hasAlpha?: boolean;
    orientation?: number;
    size?: number;
  }>;
}

type SharpFn = (input: Buffer) => SharpInstance;

interface TesseractWorker {
  recognize(image: Buffer): Promise<{ data: { text: string } }>;
  terminate(): Promise<void>;
}

interface TesseractModule {
  createWorker(lang?: string): Promise<TesseractWorker>;
}

export class ImageParser {
  async parse(
    content: Buffer,
    mimeType: string,
    options: AttachmentParseOptions = {},
  ): Promise<ParsedAttachment> {
    const depth = options.depth ?? 'medium';
    const metadata = await this.extractMetadata(content, mimeType);

    const parsed: ParsedAttachment = {
      filename: '',
      contentType: mimeType,
      size: content.length,
      metadata,
    };

    if (depth === 'basic') {
      return parsed;
    }

    if (depth === 'medium' || depth === 'deep') {
      try {
        const ocrText = await this.ocr(content, options.ocrLanguage);
        if (ocrText.trim()) {
          parsed.text = ocrText;
          parsed.images = [
            {
              index: 0,
              ocrText,
              width: metadata['width'] as number | undefined,
              height: metadata['height'] as number | undefined,
              mimeType,
            },
          ];
        }
      } catch {
        parsed.metadata = {
          ...parsed.metadata,
          ocrAvailable: false,
          ocrNote: 'tesseract.js not available; install it for OCR support',
        };
      }
    }

    return parsed;
  }

  async ocr(content: Buffer, language = 'eng'): Promise<string> {
    const tesseract = await tryImport<TesseractModule>('tesseract.js', 'OCR');
    const worker = await tesseract.createWorker(language);

    try {
      const { data } = await worker.recognize(content);
      return data.text;
    } catch (err) {
      throw new EmaiError(
        `OCR failed: ${err instanceof Error ? err.message : String(err)}`,
        'PARSE_ERROR',
        err,
      );
    } finally {
      await worker.terminate().catch(() => {});
    }
  }

  async describe(
    content: Buffer,
    mimeType: string,
    adapter: LLMAdapter,
  ): Promise<string> {
    if (!adapter.vision) {
      throw new AdapterNotConfiguredError('image description (vision)');
    }

    try {
      return await adapter.vision(
        [{ data: content, mimeType }],
        'Describe this image in detail. Include any text visible in the image, the layout, colors, and key elements.',
      );
    } catch (err) {
      throw new EmaiError(
        `Image description failed: ${err instanceof Error ? err.message : String(err)}`,
        'AI_ERROR',
        err,
      );
    }
  }

  async parseDeep(
    content: Buffer,
    mimeType: string,
    adapter: LLMAdapter,
    options: AttachmentParseOptions = {},
  ): Promise<ParsedAttachment> {
    const parsed = await this.parse(content, mimeType, { ...options, depth: 'medium' });

    try {
      const description = await this.describe(content, mimeType, adapter);
      parsed.metadata = { ...parsed.metadata, description };

      const images: ParsedImage[] = parsed.images ?? [];
      if (images.length > 0) {
        images[0].description = description;
      } else {
        images.push({
          index: 0,
          description,
          width: parsed.metadata?.['width'] as number | undefined,
          height: parsed.metadata?.['height'] as number | undefined,
          mimeType,
        });
      }
      parsed.images = images;

      const textParts: string[] = [];
      if (description) textParts.push(`Image description: ${description}`);
      if (parsed.text) textParts.push(`OCR text: ${parsed.text}`);
      parsed.text = textParts.join('\n\n');
    } catch {
      // Vision not available — keep medium-depth results
    }

    return parsed;
  }

  private async extractMetadata(
    content: Buffer,
    mimeType: string,
  ): Promise<Record<string, unknown>> {
    const meta: Record<string, unknown> = {
      mimeType,
      sizeBytes: content.length,
    };

    try {
      const sharp = await this.loadSharp();
      const instance = sharp(content);
      const info = await instance.metadata();
      if (info.width) meta['width'] = info.width;
      if (info.height) meta['height'] = info.height;
      if (info.format) meta['format'] = info.format;
      if (info.channels) meta['channels'] = info.channels;
      if (info.space) meta['colorSpace'] = info.space;
      if (info.density) meta['density'] = info.density;
      if (info.hasAlpha !== undefined) meta['hasAlpha'] = info.hasAlpha;
    } catch {
      meta['dimensionsAvailable'] = false;
      meta['note'] = 'Install sharp for image dimension extraction';
    }

    return meta;
  }

  private async loadSharp(): Promise<SharpFn> {
    const mod = await tryImport<{ default: SharpFn }>('sharp', 'image metadata extraction');
    return mod.default;
  }
}
