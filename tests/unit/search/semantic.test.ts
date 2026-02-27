import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SemanticSearch } from '../../../src/search/semantic.js';
import { createMockLLMAdapter } from '../../helpers/mock-llm-adapter.js';
import { createMockVectorStore } from '../../helpers/mock-vector-store.js';
import { createMockStorageAdapter } from '../../helpers/mock-storage-adapter.js';
import { makeEmail } from '../../helpers/fixtures.js';
import { SearchError } from '../../../src/core/errors.js';
import type { VectorStore, LLMAdapter, StorageAdapter } from '../../../src/core/types.js';

describe('SemanticSearch', () => {
  let mockLLM: LLMAdapter & { embed: ReturnType<typeof vi.fn> };
  let mockVectorStore: VectorStore & { search: ReturnType<typeof vi.fn> };
  let mockStorage: StorageAdapter & { getEmail: ReturnType<typeof vi.fn> };
  let search: SemanticSearch;

  const queryEmbedding = [0.1, 0.2, 0.3];

  beforeEach(() => {
    mockLLM = createMockLLMAdapter({
      embedResponse: () => [queryEmbedding],
    });
    mockVectorStore = createMockVectorStore() as any;
    mockStorage = createMockStorageAdapter() as any;
    search = new SemanticSearch(mockVectorStore, mockLLM, mockStorage);
  });

  describe('search', () => {
    it('embeds query and searches vector store', async () => {
      mockVectorStore.search.mockResolvedValue([
        {
          id: 'email-1',
          score: 0.95,
          metadata: { emailId: 'email-1', subject: 'Test', from: 'alice@example.com' },
          content: 'Hello world',
        },
      ]);
      mockStorage.getEmail.mockResolvedValue(makeEmail());

      const results = await search.search('hello');
      expect(mockLLM.embed).toHaveBeenCalledWith(['hello']);
      expect(mockVectorStore.search).toHaveBeenCalledWith(queryEmbedding, 20, undefined);
      expect(results).toHaveLength(1);
      expect(results[0].matchType).toBe('semantic');
    });

    it('resolves email from storage when available', async () => {
      const storedEmail = makeEmail({ id: 'stored-1' });
      mockVectorStore.search.mockResolvedValue([
        { id: 'stored-1', score: 0.9, metadata: { emailId: 'stored-1' }, content: 'text' },
      ]);
      mockStorage.getEmail.mockResolvedValue(storedEmail);

      const results = await search.search('query');
      expect(results[0].email).toBe(storedEmail);
    });

    it('reconstructs email from metadata when not in storage', async () => {
      mockVectorStore.search.mockResolvedValue([
        {
          id: 'e1',
          score: 0.8,
          metadata: { emailId: 'e1', subject: 'Test Subject', from: 'alice@example.com', folder: 'inbox' },
          content: 'Email content here',
        },
      ]);
      mockStorage.getEmail.mockResolvedValue(null);

      const results = await search.search('query');
      expect(results[0].email.id).toBe('e1');
      expect(results[0].email.subject).toBe('Test Subject');
      expect(results[0].email.from.address).toBe('alice@example.com');
    });

    it('reconstructs email without storage adapter', async () => {
      const searchNoStorage = new SemanticSearch(mockVectorStore, mockLLM);
      mockVectorStore.search.mockResolvedValue([
        {
          id: 'e1',
          score: 0.8,
          metadata: { emailId: 'e1', subject: 'Test' },
          content: 'content',
        },
      ]);

      const results = await searchNoStorage.search('query');
      expect(results).toHaveLength(1);
      expect(results[0].email.subject).toBe('Test');
    });

    it('filters results below minScore', async () => {
      mockVectorStore.search.mockResolvedValue([
        { id: 'e1', score: 0.9, metadata: { emailId: 'e1' }, content: 'high score' },
        { id: 'e2', score: 0.3, metadata: { emailId: 'e2' }, content: 'low score' },
      ]);

      const results = await search.search('query', { minScore: 0.5 });
      expect(results).toHaveLength(1);
    });

    it('respects limit option', async () => {
      mockVectorStore.search.mockResolvedValue(
        Array.from({ length: 5 }, (_, i) => ({
          id: `e${i}`,
          score: 0.9 - i * 0.1,
          metadata: { emailId: `e${i}` },
          content: `content ${i}`,
        })),
      );

      const results = await search.search('query', { limit: 2 });
      expect(results).toHaveLength(2);
    });

    it('builds metadata filter from options', async () => {
      mockVectorStore.search.mockResolvedValue([]);

      await search.search('query', {
        folder: 'inbox',
        label: 'important',
        from: 'alice@example.com',
        after: new Date('2025-01-01'),
        before: new Date('2025-12-31'),
      });

      const filter = mockVectorStore.search.mock.calls[0][2];
      expect(filter).toEqual({
        folder: 'inbox',
        labels: { $contains: 'important' },
        from: 'alice@example.com',
        date: {
          $gte: new Date('2025-01-01').getTime(),
          $lte: new Date('2025-12-31').getTime(),
        },
      });
    });

    it('passes no filter when no options provided', async () => {
      mockVectorStore.search.mockResolvedValue([]);
      await search.search('query');
      const filter = mockVectorStore.search.mock.calls[0][2];
      expect(filter).toBeUndefined();
    });

    it('throws SearchError when embedding fails', async () => {
      mockLLM.embed.mockRejectedValue(new Error('embedding failed'));
      await expect(search.search('query')).rejects.toThrow(SearchError);
    });

    it('includes content snippet in highlights', async () => {
      mockVectorStore.search.mockResolvedValue([
        { id: 'e1', score: 0.9, metadata: { emailId: 'e1' }, content: 'This is a snippet of email content' },
      ]);

      const results = await search.search('query');
      expect(results[0].highlights).toContain('This is a snippet of email content');
    });
  });
});
