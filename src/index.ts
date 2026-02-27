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
  }

  async disconnect(): Promise<void> {
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
      const scanResult = await this.safetyEngine.checkBeforeSend(options);
      if (!scanResult.allowed) {
        throw new EmaiError(
          `Email blocked by safety scan: ${scanResult.result.risks.map((r) => r.description).join('; ')}`,
          'SAFETY_BLOCKED',
        );
      }
      const result = await this.provider.sendEmail(options);
      this.eventEmitter.emit('email:sent', result);
      return result;
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
} from './core/types.js';

export { EmaiError, ProviderError, AuthenticationError, ConnectionError, NotFoundError, AiError, SearchError, SafetyError, DependencyError, ValidationError } from './core/errors.js';
export { AiEngine } from './ai/index.js';
export { createAdapter } from './ai/adapter.js';
export { createProvider } from './providers/index.js';
export { createVectorStore } from './search/stores/index.js';
export { createStorage } from './storage/index.js';
export { AttachmentParser } from './attachments/parser.js';
export { ThreadDetector } from './threading/detector.js';
export { SafetyEngine } from './safety/index.js';
export { EmaiEventEmitter } from './events/emitter.js';
export { EmailWatcher } from './events/watcher.js';
export { WebhookManager } from './events/webhooks.js';
export { startEmaiMcpServer, createEmaiMcpServer } from './mcp/server.js';
