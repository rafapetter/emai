import type { VectorStore, VectorEntry, VectorSearchResult } from '../../core/types.js';
import { SearchError } from '../../core/errors.js';
import { tryImport, cosineSimilarity } from '../../core/utils.js';

interface BetterSqlite3Database {
  prepare(sql: string): BetterSqlite3Statement;
  exec(sql: string): void;
  close(): void;
}

interface BetterSqlite3Statement {
  run(...params: unknown[]): { changes: number };
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
}

interface BetterSqlite3Module {
  default: new (path: string) => BetterSqlite3Database;
}

export class SqliteVectorStore implements VectorStore {
  readonly name = 'sqlite';
  private db: BetterSqlite3Database | null = null;
  private dbPath: string;
  private dimensions = 0;

  constructor(path = ':memory:') {
    this.dbPath = path;
  }

  async initialize(dimensions: number): Promise<void> {
    this.dimensions = dimensions;
    const mod = await tryImport<BetterSqlite3Module>('better-sqlite3', 'SQLite vector store');
    const Database = mod.default;
    this.db = new Database(this.dbPath);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS vectors (
        id TEXT PRIMARY KEY,
        vector TEXT NOT NULL,
        metadata TEXT NOT NULL,
        content TEXT NOT NULL
      )
    `);
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_vectors_id ON vectors(id)');
  }

  private getDb(): BetterSqlite3Database {
    if (!this.db) throw new SearchError('SqliteVectorStore not initialized');
    return this.db;
  }

  async upsert(vectors: VectorEntry[]): Promise<void> {
    const db = this.getDb();
    const stmt = db.prepare(
      'INSERT OR REPLACE INTO vectors (id, vector, metadata, content) VALUES (?, ?, ?, ?)',
    );

    for (const entry of vectors) {
      stmt.run(
        entry.id,
        JSON.stringify(entry.vector),
        JSON.stringify(entry.metadata),
        entry.content,
      );
    }
  }

  async search(
    vector: number[],
    limit: number,
    filter?: Record<string, unknown>,
  ): Promise<VectorSearchResult[]> {
    const db = this.getDb();

    let sql = 'SELECT id, vector, metadata, content FROM vectors';
    const params: unknown[] = [];

    if (filter) {
      const clauses = buildSqlWhereClauses(filter);
      if (clauses.length > 0) {
        sql += ' WHERE ' + clauses.map((c) => c.clause).join(' AND ');
        for (const c of clauses) params.push(...c.params);
      }
    }

    const rows = db.prepare(sql).all(...params) as Array<{
      id: string;
      vector: string;
      metadata: string;
      content: string;
    }>;

    const scored: VectorSearchResult[] = rows.map((row) => {
      const storedVector = JSON.parse(row.vector) as number[];
      const score = cosineSimilarity(vector, storedVector);
      return {
        id: row.id,
        score,
        metadata: JSON.parse(row.metadata) as Record<string, unknown>,
        content: row.content,
      };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  async delete(ids: string[]): Promise<void> {
    const db = this.getDb();
    const placeholders = ids.map(() => '?').join(',');
    db.prepare(`DELETE FROM vectors WHERE id IN (${placeholders})`).run(...ids);
  }

  async count(): Promise<number> {
    const db = this.getDb();
    const row = db.prepare('SELECT COUNT(*) as cnt FROM vectors').get() as { cnt: number };
    return row.cnt;
  }

  async close(): Promise<void> {
    this.db?.close();
    this.db = null;
  }
}

interface WhereClause {
  clause: string;
  params: unknown[];
}

function buildSqlWhereClauses(filter: Record<string, unknown>): WhereClause[] {
  const clauses: WhereClause[] = [];

  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined) continue;

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      clauses.push({
        clause: `json_extract(metadata, '$.${key}') = ?`,
        params: [value],
      });
    } else if (typeof value === 'object' && value !== null) {
      const rangeFilter = value as Record<string, unknown>;
      if ('$gte' in rangeFilter) {
        clauses.push({
          clause: `json_extract(metadata, '$.${key}') >= ?`,
          params: [rangeFilter['$gte']],
        });
      }
      if ('$lte' in rangeFilter) {
        clauses.push({
          clause: `json_extract(metadata, '$.${key}') <= ?`,
          params: [rangeFilter['$lte']],
        });
      }
      if ('$gt' in rangeFilter) {
        clauses.push({
          clause: `json_extract(metadata, '$.${key}') > ?`,
          params: [rangeFilter['$gt']],
        });
      }
      if ('$lt' in rangeFilter) {
        clauses.push({
          clause: `json_extract(metadata, '$.${key}') < ?`,
          params: [rangeFilter['$lt']],
        });
      }
    }
  }

  return clauses;
}
