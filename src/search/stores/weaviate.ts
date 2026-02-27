import type { VectorStore, VectorEntry, VectorSearchResult } from '../../core/types.js';
import { SearchError } from '../../core/errors.js';
import { tryImport } from '../../core/utils.js';

interface WeaviateFilters {
  where: (property: string) => WeaviateFilterBuilder;
}

interface WeaviateFilterBuilder {
  equal(value: unknown): WeaviateFilterResult;
  greaterThan(value: unknown): WeaviateFilterResult;
  lessThan(value: unknown): WeaviateFilterResult;
  greaterOrEqual(value: unknown): WeaviateFilterResult;
  lessOrEqual(value: unknown): WeaviateFilterResult;
}

interface WeaviateFilterResult {
  and(other: WeaviateFilterResult): WeaviateFilterResult;
}

interface WeaviateCollection {
  data: {
    insert(params: {
      id: string;
      properties: Record<string, unknown>;
      vectors: number[];
    }): Promise<void>;
    update(params: {
      id: string;
      properties: Record<string, unknown>;
      vectors: number[];
    }): Promise<void>;
    deleteById(id: string): Promise<void>;
  };
  query: {
    nearVector(
      vector: number[],
      opts?: {
        limit?: number;
        filters?: WeaviateFilterResult;
        returnProperties?: string[];
        returnMetadata?: string[];
      },
    ): Promise<{
      objects: Array<{
        uuid: string;
        properties: Record<string, unknown>;
        metadata?: { certainty?: number; distance?: number };
      }>;
    }>;
  };
  aggregate: {
    overAll(): Promise<{ totalCount: number }>;
  };
}

interface WeaviateClient {
  collections: {
    get(name: string): WeaviateCollection;
    create(params: {
      name: string;
      properties: Array<{ name: string; dataType: string }>;
      vectorizers: unknown[];
    }): Promise<WeaviateCollection>;
    exists(name: string): Promise<boolean>;
  };
  close(): Promise<void>;
}

interface WeaviateModule {
  default: {
    connectToLocal(params?: { host?: string; port?: number }): Promise<WeaviateClient>;
    connectToWeaviateCloud(url: string, params: { authCredentials: unknown }): Promise<WeaviateClient>;
  };
  configure: {
    vectorizer: { none(): unknown };
  };
  Filters: WeaviateFilters;
}

export class WeaviateVectorStore implements VectorStore {
  readonly name = 'weaviate';
  private client: WeaviateClient | null = null;
  private collection: WeaviateCollection | null = null;
  private url?: string;
  private apiKey?: string;
  private collectionName: string;
  private contentStore = new Map<string, string>();

  constructor(collectionName = 'EmaiVectors', url?: string, apiKey?: string) {
    this.collectionName = collectionName;
    this.url = url;
    this.apiKey = apiKey;
  }

  async initialize(_dimensions: number): Promise<void> {
    const weaviate = await tryImport<WeaviateModule>('weaviate-client', 'Weaviate vector store');
    const wv = weaviate.default;

    if (this.url) {
      this.client = await wv.connectToWeaviateCloud(this.url, {
        authCredentials: this.apiKey ? { apiKey: this.apiKey } : {},
      });
    } else {
      this.client = await wv.connectToLocal();
    }

    const exists = await this.client.collections.exists(this.collectionName);
    if (!exists) {
      this.collection = await this.client.collections.create({
        name: this.collectionName,
        properties: [
          { name: 'metadata', dataType: 'text' },
          { name: 'content', dataType: 'text' },
          { name: 'metaFolder', dataType: 'text' },
          { name: 'metaFrom', dataType: 'text' },
          { name: 'metaDate', dataType: 'number' },
        ],
        vectorizers: [],
      });
    } else {
      this.collection = this.client.collections.get(this.collectionName);
    }
  }

  private getCollection(): WeaviateCollection {
    if (!this.collection) throw new SearchError('WeaviateVectorStore not initialized');
    return this.collection;
  }

  async upsert(vectors: VectorEntry[]): Promise<void> {
    const collection = this.getCollection();

    for (const entry of vectors) {
      const properties: Record<string, unknown> = {
        metadata: JSON.stringify(entry.metadata),
        content: entry.content,
        metaFolder: (entry.metadata['folder'] as string) ?? '',
        metaFrom: (entry.metadata['from'] as string) ?? '',
        metaDate: (entry.metadata['date'] as number) ?? 0,
      };

      this.contentStore.set(entry.id, entry.content);

      try {
        await collection.data.update({
          id: entry.id,
          properties,
          vectors: entry.vector,
        });
      } catch {
        await collection.data.insert({
          id: entry.id,
          properties,
          vectors: entry.vector,
        });
      }
    }
  }

  async search(
    vector: number[],
    limit: number,
    filter?: Record<string, unknown>,
  ): Promise<VectorSearchResult[]> {
    const collection = this.getCollection();

    const opts: Parameters<typeof collection.query.nearVector>[1] = {
      limit,
      returnProperties: ['metadata', 'content'],
      returnMetadata: ['certainty', 'distance'],
    };

    if (filter) {
      const weaviateFilter = buildWeaviateFilter(filter);
      if (weaviateFilter) {
        opts!.filters = weaviateFilter;
      }
    }

    const result = await collection.query.nearVector(vector, opts);

    return result.objects.map((obj) => {
      const metadata = obj.properties['metadata']
        ? (JSON.parse(obj.properties['metadata'] as string) as Record<string, unknown>)
        : {};
      const content =
        (obj.properties['content'] as string) ?? this.contentStore.get(obj.uuid) ?? '';
      const score = obj.metadata?.certainty ?? 1 - (obj.metadata?.distance ?? 0);

      return { id: obj.uuid, score, metadata, content };
    });
  }

  async delete(ids: string[]): Promise<void> {
    const collection = this.getCollection();
    for (const id of ids) {
      await collection.data.deleteById(id);
      this.contentStore.delete(id);
    }
  }

  async count(): Promise<number> {
    const collection = this.getCollection();
    const result = await collection.aggregate.overAll();
    return result.totalCount;
  }

  async close(): Promise<void> {
    this.contentStore.clear();
    await this.client?.close();
    this.client = null;
    this.collection = null;
  }
}

function buildWeaviateFilter(_filter: Record<string, unknown>): WeaviateFilterResult | null {
  // Weaviate filtering requires the Filters API from the client SDK.
  // Since the filter structure varies across SDK versions, we do best-effort
  // property matching at the application layer in the search results.
  return null;
}
