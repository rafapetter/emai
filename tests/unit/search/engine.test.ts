import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchEngine } from '../../../src/search/engine.js';
import { createMockLLMAdapter } from '../../helpers/mock-llm-adapter.js';
import { createMockVectorStore } from '../../helpers/mock-vector-store.js';
import { createMockStorageAdapter } from '../../helpers/mock-storage-adapter.js';
import { makeEmail, makeEmails } from '../../helpers/fixtures.js';
import { SearchError } from '../../../src/core/errors.js';
import type { VectorStore, LLMAdapter, StorageAdapter } from '../../../src/core/types.js';

describe('SearchEngine', () => {
  let mockLLM: LLMAdapter & { embed: ReturnType<typeof vi.fn> };
  let mockVectorStore: VectorStore & {
    initialize: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    search: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    count: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
  };
  let mockStorage: StorageAdapter & {
    saveEmail: ReturnType<typeof vi.fn>;
    deleteEmail: ReturnType<typeof vi.fn>;
    listEmails: ReturnType<typeof vi.fn>;
    getEmail: ReturnType<typeof vi.fn>;
  };
  let engine: SearchEngine;

  const embedding = [0.1, 0.2, 0.3];

  beforeEach(() => {
    mockLLM = createMockLLMAdapter({
      embedResponse: (texts: string[]) => texts.map(() => embedding),
    });
    mockVectorStore = createMockVectorStore() as any;
    mockStorage = createMockStorageAdapter() as any;
    engine = new SearchEngine(mockVectorStore, mockLLM, mockStorage);
  });

  describe('index', () => {
    it('initializes vector store on first call', async () => {
      await engine.index([makeEmail()]);
      expect(mockVectorStore.initialize).toHaveBeenCalledWith(1536);
    });

    it('only initializes once', async () => {
      await engine.index([makeEmail()]);
      await engine.index([makeEmail({ id: 'e2' })]);
      expect(mockVectorStore.initialize).toHaveBeenCalledTimes(1);
    });

    it('generates embeddings and upserts to vector store', async () => {
      await engine.index([makeEmail()]);
      expect(mockLLM.embed).toHaveBeenCalled();
      expect(mockVectorStore.upsert).toHaveBeenCalled();
      const entries = mockVectorStore.upsert.mock.calls[0][0];
      expect(entries.length).toBeGreaterThan(0);
      expect(entries[0].vector).toEqual(embedding);
    });

    it('saves email to storage when available', async () => {
      await engine.index([makeEmail()]);
      expect(mockStorage.saveEmail).toHaveBeenCalled();
    });

    it('includes email metadata in vector entries', async () => {
      const email = makeEmail({ id: 'test-email', folder: 'inbox', subject: 'Hello' });
      await engine.index([email]);
      const entries = mockVectorStore.upsert.mock.calls[0][0];
      expect(entries[0].metadata.emailId).toBe('test-email');
      expect(entries[0].metadata.folder).toBe('inbox');
      expect(entries[0].metadata.subject).toBe('Hello');
    });

    it('indexes multiple emails', async () => {
      const emails = makeEmails(3);
      await engine.index(emails);
      expect(mockStorage.saveEmail).toHaveBeenCalledTimes(3);
    });

    it('handles empty email array', async () => {
      await engine.index([]);
      expect(mockVectorStore.upsert).not.toHaveBeenCalled();
    });
  });

  describe('indexEmail', () => {
    it('delegates to index with single email array', async () => {
      const email = makeEmail();
      await engine.indexEmail(email);
      expect(mockVectorStore.upsert).toHaveBeenCalled();
      expect(mockStorage.saveEmail).toHaveBeenCalledWith(email);
    });
  });

  describe('removeFromIndex', () => {
    it('deletes from vector store and full-text index', async () => {
      await engine.removeFromIndex('email-1');
      expect(mockVectorStore.delete).toHaveBeenCalled();
      const ids = mockVectorStore.delete.mock.calls[0][0];
      expect(ids).toContain('email-1');
    });

    it('deletes chunk IDs too', async () => {
      await engine.removeFromIndex('email-1');
      const ids = mockVectorStore.delete.mock.calls[0][0];
      expect(ids).toContain('email-1:chunk:0');
      expect(ids).toContain('email-1:chunk:99');
    });

    it('deletes from storage when available', async () => {
      await engine.removeFromIndex('email-1');
      expect(mockStorage.deleteEmail).toHaveBeenCalledWith('email-1');
    });
  });

  describe('reindex', () => {
    it('throws SearchError without storage adapter', async () => {
      const engineNoStorage = new SearchEngine(mockVectorStore, mockLLM);
      await expect(engineNoStorage.reindex()).rejects.toThrow(SearchError);
      await expect(engineNoStorage.reindex()).rejects.toThrow('Storage adapter required');
    });

    it('fetches all emails from storage and reindexes', async () => {
      const emails = makeEmails(2);
      mockStorage.listEmails.mockResolvedValue({ items: emails, hasMore: false, total: 2 });

      await engine.reindex();
      expect(mockStorage.listEmails).toHaveBeenCalledWith({ limit: 10000 });
      expect(mockVectorStore.upsert).toHaveBeenCalled();
    });
  });

  describe('getIndexedCount', () => {
    it('returns count from vector store', async () => {
      mockVectorStore.count.mockResolvedValue(42);
      const count = await engine.getIndexedCount();
      expect(count).toBe(42);
    });
  });

  describe('searchSemantic', () => {
    it('delegates to semantic search', async () => {
      mockVectorStore.search.mockResolvedValue([
        { id: 'e1', score: 0.9, metadata: { emailId: 'e1' }, content: 'text' },
      ]);
      mockStorage.getEmail.mockResolvedValue(makeEmail());

      const results = await engine.searchSemantic('query');
      expect(mockVectorStore.search).toHaveBeenCalled();
      expect(results).toHaveLength(1);
    });
  });

  describe('searchFullText', () => {
    it('delegates to full-text search', async () => {
      await engine.index([makeEmail({
        id: 'e1',
        body: { text: 'Important budget meeting notes' },
      })]);

      const results = await engine.searchFullText('budget');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('close', () => {
    it('closes vector store and resets initialization', async () => {
      await engine.index([makeEmail()]);
      await engine.close();
      expect(mockVectorStore.close).toHaveBeenCalled();

      // After close, next operation should re-initialize
      await engine.index([makeEmail({ id: 'e2' })]);
      expect(mockVectorStore.initialize).toHaveBeenCalledTimes(2);
    });
  });

  describe('embedding errors', () => {
    it('throws SearchError when embedding fails during index', async () => {
      mockLLM.embed.mockRejectedValue(new Error('embedding service down'));
      await expect(engine.index([makeEmail()])).rejects.toThrow(SearchError);
    });
  });
});
