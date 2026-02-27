import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ClassifyEngine } from '../../../src/ai/classify.js';
import { createMockLLMAdapter } from '../../helpers/mock-llm-adapter.js';
import { makeEmail, makeEmails, CLASSIFICATION_RESPONSE } from '../../helpers/fixtures.js';
import { AiError } from '../../../src/core/errors.js';
import type { LLMAdapter } from '../../../src/core/types.js';

describe('ClassifyEngine', () => {
  let mockAdapter: LLMAdapter & { completeJSON: ReturnType<typeof vi.fn> };
  let engine: ClassifyEngine;

  beforeEach(() => {
    mockAdapter = createMockLLMAdapter({
      completeJSONResponse: CLASSIFICATION_RESPONSE,
    });
    engine = new ClassifyEngine(mockAdapter);
  });

  describe('classify', () => {
    it('classifies a single email', async () => {
      const result = await engine.classify(makeEmail());
      expect(result).toEqual(CLASSIFICATION_RESPONSE);
    });

    it('calls completeJSON with correct options', async () => {
      await engine.classify(makeEmail());
      expect(mockAdapter.completeJSON).toHaveBeenCalledTimes(1);
      const [prompt, _schema, options] = mockAdapter.completeJSON.mock.calls[0];
      expect(prompt).toContain('Classify this email');
      expect(options.temperature).toBe(0.1);
      expect(options.systemPrompt).toBeTruthy();
    });

    it('includes attachment info in prompt', async () => {
      const email = makeEmail({
        attachments: [
          { id: 'a1', filename: 'report.pdf', contentType: 'application/pdf', size: 1024, isInline: false },
        ],
      });
      await engine.classify(email);
      const prompt = mockAdapter.completeJSON.mock.calls[0][0];
      expect(prompt).toContain('report.pdf');
      expect(prompt).toContain('application/pdf');
    });

    it('wraps adapter errors in AiError', async () => {
      mockAdapter.completeJSON.mockRejectedValue(new Error('API failed'));
      await expect(engine.classify(makeEmail())).rejects.toThrow(AiError);
      await expect(engine.classify(makeEmail())).rejects.toThrow('Failed to classify email');
    });
  });

  describe('classifyBatch', () => {
    it('returns empty array for empty input', async () => {
      const result = await engine.classifyBatch([]);
      expect(result).toEqual([]);
      expect(mockAdapter.completeJSON).not.toHaveBeenCalled();
    });

    it('uses single classify for one email', async () => {
      const result = await engine.classifyBatch([makeEmail()]);
      expect(result).toEqual([CLASSIFICATION_RESPONSE]);
      const prompt = mockAdapter.completeJSON.mock.calls[0][0];
      expect(prompt).toContain('Classify this email');
    });

    it('classifies batch of emails', async () => {
      const emails = makeEmails(3);
      const batchResponse = emails.map((e) => ({
        emailId: e.id,
        classification: CLASSIFICATION_RESPONSE,
      }));
      mockAdapter.completeJSON.mockResolvedValue(batchResponse);

      const result = await engine.classifyBatch(emails);
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual(CLASSIFICATION_RESPONSE);
    });

    it('uses fallback classification for missing email IDs', async () => {
      const emails = makeEmails(2);
      const batchResponse = [
        { emailId: emails[0].id, classification: CLASSIFICATION_RESPONSE },
        // Missing emails[1]
      ];
      mockAdapter.completeJSON.mockResolvedValue(batchResponse);

      const result = await engine.classifyBatch(emails);
      expect(result[0]).toEqual(CLASSIFICATION_RESPONSE);
      expect(result[1].category).toBe('other');
      expect(result[1].confidence).toBe(0);
    });

    it('falls back to serial classification on batch error', async () => {
      const emails = makeEmails(2);
      mockAdapter.completeJSON
        .mockRejectedValueOnce(new Error('batch failed'))
        .mockResolvedValue(CLASSIFICATION_RESPONSE);

      const result = await engine.classifyBatch(emails);
      expect(result).toHaveLength(2);
      // 1 failed batch + 2 serial = 3 calls
      expect(mockAdapter.completeJSON).toHaveBeenCalledTimes(3);
    });
  });
});
