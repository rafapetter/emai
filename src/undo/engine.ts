import type { SendResult } from '../core/types.js';
import { generateId } from '../core/utils.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UndoableSendResult extends SendResult {
  /** Cancel the pending send. Returns `true` if the send was prevented. */
  undo: () => Promise<boolean>;
  /** Timestamp after which the undo window expires and the email is sent. */
  expiresAt: Date;
}

// ---------------------------------------------------------------------------
// Internal bookkeeping
// ---------------------------------------------------------------------------

interface PendingEntry {
  timer: ReturnType<typeof setTimeout>;
  cancelled: boolean;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

/**
 * In-memory delay buffer that enables "undo send" functionality.
 *
 * When `sendWithUndo` is called the actual send is deferred by
 * `undoWindowMs` milliseconds. During that window the caller can invoke the
 * returned `undo()` function to prevent the email from being sent.
 *
 * This engine is intentionally **in-memory only** — pending sends do not
 * survive process restarts. That is the expected trade-off: the undo window
 * is short (seconds) and persistence would add unwarranted complexity.
 */
export class UndoEngine {
  private readonly pendingEntries = new Map<string, PendingEntry>();

  /**
   * @param undoWindowMs  How long (in ms) to wait before actually sending.
   *                      Defaults to 5 000 ms (5 seconds).
   */
  constructor(private readonly undoWindowMs: number = 5_000) {}

  /**
   * Queue a send with an undo window.
   *
   * Returns immediately with a temporary `UndoableSendResult`. The actual
   * `doSend` callback is invoked only after the undo window elapses without
   * a cancellation.
   *
   * @param doSend  The function that performs the real send operation.
   * @param onUndo  Optional callback invoked when `undo()` succeeds.
   * @returns An `UndoableSendResult` containing the temporary ID and an
   *          `undo()` function.
   */
  async sendWithUndo(
    doSend: () => Promise<SendResult>,
    onUndo?: () => void,
  ): Promise<UndoableSendResult> {
    const tempId = generateId();
    const expiresAt = new Date(Date.now() + this.undoWindowMs);

    const entry: PendingEntry = {
      timer: setTimeout(async () => {
        // Window elapsed — perform the real send
        this.pendingEntries.delete(tempId);
        try {
          await doSend();
        } catch {
          // The caller no longer holds a reference to capture this error.
          // In a production integration the Emai facade would wrap doSend
          // to emit an 'error' event on failure.
        }
      }, this.undoWindowMs),
      cancelled: false,
    };

    this.pendingEntries.set(tempId, entry);

    return {
      id: tempId,
      threadId: undefined,
      messageId: tempId,
      expiresAt,
      undo: async (): Promise<boolean> => {
        const pending = this.pendingEntries.get(tempId);
        if (!pending || pending.cancelled) {
          // Already undone or already sent
          return false;
        }

        pending.cancelled = true;
        clearTimeout(pending.timer);
        this.pendingEntries.delete(tempId);

        if (onUndo) {
          try {
            onUndo();
          } catch {
            // Swallow callback errors
          }
        }

        return true;
      },
    };
  }

  /**
   * Cancel **all** pending sends.
   *
   * Useful during disconnect / cleanup to ensure nothing fires after the
   * process is torn down.
   */
  cancelAll(): void {
    for (const [id, entry] of this.pendingEntries) {
      if (!entry.cancelled) {
        entry.cancelled = true;
        clearTimeout(entry.timer);
      }
      this.pendingEntries.delete(id);
    }
  }

  /**
   * Returns the number of sends currently waiting in the undo window.
   * Primarily useful for testing and diagnostics.
   */
  get pendingCount(): number {
    return this.pendingEntries.size;
  }
}
