import { z } from 'zod';
import type { AiConfig, CompletionOptions } from '../../core/types.js';
import { AiError } from '../../core/errors.js';
import { tryImport } from '../../core/utils.js';
import { BaseLLMAdapter } from '../adapter.js';

interface GenerativeModel {
  generateContent(
    request: Record<string, unknown> | Array<unknown>,
  ): Promise<{ response: { text(): string } }>;
  embedContent(request: {
    content: { parts: Array<{ text: string }> };
  }): Promise<{ embedding: { values: number[] } }>;
}

interface GoogleGenAIModule {
  GoogleGenerativeAI: new (apiKey: string) => {
    getGenerativeModel(config: Record<string, unknown>): GenerativeModel;
  };
}

export class GoogleAdapter extends BaseLLMAdapter {
  readonly name = 'google';
  private genAI: { getGenerativeModel(c: Record<string, unknown>): GenerativeModel } | null = null;

  constructor(config: AiConfig) {
    super(config);
  }

  protected getDefaultModel(): string {
    return 'gemini-2.0-flash';
  }

  protected getDefaultEmbeddingModel(): string {
    return 'text-embedding-004';
  }

  private async getGenAI() {
    if (this.genAI) return this.genAI;
    const mod = await tryImport<GoogleGenAIModule>(
      '@google/generative-ai',
      'Google AI adapter',
    );
    if (!this.apiKey) throw new AiError('Google AI adapter requires an API key');
    this.genAI = new mod.GoogleGenerativeAI(this.apiKey);
    return this.genAI;
  }

  async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    return this.withRetry(async () => {
      const genAI = await this.getGenAI();

      const generationConfig: Record<string, unknown> = {
        temperature: this.getTemperature(options),
        maxOutputTokens: this.getMaxTokens(options),
      };

      if (options?.responseFormat === 'json') {
        generationConfig.responseMimeType = 'application/json';
      }

      const modelConfig: Record<string, unknown> = {
        model: this.model,
        generationConfig,
      };

      if (options?.systemPrompt) {
        modelConfig.systemInstruction = options.systemPrompt;
      }

      const model = genAI.getGenerativeModel(modelConfig);
      const result = await model.generateContent([prompt]);
      const text = result.response.text();
      if (!text) throw new AiError('Google AI returned empty response');
      return text;
    });
  }

  async completeJSON<T>(
    prompt: string,
    schema: z.ZodType<T>,
    options?: CompletionOptions,
  ): Promise<T> {
    const jsonPrompt = `${prompt}\n\nRespond ONLY with valid JSON matching the required schema. No markdown fences, no extra text.`;
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
      const genAI = await this.getGenAI();
      const model = genAI.getGenerativeModel({ model: this.embeddingModel });
      const embeddings: number[][] = [];

      for (const text of texts) {
        const result = await model.embedContent({
          content: { parts: [{ text }] },
        });
        embeddings.push(result.embedding.values);
      }

      return embeddings;
    });
  }

  async vision(
    images: Array<{ data: Buffer | Uint8Array; mimeType: string }>,
    prompt: string,
    options?: CompletionOptions,
  ): Promise<string> {
    return this.withRetry(async () => {
      const genAI = await this.getGenAI();

      const generationConfig: Record<string, unknown> = {
        temperature: this.getTemperature(options),
        maxOutputTokens: this.getMaxTokens(options),
      };

      const modelConfig: Record<string, unknown> = {
        model: this.model,
        generationConfig,
      };

      if (options?.systemPrompt) {
        modelConfig.systemInstruction = options.systemPrompt;
      }

      const model = genAI.getGenerativeModel(modelConfig);

      const parts: Array<Record<string, unknown>> = [{ text: prompt }];
      for (const img of images) {
        parts.push({
          inlineData: {
            mimeType: img.mimeType,
            data: Buffer.from(img.data).toString('base64'),
          },
        });
      }

      const result = await model.generateContent(parts);
      const text = result.response.text();
      if (!text) throw new AiError('Google AI vision returned empty response');
      return text;
    });
  }
}
