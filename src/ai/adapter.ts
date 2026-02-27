import { z, type ZodError } from 'zod';
import type { AiConfig, CompletionOptions, LLMAdapter, LLMAdapterType } from '../core/types.js';
import { AiError, ValidationError } from '../core/errors.js';
import { sleep } from '../core/utils.js';

export abstract class BaseLLMAdapter implements LLMAdapter {
  abstract readonly name: string;

  protected apiKey: string | undefined;
  protected model: string;
  protected embeddingModel: string;
  protected baseUrl: string | undefined;
  protected defaultTemperature: number;
  protected defaultMaxTokens: number;

  constructor(config: AiConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? this.getDefaultModel();
    this.embeddingModel = config.embeddingModel ?? this.getDefaultEmbeddingModel();
    this.baseUrl = config.baseUrl;
    this.defaultTemperature = config.temperature ?? 0.3;
    this.defaultMaxTokens = config.maxTokens ?? 4096;
  }

  protected abstract getDefaultModel(): string;
  protected abstract getDefaultEmbeddingModel(): string;

  abstract complete(prompt: string, options?: CompletionOptions): Promise<string>;
  abstract completeJSON<T>(prompt: string, schema: z.ZodType<T>, options?: CompletionOptions): Promise<T>;
  abstract embed(texts: string[]): Promise<number[][]>;

  protected async withRetry<T>(
    fn: () => Promise<T>,
    maxRetries = 3,
    baseDelay = 1000,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err: unknown) {
        lastError = err;
        if (attempt === maxRetries) break;

        const isRetryable = this.isRetryableError(err);
        if (!isRetryable) break;

        const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 500;
        await sleep(delay);
      }
    }
    throw lastError instanceof AiError
      ? lastError
      : new AiError(
          lastError instanceof Error ? lastError.message : String(lastError),
          lastError,
        );
  }

  protected isRetryableError(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    const msg = err.message.toLowerCase();
    return (
      msg.includes('rate limit') ||
      msg.includes('429') ||
      msg.includes('timeout') ||
      msg.includes('503') ||
      msg.includes('overloaded') ||
      msg.includes('econnreset') ||
      msg.includes('econnrefused')
    );
  }

  protected parseJSON<T>(text: string, schema: z.ZodType<T>): T {
    const cleaned = this.extractJSON(text);
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      throw new AiError(`LLM returned invalid JSON: ${text.slice(0, 200)}`);
    }
    const result = schema.safeParse(parsed);
    if (!result.success) {
      throw new ValidationError(
        `LLM output failed schema validation: ${formatZodErrors(result.error)}`,
      );
    }
    return result.data;
  }

  protected extractJSON(text: string): string {
    const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (fenceMatch) return fenceMatch[1].trim();

    const braceStart = text.indexOf('{');
    const bracketStart = text.indexOf('[');

    if (braceStart === -1 && bracketStart === -1) return text.trim();

    const start =
      braceStart === -1 ? bracketStart
      : bracketStart === -1 ? braceStart
      : Math.min(braceStart, bracketStart);

    const isArray = text[start] === '[';
    const closeChar = isArray ? ']' : '}';
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\' && inString) {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === text[start]) depth++;
      if (ch === closeChar) {
        depth--;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }

    return text.slice(start);
  }

  protected getTemperature(options?: CompletionOptions): number {
    return options?.temperature ?? this.defaultTemperature;
  }

  protected getMaxTokens(options?: CompletionOptions): number {
    return options?.maxTokens ?? this.defaultMaxTokens;
  }
}

function formatZodErrors(error: ZodError): string {
  return error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
}

export function createAdapter(config: AiConfig): LLMAdapter {
  if (typeof config.adapter !== 'string') {
    return config.adapter;
  }

  const adapterType: LLMAdapterType = config.adapter;

  switch (adapterType) {
    case 'openai': {
      const { OpenAIAdapter } = require('./adapters/openai.js') as typeof import('./adapters/openai.js');
      return new OpenAIAdapter(config);
    }
    case 'anthropic': {
      const { AnthropicAdapter } = require('./adapters/anthropic.js') as typeof import('./adapters/anthropic.js');
      return new AnthropicAdapter(config);
    }
    case 'google': {
      const { GoogleAdapter } = require('./adapters/google.js') as typeof import('./adapters/google.js');
      return new GoogleAdapter(config);
    }
    case 'ollama': {
      const { OllamaAdapter } = require('./adapters/ollama.js') as typeof import('./adapters/ollama.js');
      return new OllamaAdapter(config);
    }
    default: {
      const _exhaustive: never = adapterType;
      throw new AiError(`Unknown adapter type: ${String(_exhaustive)}`);
    }
  }
}
