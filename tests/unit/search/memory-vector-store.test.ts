import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryVectorStore } from '../../../src/search/stores/memory.js';
import type { VectorEntry } from '../../../src/core/types.js';

function makeVector(id: string, vector: number[], metadata: Record<string, unknown> = {}): VectorEntry {
  return { id, vector, metadata, content: `content for ${id}` };
}

describe('MemoryVectorStore', () => {
  let store: MemoryVectorStore;

  beforeEach(async () => {
    store = new MemoryVectorStore();
    await store.initialize(3); // 3-dimensional for tests
  });

  describe('initialize', () => {
    it('completes without error', async () => {
      const s = new MemoryVectorStore();
      await expect(s.initialize(1536)).resolves.toBeUndefined();
    });
  });

  describe('name', () => {
    it('returns memory', () => {
      expect(store.name).toBe('memory');
    });
  });

  describe('upsert', () => {
    it('inserts new vectors', async () => {
      await store.upsert([makeVector('v1', [1, 0, 0])]);
      expect(await store.count()).toBe(1);
    });

    it('overwrites existing vector by id', async () => {
      await store.upsert([makeVector('v1', [1, 0, 0])]);
      await store.upsert([makeVector('v1', [0, 1, 0])]);
      expect(await store.count()).toBe(1);
    });

    it('inserts multiple vectors', async () => {
      await store.upsert([
        makeVector('v1', [1, 0, 0]),
        makeVector('v2', [0, 1, 0]),
        makeVector('v3', [0, 0, 1]),
      ]);
      expect(await store.count()).toBe(3);
    });
  });

  describe('search', () => {
    beforeEach(async () => {
      await store.upsert([
        makeVector('v1', [1, 0, 0], { category: 'a' }),
        makeVector('v2', [0, 1, 0], { category: 'b' }),
        makeVector('v3', [0.9, 0.1, 0], { category: 'a' }),
      ]);
    });

    it('returns results sorted by cosine similarity', async () => {
      const results = await store.search([1, 0, 0], 10);
      expect(results[0].id).toBe('v1'); // exact match
      expect(results[1].id).toBe('v3'); // close match
      expect(results[0].score).toBeGreaterThan(results[1].score);
    });

    it('respects limit', async () => {
      const results = await store.search([1, 0, 0], 2);
      expect(results).toHaveLength(2);
    });

    it('returns content and metadata', async () => {
      const results = await store.search([1, 0, 0], 1);
      expect(results[0].content).toBe('content for v1');
      expect(results[0].metadata).toEqual({ category: 'a' });
    });

    it('returns empty for empty store', async () => {
      const emptyStore = new MemoryVectorStore();
      await emptyStore.initialize(3);
      const results = await emptyStore.search([1, 0, 0], 10);
      expect(results).toHaveLength(0);
    });
  });

  describe('search with filters', () => {
    beforeEach(async () => {
      await store.upsert([
        makeVector('v1', [1, 0, 0], { category: 'work', score: 80, tags: ['urgent', 'important'] }),
        makeVector('v2', [0, 1, 0], { category: 'personal', score: 50, tags: ['casual'] }),
        makeVector('v3', [0, 0, 1], { category: 'work', score: 90, tags: ['urgent'] }),
      ]);
    });

    it('filters by exact match', async () => {
      const results = await store.search([1, 1, 1], 10, { category: 'work' });
      expect(results).toHaveLength(2);
      expect(results.every((r) => r.metadata.category === 'work')).toBe(true);
    });

    it('filters by array inclusion', async () => {
      const results = await store.search([1, 1, 1], 10, { category: ['work', 'personal'] });
      expect(results).toHaveLength(3);
    });

    it('filters by $gte range', async () => {
      const results = await store.search([1, 1, 1], 10, { score: { $gte: 80 } });
      expect(results).toHaveLength(2);
    });

    it('filters by $lte range', async () => {
      const results = await store.search([1, 1, 1], 10, { score: { $lte: 50 } });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('v2');
    });

    it('filters by $in operator', async () => {
      const results = await store.search([1, 1, 1], 10, { category: { $in: ['personal'] } });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('v2');
    });

    it('filters by $contains operator', async () => {
      const results = await store.search([1, 1, 1], 10, { tags: { $contains: 'urgent' } });
      expect(results).toHaveLength(2);
    });

    it('skips undefined filter values', async () => {
      const results = await store.search([1, 1, 1], 10, { category: undefined });
      expect(results).toHaveLength(3);
    });
  });

  describe('delete', () => {
    it('removes vectors by id', async () => {
      await store.upsert([makeVector('v1', [1, 0, 0]), makeVector('v2', [0, 1, 0])]);
      await store.delete(['v1']);
      expect(await store.count()).toBe(1);
    });

    it('handles deleting non-existent ids', async () => {
      await store.delete(['nonexistent']);
      expect(await store.count()).toBe(0);
    });
  });

  describe('close', () => {
    it('clears all data', async () => {
      await store.upsert([makeVector('v1', [1, 0, 0])]);
      await store.close();
      expect(await store.count()).toBe(0);
    });
  });
});
