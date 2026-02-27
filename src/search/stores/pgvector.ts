import type { VectorStore, VectorEntry, VectorSearchResult } from '../../core/types.js';
import { SearchError } from '../../core/errors.js';
import { tryImport } from '../../core/utils.js';

interface PgClient {
  connect(): Promise<void>;
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  end(): Promise<void>;
}

interface PgModule {
  Client: new (config: { connectionString: string }) => PgClient;
}

export class PgVectorStore implements VectorStore {
  readonly name = 'pgvector';
  private client: PgClient | null = null;
  private connectionString: string;
  private tableName: string;
  private dimensions = 0;

  constructor(connectionString: string, tableName = 'emai_vectors') {
    this.connectionString = connectionString;
    this.tableName = tableName;
  }

  async initialize(dimensions: number): Promise<void> {
    this.dimensions = dimensions;
    const pg = await tryImport<PgModule>('pg', 'PostgreSQL vector store');
    this.client = new pg.Client({ connectionString: this.connectionString });
    await this.client.connect();

    await this.client.query('CREATE EXTENSION IF NOT EXISTS vector');
    await this.client.query(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id TEXT PRIMARY KEY,
        embedding vector(${dimensions}),
        metadata JSONB NOT NULL DEFAULT '{}',
        content TEXT NOT NULL DEFAULT ''
      )
    `);
    await this.client.query(`
      CREATE INDEX IF NOT EXISTS idx_${this.tableName}_embedding
      ON ${this.tableName} USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100)
    `).catch(() => {
      // ivfflat index creation may fail if not enough rows; that's fine
    });
  }

  private getClient(): PgClient {
    if (!this.client) throw new SearchError('PgVectorStore not initialized');
    return this.client;
  }

  async upsert(vectors: VectorEntry[]): Promise<void> {
    const client = this.getClient();

    for (const entry of vectors) {
      const vectorStr = `[${entry.vector.join(',')}]`;
      await client.query(
        `INSERT INTO ${this.tableName} (id, embedding, metadata, content)
         VALUES ($1, $2::vector, $3, $4)
         ON CONFLICT (id) DO UPDATE SET
           embedding = EXCLUDED.embedding,
           metadata = EXCLUDED.metadata,
           content = EXCLUDED.content`,
        [entry.id, vectorStr, JSON.stringify(entry.metadata), entry.content],
      );
    }
  }

  async search(
    vector: number[],
    limit: number,
    filter?: Record<string, unknown>,
  ): Promise<VectorSearchResult[]> {
    const client = this.getClient();
    const vectorStr = `[${vector.join(',')}]`;

    let whereClause = '';
    const params: unknown[] = [vectorStr, limit];

    if (filter) {
      const conditions: string[] = [];
      let paramIdx = 3;
      for (const [key, value] of Object.entries(filter)) {
        if (value === undefined) continue;
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          const rangeFilter = value as Record<string, unknown>;
          if ('$gte' in rangeFilter) {
            conditions.push(`(metadata->>'${key}')::numeric >= $${paramIdx}`);
            params.push(rangeFilter['$gte']);
            paramIdx++;
          }
          if ('$lte' in rangeFilter) {
            conditions.push(`(metadata->>'${key}')::numeric <= $${paramIdx}`);
            params.push(rangeFilter['$lte']);
            paramIdx++;
          }
        } else {
          conditions.push(`metadata->>'${key}' = $${paramIdx}`);
          params.push(String(value));
          paramIdx++;
        }
      }
      if (conditions.length > 0) {
        whereClause = 'WHERE ' + conditions.join(' AND ');
      }
    }

    const result = await client.query(
      `SELECT id, 1 - (embedding <=> $1::vector) as score, metadata, content
       FROM ${this.tableName}
       ${whereClause}
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      params,
    );

    return result.rows.map((row) => ({
      id: row['id'] as string,
      score: row['score'] as number,
      metadata:
        typeof row['metadata'] === 'string'
          ? (JSON.parse(row['metadata'] as string) as Record<string, unknown>)
          : (row['metadata'] as Record<string, unknown>),
      content: row['content'] as string,
    }));
  }

  async delete(ids: string[]): Promise<void> {
    const client = this.getClient();
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    await client.query(`DELETE FROM ${this.tableName} WHERE id IN (${placeholders})`, ids);
  }

  async count(): Promise<number> {
    const client = this.getClient();
    const result = await client.query(`SELECT COUNT(*)::int as cnt FROM ${this.tableName}`);
    return (result.rows[0] as { cnt: number }).cnt;
  }

  async close(): Promise<void> {
    await this.client?.end();
    this.client = null;
  }
}
