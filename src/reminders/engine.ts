import type { StorageAdapter } from '../core/types.js';
import { generateId, sleep } from '../core/utils.js';
import { ValidationError } from '../core/errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReminderStatus = 'active' | 'replied' | 'dismissed';

export interface Reminder {
  id: string;
  emailId: string;
  threadId?: string;
  subject: string;
  sentTo: string[];
  sentAt: string;
  remindAfter: string;
  status: ReminderStatus;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_INDEX_KEY = 'reminder:index';
const DEFAULT_REMIND_AFTER_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
const DEFAULT_CHECK_INTERVAL_MS = 300_000; // 5 minutes

function storageKey(id: string): string {
  return `reminder:${id}`;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class ReminderEngine {
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

  private async load(id: string): Promise<Reminder | null> {
    const raw = await this.storage.getMetadata(storageKey(id));
    if (!raw) return null;
    return JSON.parse(raw) as Reminder;
  }

  private async save(reminder: Reminder): Promise<void> {
    await this.storage.setMetadata(
      storageKey(reminder.id),
      JSON.stringify(reminder),
    );
  }

  // ---- Public API ---------------------------------------------------------

  /**
   * Track a sent email and set a reminder for when no reply is received.
   *
   * If `remindAfter` is not provided, defaults to 3 days after `sentAt`.
   */
  async track(
    emailId: string,
    subject: string,
    sentTo: string[],
    sentAt: Date,
    remindAfter?: Date,
  ): Promise<Reminder> {
    if (!emailId) {
      throw new ValidationError('emailId is required');
    }
    if (!subject) {
      throw new ValidationError('subject is required');
    }
    if (!sentTo.length) {
      throw new ValidationError('sentTo must contain at least one recipient');
    }

    const remindAfterDate =
      remindAfter ?? new Date(sentAt.getTime() + DEFAULT_REMIND_AFTER_MS);

    const now = new Date().toISOString();
    const reminder: Reminder = {
      id: generateId(),
      emailId,
      subject,
      sentTo,
      sentAt: sentAt.toISOString(),
      remindAfter: remindAfterDate.toISOString(),
      status: 'active',
      createdAt: now,
    };

    await this.save(reminder);

    const index = await this.getIndex();
    if (!index.includes(reminder.id)) {
      index.push(reminder.id);
      await this.setIndex(index);
    }

    return reminder;
  }

  /**
   * List reminders, optionally filtered by status.
   */
  async list(options?: { status?: ReminderStatus }): Promise<Reminder[]> {
    const index = await this.getIndex();
    const reminders: Reminder[] = [];

    for (const id of index) {
      const reminder = await this.load(id);
      if (!reminder) continue;

      if (options?.status && reminder.status !== options.status) {
        continue;
      }

      reminders.push(reminder);
    }

    return reminders;
  }

  /**
   * Dismiss a reminder so it no longer triggers due checks.
   */
  async dismiss(id: string): Promise<void> {
    const reminder = await this.load(id);
    if (!reminder) {
      throw new ValidationError(`Reminder not found: ${id}`);
    }

    reminder.status = 'dismissed';
    await this.save(reminder);
  }

  /**
   * Mark a reminder as replied, recording the reply email ID.
   */
  async markReplied(id: string, replyEmailId: string): Promise<void> {
    const reminder = await this.load(id);
    if (!reminder) {
      throw new ValidationError(`Reminder not found: ${id}`);
    }

    reminder.status = 'replied';
    await this.save(reminder);

    // Store the reply mapping for reference
    await this.storage.setMetadata(
      `reminder:reply:${id}`,
      replyEmailId,
    );
  }

  /**
   * Return all reminders that are due (status is 'active' and remindAfter <= now).
   */
  async checkDue(): Promise<Reminder[]> {
    const now = Date.now();
    const index = await this.getIndex();
    const due: Reminder[] = [];

    for (const id of index) {
      const reminder = await this.load(id);
      if (!reminder) continue;
      if (reminder.status !== 'active') continue;

      if (new Date(reminder.remindAfter).getTime() <= now) {
        due.push(reminder);
      }
    }

    return due;
  }

  /**
   * Start a background loop that periodically checks for due reminders.
   *
   * @param onDue        Callback invoked for each reminder whose time has passed.
   * @param onReplied    Optional callback invoked when a reminder has been replied to.
   * @param intervalMs   Check interval in milliseconds (default: 300 000 — 5 minutes).
   */
  startCheckLoop(
    onDue: (reminder: Reminder) => void,
    onReplied?: (reminder: Reminder, replyId: string) => void,
    intervalMs: number = DEFAULT_CHECK_INTERVAL_MS,
  ): void {
    // Prevent duplicate loops
    if (this.abortController) return;

    this.abortController = new AbortController();
    const { signal } = this.abortController;

    const loop = async (): Promise<void> => {
      while (!signal.aborted) {
        try {
          // Check for due reminders
          const dueReminders = await this.checkDue();
          for (const reminder of dueReminders) {
            if (signal.aborted) break;
            try {
              onDue(reminder);
            } catch {
              // Individual callback failures should not break the loop
            }
          }

          // Check for replied reminders if callback provided
          if (onReplied) {
            const replied = await this.list({ status: 'replied' });
            for (const reminder of replied) {
              if (signal.aborted) break;
              try {
                const replyId = await this.storage.getMetadata(
                  `reminder:reply:${reminder.id}`,
                );
                if (replyId) {
                  onReplied(reminder, replyId);
                }
              } catch {
                // Individual callback failures should not break the loop
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
