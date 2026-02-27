# emai

AI-first unified email toolkit for agents. Read, send, search, classify, extract, and manage email across any provider.

```
npm install @petter100/emai
```

## Why?

AI agents need email capabilities — reading inboxes, understanding content, extracting data from attachments, composing replies, and managing messages. But today's email landscape is fragmented: Gmail API differs from Microsoft Graph differs from IMAP, and bolting on AI features means stitching together multiple libraries.

**emai** unifies everything into one toolkit:

- **Any provider** — Gmail, Outlook, IMAP/SMTP through a single API
- **AI-native** — Classification, semantic search, smart compose, extraction, and more built in
- **Attachment intelligence** — Parse PDFs, images (OCR + vision), Office docs, CSV, video
- **Agent-ready** — npm package, MCP server, and CLI — agents can install and start using it immediately
- **Safety built in** — PII scanning, credential detection, human-in-the-loop approval
- **Real-time** — IMAP IDLE, webhooks, event streaming

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

### Microsoft Outlook

```typescript
const emai = new Emai({
  provider: {
    type: 'outlook',
    credentials: {
      clientId: process.env.OUTLOOK_CLIENT_ID,
      clientSecret: process.env.OUTLOOK_CLIENT_SECRET,
      refreshToken: process.env.OUTLOOK_REFRESH_TOKEN,
    },
  },
});
```

### IMAP/SMTP (any provider)

```typescript
const emai = new Emai({
  provider: {
    type: 'imap',
    imap: { host: 'imap.example.com', port: 993, secure: true, auth: { user: '...', pass: '...' } },
    smtp: { host: 'smtp.example.com', port: 465, secure: true, auth: { user: '...', pass: '...' } },
  },
});
```

## AI Adapters

emai is LLM-agnostic. Bring your own provider:

| Adapter | Package | Default Model |
|---------|---------|---------------|
| `openai` | `openai` | gpt-4o |
| `anthropic` | `@anthropic-ai/sdk` | claude-sonnet-4-20250514 |
| `google` | `@google/generative-ai` | gemini-2.0-flash |
| `ollama` | `ollama` | llama3.1 |

```typescript
// OpenAI
ai: { adapter: 'openai', apiKey: '...', model: 'gpt-4o' }

// Anthropic
ai: { adapter: 'anthropic', apiKey: '...', model: 'claude-sonnet-4-20250514' }

// Google Gemini
ai: { adapter: 'google', apiKey: '...', model: 'gemini-2.0-flash' }

// Local via Ollama
ai: { adapter: 'ollama', model: 'llama3.1', baseUrl: 'http://localhost:11434' }

// Custom adapter
ai: { adapter: myCustomAdapter }
```

## AI Features

### Classification

```typescript
const result = await emai.ai.classify(email);
// → {
//   category: 'support',       // 15 categories
//   confidence: 0.95,
//   sentiment: 'negative',
//   isUrgent: true,
//   isActionRequired: true,
//   labels: ['customer-issue', 'billing'],
//   reasoning: 'Customer reports billing discrepancy...'
// }
```

### Summarization

```typescript
const summary = await emai.ai.summarize(email);
// → { summary: '...', keyPoints: [...], actionItems: [...], sentiment: 'mixed' }

const threadSummary = await emai.ai.summarizeThread(thread);
// → Summarizes entire conversation
```

### Structured Data Extraction

```typescript
const OrderSchema = z.object({
  orderId: z.string(),
  items: z.array(z.object({ name: z.string(), quantity: z.number(), price: z.number() })),
  total: z.number(),
  shippingAddress: z.string(),
});

const { data, confidence } = await emai.ai.extract(email, OrderSchema);
```

### Smart Compose & Reply

```typescript
const draft = await emai.ai.compose({
  context: 'Schedule a meeting to discuss Q1 results',
  tone: 'professional',
  length: 'short',
});

const reply = await emai.ai.reply(email, {
  instructions: 'Decline politely, suggest next week instead',
  tone: 'friendly',
});
```

### Priority Scoring

```typescript
const priority = await emai.ai.prioritize(email, {
  userEmail: 'me@company.com',
  vipList: ['ceo@company.com', 'investor@fund.com'],
});
// → { score: 85, level: 'high', reasoning: '...', suggestedResponseTime: '2 hours' }
```

### Action Item Detection

```typescript
const actions = await emai.ai.detectActions(email);
// → [{ description: 'Send Q1 report', assignee: 'you', dueDate: '2026-03-01', priority: 'high' }]
```

## Search

### Semantic Search

Find emails by meaning, not just keywords:

```typescript
await emai.search.index(emails);

const results = await emai.search.semantic('complaints about shipping delays');
// Finds relevant emails even if they don't contain those exact words
```

### Full-Text Search

With operator support:

```typescript
const results = await emai.search.fullText('from:john subject:invoice has:attachment');
```

### Hybrid Search

Combine semantic understanding with keyword precision:

```typescript
const results = await emai.search.hybrid('quarterly revenue report', { alpha: 0.7 });
// alpha: 1.0 = pure semantic, 0.0 = pure full-text
```

### Vector Stores

| Store | Package | Best For |
|-------|---------|----------|
| `memory` | (built-in) | Development, small mailboxes |
| `sqlite` | `better-sqlite3` | Local persistent storage |
| `pgvector` | `pg` | Production with PostgreSQL |
| `pinecone` | `@pinecone-database/pinecone` | Managed cloud vector DB |
| `weaviate` | `weaviate-client` | Hybrid search at scale |
| `chromadb` | `chromadb` | Local/self-hosted vector DB |

```typescript
search: { store: 'weaviate', url: 'http://localhost:8080', collectionName: 'emails' }
```

## Attachments

Parse any attachment format:

```typescript
// Auto-detect and parse
const parsed = await emai.attachments.parse(attachment, { depth: 'deep' });
// → { text: '...', markdown: '...', tables: [...], images: [...] }

// OCR on images/scanned PDFs
const text = await emai.attachments.ocr(attachment);

// Vision AI description
const description = await emai.attachments.describe(attachment);

// Structured extraction from attachments
const data = await emai.attachments.extract(attachment, InvoiceSchema);
```

Supported formats: PDF, images (JPEG/PNG/GIF/WebP), Word (.docx), Excel (.xlsx), PowerPoint (.pptx), CSV, video, plain text.

Parse depth levels:
- **basic** — Metadata and raw text
- **medium** — Full text extraction, tables, markdown conversion
- **deep** — OCR, vision AI, image analysis, table extraction

## Safety

Built-in security scanning for outbound emails:

```typescript
const emai = new Emai({
  // ...
  safety: {
    piiScanning: true,
    credentialScanning: true,
    humanApproval: 'high-risk',
    blockedDomains: ['competitor.com'],
    onApprovalRequired: async (email, risks) => {
      console.log('Risks detected:', risks);
      return confirm('Send anyway?');
    },
  },
});

// Automatic scanning on send
await emai.emails.send({ to: '...', subject: '...', text: '...' });
// → Scans for PII, credentials, blocked domains before sending

// Manual scanning
const scan = emai.safety.scan(email);
// → { safe: false, risks: [{ type: 'pii', severity: 'high', description: 'SSN detected' }] }
```

Detects: email addresses, phone numbers, SSNs, credit cards, API keys, passwords, private keys, JWT tokens, connection strings, phishing attempts.

## Real-Time Events

```typescript
// Listen for new emails
emai.on('email:received', (email) => {
  console.log(`New email from ${email.from.address}: ${email.subject}`);
});

// Start watching (uses IMAP IDLE or polling)
await emai.watch.start({ folder: 'inbox', pollInterval: 30000 });

// Webhooks
emai.webhooks.register('https://your-app.com/webhook', ['email:received', 'email:sent'], {
  secret: 'your-webhook-secret',
});
```

Events: `email:received`, `email:sent`, `email:read`, `email:deleted`, `email:moved`, `email:labeled`, `email:classified`, `email:indexed`, `safety:risk`, `safety:blocked`, `watch:started`, `watch:stopped`, `watch:error`, `error`.

## MCP Server

Expose emai as an MCP server for AI agents:

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

37 MCP tools exposed: `list_emails`, `get_email`, `send_email`, `search_semantic`, `classify_email`, `extract_data`, `parse_attachment`, and more.

## CLI

```bash
# Initialize config
npx emai init

# List emails
npx emai list --limit 10 --unread

# Read an email
npx emai read <id>

# Search
npx emai search "invoices" --type semantic

# Classify
npx emai classify <id>

# Summarize
npx emai summarize <id>

# Send
npx emai send --to user@example.com --subject "Hello" --body "Hi there"

# Watch for new emails
npx emai watch

# Start MCP server
npx emai mcp

# JSON output for any command
npx emai list --json
```

## Threading

Automatic conversation thread detection:

```typescript
const threads = emai.threads.detect(emails);
// Groups emails into threads using:
// 1. In-Reply-To / References headers
// 2. Subject normalization (strips Re:/Fw:)
// 3. Participant overlap analysis
```

## Custom LLM Adapter

Implement the `LLMAdapter` interface to use any LLM:

```typescript
import type { LLMAdapter } from '@petter100/emai';

const myAdapter: LLMAdapter = {
  name: 'my-llm',
  async complete(prompt, options) { /* ... */ },
  async completeJSON(prompt, schema, options) { /* ... */ },
  async embed(texts) { /* ... */ },
  async vision(images, prompt) { /* ... */ },
};

const emai = new Emai({
  provider: { /* ... */ },
  ai: { adapter: myAdapter },
});
```

## Custom Vector Store

Implement the `VectorStore` interface for any vector database:

```typescript
import type { VectorStore } from '@petter100/emai';

const myStore: VectorStore = {
  name: 'my-store',
  async initialize(dimensions) { /* ... */ },
  async upsert(vectors) { /* ... */ },
  async search(vector, limit, filter) { /* ... */ },
  async delete(ids) { /* ... */ },
  async count() { /* ... */ },
  async close() { /* ... */ },
};

const emai = new Emai({
  provider: { /* ... */ },
  search: { store: myStore },
});
```

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

## License

MIT
