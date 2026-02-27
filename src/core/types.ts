import { z } from 'zod';

// ---------------------------------------------------------------------------
// Email primitives
// ---------------------------------------------------------------------------

export interface EmailAddress {
  name?: string;
  address: string;
}

export interface EmailBody {
  text?: string;
  html?: string;
  markdown?: string;
}

export interface Attachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  content?: Buffer | Uint8Array;
  contentId?: string;
  isInline: boolean;
}

export interface EmailHeaders {
  messageId: string;
  inReplyTo?: string;
  references?: string[];
  [key: string]: string | string[] | undefined;
}

export interface Email {
  id: string;
  threadId?: string;
  provider: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc: EmailAddress[];
  bcc: EmailAddress[];
  replyTo?: EmailAddress;
  subject: string;
  body: EmailBody;
  attachments: Attachment[];
  labels: string[];
  folder: string;
  date: Date;
  receivedDate: Date;
  isRead: boolean;
  isStarred: boolean;
  isDraft: boolean;
  headers: EmailHeaders;
  snippet?: string;
  raw?: string;
}

export interface Thread {
  id: string;
  subject: string;
  emails: Email[];
  participants: EmailAddress[];
  lastDate: Date;
  messageCount: number;
  labels: string[];
  snippet?: string;
}

export interface Folder {
  id: string;
  name: string;
  path: string;
  type: 'inbox' | 'sent' | 'drafts' | 'trash' | 'spam' | 'archive' | 'custom';
  unreadCount: number;
  totalCount: number;
  children?: Folder[];
}

export interface Label {
  id: string;
  name: string;
  color?: string;
  type: 'system' | 'user';
}

// ---------------------------------------------------------------------------
// Send / compose
// ---------------------------------------------------------------------------

export interface SendEmailOptions {
  to: string | string[] | EmailAddress | EmailAddress[];
  cc?: string | string[] | EmailAddress | EmailAddress[];
  bcc?: string | string[] | EmailAddress | EmailAddress[];
  subject: string;
  text?: string;
  html?: string;
  attachments?: SendAttachment[];
  replyTo?: string | EmailAddress;
  headers?: Record<string, string>;
  scheduledAt?: Date;
}

export interface ReplyOptions {
  text?: string;
  html?: string;
  attachments?: SendAttachment[];
  replyAll?: boolean;
}

export interface ForwardOptions {
  to: string | string[] | EmailAddress | EmailAddress[];
  text?: string;
  html?: string;
  attachments?: SendAttachment[];
}

export interface SendAttachment {
  filename: string;
  content: Buffer | Uint8Array | string;
  contentType?: string;
  encoding?: 'base64' | 'utf-8';
}

export interface SendResult {
  id: string;
  threadId?: string;
  messageId: string;
}

// ---------------------------------------------------------------------------
// List / query
// ---------------------------------------------------------------------------

export interface ListEmailsOptions {
  folder?: string;
  label?: string;
  limit?: number;
  offset?: number;
  cursor?: string;
  query?: string;
  from?: string;
  to?: string;
  subject?: string;
  after?: Date;
  before?: Date;
  hasAttachment?: boolean;
  isRead?: boolean;
  isStarred?: boolean;
  sortBy?: 'date' | 'subject' | 'from';
  sortOrder?: 'asc' | 'desc';
}

export interface ListResult<T> {
  items: T[];
  total?: number;
  nextCursor?: string;
  hasMore: boolean;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export type ProviderType = 'gmail' | 'outlook' | 'imap';

export interface GmailProviderConfig {
  type: 'gmail';
  credentials: {
    clientId: string;
    clientSecret: string;
    refreshToken: string;
    accessToken?: string;
  };
}

export interface OutlookProviderConfig {
  type: 'outlook';
  credentials: {
    clientId: string;
    clientSecret: string;
    tenantId?: string;
    refreshToken: string;
    accessToken?: string;
  };
}

export interface ImapSmtpProviderConfig {
  type: 'imap';
  imap: {
    host: string;
    port: number;
    secure?: boolean;
    auth:
      | { user: string; pass: string }
      | { user: string; accessToken: string };
  };
  smtp: {
    host: string;
    port: number;
    secure?: boolean;
    auth:
      | { user: string; pass: string }
      | { user: string; accessToken: string };
  };
}

export type ProviderConfig =
  | GmailProviderConfig
  | OutlookProviderConfig
  | ImapSmtpProviderConfig;

export interface EmailProvider {
  readonly type: ProviderType;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;

  listEmails(options?: ListEmailsOptions): Promise<ListResult<Email>>;
  getEmail(id: string): Promise<Email>;
  getThread(threadId: string): Promise<Thread>;
  getAttachmentContent(emailId: string, attachmentId: string): Promise<Buffer>;

  sendEmail(options: SendEmailOptions): Promise<SendResult>;
  replyToEmail(emailId: string, options: ReplyOptions): Promise<SendResult>;
  forwardEmail(emailId: string, options: ForwardOptions): Promise<SendResult>;
  createDraft(options: SendEmailOptions): Promise<Email>;
  updateDraft(draftId: string, options: SendEmailOptions): Promise<Email>;
  deleteDraft(draftId: string): Promise<void>;

  markAsRead(emailId: string): Promise<void>;
  markAsUnread(emailId: string): Promise<void>;
  star(emailId: string): Promise<void>;
  unstar(emailId: string): Promise<void>;
  moveToFolder(emailId: string, folder: string): Promise<void>;
  deleteEmail(emailId: string): Promise<void>;
  archiveEmail(emailId: string): Promise<void>;

  listFolders(): Promise<Folder[]>;
  createFolder(name: string, parentId?: string): Promise<Folder>;
  deleteFolder(folderId: string): Promise<void>;

  listLabels(): Promise<Label[]>;
  addLabel(emailId: string, label: string): Promise<void>;
  removeLabel(emailId: string, label: string): Promise<void>;
  createLabel(name: string, color?: string): Promise<Label>;
  deleteLabel(labelId: string): Promise<void>;

  watch?(callback: (email: Email) => void): Promise<WatchHandle>;
  searchNative?(query: string, options?: ListEmailsOptions): Promise<ListResult<Email>>;
}

export interface WatchHandle {
  stop(): Promise<void>;
}

// ---------------------------------------------------------------------------
// AI / LLM
// ---------------------------------------------------------------------------

export type LLMAdapterType = 'openai' | 'anthropic' | 'google' | 'ollama';

export interface AiConfig {
  adapter: LLMAdapterType | LLMAdapter;
  apiKey?: string;
  model?: string;
  embeddingModel?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface CompletionOptions {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json';
  schema?: z.ZodType;
}

export interface LLMAdapter {
  readonly name: string;
  complete(prompt: string, options?: CompletionOptions): Promise<string>;
  completeJSON<T>(prompt: string, schema: z.ZodType<T>, options?: CompletionOptions): Promise<T>;
  embed(texts: string[]): Promise<number[][]>;
  vision?(images: Array<{ data: Buffer | Uint8Array; mimeType: string }>, prompt: string, options?: CompletionOptions): Promise<string>;
}

// ---------------------------------------------------------------------------
// AI feature results
// ---------------------------------------------------------------------------

export const EmailCategorySchema = z.enum([
  'primary',
  'social',
  'promotions',
  'updates',
  'forums',
  'spam',
  'phishing',
  'support',
  'sales',
  'billing',
  'newsletter',
  'notification',
  'personal',
  'work',
  'other',
]);
export type EmailCategory = z.infer<typeof EmailCategorySchema>;

export interface ClassificationResult {
  category: EmailCategory;
  confidence: number;
  reasoning: string;
  labels: string[];
  sentiment: 'positive' | 'negative' | 'neutral';
  isUrgent: boolean;
  isActionRequired: boolean;
}

export interface SummaryResult {
  summary: string;
  keyPoints: string[];
  participants: EmailAddress[];
  actionItems: ActionItem[];
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed';
  topicTags: string[];
}

export interface ActionItem {
  description: string;
  assignee?: string;
  dueDate?: string;
  priority: 'high' | 'medium' | 'low';
  status: 'pending' | 'done' | 'unknown';
}

export interface PriorityResult {
  score: number;
  level: 'critical' | 'high' | 'medium' | 'low' | 'none';
  reasoning: string;
  suggestedResponseTime?: string;
}

export interface ComposeOptions {
  context?: string;
  tone?: 'professional' | 'casual' | 'friendly' | 'formal' | 'empathetic';
  length?: 'short' | 'medium' | 'long';
  language?: string;
  instructions?: string;
}

export interface ComposeResult {
  subject?: string;
  text: string;
  html?: string;
}

export interface ExtractionResult<T = Record<string, unknown>> {
  data: T;
  confidence: number;
  sources: Array<{ field: string; source: string; span?: string }>;
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export type VectorStoreType = 'memory' | 'sqlite' | 'pgvector' | 'pinecone' | 'weaviate' | 'chromadb';

export interface SearchConfig {
  store: VectorStoreType | VectorStore;
  path?: string;
  connectionString?: string;
  apiKey?: string;
  environment?: string;
  url?: string;
  indexName?: string;
  collectionName?: string;
  dimensions?: number;
}

export interface VectorStore {
  readonly name: string;
  initialize(dimensions: number): Promise<void>;
  upsert(vectors: VectorEntry[]): Promise<void>;
  search(vector: number[], limit: number, filter?: Record<string, unknown>): Promise<VectorSearchResult[]>;
  delete(ids: string[]): Promise<void>;
  count(): Promise<number>;
  close(): Promise<void>;
}

export interface VectorEntry {
  id: string;
  vector: number[];
  metadata: Record<string, unknown>;
  content: string;
}

export interface VectorSearchResult {
  id: string;
  score: number;
  metadata: Record<string, unknown>;
  content: string;
}

export interface SearchResult {
  email: Email;
  score: number;
  highlights?: string[];
  matchType: 'semantic' | 'fulltext' | 'hybrid';
}

export interface SearchOptions {
  limit?: number;
  offset?: number;
  folder?: string;
  label?: string;
  from?: string;
  after?: Date;
  before?: Date;
  minScore?: number;
}

export interface HybridSearchOptions extends SearchOptions {
  alpha?: number;
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

export type AttachmentParseDepth = 'basic' | 'medium' | 'deep';

export interface ParsedAttachment {
  filename: string;
  contentType: string;
  size: number;
  text?: string;
  markdown?: string;
  metadata?: Record<string, unknown>;
  pages?: number;
  images?: ParsedImage[];
  tables?: ParsedTable[];
  structuredData?: Record<string, unknown>;
}

export interface ParsedImage {
  index: number;
  description?: string;
  ocrText?: string;
  width?: number;
  height?: number;
  data?: Buffer | Uint8Array;
  mimeType?: string;
}

export interface ParsedTable {
  headers: string[];
  rows: string[][];
  sheetName?: string;
}

export interface AttachmentParseOptions {
  depth?: AttachmentParseDepth;
  ocrLanguage?: string;
  maxPages?: number;
  extractImages?: boolean;
  extractTables?: boolean;
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export type StorageType = 'memory' | 'sqlite';

export interface StorageConfig {
  type: StorageType;
  path?: string;
}

export interface StorageAdapter {
  readonly name: string;
  initialize(): Promise<void>;
  getEmail(id: string): Promise<Email | null>;
  saveEmail(email: Email): Promise<void>;
  saveEmails(emails: Email[]): Promise<void>;
  deleteEmail(id: string): Promise<void>;
  listEmails(options?: ListEmailsOptions): Promise<ListResult<Email>>;
  getThread(threadId: string): Promise<Thread | null>;
  saveThread(thread: Thread): Promise<void>;
  getMetadata(key: string): Promise<string | null>;
  setMetadata(key: string, value: string): Promise<void>;
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Safety
// ---------------------------------------------------------------------------

export type ApprovalMode = 'all' | 'high-risk' | 'none';

export interface SafetyConfig {
  piiScanning?: boolean;
  credentialScanning?: boolean;
  humanApproval?: ApprovalMode;
  customPolicies?: SafetyPolicy[];
  blockedDomains?: string[];
  allowedDomains?: string[];
  maxRecipientsPerEmail?: number;
  onApprovalRequired?: (email: SendEmailOptions, risks: Risk[]) => Promise<boolean>;
}

export interface SafetyPolicy {
  name: string;
  description: string;
  check(content: string, context: SafetyContext): Risk[];
}

export interface SafetyContext {
  direction: 'inbound' | 'outbound';
  sender?: EmailAddress;
  recipients?: EmailAddress[];
  subject?: string;
  hasAttachments?: boolean;
}

export interface Risk {
  type: 'pii' | 'credential' | 'phishing' | 'malware' | 'policy' | 'domain' | 'custom';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  location?: string;
  matched?: string;
  redacted?: string;
}

export interface ScanResult {
  safe: boolean;
  risks: Risk[];
  blocked: boolean;
  requiresApproval: boolean;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type EmaiEvent =
  | 'email:received'
  | 'email:sent'
  | 'email:read'
  | 'email:deleted'
  | 'email:moved'
  | 'email:labeled'
  | 'email:classified'
  | 'email:indexed'
  | 'safety:risk'
  | 'safety:blocked'
  | 'safety:approved'
  | 'watch:started'
  | 'watch:stopped'
  | 'watch:error'
  | 'error';

export type EmaiEventMap = {
  'email:received': Email;
  'email:sent': SendResult;
  'email:read': { emailId: string };
  'email:deleted': { emailId: string };
  'email:moved': { emailId: string; folder: string };
  'email:labeled': { emailId: string; label: string; action: 'add' | 'remove' };
  'email:classified': { emailId: string; result: ClassificationResult };
  'email:indexed': { emailId: string };
  'safety:risk': { emailId?: string; result: ScanResult };
  'safety:blocked': { emailId?: string; risks: Risk[] };
  'safety:approved': { emailId?: string };
  'watch:started': undefined;
  'watch:stopped': undefined;
  'watch:error': Error;
  error: Error;
};

// ---------------------------------------------------------------------------
// Main config
// ---------------------------------------------------------------------------

export interface EmaiConfig {
  provider: ProviderConfig;
  ai?: AiConfig;
  search?: SearchConfig;
  storage?: StorageConfig;
  safety?: SafetyConfig;
}
