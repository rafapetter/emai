import type { StorageAdapter, EmailProvider } from '../core/types.js';
import { ValidationError } from '../core/errors.js';
import { sleep } from '../core/utils.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SnoozedEmail {
  emailId: string;
  snoozedAt: string;
  snoozeUntil: string;
  originalFolder: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_INDEX_KEY = 'snooze:index';
const DEFAULT_CHECK_INTERVAL_MS = 60_000;
const SNOOZED_FOLDER = 'snoozed';

function storageKey(emailId: string): string {
  return `snooze:${emailId}`;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class SnoozeEngine {
  private abortController: AbortController | null = null;

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

  // ---- Public API ---------------------------------------------------------

  /**
   * Snooze an email until the specified time.
   *
   * Moves the email to a "snoozed" folder via the provider and records
   * metadata so that it can be resurfaced later.
   */
  async snooze(
    emailId: string,
    until: Date,
    provider: EmailProvider,
    originalFolder = 'inbox',
  ): Promise<void> {
    if (!(until instanceof Date) || isNaN(until.getTime())) {
      throw new ValidationError('A valid "until" Date is required');
    }

    if (until.getTime() <= Date.now()) {
      throw new ValidationError('Snooze time must be in the future');
    }

    // Check for duplicate
    const existing = await this.storage.getMetadata(storageKey(emailId));
    if (existing) {
      throw new ValidationError(`Email ${emailId} is already snoozed`);
    }

    // Move the email to the snoozed folder via the provider
    try {
      await provider.moveToFolder(emailId, SNOOZED_FOLDER);
    } catch {
      // If the provider doesn't support the folder or the move fails we
      // still record the snooze — the metadata is the source of truth.
    }

    const entry: SnoozedEmail = {
      emailId,
      snoozedAt: new Date().toISOString(),
      snoozeUntil: until.toISOString(),
      originalFolder,
    };

    await this.storage.setMetadata(storageKey(emailId), JSON.stringify(entry));

    const index = await this.getIndex();
    if (!index.includes(emailId)) {
      index.push(emailId);
      await this.setIndex(index);
    }
  }

  /**
   * Manually unsnooze an email, removing it from the snooze index.
   *
   * Marks the email as unread so it reappears in the user's attention.
   * Does NOT attempt to move the email back to its original folder — not all
   * providers support that operation reliably.
   */
  async unsnooze(emailId: string, provider: EmailProvider): Promise<void> {
    const raw = await this.storage.getMetadata(storageKey(emailId));
    if (!raw) {
      throw new ValidationError(`Email ${emailId} is not snoozed`);
    }

    // Mark as unread so the email resurfaces
    try {
      await provider.markAsUnread(emailId);
    } catch {
      // Best-effort — some providers may reject if the email was deleted
    }

    // Remove from storage
    await this.storage.setMetadata(storageKey(emailId), '');

    const index = await this.getIndex();
    const filtered = index.filter((id) => id !== emailId);
    await this.setIndex(filtered);
  }

  /**
   * List all currently snoozed emails.
   */
  async listSnoozed(): Promise<SnoozedEmail[]> {
    const index = await this.getIndex();
    const results: SnoozedEmail[] = [];

    for (const emailId of index) {
      const raw = await this.storage.getMetadata(storageKey(emailId));
      if (raw) {
        results.push(JSON.parse(raw) as SnoozedEmail);
      }
    }

    return results;
  }

  /**
   * Return email IDs whose snooze time has passed and remove them from
   * storage. The caller is responsible for emitting events / notifying.
   */
  async checkDue(): Promise<string[]> {
    const now = Date.now();
    const index = await this.getIndex();
    const dueIds: string[] = [];

    for (const emailId of index) {
      const raw = await this.storage.getMetadata(storageKey(emailId));
      if (!raw) continue;

      const entry = JSON.parse(raw) as SnoozedEmail;
      if (new Date(entry.snoozeUntil).getTime() <= now) {
        dueIds.push(emailId);
      }
    }

    // Remove due entries from storage
    for (const emailId of dueIds) {
      await this.storage.setMetadata(storageKey(emailId), '');
    }

    if (dueIds.length > 0) {
      const remaining = index.filter((id) => !dueIds.includes(id));
      await this.setIndex(remaining);
    }

    return dueIds;
  }

  /**
   * Start a background loop that periodically checks for due snoozed emails.
   *
   * @param onDue  Callback invoked for each email whose snooze time has passed.
   * @param intervalMs  Check interval in milliseconds (default: 60 000).
   */
  startCheckLoop(
    onDue: (emailId: string) => Promise<void>,
    intervalMs: number = DEFAULT_CHECK_INTERVAL_MS,
  ): void {
    // Prevent duplicate loops
    if (this.abortController) return;

    this.abortController = new AbortController();
    const { signal } = this.abortController;

    const loop = async (): Promise<void> => {
      while (!signal.aborted) {
        try {
          const dueIds = await this.checkDue();

          for (const emailId of dueIds) {
            if (signal.aborted) break;
            try {
              await onDue(emailId);
            } catch {
              // Individual callback failures should not break the loop
            }
          }
        } catch {
          // Storage errors should not break the loop
        }

        if (!signal.aborted) {
          await sleep(intervalMs);
        }
      }
    };

    void loop();
  }

  /**
   * Stop the background check loop.
   */
  stopCheckLoop(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}
