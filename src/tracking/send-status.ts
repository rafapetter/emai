import type { StorageAdapter } from '../core/types.js';
import { ValidationError } from '../core/errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SendStatus = 'queued' | 'sent' | 'delivered' | 'bounced' | 'failed';

export interface SendStatusInfo {
  emailId: string;
  messageId: string;
  status: SendStatus;
  transitions: Array<{
    status: SendStatus;
    timestamp: string;
    details?: string;
  }>;
  lastUpdated: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_INDEX_KEY = 'sendstatus:index';

function storageKey(emailId: string): string {
  return `sendstatus:${emailId}`;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class SendStatusTracker {
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

  private async load(emailId: string): Promise<SendStatusInfo | null> {
    const raw = await this.storage.getMetadata(storageKey(emailId));
    if (!raw) return null;
    return JSON.parse(raw) as SendStatusInfo;
  }

  private async save(info: SendStatusInfo): Promise<void> {
    await this.storage.setMetadata(
      storageKey(info.emailId),
      JSON.stringify(info),
    );
  }

  private async addToIndex(emailId: string): Promise<void> {
    const index = await this.getIndex();
    if (!index.includes(emailId)) {
      index.push(emailId);
      await this.setIndex(index);
    }
  }

  private addTransition(
    info: SendStatusInfo,
    status: SendStatus,
    details?: string,
  ): void {
    const now = new Date().toISOString();
    info.transitions.push({
      status,
      timestamp: now,
      details,
    });
    info.status = status;
    info.lastUpdated = now;
  }

  // ---- Public API ---------------------------------------------------------

  /**
   * Record that an email has been sent. Creates the initial status record
   * with a 'sent' transition.
   */
  async recordSent(emailId: string, messageId: string): Promise<void> {
    if (!emailId) {
      throw new ValidationError('emailId is required');
    }
    if (!messageId) {
      throw new ValidationError('messageId is required');
    }

    const now = new Date().toISOString();
    const info: SendStatusInfo = {
      emailId,
      messageId,
      status: 'sent',
      transitions: [
        {
          status: 'sent',
          timestamp: now,
        },
      ],
      lastUpdated: now,
    };

    await this.save(info);
    await this.addToIndex(emailId);
  }

  /**
   * Record that an email has been delivered successfully.
   */
  async recordDelivered(emailId: string): Promise<void> {
    const info = await this.load(emailId);
    if (!info) {
      throw new ValidationError(`Send status not found for email: ${emailId}`);
    }

    this.addTransition(info, 'delivered');
    await this.save(info);
  }

  /**
   * Record that an email has bounced.
   */
  async recordBounced(emailId: string, reason: string): Promise<void> {
    const info = await this.load(emailId);
    if (!info) {
      throw new ValidationError(`Send status not found for email: ${emailId}`);
    }

    this.addTransition(info, 'bounced', reason);
    await this.save(info);
  }

  /**
   * Record that an email send has failed.
   */
  async recordFailed(emailId: string, reason: string): Promise<void> {
    const info = await this.load(emailId);
    if (!info) {
      throw new ValidationError(`Send status not found for email: ${emailId}`);
    }

    this.addTransition(info, 'failed', reason);
    await this.save(info);
  }

  /**
   * Get the current send status for a given email ID.
   *
   * Returns null if no status record exists.
   */
  async getStatus(emailId: string): Promise<SendStatusInfo | null> {
    return this.load(emailId);
  }

  /**
   * List all emails with a specific send status.
   */
  async listByStatus(status: SendStatus): Promise<SendStatusInfo[]> {
    const index = await this.getIndex();
    const results: SendStatusInfo[] = [];

    for (const emailId of index) {
      const info = await this.load(emailId);
      if (info && info.status === status) {
        results.push(info);
      }
    }

    return results;
  }
}
