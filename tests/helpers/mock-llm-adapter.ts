import { vi } from 'vitest';
import type { LLMAdapter, CompletionOptions } from '../../src/core/types.js';
import type { z } from 'zod';

export interface MockLLMOptions {
  completeResponse?: string | (() => string);
  completeJSONResponse?: unknown | (() => unknown);
  embedResponse?: number[][] | ((texts: string[]) => number[][]);
  visionResponse?: string;
}

export function createMockLLMAdapter(options: MockLLMOptions = {}): LLMAdapter & {
  complete: ReturnType<typeof vi.fn>;
  completeJSON: ReturnType<typeof vi.fn>;
  embed: ReturnType<typeof vi.fn>;
  vision: ReturnType<typeof vi.fn>;
} {
  const defaultEmbedding = (texts: string[]) =>
    texts.map(() => Array.from({ length: 1536 }, () => Math.random()));

  return {
    name: 'mock',
    complete: vi.fn(async (_prompt: string, _options?: CompletionOptions): Promise<string> => {
      const resp = options.completeResponse;
      return typeof resp === 'function' ? resp() : (resp ?? 'Mock response');
    }),
    completeJSON: vi.fn(
      async <T>(_prompt: string, schema: z.ZodType<T>, _opts?: CompletionOptions): Promise<T> => {
        const resp = options.completeJSONResponse;
        const value = typeof resp === 'function' ? (resp as () => unknown)() : resp;
        return schema.parse(value) as T;
      },
    ),
    embed: vi.fn(async (texts: string[]): Promise<number[][]> => {
      const resp = options.embedResponse;
      return typeof resp === 'function' ? resp(texts) : (resp ?? defaultEmbedding(texts));
    }),
    vision: vi.fn(
      async (
        _images: Array<{ data: Buffer | Uint8Array; mimeType: string }>,
        _prompt: string,
        _options?: CompletionOptions,
      ): Promise<string> => {
        return options.visionResponse ?? 'Mock vision description';
      },
    ),
  };
}
