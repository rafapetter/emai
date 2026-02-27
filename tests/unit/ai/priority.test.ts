import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PriorityEngine } from '../../../src/ai/priority.js';
import { createMockLLMAdapter } from '../../helpers/mock-llm-adapter.js';
import { makeEmail, makeEmails, PRIORITY_RESPONSE } from '../../helpers/fixtures.js';
import { AiError } from '../../../src/core/errors.js';
import type { LLMAdapter } from '../../../src/core/types.js';

describe('PriorityEngine', () => {
  let mockAdapter: LLMAdapter & { completeJSON: ReturnType<typeof vi.fn> };
  let engine: PriorityEngine;

  beforeEach(() => {
    mockAdapter = createMockLLMAdapter({
      completeJSONResponse: PRIORITY_RESPONSE,
    });
    engine = new PriorityEngine(mockAdapter);
  });

  describe('prioritize', () => {
    it('prioritizes a single email', async () => {
      const result = await engine.prioritize(makeEmail());
      expect(result).toEqual(PRIORITY_RESPONSE);
    });

    it('calls completeJSON with low temperature', async () => {
      await engine.prioritize(makeEmail());
      const options = mockAdapter.completeJSON.mock.calls[0][2];
      expect(options.temperature).toBe(0.1);
    });

    it('includes context info when provided', async () => {
      await engine.prioritize(makeEmail(), {
        userEmail: 'me@example.com',
        vipList: ['boss@company.com', 'ceo@company.com'],
      });
      const prompt = mockAdapter.completeJSON.mock.calls[0][0];
      expect(prompt).toContain('me@example.com');
      expect(prompt).toContain('boss@company.com');
      expect(prompt).toContain('ceo@company.com');
    });

    it('works without context', async () => {
      const result = await engine.prioritize(makeEmail());
      expect(result.score).toBe(65);
    });

    it('wraps adapter errors in AiError', async () => {
      mockAdapter.completeJSON.mockRejectedValue(new Error('API failed'));
      await expect(engine.prioritize(makeEmail())).rejects.toThrow(AiError);
      await expect(engine.prioritize(makeEmail())).rejects.toThrow('Failed to prioritize email');
    });
  });

  describe('prioritizeBatch', () => {
    it('returns empty array for empty input', async () => {
      const result = await engine.prioritizeBatch([]);
      expect(result).toEqual([]);
      expect(mockAdapter.completeJSON).not.toHaveBeenCalled();
    });

    it('uses single prioritize for one email', async () => {
      const emails = [makeEmail()];
      const result = await engine.prioritizeBatch(emails);
      expect(result).toHaveLength(1);
      expect(result[0].priority).toEqual(PRIORITY_RESPONSE);
      expect(result[0].email).toBe(emails[0]);
    });

    it('prioritizes batch of emails', async () => {
      const emails = makeEmails(3);
      const batchResponse = emails.map((e) => ({
        emailId: e.id,
        priority: PRIORITY_RESPONSE,
      }));
      mockAdapter.completeJSON.mockResolvedValue(batchResponse);

      const result = await engine.prioritizeBatch(emails);
      expect(result).toHaveLength(3);
      result.forEach((r) => {
        expect(r.priority).toEqual(PRIORITY_RESPONSE);
      });
    });

    it('sorts results by score descending', async () => {
      const emails = makeEmails(3);
      const batchResponse = [
        { emailId: emails[0].id, priority: { ...PRIORITY_RESPONSE, score: 30 } },
        { emailId: emails[1].id, priority: { ...PRIORITY_RESPONSE, score: 90 } },
        { emailId: emails[2].id, priority: { ...PRIORITY_RESPONSE, score: 60 } },
      ];
      mockAdapter.completeJSON.mockResolvedValue(batchResponse);

      const result = await engine.prioritizeBatch(emails);
      expect(result[0].priority.score).toBe(90);
      expect(result[1].priority.score).toBe(60);
      expect(result[2].priority.score).toBe(30);
    });

    it('uses fallback priority for missing email IDs', async () => {
      const emails = makeEmails(2);
      const batchResponse = [
        { emailId: emails[0].id, priority: PRIORITY_RESPONSE },
        // Missing emails[1]
      ];
      mockAdapter.completeJSON.mockResolvedValue(batchResponse);

      const result = await engine.prioritizeBatch(emails);
      const fallback = result.find((r) => r.email.id === emails[1].id);
      expect(fallback?.priority.score).toBe(50);
      expect(fallback?.priority.level).toBe('medium');
    });

    it('falls back to serial prioritization on batch error', async () => {
      const emails = makeEmails(2);
      mockAdapter.completeJSON
        .mockRejectedValueOnce(new Error('batch failed'))
        .mockResolvedValue(PRIORITY_RESPONSE);

      const result = await engine.prioritizeBatch(emails);
      expect(result).toHaveLength(2);
      // 1 failed batch + 2 serial = 3 calls
      expect(mockAdapter.completeJSON).toHaveBeenCalledTimes(3);
    });

    it('includes context in batch prompt', async () => {
      const emails = makeEmails(2);
      const batchResponse = emails.map((e) => ({
        emailId: e.id,
        priority: PRIORITY_RESPONSE,
      }));
      mockAdapter.completeJSON.mockResolvedValue(batchResponse);

      await engine.prioritizeBatch(emails, {
        vipList: ['ceo@company.com'],
      });
      const prompt = mockAdapter.completeJSON.mock.calls[0][0];
      expect(prompt).toContain('ceo@company.com');
    });
  });
});
