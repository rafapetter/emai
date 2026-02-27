import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActionsEngine } from '../../../src/ai/actions.js';
import { createMockLLMAdapter } from '../../helpers/mock-llm-adapter.js';
import { makeEmail, makeThread, ACTIONS_RESPONSE } from '../../helpers/fixtures.js';
import { AiError } from '../../../src/core/errors.js';
import type { LLMAdapter } from '../../../src/core/types.js';

describe('ActionsEngine', () => {
  let mockAdapter: LLMAdapter & { completeJSON: ReturnType<typeof vi.fn> };
  let engine: ActionsEngine;

  beforeEach(() => {
    mockAdapter = createMockLLMAdapter({
      completeJSONResponse: ACTIONS_RESPONSE,
    });
    engine = new ActionsEngine(mockAdapter);
  });

  describe('detectActions', () => {
    it('detects action items from email', async () => {
      const result = await engine.detectActions(makeEmail());
      expect(result).toEqual(ACTIONS_RESPONSE.actions);
      expect(result).toHaveLength(1);
      expect(result[0].description).toBe('Review the attached document');
    });

    it('calls completeJSON with low temperature', async () => {
      await engine.detectActions(makeEmail());
      const options = mockAdapter.completeJSON.mock.calls[0][2];
      expect(options.temperature).toBe(0.1);
    });

    it('includes email content in prompt', async () => {
      const email = makeEmail({
        body: { text: 'Please review the Q4 report by Friday.' },
      });
      await engine.detectActions(email);
      const prompt = mockAdapter.completeJSON.mock.calls[0][0];
      expect(prompt).toContain('Q4 report');
    });

    it('wraps adapter errors in AiError', async () => {
      mockAdapter.completeJSON.mockRejectedValue(new Error('API failed'));
      await expect(engine.detectActions(makeEmail())).rejects.toThrow(AiError);
      await expect(engine.detectActions(makeEmail())).rejects.toThrow('Failed to detect actions');
    });
  });

  describe('detectActionsInThread', () => {
    it('detects actions in a thread', async () => {
      const result = await engine.detectActionsInThread(makeThread());
      expect(result).toEqual(ACTIONS_RESPONSE.actions);
    });

    it('includes thread subject in prompt', async () => {
      await engine.detectActionsInThread(makeThread());
      const prompt = mockAdapter.completeJSON.mock.calls[0][0];
      expect(prompt).toContain('Test Email Subject');
    });

    it('includes participant list in prompt', async () => {
      await engine.detectActionsInThread(makeThread());
      const prompt = mockAdapter.completeJSON.mock.calls[0][0];
      expect(prompt).toContain('Alice Smith');
    });

    it('includes all messages numbered in prompt', async () => {
      await engine.detectActionsInThread(makeThread());
      const prompt = mockAdapter.completeJSON.mock.calls[0][0];
      expect(prompt).toContain('Message 1');
      expect(prompt).toContain('Message 2');
    });

    it('asks for deduplication in prompt', async () => {
      await engine.detectActionsInThread(makeThread());
      const prompt = mockAdapter.completeJSON.mock.calls[0][0];
      expect(prompt).toContain('Deduplicate');
    });

    it('wraps adapter errors in AiError', async () => {
      mockAdapter.completeJSON.mockRejectedValue(new Error('API failed'));
      await expect(engine.detectActionsInThread(makeThread())).rejects.toThrow(AiError);
      await expect(engine.detectActionsInThread(makeThread())).rejects.toThrow(
        'Failed to detect actions in thread',
      );
    });
  });
});
