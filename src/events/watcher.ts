import type { EmailProvider, Email, WatchHandle, ListEmailsOptions } from '../core/types.js';
import { EmaiError } from '../core/errors.js';
import { sleep } from '../core/utils.js';
import type { EmaiEventEmitter } from './emitter.js';

export interface WatchOptions {
  folder?: string;
  pollInterval?: number;
  useIdle?: boolean;
}

const DEFAULT_POLL_INTERVAL = 30_000;
const MAX_BACKOFF = 5 * 60_000;
const BASE_BACKOFF = 1_000;

export class EmailWatcher {
  private watching = false;
  private watchHandle: WatchHandle | null = null;
  private pollAbort: AbortController | null = null;
  private seenIds = new Set<string>();

  constructor(
    private readonly provider: EmailProvider,
    private readonly emitter: EmaiEventEmitter,
  ) {}

  async start(options: WatchOptions = {}): Promise<void> {
    if (this.watching) return;

    const { folder, pollInterval = DEFAULT_POLL_INTERVAL, useIdle = true } = options;
    this.watching = true;
    this.emitter.emit('watch:started', undefined);

    if (useIdle && this.provider.watch) {
      await this.startNativeWatch(folder);
    } else {
      await this.startPolling(folder, pollInterval);
    }
  }

  async stop(): Promise<void> {
    if (!this.watching) return;
    this.watching = false;

    if (this.watchHandle) {
      await this.watchHandle.stop();
      this.watchHandle = null;
    }

    if (this.pollAbort) {
      this.pollAbort.abort();
      this.pollAbort = null;
    }

    this.seenIds.clear();
    this.emitter.emit('watch:stopped', undefined);
  }

  isWatching(): boolean {
    return this.watching;
  }

  private async startNativeWatch(folder?: string): Promise<void> {
    let consecutiveErrors = 0;

    const connect = async (): Promise<void> => {
      while (this.watching && this.provider.watch) {
        try {
          this.watchHandle = await this.provider.watch((email: Email) => {
            this.emitter.emit('email:received', email);
          });
          consecutiveErrors = 0;
          return;
        } catch (err) {
          consecutiveErrors++;
          const error =
            err instanceof Error ? err : new EmaiError(String(err), 'WATCH_ERROR');
          this.emitter.emit('watch:error', error);

          const delay = Math.min(BASE_BACKOFF * 2 ** consecutiveErrors, MAX_BACKOFF);
          await sleep(delay);
        }
      }
    };

    await connect();

    if (!this.watchHandle && this.watching) {
      await this.startPolling(folder, DEFAULT_POLL_INTERVAL);
    }
  }

  private async startPolling(folder: string | undefined, interval: number): Promise<void> {
    this.pollAbort = new AbortController();
    const { signal } = this.pollAbort;

    await this.seedSeenIds(folder);

    let consecutiveErrors = 0;

    const poll = async (): Promise<void> => {
      while (this.watching && !signal.aborted) {
        try {
          const query: ListEmailsOptions = {
            folder,
            sortBy: 'date',
            sortOrder: 'desc',
            limit: 50,
          };

          const result = await this.provider.listEmails(query);
          consecutiveErrors = 0;

          for (const email of result.items) {
            if (!this.seenIds.has(email.id)) {
              this.seenIds.add(email.id);
              this.emitter.emit('email:received', email);
            }
          }
        } catch (err) {
          consecutiveErrors++;
          const error =
            err instanceof Error ? err : new EmaiError(String(err), 'WATCH_ERROR');
          this.emitter.emit('watch:error', error);

          if (consecutiveErrors > 10) {
            this.watching = false;
            this.emitter.emit('watch:stopped', undefined);
            return;
          }
        }

        const delay =
          consecutiveErrors > 0
            ? Math.min(interval * 2 ** consecutiveErrors, MAX_BACKOFF)
            : interval;

        await sleep(delay);
      }
    };

    void poll();
  }

  private async seedSeenIds(folder?: string): Promise<void> {
    try {
      const result = await this.provider.listEmails({
        folder,
        sortBy: 'date',
        sortOrder: 'desc',
        limit: 100,
      });
      for (const email of result.items) {
        this.seenIds.add(email.id);
      }
    } catch {
      // If seeding fails, we start from scratch — some emails may be re-emitted
    }
  }
}
