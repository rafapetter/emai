import type { StorageAdapter, Email } from '../core/types.js';
import { generateId } from '../core/utils.js';
import { parseBounce, isBounceEmail } from './parser.js';
import type { BounceInfo } from './parser.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StoredBounceInfo extends BounceInfo {
  emailId: string;
  detectedAt: string;
  originalMessageId?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_INDEX_KEY = 'bounce:index';

function storageKey(emailId: string): string {
  return `bounce:${emailId}`;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class BounceEngine {
  constructor(private readonly storage: StorageAdapter) {}

  // ---- Index helpers ------------------------------------------------------

  private async getIndex(): Promise<string[]> {
    const raw = await this.storage.getMetadata(STORAGE_INDEX_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  }

  private async setIndex(ids: string[]): Promise<void> {
    await this.storage.setMetadata(STORAGE_INDEX_KEY, JSON.stringify(ids));
  }

  private async load(emailId: string): Promise<StoredBounceInfo | null> {
    const raw = await this.storage.getMetadata(storageKey(emailId));
    if (!raw) return null;
    return JSON.parse(raw) as StoredBounceInfo;
  }

  private async save(info: StoredBounceInfo): Promise<void> {
    await this.storage.setMetadata(
      storageKey(info.emailId),
      JSON.stringify(info),
    );
  }

  // ---- Public API ---------------------------------------------------------

  /**
   * Detect whether the given email is a bounce message and parse it.
   *
   * This is a thin wrapper around `parseBounce()` for convenience.
   */
  detect(email: Email): BounceInfo | null {
    return parseBounce(email);
  }

  /**
   * Record a bounce event in storage.
   *
   * The `emailId` should be the ID of the bounce notification email itself.
   */
  async recordBounce(emailId: string, info: BounceInfo): Promise<void> {
    const stored: StoredBounceInfo = {
      ...info,
      emailId,
      detectedAt: new Date().toISOString(),
    };

    await this.save(stored);

    const index = await this.getIndex();
    if (!index.includes(emailId)) {
      index.push(emailId);
      await this.setIndex(index);
    }
  }

  /**
   * Check if a specific email has a recorded bounce.
   */
  async check(emailId: string): Promise<StoredBounceInfo | null> {
    return this.load(emailId);
  }

  /**
   * Scan a batch of emails for bounce messages. Any bounces found are
   * automatically recorded in storage.
   *
   * @param emails  The emails to scan.
   * @returns An array of all bounces detected and recorded.
   */
  async scanEmails(emails: Email[]): Promise<StoredBounceInfo[]> {
    const results: StoredBounceInfo[] = [];

    for (const email of emails) {
      if (!isBounceEmail(email)) continue;

      const bounceInfo = parseBounce(email);
      if (!bounceInfo) continue;

      const stored: StoredBounceInfo = {
        ...bounceInfo,
        emailId: email.id,
        detectedAt: new Date().toISOString(),
        originalMessageId: email.headers.inReplyTo,
      };

      await this.save(stored);

      const index = await this.getIndex();
      if (!index.includes(email.id)) {
        index.push(email.id);
        await this.setIndex(index);
      }

      results.push(stored);
    }

    return results;
  }

  /**
   * List all recorded bounces.
   */
  async list(): Promise<StoredBounceInfo[]> {
    const index = await this.getIndex();
    const bounces: StoredBounceInfo[] = [];

    for (const emailId of index) {
      const bounce = await this.load(emailId);
      if (bounce) bounces.push(bounce);
    }

    return bounces;
  }
}
