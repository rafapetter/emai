import type {
  Email,
  Thread,
  ListEmailsOptions,
  ListResult,
} from '../core/types.js';
import { SearchError } from '../core/errors.js';
import { tryImport } from '../core/utils.js';
import { BaseStorageAdapter } from './store.js';

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

export class SqliteStorage extends BaseStorageAdapter {
  readonly name = 'sqlite';
  private db: BetterSqlite3Database | null = null;
  private dbPath: string;

  constructor(path = ':memory:') {
    super();
    this.dbPath = path;
  }

  async initialize(): Promise<void> {
    const mod = await tryImport<BetterSqlite3Module>('better-sqlite3', 'SQLite storage');
    const Database = mod.default;
    this.db = new Database(this.dbPath);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS emails (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        folder TEXT,
        from_address TEXT,
        subject TEXT,
        date INTEGER,
        thread_id TEXT,
        is_read INTEGER DEFAULT 0,
        is_starred INTEGER DEFAULT 0,
        has_attachments INTEGER DEFAULT 0
      )
    `);

    this.db.exec('CREATE INDEX IF NOT EXISTS idx_emails_date ON emails(date)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_emails_from ON emails(from_address)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_emails_folder ON emails(folder)');
    this.db.exec('CREATE INDEX IF NOT EXISTS idx_emails_thread ON emails(thread_id)');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL
      )
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
  }

  private getDb(): BetterSqlite3Database {
    if (!this.db) throw new SearchError('SqliteStorage not initialized');
    return this.db;
  }

  async getEmail(id: string): Promise<Email | null> {
    const db = this.getDb();
    const row = db.prepare('SELECT data FROM emails WHERE id = ?').get(id) as
      | { data: string }
      | undefined;
    if (!row) return null;
    return deserializeEmail(row.data);
  }

  async saveEmail(email: Email): Promise<void> {
    const db = this.getDb();
    db.prepare(
      `INSERT OR REPLACE INTO emails
        (id, data, folder, from_address, subject, date, thread_id, is_read, is_starred, has_attachments)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      email.id,
      serializeEmail(email),
      email.folder,
      email.from.address,
      email.subject,
      email.date.getTime(),
      email.threadId ?? null,
      email.isRead ? 1 : 0,
      email.isStarred ? 1 : 0,
      email.attachments.length > 0 ? 1 : 0,
    );
  }

  async saveEmails(emails: Email[]): Promise<void> {
    const db = this.getDb();
    const stmt = db.prepare(
      `INSERT OR REPLACE INTO emails
        (id, data, folder, from_address, subject, date, thread_id, is_read, is_starred, has_attachments)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    for (const email of emails) {
      stmt.run(
        email.id,
        serializeEmail(email),
        email.folder,
        email.from.address,
        email.subject,
        email.date.getTime(),
        email.threadId ?? null,
        email.isRead ? 1 : 0,
        email.isStarred ? 1 : 0,
        email.attachments.length > 0 ? 1 : 0,
      );
    }
  }

  async deleteEmail(id: string): Promise<void> {
    const db = this.getDb();
    db.prepare('DELETE FROM emails WHERE id = ?').run(id);
  }

  async listEmails(options: ListEmailsOptions = {}): Promise<ListResult<Email>> {
    const db = this.getDb();
    const { clauses, params } = buildFilterClauses(options);

    let countSql = 'SELECT COUNT(*) as cnt FROM emails';
    let querySql = 'SELECT data FROM emails';

    if (clauses.length > 0) {
      const where = ' WHERE ' + clauses.join(' AND ');
      countSql += where;
      querySql += where;
    }

    const sortBy = options.sortBy ?? 'date';
    const sortOrder = options.sortOrder === 'asc' ? 'ASC' : 'DESC';
    const orderColumn = sortBy === 'from' ? 'from_address' : sortBy;
    querySql += ` ORDER BY ${orderColumn} ${sortOrder}`;

    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;
    querySql += ` LIMIT ? OFFSET ?`;

    const countRow = db.prepare(countSql).get(...params) as { cnt: number };
    const total = countRow.cnt;

    const rows = db.prepare(querySql).all(...params, limit, offset) as Array<{ data: string }>;
    const items = rows.map((row) => deserializeEmail(row.data));

    return {
      items,
      total,
      hasMore: offset + items.length < total,
    };
  }

  async getThread(threadId: string): Promise<Thread | null> {
    const db = this.getDb();
    const row = db.prepare('SELECT data FROM threads WHERE id = ?').get(threadId) as
      | { data: string }
      | undefined;
    if (!row) return null;
    return deserializeThread(row.data);
  }

  async saveThread(thread: Thread): Promise<void> {
    const db = this.getDb();
    db.prepare('INSERT OR REPLACE INTO threads (id, data) VALUES (?, ?)').run(
      thread.id,
      JSON.stringify(thread, dateReplacer),
    );
  }

  async getMetadata(key: string): Promise<string | null> {
    const db = this.getDb();
    const row = db.prepare('SELECT value FROM metadata WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  async setMetadata(key: string, value: string): Promise<void> {
    const db = this.getDb();
    db.prepare('INSERT OR REPLACE INTO metadata (key, value) VALUES (?, ?)').run(key, value);
  }

  async close(): Promise<void> {
    this.db?.close();
    this.db = null;
  }
}

function serializeEmail(email: Email): string {
  return JSON.stringify(email, dateReplacer);
}

function deserializeEmail(data: string): Email {
  return JSON.parse(data, dateReviver) as Email;
}

function deserializeThread(data: string): Thread {
  return JSON.parse(data, dateReviver) as Thread;
}

function dateReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Date) return { __date: value.toISOString() };
  return value;
}

function dateReviver(_key: string, value: unknown): unknown {
  if (typeof value === 'object' && value !== null && '__date' in value) {
    return new Date((value as { __date: string }).__date);
  }
  return value;
}

interface FilterResult {
  clauses: string[];
  params: unknown[];
}

function buildFilterClauses(options: ListEmailsOptions): FilterResult {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (options.folder) {
    clauses.push('folder = ?');
    params.push(options.folder);
  }
  if (options.from) {
    clauses.push('from_address LIKE ?');
    params.push(`%${options.from}%`);
  }
  if (options.to) {
    clauses.push("data LIKE ?");
    params.push(`%${options.to}%`);
  }
  if (options.subject) {
    clauses.push('subject LIKE ?');
    params.push(`%${options.subject}%`);
  }
  if (options.after) {
    clauses.push('date >= ?');
    params.push(options.after.getTime());
  }
  if (options.before) {
    clauses.push('date <= ?');
    params.push(options.before.getTime());
  }
  if (options.isRead !== undefined) {
    clauses.push('is_read = ?');
    params.push(options.isRead ? 1 : 0);
  }
  if (options.isStarred !== undefined) {
    clauses.push('is_starred = ?');
    params.push(options.isStarred ? 1 : 0);
  }
  if (options.hasAttachment !== undefined) {
    clauses.push('has_attachments = ?');
    params.push(options.hasAttachment ? 1 : 0);
  }
  if (options.query) {
    clauses.push('(subject LIKE ? OR data LIKE ?)');
    params.push(`%${options.query}%`, `%${options.query}%`);
  }
  if (options.label) {
    clauses.push("data LIKE ?");
    params.push(`%${options.label}%`);
  }

  return { clauses, params };
}
