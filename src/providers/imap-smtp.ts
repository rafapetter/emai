import type {
  Email,
  Thread,
  Folder,
  Label,
  ListEmailsOptions,
  ListResult,
  SendEmailOptions,
  SendResult,
  ReplyOptions,
  ForwardOptions,
  WatchHandle,
  ImapSmtpProviderConfig,
  EmailAddress,
  Attachment,
  EmailBody,
  EmailHeaders,
} from '../core/types.js';
import {
  tryImport,
  normalizeAddresses,
  formatEmailAddress,
  normalizeSubject,
  generateId,
} from '../core/utils.js';
import { ProviderError, AuthenticationError, NotFoundError } from '../core/errors.js';
import { BaseProvider } from './base.js';

interface ImapFlowModule {
  ImapFlow: new (config: Record<string, unknown>) => ImapClient;
}

interface ImapClient {
  connect(): Promise<void>;
  logout(): Promise<void>;
  getMailboxLock(folder: string): Promise<MailboxLock>;
  list(options?: Record<string, unknown>): Promise<ImapMailbox[]>;
  status(folder: string, query: Record<string, boolean>): Promise<MailboxStatus>;
  search(query: Record<string, unknown>, options?: Record<string, unknown>): Promise<number[]>;
  fetchOne(
    seq: string,
    query: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<FetchResult>;
  fetch(
    range: string,
    query: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): AsyncIterable<FetchResult>;
  messageFlagsAdd(
    range: string | number[],
    flags: string[],
    options?: Record<string, unknown>,
  ): Promise<boolean>;
  messageFlagsRemove(
    range: string | number[],
    flags: string[],
    options?: Record<string, unknown>,
  ): Promise<boolean>;
  messageMove(
    range: string | number[],
    destination: string,
    options?: Record<string, unknown>,
  ): Promise<unknown>;
  messageDelete(
    range: string | number[],
    options?: Record<string, unknown>,
  ): Promise<boolean>;
  append(
    folder: string,
    content: string | Buffer,
    flags?: string[],
    internalDate?: Date,
  ): Promise<{ uid: number; uidValidity: number }>;
  mailboxCreate(path: string): Promise<{ path: string; created: boolean }>;
  mailboxDelete(path: string): Promise<{ path: string; deleted: boolean }>;
  idle(): Promise<void>;
  on(event: string, callback: (...args: unknown[]) => void): void;
  usable: boolean;
}

interface MailboxLock {
  release(): void;
}

interface ImapMailbox {
  path: string;
  name: string;
  delimiter: string;
  flags: Set<string>;
  specialUse?: string;
  listed: boolean;
  subscribed?: boolean;
}

interface MailboxStatus {
  messages: number;
  recent: number;
  unseen: number;
  uidNext: number;
  uidValidity: number;
}

interface FetchResult {
  uid: number;
  seq: number;
  flags: Set<string>;
  envelope: {
    date?: Date;
    subject?: string;
    from?: ImapAddress[];
    to?: ImapAddress[];
    cc?: ImapAddress[];
    bcc?: ImapAddress[];
    replyTo?: ImapAddress[];
    messageId?: string;
    inReplyTo?: string;
  };
  source?: Buffer;
  bodyStructure?: unknown;
}

interface ImapAddress {
  name?: string;
  address?: string;
}

interface ParsedMail {
  messageId?: string;
  inReplyTo?: string;
  references?: string | string[];
  from?: { text: string; value: Array<{ name?: string; address?: string }> };
  to?: { text: string; value: Array<{ name?: string; address?: string }> };
  cc?: { text: string; value: Array<{ name?: string; address?: string }> };
  bcc?: { text: string; value: Array<{ name?: string; address?: string }> };
  replyTo?: { text: string; value: Array<{ name?: string; address?: string }> };
  subject?: string;
  text?: string;
  html?: string | false;
  textAsHtml?: string;
  date?: Date;
  attachments?: ParsedAttachment[];
  headers?: Map<string, string | string[]>;
  headerLines?: Array<{ key: string; line: string }>;
}

interface ParsedAttachment {
  filename?: string;
  contentType?: string;
  size?: number;
  content?: Buffer;
  contentId?: string;
  contentDisposition?: string;
  related?: boolean;
}

interface MailParserModule {
  simpleParser(source: Buffer | string): Promise<ParsedMail>;
}

interface NodemailerModule {
  createTransport(options: Record<string, unknown>): SmtpTransport;
}

interface SmtpTransport {
  sendMail(options: Record<string, unknown>): Promise<SmtpResult>;
  close(): void;
  verify(): Promise<boolean>;
}

interface SmtpResult {
  messageId: string;
  envelope: { from: string; to: string[] };
  accepted: string[];
  rejected: string[];
}

const SPECIAL_USE_MAP: Record<string, Folder['type']> = {
  '\\Inbox': 'inbox',
  '\\Sent': 'sent',
  '\\Drafts': 'drafts',
  '\\Trash': 'trash',
  '\\Junk': 'spam',
  '\\Archive': 'archive',
  '\\All': 'archive',
};

export class ImapSmtpProvider extends BaseProvider {
  readonly type = 'imap' as const;

  private imap: ImapClient | null = null;
  private smtp: SmtpTransport | null = null;
  private config: ImapSmtpProviderConfig;
  private simpleParser: ((source: Buffer | string) => Promise<ParsedMail>) | null = null;

  constructor(config: ImapSmtpProviderConfig) {
    super();
    this.config = config;
  }

  async connect(): Promise<void> {
    try {
      const [imapModule, nodemailerModule, mailparserModule] = await Promise.all([
        tryImport<ImapFlowModule>('imapflow', 'IMAP provider'),
        tryImport<NodemailerModule>('nodemailer', 'SMTP provider'),
        tryImport<MailParserModule>('mailparser', 'email parsing'),
      ]);

      this.simpleParser = mailparserModule.simpleParser;

      const imapAuth = 'accessToken' in this.config.imap.auth
        ? {
            user: this.config.imap.auth.user,
            accessToken: this.config.imap.auth.accessToken,
          }
        : {
            user: this.config.imap.auth.user,
            pass: this.config.imap.auth.pass,
          };

      this.imap = new imapModule.ImapFlow({
        host: this.config.imap.host,
        port: this.config.imap.port,
        secure: this.config.imap.secure ?? true,
        auth: imapAuth,
        logger: false,
      });
      await this.imap.connect();

      const smtpAuth = 'accessToken' in this.config.smtp.auth
        ? {
            type: 'OAuth2',
            user: this.config.smtp.auth.user,
            accessToken: this.config.smtp.auth.accessToken,
          }
        : {
            user: this.config.smtp.auth.user,
            pass: this.config.smtp.auth.pass,
          };

      this.smtp = nodemailerModule.createTransport({
        host: this.config.smtp.host,
        port: this.config.smtp.port,
        secure: this.config.smtp.secure ?? (this.config.smtp.port === 465),
        auth: smtpAuth,
      });
      await this.smtp.verify();

      this.connected = true;
    } catch (err) {
      throw err instanceof ProviderError
        ? err
        : new AuthenticationError('Failed to connect to IMAP/SMTP server', err);
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.imap) await this.imap.logout();
    } catch {
      // best-effort
    }
    try {
      if (this.smtp) this.smtp.close();
    } catch {
      // best-effort
    }
    this.imap = null;
    this.smtp = null;
    this.connected = false;
  }

  private imapClient(): ImapClient {
    this.ensureConnected();
    return this.imap!;
  }

  private smtpClient(): SmtpTransport {
    this.ensureConnected();
    return this.smtp!;
  }

  async listEmails(options: ListEmailsOptions = {}): Promise<ListResult<Email>> {
    const folder = options.folder ?? 'INBOX';
    const lock = await this.imapClient().getMailboxLock(folder);
    try {
      const searchQuery = this.buildImapSearch(options);
      const uids = await this.imapClient().search(searchQuery, { uid: true });

      if (uids.length === 0) {
        return { items: [], hasMore: false, total: 0 };
      }

      const sortedUids = [...uids].sort((a, b) =>
        options.sortOrder === 'asc' ? a - b : b - a,
      );

      const offset = options.offset ?? 0;
      const limit = options.limit ?? 20;
      const pageUids = sortedUids.slice(offset, offset + limit);

      if (pageUids.length === 0) {
        return { items: [], hasMore: false, total: uids.length };
      }

      const emails: Email[] = [];
      const range = pageUids.join(',');

      for await (const msg of this.imapClient().fetch(range, {
        uid: true,
        flags: true,
        envelope: true,
        source: true,
      }, { uid: true })) {
        const parsed = await this.parseImapMessage(msg, folder);
        emails.push(parsed);
      }

      return {
        items: emails,
        total: uids.length,
        hasMore: offset + limit < uids.length,
        nextCursor: offset + limit < uids.length ? String(offset + limit) : undefined,
      };
    } catch (err) {
      throw this.wrapError('Failed to list emails', err);
    } finally {
      lock.release();
    }
  }

  async getEmail(id: string): Promise<Email> {
    const { folder, uid } = this.parseEmailId(id);
    const lock = await this.imapClient().getMailboxLock(folder);
    try {
      const msg = await this.imapClient().fetchOne(String(uid), {
        uid: true,
        flags: true,
        envelope: true,
        source: true,
      }, { uid: true });

      if (!msg) throw this.notFound('Email', id);
      return this.parseImapMessage(msg, folder);
    } catch (err) {
      if (err instanceof NotFoundError) throw err;
      throw this.wrapError(`Failed to get email ${id}`, err);
    } finally {
      lock.release();
    }
  }

  async getThread(threadId: string): Promise<Thread> {
    try {
      const { subject, folder } = this.parseThreadId(threadId);
      const normalizedSubject = normalizeSubject(subject);

      const lock = await this.imapClient().getMailboxLock(folder);
      let allUids: number[];
      try {
        allUids = await this.imapClient().search(
          { subject: normalizedSubject },
          { uid: true },
        );
      } finally {
        lock.release();
      }

      if (allUids.length === 0) {
        throw this.notFound('Thread', threadId);
      }

      const lock2 = await this.imapClient().getMailboxLock(folder);
      const emails: Email[] = [];
      try {
        for await (const msg of this.imapClient().fetch(allUids.join(','), {
          uid: true,
          flags: true,
          envelope: true,
          source: true,
        }, { uid: true })) {
          const parsed = await this.parseImapMessage(msg, folder);
          if (normalizeSubject(parsed.subject) === normalizedSubject) {
            emails.push(parsed);
          }
        }
      } finally {
        lock2.release();
      }

      if (emails.length === 0) {
        throw this.notFound('Thread', threadId);
      }

      emails.sort((a, b) => a.date.getTime() - b.date.getTime());

      const participants = this.collectParticipants(emails);

      return {
        id: threadId,
        subject: emails[0].subject,
        emails,
        participants,
        lastDate: emails[emails.length - 1].date,
        messageCount: emails.length,
        labels: [...new Set(emails.flatMap((e) => e.labels))],
        snippet: emails[emails.length - 1].snippet,
      };
    } catch (err) {
      if (err instanceof NotFoundError) throw err;
      throw this.wrapError(`Failed to get thread ${threadId}`, err);
    }
  }

  async getAttachmentContent(emailId: string, attachmentId: string): Promise<Buffer> {
    const email = await this.getEmail(emailId);
    const attachment = email.attachments.find((a) => a.id === attachmentId);
    if (!attachment?.content) {
      throw this.notFound('Attachment', attachmentId);
    }
    return Buffer.from(attachment.content);
  }

  async sendEmail(options: SendEmailOptions): Promise<SendResult> {
    this.validateSendOptions(options);
    try {
      const mailOptions = this.buildNodemailerMessage(options);
      const result = await this.smtpClient().sendMail(mailOptions);

      return {
        id: generateId(),
        messageId: result.messageId,
      };
    } catch (err) {
      throw this.wrapError('Failed to send email', err);
    }
  }

  async replyToEmail(emailId: string, options: ReplyOptions): Promise<SendResult> {
    try {
      const original = await this.getEmail(emailId);
      const to = options.replyAll
        ? [original.from, ...original.to, ...original.cc]
        : [original.from];
      const subject = original.subject.startsWith('Re:')
        ? original.subject
        : `Re: ${original.subject}`;

      const references = original.headers.references
        ? [...original.headers.references, original.headers.messageId]
        : [original.headers.messageId];

      const mailOptions = this.buildNodemailerMessage({
        to,
        subject,
        text: options.text,
        html: options.html,
        attachments: options.attachments,
        headers: {
          'In-Reply-To': original.headers.messageId,
          'References': references.join(' '),
        },
      });

      const result = await this.smtpClient().sendMail(mailOptions);
      return {
        id: generateId(),
        threadId: original.threadId,
        messageId: result.messageId,
      };
    } catch (err) {
      throw this.wrapError('Failed to reply to email', err);
    }
  }

  async forwardEmail(emailId: string, options: ForwardOptions): Promise<SendResult> {
    try {
      const original = await this.getEmail(emailId);
      const subject = original.subject.startsWith('Fwd:')
        ? original.subject
        : `Fwd: ${original.subject}`;

      const forwardedHeader = [
        '---------- Forwarded message ---------',
        `From: ${formatEmailAddress(original.from)}`,
        `Date: ${original.date.toISOString()}`,
        `Subject: ${original.subject}`,
        `To: ${original.to.map(formatEmailAddress).join(', ')}`,
        '',
      ].join('\n');

      const text = options.text
        ? `${options.text}\n\n${forwardedHeader}\n${original.body.text ?? ''}`
        : `${forwardedHeader}\n${original.body.text ?? ''}`;

      const allAttachments = [
        ...(options.attachments ?? []),
        ...original.attachments
          .filter((a) => !a.isInline && a.content)
          .map((a) => ({
            filename: a.filename,
            content: a.content!,
            contentType: a.contentType,
          })),
      ];

      const mailOptions = this.buildNodemailerMessage({
        to: options.to,
        subject,
        text,
        html: options.html,
        attachments: allAttachments,
      });

      const result = await this.smtpClient().sendMail(mailOptions);
      return {
        id: generateId(),
        messageId: result.messageId,
      };
    } catch (err) {
      throw this.wrapError('Failed to forward email', err);
    }
  }

  async createDraft(options: SendEmailOptions): Promise<Email> {
    this.validateSendOptions(options);
    try {
      const to = normalizeAddresses(options.to);
      const cc = normalizeAddresses(options.cc);
      const bcc = normalizeAddresses(options.bcc);

      const headerLines = [
        `From: ${this.getSenderAddress()}`,
        `To: ${to.map(formatEmailAddress).join(', ')}`,
        ...(cc.length ? [`Cc: ${cc.map(formatEmailAddress).join(', ')}`] : []),
        ...(bcc.length ? [`Bcc: ${bcc.map(formatEmailAddress).join(', ')}`] : []),
        `Subject: ${options.subject ?? ''}`,
        'MIME-Version: 1.0',
        `Date: ${new Date().toUTCString()}`,
        `Message-ID: <${generateId()}@emai>`,
      ];

      if (options.html) {
        headerLines.push('Content-Type: text/html; charset=UTF-8');
        headerLines.push('');
        headerLines.push(options.html);
      } else {
        headerLines.push('Content-Type: text/plain; charset=UTF-8');
        headerLines.push('');
        headerLines.push(options.text ?? '');
      }

      const raw = headerLines.join('\r\n');
      const draftsFolder = await this.findSpecialFolder('\\Drafts') ?? 'Drafts';

      const result = await this.imapClient().append(
        draftsFolder,
        Buffer.from(raw),
        ['\\Draft', '\\Seen'],
      );

      const id = this.makeEmailId(draftsFolder, result.uid);
      return this.getEmail(id);
    } catch (err) {
      throw this.wrapError('Failed to create draft', err);
    }
  }

  async updateDraft(draftId: string, options: SendEmailOptions): Promise<Email> {
    try {
      await this.deleteDraft(draftId);
      return await this.createDraft(options);
    } catch (err) {
      throw this.wrapError('Failed to update draft', err);
    }
  }

  async deleteDraft(draftId: string): Promise<void> {
    const { folder, uid } = this.parseEmailId(draftId);
    const lock = await this.imapClient().getMailboxLock(folder);
    try {
      await this.imapClient().messageDelete([uid], { uid: true });
    } catch (err) {
      throw this.wrapError('Failed to delete draft', err);
    } finally {
      lock.release();
    }
  }

  async markAsRead(emailId: string): Promise<void> {
    const { folder, uid } = this.parseEmailId(emailId);
    const lock = await this.imapClient().getMailboxLock(folder);
    try {
      await this.imapClient().messageFlagsAdd([uid], ['\\Seen'], { uid: true });
    } catch (err) {
      throw this.wrapError('Failed to mark as read', err);
    } finally {
      lock.release();
    }
  }

  async markAsUnread(emailId: string): Promise<void> {
    const { folder, uid } = this.parseEmailId(emailId);
    const lock = await this.imapClient().getMailboxLock(folder);
    try {
      await this.imapClient().messageFlagsRemove([uid], ['\\Seen'], { uid: true });
    } catch (err) {
      throw this.wrapError('Failed to mark as unread', err);
    } finally {
      lock.release();
    }
  }

  async star(emailId: string): Promise<void> {
    const { folder, uid } = this.parseEmailId(emailId);
    const lock = await this.imapClient().getMailboxLock(folder);
    try {
      await this.imapClient().messageFlagsAdd([uid], ['\\Flagged'], { uid: true });
    } catch (err) {
      throw this.wrapError('Failed to star email', err);
    } finally {
      lock.release();
    }
  }

  async unstar(emailId: string): Promise<void> {
    const { folder, uid } = this.parseEmailId(emailId);
    const lock = await this.imapClient().getMailboxLock(folder);
    try {
      await this.imapClient().messageFlagsRemove([uid], ['\\Flagged'], { uid: true });
    } catch (err) {
      throw this.wrapError('Failed to unstar email', err);
    } finally {
      lock.release();
    }
  }

  async moveToFolder(emailId: string, destination: string): Promise<void> {
    const { folder, uid } = this.parseEmailId(emailId);
    const lock = await this.imapClient().getMailboxLock(folder);
    try {
      await this.imapClient().messageMove([uid], destination, { uid: true });
    } catch (err) {
      throw this.wrapError('Failed to move to folder', err);
    } finally {
      lock.release();
    }
  }

  async deleteEmail(emailId: string): Promise<void> {
    try {
      const trashFolder = await this.findSpecialFolder('\\Trash') ?? 'Trash';
      const { folder } = this.parseEmailId(emailId);

      if (folder === trashFolder) {
        const { uid } = this.parseEmailId(emailId);
        const lock = await this.imapClient().getMailboxLock(folder);
        try {
          await this.imapClient().messageFlagsAdd([uid], ['\\Deleted'], { uid: true });
        } finally {
          lock.release();
        }
      } else {
        await this.moveToFolder(emailId, trashFolder);
      }
    } catch (err) {
      throw this.wrapError('Failed to delete email', err);
    }
  }

  async archiveEmail(emailId: string): Promise<void> {
    try {
      const archiveFolder = await this.findSpecialFolder('\\Archive') ?? 'Archive';
      await this.moveToFolder(emailId, archiveFolder);
    } catch (err) {
      throw this.wrapError('Failed to archive email', err);
    }
  }

  async listFolders(): Promise<Folder[]> {
    try {
      const mailboxes = await this.imapClient().list();
      const folders: Folder[] = [];

      for (const mb of mailboxes) {
        if (!mb.listed) continue;

        let folderType: Folder['type'] = 'custom';
        if (mb.specialUse) {
          folderType = SPECIAL_USE_MAP[mb.specialUse] ?? 'custom';
        } else {
          const lower = mb.name.toLowerCase();
          if (lower === 'inbox') folderType = 'inbox';
          else if (lower === 'sent' || lower === 'sent mail') folderType = 'sent';
          else if (lower === 'drafts') folderType = 'drafts';
          else if (lower === 'trash' || lower === 'deleted messages') folderType = 'trash';
          else if (lower === 'spam' || lower === 'junk') folderType = 'spam';
          else if (lower === 'archive' || lower === 'all mail') folderType = 'archive';
        }

        let status: MailboxStatus = { messages: 0, recent: 0, unseen: 0, uidNext: 0, uidValidity: 0 };
        try {
          status = await this.imapClient().status(mb.path, {
            messages: true,
            unseen: true,
            recent: false,
            uidNext: false,
            uidValidity: false,
          });
        } catch {
          // some mailboxes may not support STATUS
        }

        folders.push({
          id: mb.path,
          name: mb.name,
          path: mb.path,
          type: folderType,
          unreadCount: status.unseen,
          totalCount: status.messages,
        });
      }

      return folders;
    } catch (err) {
      throw this.wrapError('Failed to list folders', err);
    }
  }

  async createFolder(name: string, parentId?: string): Promise<Folder> {
    try {
      const path = parentId ? `${parentId}/${name}` : name;
      await this.imapClient().mailboxCreate(path);
      return {
        id: path,
        name,
        path,
        type: 'custom',
        unreadCount: 0,
        totalCount: 0,
      };
    } catch (err) {
      throw this.wrapError('Failed to create folder', err);
    }
  }

  async deleteFolder(folderId: string): Promise<void> {
    try {
      await this.imapClient().mailboxDelete(folderId);
    } catch (err) {
      throw this.wrapError('Failed to delete folder', err);
    }
  }

  async listLabels(): Promise<Label[]> {
    return [];
  }

  async addLabel(emailId: string, label: string): Promise<void> {
    const { folder, uid } = this.parseEmailId(emailId);
    const lock = await this.imapClient().getMailboxLock(folder);
    try {
      await this.imapClient().messageFlagsAdd([uid], [label], { uid: true });
    } catch (err) {
      throw this.wrapError('Failed to add label', err);
    } finally {
      lock.release();
    }
  }

  async removeLabel(emailId: string, label: string): Promise<void> {
    const { folder, uid } = this.parseEmailId(emailId);
    const lock = await this.imapClient().getMailboxLock(folder);
    try {
      await this.imapClient().messageFlagsRemove([uid], [label], { uid: true });
    } catch (err) {
      throw this.wrapError('Failed to remove label', err);
    } finally {
      lock.release();
    }
  }

  async createLabel(name: string): Promise<Label> {
    return {
      id: name,
      name,
      type: 'user',
    };
  }

  async deleteLabel(_labelId: string): Promise<void> {
    // IMAP keywords cannot be globally deleted; they simply stop being used
  }

  async watch(callback: (email: Email) => void): Promise<WatchHandle> {
    this.ensureConnected();
    let active = true;

    const runIdle = async () => {
      while (active && this.imap?.usable) {
        const lock = await this.imapClient().getMailboxLock('INBOX');
        try {
          const status = await this.imapClient().status('INBOX', {
            messages: true,
            unseen: false,
            recent: false,
            uidNext: true,
            uidValidity: false,
          });
          const lastUid = status.uidNext - 1;

          this.imap!.on('exists', async (data: unknown) => {
            if (!active) return;
            try {
              const existsData = data as { count?: number; prevCount?: number };
              if (existsData.count && existsData.prevCount && existsData.count > existsData.prevCount) {
                const newUids = await this.imapClient().search(
                  { uid: `${lastUid + 1}:*` },
                  { uid: true },
                );
                for (const uid of newUids) {
                  const msg = await this.imapClient().fetchOne(String(uid), {
                    uid: true,
                    flags: true,
                    envelope: true,
                    source: true,
                  }, { uid: true });
                  const email = await this.parseImapMessage(msg, 'INBOX');
                  callback(email);
                }
              }
            } catch {
              // non-fatal
            }
          });

          await this.imap!.idle();
        } catch {
          if (active) {
            await new Promise((r) => setTimeout(r, 5000));
          }
        } finally {
          lock.release();
        }
      }
    };

    runIdle().catch(() => {});

    return {
      stop: async () => {
        active = false;
      },
    };
  }

  // ---- internal helpers ----

  private async parseImapMessage(msg: FetchResult, folder: string): Promise<Email> {
    const id = this.makeEmailId(folder, msg.uid);

    if (msg.source && this.simpleParser) {
      const parsed = await this.simpleParser(msg.source);
      return this.parsedMailToEmail(parsed, id, folder, msg);
    }

    const env = msg.envelope;
    const from = this.imapAddressToEmailAddress(env.from?.[0]);
    const to = (env.to ?? []).map((a) => this.imapAddressToEmailAddress(a));
    const cc = (env.cc ?? []).map((a) => this.imapAddressToEmailAddress(a));
    const bcc = (env.bcc ?? []).map((a) => this.imapAddressToEmailAddress(a));
    const replyTo = env.replyTo?.[0]
      ? this.imapAddressToEmailAddress(env.replyTo[0])
      : undefined;

    const flags = msg.flags;
    const labels = [...flags].filter((f) => !f.startsWith('\\'));

    return {
      id,
      threadId: undefined,
      provider: 'imap',
      from,
      to,
      cc,
      bcc,
      replyTo,
      subject: env.subject ?? '',
      body: {},
      attachments: [],
      labels,
      folder,
      date: env.date ?? new Date(),
      receivedDate: env.date ?? new Date(),
      isRead: flags.has('\\Seen'),
      isStarred: flags.has('\\Flagged'),
      isDraft: flags.has('\\Draft'),
      headers: {
        messageId: env.messageId ?? '',
        inReplyTo: env.inReplyTo ?? undefined,
      },
      snippet: undefined,
    };
  }

  private parsedMailToEmail(
    parsed: ParsedMail,
    id: string,
    folder: string,
    msg: FetchResult,
  ): Email {
    const from = parsed.from?.value[0]
      ? { name: parsed.from.value[0].name, address: parsed.from.value[0].address ?? '' }
      : { address: '' };

    const to = (parsed.to?.value ?? []).map((a) => ({
      name: a.name,
      address: a.address ?? '',
    }));

    const cc = (parsed.cc?.value ?? []).map((a) => ({
      name: a.name,
      address: a.address ?? '',
    }));

    const bcc = (parsed.bcc?.value ?? []).map((a) => ({
      name: a.name,
      address: a.address ?? '',
    }));

    const replyTo = parsed.replyTo?.value[0]
      ? { name: parsed.replyTo.value[0].name, address: parsed.replyTo.value[0].address ?? '' }
      : undefined;

    const body: EmailBody = {
      text: parsed.text,
      html: parsed.html || undefined,
    };

    const attachments: Attachment[] = (parsed.attachments ?? []).map((att, idx) => ({
      id: att.contentId ?? `att-${idx}`,
      filename: att.filename ?? `attachment-${idx}`,
      contentType: att.contentType ?? 'application/octet-stream',
      size: att.size ?? att.content?.length ?? 0,
      content: att.content,
      contentId: att.contentId,
      isInline: att.contentDisposition === 'inline',
    }));

    const references = parsed.references
      ? Array.isArray(parsed.references)
        ? parsed.references
        : parsed.references.split(/\s+/).filter(Boolean)
      : undefined;

    const flags = msg.flags;
    const labels = [...flags].filter((f) => !f.startsWith('\\'));

    const threadId = references?.[0]
      ? this.makeThreadId(folder, normalizeSubject(parsed.subject ?? ''))
      : undefined;

    const headers: EmailHeaders = {
      messageId: parsed.messageId ?? '',
      inReplyTo: parsed.inReplyTo,
      references,
    };

    return {
      id,
      threadId,
      provider: 'imap',
      from,
      to,
      cc,
      bcc,
      replyTo,
      subject: parsed.subject ?? '',
      body,
      attachments,
      labels,
      folder,
      date: parsed.date ?? new Date(),
      receivedDate: parsed.date ?? new Date(),
      isRead: flags.has('\\Seen'),
      isStarred: flags.has('\\Flagged'),
      isDraft: flags.has('\\Draft'),
      headers,
      snippet: parsed.text?.slice(0, 200),
    };
  }

  private imapAddressToEmailAddress(addr?: ImapAddress): EmailAddress {
    return {
      name: addr?.name,
      address: addr?.address ?? '',
    };
  }

  private buildImapSearch(options: ListEmailsOptions): Record<string, unknown> {
    const query: Record<string, unknown> = {};

    if (options.query) query.body = options.query;
    if (options.from) query.from = options.from;
    if (options.to) query.to = options.to;
    if (options.subject) query.subject = options.subject;
    if (options.after) query.since = options.after;
    if (options.before) query.before = options.before;
    if (options.isRead === true) query.seen = true;
    if (options.isRead === false) query.unseen = true;
    if (options.isStarred === true) query.flagged = true;
    if (options.isStarred === false) query.unflagged = true;

    if (Object.keys(query).length === 0) {
      query.all = true;
    }

    return query;
  }

  private buildNodemailerMessage(options: SendEmailOptions): Record<string, unknown> {
    const to = normalizeAddresses(options.to);
    const cc = normalizeAddresses(options.cc);
    const bcc = normalizeAddresses(options.bcc);

    const mailOptions: Record<string, unknown> = {
      from: this.getSenderAddress(),
      to: to.map(formatEmailAddress),
      subject: options.subject,
    };

    if (cc.length > 0) mailOptions.cc = cc.map(formatEmailAddress);
    if (bcc.length > 0) mailOptions.bcc = bcc.map(formatEmailAddress);

    if (options.text) mailOptions.text = options.text;
    if (options.html) mailOptions.html = options.html;

    if (options.replyTo) {
      const rt = normalizeAddresses(options.replyTo);
      if (rt.length > 0) mailOptions.replyTo = formatEmailAddress(rt[0]);
    }

    if (options.headers) {
      mailOptions.headers = options.headers;
    }

    if (options.attachments && options.attachments.length > 0) {
      mailOptions.attachments = options.attachments.map((att) => ({
        filename: att.filename,
        content: att.content,
        contentType: att.contentType,
        encoding: att.encoding,
      }));
    }

    return mailOptions;
  }

  private getSenderAddress(): string {
    const auth = this.config.smtp.auth;
    return auth.user;
  }

  private makeEmailId(folder: string, uid: number): string {
    return `${encodeURIComponent(folder)}:${uid}`;
  }

  private parseEmailId(id: string): { folder: string; uid: number } {
    const colonIdx = id.lastIndexOf(':');
    if (colonIdx === -1) {
      return { folder: 'INBOX', uid: Number(id) };
    }
    return {
      folder: decodeURIComponent(id.slice(0, colonIdx)),
      uid: Number(id.slice(colonIdx + 1)),
    };
  }

  private makeThreadId(folder: string, normalizedSubject: string): string {
    return `thread:${encodeURIComponent(folder)}:${encodeURIComponent(normalizedSubject)}`;
  }

  private parseThreadId(threadId: string): { folder: string; subject: string } {
    const parts = threadId.replace(/^thread:/, '').split(':');
    return {
      folder: decodeURIComponent(parts[0] ?? 'INBOX'),
      subject: decodeURIComponent(parts[1] ?? ''),
    };
  }

  private async findSpecialFolder(specialUse: string): Promise<string | null> {
    try {
      const mailboxes = await this.imapClient().list();
      const mb = mailboxes.find((m) => m.specialUse === specialUse);
      return mb?.path ?? null;
    } catch {
      return null;
    }
  }

  private collectParticipants(emails: Email[]): EmailAddress[] {
    const seen = new Set<string>();
    const result: EmailAddress[] = [];
    for (const email of emails) {
      for (const addr of [email.from, ...email.to, ...email.cc]) {
        if (addr.address && !seen.has(addr.address)) {
          seen.add(addr.address);
          result.push(addr);
        }
      }
    }
    return result;
  }
}
