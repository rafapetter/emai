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
  GmailProviderConfig,
  EmailAddress,
  Attachment,
  EmailBody,
  EmailHeaders,
} from '../core/types.js';
import { tryImport, normalizeAddresses, formatEmailAddress, normalizeSubject } from '../core/utils.js';
import { ProviderError, AuthenticationError, NotFoundError } from '../core/errors.js';
import { BaseProvider } from './base.js';

interface GmailAPI {
  gmail: (options: { version: string }) => GmailService;
}

interface GmailService {
  users: {
    messages: {
      list: (params: Record<string, unknown>) => Promise<{ data: Record<string, unknown> }>;
      get: (params: Record<string, unknown>) => Promise<{ data: Record<string, unknown> }>;
      send: (params: Record<string, unknown>) => Promise<{ data: Record<string, unknown> }>;
      trash: (params: Record<string, unknown>) => Promise<{ data: Record<string, unknown> }>;
      modify: (params: Record<string, unknown>) => Promise<{ data: Record<string, unknown> }>;
      batchModify: (params: Record<string, unknown>) => Promise<{ data: Record<string, unknown> }>;
    };
    threads: {
      get: (params: Record<string, unknown>) => Promise<{ data: Record<string, unknown> }>;
    };
    drafts: {
      create: (params: Record<string, unknown>) => Promise<{ data: Record<string, unknown> }>;
      update: (params: Record<string, unknown>) => Promise<{ data: Record<string, unknown> }>;
      delete: (params: Record<string, unknown>) => Promise<{ data: Record<string, unknown> }>;
      get: (params: Record<string, unknown>) => Promise<{ data: Record<string, unknown> }>;
    };
    labels: {
      list: (params: Record<string, unknown>) => Promise<{ data: Record<string, unknown> }>;
      get: (params: Record<string, unknown>) => Promise<{ data: Record<string, unknown> }>;
      create: (params: Record<string, unknown>) => Promise<{ data: Record<string, unknown> }>;
      delete: (params: Record<string, unknown>) => Promise<{ data: Record<string, unknown> }>;
    };
    watch: (params: Record<string, unknown>) => Promise<{ data: Record<string, unknown> }>;
    stop: (params: Record<string, unknown>) => Promise<{ data: Record<string, unknown> }>;
  };
}

interface OAuth2ClientConstructor {
  new (clientId: string, clientSecret: string): OAuth2Client;
}

interface OAuth2Client {
  setCredentials(credentials: Record<string, unknown>): void;
  getAccessToken(): Promise<{ token?: string | null }>;
}

interface GoogleApis {
  google: GmailAPI & {
    auth: {
      OAuth2: OAuth2ClientConstructor;
    };
  };
}

interface GmailMessage {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailPayload;
  raw?: string;
}

interface GmailPayload {
  headers?: Array<{ name: string; value: string }>;
  mimeType?: string;
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPayload[];
  filename?: string;
}

const GMAIL_SYSTEM_LABELS: Record<string, { name: string; type: Folder['type'] }> = {
  INBOX: { name: 'Inbox', type: 'inbox' },
  SENT: { name: 'Sent', type: 'sent' },
  DRAFT: { name: 'Drafts', type: 'drafts' },
  TRASH: { name: 'Trash', type: 'trash' },
  SPAM: { name: 'Spam', type: 'spam' },
  STARRED: { name: 'Starred', type: 'custom' },
  IMPORTANT: { name: 'Important', type: 'custom' },
  CATEGORY_PERSONAL: { name: 'Personal', type: 'custom' },
  CATEGORY_SOCIAL: { name: 'Social', type: 'custom' },
  CATEGORY_PROMOTIONS: { name: 'Promotions', type: 'custom' },
  CATEGORY_UPDATES: { name: 'Updates', type: 'custom' },
  CATEGORY_FORUMS: { name: 'Forums', type: 'custom' },
};

export class GmailProvider extends BaseProvider {
  readonly type = 'gmail' as const;

  private gmail: GmailService | null = null;
  private auth: OAuth2Client | null = null;
  private config: GmailProviderConfig;

  constructor(config: GmailProviderConfig) {
    super();
    this.config = config;
  }

  async connect(): Promise<void> {
    try {
      const { google } = await tryImport<GoogleApis>('googleapis', 'Gmail provider');
      this.auth = new google.auth.OAuth2(
        this.config.credentials.clientId,
        this.config.credentials.clientSecret,
      );
      this.auth.setCredentials({
        refresh_token: this.config.credentials.refreshToken,
        access_token: this.config.credentials.accessToken,
      });
      await this.auth.getAccessToken();
      this.gmail = google.gmail({ version: 'v1' });
      this.connected = true;
    } catch (err) {
      throw err instanceof ProviderError
        ? err
        : new AuthenticationError('Failed to connect to Gmail', err);
    }
  }

  async disconnect(): Promise<void> {
    this.gmail = null;
    this.auth = null;
    this.connected = false;
  }

  private api(): GmailService {
    this.ensureConnected();
    return this.gmail!;
  }

  async listEmails(options: ListEmailsOptions = {}): Promise<ListResult<Email>> {
    try {
      const q = this.buildSearchQuery(options);
      const params: Record<string, unknown> = {
        userId: 'me',
        maxResults: options.limit ?? 20,
        auth: this.auth,
      };
      if (q) params.q = q;
      if (options.cursor) params.pageToken = options.cursor;
      if (options.label) params.labelIds = [options.label];
      if (options.folder) {
        const labelId = this.folderToLabelId(options.folder);
        params.labelIds = [labelId];
      }

      const res = await this.api().users.messages.list(params);
      const data = res.data as {
        messages?: Array<{ id: string; threadId: string }>;
        nextPageToken?: string;
        resultSizeEstimate?: number;
      };

      if (!data.messages || data.messages.length === 0) {
        return { items: [], hasMore: false, total: 0 };
      }

      const emails = await Promise.all(
        data.messages.map((msg) => this.fetchFullMessage(msg.id)),
      );

      return {
        items: emails,
        nextCursor: data.nextPageToken,
        hasMore: !!data.nextPageToken,
        total: data.resultSizeEstimate,
      };
    } catch (err) {
      throw this.wrapError('Failed to list emails', err);
    }
  }

  async getEmail(id: string): Promise<Email> {
    try {
      return await this.fetchFullMessage(id);
    } catch (err) {
      if (err instanceof NotFoundError) throw err;
      throw this.wrapError(`Failed to get email ${id}`, err);
    }
  }

  async getThread(threadId: string): Promise<Thread> {
    try {
      const res = await this.api().users.threads.get({
        userId: 'me',
        id: threadId,
        format: 'full',
        auth: this.auth,
      });
      const data = res.data as {
        id: string;
        messages?: GmailMessage[];
        snippet?: string;
      };

      if (!data.messages || data.messages.length === 0) {
        throw this.notFound('Thread', threadId);
      }

      const emails = data.messages.map((msg) => this.parseMessage(msg));
      const participants = this.collectParticipants(emails);

      return {
        id: data.id,
        subject: emails[0]?.subject ?? '',
        emails,
        participants,
        lastDate: emails[emails.length - 1].date,
        messageCount: emails.length,
        labels: [...new Set(emails.flatMap((e) => e.labels))],
        snippet: data.snippet,
      };
    } catch (err) {
      if (err instanceof NotFoundError) throw err;
      throw this.wrapError(`Failed to get thread ${threadId}`, err);
    }
  }

  async getAttachmentContent(emailId: string, attachmentId: string): Promise<Buffer> {
    try {
      const res = await this.api().users.messages.get({
        userId: 'me',
        id: emailId,
        auth: this.auth,
      });
      const msg = res.data as GmailMessage;
      const attPart = this.findAttachmentPart(msg.payload, attachmentId);
      if (!attPart) {
        throw this.notFound('Attachment', attachmentId);
      }

      if (attPart.body?.data) {
        return Buffer.from(attPart.body.data, 'base64url');
      }

      const attRes = await (this.api().users.messages as unknown as {
        attachments: {
          get: (params: Record<string, unknown>) => Promise<{ data: { data: string } }>;
        };
      }).attachments.get({
        userId: 'me',
        messageId: emailId,
        id: attachmentId,
        auth: this.auth,
      });

      return Buffer.from(attRes.data.data, 'base64url');
    } catch (err) {
      if (err instanceof NotFoundError) throw err;
      throw this.wrapError('Failed to get attachment content', err);
    }
  }

  async sendEmail(options: SendEmailOptions): Promise<SendResult> {
    this.validateSendOptions(options);
    try {
      const raw = this.buildRawMessage(options);
      const res = await this.api().users.messages.send({
        userId: 'me',
        requestBody: { raw },
        auth: this.auth,
      });
      const data = res.data as { id: string; threadId: string };
      const sent = await this.fetchFullMessage(data.id);
      return {
        id: data.id,
        threadId: data.threadId,
        messageId: sent.headers.messageId,
      };
    } catch (err) {
      throw this.wrapError('Failed to send email', err);
    }
  }

  async replyToEmail(emailId: string, options: ReplyOptions): Promise<SendResult> {
    try {
      const original = await this.getEmail(emailId);
      const to = options.replyAll
        ? [original.from, ...original.to, ...original.cc].filter(
            (a) => a.address !== 'me',
          )
        : [original.from];
      const subject = original.subject.startsWith('Re:')
        ? original.subject
        : `Re: ${original.subject}`;
      const headers: Record<string, string> = {
        'In-Reply-To': original.headers.messageId,
      };
      if (original.headers.references) {
        headers['References'] = [
          ...original.headers.references,
          original.headers.messageId,
        ].join(' ');
      } else {
        headers['References'] = original.headers.messageId;
      }

      const raw = this.buildRawMessage({
        to,
        subject,
        text: options.text,
        html: options.html,
        attachments: options.attachments,
        headers,
      });

      const res = await this.api().users.messages.send({
        userId: 'me',
        requestBody: { raw, threadId: original.threadId },
        auth: this.auth,
      });
      const data = res.data as { id: string; threadId: string };
      const sent = await this.fetchFullMessage(data.id);
      return { id: data.id, threadId: data.threadId, messageId: sent.headers.messageId };
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

      const raw = this.buildRawMessage({
        to: options.to,
        subject,
        text,
        html: options.html,
        attachments: allAttachments,
      });

      const res = await this.api().users.messages.send({
        userId: 'me',
        requestBody: { raw },
        auth: this.auth,
      });
      const data = res.data as { id: string; threadId: string };
      const sent = await this.fetchFullMessage(data.id);
      return { id: data.id, threadId: data.threadId, messageId: sent.headers.messageId };
    } catch (err) {
      throw this.wrapError('Failed to forward email', err);
    }
  }

  async createDraft(options: SendEmailOptions): Promise<Email> {
    this.validateSendOptions(options);
    try {
      const raw = this.buildRawMessage(options);
      const res = await this.api().users.drafts.create({
        userId: 'me',
        requestBody: { message: { raw } },
        auth: this.auth,
      });
      const data = res.data as { id: string; message: { id: string } };
      return await this.fetchFullMessage(data.message.id);
    } catch (err) {
      throw this.wrapError('Failed to create draft', err);
    }
  }

  async updateDraft(draftId: string, options: SendEmailOptions): Promise<Email> {
    this.validateSendOptions(options);
    try {
      const raw = this.buildRawMessage(options);
      const res = await this.api().users.drafts.update({
        userId: 'me',
        id: draftId,
        requestBody: { message: { raw } },
        auth: this.auth,
      });
      const data = res.data as { id: string; message: { id: string } };
      return await this.fetchFullMessage(data.message.id);
    } catch (err) {
      throw this.wrapError('Failed to update draft', err);
    }
  }

  async deleteDraft(draftId: string): Promise<void> {
    try {
      await this.api().users.drafts.delete({
        userId: 'me',
        id: draftId,
        auth: this.auth,
      });
    } catch (err) {
      throw this.wrapError('Failed to delete draft', err);
    }
  }

  async markAsRead(emailId: string): Promise<void> {
    try {
      await this.api().users.messages.modify({
        userId: 'me',
        id: emailId,
        requestBody: { removeLabelIds: ['UNREAD'] },
        auth: this.auth,
      });
    } catch (err) {
      throw this.wrapError('Failed to mark as read', err);
    }
  }

  async markAsUnread(emailId: string): Promise<void> {
    try {
      await this.api().users.messages.modify({
        userId: 'me',
        id: emailId,
        requestBody: { addLabelIds: ['UNREAD'] },
        auth: this.auth,
      });
    } catch (err) {
      throw this.wrapError('Failed to mark as unread', err);
    }
  }

  async star(emailId: string): Promise<void> {
    try {
      await this.api().users.messages.modify({
        userId: 'me',
        id: emailId,
        requestBody: { addLabelIds: ['STARRED'] },
        auth: this.auth,
      });
    } catch (err) {
      throw this.wrapError('Failed to star email', err);
    }
  }

  async unstar(emailId: string): Promise<void> {
    try {
      await this.api().users.messages.modify({
        userId: 'me',
        id: emailId,
        requestBody: { removeLabelIds: ['STARRED'] },
        auth: this.auth,
      });
    } catch (err) {
      throw this.wrapError('Failed to unstar email', err);
    }
  }

  async moveToFolder(emailId: string, folder: string): Promise<void> {
    try {
      const targetLabel = this.folderToLabelId(folder);
      const email = await this.getEmail(emailId);
      const currentLabels = email.labels.filter(
        (l) => l !== 'UNREAD' && l !== 'STARRED' && l !== 'IMPORTANT',
      );
      await this.api().users.messages.modify({
        userId: 'me',
        id: emailId,
        requestBody: {
          addLabelIds: [targetLabel],
          removeLabelIds: currentLabels,
        },
        auth: this.auth,
      });
    } catch (err) {
      throw this.wrapError('Failed to move to folder', err);
    }
  }

  async deleteEmail(emailId: string): Promise<void> {
    try {
      await this.api().users.messages.trash({
        userId: 'me',
        id: emailId,
        auth: this.auth,
      });
    } catch (err) {
      throw this.wrapError('Failed to delete email', err);
    }
  }

  async archiveEmail(emailId: string): Promise<void> {
    try {
      await this.api().users.messages.modify({
        userId: 'me',
        id: emailId,
        requestBody: { removeLabelIds: ['INBOX'] },
        auth: this.auth,
      });
    } catch (err) {
      throw this.wrapError('Failed to archive email', err);
    }
  }

  async listFolders(): Promise<Folder[]> {
    try {
      const res = await this.api().users.labels.list({
        userId: 'me',
        auth: this.auth,
      });
      const data = res.data as {
        labels?: Array<{
          id: string;
          name: string;
          type: string;
          messagesTotal?: number;
          messagesUnread?: number;
        }>;
      };
      if (!data.labels) return [];

      const folders: Folder[] = [];
      for (const label of data.labels) {
        const systemInfo = GMAIL_SYSTEM_LABELS[label.id];
        if (
          systemInfo ||
          label.type === 'user' ||
          label.id === 'INBOX' ||
          label.id === 'SENT' ||
          label.id === 'DRAFT' ||
          label.id === 'TRASH' ||
          label.id === 'SPAM'
        ) {
          const detail = await this.api().users.labels.get({
            userId: 'me',
            id: label.id,
            auth: this.auth,
          });
          const labelDetail = detail.data as {
            id: string;
            name: string;
            messagesTotal?: number;
            messagesUnread?: number;
          };

          folders.push({
            id: label.id,
            name: systemInfo?.name ?? label.name,
            path: label.name,
            type: systemInfo?.type ?? 'custom',
            unreadCount: labelDetail.messagesUnread ?? 0,
            totalCount: labelDetail.messagesTotal ?? 0,
          });
        }
      }
      return folders;
    } catch (err) {
      throw this.wrapError('Failed to list folders', err);
    }
  }

  async createFolder(name: string): Promise<Folder> {
    try {
      const res = await this.api().users.labels.create({
        userId: 'me',
        requestBody: {
          name,
          labelListVisibility: 'labelShow',
          messageListVisibility: 'show',
        },
        auth: this.auth,
      });
      const data = res.data as { id: string; name: string };
      return {
        id: data.id,
        name: data.name,
        path: data.name,
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
      await this.api().users.labels.delete({
        userId: 'me',
        id: folderId,
        auth: this.auth,
      });
    } catch (err) {
      throw this.wrapError('Failed to delete folder', err);
    }
  }

  async listLabels(): Promise<Label[]> {
    try {
      const res = await this.api().users.labels.list({
        userId: 'me',
        auth: this.auth,
      });
      const data = res.data as {
        labels?: Array<{ id: string; name: string; type: string; color?: { backgroundColor: string } }>;
      };
      if (!data.labels) return [];

      return data.labels.map((label) => ({
        id: label.id,
        name: label.name,
        color: label.color?.backgroundColor,
        type: label.type === 'system' ? ('system' as const) : ('user' as const),
      }));
    } catch (err) {
      throw this.wrapError('Failed to list labels', err);
    }
  }

  async addLabel(emailId: string, label: string): Promise<void> {
    try {
      await this.api().users.messages.modify({
        userId: 'me',
        id: emailId,
        requestBody: { addLabelIds: [label] },
        auth: this.auth,
      });
    } catch (err) {
      throw this.wrapError('Failed to add label', err);
    }
  }

  async removeLabel(emailId: string, label: string): Promise<void> {
    try {
      await this.api().users.messages.modify({
        userId: 'me',
        id: emailId,
        requestBody: { removeLabelIds: [label] },
        auth: this.auth,
      });
    } catch (err) {
      throw this.wrapError('Failed to remove label', err);
    }
  }

  async createLabel(name: string, color?: string): Promise<Label> {
    try {
      const requestBody: Record<string, unknown> = {
        name,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
      };
      if (color) {
        requestBody.color = { backgroundColor: color, textColor: '#ffffff' };
      }
      const res = await this.api().users.labels.create({
        userId: 'me',
        requestBody,
        auth: this.auth,
      });
      const data = res.data as { id: string; name: string; color?: { backgroundColor: string } };
      return {
        id: data.id,
        name: data.name,
        color: data.color?.backgroundColor,
        type: 'user',
      };
    } catch (err) {
      throw this.wrapError('Failed to create label', err);
    }
  }

  async deleteLabel(labelId: string): Promise<void> {
    try {
      await this.api().users.labels.delete({
        userId: 'me',
        id: labelId,
        auth: this.auth,
      });
    } catch (err) {
      throw this.wrapError('Failed to delete label', err);
    }
  }

  async watch(callback: (email: Email) => void): Promise<WatchHandle> {
    this.ensureConnected();
    try {
      await this.api().users.watch({
        userId: 'me',
        requestBody: {
          topicName: 'projects/emai/topics/gmail-push',
          labelIds: ['INBOX'],
        },
        auth: this.auth,
      });

      let polling = true;
      let lastHistoryId: string | undefined;

      const pollInterval = setInterval(async () => {
        if (!polling) return;
        try {
          const res = await this.api().users.messages.list({
            userId: 'me',
            labelIds: ['INBOX'],
            maxResults: 5,
            auth: this.auth,
          });
          const data = res.data as {
            messages?: Array<{ id: string }>;
          };
          if (data.messages) {
            for (const msg of data.messages) {
              if (lastHistoryId && msg.id > lastHistoryId) {
                const email = await this.fetchFullMessage(msg.id);
                callback(email);
              }
            }
            if (data.messages.length > 0) {
              lastHistoryId = data.messages[0].id;
            }
          }
        } catch {
          // polling errors are non-fatal
        }
      }, 30000);

      // initialize the history marker
      const initial = await this.api().users.messages.list({
        userId: 'me',
        labelIds: ['INBOX'],
        maxResults: 1,
        auth: this.auth,
      });
      const initData = initial.data as { messages?: Array<{ id: string }> };
      if (initData.messages?.[0]) {
        lastHistoryId = initData.messages[0].id;
      }

      return {
        stop: async () => {
          polling = false;
          clearInterval(pollInterval);
          try {
            await this.api().users.stop({ userId: 'me', auth: this.auth });
          } catch {
            // best-effort
          }
        },
      };
    } catch (err) {
      throw this.wrapError('Failed to start watch', err);
    }
  }

  async searchNative(query: string, options: ListEmailsOptions = {}): Promise<ListResult<Email>> {
    return this.listEmails({ ...options, query });
  }

  // ---- internal helpers ----

  private async fetchFullMessage(id: string): Promise<Email> {
    const res = await this.api().users.messages.get({
      userId: 'me',
      id,
      format: 'full',
      auth: this.auth,
    });
    const msg = res.data as GmailMessage;
    if (!msg.id) throw this.notFound('Email', id);
    return this.parseMessage(msg);
  }

  private parseMessage(msg: GmailMessage): Email {
    const headers = this.extractHeaders(msg.payload);
    const body = this.extractBody(msg.payload);
    const attachments = this.extractAttachments(msg.payload);
    const labels = msg.labelIds ?? [];

    const from = this.parseHeaderAddress(headers.from ?? '');
    const to = this.parseHeaderAddressList(headers.to ?? '');
    const cc = this.parseHeaderAddressList(headers.cc ?? '');
    const bcc = this.parseHeaderAddressList(headers.bcc ?? '');
    const replyTo = headers['reply-to']
      ? this.parseHeaderAddress(headers['reply-to'])
      : undefined;

    const date = msg.internalDate
      ? new Date(Number(msg.internalDate))
      : headers.date
        ? new Date(headers.date)
        : new Date();

    const folder = this.labelsToFolder(labels);

    const emailHeaders: EmailHeaders = {
      messageId: headers['message-id'] ?? '',
      inReplyTo: headers['in-reply-to'],
      references: headers.references?.split(/\s+/).filter(Boolean),
    };
    for (const [key, value] of Object.entries(headers)) {
      if (!['message-id', 'in-reply-to', 'references', 'from', 'to', 'cc', 'bcc', 'subject', 'date', 'reply-to'].includes(key)) {
        emailHeaders[key] = value;
      }
    }

    return {
      id: msg.id!,
      threadId: msg.threadId,
      provider: 'gmail',
      from,
      to,
      cc,
      bcc,
      replyTo,
      subject: headers.subject ?? '',
      body,
      attachments,
      labels,
      folder,
      date,
      receivedDate: date,
      isRead: !labels.includes('UNREAD'),
      isStarred: labels.includes('STARRED'),
      isDraft: labels.includes('DRAFT'),
      headers: emailHeaders,
      snippet: msg.snippet,
    };
  }

  private extractHeaders(payload?: GmailPayload): Record<string, string> {
    const result: Record<string, string> = {};
    if (!payload?.headers) return result;
    for (const header of payload.headers) {
      result[header.name.toLowerCase()] = header.value;
    }
    return result;
  }

  private extractBody(payload?: GmailPayload): EmailBody {
    const body: EmailBody = {};
    if (!payload) return body;
    this.walkParts(payload, (part) => {
      if (part.filename && part.filename.length > 0) return;
      const data = part.body?.data;
      if (!data) return;
      const decoded = Buffer.from(data, 'base64url').toString('utf-8');
      if (part.mimeType === 'text/plain' && !body.text) {
        body.text = decoded;
      } else if (part.mimeType === 'text/html' && !body.html) {
        body.html = decoded;
      }
    });
    return body;
  }

  private extractAttachments(payload?: GmailPayload): Attachment[] {
    const attachments: Attachment[] = [];
    if (!payload) return attachments;
    this.walkParts(payload, (part) => {
      if (!part.filename || part.filename.length === 0) return;
      const attId = part.body?.attachmentId ?? `inline-${attachments.length}`;
      const isInline = !!part.body?.data && !part.body?.attachmentId;
      attachments.push({
        id: attId,
        filename: part.filename,
        contentType: part.mimeType ?? 'application/octet-stream',
        size: part.body?.size ?? 0,
        content: part.body?.data ? Buffer.from(part.body.data, 'base64url') : undefined,
        contentId: undefined,
        isInline,
      });
    });
    return attachments;
  }

  private walkParts(payload: GmailPayload, visitor: (part: GmailPayload) => void): void {
    visitor(payload);
    if (payload.parts) {
      for (const part of payload.parts) {
        this.walkParts(part, visitor);
      }
    }
  }

  private findAttachmentPart(payload?: GmailPayload, attachmentId?: string): GmailPayload | null {
    if (!payload || !attachmentId) return null;
    if (payload.body?.attachmentId === attachmentId) return payload;
    if (payload.parts) {
      for (const part of payload.parts) {
        const found = this.findAttachmentPart(part, attachmentId);
        if (found) return found;
      }
    }
    return null;
  }

  private parseHeaderAddress(value: string): EmailAddress {
    const match = value.match(/^(?:"?(.+?)"?\s)?<?([^\s<>]+@[^\s<>]+)>?$/);
    if (!match) return { address: value };
    return { name: match[1] || undefined, address: match[2] };
  }

  private parseHeaderAddressList(value: string): EmailAddress[] {
    if (!value) return [];
    return value.split(',').map((s) => this.parseHeaderAddress(s.trim()));
  }

  private labelsToFolder(labels: string[]): string {
    for (const [id, info] of Object.entries(GMAIL_SYSTEM_LABELS)) {
      if (labels.includes(id) && info.type !== 'custom') {
        return info.name.toLowerCase();
      }
    }
    return labels.includes('INBOX') ? 'inbox' : 'archive';
  }

  private folderToLabelId(folder: string): string {
    const upper = folder.toUpperCase();
    if (GMAIL_SYSTEM_LABELS[upper]) return upper;
    const byName = Object.entries(GMAIL_SYSTEM_LABELS).find(
      ([, info]) => info.name.toLowerCase() === folder.toLowerCase(),
    );
    if (byName) return byName[0];
    return folder;
  }

  private buildSearchQuery(options: ListEmailsOptions): string {
    const parts: string[] = [];
    if (options.query) parts.push(options.query);
    if (options.from) parts.push(`from:${options.from}`);
    if (options.to) parts.push(`to:${options.to}`);
    if (options.subject) parts.push(`subject:${options.subject}`);
    if (options.after) parts.push(`after:${this.formatDate(options.after)}`);
    if (options.before) parts.push(`before:${this.formatDate(options.before)}`);
    if (options.hasAttachment) parts.push('has:attachment');
    if (options.isRead === true) parts.push('is:read');
    if (options.isRead === false) parts.push('is:unread');
    if (options.isStarred === true) parts.push('is:starred');
    if (options.isStarred === false) parts.push('-is:starred');
    return parts.join(' ');
  }

  private formatDate(date: Date): string {
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  }

  private buildRawMessage(options: SendEmailOptions): string {
    const to = normalizeAddresses(options.to);
    const cc = normalizeAddresses(options.cc);
    const bcc = normalizeAddresses(options.bcc);
    const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const hasAttachments = options.attachments && options.attachments.length > 0;

    const headerLines = [
      `To: ${to.map(formatEmailAddress).join(', ')}`,
      ...(cc.length ? [`Cc: ${cc.map(formatEmailAddress).join(', ')}`] : []),
      ...(bcc.length ? [`Bcc: ${bcc.map(formatEmailAddress).join(', ')}`] : []),
      `Subject: =?UTF-8?B?${Buffer.from(options.subject ?? '').toString('base64')}?=`,
      'MIME-Version: 1.0',
    ];

    if (options.replyTo) {
      const rt = normalizeAddresses(options.replyTo);
      if (rt.length > 0) headerLines.push(`Reply-To: ${formatEmailAddress(rt[0])}`);
    }

    if (options.headers) {
      for (const [key, value] of Object.entries(options.headers)) {
        headerLines.push(`${key}: ${value}`);
      }
    }

    let body: string;

    if (hasAttachments) {
      headerLines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
      const parts: string[] = [];

      if (options.text && options.html) {
        const altBoundary = `alt_${boundary}`;
        parts.push(`--${boundary}`);
        parts.push(`Content-Type: multipart/alternative; boundary="${altBoundary}"`);
        parts.push('');
        parts.push(`--${altBoundary}`);
        parts.push('Content-Type: text/plain; charset="UTF-8"');
        parts.push('Content-Transfer-Encoding: base64');
        parts.push('');
        parts.push(Buffer.from(options.text).toString('base64'));
        parts.push(`--${altBoundary}`);
        parts.push('Content-Type: text/html; charset="UTF-8"');
        parts.push('Content-Transfer-Encoding: base64');
        parts.push('');
        parts.push(Buffer.from(options.html).toString('base64'));
        parts.push(`--${altBoundary}--`);
      } else if (options.html) {
        parts.push(`--${boundary}`);
        parts.push('Content-Type: text/html; charset="UTF-8"');
        parts.push('Content-Transfer-Encoding: base64');
        parts.push('');
        parts.push(Buffer.from(options.html).toString('base64'));
      } else if (options.text) {
        parts.push(`--${boundary}`);
        parts.push('Content-Type: text/plain; charset="UTF-8"');
        parts.push('Content-Transfer-Encoding: base64');
        parts.push('');
        parts.push(Buffer.from(options.text).toString('base64'));
      }

      for (const att of options.attachments!) {
        parts.push(`--${boundary}`);
        parts.push(`Content-Type: ${att.contentType ?? 'application/octet-stream'}; name="${att.filename}"`);
        parts.push(`Content-Disposition: attachment; filename="${att.filename}"`);
        parts.push('Content-Transfer-Encoding: base64');
        parts.push('');
        const content = typeof att.content === 'string'
          ? att.content
          : Buffer.from(att.content).toString('base64');
        parts.push(content);
      }
      parts.push(`--${boundary}--`);
      body = parts.join('\r\n');
    } else if (options.text && options.html) {
      headerLines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
      body = [
        `--${boundary}`,
        'Content-Type: text/plain; charset="UTF-8"',
        'Content-Transfer-Encoding: base64',
        '',
        Buffer.from(options.text).toString('base64'),
        `--${boundary}`,
        'Content-Type: text/html; charset="UTF-8"',
        'Content-Transfer-Encoding: base64',
        '',
        Buffer.from(options.html).toString('base64'),
        `--${boundary}--`,
      ].join('\r\n');
    } else if (options.html) {
      headerLines.push('Content-Type: text/html; charset="UTF-8"');
      headerLines.push('Content-Transfer-Encoding: base64');
      body = Buffer.from(options.html).toString('base64');
    } else {
      headerLines.push('Content-Type: text/plain; charset="UTF-8"');
      headerLines.push('Content-Transfer-Encoding: base64');
      body = Buffer.from(options.text ?? '').toString('base64');
    }

    const raw = headerLines.join('\r\n') + '\r\n\r\n' + body;
    return Buffer.from(raw).toString('base64url');
  }

  private collectParticipants(emails: Email[]): EmailAddress[] {
    const seen = new Set<string>();
    const result: EmailAddress[] = [];
    for (const email of emails) {
      for (const addr of [email.from, ...email.to, ...email.cc]) {
        if (!seen.has(addr.address)) {
          seen.add(addr.address);
          result.push(addr);
        }
      }
    }
    return result;
  }
}
