import type {
  Email,
  Thread,
  ListEmailsOptions,
  ListResult,
} from '../core/types.js';
import { BaseStorageAdapter } from './store.js';

export class MemoryStorage extends BaseStorageAdapter {
  readonly name = 'memory';
  private emails = new Map<string, Email>();
  private threads = new Map<string, Thread>();
  private metadata = new Map<string, string>();

  async initialize(): Promise<void> {}

  async getEmail(id: string): Promise<Email | null> {
    return this.emails.get(id) ?? null;
  }

  async saveEmail(email: Email): Promise<void> {
    this.emails.set(email.id, email);
  }

  async saveEmails(emails: Email[]): Promise<void> {
    for (const email of emails) {
      this.emails.set(email.id, email);
    }
  }

  async deleteEmail(id: string): Promise<void> {
    this.emails.delete(id);
  }

  async listEmails(options: ListEmailsOptions = {}): Promise<ListResult<Email>> {
    let items = [...this.emails.values()];
    items = applyFilters(items, options);
    items = applySort(items, options);

    const total = items.length;
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 50;

    items = items.slice(offset, offset + limit);

    return {
      items,
      total,
      hasMore: offset + items.length < total,
    };
  }

  async getThread(threadId: string): Promise<Thread | null> {
    return this.threads.get(threadId) ?? null;
  }

  async saveThread(thread: Thread): Promise<void> {
    this.threads.set(thread.id, thread);
  }

  async getMetadata(key: string): Promise<string | null> {
    return this.metadata.get(key) ?? null;
  }

  async setMetadata(key: string, value: string): Promise<void> {
    this.metadata.set(key, value);
  }

  async close(): Promise<void> {
    this.emails.clear();
    this.threads.clear();
    this.metadata.clear();
  }
}

function applyFilters(emails: Email[], options: ListEmailsOptions): Email[] {
  return emails.filter((email) => {
    if (options.folder && email.folder !== options.folder) return false;
    if (options.label && !email.labels.includes(options.label)) return false;
    if (options.from && !email.from.address.toLowerCase().includes(options.from.toLowerCase()))
      return false;
    if (options.to) {
      const match = email.to.some((a) =>
        a.address.toLowerCase().includes(options.to!.toLowerCase()),
      );
      if (!match) return false;
    }
    if (options.subject && !email.subject.toLowerCase().includes(options.subject.toLowerCase()))
      return false;
    if (options.after && email.date < options.after) return false;
    if (options.before && email.date > options.before) return false;
    if (options.hasAttachment !== undefined && (email.attachments.length > 0) !== options.hasAttachment)
      return false;
    if (options.isRead !== undefined && email.isRead !== options.isRead) return false;
    if (options.isStarred !== undefined && email.isStarred !== options.isStarred) return false;
    if (options.query) {
      const q = options.query.toLowerCase();
      const searchable = `${email.subject} ${email.body.text ?? ''} ${email.from.address}`.toLowerCase();
      if (!searchable.includes(q)) return false;
    }
    return true;
  });
}

function applySort(emails: Email[], options: ListEmailsOptions): Email[] {
  const sortBy = options.sortBy ?? 'date';
  const sortOrder = options.sortOrder ?? 'desc';
  const multiplier = sortOrder === 'asc' ? 1 : -1;

  return emails.sort((a, b) => {
    switch (sortBy) {
      case 'date':
        return multiplier * (a.date.getTime() - b.date.getTime());
      case 'subject':
        return multiplier * a.subject.localeCompare(b.subject);
      case 'from':
        return multiplier * a.from.address.localeCompare(b.from.address);
      default:
        return 0;
    }
  });
}
