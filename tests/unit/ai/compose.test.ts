import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComposeEngine } from '../../../src/ai/compose.js';
import { createMockLLMAdapter } from '../../helpers/mock-llm-adapter.js';
import { makeEmail, COMPOSE_RESPONSE } from '../../helpers/fixtures.js';
import { AiError } from '../../../src/core/errors.js';
import type { LLMAdapter } from '../../../src/core/types.js';

describe('ComposeEngine', () => {
  let mockAdapter: LLMAdapter & {
    complete: ReturnType<typeof vi.fn>;
    completeJSON: ReturnType<typeof vi.fn>;
  };
  let engine: ComposeEngine;

  beforeEach(() => {
    mockAdapter = createMockLLMAdapter({
      completeJSONResponse: COMPOSE_RESPONSE,
      completeResponse: 'Improved text here.',
    });
    engine = new ComposeEngine(mockAdapter);
  });

  describe('compose', () => {
    it('composes a new email', async () => {
      const result = await engine.compose({ context: 'Meeting follow-up' });
      expect(result).toEqual(COMPOSE_RESPONSE);
    });

    it('calls completeJSON with correct temperature', async () => {
      await engine.compose({ context: 'Test' });
      const options = mockAdapter.completeJSON.mock.calls[0][2];
      expect(options.temperature).toBe(0.7);
    });

    it('includes tone in prompt', async () => {
      await engine.compose({ tone: 'casual', context: 'Test' });
      const prompt = mockAdapter.completeJSON.mock.calls[0][0];
      expect(prompt).toContain('casual');
    });

    it('includes length in prompt', async () => {
      await engine.compose({ length: 'short', context: 'Test' });
      const prompt = mockAdapter.completeJSON.mock.calls[0][0];
      expect(prompt).toContain('short');
    });

    it('includes language in prompt', async () => {
      await engine.compose({ language: 'Spanish', context: 'Test' });
      const prompt = mockAdapter.completeJSON.mock.calls[0][0];
      expect(prompt).toContain('Spanish');
    });

    it('includes context in prompt when provided', async () => {
      await engine.compose({ context: 'Quarterly review meeting' });
      const prompt = mockAdapter.completeJSON.mock.calls[0][0];
      expect(prompt).toContain('Quarterly review meeting');
    });

    it('includes instructions in prompt when provided', async () => {
      await engine.compose({ instructions: 'Keep it brief' });
      const prompt = mockAdapter.completeJSON.mock.calls[0][0];
      expect(prompt).toContain('Keep it brief');
    });

    it('defaults to professional tone and medium length', async () => {
      await engine.compose({});
      const prompt = mockAdapter.completeJSON.mock.calls[0][0];
      expect(prompt).toContain('professional');
      expect(prompt).toContain('medium');
      expect(prompt).toContain('English');
    });

    it('wraps adapter errors in AiError', async () => {
      mockAdapter.completeJSON.mockRejectedValue(new Error('API failed'));
      await expect(engine.compose({})).rejects.toThrow(AiError);
      await expect(engine.compose({})).rejects.toThrow('Failed to compose email');
    });
  });

  describe('reply', () => {
    it('composes a reply to an email', async () => {
      const result = await engine.reply(makeEmail(), { context: 'Accepting offer' });
      expect(result).toEqual(COMPOSE_RESPONSE);
    });

    it('includes original email in prompt', async () => {
      await engine.reply(makeEmail(), {});
      const prompt = mockAdapter.completeJSON.mock.calls[0][0];
      expect(prompt).toContain('Original Email');
      expect(prompt).toContain('Hello Bob');
    });

    it('wraps adapter errors in AiError', async () => {
      mockAdapter.completeJSON.mockRejectedValue(new Error('API failed'));
      await expect(engine.reply(makeEmail(), {})).rejects.toThrow(AiError);
      await expect(engine.reply(makeEmail(), {})).rejects.toThrow('Failed to compose reply');
    });
  });

  describe('rewriteInTone', () => {
    it('rewrites text in specified tone', async () => {
      mockAdapter.complete.mockResolvedValue('Hey there! This sounds awesome!');
      const result = await engine.rewriteInTone('This is acceptable.', 'casual');
      expect(result).toBe('Hey there! This sounds awesome!');
    });

    it('includes tone in prompt', async () => {
      await engine.rewriteInTone('Some text', 'formal');
      const prompt = mockAdapter.complete.mock.calls[0][0];
      expect(prompt).toContain('formal');
    });

    it('includes original text in prompt', async () => {
      await engine.rewriteInTone('Important meeting tomorrow', 'casual');
      const prompt = mockAdapter.complete.mock.calls[0][0];
      expect(prompt).toContain('Important meeting tomorrow');
    });

    it('wraps adapter errors in AiError', async () => {
      mockAdapter.complete.mockRejectedValue(new Error('API failed'));
      await expect(engine.rewriteInTone('text', 'casual')).rejects.toThrow(AiError);
    });
  });

  describe('improveWriting', () => {
    it('improves text writing', async () => {
      mockAdapter.complete.mockResolvedValue('Improved version of text.');
      const result = await engine.improveWriting('Bad text version.');
      expect(result).toBe('Improved version of text.');
    });

    it('includes original text in prompt', async () => {
      await engine.improveWriting('Text to fix');
      const prompt = mockAdapter.complete.mock.calls[0][0];
      expect(prompt).toContain('Text to fix');
    });

    it('uses low temperature for improvement', async () => {
      await engine.improveWriting('text');
      const options = mockAdapter.complete.mock.calls[0][1];
      expect(options.temperature).toBe(0.3);
    });

    it('wraps adapter errors in AiError', async () => {
      mockAdapter.complete.mockRejectedValue(new Error('API failed'));
      await expect(engine.improveWriting('text')).rejects.toThrow(AiError);
    });
  });
});
