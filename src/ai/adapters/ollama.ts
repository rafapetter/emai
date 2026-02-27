import { z } from 'zod';
import type { AiConfig, CompletionOptions } from '../../core/types.js';
import { AiError } from '../../core/errors.js';
import { tryImport } from '../../core/utils.js';
import { BaseLLMAdapter } from '../adapter.js';

interface OllamaChatResponse {
  message: { content: string };
}

interface OllamaEmbedResponse {
  embeddings: number[][];
}

interface OllamaClient {
  chat(params: Record<string, unknown>): Promise<OllamaChatResponse>;
  embed(params: Record<string, unknown>): Promise<OllamaEmbedResponse>;
}

interface OllamaModule {
  Ollama: new (opts: Record<string, unknown>) => OllamaClient;
}

export class OllamaAdapter extends BaseLLMAdapter {
  readonly name = 'ollama';
  private client: OllamaClient | null = null;
  private visionModel: string;

  constructor(config: AiConfig) {
    super(config);
    this.baseUrl = config.baseUrl ?? 'http://localhost:11434';
    this.visionModel = 'llava';
  }

  protected getDefaultModel(): string {
    return 'llama3.1';
  }

  protected getDefaultEmbeddingModel(): string {
    return 'nomic-embed-text';
  }

  private async getClient(): Promise<OllamaClient> {
    if (this.client) return this.client;
    const mod = await tryImport<OllamaModule>('ollama', 'Ollama adapter');
    this.client = new mod.Ollama({ host: this.baseUrl });
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
        stream: false,
        options: {
          temperature: this.getTemperature(options),
          num_predict: this.getMaxTokens(options),
        },
      };

      if (options?.responseFormat === 'json') {
        params.format = 'json';
      }

      const response = await client.chat(params);
      const content = response.message?.content;
      if (!content) throw new AiError('Ollama returned empty response');
      return content;
    });
  }

  async completeJSON<T>(
    prompt: string,
    schema: z.ZodType<T>,
    options?: CompletionOptions,
  ): Promise<T> {
    const jsonPrompt = `${prompt}\n\nRespond ONLY with valid JSON. No explanation, no markdown fences.`;
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
      const response = await client.embed({
        model: this.embeddingModel,
        input: texts,
      });
      return response.embeddings;
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

      const imagesBase64 = images.map((img) =>
        Buffer.from(img.data).toString('base64'),
      );

      messages.push({
        role: 'user',
        content: prompt,
        images: imagesBase64,
      });

      const response = await client.chat({
        model: this.visionModel,
        messages,
        stream: false,
        options: {
          temperature: this.getTemperature(options),
          num_predict: this.getMaxTokens(options),
        },
      });

      const content = response.message?.content;
      if (!content) throw new AiError('Ollama vision returned empty response');
      return content;
    });
  }
}
