import type {
  ParsedAttachment,
  AttachmentParseOptions,
  LLMAdapter,
} from '../core/types.js';
import { AdapterNotConfiguredError } from '../core/errors.js';

export class VideoParser {
  async parse(
    content: Buffer,
    mimeType: string,
    options: AttachmentParseOptions = {},
  ): Promise<ParsedAttachment> {
    const depth = options.depth ?? 'basic';

    const metadata: Record<string, unknown> = {
      mimeType,
      sizeBytes: content.length,
      format: this.extractFormat(mimeType),
    };

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
      const probeResult = await this.probeMetadata(content);
      parsed.metadata = { ...parsed.metadata, ...probeResult };
    }

    return parsed;
  }

  async parseDeep(
    content: Buffer,
    mimeType: string,
    adapter: LLMAdapter,
    options: AttachmentParseOptions = {},
  ): Promise<ParsedAttachment> {
    if (!adapter.vision) {
      throw new AdapterNotConfiguredError('video description (vision)');
    }

    const parsed = await this.parse(content, mimeType, { ...options, depth: 'medium' });

    const frames = await this.extractFrames(content, 3);
    if (frames.length === 0) {
      parsed.text = '[Video frame extraction requires ffmpeg or similar tools]';
      return parsed;
    }

    try {
      const images = frames.map((frame) => ({
        data: frame,
        mimeType: 'image/jpeg',
      }));

      const description = await adapter.vision(
        images,
        'These are key frames from a video. Describe the video content, what is happening, and any text visible.',
      );

      parsed.text = description;
      parsed.metadata = { ...parsed.metadata, framesExtracted: frames.length };
    } catch {
      parsed.text = '[Video description failed — vision model error]';
    }

    return parsed;
  }

  async extractFrames(_content: Buffer, _count: number): Promise<Buffer[]> {
    // Frame extraction requires ffmpeg or a native video processing library.
    // This is a placeholder that returns empty — callers handle the empty case.
    return [];
  }

  private extractFormat(mimeType: string): string {
    const sub = mimeType.split('/')[1];
    if (!sub) return 'unknown';
    return sub.replace('x-', '');
  }

  private async probeMetadata(
    _content: Buffer,
  ): Promise<Record<string, unknown>> {
    // Full metadata extraction requires ffprobe or similar.
    // Return what we can determine without external tools.
    return {
      probeAvailable: false,
      note: 'Install ffmpeg/ffprobe for full video metadata extraction',
    };
  }
}
