import type { VectorStore, VectorEntry, VectorSearchResult } from '../../core/types.js';
import { SearchError } from '../../core/errors.js';
import { tryImport } from '../../core/utils.js';

interface PineconeIndex {
  upsert(vectors: Array<{ id: string; values: number[]; metadata?: Record<string, unknown> }>): Promise<void>;
  query(params: {
    vector: number[];
    topK: number;
    filter?: Record<string, unknown>;
    includeMetadata?: boolean;
  }): Promise<{
    matches?: Array<{
      id: string;
      score?: number;
      metadata?: Record<string, unknown>;
    }>;
  }>;
  deleteMany(ids: string[]): Promise<void>;
  describeIndexStats(): Promise<{ totalRecordCount?: number }>;
}

interface PineconeClient {
  index(name: string): PineconeIndex;
  createIndex(params: {
    name: string;
    dimension: number;
    metric: string;
    spec: { serverless: { cloud: string; region: string } };
  }): Promise<void>;
  listIndexes(): Promise<{ indexes?: Array<{ name: string }> }>;
}

interface PineconeModule {
  Pinecone: new (config: { apiKey: string }) => PineconeClient;
}

export class PineconeVectorStore implements VectorStore {
  readonly name = 'pinecone';
  private index: PineconeIndex | null = null;
  private apiKey: string;
  private indexName: string;
  private environment: string;
  private contentStore = new Map<string, string>();

  constructor(apiKey: string, indexName: string, environment = 'us-east-1') {
    this.apiKey = apiKey;
    this.indexName = indexName;
    this.environment = environment;
  }

  async initialize(dimensions: number): Promise<void> {
    const mod = await tryImport<PineconeModule>(
      '@pinecone-database/pinecone',
      'Pinecone vector store',
    );
    const client = new mod.Pinecone({ apiKey: this.apiKey });

    const existing = await client.listIndexes();
    const indexExists = existing.indexes?.some((idx) => idx.name === this.indexName) ?? false;

    if (!indexExists) {
      await client.createIndex({
        name: this.indexName,
        dimension: dimensions,
        metric: 'cosine',
        spec: { serverless: { cloud: 'aws', region: this.environment } },
      });
    }

    this.index = client.index(this.indexName);
  }

  private getIndex(): PineconeIndex {
    if (!this.index) throw new SearchError('PineconeVectorStore not initialized');
    return this.index;
  }

  async upsert(vectors: VectorEntry[]): Promise<void> {
    const index = this.getIndex();
    const BATCH_SIZE = 100;

    for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
      const batch = vectors.slice(i, i + BATCH_SIZE);
      await index.upsert(
        batch.map((entry) => ({
          id: entry.id,
          values: entry.vector,
          metadata: { ...entry.metadata, _content: entry.content },
        })),
      );
      for (const entry of batch) {
        this.contentStore.set(entry.id, entry.content);
      }
    }
  }

  async search(
    vector: number[],
    limit: number,
    filter?: Record<string, unknown>,
  ): Promise<VectorSearchResult[]> {
    const index = this.getIndex();

    const result = await index.query({
      vector,
      topK: limit,
      filter: filter ? buildPineconeFilter(filter) : undefined,
      includeMetadata: true,
    });

    return (result.matches ?? []).map((match) => {
      const metadata = { ...(match.metadata ?? {}) };
      const content = (metadata['_content'] as string) ?? this.contentStore.get(match.id) ?? '';
      delete metadata['_content'];

      return {
        id: match.id,
        score: match.score ?? 0,
        metadata: metadata as Record<string, unknown>,
        content,
      };
    });
  }

  async delete(ids: string[]): Promise<void> {
    const index = this.getIndex();
    await index.deleteMany(ids);
    for (const id of ids) this.contentStore.delete(id);
  }

  async count(): Promise<number> {
    const index = this.getIndex();
    const stats = await index.describeIndexStats();
    return stats.totalRecordCount ?? 0;
  }

  async close(): Promise<void> {
    this.contentStore.clear();
    this.index = null;
  }
}

function buildPineconeFilter(filter: Record<string, unknown>): Record<string, unknown> {
  const conditions: Record<string, unknown>[] = [];

  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined) continue;

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const rangeFilter = value as Record<string, unknown>;
      if ('$gte' in rangeFilter) conditions.push({ [key]: { $gte: rangeFilter['$gte'] } });
      if ('$lte' in rangeFilter) conditions.push({ [key]: { $lte: rangeFilter['$lte'] } });
      if ('$gt' in rangeFilter) conditions.push({ [key]: { $gt: rangeFilter['$gt'] } });
      if ('$lt' in rangeFilter) conditions.push({ [key]: { $lt: rangeFilter['$lt'] } });
      if ('$in' in rangeFilter) conditions.push({ [key]: { $in: rangeFilter['$in'] } });
    } else {
      conditions.push({ [key]: { $eq: value } });
    }
  }

  if (conditions.length === 1) return conditions[0];
  return { $and: conditions };
}
