import { readFile, writeFile, access } from 'node:fs/promises';
import { resolve, basename } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout, stderr, exit } from 'node:process';
import { tryImport } from '../core/utils.js';
import type {
  Email,
  Thread,
  EmailAddress,
  Attachment,
  Folder,
  Label,
  ClassificationResult,
  SummaryResult,
  PriorityResult,
  ActionItem,
  ComposeResult,
  ExtractionResult,
  SearchResult,
  ScanResult,
  Risk,
  EmaiConfig,
  ProviderConfig,
  SendEmailOptions,
  ListEmailsOptions,
} from '../core/types.js';

// ---------------------------------------------------------------------------
// ANSI color helpers (zero dependencies)
// ---------------------------------------------------------------------------

const isColorEnabled = stdout.isTTY !== false && !process.env['NO_COLOR'];

function ansi(code: string): (text: string) => string {
  if (!isColorEnabled) return (text) => text;
  return (text) => `\x1b[${code}m${text}\x1b[0m`;
}

const c = {
  bold: ansi('1'),
  dim: ansi('2'),
  italic: ansi('3'),
  underline: ansi('4'),
  red: ansi('31'),
  green: ansi('32'),
  yellow: ansi('33'),
  blue: ansi('34'),
  magenta: ansi('35'),
  cyan: ansi('36'),
  white: ansi('37'),
  gray: ansi('90'),
  bgRed: ansi('41'),
  bgGreen: ansi('42'),
  bgYellow: ansi('43'),
  bgBlue: ansi('44'),
};

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

interface GlobalFlags {
  json: boolean;
  quiet: boolean;
}

let globalFlags: GlobalFlags = { json: false, quiet: false };

function out(text: string): void {
  stdout.write(text + '\n');
}

function info(text: string): void {
  if (globalFlags.quiet) return;
  out(c.cyan('ℹ') + ' ' + text);
}

function success(text: string): void {
  if (globalFlags.quiet) return;
  out(c.green('✓') + ' ' + text);
}

function warn(text: string): void {
  stderr.write(c.yellow('⚠') + ' ' + text + '\n');
}

function fatal(text: string): never {
  stderr.write(c.red('✗') + ' ' + text + '\n');
  exit(1);
}

function json(data: unknown): void {
  out(JSON.stringify(data, null, 2));
}

function formatAddr(addr: EmailAddress): string {
  return addr.name ? `${addr.name} <${c.dim(addr.address)}>` : addr.address;
}

function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString();
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function separator(): void {
  out(c.dim('─'.repeat(60)));
}

function padRight(str: string, len: number): string {
  const stripped = str.replace(/\x1b\[[0-9;]*m/g, '');
  const diff = len - stripped.length;
  return diff > 0 ? str + ' '.repeat(diff) : str;
}

function table(headers: string[], rows: string[][]): void {
  const widths = headers.map((h, i) => {
    const stripped = h.replace(/\x1b\[[0-9;]*m/g, '');
    return Math.max(
      stripped.length,
      ...rows.map((r) => (r[i] ?? '').replace(/\x1b\[[0-9;]*m/g, '').length),
    );
  });

  out(
    headers
      .map((h, i) => c.bold(padRight(h, widths[i])))
      .join('  '),
  );
  out(widths.map((w) => c.dim('─'.repeat(w))).join('  '));

  for (const row of rows) {
    out(row.map((cell, i) => padRight(cell, widths[i])).join('  '));
  }
}

// ---------------------------------------------------------------------------
// Email display helpers
// ---------------------------------------------------------------------------

function printEmailSummary(email: Email, index?: number): void {
  const prefix = index !== undefined ? c.dim(`${index + 1}.`) : '';
  const read = email.isRead ? ' ' : c.bold(c.blue('●'));
  const star = email.isStarred ? c.yellow('★') : ' ';
  const date = c.dim(formatDate(email.date));
  const from = formatAddr(email.from);
  const subject = email.isRead ? email.subject : c.bold(email.subject);
  const snippet = email.snippet ? c.dim(` — ${email.snippet.slice(0, 60)}`) : '';

  out(`${prefix} ${read} ${star} ${from}`);
  out(`     ${subject}${snippet}`);
  out(`     ${date}  ${c.dim(email.folder)}  ${email.labels.map((l) => c.cyan(`[${l}]`)).join(' ')}`);
  if (email.attachments.length > 0) {
    out(`     ${c.dim('📎')} ${email.attachments.map((a) => a.filename).join(', ')}`);
  }
  out('');
}

function printEmailFull(email: Email): void {
  separator();
  out(`${c.bold('From:')}    ${formatAddr(email.from)}`);
  out(`${c.bold('To:')}      ${email.to.map(formatAddr).join(', ')}`);
  if (email.cc.length > 0) {
    out(`${c.bold('CC:')}      ${email.cc.map(formatAddr).join(', ')}`);
  }
  out(`${c.bold('Subject:')} ${c.bold(email.subject)}`);
  out(`${c.bold('Date:')}    ${formatDate(email.date)}`);
  out(`${c.bold('ID:')}      ${c.dim(email.id)}`);
  if (email.threadId) {
    out(`${c.bold('Thread:')}  ${c.dim(email.threadId)}`);
  }
  out(`${c.bold('Labels:')}  ${email.labels.join(', ') || c.dim('none')}`);
  out(`${c.bold('Folder:')}  ${email.folder}`);
  out(`${c.bold('Status:')}  ${email.isRead ? 'Read' : c.blue('Unread')}${email.isStarred ? ' ' + c.yellow('★ Starred') : ''}`);

  if (email.attachments.length > 0) {
    out('');
    out(c.bold('Attachments:'));
    for (const att of email.attachments) {
      out(`  📎 ${att.filename} ${c.dim(`(${att.contentType}, ${formatSize(att.size)})`)}`);
    }
  }

  separator();
  out('');
  out(email.body.text || email.body.html || c.dim('(no body)'));
  out('');
}

function printThread(thread: Thread): void {
  out(c.bold(`Thread: ${thread.subject}`));
  out(`${c.dim('Messages:')} ${thread.messageCount}  ${c.dim('Participants:')} ${thread.participants.map(formatAddr).join(', ')}`);
  out(`${c.dim('Last:')} ${formatDate(thread.lastDate)}`);
  separator();

  for (let i = 0; i < thread.emails.length; i++) {
    const email = thread.emails[i];
    out('');
    out(`${c.bold(`[${i + 1}/${thread.emails.length}]`)} ${formatAddr(email.from)}  ${c.dim(formatDate(email.date))}`);
    out(c.dim('─'.repeat(40)));
    out(email.body.text || email.body.html || c.dim('(no body)'));
  }
  out('');
}

function printClassification(result: ClassificationResult): void {
  out(c.bold('Classification'));
  separator();
  out(`${c.bold('Category:')}   ${c.cyan(result.category)}`);
  out(`${c.bold('Confidence:')} ${formatConfidence(result.confidence)}`);
  out(`${c.bold('Sentiment:')}  ${colorSentiment(result.sentiment)}`);
  out(`${c.bold('Urgent:')}     ${result.isUrgent ? c.red('Yes') : c.green('No')}`);
  out(`${c.bold('Action Req:')} ${result.isActionRequired ? c.yellow('Yes') : c.green('No')}`);
  out(`${c.bold('Labels:')}     ${result.labels.join(', ') || c.dim('none')}`);
  out(`${c.bold('Reasoning:')}  ${result.reasoning}`);
}

function printSummary(result: SummaryResult): void {
  out(c.bold('Summary'));
  separator();
  out(result.summary);
  out('');
  if (result.keyPoints.length > 0) {
    out(c.bold('Key Points:'));
    for (const point of result.keyPoints) {
      out(`  • ${point}`);
    }
  }
  if (result.actionItems.length > 0) {
    out('');
    out(c.bold('Action Items:'));
    printActions(result.actionItems);
  }
  out(`${c.bold('Sentiment:')} ${colorSentiment(result.sentiment)}`);
  out(`${c.bold('Topics:')}    ${result.topicTags.map((t) => c.cyan(`#${t}`)).join(' ')}`);
}

function printActions(items: ActionItem[]): void {
  for (const item of items) {
    const priority = colorPriority(item.priority);
    const status = item.status === 'done' ? c.green('✓') : item.status === 'pending' ? c.yellow('○') : c.dim('?');
    const assignee = item.assignee ? c.dim(` → ${item.assignee}`) : '';
    const due = item.dueDate ? c.dim(` (due: ${item.dueDate})`) : '';
    out(`  ${status} ${priority} ${item.description}${assignee}${due}`);
  }
}

function printPriority(result: PriorityResult, email?: Email): void {
  const levelColor = {
    critical: c.bgRed,
    high: c.red,
    medium: c.yellow,
    low: c.green,
    none: c.dim,
  }[result.level];

  const subject = email ? `  ${c.dim(email.subject)}` : '';
  out(`${levelColor(result.level.toUpperCase().padEnd(8))} ${c.bold(`Score: ${result.score}/100`)}${subject}`);
  out(`  ${result.reasoning}`);
  if (result.suggestedResponseTime) {
    out(`  ${c.dim('Respond within:')} ${result.suggestedResponseTime}`);
  }
}

function printScanResult(result: ScanResult): void {
  out(c.bold('Security Scan'));
  separator();
  out(`${c.bold('Safe:')}              ${result.safe ? c.green('Yes') : c.red('No')}`);
  out(`${c.bold('Blocked:')}           ${result.blocked ? c.red('Yes') : c.green('No')}`);
  out(`${c.bold('Requires Approval:')} ${result.requiresApproval ? c.yellow('Yes') : c.green('No')}`);

  if (result.risks.length > 0) {
    out('');
    out(c.bold('Risks:'));
    for (const risk of result.risks) {
      const severity = colorSeverity(risk.severity);
      out(`  ${severity} ${c.bold(risk.type)} — ${risk.description}`);
      if (risk.location) out(`    ${c.dim('Location:')} ${risk.location}`);
    }
  } else {
    out('');
    out(c.green('  No risks detected.'));
  }
}

function formatConfidence(val: number): string {
  const pct = Math.round(val * 100);
  if (pct >= 80) return c.green(`${pct}%`);
  if (pct >= 50) return c.yellow(`${pct}%`);
  return c.red(`${pct}%`);
}

function colorSentiment(s: string): string {
  switch (s) {
    case 'positive': return c.green(s);
    case 'negative': return c.red(s);
    case 'mixed': return c.yellow(s);
    default: return c.dim(s);
  }
}

function colorPriority(p: string): string {
  switch (p) {
    case 'high': return c.red(`[${p}]`);
    case 'medium': return c.yellow(`[${p}]`);
    case 'low': return c.green(`[${p}]`);
    default: return c.dim(`[${p}]`);
  }
}

function colorSeverity(s: string): string {
  switch (s) {
    case 'critical': return c.bgRed(` ${s.toUpperCase()} `);
    case 'high': return c.red(`[${s}]`);
    case 'medium': return c.yellow(`[${s}]`);
    case 'low': return c.dim(`[${s}]`);
    default: return c.dim(`[${s}]`);
  }
}

// ---------------------------------------------------------------------------
// Config loading
// ---------------------------------------------------------------------------

const CONFIG_FILES = ['.emai.json', 'emai.config.json'];

interface EmaiInstance {
  provider: {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
    listEmails(options?: ListEmailsOptions): Promise<{ items: Email[]; total?: number; hasMore: boolean }>;
    getEmail(id: string): Promise<Email>;
    getThread(threadId: string): Promise<Thread>;
    getAttachmentContent(emailId: string, attachmentId: string): Promise<Buffer>;
    sendEmail(options: SendEmailOptions): Promise<{ id: string; threadId?: string; messageId: string }>;
    replyToEmail(emailId: string, options: { text?: string; html?: string; replyAll?: boolean }): Promise<{ id: string; threadId?: string; messageId: string }>;
    forwardEmail(emailId: string, options: { to: string | string[]; text?: string; html?: string }): Promise<{ id: string; threadId?: string; messageId: string }>;
    listFolders(): Promise<Folder[]>;
    listLabels(): Promise<Label[]>;
    watch?(callback: (email: Email) => void): Promise<{ stop(): Promise<void> }>;
    searchNative?(query: string, options?: ListEmailsOptions): Promise<{ items: Email[]; hasMore: boolean }>;
  };
  ai?: {
    classifyEmail(email: Email): Promise<ClassificationResult>;
    summarizeEmail(email: Email): Promise<SummaryResult>;
    summarizeThread(thread: Thread): Promise<SummaryResult>;
    prioritizeEmails(emails: Email[], context?: Record<string, unknown>): Promise<Array<{ email: Email; priority: PriorityResult }>>;
    detectActions(email: Email): Promise<ActionItem[]>;
    detectActionsInThread(thread: Thread): Promise<ActionItem[]>;
    composeEmail(options: Record<string, unknown>): Promise<ComposeResult>;
    extractData<T>(email: Email, schema: unknown): Promise<ExtractionResult<T>>;
  };
  search?: {
    search(query: string, options?: Record<string, unknown>): Promise<SearchResult[]>;
    semanticSearch(query: string, options?: Record<string, unknown>): Promise<SearchResult[]>;
    fullTextSearch(query: string, options?: Record<string, unknown>): Promise<SearchResult[]>;
    hybridSearch(query: string, options?: Record<string, unknown>): Promise<SearchResult[]>;
  };
  safety?: {
    scanEmail(email: Email): Promise<ScanResult>;
  };
  attachments?: {
    parse(emailId: string, attachmentId: string, options?: Record<string, unknown>): Promise<unknown>;
  };
}

async function loadConfigFile(): Promise<EmaiConfig | null> {
  for (const name of CONFIG_FILES) {
    const configPath = resolve(process.cwd(), name);
    try {
      await access(configPath);
      const raw = await readFile(configPath, 'utf-8');
      return JSON.parse(raw) as EmaiConfig;
    } catch {
      continue;
    }
  }
  return null;
}

function envOverrides(config: EmaiConfig): EmaiConfig {
  const env = process.env;

  if (env['EMAI_PROVIDER'] && !config.provider) {
    const type = env['EMAI_PROVIDER'] as 'gmail' | 'outlook' | 'imap';
    if (type === 'gmail') {
      config.provider = {
        type: 'gmail',
        credentials: {
          clientId: env['EMAI_CLIENT_ID'] ?? '',
          clientSecret: env['EMAI_CLIENT_SECRET'] ?? '',
          refreshToken: env['EMAI_REFRESH_TOKEN'] ?? '',
          accessToken: env['EMAI_ACCESS_TOKEN'],
        },
      };
    } else if (type === 'outlook') {
      config.provider = {
        type: 'outlook',
        credentials: {
          clientId: env['EMAI_CLIENT_ID'] ?? '',
          clientSecret: env['EMAI_CLIENT_SECRET'] ?? '',
          refreshToken: env['EMAI_REFRESH_TOKEN'] ?? '',
          accessToken: env['EMAI_ACCESS_TOKEN'],
          tenantId: env['EMAI_TENANT_ID'],
        },
      };
    } else if (type === 'imap') {
      config.provider = {
        type: 'imap',
        imap: {
          host: env['EMAI_IMAP_HOST'] ?? '',
          port: Number(env['EMAI_IMAP_PORT'] ?? '993'),
          secure: env['EMAI_IMAP_SECURE'] !== 'false',
          auth: { user: env['EMAI_USER'] ?? '', pass: env['EMAI_PASS'] ?? '' },
        },
        smtp: {
          host: env['EMAI_SMTP_HOST'] ?? '',
          port: Number(env['EMAI_SMTP_PORT'] ?? '587'),
          secure: env['EMAI_SMTP_SECURE'] === 'true',
          auth: { user: env['EMAI_USER'] ?? '', pass: env['EMAI_PASS'] ?? '' },
        },
      };
    }
  }

  if (env['EMAI_AI_ADAPTER'] && !config.ai) {
    config.ai = {
      adapter: env['EMAI_AI_ADAPTER'] as 'openai' | 'anthropic' | 'google' | 'ollama',
      apiKey: env['EMAI_AI_API_KEY'],
      model: env['EMAI_AI_MODEL'],
    };
  }

  return config;
}

async function resolveEmaiInstance(): Promise<EmaiInstance> {
  let config = await loadConfigFile();
  if (!config) {
    config = {} as EmaiConfig;
  }
  config = envOverrides(config);

  if (!config.provider) {
    fatal(
      'No configuration found. Run ' +
        c.bold('emai init') +
        ' or create a ' +
        c.bold('.emai.json') +
        ' file.',
    );
  }

  try {
    const mod = (await import('../index.js')) as unknown as { createEmai: (config: EmaiConfig) => EmaiInstance };
    return mod.createEmai(config) as EmaiInstance;
  } catch {
    fatal(
      'Failed to load emai core. Make sure the package is built (' +
        c.bold('npm run build') +
        ').',
    );
  }
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

async function cmdConnect(): Promise<void> {
  const emai = await resolveEmaiInstance();
  info('Connecting to email provider...');
  await emai.provider.connect();
  success('Connected successfully!');
  await emai.provider.disconnect();
}

async function cmdList(opts: {
  folder?: string;
  limit?: string;
  from?: string;
  subject?: string;
  unread?: boolean;
}): Promise<void> {
  const emai = await resolveEmaiInstance();
  await emai.provider.connect();

  const listOpts: ListEmailsOptions = {
    folder: opts.folder,
    limit: opts.limit ? Number(opts.limit) : 20,
    from: opts.from,
    subject: opts.subject,
    isRead: opts.unread ? false : undefined,
    sortBy: 'date',
    sortOrder: 'desc',
  };

  const result = await emai.provider.listEmails(listOpts);

  if (globalFlags.json) {
    json(result);
    await emai.provider.disconnect();
    return;
  }

  if (result.items.length === 0) {
    info('No emails found.');
    await emai.provider.disconnect();
    return;
  }

  out(c.bold(`Emails (${result.items.length}${result.total ? `/${result.total}` : ''}):`));
  out('');

  for (let i = 0; i < result.items.length; i++) {
    printEmailSummary(result.items[i], i);
  }

  if (result.hasMore) {
    out(c.dim('Use --limit to show more results.'));
  }

  await emai.provider.disconnect();
}

async function cmdRead(id: string): Promise<void> {
  const emai = await resolveEmaiInstance();
  await emai.provider.connect();

  const email = await emai.provider.getEmail(id);

  if (globalFlags.json) {
    json(email);
  } else {
    printEmailFull(email);
  }

  await emai.provider.disconnect();
}

async function cmdThread(id: string): Promise<void> {
  const emai = await resolveEmaiInstance();
  await emai.provider.connect();

  const thread = await emai.provider.getThread(id);

  if (globalFlags.json) {
    json(thread);
  } else {
    printThread(thread);
  }

  await emai.provider.disconnect();
}

async function cmdSend(opts: {
  to?: string;
  subject?: string;
  body?: string;
  cc?: string;
  bcc?: string;
  attach?: string[];
}): Promise<void> {
  if (!opts.to) fatal('--to is required.');
  if (!opts.subject) fatal('--subject is required.');
  if (!opts.body) fatal('--body is required.');

  const emai = await resolveEmaiInstance();
  await emai.provider.connect();

  const sendOpts: SendEmailOptions = {
    to: opts.to.split(',').map((s) => s.trim()),
    subject: opts.subject,
    text: opts.body,
    cc: opts.cc ? opts.cc.split(',').map((s) => s.trim()) : undefined,
    bcc: opts.bcc ? opts.bcc.split(',').map((s) => s.trim()) : undefined,
  };

  if (opts.attach && opts.attach.length > 0) {
    const attachments = [];
    for (const filepath of opts.attach) {
      const content = await readFile(resolve(filepath));
      attachments.push({
        filename: basename(filepath),
        content,
      });
    }
    sendOpts.attachments = attachments;
  }

  const result = await emai.provider.sendEmail(sendOpts);

  if (globalFlags.json) {
    json(result);
  } else {
    success(`Email sent! ID: ${c.dim(result.id)}`);
  }

  await emai.provider.disconnect();
}

async function cmdReply(
  id: string,
  opts: { body?: string; all?: boolean },
): Promise<void> {
  if (!opts.body) fatal('--body is required.');

  const emai = await resolveEmaiInstance();
  await emai.provider.connect();

  const result = await emai.provider.replyToEmail(id, {
    text: opts.body,
    replyAll: opts.all ?? false,
  });

  if (globalFlags.json) {
    json(result);
  } else {
    success(`Reply sent! ID: ${c.dim(result.id)}`);
  }

  await emai.provider.disconnect();
}

async function cmdForward(
  id: string,
  opts: { to?: string; body?: string },
): Promise<void> {
  if (!opts.to) fatal('--to is required.');

  const emai = await resolveEmaiInstance();
  await emai.provider.connect();

  const result = await emai.provider.forwardEmail(id, {
    to: opts.to.split(',').map((s) => s.trim()),
    text: opts.body,
  });

  if (globalFlags.json) {
    json(result);
  } else {
    success(`Email forwarded! ID: ${c.dim(result.id)}`);
  }

  await emai.provider.disconnect();
}

async function cmdSearch(
  query: string,
  opts: { type?: string; limit?: string },
): Promise<void> {
  const emai = await resolveEmaiInstance();
  await emai.provider.connect();

  const searchType = (opts.type ?? 'hybrid') as 'semantic' | 'fulltext' | 'hybrid';
  const limit = opts.limit ? Number(opts.limit) : 10;

  if (!emai.search) {
    fatal('Search is not configured. Add a "search" section to your config.');
  }

  let results: SearchResult[];
  switch (searchType) {
    case 'semantic':
      results = await emai.search.semanticSearch(query, { limit });
      break;
    case 'fulltext':
      results = await emai.search.fullTextSearch(query, { limit });
      break;
    case 'hybrid':
    default:
      results = await emai.search.hybridSearch(query, { limit });
  }

  if (globalFlags.json) {
    json(results);
    await emai.provider.disconnect();
    return;
  }

  if (results.length === 0) {
    info('No results found.');
    await emai.provider.disconnect();
    return;
  }

  out(c.bold(`Search results for "${query}" (${searchType}):`));
  out('');

  for (const r of results) {
    const score = formatConfidence(r.score);
    out(`${score} ${c.bold(r.email.subject)}`);
    out(`  ${formatAddr(r.email.from)}  ${c.dim(formatDate(r.email.date))}  ${c.dim(`[${r.matchType}]`)}`);
    if (r.highlights && r.highlights.length > 0) {
      out(`  ${c.italic(r.highlights[0])}`);
    }
    out('');
  }

  await emai.provider.disconnect();
}

async function cmdClassify(id: string): Promise<void> {
  const emai = await resolveEmaiInstance();
  await emai.provider.connect();

  if (!emai.ai) {
    fatal('AI is not configured. Add an "ai" section to your config.');
  }

  const email = await emai.provider.getEmail(id);
  const result = await emai.ai.classifyEmail(email);

  if (globalFlags.json) {
    json(result);
  } else {
    printClassification(result);
  }

  await emai.provider.disconnect();
}

async function cmdSummarize(id: string): Promise<void> {
  const emai = await resolveEmaiInstance();
  await emai.provider.connect();

  if (!emai.ai) {
    fatal('AI is not configured. Add an "ai" section to your config.');
  }

  let result: SummaryResult;
  const email = await emai.provider.getEmail(id);

  if (email.threadId) {
    try {
      const thread = await emai.provider.getThread(email.threadId);
      result = await emai.ai.summarizeThread(thread);
    } catch {
      result = await emai.ai.summarizeEmail(email);
    }
  } else {
    result = await emai.ai.summarizeEmail(email);
  }

  if (globalFlags.json) {
    json(result);
  } else {
    printSummary(result);
  }

  await emai.provider.disconnect();
}

async function cmdExtract(
  id: string,
  opts: { schema?: string },
): Promise<void> {
  const emai = await resolveEmaiInstance();
  await emai.provider.connect();

  if (!emai.ai) {
    fatal('AI is not configured. Add an "ai" section to your config.');
  }

  const email = await emai.provider.getEmail(id);

  let schema: unknown;
  if (opts.schema) {
    try {
      const raw = await readFile(resolve(opts.schema), 'utf-8');
      schema = JSON.parse(raw);
    } catch (err) {
      fatal(`Failed to read schema file: ${opts.schema} — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const result = await emai.ai.extractData(email, schema);

  if (globalFlags.json) {
    json(result);
  } else {
    out(c.bold('Extracted Data'));
    separator();
    out(JSON.stringify(result.data, null, 2));
    out('');
    out(`${c.bold('Confidence:')} ${formatConfidence(result.confidence)}`);
    if (result.sources.length > 0) {
      out('');
      out(c.bold('Sources:'));
      for (const s of result.sources) {
        out(`  ${c.cyan(s.field)}: ${s.source}${s.span ? ` ${c.dim(`"${s.span}"`)}` : ''}`);
      }
    }
  }

  await emai.provider.disconnect();
}

async function cmdCompose(opts: {
  context?: string;
  tone?: string;
  length?: string;
}): Promise<void> {
  const emai = await resolveEmaiInstance();

  if (!emai.ai) {
    fatal('AI is not configured. Add an "ai" section to your config.');
  }

  const result = await emai.ai.composeEmail({
    context: opts.context,
    tone: opts.tone ?? 'professional',
    length: opts.length ?? 'medium',
  });

  if (globalFlags.json) {
    json(result);
  } else {
    if (result.subject) {
      out(`${c.bold('Subject:')} ${result.subject}`);
      out('');
    }
    out(result.text);
  }
}

async function cmdPrioritize(): Promise<void> {
  const emai = await resolveEmaiInstance();
  await emai.provider.connect();

  if (!emai.ai) {
    fatal('AI is not configured. Add an "ai" section to your config.');
  }

  const result = await emai.provider.listEmails({
    folder: 'inbox',
    isRead: false,
    limit: 20,
    sortBy: 'date',
    sortOrder: 'desc',
  });

  if (result.items.length === 0) {
    info('Inbox is empty!');
    await emai.provider.disconnect();
    return;
  }

  info(`Prioritizing ${result.items.length} emails...`);
  const prioritized = await emai.ai.prioritizeEmails(result.items);

  prioritized.sort((a, b) => b.priority.score - a.priority.score);

  if (globalFlags.json) {
    json(prioritized);
    await emai.provider.disconnect();
    return;
  }

  out('');
  out(c.bold('Inbox Priority'));
  separator();
  for (const { email, priority } of prioritized) {
    printPriority(priority, email);
    out('');
  }

  await emai.provider.disconnect();
}

async function cmdActions(id: string): Promise<void> {
  const emai = await resolveEmaiInstance();
  await emai.provider.connect();

  if (!emai.ai) {
    fatal('AI is not configured. Add an "ai" section to your config.');
  }

  const email = await emai.provider.getEmail(id);
  let actions: ActionItem[];

  if (email.threadId) {
    try {
      const thread = await emai.provider.getThread(email.threadId);
      actions = await emai.ai.detectActionsInThread(thread);
    } catch {
      actions = await emai.ai.detectActions(email);
    }
  } else {
    actions = await emai.ai.detectActions(email);
  }

  if (globalFlags.json) {
    json(actions);
    await emai.provider.disconnect();
    return;
  }

  if (actions.length === 0) {
    info('No action items detected.');
    await emai.provider.disconnect();
    return;
  }

  out(c.bold('Action Items'));
  separator();
  printActions(actions);
  out('');

  await emai.provider.disconnect();
}

async function cmdParse(
  emailId: string,
  attachmentId: string,
): Promise<void> {
  const emai = await resolveEmaiInstance();
  await emai.provider.connect();

  if (!emai.attachments) {
    fatal('Attachment parsing is not available.');
  }

  const result = await emai.attachments.parse(emailId, attachmentId);

  if (globalFlags.json) {
    json(result);
  } else {
    out(JSON.stringify(result, null, 2));
  }

  await emai.provider.disconnect();
}

async function cmdLabels(): Promise<void> {
  const emai = await resolveEmaiInstance();
  await emai.provider.connect();

  const labels = await emai.provider.listLabels();

  if (globalFlags.json) {
    json(labels);
    await emai.provider.disconnect();
    return;
  }

  if (labels.length === 0) {
    info('No labels found.');
    await emai.provider.disconnect();
    return;
  }

  table(
    ['Name', 'Type', 'Color', 'ID'],
    labels.map((l) => [
      l.name,
      l.type === 'system' ? c.dim(l.type) : l.type,
      l.color ?? c.dim('—'),
      c.dim(l.id),
    ]),
  );

  await emai.provider.disconnect();
}

async function cmdFolders(): Promise<void> {
  const emai = await resolveEmaiInstance();
  await emai.provider.connect();

  const folders = await emai.provider.listFolders();

  if (globalFlags.json) {
    json(folders);
    await emai.provider.disconnect();
    return;
  }

  if (folders.length === 0) {
    info('No folders found.');
    await emai.provider.disconnect();
    return;
  }

  function printFolder(folder: Folder, indent = 0): void {
    const prefix = '  '.repeat(indent);
    const unread = folder.unreadCount > 0 ? c.bold(c.blue(` (${folder.unreadCount} unread)`)) : '';
    out(`${prefix}📁 ${c.bold(folder.name)}${unread}  ${c.dim(`${folder.totalCount} total`)}  ${c.dim(folder.path)}`);
    if (folder.children) {
      for (const child of folder.children) {
        printFolder(child, indent + 1);
      }
    }
  }

  for (const folder of folders) {
    printFolder(folder);
  }

  await emai.provider.disconnect();
}

async function cmdScan(id: string): Promise<void> {
  const emai = await resolveEmaiInstance();
  await emai.provider.connect();

  if (!emai.safety) {
    fatal('Safety scanning is not configured. Add a "safety" section to your config.');
  }

  const email = await emai.provider.getEmail(id);
  const result = await emai.safety.scanEmail(email);

  if (globalFlags.json) {
    json(result);
  } else {
    printScanResult(result);
  }

  await emai.provider.disconnect();
}

async function cmdWatch(): Promise<void> {
  const emai = await resolveEmaiInstance();
  await emai.provider.connect();

  if (!emai.provider.watch) {
    fatal('Watch is not supported by this provider. Polling fallback will be used by the SDK.');
  }

  info('Watching for new emails... Press Ctrl+C to stop.');
  out('');

  const handle = await emai.provider.watch((email: Email) => {
    if (globalFlags.json) {
      json(email);
    } else {
      const time = c.dim(formatDate(email.date));
      out(`${c.green('→')} ${time} ${formatAddr(email.from)}`);
      out(`  ${c.bold(email.subject)}`);
      if (email.snippet) {
        out(`  ${c.dim(email.snippet.slice(0, 80))}`);
      }
      out('');
    }
  });

  process.on('SIGINT', () => {
    void handle.stop().then(() => {
      out('');
      success('Watch stopped.');
      void emai.provider.disconnect().then(() => exit(0));
    });
  });

  await new Promise(() => {
    // keep alive until SIGINT
  });
}

async function cmdMcp(): Promise<void> {
  info('Starting MCP server...');
  try {
    const mcpMod = await import('../mcp/server.js') as { start?: () => Promise<void>; default?: { start?: () => Promise<void> } };
    const startFn = mcpMod.start ?? mcpMod.default?.start;
    if (typeof startFn === 'function') {
      await startFn();
    } else {
      fatal('MCP server module does not export a start function.');
    }
  } catch (err) {
    fatal(`Failed to start MCP server: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function cmdInit(): Promise<void> {
  for (const name of CONFIG_FILES) {
    try {
      await access(resolve(process.cwd(), name));
      warn(`Config file ${c.bold(name)} already exists. Overwrite? (y/N)`);
      const rl = createInterface({ input: stdin, output: stdout });
      const answer = await rl.question('> ');
      rl.close();
      if (answer.toLowerCase() !== 'y') {
        info('Aborted.');
        return;
      }
      break;
    } catch {
      continue;
    }
  }

  const rl = createInterface({ input: stdin, output: stdout });

  out('');
  out(c.bold('emai') + ' — Configuration Setup');
  separator();
  out('');

  const providerAnswer = await rl.question(
    `Email provider ${c.dim('(gmail / outlook / imap)')}: `,
  );
  const provider = providerAnswer.trim().toLowerCase();

  let config: EmaiConfig;

  if (provider === 'gmail') {
    const clientId = await rl.question('Client ID: ');
    const clientSecret = await rl.question('Client Secret: ');
    const refreshToken = await rl.question('Refresh Token: ');
    config = {
      provider: {
        type: 'gmail',
        credentials: {
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
          refreshToken: refreshToken.trim(),
        },
      },
    };
  } else if (provider === 'outlook') {
    const clientId = await rl.question('Client ID: ');
    const clientSecret = await rl.question('Client Secret: ');
    const refreshToken = await rl.question('Refresh Token: ');
    const tenantId = await rl.question(`Tenant ID ${c.dim('(optional)')}: `);
    config = {
      provider: {
        type: 'outlook',
        credentials: {
          clientId: clientId.trim(),
          clientSecret: clientSecret.trim(),
          refreshToken: refreshToken.trim(),
          tenantId: tenantId.trim() || undefined,
        },
      },
    };
  } else if (provider === 'imap') {
    const imapHost = await rl.question('IMAP Host: ');
    const imapPort = await rl.question(`IMAP Port ${c.dim('(993)')}: `);
    const smtpHost = await rl.question('SMTP Host: ');
    const smtpPort = await rl.question(`SMTP Port ${c.dim('(587)')}: `);
    const user = await rl.question('Username: ');
    const pass = await rl.question('Password: ');
    config = {
      provider: {
        type: 'imap',
        imap: {
          host: imapHost.trim(),
          port: Number(imapPort.trim() || '993'),
          secure: true,
          auth: { user: user.trim(), pass: pass.trim() },
        },
        smtp: {
          host: smtpHost.trim(),
          port: Number(smtpPort.trim() || '587'),
          secure: false,
          auth: { user: user.trim(), pass: pass.trim() },
        },
      },
    };
  } else {
    rl.close();
    fatal(`Unknown provider: ${provider}. Use gmail, outlook, or imap.`);
  }

  const aiAnswer = await rl.question(
    `\nConfigure AI? ${c.dim('(y/N)')}: `,
  );

  if (aiAnswer.trim().toLowerCase() === 'y') {
    const adapter = await rl.question(
      `AI adapter ${c.dim('(openai / anthropic / google / ollama)')}: `,
    );
    const apiKey = await rl.question(`API Key ${c.dim('(optional for ollama)')}: `);
    const model = await rl.question(`Model ${c.dim('(optional)')}: `);

    config.ai = {
      adapter: adapter.trim() as 'openai' | 'anthropic' | 'google' | 'ollama',
      apiKey: apiKey.trim() || undefined,
      model: model.trim() || undefined,
    };
  }

  rl.close();

  const filename = '.emai.json';
  await writeFile(
    resolve(process.cwd(), filename),
    JSON.stringify(config, null, 2) + '\n',
    'utf-8',
  );

  out('');
  success(`Config written to ${c.bold(filename)}`);
  out('');
  out(c.dim('  Test your connection:'));
  out(`  ${c.bold('emai connect')}`);
  out('');
  out(c.dim('  Add to .gitignore:'));
  out(`  ${c.bold('echo ".emai.json" >> .gitignore')}`);
  out('');
}

// ---------------------------------------------------------------------------
// CLI setup
// ---------------------------------------------------------------------------

export async function run(): Promise<void> {
  const commander = await tryImport<Record<string, unknown>>('commander', 'CLI');
  const CommandCtor = commander.Command as new () => Record<string, (...args: unknown[]) => unknown>;
  /* eslint-disable @typescript-eslint/no-explicit-any -- commander's fluent API is dynamically typed */
  const program = new CommandCtor() as any;

  program
    .name('emai')
    .description('AI-first email toolkit — read, send, search, classify, and manage email')
    .version('0.1.0')
    .option('--json', 'Output as JSON')
    .option('--quiet', 'Minimal output')
    .hook('preAction', (_thisCmd: unknown, actionCmd: { parent?: { opts(): Record<string, unknown> }; opts(): Record<string, unknown> }) => {
      const root = actionCmd.parent ?? actionCmd;
      const opts = root.opts() as { json?: boolean; quiet?: boolean };
      globalFlags = {
        json: opts.json ?? false,
        quiet: opts.quiet ?? false,
      };
    });

  program.command('connect').description('Test connection to email provider').action(wrapAction(cmdConnect));
  program.command('list').description('List emails').option('--folder <folder>', 'Folder to list').option('--limit <n>', 'Max emails to return', '20').option('--from <address>', 'Filter by sender').option('--subject <text>', 'Filter by subject').option('--unread', 'Show only unread emails').action(wrapAction(cmdList));
  program.command('read <id>').description('Read a single email').action(wrapAction(cmdRead));
  program.command('thread <id>').description('Read a conversation thread').action(wrapAction(cmdThread));
  program.command('send').description('Send an email').requiredOption('--to <addresses>', 'Recipient(s), comma-separated').requiredOption('--subject <subject>', 'Email subject').requiredOption('--body <body>', 'Email body text').option('--cc <addresses>', 'CC recipients, comma-separated').option('--bcc <addresses>', 'BCC recipients, comma-separated').option('--attach <files...>', 'File paths to attach').action(wrapAction(cmdSend));
  program.command('reply <id>').description('Reply to an email').requiredOption('--body <body>', 'Reply body text').option('--all', 'Reply to all recipients').action(wrapAction(cmdReply));
  program.command('forward <id>').description('Forward an email').requiredOption('--to <addresses>', 'Forward to, comma-separated').option('--body <body>', 'Additional text').action(wrapAction(cmdForward));
  program.command('search <query>').description('Search emails').option('--type <type>', 'Search type: semantic, fulltext, hybrid', 'hybrid').option('--limit <n>', 'Max results', '10').action(wrapAction(cmdSearch));
  program.command('classify <id>').description('Classify an email').action(wrapAction(cmdClassify));
  program.command('summarize <id>').description('Summarize an email or thread').action(wrapAction(cmdSummarize));
  program.command('extract <id>').description('Extract structured data from an email').option('--schema <file>', 'JSON schema file for extraction').action(wrapAction(cmdExtract));
  program.command('compose').description('AI-compose an email').option('--context <text>', 'Context for the email').option('--tone <tone>', 'Tone: professional, casual, friendly, formal, empathetic', 'professional').option('--length <length>', 'Length: short, medium, long', 'medium').action(wrapAction(cmdCompose));
  program.command('prioritize').description('Prioritize inbox emails').action(wrapAction(cmdPrioritize));
  program.command('actions <id>').description('Detect action items in an email').action(wrapAction(cmdActions));
  program.command('parse <emailId> <attachmentId>').description('Parse an email attachment').action(wrapAction(cmdParse));
  program.command('labels').description('List labels').action(wrapAction(cmdLabels));
  program.command('folders').description('List folders').action(wrapAction(cmdFolders));
  program.command('scan <id>').description('Scan email for security risks').action(wrapAction(cmdScan));
  program.command('watch').description('Watch for new emails in real-time').action(wrapAction(cmdWatch));
  program.command('mcp').description('Start MCP server').action(wrapAction(cmdMcp));
  program.command('init').description('Initialize emai config file').action(wrapAction(cmdInit));

  await program.parseAsync(process.argv);
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

function wrapAction<T extends unknown[]>(
  fn: (...args: T) => Promise<void>,
): (...args: T) => Promise<void> {
  return async (...args: T) => {
    try {
      await fn(...args);
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        'message' in err
      ) {
        const emaiErr = err as { code: string; message: string };
        stderr.write(
          c.red('Error') +
            ' ' +
            c.dim(`[${emaiErr.code}]`) +
            ' ' +
            emaiErr.message +
            '\n',
        );
      } else if (err instanceof Error) {
        stderr.write(c.red('Error') + ' ' + err.message + '\n');
      } else {
        stderr.write(c.red('Error') + ' ' + String(err) + '\n');
      }
      exit(1);
    }
  };
}
