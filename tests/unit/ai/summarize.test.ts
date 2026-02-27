import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SummarizeEngine } from '../../../src/ai/summarize.js';
import { createMockLLMAdapter } from '../../helpers/mock-llm-adapter.js';
import { makeEmail, makeThread, makeEmails, SUMMARY_RESPONSE, ALICE, BOB } from '../../helpers/fixtures.js';
import { AiError } from '../../../src/core/errors.js';
import type { LLMAdapter } from '../../../src/core/types.js';

const SUMMARY_JSON_RESPONSE = {
  summary: 'Alice sent Bob important test information.',
  keyPoints: ['Test information shared'],
  participants: [{ address: 'alice@example.com', name: 'Alice Smith' }],
  actionItems: [],
  sentiment: 'neutral' as const,
  topicTags: ['test'],
};

describe('SummarizeEngine', () => {
  let mockAdapter: LLMAdapter & {
    complete: ReturnType<typeof vi.fn>;
    completeJSON: ReturnType<typeof vi.fn>;
  };
  let engine: SummarizeEngine;

  beforeEach(() => {
    mockAdapter = createMockLLMAdapter({
      completeJSONResponse: SUMMARY_JSON_RESPONSE,
      completeResponse: 'Daily digest summary...',
    });
    engine = new SummarizeEngine(mockAdapter);
  });

  describe('summarize', () => {
    it('summarizes a single email', async () => {
      const result = await engine.summarize(makeEmail());
      expect(result.summary).toBe(SUMMARY_JSON_RESPONSE.summary);
      expect(result.keyPoints).toEqual(SUMMARY_JSON_RESPONSE.keyPoints);
      expect(result.topicTags).toEqual(SUMMARY_JSON_RESPONSE.topicTags);
    });

    it('includes email participants in result', async () => {
      const result = await engine.summarize(makeEmail());
      // normalizeSummaryResult merges email from/to/cc with LLM-returned participants
      const addresses = result.participants.map((p) => p.address);
      expect(addresses).toContain('alice@example.com');
      expect(addresses).toContain('bob@example.com');
    });

    it('calls completeJSON with correct options', async () => {
      await engine.summarize(makeEmail());
      expect(mockAdapter.completeJSON).toHaveBeenCalledTimes(1);
      const [prompt, _schema, options] = mockAdapter.completeJSON.mock.calls[0];
      expect(prompt).toContain('Summarize this email');
      expect(options.temperature).toBe(0.2);
    });

    it('wraps adapter errors in AiError', async () => {
      mockAdapter.completeJSON.mockRejectedValue(new Error('API failed'));
      await expect(engine.summarize(makeEmail())).rejects.toThrow(AiError);
      await expect(engine.summarize(makeEmail())).rejects.toThrow('Failed to summarize email');
    });
  });

  describe('summarizeThread', () => {
    it('summarizes a thread', async () => {
      const result = await engine.summarizeThread(makeThread());
      expect(result.summary).toBe(SUMMARY_JSON_RESPONSE.summary);
    });

    it('includes thread subject in prompt', async () => {
      await engine.summarizeThread(makeThread());
      const prompt = mockAdapter.completeJSON.mock.calls[0][0];
      expect(prompt).toContain('Test Email Subject');
    });

    it('includes participant list in prompt', async () => {
      await engine.summarizeThread(makeThread());
      const prompt = mockAdapter.completeJSON.mock.calls[0][0];
      expect(prompt).toContain('Alice Smith');
    });

    it('merges email participants into result', async () => {
      const result = await engine.summarizeThread(makeThread());
      const addresses = result.participants.map((p) => p.address);
      expect(addresses).toContain('alice@example.com');
      expect(addresses).toContain('bob@example.com');
    });

    it('wraps adapter errors in AiError', async () => {
      mockAdapter.completeJSON.mockRejectedValue(new Error('API failed'));
      await expect(engine.summarizeThread(makeThread())).rejects.toThrow(AiError);
    });
  });

  describe('summarizeBatch', () => {
    it('returns empty string for empty array', async () => {
      const result = await engine.summarizeBatch([]);
      expect(result).toBe('');
      expect(mockAdapter.complete).not.toHaveBeenCalled();
    });

    it('creates a digest of multiple emails', async () => {
      const result = await engine.summarizeBatch(makeEmails(3));
      expect(result).toBe('Daily digest summary...');
    });

    it('calls complete (not completeJSON) for batch digest', async () => {
      await engine.summarizeBatch(makeEmails(2));
      expect(mockAdapter.complete).toHaveBeenCalledTimes(1);
      expect(mockAdapter.completeJSON).not.toHaveBeenCalled();
    });

    it('includes email count in prompt', async () => {
      await engine.summarizeBatch(makeEmails(3));
      const prompt = mockAdapter.complete.mock.calls[0][0];
      expect(prompt).toContain('3 emails');
    });

    it('wraps adapter errors in AiError', async () => {
      mockAdapter.complete.mockRejectedValue(new Error('API failed'));
      await expect(engine.summarizeBatch(makeEmails(2))).rejects.toThrow(AiError);
    });
  });
});
