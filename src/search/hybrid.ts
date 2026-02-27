import type { SearchResult, HybridSearchOptions } from '../core/types.js';
import type { SemanticSearch } from './semantic.js';
import type { FullTextSearch } from './full-text.js';

const RRF_K = 60;

export class HybridSearch {
  constructor(
    private semantic: SemanticSearch,
    private fullText: FullTextSearch,
  ) {}

  async search(query: string, options: HybridSearchOptions = {}): Promise<SearchResult[]> {
    const { alpha = 0.5, limit = 10, ...searchOptions } = options;
    const fetchLimit = limit * 3;

    const [semanticResults, fullTextResults] = await Promise.all([
      alpha > 0
        ? this.semantic.search(query, { ...searchOptions, limit: fetchLimit })
        : Promise.resolve([]),
      alpha < 1
        ? this.fullText.search(query, { ...searchOptions, limit: fetchLimit })
        : Promise.resolve([]),
    ]);

    return reciprocalRankFusion(semanticResults, fullTextResults, alpha, limit);
  }
}

function reciprocalRankFusion(
  semanticResults: SearchResult[],
  fullTextResults: SearchResult[],
  alpha: number,
  limit: number,
): SearchResult[] {
  const scores = new Map<string, { score: number; result: SearchResult }>();

  for (let i = 0; i < semanticResults.length; i++) {
    const result = semanticResults[i];
    const rrfScore = alpha * (1 / (RRF_K + i + 1));
    scores.set(result.email.id, {
      score: rrfScore,
      result: { ...result, matchType: 'hybrid' },
    });
  }

  for (let i = 0; i < fullTextResults.length; i++) {
    const result = fullTextResults[i];
    const rrfScore = (1 - alpha) * (1 / (RRF_K + i + 1));
    const existing = scores.get(result.email.id);

    if (existing) {
      existing.score += rrfScore;
      existing.result.highlights = mergeHighlights(
        existing.result.highlights,
        result.highlights,
      );
    } else {
      scores.set(result.email.id, {
        score: rrfScore,
        result: { ...result, matchType: 'hybrid' },
      });
    }
  }

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score, result }) => ({ ...result, score }));
}

function mergeHighlights(
  a: string[] | undefined,
  b: string[] | undefined,
): string[] {
  const set = new Set<string>();
  for (const h of a ?? []) set.add(h);
  for (const h of b ?? []) set.add(h);
  return [...set].slice(0, 5);
}
