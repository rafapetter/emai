import { resolveConfig } from './core/config.js';
import { AdapterNotConfiguredError, ConnectionError, EmaiError } from './core/errors.js';
import { createProvider } from './providers/index.js';
import { createAdapter } from './ai/adapter.js';
import { AiEngine } from './ai/index.js';
import { SearchEngine } from './search/engine.js';
import { FullTextSearch } from './search/full-text.js';
import { createVectorStore } from './search/stores/index.js';
import { createStorage } from './storage/index.js';
import { AttachmentParser } from './attachments/parser.js';
import { ThreadDetector } from './threading/detector.js';
import { SafetyEngine } from './safety/index.js';
import { EmaiEventEmitter } from './events/emitter.js';
import { EmailWatcher } from './events/watcher.js';
import { WebhookManager } from './events/webhooks.js';

// New engines
import { SnippetEngine } from './snippets/engine.js';
import { SnoozeEngine } from './snooze/engine.js';
import { ScheduleEngine } from './schedule/engine.js';
import { UndoEngine } from './undo/engine.js';
import { ReminderEngine } from './reminders/engine.js';
import { TrackingEngine } from './tracking/engine.js';
import { SendStatusTracker } from './tracking/send-status.js';
import { BounceEngine } from './bounces/engine.js';
import { RulesEngine } from './rules/engine.js';
import { InboxEngine } from './inbox/engine.js';
import { AutoArchiveEngine } from './auto-archive/engine.js';
import { AutoLabelEngine } from './auto-labels/engine.js';
import { AutoDraftsEngine } from './auto-drafts/engine.js';

import type {
  EmaiConfig,
  Email,
  Thread,
  Folder,
  Label,
  Attachment,
  SendEmailOptions,
  ReplyOptions,
  ForwardOptions,
  SendResult,
  ListEmailsOptions,
  ListResult,
  SearchOptions,
  HybridSearchOptions,
  SearchResult,
  ClassificationResult,
  SummaryResult,
  PriorityResult,
  ActionItem,
  ComposeOptions,
  ComposeResult,
  ExtractionResult,
  ParsedAttachment,
  AttachmentParseOptions,
  ScanResult,
  EmaiEvent,
  EmaiEventMap,
  EmailProvider,
  LLMAdapter,
  VectorStore,
  StorageAdapter,
} from './core/types.js';

import type { z } from 'zod';
import type { UndoableSendResult } from './undo/engine.js';
import type { SnoozedEmail } from './snooze/engine.js';
import type { ScheduledEmail } from './schedule/engine.js';
import type { Snippet, CreateSnippetOptions, RenderedSnippet } from './snippets/engine.js';
import type { Reminder, ReminderStatus } from './reminders/engine.js';
import type { TrackingEventData, TrackingStatus } from './tracking/engine.js';
import type { SendStatusInfo, SendStatus } from './tracking/send-status.js';
import type { StoredBounceInfo } from './bounces/engine.js';
import type { BounceInfo } from './bounces/parser.js';
import type { Rule, CreateRuleOptions, MatchedRule, RuleExecutionResult } from './rules/engine.js';
import type { ConditionContext } from './rules/conditions.js';
import type { ActionContext } from './rules/actions.js';
import type { InboxProcessOptions, InboxProcessResult, EnrichedEmail } from './inbox/engine.js';
import type { TopicGroupingResult, CategorySuggestion } from './ai/topic-grouping.js';
import type { AskResult } from './ai/ask.js';
import type { AutoArchiveEvaluation } from './auto-archive/engine.js';
import type { AutoLabelRule, CreateAutoLabelOptions, AppliedLabel } from './auto-labels/engine.js';
import type { FollowUpSuggestion, AutoDraftOptions } from './auto-drafts/engine.js';

export class Emai {
  private provider: EmailProvider;
  private aiEngine?: AiEngine;
  private adapter?: LLMAdapter;
  private searchEngine?: SearchEngine;
  private fullTextSearch: FullTextSearch;
  private vectorStore?: VectorStore;
  private storageAdapter: StorageAdapter;
  private attachmentParser: AttachmentParser;
  private threadDetector: ThreadDetector;
  private safetyEngine: SafetyEngine;
  private eventEmitter: EmaiEventEmitter;
  private emailWatcher: EmailWatcher;
  private webhookManager: WebhookManager;
  private config: Required<EmaiConfig>;
  private connected = false;

  // New engine instances
  private snippetEngine: SnippetEngine;
  private snoozeEngine: SnoozeEngine;
  private scheduleEngine: ScheduleEngine;
  private undoEngine: UndoEngine;
  private reminderEngine: ReminderEngine;
  private trackingEngine: TrackingEngine;
  private sendStatusTracker: SendStatusTracker;
  private bounceEngine: BounceEngine;
  private rulesEngine: RulesEngine;
  private inboxEngine: InboxEngine;
  private autoArchiveEngine?: AutoArchiveEngine;
  private autoLabelEngine?: AutoLabelEngine;
  private autoDraftsEngine?: AutoDraftsEngine;

  constructor(config: EmaiConfig) {
    this.config = resolveConfig(config);

    this.provider = createProvider(this.config.provider);
    this.storageAdapter = createStorage(this.config.storage);
    this.fullTextSearch = new FullTextSearch();
    this.attachmentParser = new AttachmentParser();
    this.threadDetector = new ThreadDetector();
    this.safetyEngine = new SafetyEngine(this.config.safety);
    this.eventEmitter = new EmaiEventEmitter();
    this.emailWatcher = new EmailWatcher(this.provider, this.eventEmitter);
    this.webhookManager = new WebhookManager(this.eventEmitter);

    if (this.config.ai) {
      if (typeof this.config.ai.adapter === 'string') {
        this.adapter = createAdapter(this.config.ai);
      } else {
        this.adapter = this.config.ai.adapter;
      }
      this.aiEngine = new AiEngine(this.adapter);
    }

    if (this.config.search) {
      if (typeof this.config.search.store === 'string') {
        this.vectorStore = createVectorStore(this.config.search);
      } else {
        this.vectorStore = this.config.search.store;
      }

      if (this.adapter && this.vectorStore) {
        this.searchEngine = new SearchEngine(
          this.vectorStore,
          this.adapter,
          this.storageAdapter,
        );
      }
    }

    // Initialize new engines
    this.snippetEngine = new SnippetEngine(this.storageAdapter);
    this.snoozeEngine = new SnoozeEngine(this.storageAdapter);
    this.scheduleEngine = new ScheduleEngine(this.storageAdapter);
    this.undoEngine = new UndoEngine(this.config.undo?.undoWindow);
    this.reminderEngine = new ReminderEngine(this.storageAdapter);
    this.trackingEngine = new TrackingEngine(this.storageAdapter, this.config.tracking ?? {});
    this.sendStatusTracker = new SendStatusTracker(this.storageAdapter);
    this.bounceEngine = new BounceEngine(this.storageAdapter);
    this.rulesEngine = new RulesEngine(this.storageAdapter);
    this.inboxEngine = new InboxEngine();

    // AI-dependent engines
    if (this.adapter) {
      this.autoArchiveEngine = new AutoArchiveEngine(this.adapter, this.storageAdapter);
      this.autoLabelEngine = new AutoLabelEngine(this.adapter, this.storageAdapter);
      this.autoDraftsEngine = new AutoDraftsEngine(this.adapter);
    }
  }

  // -------------------------------------------------------------------------
  // Connection
  // -------------------------------------------------------------------------

  async connect(): Promise<void> {
    await this.provider.connect();
    await this.storageAdapter.initialize();
    if (this.vectorStore) {
      const dims = this.config.search?.dimensions ?? 1536;
      await this.vectorStore.initialize(dims);
    }
    this.connected = true;

    // Start background loops
    this.snoozeEngine.startCheckLoop(async (emailId) => {
      try {
        await this.provider.markAsUnread(emailId);
      } catch {
        // Best-effort
      }
      this.eventEmitter.emit('email:unsnoozed', { emailId, reason: 'timer' });
    });

    this.scheduleEngine.startCheckLoop(async (scheduled) => {
      try {
        const scanResult = await this.safetyEngine.checkBeforeSend(scheduled.options);
        if (!scanResult.allowed) {
          await this.scheduleEngine.markFailed(
            scheduled.id,
            `Blocked by safety: ${scanResult.result.risks.map((r) => r.description).join('; ')}`,
          );
          return;
        }
        const result = await this.provider.sendEmail(scheduled.options);
        await this.scheduleEngine.markSent(scheduled.id);
        this.eventEmitter.emit('email:sent', result);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        await this.scheduleEngine.markFailed(scheduled.id, message);
      }
    });

    this.reminderEngine.startCheckLoop((reminder) => {
      this.eventEmitter.emit('reminder:due', {
        reminderId: reminder.id,
        emailId: reminder.emailId,
        subject: reminder.subject,
      });
    });
  }

  async disconnect(): Promise<void> {
    // Stop background loops
    this.snoozeEngine.stopCheckLoop();
    this.scheduleEngine.stopCheckLoop();
    this.reminderEngine.stopCheckLoop();
    this.undoEngine.cancelAll();

    if (this.emailWatcher.isWatching()) {
      await this.emailWatcher.stop();
    }
    await this.provider.disconnect();
    if (this.vectorStore) await this.vectorStore.close();
    await this.storageAdapter.close();
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  private ensureConnected(): void {
    if (!this.connected) {
      throw new ConnectionError('Not connected. Call emai.connect() first.');
    }
  }

  private requireAi(): AiEngine {
    if (!this.aiEngine) {
      throw new AdapterNotConfiguredError('AI features');
    }
    return this.aiEngine;
  }

  // -------------------------------------------------------------------------
  // Emails
  // -------------------------------------------------------------------------

  readonly emails = {
    list: async (options?: ListEmailsOptions): Promise<ListResult<Email>> => {
      this.ensureConnected();
      const result = await this.provider.listEmails(options);
      return result;
    },

    get: async (id: string): Promise<Email> => {
      this.ensureConnected();
      return this.provider.getEmail(id);
    },

    send: async (options: SendEmailOptions): Promise<SendResult> => {
      this.ensureConnected();

      // Scheduled send: store for later
      if (options.scheduledAt && new Date(options.scheduledAt).getTime() > Date.now()) {
        const scheduled = await this.scheduleEngine.schedule(options);
        this.eventEmitter.emit('email:scheduled', {
          id: scheduled.id,
          scheduledAt: scheduled.scheduledAt,
        });
        return { id: scheduled.id, threadId: undefined, messageId: scheduled.id };
      }

      // Safety check
      const scanResult = await this.safetyEngine.checkBeforeSend(options);
      if (!scanResult.allowed) {
        throw new EmaiError(
          `Email blocked by safety scan: ${scanResult.result.risks.map((r) => r.description).join('; ')}`,
          'SAFETY_BLOCKED',
        );
      }

      // Inject tracking if requested
      let sendOptions = options;
      if (options.tracking && options.html) {
        const trackedHtml = this.trackingEngine.injectTracking(
          options.html,
          'pending',
          options.tracking,
        );
        sendOptions = { ...options, html: trackedHtml };
      }

      const result = await this.provider.sendEmail(sendOptions);
      this.eventEmitter.emit('email:sent', result);

      // Record send status
      try {
        await this.sendStatusTracker.recordSent(result.id, result.messageId);
      } catch {
        // Non-critical
      }

      return result;
    },

    sendWithUndo: async (options: SendEmailOptions): Promise<UndoableSendResult> => {
      this.ensureConnected();

      const scanResult = await this.safetyEngine.checkBeforeSend(options);
      if (!scanResult.allowed) {
        throw new EmaiError(
          `Email blocked by safety scan: ${scanResult.result.risks.map((r) => r.description).join('; ')}`,
          'SAFETY_BLOCKED',
        );
      }

      return this.undoEngine.sendWithUndo(
        async () => {
          let sendOptions = options;
          if (options.tracking && options.html) {
            const trackedHtml = this.trackingEngine.injectTracking(
              options.html,
              'pending',
              options.tracking,
            );
            sendOptions = { ...options, html: trackedHtml };
          }

          const result = await this.provider.sendEmail(sendOptions);
          this.eventEmitter.emit('email:sent', result);

          try {
            await this.sendStatusTracker.recordSent(result.id, result.messageId);
          } catch {
            // Non-critical
          }

          return result;
        },
        () => {
          this.eventEmitter.emit('email:undo', { emailId: 'cancelled' });
        },
      );
    },

    reply: async (emailId: string, options: ReplyOptions): Promise<SendResult> => {
      this.ensureConnected();
      const result = await this.provider.replyToEmail(emailId, options);
      this.eventEmitter.emit('email:sent', result);
      return result;
    },

    forward: async (emailId: string, options: ForwardOptions): Promise<SendResult> => {
      this.ensureConnected();
      const result = await this.provider.forwardEmail(emailId, options);
      this.eventEmitter.emit('email:sent', result);
      return result;
    },

    createDraft: async (options: SendEmailOptions): Promise<Email> => {
      this.ensureConnected();
      return this.provider.createDraft(options);
    },

    updateDraft: async (draftId: string, options: SendEmailOptions): Promise<Email> => {
      this.ensureConnected();
      return this.provider.updateDraft(draftId, options);
    },

    deleteDraft: async (draftId: string): Promise<void> => {
      this.ensureConnected();
      return this.provider.deleteDraft(draftId);
    },

    markAsRead: async (emailId: string): Promise<void> => {
      this.ensureConnected();
      await this.provider.markAsRead(emailId);
      this.eventEmitter.emit('email:read', { emailId });
    },

    markAsUnread: async (emailId: string): Promise<void> => {
      this.ensureConnected();
      await this.provider.markAsUnread(emailId);
    },

    star: async (emailId: string): Promise<void> => {
      this.ensureConnected();
      await this.provider.star(emailId);
    },

    unstar: async (emailId: string): Promise<void> => {
      this.ensureConnected();
      await this.provider.unstar(emailId);
    },

    moveToFolder: async (emailId: string, folder: string): Promise<void> => {
      this.ensureConnected();
      await this.provider.moveToFolder(emailId, folder);
      this.eventEmitter.emit('email:moved', { emailId, folder });
    },

    delete: async (emailId: string): Promise<void> => {
      this.ensureConnected();
      await this.provider.deleteEmail(emailId);
      this.eventEmitter.emit('email:deleted', { emailId });
    },

    archive: async (emailId: string): Promise<void> => {
      this.ensureConnected();
      await this.provider.archiveEmail(emailId);
      this.eventEmitter.emit('email:moved', { emailId, folder: 'archive' });
    },

    // Snooze
    snooze: async (emailId: string, until: Date, originalFolder?: string): Promise<void> => {
      this.ensureConnected();
      await this.snoozeEngine.snooze(emailId, until, this.provider, originalFolder);
      this.eventEmitter.emit('email:snoozed', { emailId, until: until.toISOString() });
    },

    unsnooze: async (emailId: string): Promise<void> => {
      this.ensureConnected();
      await this.snoozeEngine.unsnooze(emailId, this.provider);
      this.eventEmitter.emit('email:unsnoozed', { emailId, reason: 'manual' });
    },

    listSnoozed: async (): Promise<SnoozedEmail[]> => {
      this.ensureConnected();
      return this.snoozeEngine.listSnoozed();
    },

    // Scheduled send
    cancelScheduled: async (id: string): Promise<void> => {
      this.ensureConnected();
      await this.scheduleEngine.cancel(id);
      this.eventEmitter.emit('email:schedule-cancelled', { id });
    },

    listScheduled: async (): Promise<ScheduledEmail[]> => {
      this.ensureConnected();
      return this.scheduleEngine.listPending();
    },
  };

  // -------------------------------------------------------------------------
  // Threads
  // -------------------------------------------------------------------------

  readonly threads = {
    get: async (threadId: string): Promise<Thread> => {
      this.ensureConnected();
      return this.provider.getThread(threadId);
    },

    detect: (emails: Email[]): Thread[] => {
      return this.threadDetector.detectThreads(emails);
    },
  };

  // -------------------------------------------------------------------------
  // Labels
  // -------------------------------------------------------------------------

  readonly labels = {
    list: async (): Promise<Label[]> => {
      this.ensureConnected();
      return this.provider.listLabels();
    },

    add: async (emailId: string, label: string): Promise<void> => {
      this.ensureConnected();
      await this.provider.addLabel(emailId, label);
      this.eventEmitter.emit('email:labeled', { emailId, label, action: 'add' });
    },

    remove: async (emailId: string, label: string): Promise<void> => {
      this.ensureConnected();
      await this.provider.removeLabel(emailId, label);
      this.eventEmitter.emit('email:labeled', { emailId, label, action: 'remove' });
    },

    create: async (name: string, color?: string): Promise<Label> => {
      this.ensureConnected();
      return this.provider.createLabel(name, color);
    },

    delete: async (labelId: string): Promise<void> => {
      this.ensureConnected();
      return this.provider.deleteLabel(labelId);
    },
  };

  // -------------------------------------------------------------------------
  // Folders
  // -------------------------------------------------------------------------

  readonly folders = {
    list: async (): Promise<Folder[]> => {
      this.ensureConnected();
      return this.provider.listFolders();
    },

    create: async (name: string, parentId?: string): Promise<Folder> => {
      this.ensureConnected();
      return this.provider.createFolder(name, parentId);
    },

    delete: async (folderId: string): Promise<void> => {
      this.ensureConnected();
      return this.provider.deleteFolder(folderId);
    },
  };

  // -------------------------------------------------------------------------
  // Search
  // -------------------------------------------------------------------------

  readonly search = {
    semantic: async (query: string, options?: SearchOptions): Promise<SearchResult[]> => {
      this.ensureConnected();
      if (!this.searchEngine) {
        throw new AdapterNotConfiguredError('semantic search (requires AI adapter + vector store)');
      }
      return this.searchEngine.searchSemantic(query, options);
    },

    fullText: async (query: string, options?: SearchOptions): Promise<SearchResult[]> => {
      this.ensureConnected();
      return this.fullTextSearch.search(query, options);
    },

    hybrid: async (query: string, options?: HybridSearchOptions): Promise<SearchResult[]> => {
      this.ensureConnected();
      if (!this.searchEngine) {
        throw new AdapterNotConfiguredError('hybrid search (requires AI adapter + vector store)');
      }
      return this.searchEngine.searchHybrid(query, options);
    },

    index: async (emails: Email[]): Promise<void> => {
      this.ensureConnected();
      await this.fullTextSearch.indexEmails(emails);
      if (this.searchEngine) {
        await this.searchEngine.index(emails);
      }
      for (const email of emails) {
        this.eventEmitter.emit('email:indexed', { emailId: email.id });
      }
    },

    indexEmail: async (email: Email): Promise<void> => {
      this.ensureConnected();
      await this.fullTextSearch.indexEmails([email]);
      if (this.searchEngine) {
        await this.searchEngine.indexEmail(email);
      }
      this.eventEmitter.emit('email:indexed', { emailId: email.id });
    },

    removeFromIndex: async (emailId: string): Promise<void> => {
      if (this.searchEngine) {
        await this.searchEngine.removeFromIndex(emailId);
      }
    },

    getIndexedCount: async (): Promise<number> => {
      if (this.searchEngine) {
        return this.searchEngine.getIndexedCount();
      }
      return 0;
    },
  };

  // -------------------------------------------------------------------------
  // AI
  // -------------------------------------------------------------------------

  readonly ai = {
    classify: async (email: Email): Promise<ClassificationResult> => {
      return this.requireAi().classifyEmail(email);
    },

    classifyBatch: async (emails: Email[]): Promise<ClassificationResult[]> => {
      return this.requireAi().classifyEmails(emails);
    },

    summarize: async (email: Email): Promise<SummaryResult> => {
      return this.requireAi().summarizeEmail(email);
    },

    summarizeThread: async (thread: Thread): Promise<SummaryResult> => {
      return this.requireAi().summarizeThread(thread);
    },

    summarizeBatch: async (emails: Email[]): Promise<string> => {
      return this.requireAi().summarizeEmails(emails);
    },

    extract: async <T>(email: Email, schema: z.ZodType<T>): Promise<ExtractionResult<T>> => {
      return this.requireAi().extractData(email, schema);
    },

    compose: async (options: ComposeOptions): Promise<ComposeResult> => {
      return this.requireAi().composeEmail(options);
    },

    reply: async (email: Email, options: ComposeOptions): Promise<ComposeResult> => {
      return this.requireAi().replyToEmail(email, options);
    },

    rewriteInTone: async (text: string, tone: string): Promise<string> => {
      return this.requireAi().rewriteInTone(text, tone);
    },

    improveWriting: async (text: string): Promise<string> => {
      return this.requireAi().improveWriting(text);
    },

    prioritize: async (
      email: Email,
      context?: { userEmail?: string; vipList?: string[] },
    ): Promise<PriorityResult> => {
      return this.requireAi().prioritizeEmail(email, context);
    },

    prioritizeBatch: async (
      emails: Email[],
      context?: { userEmail?: string; vipList?: string[] },
    ): Promise<Array<{ email: Email; priority: PriorityResult }>> => {
      return this.requireAi().prioritizeEmails(emails, context);
    },

    detectActions: async (email: Email): Promise<ActionItem[]> => {
      return this.requireAi().detectActions(email);
    },

    detectActionsInThread: async (thread: Thread): Promise<ActionItem[]> => {
      return this.requireAi().detectActionsInThread(thread);
    },

    // Topic grouping
    groupByTopic: async (
      emails: Email[],
      options?: { maxGroups?: number; minGroupSize?: number },
    ): Promise<TopicGroupingResult> => {
      return this.requireAi().groupByTopic(emails, options);
    },

    extractTopics: async (email: Email): Promise<string[]> => {
      return this.requireAi().extractTopics(email);
    },

    suggestCategories: async (
      emails: Email[],
    ): Promise<CategorySuggestion[]> => {
      return this.requireAi().suggestCategories(emails);
    },

    // Ask AI
    ask: async (question: string, emails?: Email[]): Promise<AskResult> => {
      return this.requireAi().askQuestion(question, emails ?? []);
    },
  };

  // -------------------------------------------------------------------------
  // Snippets / Templates
  // -------------------------------------------------------------------------

  readonly snippets = {
    create: async (options: CreateSnippetOptions): Promise<Snippet> => {
      this.ensureConnected();
      return this.snippetEngine.create(options);
    },

    get: async (id: string): Promise<Snippet | null> => {
      this.ensureConnected();
      return this.snippetEngine.get(id);
    },

    getByName: async (name: string): Promise<Snippet | null> => {
      this.ensureConnected();
      return this.snippetEngine.getByName(name);
    },

    list: async (): Promise<Snippet[]> => {
      this.ensureConnected();
      return this.snippetEngine.list();
    },

    update: async (id: string, options: Partial<CreateSnippetOptions>): Promise<Snippet> => {
      this.ensureConnected();
      return this.snippetEngine.update(id, options);
    },

    delete: async (id: string): Promise<void> => {
      this.ensureConnected();
      return this.snippetEngine.delete(id);
    },

    render: async (nameOrId: string, variables?: Record<string, string>): Promise<RenderedSnippet> => {
      this.ensureConnected();
      return this.snippetEngine.render(nameOrId, variables);
    },
  };

  // -------------------------------------------------------------------------
  // Inbox (Focused Inbox + Pipeline)
  // -------------------------------------------------------------------------

  readonly inbox = {
    process: async (
      emails: Email[],
      options?: InboxProcessOptions,
    ): Promise<InboxProcessResult> => {
      const ai = this.requireAi();
      return this.inboxEngine.process(emails, ai, ai.topicGrouping, options);
    },
  };

  // -------------------------------------------------------------------------
  // Reminders
  // -------------------------------------------------------------------------

  readonly reminders = {
    track: async (
      emailId: string,
      subject: string,
      sentTo: string[],
      sentAt: Date,
      remindAfter?: Date,
    ): Promise<Reminder> => {
      this.ensureConnected();
      return this.reminderEngine.track(emailId, subject, sentTo, sentAt, remindAfter);
    },

    list: async (options?: { status?: ReminderStatus }): Promise<Reminder[]> => {
      this.ensureConnected();
      return this.reminderEngine.list(options);
    },

    dismiss: async (id: string): Promise<void> => {
      this.ensureConnected();
      return this.reminderEngine.dismiss(id);
    },

    markReplied: async (id: string, replyEmailId: string): Promise<void> => {
      this.ensureConnected();
      await this.reminderEngine.markReplied(id, replyEmailId);
      this.eventEmitter.emit('reminder:replied', {
        reminderId: id,
        emailId: replyEmailId,
      });
    },

    check: async (): Promise<void> => {
      this.ensureConnected();
      const dueReminders = await this.reminderEngine.checkDue();
      for (const reminder of dueReminders) {
        this.eventEmitter.emit('reminder:due', {
          reminderId: reminder.id,
          emailId: reminder.emailId,
          subject: reminder.subject,
        });
      }
    },
  };

  // -------------------------------------------------------------------------
  // Tracking
  // -------------------------------------------------------------------------

  readonly tracking = {
    recordOpen: async (
      emailId: string,
      event?: Partial<TrackingEventData>,
    ): Promise<void> => {
      await this.trackingEngine.recordOpen(emailId, event);
      this.eventEmitter.emit('email:opened', {
        emailId,
        timestamp: event?.timestamp ?? new Date().toISOString(),
        ip: event?.ip,
        userAgent: event?.userAgent,
      });
    },

    recordClick: async (
      emailId: string,
      url: string,
      event?: Partial<TrackingEventData>,
    ): Promise<void> => {
      await this.trackingEngine.recordClick(emailId, url, event);
      this.eventEmitter.emit('email:clicked', {
        emailId,
        url,
        timestamp: event?.timestamp ?? new Date().toISOString(),
        ip: event?.ip,
        userAgent: event?.userAgent,
      });
    },

    getStatus: async (emailId: string): Promise<TrackingStatus> => {
      return this.trackingEngine.getStatus(emailId);
    },

    getSendStatus: async (emailId: string): Promise<SendStatusInfo | null> => {
      return this.sendStatusTracker.getStatus(emailId);
    },

    listByStatus: async (status: SendStatus): Promise<SendStatusInfo[]> => {
      return this.sendStatusTracker.listByStatus(status);
    },
  };

  // -------------------------------------------------------------------------
  // Bounces
  // -------------------------------------------------------------------------

  readonly bounces = {
    detect: (email: Email): BounceInfo | null => {
      return this.bounceEngine.detect(email);
    },

    check: async (emailId: string, email: Email): Promise<StoredBounceInfo | null> => {
      this.ensureConnected();
      const bounce = this.bounceEngine.detect(email);
      if (bounce) {
        await this.bounceEngine.recordBounce(emailId, bounce);
        this.eventEmitter.emit('email:bounced', {
          emailId,
          type: bounce.bounceType === 'unknown' ? 'hard' : bounce.bounceType,
          reason: bounce.reason,
          recipient: bounce.recipient,
        });
        try {
          await this.sendStatusTracker.recordBounced(emailId, bounce.reason);
        } catch {
          // Non-critical
        }
      }
      return bounce ? { ...bounce, emailId, detectedAt: new Date().toISOString() } : null;
    },

    scanEmails: async (emails: Email[]): Promise<StoredBounceInfo[]> => {
      this.ensureConnected();
      return this.bounceEngine.scanEmails(emails);
    },

    list: async (): Promise<StoredBounceInfo[]> => {
      this.ensureConnected();
      return this.bounceEngine.list();
    },
  };

  // -------------------------------------------------------------------------
  // Rules
  // -------------------------------------------------------------------------

  readonly rules = {
    add: async (options: CreateRuleOptions): Promise<Rule> => {
      this.ensureConnected();
      return this.rulesEngine.add(options);
    },

    get: async (id: string): Promise<Rule | null> => {
      this.ensureConnected();
      return this.rulesEngine.get(id);
    },

    list: async (): Promise<Rule[]> => {
      this.ensureConnected();
      return this.rulesEngine.list();
    },

    update: async (id: string, options: Partial<CreateRuleOptions>): Promise<Rule> => {
      this.ensureConnected();
      return this.rulesEngine.update(id, options);
    },

    delete: async (id: string): Promise<void> => {
      this.ensureConnected();
      return this.rulesEngine.delete(id);
    },

    enable: async (id: string): Promise<void> => {
      this.ensureConnected();
      return this.rulesEngine.enable(id);
    },

    disable: async (id: string): Promise<void> => {
      this.ensureConnected();
      return this.rulesEngine.disable(id);
    },

    evaluate: async (
      email: Email,
      context?: ConditionContext,
    ): Promise<MatchedRule[]> => {
      this.ensureConnected();
      return this.rulesEngine.evaluate(email, context ?? {}, this.adapter);
    },

    evaluateAndExecute: async (
      email: Email,
      context?: ConditionContext,
    ): Promise<RuleExecutionResult[]> => {
      this.ensureConnected();
      const provider = this.provider;
      const snooze = this.snoozeEngine;
      const actionContext: ActionContext = {
        provider,
        snoozeEngine: {
          snooze: (emailId: string, until: Date) => snooze.snooze(emailId, until, provider),
        },
      };
      const results = await this.rulesEngine.evaluateAndExecute(
        email,
        context ?? {},
        actionContext,
        this.adapter,
      );
      for (const r of results) {
        if (r.matched) {
          this.eventEmitter.emit('rule:triggered', {
            ruleId: r.rule.id,
            ruleName: r.rule.name,
            emailId: email.id,
            actions: r.actionsExecuted.filter((a) => a.success).map((a) => a.action.type),
          });
        }
      }
      return results;
    },
  };

  // -------------------------------------------------------------------------
  // Auto Archive
  // -------------------------------------------------------------------------

  readonly autoArchive = {
    train: async (archivedEmails: Email[], keptEmails: Email[]): Promise<void> => {
      if (!this.autoArchiveEngine) {
        throw new AdapterNotConfiguredError('auto-archive (requires AI adapter)');
      }
      return this.autoArchiveEngine.train(archivedEmails, keptEmails);
    },

    evaluate: async (email: Email): Promise<AutoArchiveEvaluation> => {
      if (!this.autoArchiveEngine) {
        throw new AdapterNotConfiguredError('auto-archive (requires AI adapter)');
      }
      return this.autoArchiveEngine.evaluate(email);
    },

    processInbox: async (emails: Email[]): Promise<{ archive: Email[]; keep: Email[] }> => {
      if (!this.autoArchiveEngine) {
        throw new AdapterNotConfiguredError('auto-archive (requires AI adapter)');
      }
      return this.autoArchiveEngine.processInbox(emails);
    },
  };

  // -------------------------------------------------------------------------
  // Auto Labels
  // -------------------------------------------------------------------------

  readonly autoLabels = {
    create: async (options: CreateAutoLabelOptions): Promise<AutoLabelRule> => {
      if (!this.autoLabelEngine) {
        throw new AdapterNotConfiguredError('auto-labels (requires AI adapter)');
      }
      return this.autoLabelEngine.create(options);
    },

    get: async (id: string): Promise<AutoLabelRule | null> => {
      if (!this.autoLabelEngine) {
        throw new AdapterNotConfiguredError('auto-labels (requires AI adapter)');
      }
      return this.autoLabelEngine.get(id);
    },

    list: async (): Promise<AutoLabelRule[]> => {
      if (!this.autoLabelEngine) {
        throw new AdapterNotConfiguredError('auto-labels (requires AI adapter)');
      }
      return this.autoLabelEngine.list();
    },

    update: async (id: string, options: Partial<CreateAutoLabelOptions>): Promise<AutoLabelRule> => {
      if (!this.autoLabelEngine) {
        throw new AdapterNotConfiguredError('auto-labels (requires AI adapter)');
      }
      return this.autoLabelEngine.update(id, options);
    },

    delete: async (id: string): Promise<void> => {
      if (!this.autoLabelEngine) {
        throw new AdapterNotConfiguredError('auto-labels (requires AI adapter)');
      }
      return this.autoLabelEngine.delete(id);
    },

    apply: async (email: Email): Promise<AppliedLabel[]> => {
      if (!this.autoLabelEngine) {
        throw new AdapterNotConfiguredError('auto-labels (requires AI adapter)');
      }
      return this.autoLabelEngine.apply(email);
    },

    applyBatch: async (emails: Email[]): Promise<Map<string, AppliedLabel[]>> => {
      if (!this.autoLabelEngine) {
        throw new AdapterNotConfiguredError('auto-labels (requires AI adapter)');
      }
      return this.autoLabelEngine.applyBatch(emails);
    },
  };

  // -------------------------------------------------------------------------
  // Auto Drafts
  // -------------------------------------------------------------------------

  readonly autoDrafts = {
    generateFollowUps: async (
      sentEmails: Email[],
      receivedEmails: Email[],
      options?: AutoDraftOptions,
    ): Promise<FollowUpSuggestion[]> => {
      if (!this.autoDraftsEngine) {
        throw new AdapterNotConfiguredError('auto-drafts (requires AI adapter)');
      }
      return this.autoDraftsEngine.generateFollowUps(sentEmails, receivedEmails, options);
    },
  };

  // -------------------------------------------------------------------------
  // Attachments
  // -------------------------------------------------------------------------

  readonly attachments = {
    parse: async (
      attachment: Attachment,
      options?: AttachmentParseOptions,
    ): Promise<ParsedAttachment> => {
      return this.attachmentParser.parse(attachment, options);
    },

    toText: async (attachment: Attachment, options?: AttachmentParseOptions): Promise<string> => {
      return this.attachmentParser.toText(attachment, options);
    },

    extract: async <T>(attachment: Attachment, schema: z.ZodType<T>): Promise<ExtractionResult<T>> => {
      const ai = this.requireAi();
      return this.attachmentParser.extract(attachment, schema, ai.adapter);
    },

    describe: async (attachment: Attachment): Promise<string> => {
      const ai = this.requireAi();
      return this.attachmentParser.describe(attachment, ai.adapter);
    },

    ocr: async (attachment: Attachment): Promise<string> => {
      return this.attachmentParser.ocr(attachment);
    },

    getContent: async (emailId: string, attachmentId: string): Promise<Buffer> => {
      this.ensureConnected();
      return this.provider.getAttachmentContent(emailId, attachmentId);
    },
  };

  // -------------------------------------------------------------------------
  // Safety
  // -------------------------------------------------------------------------

  readonly safety = {
    scan: (email: Email): ScanResult => {
      return this.safetyEngine.scanInbound(email);
    },

    scanOutbound: async (options: SendEmailOptions): Promise<ScanResult> => {
      return this.safetyEngine.scanOutbound(options);
    },

    checkBeforeSend: async (
      options: SendEmailOptions,
    ): Promise<{ allowed: boolean; result: ScanResult }> => {
      return this.safetyEngine.checkBeforeSend(options);
    },
  };

  // -------------------------------------------------------------------------
  // Events
  // -------------------------------------------------------------------------

  on<K extends EmaiEvent>(event: K, listener: (data: EmaiEventMap[K]) => void): () => void {
    return this.eventEmitter.on(event, listener);
  }

  once<K extends EmaiEvent>(event: K, listener: (data: EmaiEventMap[K]) => void): () => void {
    return this.eventEmitter.once(event, listener);
  }

  off<K extends EmaiEvent>(event: K, listener: (data: EmaiEventMap[K]) => void): void {
    this.eventEmitter.off(event, listener);
  }

  // -------------------------------------------------------------------------
  // Watch
  // -------------------------------------------------------------------------

  readonly watch = {
    start: async (options?: { folder?: string; pollInterval?: number }): Promise<void> => {
      this.ensureConnected();
      await this.emailWatcher.start(options);
    },

    stop: async (): Promise<void> => {
      await this.emailWatcher.stop();
    },

    isWatching: (): boolean => {
      return this.emailWatcher.isWatching();
    },
  };

  // -------------------------------------------------------------------------
  // Webhooks
  // -------------------------------------------------------------------------

  readonly webhooks = {
    register: (
      url: string,
      events: EmaiEvent[],
      options?: { secret?: string; headers?: Record<string, string>; retries?: number },
    ): string => {
      return this.webhookManager.register(url, events, options);
    },

    unregister: (webhookId: string): void => {
      this.webhookManager.unregister(webhookId);
    },

    list: () => {
      return this.webhookManager.list();
    },
  };

  // -------------------------------------------------------------------------
  // Direct access to internals (advanced)
  // -------------------------------------------------------------------------

  getProvider(): EmailProvider {
    return this.provider;
  }

  getAiEngine(): AiEngine | undefined {
    return this.aiEngine;
  }

  getAdapter(): LLMAdapter | undefined {
    return this.adapter;
  }

  getStorage(): StorageAdapter {
    return this.storageAdapter;
  }

  getEventEmitter(): EmaiEventEmitter {
    return this.eventEmitter;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createEmai(config: EmaiConfig): Emai {
  return new Emai(config);
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export type {
  EmaiConfig,
  Email,
  EmailAddress,
  EmailBody,
  Thread,
  Folder,
  Label,
  Attachment,
  SendEmailOptions,
  ReplyOptions,
  ForwardOptions,
  SendResult,
  ListEmailsOptions,
  ListResult,
  SearchOptions,
  HybridSearchOptions,
  SearchResult,
  ClassificationResult,
  SummaryResult,
  PriorityResult,
  ActionItem,
  ComposeOptions,
  ComposeResult,
  ExtractionResult,
  ParsedAttachment,
  AttachmentParseOptions,
  ScanResult,
  Risk,
  SafetyConfig,
  EmaiEvent,
  EmaiEventMap,
  EmailProvider,
  ProviderConfig,
  LLMAdapter,
  AiConfig,
  VectorStore,
  StorageAdapter,
  WatchHandle,
  EmailHeaders,
  SendAttachment,
  SafetyPolicy,
  SafetyContext,
  VectorEntry,
  VectorSearchResult,
  ParsedImage,
  ParsedTable,
  UndoConfig,
  TrackingConfig,
  AutoArchiveConfig,
  SendTrackingOptions,
} from './core/types.js';

// New feature types
export type { UndoableSendResult } from './undo/engine.js';
export type { SnoozedEmail } from './snooze/engine.js';
export type { ScheduledEmail } from './schedule/engine.js';
export type { Snippet, CreateSnippetOptions, RenderedSnippet } from './snippets/engine.js';
export type { Reminder, ReminderStatus } from './reminders/engine.js';
export type { TrackingStatus, TrackingEventData } from './tracking/engine.js';
export type { SendStatusInfo, SendStatus } from './tracking/send-status.js';
export type { StoredBounceInfo } from './bounces/engine.js';
export type { BounceInfo } from './bounces/parser.js';
export type { Rule, CreateRuleOptions, MatchedRule, RuleExecutionResult } from './rules/engine.js';
export type { RuleCondition, ConditionContext } from './rules/conditions.js';
export type { RuleAction, ActionContext } from './rules/actions.js';
export type { InboxProcessOptions, InboxProcessResult, EnrichedEmail } from './inbox/engine.js';
export type { TopicGroup, TopicGroupingResult, CategorySuggestion } from './ai/topic-grouping.js';
export type { AskResult } from './ai/ask.js';
export type { AutoArchiveEvaluation } from './auto-archive/engine.js';
export type { AutoLabelRule, CreateAutoLabelOptions, AppliedLabel } from './auto-labels/engine.js';
export type { FollowUpSuggestion, AutoDraftOptions } from './auto-drafts/engine.js';

export { EmaiError, ProviderError, AuthenticationError, ConnectionError, NotFoundError, AiError, SearchError, SafetyError, DependencyError, ValidationError } from './core/errors.js';
export { AiEngine } from './ai/index.js';
export { createAdapter } from './ai/adapter.js';
export { createProvider } from './providers/index.js';
export { SearchEngine } from './search/engine.js';
export { FullTextSearch } from './search/full-text.js';
export { createVectorStore } from './search/stores/index.js';
export { MemoryVectorStore } from './search/stores/memory.js';
export { SqliteVectorStore } from './search/stores/sqlite.js';
export { createStorage } from './storage/index.js';
export { AttachmentParser } from './attachments/parser.js';
export { ThreadDetector } from './threading/detector.js';
export { SafetyEngine } from './safety/index.js';
export { EmaiEventEmitter } from './events/emitter.js';
export { EmailWatcher } from './events/watcher.js';
export { WebhookManager } from './events/webhooks.js';
export { startEmaiMcpServer, createEmaiMcpServer } from './mcp/server.js';

// New engine exports
export { SnippetEngine } from './snippets/engine.js';
export { SnoozeEngine } from './snooze/engine.js';
export { ScheduleEngine } from './schedule/engine.js';
export { UndoEngine } from './undo/engine.js';
export { ReminderEngine } from './reminders/engine.js';
export { TrackingEngine } from './tracking/engine.js';
export { SendStatusTracker } from './tracking/send-status.js';
export { BounceEngine } from './bounces/engine.js';
export { isBounceEmail, parseBounce } from './bounces/parser.js';
export { RulesEngine } from './rules/engine.js';
export { InboxEngine } from './inbox/engine.js';
export { AutoArchiveEngine } from './auto-archive/engine.js';
export { AutoLabelEngine } from './auto-labels/engine.js';
export { AutoDraftsEngine } from './auto-drafts/engine.js';
export { EmaiHub } from './hub/index.js';
