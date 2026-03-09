<p align="center">
  <h1 align="center">emai</h1>
  <p align="center">AI-first unified email toolkit for agents</p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@petter100/emai"><img alt="npm" src="https://img.shields.io/npm/v/@petter100/emai"></a>
  <a href="https://github.com/rafapetter/emai/blob/main/LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-blue.svg"></a>
  <a href="https://www.npmjs.com/package/@petter100/emai"><img alt="npm downloads" src="https://img.shields.io/npm/dm/@petter100/emai"></a>
</p>

Read, send, search, classify, extract, and manage email across any provider — with AI built in.

```bash
npm install @petter100/emai
```

---

## Why emai?

AI agents need email capabilities — reading inboxes, understanding content, extracting data from attachments, composing replies, and managing messages. But today's email landscape is fragmented: Gmail API differs from Microsoft Graph differs from IMAP, and bolting on AI features means stitching together multiple libraries.

**emai** unifies everything into one toolkit:

| Capability | What it does |
|------------|-------------|
| **Any provider** | Gmail, Outlook, IMAP/SMTP through a single API |
| **AI-native** | Classification, semantic search, smart compose, extraction, summarization, priority scoring |
| **Attachment intelligence** | Parse PDFs, images (OCR + vision), Office docs, CSV, video |
| **Agent-ready** | npm package, MCP server (37 tools), and CLI — agents can install and start using immediately |
| **Safety built in** | PII scanning, credential detection, phishing analysis, human-in-the-loop approval |
| **Real-time** | IMAP IDLE, webhooks, event streaming |

### See it in action

The built-in **Playground** lets you test every feature against a real mailbox — classification, extraction, priority scoring, safety scanning, and more:

![Dashboard — test results](docs/screenshots/dashboard-results.png)

![AI classification with confidence scores](docs/screenshots/dashboard-ai.png)

![Data extraction — metadata + AI analysis + attachments](docs/screenshots/dashboard-extraction.png)

---

## Table of Contents

- [Quick Start](#quick-start)
- [Providers](#providers)
  - [Gmail API](#gmail-api)
  - [Microsoft Outlook](#microsoft-outlook)
  - [IMAP/SMTP](#imapsmtp-any-provider)
- [AI Adapters](#ai-adapters)
- [AI Features](#ai-features)
  - [Classification](#classification)
  - [Summarization](#summarization)
  - [Structured Data Extraction](#structured-data-extraction)
  - [Smart Compose & Reply](#smart-compose--reply)
  - [Priority Scoring](#priority-scoring)
  - [Action Item Detection](#action-item-detection)
- [Email Operations](#email-operations)
  - [Reading Emails](#reading-emails)
  - [Sending Emails](#sending-emails)
  - [Drafts](#drafts)
  - [Managing Emails](#managing-emails)
  - [Labels & Folders](#labels--folders)
- [Threading](#threading)
- [Search](#search)
  - [Semantic Search](#semantic-search)
  - [Full-Text Search](#full-text-search)
  - [Hybrid Search](#hybrid-search)
  - [Vector Stores](#vector-stores)
- [Attachments](#attachments)
- [Safety](#safety)
- [Events & Real-Time](#events--real-time)
  - [Events](#events)
  - [Watch](#watch)
  - [Webhooks](#webhooks)
- [MCP Server](#mcp-server)
- [CLI](#cli)
- [Playground](#playground)
- [Advanced](#advanced)
  - [Custom LLM Adapter](#custom-llm-adapter)
  - [Custom Vector Store](#custom-vector-store)
  - [Storage](#storage)
- [API Reference](#api-reference)
- [Optional Dependencies](#optional-dependencies)
- [License](#license)

---

## Quick Start

```typescript
import { Emai } from '@petter100/emai';

const emai = new Emai({
  provider: {
    type: 'imap',
    imap: { host: 'imap.gmail.com', port: 993, secure: true, auth: { user: 'you@gmail.com', pass: 'app-password' } },
    smtp: { host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: 'you@gmail.com', pass: 'app-password' } },
  },
  ai: {
    adapter: 'openai',
    apiKey: process.env.OPENAI_API_KEY,
    model: 'gpt-4o',
  },
  search: { store: 'memory' },
});

await emai.connect();

// List recent emails
const { items } = await emai.emails.list({ limit: 10 });

// Classify an email
const classification = await emai.ai.classify(items[0]);
// → { category: 'support', confidence: 0.95, sentiment: 'negative', isUrgent: true }

// Semantic search
await emai.search.index(items);
const results = await emai.search.semantic('invoices from last quarter');

// Extract structured data
import { z } from 'zod';
const InvoiceSchema = z.object({
  invoiceNumber: z.string(),
  amount: z.number(),
  dueDate: z.string(),
  vendor: z.string(),
});
const extracted = await emai.ai.extract(items[0], InvoiceSchema);
// → { data: { invoiceNumber: 'INV-2026-001', amount: 1500, ... }, confidence: 0.92 }

// AI-compose a reply
const reply = await emai.ai.reply(items[0], {
  instructions: 'Thank them and confirm we received the invoice',
  tone: 'professional',
});

// Send
await emai.emails.send({
  to: 'recipient@example.com',
  subject: reply.subject ?? 'Re: Invoice',
  text: reply.text,
});

await emai.disconnect();
```

---

## Providers

### Gmail API

```typescript
const emai = new Emai({
  provider: {
    type: 'gmail',
    credentials: {
      clientId: process.env.GMAIL_CLIENT_ID,
      clientSecret: process.env.GMAIL_CLIENT_SECRET,
      refreshToken: process.env.GMAIL_REFRESH_TOKEN,
    },
  },
});
```

Requires the `googleapis` package: `npm install googleapis`

### Microsoft Outlook

```typescript
const emai = new Emai({
  provider: {
    type: 'outlook',
    credentials: {
      clientId: process.env.OUTLOOK_CLIENT_ID,
      clientSecret: process.env.OUTLOOK_CLIENT_SECRET,
      tenantId: process.env.OUTLOOK_TENANT_ID,     // optional, for multi-tenant
      refreshToken: process.env.OUTLOOK_REFRESH_TOKEN,
    },
  },
});
```

Requires: `npm install @microsoft/microsoft-graph-client`

### IMAP/SMTP (any provider)

Works with any IMAP/SMTP-compatible email service — Gmail, Yahoo, Fastmail, self-hosted, etc.

```typescript
const emai = new Emai({
  provider: {
    type: 'imap',
    imap: {
      host: 'imap.example.com',
      port: 993,
      secure: true,
      auth: { user: 'you@example.com', pass: 'your-password' },
    },
    smtp: {
      host: 'smtp.example.com',
      port: 465,
      secure: true,
      auth: { user: 'you@example.com', pass: 'your-password' },
    },
  },
});
```

OAuth2 is also supported:

```typescript
auth: { user: 'you@example.com', accessToken: 'oauth2-access-token' }
```

Requires: `npm install imapflow nodemailer mailparser`

---

## AI Adapters

emai is LLM-agnostic. Pick any adapter — or bring your own:

| Adapter | Package | Default Model | Default Embedding Model |
|---------|---------|---------------|------------------------|
| `openai` | `openai` | gpt-4o | text-embedding-3-small |
| `anthropic` | `@anthropic-ai/sdk` | claude-sonnet-4-20250514 | (native) |
| `google` | `@google/generative-ai` | gemini-2.0-flash | text-embedding-004 |
| `ollama` | `ollama` | llama3.1 | nomic-embed-text |

```typescript
// OpenAI
ai: { adapter: 'openai', apiKey: '...', model: 'gpt-4o' }

// Anthropic
ai: { adapter: 'anthropic', apiKey: '...', model: 'claude-sonnet-4-20250514' }

// Google Gemini
ai: { adapter: 'google', apiKey: '...', model: 'gemini-2.0-flash' }

// Local via Ollama
ai: { adapter: 'ollama', model: 'llama3.1', baseUrl: 'http://localhost:11434' }

// Custom adapter (see Advanced section)
ai: { adapter: myCustomAdapter }
```

### Full AI Configuration

```typescript
ai: {
  adapter: 'openai',
  apiKey: process.env.OPENAI_API_KEY,
  model: 'gpt-4o',                    // Text/chat model
  embeddingModel: 'text-embedding-3-small',  // For semantic search
  baseUrl: 'https://your-proxy.com/v1',      // Custom endpoint
  temperature: 0.3,                    // 0-1, default 0.3
  maxTokens: 4096,                     // Default 4096
}
```

---

## AI Features

### Classification

Categorize emails into 15 categories with sentiment analysis and urgency detection.

```typescript
const result = await emai.ai.classify(email);
```

**Returns:**
```typescript
{
  category: 'support',           // 15 categories (see below)
  confidence: 0.95,              // 0-1
  sentiment: 'negative',         // 'positive' | 'negative' | 'neutral'
  isUrgent: true,
  isActionRequired: true,
  labels: ['customer-issue', 'billing'],
  reasoning: 'Customer reports billing discrepancy...'
}
```

**Categories:** `primary`, `social`, `promotions`, `updates`, `forums`, `spam`, `phishing`, `support`, `sales`, `billing`, `newsletter`, `notification`, `personal`, `work`, `other`

**Batch classification:**
```typescript
const results = await emai.ai.classifyBatch(emails);
// → ClassificationResult[] — one per email
```

### Summarization

Generate concise summaries with key points, action items, and sentiment.

```typescript
const summary = await emai.ai.summarize(email);
```

**Returns:**
```typescript
{
  summary: 'John requested the Q1 revenue report by Friday...',
  keyPoints: ['Q1 report needed', 'Deadline is Friday', 'Include regional breakdown'],
  participants: [{ name: 'John', address: 'john@acme.com' }],
  actionItems: [
    { description: 'Send Q1 report', assignee: 'you', dueDate: '2026-03-07', priority: 'high', status: 'pending' }
  ],
  sentiment: 'neutral',
  topicTags: ['reporting', 'finance', 'deadline']
}
```

**Thread summarization:**
```typescript
const threadSummary = await emai.ai.summarizeThread(thread);
// Summarizes the entire conversation across all messages

const batchSummary = await emai.ai.summarizeBatch(emails);
// Digest-style summary of multiple emails
```

### Structured Data Extraction

Extract typed, validated data from emails using Zod schemas.

```typescript
import { z } from 'zod';

const OrderSchema = z.object({
  orderId: z.string(),
  items: z.array(z.object({
    name: z.string(),
    quantity: z.number(),
    price: z.number(),
  })),
  total: z.number(),
  shippingAddress: z.string(),
});

const { data, confidence, sources } = await emai.ai.extract(email, OrderSchema);
// data is fully typed as z.infer<typeof OrderSchema>
```

**Returns:**
```typescript
{
  data: {
    orderId: 'ORD-2026-4521',
    items: [{ name: 'Widget Pro', quantity: 2, price: 49.99 }],
    total: 99.98,
    shippingAddress: '123 Main St, San Francisco, CA 94102'
  },
  confidence: 0.92,
  sources: [
    { field: 'orderId', source: 'body', span: 'Order #ORD-2026-4521' },
    { field: 'total', source: 'body', span: 'Total: $99.98' }
  ]
}
```

### Smart Compose & Reply

AI-powered email composition with tone and length control.

```typescript
// Compose a new email
const draft = await emai.ai.compose({
  context: 'Schedule a meeting to discuss Q1 results',
  tone: 'professional',
  length: 'short',
  language: 'en',
});
// → { subject: 'Q1 Results Discussion', text: '...', html: '...' }

// Reply to an email
const reply = await emai.ai.reply(email, {
  instructions: 'Decline politely, suggest next week instead',
  tone: 'friendly',
});
// → { subject: 'Re: Meeting Request', text: '...', html: '...' }
```

**Tone options:** `professional`, `casual`, `friendly`, `formal`, `empathetic`

**Length options:** `short`, `medium`, `long`

**Tone rewriting & writing improvement:**
```typescript
const rewritten = await emai.ai.rewriteInTone(text, 'professional');
const improved = await emai.ai.improveWriting(text);
```

### Priority Scoring

Score email importance on a 0-100 scale with contextual reasoning.

```typescript
const priority = await emai.ai.prioritize(email, {
  userEmail: 'me@company.com',
  vipList: ['ceo@company.com', 'investor@fund.com'],
});
```

**Returns:**
```typescript
{
  score: 85,                           // 0-100
  level: 'high',                       // 'critical' | 'high' | 'medium' | 'low' | 'none'
  reasoning: 'From VIP sender, contains deadline, requires action',
  suggestedResponseTime: '2 hours'     // 'immediate' | 'within 1 hour' | 'today' | 'this week' | 'when convenient'
}
```

**Batch prioritization:**
```typescript
const results = await emai.ai.prioritizeBatch(emails, { userEmail: 'me@company.com' });
// → Array<{ email: Email, priority: PriorityResult }>
```

### Action Item Detection

Extract tasks, deadlines, requests, and follow-ups from emails.

```typescript
const actions = await emai.ai.detectActions(email);
```

**Returns:**
```typescript
[
  {
    description: 'Send Q1 report to finance team',
    assignee: 'you',
    dueDate: '2026-03-07',
    priority: 'high',
    status: 'pending'
  },
  {
    description: 'Schedule follow-up meeting',
    assignee: 'john@acme.com',
    dueDate: null,
    priority: 'medium',
    status: 'pending'
  }
]
```

**Thread-level action detection:**
```typescript
const threadActions = await emai.ai.detectActionsInThread(thread);
// Detects actions across the entire conversation, deduplicating completed items
```

---

## Email Operations

### Reading Emails

```typescript
// List emails with filtering
const { items, total, hasMore, nextCursor } = await emai.emails.list({
  folder: 'inbox',
  limit: 20,
  offset: 0,
  isRead: false,           // Unread only
  isStarred: true,         // Starred only
  hasAttachment: true,     // With attachments
  from: 'john@acme.com',
  subject: 'invoice',
  after: new Date('2026-01-01'),
  before: new Date('2026-03-01'),
  sortBy: 'date',
  sortOrder: 'desc',
});

// Pagination with cursor
const page2 = await emai.emails.list({ cursor: nextCursor, limit: 20 });

// Get a single email
const email = await emai.emails.get('email-id');
```

**Email object shape:**
```typescript
interface Email {
  id: string;
  threadId?: string;
  provider: string;
  from: { name?: string; address: string };
  to: Array<{ name?: string; address: string }>;
  cc: Array<{ name?: string; address: string }>;
  bcc: Array<{ name?: string; address: string }>;
  subject: string;
  body: { text?: string; html?: string; markdown?: string };
  attachments: Attachment[];
  labels: string[];
  folder: string;
  date: Date;
  receivedDate: Date;
  isRead: boolean;
  isStarred: boolean;
  isDraft: boolean;
  snippet?: string;
  headers: Record<string, string>;
}
```

### Sending Emails

```typescript
const result = await emai.emails.send({
  to: 'recipient@example.com',                    // string, array, or EmailAddress
  cc: ['cc1@example.com', 'cc2@example.com'],
  bcc: 'secret@example.com',
  subject: 'Hello from emai',
  text: 'Plain text body',
  html: '<h1>HTML body</h1>',
  attachments: [
    { filename: 'report.pdf', content: pdfBuffer, contentType: 'application/pdf' }
  ],
  replyTo: 'noreply@example.com',
  headers: { 'X-Custom-Header': 'value' },
});
// → { id: '...', threadId: '...', messageId: '<...@mail.example.com>' }
```

**Reply and forward:**
```typescript
// Reply
await emai.emails.reply('email-id', {
  text: 'Thanks for the update!',
  replyAll: true,          // Reply to all recipients
});

// Forward
await emai.emails.forward('email-id', {
  to: 'colleague@example.com',
  text: 'FYI — see below.',
});
```

### Drafts

```typescript
const draft = await emai.emails.createDraft({
  to: 'recipient@example.com',
  subject: 'Draft email',
  text: 'Work in progress...',
});

await emai.emails.updateDraft(draft.id, {
  text: 'Updated content',
});

await emai.emails.deleteDraft(draft.id);
```

### Managing Emails

```typescript
await emai.emails.markAsRead('email-id');
await emai.emails.markAsUnread('email-id');
await emai.emails.star('email-id');
await emai.emails.unstar('email-id');
await emai.emails.moveToFolder('email-id', 'archive');
await emai.emails.archive('email-id');
await emai.emails.delete('email-id');
```

### Labels & Folders

```typescript
// Labels
const labels = await emai.labels.list();
await emai.labels.add('email-id', 'important');
await emai.labels.remove('email-id', 'important');
await emai.labels.create('my-label', '#ff0000');   // with optional color
await emai.labels.delete('label-id');

// Folders
const folders = await emai.folders.list();
// → [{ id, name, path, type, unreadCount, totalCount, children }]
await emai.folders.create('Projects', parentId);
await emai.folders.delete('folder-id');
```

---

## Threading

Automatic conversation thread detection using headers, subjects, and participant analysis.

```typescript
// Get a thread by ID
const thread = await emai.threads.get('thread-id');
// → { id, subject, emails: [...], participants, lastDate, messageCount, labels }

// Detect threads from a list of emails
const threads = emai.threads.detect(emails);
// Groups emails into threads using:
// 1. In-Reply-To / References headers
// 2. Subject normalization (strips Re:/Fw:)
// 3. Participant overlap analysis
```

---

## Search

### Semantic Search

Find emails by meaning, not just keywords. Requires an AI adapter with embedding support.

```typescript
// First, index your emails
await emai.search.index(emails);

// Then search by meaning
const results = await emai.search.semantic('complaints about shipping delays');
// Finds relevant emails even if they don't contain those exact words
```

### Full-Text Search

Keyword search with operator support. Works without an AI adapter.

```typescript
const results = await emai.search.fullText('from:john subject:invoice has:attachment');
```

**Operators:** `from:`, `to:`, `subject:`, `has:attachment`, `is:unread`, `is:starred`, `after:`, `before:`, `label:`

### Hybrid Search

Combine semantic understanding with keyword precision:

```typescript
const results = await emai.search.hybrid('quarterly revenue report', {
  alpha: 0.7,     // 1.0 = pure semantic, 0.0 = pure full-text
  limit: 10,
  minScore: 0.5,
});
```

### Search Options

All search methods accept:

```typescript
{
  limit?: number,        // Default: 10
  offset?: number,
  folder?: string,       // Filter by folder
  label?: string,        // Filter by label
  from?: string,         // Filter by sender
  after?: Date,          // After date
  before?: Date,         // Before date
  minScore?: number,     // Minimum relevance score
}
```

### Vector Stores

Choose where to store search vectors:

| Store | Package | Best For |
|-------|---------|----------|
| `memory` | (built-in) | Development, small mailboxes |
| `sqlite` | `better-sqlite3` | Local persistent storage |
| `pgvector` | `pg` | Production with PostgreSQL |
| `pinecone` | `@pinecone-database/pinecone` | Managed cloud vector DB |
| `weaviate` | `weaviate-client` | Hybrid search at scale |
| `chromadb` | `chromadb` | Local/self-hosted vector DB |

```typescript
// Memory (default, no persistence)
search: { store: 'memory' }

// SQLite (local file)
search: { store: 'sqlite', path: './emails.db' }

// PostgreSQL + pgvector
search: { store: 'pgvector', connectionString: 'postgresql://user:pass@localhost/emails' }

// Pinecone
search: { store: 'pinecone', apiKey: '...', indexName: 'emails', environment: 'us-east-1-aws' }

// Weaviate
search: { store: 'weaviate', url: 'http://localhost:8080', collectionName: 'emails' }

// ChromaDB
search: { store: 'chromadb', url: 'http://localhost:8000', collectionName: 'emails' }
```

---

## Attachments

Parse any attachment format with configurable depth:

```typescript
// Auto-detect and parse
const parsed = await emai.attachments.parse(attachment, { depth: 'deep' });
// → { text, markdown, metadata, pages, tables, images, structuredData }

// Get plain text from any attachment
const text = await emai.attachments.toText(attachment);

// OCR scanned documents and images
const ocrText = await emai.attachments.ocr(attachment);

// Vision AI description
const description = await emai.attachments.describe(attachment);

// Structured data extraction from attachments
const data = await emai.attachments.extract(attachment, InvoiceSchema);

// Download attachment content
const content = await emai.attachments.getContent('email-id', 'attachment-id');
```

### Supported Formats

| Format | Extensions | Required Package |
|--------|-----------|-----------------|
| PDF | `.pdf` | `pdf-parse` |
| Images | `.jpg`, `.png`, `.gif`, `.webp` | `sharp` (processing), `tesseract.js` (OCR) |
| Word | `.docx` | `mammoth` |
| Excel | `.xlsx` | (built-in) |
| PowerPoint | `.pptx` | (built-in) |
| CSV | `.csv` | `papaparse` |
| Plain text | `.txt`, `.md`, `.html` | (built-in) |

### Parse Depth Levels

| Depth | What It Does |
|-------|-------------|
| `basic` | Metadata and raw text extraction |
| `medium` | Full text, tables, markdown conversion |
| `deep` | OCR, vision AI analysis, image descriptions, table extraction |

---

## Safety

Built-in security scanning for outbound emails:

```typescript
const emai = new Emai({
  // ...provider, ai config...
  safety: {
    piiScanning: true,               // Detect PII (SSNs, credit cards, etc.)
    credentialScanning: true,         // Detect API keys, passwords, tokens
    humanApproval: 'high-risk',      // 'all' | 'high-risk' | 'none'
    blockedDomains: ['competitor.com'],
    allowedDomains: ['company.com'],
    maxRecipientsPerEmail: 50,
    onApprovalRequired: async (email, risks) => {
      console.log('Risks detected:', risks);
      return confirm('Send anyway?');
    },
  },
});
```

### Automatic Scanning

When safety is configured, all outbound emails are automatically scanned:

```typescript
await emai.emails.send({ to: '...', subject: '...', text: '...' });
// → Scans for PII, credentials, blocked domains before sending
// → If risks detected, triggers onApprovalRequired callback
```

### Manual Scanning

```typescript
const result = emai.safety.scan(email);
// → {
//   safe: false,
//   risks: [
//     { type: 'pii', severity: 'high', description: 'SSN detected', matched: '***-**-1234' }
//   ],
//   blocked: false,
//   requiresApproval: true
// }
```

### What It Detects

| Type | Examples |
|------|---------|
| **PII** | Email addresses, phone numbers, SSNs, credit card numbers, dates of birth |
| **Credentials** | API keys, passwords, private keys, JWT tokens, connection strings, AWS keys |
| **Phishing** | Suspicious URLs, spoofed sender addresses, urgent payment requests |
| **Policy** | Blocked domains, excessive recipients, custom policy violations |

---

## Events & Real-Time

### Events

Subscribe to email lifecycle events:

```typescript
// Listen for specific events
emai.on('email:received', (email) => {
  console.log(`New email from ${email.from.address}: ${email.subject}`);
});

emai.on('email:sent', (result) => {
  console.log(`Email sent: ${result.id}`);
});

emai.on('safety:risk', ({ result }) => {
  console.log(`Risks detected:`, result.risks);
});

emai.on('error', (err) => {
  console.error('Error:', err.message);
});

// One-time listener
emai.once('email:received', (email) => { /* ... */ });

// Remove listener
const unsubscribe = emai.on('email:received', handler);
unsubscribe();  // or: emai.off('email:received', handler);
```

**All events:**

| Event | Payload | Description |
|-------|---------|-------------|
| `email:received` | `Email` | New email arrived |
| `email:sent` | `SendResult` | Email sent successfully |
| `email:read` | `{ emailId }` | Email marked as read |
| `email:deleted` | `{ emailId }` | Email deleted |
| `email:moved` | `{ emailId, folder }` | Email moved to folder |
| `email:labeled` | `{ emailId, label, action }` | Label added/removed |
| `email:classified` | `{ emailId, result }` | Email classified by AI |
| `email:indexed` | `{ emailId }` | Email added to search index |
| `safety:risk` | `{ emailId?, result }` | Security risk detected |
| `safety:blocked` | `{ emailId?, risks }` | Email blocked by safety |
| `safety:approved` | `{ emailId? }` | Email approved after risk review |
| `watch:started` | `undefined` | Watch started |
| `watch:stopped` | `undefined` | Watch stopped |
| `watch:error` | `Error` | Watch error occurred |
| `error` | `Error` | General error |

### Watch

Monitor for new emails in real-time:

```typescript
// Start watching (uses IMAP IDLE when available, falls back to polling)
await emai.watch.start({
  folder: 'inbox',
  pollInterval: 30000,     // Poll every 30s (used when IDLE not available)
});

// Check status
emai.watch.isWatching();   // → true

// Stop watching
await emai.watch.stop();
```

### Webhooks

Forward events to external URLs:

```typescript
const webhookId = emai.webhooks.register(
  'https://your-app.com/webhook',
  ['email:received', 'email:sent'],
  {
    secret: 'your-webhook-secret',
    headers: { 'X-Custom': 'value' },
    retries: 3,
    retryDelay: 1000,
    timeout: 10000,
  }
);

// List registered webhooks
const hooks = emai.webhooks.list();

// Remove a webhook
emai.webhooks.unregister(webhookId);
```

---

## MCP Server

Expose emai as an [MCP](https://modelcontextprotocol.io/) server so AI agents (Claude, etc.) can use email tools directly:

```bash
npx emai mcp
```

Or programmatically:

```typescript
import { startEmaiMcpServer } from '@petter100/emai/mcp';

await startEmaiMcpServer({
  provider: { type: 'imap', /* ... */ },
  ai: { adapter: 'openai', apiKey: '...' },
});
```

### Available MCP Tools (37)

| Category | Tools |
|----------|-------|
| **Email Reading** | `list_emails`, `get_email`, `get_thread`, `get_attachment` |
| **Email Sending** | `send_email`, `reply_to_email`, `forward_email`, `create_draft`, `update_draft`, `delete_draft` |
| **Email Management** | `mark_as_read`, `mark_as_unread`, `star_email`, `unstar_email`, `move_to_folder`, `delete_email`, `archive_email` |
| **Labels & Folders** | `list_labels`, `add_label`, `remove_label`, `create_label`, `delete_label`, `list_folders`, `create_folder` |
| **Search** | `search_semantic`, `search_fulltext`, `search_hybrid`, `index_emails` |
| **AI** | `classify_email`, `summarize_email`, `summarize_thread`, `extract_data`, `compose_email`, `compose_reply`, `prioritize_emails`, `detect_actions` |
| **Attachments** | `parse_attachment`, `ocr_attachment`, `describe_attachment` |
| **Safety** | `scan_email` |
| **Monitoring** | `start_watching`, `stop_watching` |

---

## CLI

emai includes a CLI for quick email operations:

```bash
npx emai init                          # Interactive setup — creates .emairc config

npx emai list                          # List recent emails
npx emai list --limit 20 --unread      # Filter options
npx emai read <id>                     # Read email content

npx emai send --to user@example.com --subject "Hello" --body "Hi there"
npx emai reply <id>                    # Reply to an email
npx emai forward <id> --to other@example.com

npx emai search "invoices" --type semantic
npx emai search "from:john" --type fulltext

npx emai classify <id>                 # AI classification
npx emai summarize <id>                # AI summary

npx emai star <id>                     # Star/unstar
npx emai delete <id>                   # Delete
npx emai move <id> --folder archive    # Move to folder

npx emai watch                         # Watch for new emails (real-time)
npx emai mcp                           # Start MCP server

npx emai <command> --json              # JSON output for any command
npx emai <command> --quiet             # Suppress info messages
```

---

## Playground

emai ships with an interactive **Playground** — a web UI for testing every SDK feature against your real mailbox.

### Getting Started

```bash
cd playground
npm install
npm run dev -- -p 4000
```

Open `http://localhost:4000` and enter your email provider credentials + AI adapter config.

### Features

The Playground includes:

- **Dashboard** — One-click "Run All Tests" that exercises every SDK capability: email listing, classification, summarization, priority scoring, action detection, composition, extraction, search, and safety scanning
- **Email Browser** — Gmail-like UI with AI indicators (category, priority, urgency badges)
- **AI Playground** — Test individual AI features with custom parameters
- **Attachment Viewer** — Parse, OCR, and extract data from attachments with configurable extraction fields
- **Search Console** — Test semantic, full-text, and hybrid search with index management
- **Event Stream** — Real-time SSE viewer showing all SDK events as they happen

### Screenshots

| Page | Description |
|------|-------------|
| ![Dashboard](docs/screenshots/dashboard.png) | **Dashboard** — One-click test runner with pass/fail report |
| ![Configuration](docs/screenshots/config.png) | **Configuration** — Connect any IMAP/SMTP provider + AI adapter |
| ![Search](docs/screenshots/search.png) | **Search** — Semantic, full-text, and hybrid search |
| ![Safety](docs/screenshots/safety.png) | **Safety** — PII, credential, and phishing scanning |
| ![Emails](docs/screenshots/emails.png) | **Emails** — List, read, send, and manage emails |
| ![Events](docs/screenshots/events.png) | **Events** — Real-time IMAP IDLE + event stream |

---

## Advanced

### Custom LLM Adapter

Implement the `LLMAdapter` interface to use any LLM:

```typescript
import type { LLMAdapter, CompletionOptions } from '@petter100/emai';
import { z } from 'zod';

const myAdapter: LLMAdapter = {
  name: 'my-llm',

  async complete(prompt: string, options?: CompletionOptions): Promise<string> {
    // Call your LLM and return the text response
    const response = await myLlm.chat(prompt, options);
    return response.text;
  },

  async completeJSON<T>(prompt: string, schema: z.ZodType<T>, options?: CompletionOptions): Promise<T> {
    // Call your LLM and return parsed + validated JSON
    const response = await myLlm.chat(prompt, { ...options, responseFormat: 'json' });
    return schema.parse(JSON.parse(response.text));
  },

  async embed(texts: string[]): Promise<number[][]> {
    // Generate embeddings for semantic search
    return myEmbeddingModel.embed(texts);
  },

  async vision(images: Array<{ data: Buffer; mimeType: string }>, prompt: string): Promise<string> {
    // Optional: describe images for attachment analysis
    return myVisionModel.describe(images, prompt);
  },
};

const emai = new Emai({
  provider: { /* ... */ },
  ai: { adapter: myAdapter },
});
```

### Custom Vector Store

Implement the `VectorStore` interface for any vector database:

```typescript
import type { VectorStore, VectorEntry, VectorSearchResult } from '@petter100/emai';

const myStore: VectorStore = {
  name: 'my-store',

  async initialize(dimensions: number): Promise<void> {
    // Create collection/index with the given vector dimensions
  },

  async upsert(vectors: VectorEntry[]): Promise<void> {
    // Insert or update vectors
    // Each entry: { id, vector: number[], metadata: Record<string, unknown>, content: string }
  },

  async search(vector: number[], limit: number, filter?: Record<string, unknown>): Promise<VectorSearchResult[]> {
    // Find nearest neighbors
    // Return: { id, score, metadata, content }[]
  },

  async delete(ids: string[]): Promise<void> {
    // Remove vectors by ID
  },

  async count(): Promise<number> {
    // Return total number of stored vectors
  },

  async close(): Promise<void> {
    // Cleanup connections
  },
};

const emai = new Emai({
  provider: { /* ... */ },
  search: { store: myStore },
});
```

### Storage

Persist email data locally for offline access:

```typescript
// In-memory (default, no persistence)
storage: { type: 'memory' }

// SQLite (persistent)
storage: { type: 'sqlite', path: './emai-storage.db' }
```

---

## API Reference

### Constructor

```typescript
new Emai(config: EmaiConfig)
```

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `provider` | `ProviderConfig` | Yes | Email provider configuration |
| `ai` | `AiConfig` | No | LLM adapter configuration (required for AI features) |
| `search` | `SearchConfig` | No | Vector store configuration (required for semantic search) |
| `storage` | `StorageConfig` | No | Local persistence configuration |
| `safety` | `SafetyConfig` | No | Security scanning configuration |

### Connection

| Method | Returns | Description |
|--------|---------|-------------|
| `connect()` | `Promise<void>` | Establish provider connection |
| `disconnect()` | `Promise<void>` | Close all connections |
| `isConnected()` | `boolean` | Check connection status |

### Emails (`emai.emails.*`)

| Method | Returns | Description |
|--------|---------|-------------|
| `list(options?)` | `Promise<ListResult<Email>>` | List emails with filtering |
| `get(id)` | `Promise<Email>` | Get a single email |
| `send(options)` | `Promise<SendResult>` | Send an email |
| `reply(emailId, options)` | `Promise<SendResult>` | Reply to an email |
| `forward(emailId, options)` | `Promise<SendResult>` | Forward an email |
| `createDraft(options)` | `Promise<Email>` | Create a draft |
| `updateDraft(draftId, options)` | `Promise<Email>` | Update a draft |
| `deleteDraft(draftId)` | `Promise<void>` | Delete a draft |
| `markAsRead(emailId)` | `Promise<void>` | Mark as read |
| `markAsUnread(emailId)` | `Promise<void>` | Mark as unread |
| `star(emailId)` | `Promise<void>` | Star an email |
| `unstar(emailId)` | `Promise<void>` | Unstar an email |
| `moveToFolder(emailId, folder)` | `Promise<void>` | Move to folder |
| `archive(emailId)` | `Promise<void>` | Archive an email |
| `delete(emailId)` | `Promise<void>` | Delete an email |

### AI (`emai.ai.*`)

| Method | Returns | Description |
|--------|---------|-------------|
| `classify(email)` | `Promise<ClassificationResult>` | Classify a single email |
| `classifyBatch(emails)` | `Promise<ClassificationResult[]>` | Classify multiple emails |
| `summarize(email)` | `Promise<SummaryResult>` | Summarize a single email |
| `summarizeThread(thread)` | `Promise<SummaryResult>` | Summarize a thread |
| `summarizeBatch(emails)` | `Promise<string>` | Digest summary of multiple emails |
| `extract(email, schema)` | `Promise<ExtractionResult<T>>` | Extract structured data |
| `compose(options)` | `Promise<ComposeResult>` | Compose a new email |
| `reply(email, options)` | `Promise<ComposeResult>` | Compose a reply |
| `rewriteInTone(text, tone)` | `Promise<string>` | Rewrite text in a given tone |
| `improveWriting(text)` | `Promise<string>` | Improve writing quality |
| `prioritize(email, context?)` | `Promise<PriorityResult>` | Score email priority |
| `prioritizeBatch(emails, context?)` | `Promise<Array<{ email, priority }>>` | Batch prioritize |
| `detectActions(email)` | `Promise<ActionItem[]>` | Detect action items |
| `detectActionsInThread(thread)` | `Promise<ActionItem[]>` | Detect actions in thread |

### Search (`emai.search.*`)

| Method | Returns | Description |
|--------|---------|-------------|
| `semantic(query, options?)` | `Promise<SearchResult[]>` | Semantic search |
| `fullText(query, options?)` | `Promise<SearchResult[]>` | Full-text keyword search |
| `hybrid(query, options?)` | `Promise<SearchResult[]>` | Combined search |
| `index(emails)` | `Promise<void>` | Index emails for search |
| `indexEmail(email)` | `Promise<void>` | Index a single email |
| `removeFromIndex(emailId)` | `Promise<void>` | Remove from index |
| `getIndexedCount()` | `Promise<number>` | Get indexed email count |

### Attachments (`emai.attachments.*`)

| Method | Returns | Description |
|--------|---------|-------------|
| `parse(attachment, options?)` | `Promise<ParsedAttachment>` | Parse any attachment |
| `toText(attachment, options?)` | `Promise<string>` | Extract plain text |
| `extract(attachment, schema)` | `Promise<ExtractionResult<T>>` | Extract structured data |
| `describe(attachment)` | `Promise<string>` | Vision AI description |
| `ocr(attachment)` | `Promise<string>` | OCR text extraction |
| `getContent(emailId, attachmentId)` | `Promise<Buffer>` | Download content |

### Safety (`emai.safety.*`)

| Method | Returns | Description |
|--------|---------|-------------|
| `scan(email)` | `ScanResult` | Scan an email for risks |
| `scanOutbound(options)` | `Promise<ScanResult>` | Scan before sending |
| `checkBeforeSend(options)` | `Promise<{ allowed, result }>` | Check + approval flow |

### Labels & Folders

| Method | Returns | Description |
|--------|---------|-------------|
| `labels.list()` | `Promise<Label[]>` | List all labels |
| `labels.add(emailId, label)` | `Promise<void>` | Add label to email |
| `labels.remove(emailId, label)` | `Promise<void>` | Remove label from email |
| `labels.create(name, color?)` | `Promise<Label>` | Create a label |
| `labels.delete(labelId)` | `Promise<void>` | Delete a label |
| `folders.list()` | `Promise<Folder[]>` | List all folders |
| `folders.create(name, parentId?)` | `Promise<Folder>` | Create a folder |
| `folders.delete(folderId)` | `Promise<void>` | Delete a folder |

### Threads (`emai.threads.*`)

| Method | Returns | Description |
|--------|---------|-------------|
| `get(threadId)` | `Promise<Thread>` | Get a thread |
| `detect(emails)` | `Thread[]` | Detect threads from emails |

### Watch & Webhooks

| Method | Returns | Description |
|--------|---------|-------------|
| `watch.start(options?)` | `Promise<void>` | Start watching for emails |
| `watch.stop()` | `Promise<void>` | Stop watching |
| `watch.isWatching()` | `boolean` | Check watch status |
| `webhooks.register(url, events, options?)` | `string` | Register webhook |
| `webhooks.unregister(webhookId)` | `void` | Remove webhook |
| `webhooks.list()` | `WebhookRegistration[]` | List webhooks |

### Events

| Method | Returns | Description |
|--------|---------|-------------|
| `on(event, listener)` | `() => void` | Subscribe (returns unsubscribe fn) |
| `once(event, listener)` | `() => void` | One-time subscription |
| `off(event, listener)` | `void` | Unsubscribe |

---

## Optional Dependencies

emai keeps its core dependency-free. Install only what you need:

```bash
# AI adapters (pick one)
npm install openai                      # OpenAI
npm install @anthropic-ai/sdk           # Anthropic
npm install @google/generative-ai       # Google Gemini
npm install ollama                      # Ollama (local)

# Email providers
npm install googleapis                  # Gmail API
npm install @microsoft/microsoft-graph-client  # Outlook
npm install imapflow nodemailer mailparser     # IMAP/SMTP

# Vector stores (pick one)
npm install better-sqlite3              # SQLite
npm install pg                          # PostgreSQL + pgvector
npm install @pinecone-database/pinecone # Pinecone
npm install weaviate-client             # Weaviate
npm install chromadb                    # ChromaDB

# Attachment processing
npm install pdf-parse                   # PDF parsing
npm install tesseract.js                # OCR
npm install sharp                       # Image processing
npm install mammoth                     # Word documents
npm install papaparse                   # CSV parsing

# Other
npm install @modelcontextprotocol/sdk   # MCP server
npm install commander                   # CLI
```

---

## emai-client — Web UI for Humans

While **emai** is designed for AI agents to work with email programmatically, **[emai-client](https://github.com/rafapetter/email-client)** is the companion web app that gives humans a Superhuman-style interface to monitor and manage what their agents are doing.

Use it to:
- **Review** AI-generated summaries, priorities, and classifications
- **Override** agent decisions — reply, archive, delete manually
- **Configure** AI behavior and workflow automation rules
- **Search** across all synced emails with hybrid full-text + semantic search

```bash
git clone https://github.com/rafapetter/email-client.git
cd email-client
npm install && npm run db:migrate && npm run dev
```

Open [http://localhost:3004](http://localhost:3004) — self-hosted, your data stays with you.

---

## License

MIT
