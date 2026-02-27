import { z } from 'zod';
import type { AiConfig, CompletionOptions } from '../../core/types.js';
import { AiError } from '../../core/errors.js';
import { tryImport } from '../../core/utils.js';
import { BaseLLMAdapter } from '../adapter.js';

interface OpenAIClient {
  chat: {
    completions: {
      create(params: Record<string, unknown>): Promise<{
        choices: Array<{ message: { content: string | null } }>;
      }>;
    };
  };
  embeddings: {
    create(params: Record<string, unknown>): Promise<{
      data: Array<{ embedding: number[] }>;
    }>;
  };
}

interface OpenAIModule {
  default: new (opts: Record<string, unknown>) => OpenAIClient;
}

export class OpenAIAdapter extends BaseLLMAdapter {
  readonly name = 'openai';
  private client: OpenAIClient | null = null;

  constructor(config: AiConfig) {
    super(config);
  }

  protected getDefaultModel(): string {
    return 'gpt-4o';
  }

  protected getDefaultEmbeddingModel(): string {
    return 'text-embedding-3-small';
  }

  private async getClient(): Promise<OpenAIClient> {
    if (this.client) return this.client;
    const mod = await tryImport<OpenAIModule>('openai', 'OpenAI adapter');
    const OpenAI = mod.default;
    this.client = new OpenAI({
      apiKey: this.apiKey,
      ...(this.baseUrl ? { baseURL: this.baseUrl } : {}),
    });
    return this.client;
  }

  async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    return this.withRetry(async () => {
      const client = await this.getClient();
      const messages: Array<Record<string, unknown>> = [];

      if (options?.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
      }
      messages.push({ role: 'user', content: prompt });

      const params: Record<string, unknown> = {
        model: this.model,
        messages,
        temperature: this.getTemperature(options),
        max_tokens: this.getMaxTokens(options),
      };

      if (options?.responseFormat === 'json') {
        params.response_format = { type: 'json_object' };
      }

      const response = await client.chat.completions.create(params);
      const content = response.choices[0]?.message?.content;
      if (!content) throw new AiError('OpenAI returned empty response');
      return content;
    });
  }

  async completeJSON<T>(
    prompt: string,
    schema: z.ZodType<T>,
    options?: CompletionOptions,
  ): Promise<T> {
    const jsonPrompt = `${prompt}\n\nRespond ONLY with valid JSON matching the required schema. No additional text.`;
    const result = await this.complete(jsonPrompt, {
      ...options,
      responseFormat: 'json',
      systemPrompt: options?.systemPrompt
        ? `${options.systemPrompt}\n\nYou must respond with valid JSON only.`
        : 'You must respond with valid JSON only.',
    });
    return this.parseJSON(result, schema);
  }

  async embed(texts: string[]): Promise<number[][]> {
    return this.withRetry(async () => {
      const client = await this.getClient();
      const response = await client.embeddings.create({
        model: this.embeddingModel,
        input: texts,
      });
      return response.data.map((d) => d.embedding);
    });
  }

  async vision(
    images: Array<{ data: Buffer | Uint8Array; mimeType: string }>,
    prompt: string,
    options?: CompletionOptions,
  ): Promise<string> {
    return this.withRetry(async () => {
      const client = await this.getClient();
      const messages: Array<Record<string, unknown>> = [];

      if (options?.systemPrompt) {
        messages.push({ role: 'system', content: options.systemPrompt });
      }

      const content: Array<Record<string, unknown>> = [
        { type: 'text', text: prompt },
      ];

      for (const img of images) {
        const base64 = Buffer.from(img.data).toString('base64');
        content.push({
          type: 'image_url',
          image_url: {
            url: `data:${img.mimeType};base64,${base64}`,
          },
        });
      }

      messages.push({ role: 'user', content });

      const response = await client.chat.completions.create({
        model: this.model,
        messages,
        temperature: this.getTemperature(options),
        max_tokens: this.getMaxTokens(options),
      });

      const result = response.choices[0]?.message?.content;
      if (!result) throw new AiError('OpenAI vision returned empty response');
      return result;
    });
  }
}
