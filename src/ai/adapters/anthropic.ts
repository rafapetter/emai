import { z } from 'zod';
import type { AiConfig, CompletionOptions } from '../../core/types.js';
import { AiError } from '../../core/errors.js';
import { tryImport } from '../../core/utils.js';
import { BaseLLMAdapter } from '../adapter.js';

interface AnthropicMessage {
  content: Array<
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: unknown }
  >;
  stop_reason: string | null;
}

interface AnthropicClient {
  messages: {
    create(params: Record<string, unknown>): Promise<AnthropicMessage>;
  };
}

interface AnthropicModule {
  default: new (opts: Record<string, unknown>) => AnthropicClient;
}

export class AnthropicAdapter extends BaseLLMAdapter {
  readonly name = 'anthropic';
  private client: AnthropicClient | null = null;

  constructor(config: AiConfig) {
    super(config);
  }

  protected getDefaultModel(): string {
    return 'claude-sonnet-4-20250514';
  }

  protected getDefaultEmbeddingModel(): string {
    return '';
  }

  private async getClient(): Promise<AnthropicClient> {
    if (this.client) return this.client;
    const mod = await tryImport<AnthropicModule>(
      '@anthropic-ai/sdk',
      'Anthropic adapter',
    );
    const Anthropic = mod.default;
    this.client = new Anthropic({
      apiKey: this.apiKey,
      ...(this.baseUrl ? { baseURL: this.baseUrl } : {}),
    });
    return this.client;
  }

  async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    return this.withRetry(async () => {
      const client = await this.getClient();

      const params: Record<string, unknown> = {
        model: this.model,
        max_tokens: this.getMaxTokens(options),
        temperature: this.getTemperature(options),
        messages: [{ role: 'user', content: prompt }],
      };

      if (options?.systemPrompt) {
        params.system = options.systemPrompt;
      }

      const response = await client.messages.create(params);
      const textBlock = response.content.find((b) => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new AiError('Anthropic returned no text content');
      }
      return textBlock.text;
    });
  }

  async completeJSON<T>(
    prompt: string,
    schema: z.ZodType<T>,
    options?: CompletionOptions,
  ): Promise<T> {
    return this.withRetry(async () => {
      const client = await this.getClient();

      const jsonSchema = zodToJsonSchema(schema);

      const params: Record<string, unknown> = {
        model: this.model,
        max_tokens: this.getMaxTokens(options),
        temperature: this.getTemperature(options),
        messages: [{ role: 'user', content: prompt }],
        tools: [
          {
            name: 'structured_output',
            description:
              'Return the structured data extracted from the input.',
            input_schema: jsonSchema,
          },
        ],
        tool_choice: { type: 'tool', name: 'structured_output' },
      };

      if (options?.systemPrompt) {
        params.system = options.systemPrompt;
      }

      const response = await client.messages.create(params);
      const toolBlock = response.content.find((b) => b.type === 'tool_use');
      if (!toolBlock || toolBlock.type !== 'tool_use') {
        const textBlock = response.content.find((b) => b.type === 'text');
        if (textBlock && textBlock.type === 'text') {
          return this.parseJSON(textBlock.text, schema);
        }
        throw new AiError('Anthropic returned no tool_use or text content');
      }

      const result = schema.safeParse(toolBlock.input);
      if (!result.success) {
        throw new AiError(
          `Anthropic tool_use output failed validation: ${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
        );
      }
      return result.data;
    });
  }

  async embed(_texts: string[]): Promise<number[][]> {
    throw new AiError(
      'Anthropic does not provide a native embeddings API. ' +
        'Use the OpenAI or Google adapter for embeddings, or configure a separate embedding adapter.',
    );
  }

  async vision(
    images: Array<{ data: Buffer | Uint8Array; mimeType: string }>,
    prompt: string,
    options?: CompletionOptions,
  ): Promise<string> {
    return this.withRetry(async () => {
      const client = await this.getClient();

      const content: Array<Record<string, unknown>> = [];

      for (const img of images) {
        const base64 = Buffer.from(img.data).toString('base64');
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: img.mimeType,
            data: base64,
          },
        });
      }

      content.push({ type: 'text', text: prompt });

      const params: Record<string, unknown> = {
        model: this.model,
        max_tokens: this.getMaxTokens(options),
        temperature: this.getTemperature(options),
        messages: [{ role: 'user', content }],
      };

      if (options?.systemPrompt) {
        params.system = options.systemPrompt;
      }

      const response = await client.messages.create(params);
      const textBlock = response.content.find((b) => b.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new AiError('Anthropic vision returned no text content');
      }
      return textBlock.text;
    });
  }
}

function zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodType>;
    const properties: Record<string, Record<string, unknown>> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value);
      if (!(value instanceof z.ZodOptional)) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      ...(required.length > 0 ? { required } : {}),
    };
  }

  if (schema instanceof z.ZodArray) {
    return {
      type: 'array',
      items: zodToJsonSchema(schema.element),
    };
  }

  if (schema instanceof z.ZodString) return { type: 'string' };
  if (schema instanceof z.ZodNumber) return { type: 'number' };
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' };

  if (schema instanceof z.ZodEnum) {
    return { type: 'string', enum: schema.options as string[] };
  }

  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema.unwrap());
  }

  if (schema instanceof z.ZodNullable) {
    const inner = zodToJsonSchema(schema.unwrap());
    return { ...inner, nullable: true };
  }

  if (schema instanceof z.ZodDefault) {
    return zodToJsonSchema(schema.removeDefault());
  }

  if (schema instanceof z.ZodUnion) {
    const options = (schema as z.ZodUnion<z.ZodUnionOptions>).options as unknown as z.ZodType[];
    return { anyOf: options.map(zodToJsonSchema) };
  }

  if (schema instanceof z.ZodLiteral) {
    const val = schema.value;
    return { type: typeof val, enum: [val] };
  }

  if (schema instanceof z.ZodRecord) {
    return {
      type: 'object',
      additionalProperties: zodToJsonSchema(schema.valueSchema),
    };
  }

  return { type: 'object' };
}
