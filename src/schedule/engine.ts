import type { StorageAdapter, SendEmailOptions } from '../core/types.js';
import { generateId, sleep } from '../core/utils.js';
import { ValidationError } from '../core/errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScheduledEmail {
  id: string;
  options: SendEmailOptions;
  scheduledAt: string;
  createdAt: string;
  status: 'pending' | 'sending' | 'sent' | 'cancelled' | 'failed';
  error?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_INDEX_KEY = 'schedule:index';
const DEFAULT_CHECK_INTERVAL_MS = 30_000;

function storageKey(id: string): string {
  return `schedule:${id}`;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class ScheduleEngine {
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

  private async load(id: string): Promise<ScheduledEmail | null> {
    const raw = await this.storage.getMetadata(storageKey(id));
    if (!raw) return null;
    return JSON.parse(raw) as ScheduledEmail;
  }

  private async save(entry: ScheduledEmail): Promise<void> {
    await this.storage.setMetadata(storageKey(entry.id), JSON.stringify(entry));
  }

  // ---- Public API ---------------------------------------------------------

  /**
   * Schedule an email to be sent at a future time.
   *
   * The `options.scheduledAt` field on the SendEmailOptions is used as the
   * target send time. If it is missing or in the past, a ValidationError is
   * thrown.
   *
   * @param options  The email send options (must include `scheduledAt`).
   * @param id       Optional explicit ID — useful for idempotent retries.
   * @returns The stored ScheduledEmail record.
   */
  async schedule(options: SendEmailOptions, id?: string): Promise<ScheduledEmail> {
    if (!options.scheduledAt) {
      throw new ValidationError(
        'SendEmailOptions.scheduledAt is required for scheduling',
      );
    }

    const scheduledTime =
      options.scheduledAt instanceof Date
        ? options.scheduledAt
        : new Date(options.scheduledAt);

    if (isNaN(scheduledTime.getTime())) {
      throw new ValidationError('scheduledAt must be a valid date');
    }

    if (scheduledTime.getTime() <= Date.now()) {
      throw new ValidationError('scheduledAt must be in the future');
    }

    const entry: ScheduledEmail = {
      id: id ?? generateId(),
      options,
      scheduledAt: scheduledTime.toISOString(),
      createdAt: new Date().toISOString(),
      status: 'pending',
    };

    await this.save(entry);

    const index = await this.getIndex();
    if (!index.includes(entry.id)) {
      index.push(entry.id);
      await this.setIndex(index);
    }

    return entry;
  }

  /**
   * Cancel a scheduled email. Only emails with status `pending` can be
   * cancelled.
   */
  async cancel(id: string): Promise<void> {
    const entry = await this.load(id);
    if (!entry) {
      throw new ValidationError(`Scheduled email not found: ${id}`);
    }

    if (entry.status !== 'pending') {
      throw new ValidationError(
        `Cannot cancel scheduled email with status "${entry.status}"`,
      );
    }

    entry.status = 'cancelled';
    await this.save(entry);
  }

  /**
   * List all scheduled emails that are still pending (not yet sent,
   * cancelled, or failed).
   */
  async listPending(): Promise<ScheduledEmail[]> {
    const index = await this.getIndex();
    const pending: ScheduledEmail[] = [];

    for (const id of index) {
      const entry = await this.load(id);
      if (entry && entry.status === 'pending') {
        pending.push(entry);
      }
    }

    return pending;
  }

  /**
   * Check for pending emails whose scheduled time has passed.
   *
   * Each due entry is atomically transitioned to `'sending'` status so that
   * concurrent check loops will not double-send.
   *
   * @returns Array of due ScheduledEmail records (now in `'sending'` status).
   */
  async checkDue(): Promise<ScheduledEmail[]> {
    const now = Date.now();
    const index = await this.getIndex();
    const due: ScheduledEmail[] = [];

    for (const id of index) {
      const entry = await this.load(id);
      if (!entry || entry.status !== 'pending') continue;

      if (new Date(entry.scheduledAt).getTime() <= now) {
        entry.status = 'sending';
        await this.save(entry);
        due.push(entry);
      }
    }

    return due;
  }

  /**
   * Mark a scheduled email as successfully sent.
   */
  async markSent(id: string): Promise<void> {
    const entry = await this.load(id);
    if (!entry) {
      throw new ValidationError(`Scheduled email not found: ${id}`);
    }

    entry.status = 'sent';
    await this.save(entry);
  }

  /**
   * Mark a scheduled email as failed with an error message.
   */
  async markFailed(id: string, error: string): Promise<void> {
    const entry = await this.load(id);
    if (!entry) {
      throw new ValidationError(`Scheduled email not found: ${id}`);
    }

    entry.status = 'failed';
    entry.error = error;
    await this.save(entry);
  }

  /**
   * Start a background loop that periodically checks for due scheduled
   * emails and invokes the provided callback for each.
   *
   * @param onDue       Callback invoked for each due ScheduledEmail.
   * @param intervalMs  Check interval in milliseconds (default: 30 000).
   */
  startCheckLoop(
    onDue: (scheduled: ScheduledEmail) => Promise<void>,
    intervalMs: number = DEFAULT_CHECK_INTERVAL_MS,
  ): void {
    // Prevent duplicate loops
    if (this.abortController) return;

    this.abortController = new AbortController();
    const { signal } = this.abortController;

    const loop = async (): Promise<void> => {
      while (!signal.aborted) {
        try {
          const dueEntries = await this.checkDue();

          for (const entry of dueEntries) {
            if (signal.aborted) break;
            try {
              await onDue(entry);
            } catch (err: unknown) {
              // Mark individual failures so they are not retried endlessly
              const message =
                err instanceof Error ? err.message : String(err);
              try {
                await this.markFailed(entry.id, message);
              } catch {
                // Storage failure — skip silently
              }
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
