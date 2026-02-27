import type {
  Email,
  Thread,
  ListEmailsOptions,
  ListResult,
  StorageAdapter,
} from '../core/types.js';

export abstract class BaseStorageAdapter implements StorageAdapter {
  abstract readonly name: string;

  abstract initialize(): Promise<void>;
  abstract getEmail(id: string): Promise<Email | null>;
  abstract saveEmail(email: Email): Promise<void>;
  abstract deleteEmail(id: string): Promise<void>;
  abstract listEmails(options?: ListEmailsOptions): Promise<ListResult<Email>>;
  abstract getThread(threadId: string): Promise<Thread | null>;
  abstract saveThread(thread: Thread): Promise<void>;
  abstract getMetadata(key: string): Promise<string | null>;
  abstract setMetadata(key: string, value: string): Promise<void>;
  abstract close(): Promise<void>;

  async saveEmails(emails: Email[]): Promise<void> {
    for (const email of emails) {
      await this.saveEmail(email);
    }
  }
}
