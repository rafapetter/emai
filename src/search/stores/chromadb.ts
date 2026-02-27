import type { VectorStore, VectorEntry, VectorSearchResult } from '../../core/types.js';
import { SearchError } from '../../core/errors.js';
import { tryImport } from '../../core/utils.js';

interface ChromaCollection {
  add(params: {
    ids: string[];
    embeddings: number[][];
    metadatas?: Array<Record<string, unknown>>;
    documents?: string[];
  }): Promise<void>;
  update(params: {
    ids: string[];
    embeddings?: number[][];
    metadatas?: Array<Record<string, unknown>>;
    documents?: string[];
  }): Promise<void>;
  upsert(params: {
    ids: string[];
    embeddings: number[][];
    metadatas?: Array<Record<string, unknown>>;
    documents?: string[];
  }): Promise<void>;
  query(params: {
    queryEmbeddings: number[][];
    nResults?: number;
    where?: Record<string, unknown>;
  }): Promise<{
    ids: string[][];
    distances?: number[][];
    metadatas?: Array<Array<Record<string, unknown> | null>>;
    documents?: Array<Array<string | null>>;
  }>;
  delete(params: { ids: string[] }): Promise<void>;
  count(): Promise<number>;
}

interface ChromaClient {
  getOrCreateCollection(params: {
    name: string;
    metadata?: Record<string, unknown>;
  }): Promise<ChromaCollection>;
}

interface ChromaModule {
  ChromaClient: new (params?: { path?: string }) => ChromaClient;
}

export class ChromaDBVectorStore implements VectorStore {
  readonly name = 'chromadb';
  private collection: ChromaCollection | null = null;
  private chromaPath?: string;
  private collectionName: string;

  constructor(collectionName = 'emai_emails', path?: string) {
    this.collectionName = collectionName;
    this.chromaPath = path;
  }

  async initialize(_dimensions: number): Promise<void> {
    const chromadb = await tryImport<ChromaModule>('chromadb', 'ChromaDB vector store');
    const client = new chromadb.ChromaClient(
      this.chromaPath ? { path: this.chromaPath } : undefined,
    );
    this.collection = await client.getOrCreateCollection({
      name: this.collectionName,
      metadata: { 'hnsw:space': 'cosine' },
    });
  }

  private getCollection(): ChromaCollection {
    if (!this.collection) throw new SearchError('ChromaDBVectorStore not initialized');
    return this.collection;
  }

  async upsert(vectors: VectorEntry[]): Promise<void> {
    const collection = this.getCollection();
    const BATCH_SIZE = 100;

    for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
      const batch = vectors.slice(i, i + BATCH_SIZE);
      await collection.upsert({
        ids: batch.map((v) => v.id),
        embeddings: batch.map((v) => v.vector),
        metadatas: batch.map((v) => flattenMetadata(v.metadata)),
        documents: batch.map((v) => v.content),
      });
    }
  }

  async search(
    vector: number[],
    limit: number,
    filter?: Record<string, unknown>,
  ): Promise<VectorSearchResult[]> {
    const collection = this.getCollection();

    const queryParams: Parameters<typeof collection.query>[0] = {
      queryEmbeddings: [vector],
      nResults: limit,
    };

    if (filter) {
      const chromaFilter = buildChromaFilter(filter);
      if (chromaFilter) queryParams.where = chromaFilter;
    }

    const result = await collection.query(queryParams);

    const ids = result.ids[0] ?? [];
    const distances = result.distances?.[0] ?? [];
    const metadatas = result.metadatas?.[0] ?? [];
    const documents = result.documents?.[0] ?? [];

    return ids.map((id, idx) => ({
      id,
      score: 1 - (distances[idx] ?? 0),
      metadata: (metadatas[idx] ?? {}) as Record<string, unknown>,
      content: documents[idx] ?? '',
    }));
  }

  async delete(ids: string[]): Promise<void> {
    const collection = this.getCollection();
    await collection.delete({ ids });
  }

  async count(): Promise<number> {
    const collection = this.getCollection();
    return collection.count();
  }

  async close(): Promise<void> {
    this.collection = null;
  }
}

function flattenMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      flat[key] = value;
    } else if (value !== null && value !== undefined) {
      flat[key] = JSON.stringify(value);
    }
  }
  return flat;
}

function buildChromaFilter(filter: Record<string, unknown>): Record<string, unknown> | null {
  const conditions: Record<string, unknown>[] = [];

  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined) continue;

    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const rangeFilter = value as Record<string, unknown>;
      if ('$gte' in rangeFilter) conditions.push({ [key]: { $gte: rangeFilter['$gte'] } });
      if ('$lte' in rangeFilter) conditions.push({ [key]: { $lte: rangeFilter['$lte'] } });
      if ('$gt' in rangeFilter) conditions.push({ [key]: { $gt: rangeFilter['$gt'] } });
      if ('$lt' in rangeFilter) conditions.push({ [key]: { $lt: rangeFilter['$lt'] } });
    } else {
      conditions.push({ [key]: { $eq: value } });
    }
  }

  if (conditions.length === 0) return null;
  if (conditions.length === 1) return conditions[0];
  return { $and: conditions };
}
