import type {
  EmaiConfig,
  ListEmailsOptions,
  ListResult,
  Email,
  Thread,
  Folder,
  Label,
  SendEmailOptions,
  ReplyOptions,
  ForwardOptions,
  SendResult,
  SearchOptions,
  HybridSearchOptions,
  SearchResult,
  ClassificationResult,
  SummaryResult,
  ActionItem,
  ExtractionResult,
  ComposeOptions,
  ComposeResult,
  PriorityResult,
  ParsedAttachment,
  AttachmentParseOptions,
  ScanResult,
  WatchHandle,
} from '../core/types.js';
import { tryImport } from '../core/utils.js';

// ---------------------------------------------------------------------------
// MCP SDK types — dynamically imported to avoid hard dependency
// ---------------------------------------------------------------------------

interface McpSdkServer {
  setRequestHandler(
    schema: unknown,
    handler: (request: McpRequest) => Promise<unknown>,
  ): void;
  connect(transport: unknown): Promise<void>;
  close(): Promise<void>;
}

interface McpRequest {
  params: Record<string, unknown> & {
    name?: string;
    arguments?: Record<string, unknown>;
  };
}

interface McpServerModule {
  Server: new (
    info: { name: string; version: string },
    options: { capabilities: { tools: Record<string, unknown> } },
  ) => McpSdkServer;
}

interface McpStdioModule {
  StdioServerTransport: new () => unknown;
}

interface McpTypesModule {
  ListToolsRequestSchema: unknown;
  CallToolRequestSchema: unknown;
}

// ---------------------------------------------------------------------------
// EmaiInstance — local interface for the Emai facade
// TODO: Replace with proper import from ../index.js once the main Emai class
//       is implemented. This local interface mirrors the expected API surface.
// ---------------------------------------------------------------------------

export interface EmaiInstance {
  emails: {
    list(options?: ListEmailsOptions): Promise<ListResult<Email>>;
    get(id: string): Promise<Email>;
    send(options: SendEmailOptions): Promise<SendResult>;
    reply(emailId: string, options: ReplyOptions): Promise<SendResult>;
    forward(emailId: string, options: ForwardOptions): Promise<SendResult>;
    createDraft(options: SendEmailOptions): Promise<Email>;
    updateDraft(draftId: string, options: SendEmailOptions): Promise<Email>;
    deleteDraft(draftId: string): Promise<void>;
    markAsRead(emailId: string): Promise<void>;
    markAsUnread(emailId: string): Promise<void>;
    star(emailId: string): Promise<void>;
    unstar(emailId: string): Promise<void>;
    moveToFolder(emailId: string, folder: string): Promise<void>;
    delete(emailId: string): Promise<void>;
    archive(emailId: string): Promise<void>;
    getAttachment(emailId: string, attachmentId: string): Promise<Buffer>;
  };
  threads: {
    get(id: string): Promise<Thread>;
  };
  labels: {
    list(): Promise<Label[]>;
    add(emailId: string, label: string): Promise<void>;
    remove(emailId: string, label: string): Promise<void>;
    create(name: string, color?: string): Promise<Label>;
    delete(labelId: string): Promise<void>;
  };
  folders: {
    list(): Promise<Folder[]>;
    create(name: string, parentId?: string): Promise<Folder>;
    delete(folderId: string): Promise<void>;
  };
  search: {
    semantic(query: string, options?: SearchOptions): Promise<SearchResult[]>;
    fullText(query: string, options?: SearchOptions): Promise<SearchResult[]>;
    hybrid(query: string, options?: HybridSearchOptions): Promise<SearchResult[]>;
    index(options?: { folder?: string; limit?: number }): Promise<{ indexed: number }>;
  };
  ai: {
    classify(emailId: string): Promise<ClassificationResult>;
    summarize(emailId: string): Promise<SummaryResult>;
    summarizeThread(threadId: string): Promise<SummaryResult>;
    extract(emailId: string, schema: Record<string, unknown>): Promise<ExtractionResult>;
    compose(
      options: ComposeOptions & { to?: string; subject?: string },
    ): Promise<ComposeResult>;
    reply(emailId: string, options?: ComposeOptions): Promise<ComposeResult>;
    prioritize(
      emailIds: string[],
    ): Promise<Array<{ emailId: string } & PriorityResult>>;
    detectActions(emailId: string): Promise<ActionItem[]>;
  };
  attachments: {
    parse(
      emailId: string,
      attachmentId: string,
      options?: AttachmentParseOptions,
    ): Promise<ParsedAttachment>;
    ocr(
      emailId: string,
      attachmentId: string,
      options?: { language?: string },
    ): Promise<{ text: string }>;
    describe(
      emailId: string,
      attachmentId: string,
      options?: { prompt?: string },
    ): Promise<{ description: string }>;
  };
  safety: {
    scan(emailId: string): Promise<ScanResult>;
  };
  watch: {
    start(callback?: (email: Email) => void): Promise<WatchHandle>;
    stop(): Promise<void>;
  };
}

// ---------------------------------------------------------------------------
// Public handle returned from createEmaiMcpServer
// ---------------------------------------------------------------------------

export interface McpServerHandle {
  connect(transport: unknown): Promise<void>;
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// JSON Schema helper type (for tool inputSchema definitions)
// ---------------------------------------------------------------------------

interface JsonSchema {
  type: string;
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: string[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  format?: string;
  additionalProperties?: boolean | JsonSchema;
}

interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonSchema;
}

// ---------------------------------------------------------------------------
// Tool definitions — every emai capability exposed as an MCP tool
// ---------------------------------------------------------------------------

const TOOLS: ToolDefinition[] = [
  // -- Email Reading -------------------------------------------------------
  {
    name: 'list_emails',
    description:
      'List emails with optional filtering by folder, label, sender, recipient, subject, date range, attachment/read/starred status, and pagination.',
    inputSchema: {
      type: 'object',
      properties: {
        folder: {
          type: 'string',
          description: 'Folder name (inbox, sent, drafts, trash, spam, archive, or custom)',
        },
        label: { type: 'string', description: 'Filter by label name' },
        from: { type: 'string', description: 'Filter by sender email address' },
        to: { type: 'string', description: 'Filter by recipient email address' },
        subject: { type: 'string', description: 'Filter by subject substring' },
        query: { type: 'string', description: 'Free-form provider search query' },
        after: {
          type: 'string',
          format: 'date-time',
          description: 'Only emails after this ISO 8601 date',
        },
        before: {
          type: 'string',
          format: 'date-time',
          description: 'Only emails before this ISO 8601 date',
        },
        hasAttachment: { type: 'boolean', description: 'Filter by attachment presence' },
        isRead: { type: 'boolean', description: 'Filter by read status' },
        isStarred: { type: 'boolean', description: 'Filter by starred status' },
        limit: {
          type: 'integer',
          description: 'Maximum emails to return (1–100)',
          default: 20,
          minimum: 1,
          maximum: 100,
        },
        offset: { type: 'integer', description: 'Offset for pagination', minimum: 0 },
        cursor: { type: 'string', description: 'Cursor for cursor-based pagination' },
        sortBy: { type: 'string', enum: ['date', 'subject', 'from'], description: 'Sort field' },
        sortOrder: { type: 'string', enum: ['asc', 'desc'], description: 'Sort direction' },
      },
    },
  },
  {
    name: 'get_email',
    description:
      'Retrieve a single email by ID with full body, headers, and attachment metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        emailId: { type: 'string', description: 'Unique email identifier' },
      },
      required: ['emailId'],
    },
  },
  {
    name: 'get_thread',
    description:
      'Retrieve a conversation thread by ID with all emails, participants, and metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        threadId: { type: 'string', description: 'Thread identifier' },
      },
      required: ['threadId'],
    },
  },
  {
    name: 'get_attachment',
    description:
      'Download an email attachment. Returns base64-encoded content with size metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        emailId: { type: 'string', description: 'Email containing the attachment' },
        attachmentId: { type: 'string', description: 'Attachment identifier' },
      },
      required: ['emailId', 'attachmentId'],
    },
  },

  // -- Email Sending -------------------------------------------------------
  {
    name: 'send_email',
    description:
      'Send a new email with recipients, subject, body (text and/or HTML), optional CC/BCC, and scheduled send.',
    inputSchema: {
      type: 'object',
      properties: {
        to: {
          type: 'array',
          items: { type: 'string' },
          description: 'Recipient email addresses',
        },
        cc: { type: 'array', items: { type: 'string' }, description: 'CC addresses' },
        bcc: { type: 'array', items: { type: 'string' }, description: 'BCC addresses' },
        subject: { type: 'string', description: 'Email subject' },
        text: { type: 'string', description: 'Plain-text body' },
        html: { type: 'string', description: 'HTML body' },
        replyTo: { type: 'string', description: 'Reply-to address' },
        scheduledAt: {
          type: 'string',
          format: 'date-time',
          description: 'ISO 8601 timestamp to schedule sending',
        },
      },
      required: ['to', 'subject'],
    },
  },
  {
    name: 'reply_to_email',
    description: 'Reply to an existing email. Supports reply-to-sender or reply-all.',
    inputSchema: {
      type: 'object',
      properties: {
        emailId: { type: 'string', description: 'Email ID to reply to' },
        text: { type: 'string', description: 'Plain-text reply body' },
        html: { type: 'string', description: 'HTML reply body' },
        replyAll: {
          type: 'boolean',
          description: 'Reply to all recipients instead of sender only',
          default: false,
        },
      },
      required: ['emailId'],
    },
  },
  {
    name: 'forward_email',
    description: 'Forward an email to new recipients with an optional additional message.',
    inputSchema: {
      type: 'object',
      properties: {
        emailId: { type: 'string', description: 'Email ID to forward' },
        to: {
          type: 'array',
          items: { type: 'string' },
          description: 'Forward recipients',
        },
        text: { type: 'string', description: 'Additional plain-text message' },
        html: { type: 'string', description: 'Additional HTML message' },
      },
      required: ['emailId', 'to'],
    },
  },
  {
    name: 'create_draft',
    description: 'Create a new email draft for later editing or sending.',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'array', items: { type: 'string' }, description: 'Recipients' },
        cc: { type: 'array', items: { type: 'string' }, description: 'CC addresses' },
        bcc: { type: 'array', items: { type: 'string' }, description: 'BCC addresses' },
        subject: { type: 'string', description: 'Subject line' },
        text: { type: 'string', description: 'Plain-text body' },
        html: { type: 'string', description: 'HTML body' },
      },
      required: ['subject'],
    },
  },
  {
    name: 'update_draft',
    description: 'Update an existing draft with new content or recipients.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string', description: 'Draft ID to update' },
        to: { type: 'array', items: { type: 'string' }, description: 'Recipients' },
        cc: { type: 'array', items: { type: 'string' }, description: 'CC addresses' },
        bcc: { type: 'array', items: { type: 'string' }, description: 'BCC addresses' },
        subject: { type: 'string', description: 'Subject line' },
        text: { type: 'string', description: 'Plain-text body' },
        html: { type: 'string', description: 'HTML body' },
      },
      required: ['draftId'],
    },
  },
  {
    name: 'delete_draft',
    description: 'Permanently delete an email draft.',
    inputSchema: {
      type: 'object',
      properties: {
        draftId: { type: 'string', description: 'Draft ID to delete' },
      },
      required: ['draftId'],
    },
  },

  // -- Email Management ----------------------------------------------------
  {
    name: 'mark_as_read',
    description: 'Mark an email as read.',
    inputSchema: {
      type: 'object',
      properties: { emailId: { type: 'string', description: 'Email ID' } },
      required: ['emailId'],
    },
  },
  {
    name: 'mark_as_unread',
    description: 'Mark an email as unread.',
    inputSchema: {
      type: 'object',
      properties: { emailId: { type: 'string', description: 'Email ID' } },
      required: ['emailId'],
    },
  },
  {
    name: 'star_email',
    description: 'Star or flag an email for follow-up.',
    inputSchema: {
      type: 'object',
      properties: { emailId: { type: 'string', description: 'Email ID' } },
      required: ['emailId'],
    },
  },
  {
    name: 'unstar_email',
    description: 'Remove star/flag from an email.',
    inputSchema: {
      type: 'object',
      properties: { emailId: { type: 'string', description: 'Email ID' } },
      required: ['emailId'],
    },
  },
  {
    name: 'move_to_folder',
    description: 'Move an email to a different folder.',
    inputSchema: {
      type: 'object',
      properties: {
        emailId: { type: 'string', description: 'Email ID' },
        folder: { type: 'string', description: 'Target folder name or ID' },
      },
      required: ['emailId', 'folder'],
    },
  },
  {
    name: 'delete_email',
    description: 'Delete an email (moves to trash or permanently deletes depending on provider).',
    inputSchema: {
      type: 'object',
      properties: { emailId: { type: 'string', description: 'Email ID to delete' } },
      required: ['emailId'],
    },
  },
  {
    name: 'archive_email',
    description: 'Archive an email — removes from inbox while keeping it accessible.',
    inputSchema: {
      type: 'object',
      properties: { emailId: { type: 'string', description: 'Email ID to archive' } },
      required: ['emailId'],
    },
  },

  // -- Labels & Folders ----------------------------------------------------
  {
    name: 'list_labels',
    description: 'List all available labels/tags including system and user-created labels.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'add_label',
    description: 'Add a label to an email.',
    inputSchema: {
      type: 'object',
      properties: {
        emailId: { type: 'string', description: 'Email ID' },
        label: { type: 'string', description: 'Label name to add' },
      },
      required: ['emailId', 'label'],
    },
  },
  {
    name: 'remove_label',
    description: 'Remove a label from an email.',
    inputSchema: {
      type: 'object',
      properties: {
        emailId: { type: 'string', description: 'Email ID' },
        label: { type: 'string', description: 'Label name to remove' },
      },
      required: ['emailId', 'label'],
    },
  },
  {
    name: 'create_label',
    description: 'Create a new user label/tag with an optional color.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Label name' },
        color: { type: 'string', description: 'Label color as hex (e.g. "#ff0000")' },
      },
      required: ['name'],
    },
  },
  {
    name: 'delete_label',
    description: 'Delete a label. Emails with this label are not deleted.',
    inputSchema: {
      type: 'object',
      properties: { labelId: { type: 'string', description: 'Label ID' } },
      required: ['labelId'],
    },
  },
  {
    name: 'list_folders',
    description: 'List all email folders with unread and total message counts.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'create_folder',
    description: 'Create a new email folder, optionally nested under a parent.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Folder name' },
        parentId: { type: 'string', description: 'Parent folder ID for nesting' },
      },
      required: ['name'],
    },
  },

  // -- Search --------------------------------------------------------------
  {
    name: 'search_semantic',
    description:
      'Semantic search using natural language — finds emails by meaning, not just keywords. Requires AI + search configured.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language search query' },
        limit: { type: 'integer', description: 'Max results to return', default: 10, minimum: 1 },
        folder: { type: 'string', description: 'Restrict search to folder' },
        label: { type: 'string', description: 'Restrict search to label' },
        from: { type: 'string', description: 'Restrict to sender address' },
        after: { type: 'string', format: 'date-time', description: 'Only after this ISO date' },
        before: { type: 'string', format: 'date-time', description: 'Only before this ISO date' },
        minScore: {
          type: 'number',
          description: 'Minimum relevance score (0–1)',
          minimum: 0,
          maximum: 1,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_fulltext',
    description:
      'Full-text keyword search with boolean operators (AND, OR, NOT) and "exact phrase" matching.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query — supports AND, OR, NOT, and "exact phrase"',
        },
        limit: { type: 'integer', description: 'Max results', default: 10, minimum: 1 },
        folder: { type: 'string', description: 'Restrict to folder' },
        label: { type: 'string', description: 'Restrict to label' },
        from: { type: 'string', description: 'Restrict to sender' },
        after: { type: 'string', format: 'date-time', description: 'Only after this date' },
        before: { type: 'string', format: 'date-time', description: 'Only before this date' },
        minScore: { type: 'number', description: 'Minimum relevance score', minimum: 0 },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_hybrid',
    description:
      'Combined semantic + full-text search. The alpha parameter controls blending: 1.0 = pure semantic, 0.0 = pure keyword.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        alpha: {
          type: 'number',
          description: 'Blend weight — 1.0 is pure semantic, 0.0 is pure keyword',
          default: 0.5,
          minimum: 0,
          maximum: 1,
        },
        limit: { type: 'integer', description: 'Max results', default: 10, minimum: 1 },
        folder: { type: 'string', description: 'Restrict to folder' },
        label: { type: 'string', description: 'Restrict to label' },
        from: { type: 'string', description: 'Restrict to sender' },
        after: { type: 'string', format: 'date-time', description: 'Only after this date' },
        before: { type: 'string', format: 'date-time', description: 'Only before this date' },
        minScore: { type: 'number', description: 'Minimum relevance score', minimum: 0 },
      },
      required: ['query'],
    },
  },
  {
    name: 'index_emails',
    description:
      'Index emails for semantic and full-text search. Run this before searching to populate the search index.',
    inputSchema: {
      type: 'object',
      properties: {
        folder: { type: 'string', description: 'Only index emails from this folder' },
        limit: { type: 'integer', description: 'Max emails to index in this batch', minimum: 1 },
      },
    },
  },

  // -- AI Features ---------------------------------------------------------
  {
    name: 'classify_email',
    description:
      'Classify an email into a category (primary, social, promotions, spam, etc.) with confidence score, sentiment, and urgency detection.',
    inputSchema: {
      type: 'object',
      properties: { emailId: { type: 'string', description: 'Email ID to classify' } },
      required: ['emailId'],
    },
  },
  {
    name: 'summarize_email',
    description:
      'Generate a concise summary with key points, action items, sentiment, and topic tags.',
    inputSchema: {
      type: 'object',
      properties: { emailId: { type: 'string', description: 'Email ID to summarize' } },
      required: ['emailId'],
    },
  },
  {
    name: 'summarize_thread',
    description:
      'Summarize an entire conversation thread — captures progression, decisions, and action items.',
    inputSchema: {
      type: 'object',
      properties: { threadId: { type: 'string', description: 'Thread ID to summarize' } },
      required: ['threadId'],
    },
  },
  {
    name: 'extract_data',
    description:
      'Extract structured data from an email using a JSON schema. Pass a schema describing the fields to extract (e.g. order number, date, total).',
    inputSchema: {
      type: 'object',
      properties: {
        emailId: { type: 'string', description: 'Email ID to extract from' },
        schema: {
          type: 'object',
          description:
            'JSON Schema describing the structure to extract, e.g. { "type": "object", "properties": { "orderNumber": { "type": "string" } } }',
          additionalProperties: true,
        },
      },
      required: ['emailId', 'schema'],
    },
  },
  {
    name: 'compose_email',
    description:
      'AI-compose a new email from instructions. Specify tone, length, language, and optional recipient/subject for context.',
    inputSchema: {
      type: 'object',
      properties: {
        instructions: {
          type: 'string',
          description: 'What the email should communicate or accomplish',
        },
        to: { type: 'string', description: 'Intended recipient (gives AI context)' },
        subject: { type: 'string', description: 'Desired subject (or omit to let AI generate)' },
        context: { type: 'string', description: 'Background context for the AI' },
        tone: {
          type: 'string',
          enum: ['professional', 'casual', 'friendly', 'formal', 'empathetic'],
          description: 'Desired tone of voice',
        },
        length: {
          type: 'string',
          enum: ['short', 'medium', 'long'],
          description: 'Desired length',
        },
        language: { type: 'string', description: 'Language code (e.g. "en", "es", "fr")' },
      },
      required: ['instructions'],
    },
  },
  {
    name: 'compose_reply',
    description:
      'AI-compose a reply to an existing email. Optionally specify tone, length, and instructions.',
    inputSchema: {
      type: 'object',
      properties: {
        emailId: { type: 'string', description: 'Email ID to reply to' },
        instructions: { type: 'string', description: 'What the reply should say' },
        context: { type: 'string', description: 'Additional context' },
        tone: {
          type: 'string',
          enum: ['professional', 'casual', 'friendly', 'formal', 'empathetic'],
        },
        length: { type: 'string', enum: ['short', 'medium', 'long'] },
        language: { type: 'string', description: 'Language code' },
      },
      required: ['emailId'],
    },
  },
  {
    name: 'prioritize_emails',
    description:
      'Score and rank emails by priority (critical/high/medium/low/none) with reasoning and suggested response time.',
    inputSchema: {
      type: 'object',
      properties: {
        emailIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Email IDs to prioritize',
        },
      },
      required: ['emailIds'],
    },
  },
  {
    name: 'detect_actions',
    description:
      'Detect action items, tasks, and follow-ups in an email with assignees, due dates, and priorities.',
    inputSchema: {
      type: 'object',
      properties: { emailId: { type: 'string', description: 'Email ID to analyze' } },
      required: ['emailId'],
    },
  },

  // -- Attachments ---------------------------------------------------------
  {
    name: 'parse_attachment',
    description:
      'Parse a document attachment (PDF, Word, Excel, CSV, etc.) and extract text, tables, metadata, and optionally images.',
    inputSchema: {
      type: 'object',
      properties: {
        emailId: { type: 'string', description: 'Email ID' },
        attachmentId: { type: 'string', description: 'Attachment ID' },
        depth: {
          type: 'string',
          enum: ['basic', 'medium', 'deep'],
          description: 'Parse depth — "deep" extracts full structure',
          default: 'medium',
        },
        extractImages: {
          type: 'boolean',
          description: 'Extract embedded images from the document',
          default: false,
        },
        extractTables: {
          type: 'boolean',
          description: 'Extract tables as structured data',
          default: true,
        },
        maxPages: { type: 'integer', description: 'Limit pages to parse (PDFs)', minimum: 1 },
        ocrLanguage: {
          type: 'string',
          description: 'OCR language code for scanned pages (e.g. "eng")',
        },
      },
      required: ['emailId', 'attachmentId'],
    },
  },
  {
    name: 'ocr_attachment',
    description:
      'Run OCR on an image or scanned PDF attachment to extract text.',
    inputSchema: {
      type: 'object',
      properties: {
        emailId: { type: 'string', description: 'Email ID' },
        attachmentId: { type: 'string', description: 'Attachment ID' },
        language: {
          type: 'string',
          description: 'OCR language code (e.g. "eng", "spa", "deu")',
          default: 'eng',
        },
      },
      required: ['emailId', 'attachmentId'],
    },
  },
  {
    name: 'describe_attachment',
    description:
      'Describe an image attachment using vision AI. Returns a natural language description.',
    inputSchema: {
      type: 'object',
      properties: {
        emailId: { type: 'string', description: 'Email ID' },
        attachmentId: { type: 'string', description: 'Attachment ID' },
        prompt: {
          type: 'string',
          description: 'Custom vision prompt (e.g. "Describe the chart in this image")',
        },
      },
      required: ['emailId', 'attachmentId'],
    },
  },

  // -- Safety --------------------------------------------------------------
  {
    name: 'scan_email',
    description:
      'Scan an email for security risks: phishing, malware links, PII exposure, credential leaks, and policy violations.',
    inputSchema: {
      type: 'object',
      properties: { emailId: { type: 'string', description: 'Email ID to scan' } },
      required: ['emailId'],
    },
  },

  // -- Monitoring ----------------------------------------------------------
  {
    name: 'start_watching',
    description:
      'Start watching the mailbox for new incoming emails. Events are emitted as they arrive.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'stop_watching',
    description: 'Stop watching for new emails.',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ---------------------------------------------------------------------------
// Serialization — safely converts results to JSON text for MCP responses
// ---------------------------------------------------------------------------

function serialize(value: unknown): string {
  return JSON.stringify(
    value,
    (_key: string, val: unknown): unknown => {
      if (val instanceof Uint8Array) {
        return `<binary: ${val.length} bytes>`;
      }
      if (
        typeof val === 'object' &&
        val !== null &&
        'type' in val &&
        (val as Record<string, unknown>).type === 'Buffer' &&
        'data' in val
      ) {
        const data = (val as Record<string, unknown>).data;
        return `<binary: ${Array.isArray(data) ? data.length : 0} bytes>`;
      }
      return val;
    },
    2,
  );
}

// ---------------------------------------------------------------------------
// Search options builder — shared by semantic, fulltext, hybrid tools
// ---------------------------------------------------------------------------

function buildSearchOptions(args: Record<string, unknown>): SearchOptions {
  return {
    limit: args.limit as number | undefined,
    offset: args.offset as number | undefined,
    folder: args.folder as string | undefined,
    label: args.label as string | undefined,
    from: args.from as string | undefined,
    after: args.after ? new Date(args.after as string) : undefined,
    before: args.before ? new Date(args.before as string) : undefined,
    minScore: args.minScore as number | undefined,
  };
}

// ---------------------------------------------------------------------------
// Tool handler dispatch — maps each tool name to its implementation
// ---------------------------------------------------------------------------

type ToolHandler = (args: Record<string, unknown>) => Promise<unknown>;

interface ServerState {
  watchHandle: WatchHandle | null;
}

function createHandlers(
  emai: EmaiInstance,
  state: ServerState,
): Record<string, ToolHandler> {
  return {
    // -- Email Reading -----------------------------------------------------
    list_emails: async (args) =>
      emai.emails.list({
        folder: args.folder as string | undefined,
        label: args.label as string | undefined,
        from: args.from as string | undefined,
        to: args.to as string | undefined,
        subject: args.subject as string | undefined,
        query: args.query as string | undefined,
        after: args.after ? new Date(args.after as string) : undefined,
        before: args.before ? new Date(args.before as string) : undefined,
        hasAttachment: args.hasAttachment as boolean | undefined,
        isRead: args.isRead as boolean | undefined,
        isStarred: args.isStarred as boolean | undefined,
        limit: args.limit as number | undefined,
        offset: args.offset as number | undefined,
        cursor: args.cursor as string | undefined,
        sortBy: args.sortBy as ListEmailsOptions['sortBy'],
        sortOrder: args.sortOrder as ListEmailsOptions['sortOrder'],
      }),

    get_email: async (args) => emai.emails.get(args.emailId as string),

    get_thread: async (args) => emai.threads.get(args.threadId as string),

    get_attachment: async (args) => {
      const content = await emai.emails.getAttachment(
        args.emailId as string,
        args.attachmentId as string,
      );
      return {
        attachmentId: args.attachmentId,
        encoding: 'base64',
        size: content.length,
        content: Buffer.from(content).toString('base64'),
      };
    },

    // -- Email Sending -----------------------------------------------------
    send_email: async (args) =>
      emai.emails.send({
        to: args.to as string[],
        cc: args.cc as string[] | undefined,
        bcc: args.bcc as string[] | undefined,
        subject: args.subject as string,
        text: args.text as string | undefined,
        html: args.html as string | undefined,
        replyTo: args.replyTo as string | undefined,
        scheduledAt: args.scheduledAt
          ? new Date(args.scheduledAt as string)
          : undefined,
      }),

    reply_to_email: async (args) =>
      emai.emails.reply(args.emailId as string, {
        text: args.text as string | undefined,
        html: args.html as string | undefined,
        replyAll: args.replyAll as boolean | undefined,
      }),

    forward_email: async (args) =>
      emai.emails.forward(args.emailId as string, {
        to: args.to as string[],
        text: args.text as string | undefined,
        html: args.html as string | undefined,
      }),

    create_draft: async (args) =>
      emai.emails.createDraft({
        to: (args.to as string[] | undefined) ?? [],
        subject: args.subject as string,
        cc: args.cc as string[] | undefined,
        bcc: args.bcc as string[] | undefined,
        text: args.text as string | undefined,
        html: args.html as string | undefined,
      }),

    update_draft: async (args) =>
      emai.emails.updateDraft(args.draftId as string, {
        to: (args.to as string[] | undefined) ?? [],
        subject: (args.subject as string | undefined) ?? '',
        cc: args.cc as string[] | undefined,
        bcc: args.bcc as string[] | undefined,
        text: args.text as string | undefined,
        html: args.html as string | undefined,
      }),

    delete_draft: async (args) => {
      await emai.emails.deleteDraft(args.draftId as string);
      return { success: true };
    },

    // -- Email Management --------------------------------------------------
    mark_as_read: async (args) => {
      await emai.emails.markAsRead(args.emailId as string);
      return { success: true, emailId: args.emailId };
    },

    mark_as_unread: async (args) => {
      await emai.emails.markAsUnread(args.emailId as string);
      return { success: true, emailId: args.emailId };
    },

    star_email: async (args) => {
      await emai.emails.star(args.emailId as string);
      return { success: true, emailId: args.emailId };
    },

    unstar_email: async (args) => {
      await emai.emails.unstar(args.emailId as string);
      return { success: true, emailId: args.emailId };
    },

    move_to_folder: async (args) => {
      await emai.emails.moveToFolder(
        args.emailId as string,
        args.folder as string,
      );
      return { success: true, emailId: args.emailId, folder: args.folder };
    },

    delete_email: async (args) => {
      await emai.emails.delete(args.emailId as string);
      return { success: true, emailId: args.emailId };
    },

    archive_email: async (args) => {
      await emai.emails.archive(args.emailId as string);
      return { success: true, emailId: args.emailId };
    },

    // -- Labels & Folders --------------------------------------------------
    list_labels: async () => emai.labels.list(),

    add_label: async (args) => {
      await emai.labels.add(args.emailId as string, args.label as string);
      return { success: true, emailId: args.emailId, label: args.label };
    },

    remove_label: async (args) => {
      await emai.labels.remove(args.emailId as string, args.label as string);
      return { success: true, emailId: args.emailId, label: args.label };
    },

    create_label: async (args) =>
      emai.labels.create(args.name as string, args.color as string | undefined),

    delete_label: async (args) => {
      await emai.labels.delete(args.labelId as string);
      return { success: true, labelId: args.labelId };
    },

    list_folders: async () => emai.folders.list(),

    create_folder: async (args) =>
      emai.folders.create(
        args.name as string,
        args.parentId as string | undefined,
      ),

    // -- Search ------------------------------------------------------------
    search_semantic: async (args) =>
      emai.search.semantic(args.query as string, buildSearchOptions(args)),

    search_fulltext: async (args) =>
      emai.search.fullText(args.query as string, buildSearchOptions(args)),

    search_hybrid: async (args) =>
      emai.search.hybrid(args.query as string, {
        ...buildSearchOptions(args),
        alpha: args.alpha as number | undefined,
      }),

    index_emails: async (args) =>
      emai.search.index({
        folder: args.folder as string | undefined,
        limit: args.limit as number | undefined,
      }),

    // -- AI Features -------------------------------------------------------
    classify_email: async (args) =>
      emai.ai.classify(args.emailId as string),

    summarize_email: async (args) =>
      emai.ai.summarize(args.emailId as string),

    summarize_thread: async (args) =>
      emai.ai.summarizeThread(args.threadId as string),

    extract_data: async (args) =>
      emai.ai.extract(
        args.emailId as string,
        args.schema as Record<string, unknown>,
      ),

    compose_email: async (args) =>
      emai.ai.compose({
        instructions: args.instructions as string,
        to: args.to as string | undefined,
        subject: args.subject as string | undefined,
        context: args.context as string | undefined,
        tone: args.tone as ComposeOptions['tone'],
        length: args.length as ComposeOptions['length'],
        language: args.language as string | undefined,
      }),

    compose_reply: async (args) =>
      emai.ai.reply(args.emailId as string, {
        instructions: args.instructions as string | undefined,
        context: args.context as string | undefined,
        tone: args.tone as ComposeOptions['tone'],
        length: args.length as ComposeOptions['length'],
        language: args.language as string | undefined,
      }),

    prioritize_emails: async (args) =>
      emai.ai.prioritize(args.emailIds as string[]),

    detect_actions: async (args) =>
      emai.ai.detectActions(args.emailId as string),

    // -- Attachments -------------------------------------------------------
    parse_attachment: async (args) =>
      emai.attachments.parse(
        args.emailId as string,
        args.attachmentId as string,
        {
          depth: args.depth as AttachmentParseOptions['depth'],
          extractImages: args.extractImages as boolean | undefined,
          extractTables: args.extractTables as boolean | undefined,
          maxPages: args.maxPages as number | undefined,
          ocrLanguage: args.ocrLanguage as string | undefined,
        },
      ),

    ocr_attachment: async (args) =>
      emai.attachments.ocr(
        args.emailId as string,
        args.attachmentId as string,
        { language: args.language as string | undefined },
      ),

    describe_attachment: async (args) =>
      emai.attachments.describe(
        args.emailId as string,
        args.attachmentId as string,
        { prompt: args.prompt as string | undefined },
      ),

    // -- Safety ------------------------------------------------------------
    scan_email: async (args) =>
      emai.safety.scan(args.emailId as string),

    // -- Monitoring --------------------------------------------------------
    start_watching: async () => {
      if (state.watchHandle) {
        return { status: 'already_watching' };
      }
      state.watchHandle = await emai.watch.start();
      return { status: 'watching' };
    },

    stop_watching: async () => {
      if (!state.watchHandle) {
        return { status: 'not_watching' };
      }
      await emai.watch.stop();
      state.watchHandle = null;
      return { status: 'stopped' };
    },
  };
}

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

export async function createEmaiMcpServer(
  emai: EmaiInstance,
): Promise<McpServerHandle> {
  const { Server } = await tryImport<McpServerModule>(
    '@modelcontextprotocol/sdk/server/index.js',
    'MCP server',
  );
  const types = await tryImport<McpTypesModule>(
    '@modelcontextprotocol/sdk/types.js',
    'MCP server',
  );

  const server = new Server(
    { name: 'emai', version: '0.1.0' },
    { capabilities: { tools: {} } },
  );

  const state: ServerState = { watchHandle: null };
  const handlers = createHandlers(emai, state);

  server.setRequestHandler(
    types.ListToolsRequestSchema,
    async () => ({ tools: TOOLS }),
  );

  server.setRequestHandler(
    types.CallToolRequestSchema,
    async (request: McpRequest) => {
      const toolName = request.params.name;
      const args = (request.params.arguments ?? {}) as Record<string, unknown>;

      if (!toolName || !handlers[toolName]) {
        return {
          content: [{ type: 'text', text: `Unknown tool: ${toolName ?? '(none)'}` }],
          isError: true,
        };
      }

      try {
        const result = await handlers[toolName](args);
        return {
          content: [{ type: 'text', text: serialize(result) }],
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const code =
          typeof err === 'object' && err !== null && 'code' in err
            ? (err as { code: string }).code
            : 'UNKNOWN';
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: message, code }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  return server;
}

// ---------------------------------------------------------------------------
// Convenience starter — creates the server and connects via stdio
// ---------------------------------------------------------------------------

export async function startEmaiMcpServer(emai: EmaiInstance): Promise<void> {
  const server = await createEmaiMcpServer(emai);
  const { StdioServerTransport } = await tryImport<McpStdioModule>(
    '@modelcontextprotocol/sdk/server/stdio.js',
    'MCP server',
  );
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export type { EmaiConfig };
