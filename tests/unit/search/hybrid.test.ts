import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HybridSearch } from '../../../src/search/hybrid.js';
import { makeEmail } from '../../helpers/fixtures.js';
import type { SearchResult } from '../../../src/core/types.js';

function makeSearchResult(id: string, score: number, matchType: string = 'semantic'): SearchResult {
  return {
    email: makeEmail({ id }),
    score,
    matchType: matchType as any,
    highlights: [`highlight for ${id}`],
  };
}

describe('HybridSearch', () => {
  let mockSemantic: { search: ReturnType<typeof vi.fn> };
  let mockFullText: { search: ReturnType<typeof vi.fn> };
  let hybrid: HybridSearch;

  beforeEach(() => {
    mockSemantic = { search: vi.fn().mockResolvedValue([]) };
    mockFullText = { search: vi.fn().mockResolvedValue([]) };
    hybrid = new HybridSearch(mockSemantic as any, mockFullText as any);
  });

  it('combines semantic and full-text results', async () => {
    mockSemantic.search.mockResolvedValue([
      makeSearchResult('e1', 0.9, 'semantic'),
    ]);
    mockFullText.search.mockResolvedValue([
      makeSearchResult('e2', 5.0, 'fulltext'),
    ]);

    const results = await hybrid.search('query');
    expect(results).toHaveLength(2);
    results.forEach((r) => expect(r.matchType).toBe('hybrid'));
  });

  it('merges scores for overlapping results using RRF', async () => {
    mockSemantic.search.mockResolvedValue([
      makeSearchResult('e1', 0.9),
    ]);
    mockFullText.search.mockResolvedValue([
      makeSearchResult('e1', 5.0),
    ]);

    const results = await hybrid.search('query');
    expect(results).toHaveLength(1);
    expect(results[0].email.id).toBe('e1');
    // Score should be higher than individual RRF scores since both contribute
    expect(results[0].score).toBeGreaterThan(0);
  });

  it('merges highlights for overlapping results', async () => {
    mockSemantic.search.mockResolvedValue([
      { ...makeSearchResult('e1', 0.9), highlights: ['semantic highlight'] },
    ]);
    mockFullText.search.mockResolvedValue([
      { ...makeSearchResult('e1', 5.0), highlights: ['fulltext highlight'] },
    ]);

    const results = await hybrid.search('query');
    expect(results[0].highlights).toContain('semantic highlight');
    expect(results[0].highlights).toContain('fulltext highlight');
  });

  it('deduplicates highlights', async () => {
    mockSemantic.search.mockResolvedValue([
      { ...makeSearchResult('e1', 0.9), highlights: ['same highlight'] },
    ]);
    mockFullText.search.mockResolvedValue([
      { ...makeSearchResult('e1', 5.0), highlights: ['same highlight'] },
    ]);

    const results = await hybrid.search('query');
    expect(results[0].highlights).toHaveLength(1);
  });

  it('respects alpha=0 (full-text only)', async () => {
    mockSemantic.search.mockResolvedValue([
      makeSearchResult('e1', 0.9),
    ]);
    mockFullText.search.mockResolvedValue([
      makeSearchResult('e2', 5.0),
    ]);

    const results = await hybrid.search('query', { alpha: 0 });
    expect(mockSemantic.search).not.toHaveBeenCalled();
    expect(results.every((r) => r.email.id === 'e2')).toBe(true);
  });

  it('respects alpha=1 (semantic only)', async () => {
    mockSemantic.search.mockResolvedValue([
      makeSearchResult('e1', 0.9),
    ]);
    mockFullText.search.mockResolvedValue([
      makeSearchResult('e2', 5.0),
    ]);

    const results = await hybrid.search('query', { alpha: 1 });
    expect(mockFullText.search).not.toHaveBeenCalled();
    expect(results.every((r) => r.email.id === 'e1')).toBe(true);
  });

  it('sorts results by RRF score descending', async () => {
    mockSemantic.search.mockResolvedValue([
      makeSearchResult('e1', 0.9),
      makeSearchResult('e2', 0.8),
    ]);
    mockFullText.search.mockResolvedValue([
      makeSearchResult('e2', 5.0), // e2 ranked #1 in full-text
      makeSearchResult('e3', 3.0),
    ]);

    const results = await hybrid.search('query', { alpha: 0.5 });
    // e2 should rank highest (appears in both lists)
    expect(results[0].email.id).toBe('e2');
  });

  it('respects limit option', async () => {
    mockSemantic.search.mockResolvedValue([
      makeSearchResult('e1', 0.9),
      makeSearchResult('e2', 0.8),
      makeSearchResult('e3', 0.7),
    ]);
    mockFullText.search.mockResolvedValue([]);

    const results = await hybrid.search('query', { limit: 2 });
    expect(results).toHaveLength(2);
  });

  it('passes search options to both engines', async () => {
    await hybrid.search('query', {
      alpha: 0.5,
      limit: 5,
      folder: 'inbox',
    });

    const semanticOpts = mockSemantic.search.mock.calls[0][1];
    const fullTextOpts = mockFullText.search.mock.calls[0][1];

    expect(semanticOpts.folder).toBe('inbox');
    expect(fullTextOpts.folder).toBe('inbox');
  });
});
