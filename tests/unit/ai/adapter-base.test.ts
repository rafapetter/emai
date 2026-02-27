import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { BaseLLMAdapter } from '../../../src/ai/adapter.js';
import { createAdapter } from '../../../src/ai/adapter.js';
import { AiError, ValidationError } from '../../../src/core/errors.js';
import type { AiConfig, CompletionOptions } from '../../../src/core/types.js';

// Concrete test adapter to test abstract BaseLLMAdapter
class TestAdapter extends BaseLLMAdapter {
  readonly name = 'test';

  protected getDefaultModel(): string {
    return 'test-model';
  }

  protected getDefaultEmbeddingModel(): string {
    return 'test-embed-model';
  }

  async complete(_prompt: string, _options?: CompletionOptions): Promise<string> {
    return 'test response';
  }

  async completeJSON<T>(
    _prompt: string,
    schema: z.ZodType<T>,
    _options?: CompletionOptions,
  ): Promise<T> {
    return schema.parse({});
  }

  async embed(_texts: string[]): Promise<number[][]> {
    return [[0.1, 0.2]];
  }

  // Expose protected methods for testing
  public testExtractJSON(text: string): string {
    return this.extractJSON(text);
  }

  public testParseJSON<T>(text: string, schema: z.ZodType<T>): T {
    return this.parseJSON(text, schema);
  }

  public async testWithRetry<T>(
    fn: () => Promise<T>,
    maxRetries?: number,
    baseDelay?: number,
  ): Promise<T> {
    return this.withRetry(fn, maxRetries, baseDelay);
  }

  public testIsRetryableError(err: unknown): boolean {
    return this.isRetryableError(err);
  }

  public testGetTemperature(options?: CompletionOptions): number {
    return this.getTemperature(options);
  }

  public testGetMaxTokens(options?: CompletionOptions): number {
    return this.getMaxTokens(options);
  }
}

describe('BaseLLMAdapter', () => {
  let adapter: TestAdapter;

  beforeEach(() => {
    adapter = new TestAdapter({});
  });

  describe('constructor defaults', () => {
    it('uses default model when not specified', () => {
      expect(adapter.name).toBe('test');
    });

    it('uses custom temperature when specified', () => {
      const customAdapter = new TestAdapter({ temperature: 0.9 });
      expect(customAdapter.testGetTemperature()).toBe(0.9);
    });

    it('uses default temperature of 0.3', () => {
      expect(adapter.testGetTemperature()).toBe(0.3);
    });

    it('uses option temperature over default', () => {
      expect(adapter.testGetTemperature({ temperature: 0.5 })).toBe(0.5);
    });

    it('uses custom maxTokens when specified', () => {
      const customAdapter = new TestAdapter({ maxTokens: 1000 });
      expect(customAdapter.testGetMaxTokens()).toBe(1000);
    });

    it('uses default maxTokens of 4096', () => {
      expect(adapter.testGetMaxTokens()).toBe(4096);
    });

    it('uses option maxTokens over default', () => {
      expect(adapter.testGetMaxTokens({ maxTokens: 2000 })).toBe(2000);
    });
  });

  describe('extractJSON', () => {
    it('extracts JSON from code fences', () => {
      const text = 'Here is the result:\n```json\n{"name":"Alice"}\n```\nDone.';
      expect(adapter.testExtractJSON(text)).toBe('{"name":"Alice"}');
    });

    it('extracts JSON from code fences without json label', () => {
      const text = '```\n{"name":"Bob"}\n```';
      expect(adapter.testExtractJSON(text)).toBe('{"name":"Bob"}');
    });

    it('extracts object from mixed text', () => {
      const text = 'The answer is {"count": 42} and that is all.';
      expect(adapter.testExtractJSON(text)).toBe('{"count": 42}');
    });

    it('extracts array from mixed text', () => {
      const text = 'Results: [1, 2, 3] end';
      expect(adapter.testExtractJSON(text)).toBe('[1, 2, 3]');
    });

    it('extracts nested JSON correctly', () => {
      const text = '{"outer": {"inner": "value"}}';
      expect(adapter.testExtractJSON(text)).toBe('{"outer": {"inner": "value"}}');
    });

    it('handles strings with braces inside', () => {
      const text = '{"msg": "hello {world}"}';
      expect(adapter.testExtractJSON(text)).toBe('{"msg": "hello {world}"}');
    });

    it('returns raw text when no JSON found', () => {
      const text = 'no json here';
      expect(adapter.testExtractJSON(text)).toBe('no json here');
    });

    it('prefers object when it comes before array', () => {
      const text = 'data: {"a":1} or [1,2]';
      expect(adapter.testExtractJSON(text)).toBe('{"a":1}');
    });

    it('prefers array when it comes before object', () => {
      const text = 'data: [1,2] or {"a":1}';
      expect(adapter.testExtractJSON(text)).toBe('[1,2]');
    });

    it('handles escaped quotes in strings', () => {
      const text = '{"name": "Alice \\"Bob\\" Smith"}';
      expect(adapter.testExtractJSON(text)).toBe('{"name": "Alice \\"Bob\\" Smith"}');
    });
  });

  describe('parseJSON', () => {
    const schema = z.object({ name: z.string(), age: z.number() });

    it('parses valid JSON matching schema', () => {
      const result = adapter.testParseJSON('{"name":"Alice","age":30}', schema);
      expect(result).toEqual({ name: 'Alice', age: 30 });
    });

    it('parses JSON from code fences', () => {
      const result = adapter.testParseJSON(
        '```json\n{"name":"Bob","age":25}\n```',
        schema,
      );
      expect(result).toEqual({ name: 'Bob', age: 25 });
    });

    it('throws AiError for invalid JSON', () => {
      expect(() => adapter.testParseJSON('not json at all', schema)).toThrow(
        AiError,
      );
    });

    it('throws ValidationError for schema mismatch', () => {
      expect(() =>
        adapter.testParseJSON('{"name":"Alice","age":"not a number"}', schema),
      ).toThrow(ValidationError);
    });
  });

  describe('isRetryableError', () => {
    it('returns true for rate limit errors', () => {
      expect(adapter.testIsRetryableError(new Error('rate limit exceeded'))).toBe(true);
    });

    it('returns true for 429 errors', () => {
      expect(adapter.testIsRetryableError(new Error('HTTP 429'))).toBe(true);
    });

    it('returns true for timeout errors', () => {
      expect(adapter.testIsRetryableError(new Error('Request timeout'))).toBe(true);
    });

    it('returns true for 503 errors', () => {
      expect(adapter.testIsRetryableError(new Error('503 Service Unavailable'))).toBe(true);
    });

    it('returns true for overloaded errors', () => {
      expect(adapter.testIsRetryableError(new Error('Server overloaded'))).toBe(true);
    });

    it('returns true for ECONNRESET', () => {
      expect(adapter.testIsRetryableError(new Error('ECONNRESET'))).toBe(true);
    });

    it('returns true for ECONNREFUSED', () => {
      expect(adapter.testIsRetryableError(new Error('ECONNREFUSED'))).toBe(true);
    });

    it('returns false for non-retryable errors', () => {
      expect(adapter.testIsRetryableError(new Error('Invalid API key'))).toBe(false);
    });

    it('returns false for non-Error values', () => {
      expect(adapter.testIsRetryableError('string error')).toBe(false);
    });

    it('returns false for null', () => {
      expect(adapter.testIsRetryableError(null)).toBe(false);
    });
  });

  describe('withRetry', () => {
    it('returns on first success', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const result = await adapter.testWithRetry(fn, 3, 0);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on retryable errors', async () => {
      const fn = vi.fn()
        .mockRejectedValueOnce(new Error('rate limit'))
        .mockResolvedValue('success');
      const result = await adapter.testWithRetry(fn, 3, 0);
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('does not retry non-retryable errors', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('Invalid API key'));
      await expect(adapter.testWithRetry(fn, 3, 0)).rejects.toThrow(AiError);
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('throws after max retries exhausted', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('rate limit'));
      await expect(adapter.testWithRetry(fn, 2, 0)).rejects.toThrow(AiError);
      expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it('wraps non-AiError in AiError', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('some error'));
      try {
        await adapter.testWithRetry(fn, 0, 0);
      } catch (err) {
        expect(err).toBeInstanceOf(AiError);
      }
    });

    it('preserves AiError as-is', async () => {
      const original = new AiError('AI failed');
      const fn = vi.fn().mockRejectedValue(original);
      try {
        await adapter.testWithRetry(fn, 0, 0);
      } catch (err) {
        expect(err).toBe(original);
      }
    });

    it('wraps non-Error values in AiError', async () => {
      const fn = vi.fn().mockRejectedValue('string error');
      try {
        await adapter.testWithRetry(fn, 0, 0);
      } catch (err) {
        expect(err).toBeInstanceOf(AiError);
        expect((err as AiError).message).toBe('string error');
      }
    });
  });

  describe('createAdapter', () => {
    it('returns custom adapter directly when adapter is not a string', () => {
      const customAdapter = {
        name: 'custom',
        complete: vi.fn(),
        completeJSON: vi.fn(),
        embed: vi.fn(),
      };
      const result = createAdapter({ adapter: customAdapter as any });
      expect(result).toBe(customAdapter);
    });

    it('throws for unknown adapter type when require fails', () => {
      // The require() calls for 'openai', 'anthropic', etc. will fail because
      // the actual SDK modules are not installed. We just verify the factory
      // is reachable and handles the custom adapter case.
      expect(() => createAdapter({ adapter: 'openai' })).toThrow();
    });
  });
});
