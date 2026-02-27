import type { VectorStore, VectorEntry, VectorSearchResult } from '../../core/types.js';
import { cosineSimilarity } from '../../core/utils.js';

export class MemoryVectorStore implements VectorStore {
  readonly name = 'memory';
  private vectors = new Map<string, VectorEntry>();
  private dimensions = 0;

  async initialize(dimensions: number): Promise<void> {
    this.dimensions = dimensions;
  }

  async upsert(vectors: VectorEntry[]): Promise<void> {
    for (const entry of vectors) {
      this.vectors.set(entry.id, entry);
    }
  }

  async search(
    vector: number[],
    limit: number,
    filter?: Record<string, unknown>,
  ): Promise<VectorSearchResult[]> {
    const scored: VectorSearchResult[] = [];

    for (const entry of this.vectors.values()) {
      if (filter && !matchesFilter(entry.metadata, filter)) continue;

      const score = cosineSimilarity(vector, entry.vector);
      scored.push({
        id: entry.id,
        score,
        metadata: entry.metadata,
        content: entry.content,
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  async delete(ids: string[]): Promise<void> {
    for (const id of ids) {
      this.vectors.delete(id);
    }
  }

  async count(): Promise<number> {
    return this.vectors.size;
  }

  async close(): Promise<void> {
    this.vectors.clear();
  }
}

function matchesFilter(
  metadata: Record<string, unknown>,
  filter: Record<string, unknown>,
): boolean {
  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined) continue;

    const metaVal = metadata[key];

    if (Array.isArray(value)) {
      if (!value.includes(metaVal)) return false;
    } else if (typeof value === 'object' && value !== null) {
      const rangeFilter = value as Record<string, unknown>;
      if ('$gte' in rangeFilter && (metaVal as number) < (rangeFilter['$gte'] as number))
        return false;
      if ('$lte' in rangeFilter && (metaVal as number) > (rangeFilter['$lte'] as number))
        return false;
      if ('$gt' in rangeFilter && (metaVal as number) <= (rangeFilter['$gt'] as number))
        return false;
      if ('$lt' in rangeFilter && (metaVal as number) < (rangeFilter['$lt'] as number))
        return false;
      if ('$in' in rangeFilter) {
        const arr = rangeFilter['$in'] as unknown[];
        if (!arr.includes(metaVal)) return false;
      }
      if ('$contains' in rangeFilter) {
        if (!Array.isArray(metaVal) || !metaVal.includes(rangeFilter['$contains']))
          return false;
      }
    } else {
      if (metaVal !== value) return false;
    }
  }
  return true;
}
