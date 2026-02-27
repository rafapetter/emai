import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { AiEngine, createAiEngine, requireAiEngine } from '../../../src/ai/index.js';
import { createMockLLMAdapter } from '../../helpers/mock-llm-adapter.js';
import {
  makeEmail,
  makeThread,
  makeEmails,
  CLASSIFICATION_RESPONSE,
  SUMMARY_RESPONSE,
  PRIORITY_RESPONSE,
  ACTIONS_RESPONSE,
  COMPOSE_RESPONSE,
} from '../../helpers/fixtures.js';
import { AdapterNotConfiguredError } from '../../../src/core/errors.js';
import type { LLMAdapter } from '../../../src/core/types.js';

describe('AiEngine', () => {
  let mockAdapter: LLMAdapter & {
    complete: ReturnType<typeof vi.fn>;
    completeJSON: ReturnType<typeof vi.fn>;
    embed: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockAdapter = createMockLLMAdapter({
      completeJSONResponse: CLASSIFICATION_RESPONSE,
      completeResponse: 'Mock text response',
    });
  });

  describe('constructor', () => {
    it('accepts LLMAdapter directly', () => {
      const engine = new AiEngine(mockAdapter);
      expect(engine.adapter).toBe(mockAdapter);
    });

    it('detects LLMAdapter via duck typing', () => {
      // Must have name, complete, completeJSON, embed
      const engine = new AiEngine(mockAdapter);
      expect(engine.adapter.name).toBe('mock');
    });

    it('initializes all sub-engines', () => {
      const engine = new AiEngine(mockAdapter);
      expect(engine.classify).toBeTruthy();
      expect(engine.extract).toBeTruthy();
      expect(engine.compose).toBeTruthy();
      expect(engine.summarize).toBeTruthy();
      expect(engine.priority).toBeTruthy();
      expect(engine.actions).toBeTruthy();
    });
  });

  describe('classifyEmail', () => {
    it('delegates to classify engine', async () => {
      const engine = new AiEngine(mockAdapter);
      const result = await engine.classifyEmail(makeEmail());
      expect(result).toEqual(CLASSIFICATION_RESPONSE);
    });
  });

  describe('classifyEmails', () => {
    it('delegates to classify batch', async () => {
      const engine = new AiEngine(mockAdapter);
      const result = await engine.classifyEmails([makeEmail()]);
      expect(result).toHaveLength(1);
    });
  });

  describe('summarizeEmail', () => {
    it('delegates to summarize engine', async () => {
      mockAdapter.completeJSON.mockImplementation(async (_p: string, schema: z.ZodType) => {
        return schema.parse({
          summary: 'Test summary',
          keyPoints: ['point 1'],
          participants: [{ address: 'alice@example.com' }],
          actionItems: [],
          sentiment: 'neutral',
          topicTags: ['test'],
        });
      });
      const engine = new AiEngine(mockAdapter);
      const result = await engine.summarizeEmail(makeEmail());
      expect(result.summary).toBe('Test summary');
    });
  });

  describe('summarizeThread', () => {
    it('delegates to summarize thread', async () => {
      mockAdapter.completeJSON.mockImplementation(async (_p: string, schema: z.ZodType) => {
        return schema.parse({
          summary: 'Thread summary',
          keyPoints: ['point 1'],
          participants: [{ address: 'alice@example.com' }],
          actionItems: [],
          sentiment: 'neutral',
          topicTags: ['test'],
        });
      });
      const engine = new AiEngine(mockAdapter);
      const result = await engine.summarizeThread(makeThread());
      expect(result.summary).toBe('Thread summary');
    });
  });

  describe('summarizeEmails', () => {
    it('delegates to summarize batch', async () => {
      const engine = new AiEngine(mockAdapter);
      const result = await engine.summarizeEmails(makeEmails(2));
      expect(typeof result).toBe('string');
    });
  });

  describe('prioritizeEmail', () => {
    it('delegates to priority engine', async () => {
      mockAdapter.completeJSON.mockImplementation(async (_p: string, schema: z.ZodType) => {
        return schema.parse(PRIORITY_RESPONSE);
      });
      const engine = new AiEngine(mockAdapter);
      const result = await engine.prioritizeEmail(makeEmail());
      expect(result).toEqual(PRIORITY_RESPONSE);
    });
  });

  describe('prioritizeEmails', () => {
    it('delegates to priority batch', async () => {
      mockAdapter.completeJSON.mockImplementation(async (_p: string, schema: z.ZodType) => {
        return schema.parse(PRIORITY_RESPONSE);
      });
      const engine = new AiEngine(mockAdapter);
      const result = await engine.prioritizeEmails([makeEmail()]);
      expect(result).toHaveLength(1);
      expect(result[0].priority).toEqual(PRIORITY_RESPONSE);
    });
  });

  describe('composeEmail', () => {
    it('delegates to compose engine', async () => {
      mockAdapter.completeJSON.mockImplementation(async (_p: string, schema: z.ZodType) => {
        return schema.parse(COMPOSE_RESPONSE);
      });
      const engine = new AiEngine(mockAdapter);
      const result = await engine.composeEmail({ context: 'Test' });
      expect(result).toEqual(COMPOSE_RESPONSE);
    });
  });

  describe('replyToEmail', () => {
    it('delegates to compose reply', async () => {
      mockAdapter.completeJSON.mockImplementation(async (_p: string, schema: z.ZodType) => {
        return schema.parse(COMPOSE_RESPONSE);
      });
      const engine = new AiEngine(mockAdapter);
      const result = await engine.replyToEmail(makeEmail(), { context: 'Accepting' });
      expect(result).toEqual(COMPOSE_RESPONSE);
    });
  });

  describe('rewriteInTone', () => {
    it('delegates to compose rewrite', async () => {
      mockAdapter.complete.mockResolvedValue('Rewritten text');
      const engine = new AiEngine(mockAdapter);
      const result = await engine.rewriteInTone('original text', 'casual');
      expect(result).toBe('Rewritten text');
    });
  });

  describe('improveWriting', () => {
    it('delegates to compose improve', async () => {
      mockAdapter.complete.mockResolvedValue('Improved text');
      const engine = new AiEngine(mockAdapter);
      const result = await engine.improveWriting('bad text');
      expect(result).toBe('Improved text');
    });
  });

  describe('extractData', () => {
    it('delegates to extract engine', async () => {
      const schema = z.object({ name: z.string() });
      mockAdapter.completeJSON.mockImplementation(async () => ({
        data: { name: 'Alice' },
        confidence: 0.9,
        sources: [],
      }));
      const engine = new AiEngine(mockAdapter);
      const result = await engine.extractData(makeEmail(), schema);
      expect(result.data).toEqual({ name: 'Alice' });
    });
  });

  describe('detectActions', () => {
    it('delegates to actions engine', async () => {
      mockAdapter.completeJSON.mockImplementation(async (_p: string, schema: z.ZodType) => {
        return schema.parse(ACTIONS_RESPONSE);
      });
      const engine = new AiEngine(mockAdapter);
      const result = await engine.detectActions(makeEmail());
      expect(result).toEqual(ACTIONS_RESPONSE.actions);
    });
  });

  describe('detectActionsInThread', () => {
    it('delegates to actions engine for threads', async () => {
      mockAdapter.completeJSON.mockImplementation(async (_p: string, schema: z.ZodType) => {
        return schema.parse(ACTIONS_RESPONSE);
      });
      const engine = new AiEngine(mockAdapter);
      const result = await engine.detectActionsInThread(makeThread());
      expect(result).toEqual(ACTIONS_RESPONSE.actions);
    });
  });
});

describe('createAiEngine', () => {
  it('creates AiEngine from config with custom adapter', () => {
    const mockAdapter = createMockLLMAdapter();
    const engine = createAiEngine({ adapter: mockAdapter as any });
    expect(engine).toBeInstanceOf(AiEngine);
  });
});

describe('requireAiEngine', () => {
  it('returns engine when provided', () => {
    const mockAdapter = createMockLLMAdapter();
    const engine = new AiEngine(mockAdapter);
    expect(requireAiEngine(engine, 'test')).toBe(engine);
  });

  it('throws AdapterNotConfiguredError when undefined', () => {
    expect(() => requireAiEngine(undefined, 'classification')).toThrow(
      AdapterNotConfiguredError,
    );
  });

  it('includes feature name in error', () => {
    expect(() => requireAiEngine(undefined, 'classification')).toThrow(
      'classification',
    );
  });
});
