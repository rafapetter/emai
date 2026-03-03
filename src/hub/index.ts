import { Emai, createEmai } from '../index.js';
import type {
  EmaiConfig,
  Email,
  ListEmailsOptions,
  ListResult,
  SendEmailOptions,
  SendResult,
} from '../core/types.js';
import type {
  InboxProcessOptions,
  InboxProcessResult,
} from '../inbox/engine.js';
import { ValidationError } from '../core/errors.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AccountEntry {
  config: EmaiConfig;
  instance: Emai;
}

// ---------------------------------------------------------------------------
// Hub
// ---------------------------------------------------------------------------

/**
 * Multi-Account Hub — manage multiple Emai instances from a single facade.
 *
 * Provides unified operations across accounts for listing emails, sending,
 * and running inbox processing.
 */
export class EmaiHub {
  private accounts = new Map<string, AccountEntry>();

  // ---- Account management -------------------------------------------------

  /**
   * Add a new email account to the hub.
   *
   * Creates an Emai instance from the provided config. The instance is not
   * connected automatically; call `connect()` on the hub (or individually)
   * to establish connections.
   */
  async addAccount(name: string, config: EmaiConfig): Promise<void> {
    if (!name) {
      throw new ValidationError('Account name is required');
    }
    if (this.accounts.has(name)) {
      throw new ValidationError(`Account "${name}" already exists`);
    }

    const instance = createEmai(config);
    this.accounts.set(name, { config, instance });
  }

  /**
   * Remove an account from the hub. Disconnects the instance if connected.
   */
  async removeAccount(name: string): Promise<void> {
    const entry = this.accounts.get(name);
    if (!entry) {
      throw new ValidationError(`Account "${name}" not found`);
    }

    if (entry.instance.isConnected()) {
      try {
        await entry.instance.disconnect();
      } catch {
        // Best-effort disconnect on removal
      }
    }

    this.accounts.delete(name);
  }

  /**
   * Get the Emai instance for a specific account.
   */
  getAccount(name: string): Emai {
    const entry = this.accounts.get(name);
    if (!entry) {
      throw new ValidationError(`Account "${name}" not found`);
    }
    return entry.instance;
  }

  /**
   * List all registered account names.
   */
  listAccounts(): string[] {
    return [...this.accounts.keys()];
  }

  // ---- Email operations ---------------------------------------------------

  readonly emails = {
    /**
     * List emails from all accounts (or a subset of specified accounts).
     *
     * Results are merged and sorted by date descending.
     */
    list: async (
      options?: ListEmailsOptions & { accounts?: string[] },
    ): Promise<Array<{ account: string; email: Email }>> => {
      const accountNames = options?.accounts ?? this.listAccounts();

      // Strip our custom 'accounts' field before passing to the provider
      const listOptions: ListEmailsOptions = { ...options };
      if ('accounts' in listOptions) {
        delete (listOptions as Record<string, unknown>).accounts;
      }

      const results: Array<{ account: string; email: Email }> = [];

      await Promise.all(
        accountNames.map(async (name) => {
          const emai = this.getAccount(name);
          try {
            const response = await emai.emails.list(listOptions);
            for (const email of response.items) {
              results.push({ account: name, email });
            }
          } catch {
            // Individual account failures should not block other accounts
          }
        }),
      );

      // Sort by date descending
      results.sort(
        (a, b) =>
          new Date(b.email.date).getTime() - new Date(a.email.date).getTime(),
      );

      return results;
    },

    /**
     * Send an email from a specific account.
     */
    send: async (
      account: string,
      options: SendEmailOptions,
    ): Promise<SendResult> => {
      const emai = this.getAccount(account);
      return emai.emails.send(options);
    },
  };

  // ---- Inbox operations ---------------------------------------------------

  readonly inbox = {
    /**
     * Process inbox for each account independently, returning a map of
     * account names to their InboxProcessResult.
     */
    process: async (
      options?: InboxProcessOptions & { accounts?: string[] },
    ): Promise<Map<string, InboxProcessResult>> => {
      const accountNames = options?.accounts ?? this.listAccounts();

      // Strip our custom 'accounts' field before passing to the engine
      const processOptions: InboxProcessOptions = { ...options };
      if ('accounts' in processOptions) {
        delete (processOptions as Record<string, unknown>).accounts;
      }

      const resultMap = new Map<string, InboxProcessResult>();

      await Promise.all(
        accountNames.map(async (name) => {
          const emai = this.getAccount(name);
          try {
            // Get emails from inbox
            const response = await emai.emails.list({ folder: 'inbox' });
            const emails = response.items;

            if (emails.length === 0) return;

            // Process using the Emai instance's AI engine and inbox engine
            const aiEngine = emai.getAiEngine();
            if (!aiEngine) return;

            // Use dynamic import to avoid circular dependency issues
            const { InboxEngine } = await import('../inbox/engine.js');
            const { TopicGroupingEngine } = await import(
              '../ai/topic-grouping.js'
            );

            const inboxEngine = new InboxEngine();
            const adapter = emai.getAdapter();
            const topicEngine = new TopicGroupingEngine(adapter!);

            const result = await inboxEngine.process(
              emails,
              aiEngine,
              topicEngine,
              processOptions,
            );

            resultMap.set(name, result);
          } catch {
            // Individual account failures should not block other accounts
          }
        }),
      );

      return resultMap;
    },

    /**
     * Process emails from ALL accounts in a single unified run.
     *
     * Collects emails from every account, then passes them through a single
     * InboxEngine.process() call so that cross-account topic grouping and
     * prioritization work correctly.
     */
    processUnified: async (
      options?: InboxProcessOptions,
    ): Promise<InboxProcessResult> => {
      const allEmails: Email[] = [];

      // Collect emails from every account
      await Promise.all(
        this.listAccounts().map(async (name) => {
          const emai = this.getAccount(name);
          try {
            const response = await emai.emails.list({ folder: 'inbox' });
            allEmails.push(...response.items);
          } catch {
            // Individual account failures should not block collection
          }
        }),
      );

      // Find the first account that has an AI engine configured
      let aiEngine = undefined;
      let adapter = undefined;
      for (const name of this.listAccounts()) {
        const emai = this.getAccount(name);
        aiEngine = emai.getAiEngine();
        adapter = emai.getAdapter();
        if (aiEngine && adapter) break;
      }

      if (!aiEngine || !adapter) {
        // Return an empty result if no AI engine is available
        return {
          focused: [],
          other: [],
          urgent: [],
          stats: {
            total: allEmails.length,
            focused: 0,
            other: 0,
            urgent: 0,
            groupCount: 0,
            processedAt: new Date().toISOString(),
          },
        };
      }

      const { InboxEngine } = await import('../inbox/engine.js');
      const { TopicGroupingEngine } = await import(
        '../ai/topic-grouping.js'
      );

      const inboxEngine = new InboxEngine();
      const topicEngine = new TopicGroupingEngine(adapter);

      return inboxEngine.process(allEmails, aiEngine, topicEngine, options);
    },
  };

  // ---- Connection management ----------------------------------------------

  /**
   * Connect all registered accounts.
   */
  async connect(): Promise<void> {
    const entries = [...this.accounts.entries()];

    await Promise.all(
      entries.map(async ([name, entry]) => {
        try {
          await entry.instance.connect();
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          throw new ValidationError(
            `Failed to connect account "${name}": ${message}`,
          );
        }
      }),
    );
  }

  /**
   * Disconnect all registered accounts.
   */
  async disconnect(): Promise<void> {
    const entries = [...this.accounts.entries()];

    await Promise.all(
      entries.map(async ([, entry]) => {
        try {
          await entry.instance.disconnect();
        } catch {
          // Best-effort disconnect
        }
      }),
    );
  }
}
