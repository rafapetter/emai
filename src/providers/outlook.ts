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
  OutlookProviderConfig,
  EmailAddress,
  Attachment,
  EmailBody,
  EmailHeaders,
} from '../core/types.js';
import { tryImport, normalizeAddresses, formatEmailAddress } from '../core/utils.js';
import { ProviderError, AuthenticationError, NotFoundError } from '../core/errors.js';
import { BaseProvider } from './base.js';

interface GraphClient {
  api(path: string): GraphRequest;
}

interface GraphRequest {
  select(fields: string): GraphRequest;
  top(count: number): GraphRequest;
  skip(count: number): GraphRequest;
  filter(expression: string): GraphRequest;
  orderby(expression: string): GraphRequest;
  header(name: string, value: string): GraphRequest;
  get(): Promise<unknown>;
  post(body: unknown): Promise<unknown>;
  patch(body: unknown): Promise<unknown>;
  delete(): Promise<unknown>;
  query(params: Record<string, string>): GraphRequest;
}

interface GraphClientInit {
  Client: {
    init(options: {
      authProvider: (done: (err: unknown, token: string | null) => void) => void;
    }): GraphClient;
  };
}

interface OutlookMessage {
  id?: string;
  conversationId?: string;
  internetMessageId?: string;
  subject?: string;
  bodyPreview?: string;
  body?: { contentType: string; content: string };
  from?: { emailAddress: { name?: string; address: string } };
  toRecipients?: Array<{ emailAddress: { name?: string; address: string } }>;
  ccRecipients?: Array<{ emailAddress: { name?: string; address: string } }>;
  bccRecipients?: Array<{ emailAddress: { name?: string; address: string } }>;
  replyTo?: Array<{ emailAddress: { name?: string; address: string } }>;
  sentDateTime?: string;
  receivedDateTime?: string;
  isRead?: boolean;
  importance?: string;
  flag?: { flagStatus: string };
  isDraft?: boolean;
  parentFolderId?: string;
  hasAttachments?: boolean;
  internetMessageHeaders?: Array<{ name: string; value: string }>;
  categories?: string[];
  attachments?: OutlookAttachment[];
}

interface OutlookAttachment {
  id?: string;
  name?: string;
  contentType?: string;
  size?: number;
  contentBytes?: string;
  contentId?: string;
  isInline?: boolean;
  '@odata.type'?: string;
}

interface OutlookFolder {
  id: string;
  displayName: string;
  parentFolderId?: string;
  childFolderCount?: number;
  unreadItemCount?: number;
  totalItemCount?: number;
}

const WELL_KNOWN_FOLDERS: Record<string, Folder['type']> = {
  inbox: 'inbox',
  sentitems: 'sent',
  drafts: 'drafts',
  deleteditems: 'trash',
  junkemail: 'spam',
  archive: 'archive',
};

export class OutlookProvider extends BaseProvider {
  readonly type = 'outlook' as const;

  private client: GraphClient | null = null;
  private config: OutlookProviderConfig;

  constructor(config: OutlookProviderConfig) {
    super();
    this.config = config;
  }

  async connect(): Promise<void> {
    try {
      const graphModule = await tryImport<GraphClientInit>(
        '@microsoft/microsoft-graph-client',
        'Outlook provider',
      );
      let accessToken = this.config.credentials.accessToken;

      if (!accessToken) {
        accessToken = await this.refreshAccessToken();
      }

      const token = accessToken;
      this.client = graphModule.Client.init({
        authProvider: (done) => done(null, token!),
      });

      await this.client.api('/me').select('displayName').get();
      this.connected = true;
    } catch (err) {
      throw err instanceof ProviderError
        ? err
        : new AuthenticationError('Failed to connect to Outlook', err);
    }
  }

  async disconnect(): Promise<void> {
    this.client = null;
    this.connected = false;
  }

  private api(): GraphClient {
    this.ensureConnected();
    return this.client!;
  }

  private async refreshAccessToken(): Promise<string> {
    const { clientId, clientSecret, refreshToken, tenantId } = this.config.credentials;
    const tenant = tenantId ?? 'common';
    const url = `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;

    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: 'https://graph.microsoft.com/.default',
    });

    const res = await fetch(url, { method: 'POST', body });
    if (!res.ok) {
      throw new AuthenticationError(`Token refresh failed: ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as { access_token: string };
    this.config.credentials.accessToken = data.access_token;
    return data.access_token;
  }

  async listEmails(options: ListEmailsOptions = {}): Promise<ListResult<Email>> {
    try {
      const folder = options.folder ?? 'inbox';
      const folderId = this.resolveFolderId(folder);
      let request = this.api()
        .api(`/me/mailFolders/${folderId}/messages`)
        .select(
          'id,conversationId,internetMessageId,subject,bodyPreview,body,from,toRecipients,ccRecipients,bccRecipients,replyTo,sentDateTime,receivedDateTime,isRead,importance,flag,isDraft,parentFolderId,hasAttachments,categories,internetMessageHeaders',
        )
        .top(options.limit ?? 20);

      if (options.offset) request = request.skip(options.offset);

      const filterParts = this.buildFilter(options);
      if (filterParts.length > 0) {
        request = request.filter(filterParts.join(' and '));
      }

      const orderBy = options.sortBy === 'subject'
        ? 'subject'
        : options.sortBy === 'from'
          ? 'from/emailAddress/address'
          : 'receivedDateTime';
      const order = options.sortOrder === 'asc' ? 'asc' : 'desc';
      request = request.orderby(`${orderBy} ${order}`);

      if (options.query) {
        request = request.query({ $search: `"${options.query}"` });
      }

      const res = (await request.get()) as {
        value: OutlookMessage[];
        '@odata.count'?: number;
        '@odata.nextLink'?: string;
      };

      const emails = await Promise.all(
        res.value.map((msg) => this.parseOutlookMessage(msg, folder)),
      );

      return {
        items: emails,
        total: res['@odata.count'],
        nextCursor: res['@odata.nextLink'],
        hasMore: !!res['@odata.nextLink'],
      };
    } catch (err) {
      throw this.wrapError('Failed to list emails', err);
    }
  }

  async getEmail(id: string): Promise<Email> {
    try {
      const msg = (await this.api()
        .api(`/me/messages/${id}`)
        .select(
          'id,conversationId,internetMessageId,subject,bodyPreview,body,from,toRecipients,ccRecipients,bccRecipients,replyTo,sentDateTime,receivedDateTime,isRead,importance,flag,isDraft,parentFolderId,hasAttachments,categories,internetMessageHeaders',
        )
        .header('Prefer', 'outlook.body-content-type="text"')
        .get()) as OutlookMessage;

      const htmlMsg = (await this.api()
        .api(`/me/messages/${id}`)
        .select('body')
        .get()) as OutlookMessage;

      const email = await this.parseOutlookMessage(msg);
      if (htmlMsg.body?.contentType === 'html') {
        email.body.html = htmlMsg.body.content;
      }

      if (msg.hasAttachments) {
        const attRes = (await this.api()
          .api(`/me/messages/${id}/attachments`)
          .get()) as { value: OutlookAttachment[] };
        email.attachments = attRes.value.map((att) => this.parseAttachment(att));
      }

      return email;
    } catch (err) {
      throw this.wrapError(`Failed to get email ${id}`, err);
    }
  }

  async getThread(threadId: string): Promise<Thread> {
    try {
      const res = (await this.api()
        .api('/me/messages')
        .filter(`conversationId eq '${threadId}'`)
        .select(
          'id,conversationId,internetMessageId,subject,bodyPreview,body,from,toRecipients,ccRecipients,bccRecipients,replyTo,sentDateTime,receivedDateTime,isRead,importance,flag,isDraft,parentFolderId,hasAttachments,categories',
        )
        .orderby('receivedDateTime asc')
        .top(100)
        .get()) as { value: OutlookMessage[] };

      if (res.value.length === 0) {
        throw this.notFound('Thread', threadId);
      }

      const emails = await Promise.all(
        res.value.map((msg) => this.parseOutlookMessage(msg)),
      );

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
    try {
      const att = (await this.api()
        .api(`/me/messages/${emailId}/attachments/${attachmentId}`)
        .get()) as OutlookAttachment;

      if (!att.contentBytes) {
        throw this.notFound('Attachment', attachmentId);
      }
      return Buffer.from(att.contentBytes, 'base64');
    } catch (err) {
      if (err instanceof NotFoundError) throw err;
      throw this.wrapError('Failed to get attachment content', err);
    }
  }

  async sendEmail(options: SendEmailOptions): Promise<SendResult> {
    this.validateSendOptions(options);
    try {
      const message = this.buildOutlookMessage(options);

      await this.api().api('/me/sendMail').post({
        message,
        saveToSentItems: true,
      });

      const sentRes = (await this.api()
        .api('/me/mailFolders/sentitems/messages')
        .top(1)
        .orderby('sentDateTime desc')
        .select('id,conversationId,internetMessageId')
        .get()) as { value: OutlookMessage[] };

      const sent = sentRes.value[0];
      return {
        id: sent?.id ?? '',
        threadId: sent?.conversationId,
        messageId: sent?.internetMessageId ?? '',
      };
    } catch (err) {
      throw this.wrapError('Failed to send email', err);
    }
  }

  async replyToEmail(emailId: string, options: ReplyOptions): Promise<SendResult> {
    try {
      const endpoint = options.replyAll
        ? `/me/messages/${emailId}/replyAll`
        : `/me/messages/${emailId}/reply`;

      const comment = options.html ?? options.text ?? '';

      const body: Record<string, unknown> = { comment };

      if (options.attachments && options.attachments.length > 0) {
        body.message = {
          attachments: options.attachments.map((att) => ({
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: att.filename,
            contentType: att.contentType ?? 'application/octet-stream',
            contentBytes:
              typeof att.content === 'string'
                ? att.content
                : Buffer.from(att.content).toString('base64'),
          })),
        };
      }

      await this.api().api(endpoint).post(body);

      const sentRes = (await this.api()
        .api('/me/mailFolders/sentitems/messages')
        .top(1)
        .orderby('sentDateTime desc')
        .select('id,conversationId,internetMessageId')
        .get()) as { value: OutlookMessage[] };

      const sent = sentRes.value[0];
      return {
        id: sent?.id ?? '',
        threadId: sent?.conversationId,
        messageId: sent?.internetMessageId ?? '',
      };
    } catch (err) {
      throw this.wrapError('Failed to reply to email', err);
    }
  }

  async forwardEmail(emailId: string, options: ForwardOptions): Promise<SendResult> {
    try {
      const to = normalizeAddresses(options.to);
      const comment = options.html ?? options.text ?? '';

      const body: Record<string, unknown> = {
        comment,
        toRecipients: to.map((addr) => ({
          emailAddress: { name: addr.name, address: addr.address },
        })),
      };

      if (options.attachments && options.attachments.length > 0) {
        body.message = {
          attachments: options.attachments.map((att) => ({
            '@odata.type': '#microsoft.graph.fileAttachment',
            name: att.filename,
            contentType: att.contentType ?? 'application/octet-stream',
            contentBytes:
              typeof att.content === 'string'
                ? att.content
                : Buffer.from(att.content).toString('base64'),
          })),
        };
      }

      await this.api().api(`/me/messages/${emailId}/forward`).post(body);

      const sentRes = (await this.api()
        .api('/me/mailFolders/sentitems/messages')
        .top(1)
        .orderby('sentDateTime desc')
        .select('id,conversationId,internetMessageId')
        .get()) as { value: OutlookMessage[] };

      const sent = sentRes.value[0];
      return {
        id: sent?.id ?? '',
        threadId: sent?.conversationId,
        messageId: sent?.internetMessageId ?? '',
      };
    } catch (err) {
      throw this.wrapError('Failed to forward email', err);
    }
  }

  async createDraft(options: SendEmailOptions): Promise<Email> {
    this.validateSendOptions(options);
    try {
      const message = this.buildOutlookMessage(options);
      const res = (await this.api()
        .api('/me/messages')
        .post(message)) as OutlookMessage;
      return this.parseOutlookMessage(res, 'drafts');
    } catch (err) {
      throw this.wrapError('Failed to create draft', err);
    }
  }

  async updateDraft(draftId: string, options: SendEmailOptions): Promise<Email> {
    this.validateSendOptions(options);
    try {
      const message = this.buildOutlookMessage(options);
      const res = (await this.api()
        .api(`/me/messages/${draftId}`)
        .patch(message)) as OutlookMessage;
      return this.parseOutlookMessage(res, 'drafts');
    } catch (err) {
      throw this.wrapError('Failed to update draft', err);
    }
  }

  async deleteDraft(draftId: string): Promise<void> {
    try {
      await this.api().api(`/me/messages/${draftId}`).delete();
    } catch (err) {
      throw this.wrapError('Failed to delete draft', err);
    }
  }

  async markAsRead(emailId: string): Promise<void> {
    try {
      await this.api().api(`/me/messages/${emailId}`).patch({ isRead: true });
    } catch (err) {
      throw this.wrapError('Failed to mark as read', err);
    }
  }

  async markAsUnread(emailId: string): Promise<void> {
    try {
      await this.api().api(`/me/messages/${emailId}`).patch({ isRead: false });
    } catch (err) {
      throw this.wrapError('Failed to mark as unread', err);
    }
  }

  async star(emailId: string): Promise<void> {
    try {
      await this.api()
        .api(`/me/messages/${emailId}`)
        .patch({ flag: { flagStatus: 'flagged' } });
    } catch (err) {
      throw this.wrapError('Failed to star email', err);
    }
  }

  async unstar(emailId: string): Promise<void> {
    try {
      await this.api()
        .api(`/me/messages/${emailId}`)
        .patch({ flag: { flagStatus: 'notFlagged' } });
    } catch (err) {
      throw this.wrapError('Failed to unstar email', err);
    }
  }

  async moveToFolder(emailId: string, folder: string): Promise<void> {
    try {
      const destinationId = this.resolveFolderId(folder);
      await this.api()
        .api(`/me/messages/${emailId}/move`)
        .post({ destinationId });
    } catch (err) {
      throw this.wrapError('Failed to move to folder', err);
    }
  }

  async deleteEmail(emailId: string): Promise<void> {
    try {
      await this.api()
        .api(`/me/messages/${emailId}/move`)
        .post({ destinationId: 'deleteditems' });
    } catch (err) {
      throw this.wrapError('Failed to delete email', err);
    }
  }

  async archiveEmail(emailId: string): Promise<void> {
    try {
      await this.api()
        .api(`/me/messages/${emailId}/move`)
        .post({ destinationId: 'archive' });
    } catch (err) {
      throw this.wrapError('Failed to archive email', err);
    }
  }

  async listFolders(): Promise<Folder[]> {
    try {
      const res = (await this.api()
        .api('/me/mailFolders')
        .select('id,displayName,parentFolderId,childFolderCount,unreadItemCount,totalItemCount')
        .top(100)
        .get()) as { value: OutlookFolder[] };

      return res.value.map((f) => this.parseFolder(f));
    } catch (err) {
      throw this.wrapError('Failed to list folders', err);
    }
  }

  async createFolder(name: string, parentId?: string): Promise<Folder> {
    try {
      const path = parentId
        ? `/me/mailFolders/${parentId}/childFolders`
        : '/me/mailFolders';

      const res = (await this.api()
        .api(path)
        .post({ displayName: name })) as OutlookFolder;

      return this.parseFolder(res);
    } catch (err) {
      throw this.wrapError('Failed to create folder', err);
    }
  }

  async deleteFolder(folderId: string): Promise<void> {
    try {
      await this.api().api(`/me/mailFolders/${folderId}`).delete();
    } catch (err) {
      throw this.wrapError('Failed to delete folder', err);
    }
  }

  async listLabels(): Promise<Label[]> {
    try {
      const res = (await this.api()
        .api('/me/outlook/masterCategories')
        .get()) as { value: Array<{ id: string; displayName: string; color: string }> };

      return res.value.map((cat) => ({
        id: cat.id,
        name: cat.displayName,
        color: cat.color,
        type: 'user' as const,
      }));
    } catch (err) {
      throw this.wrapError('Failed to list labels', err);
    }
  }

  async addLabel(emailId: string, label: string): Promise<void> {
    try {
      const email = await this.getEmail(emailId);
      const categories = [...email.labels, label];
      await this.api()
        .api(`/me/messages/${emailId}`)
        .patch({ categories });
    } catch (err) {
      throw this.wrapError('Failed to add label', err);
    }
  }

  async removeLabel(emailId: string, label: string): Promise<void> {
    try {
      const email = await this.getEmail(emailId);
      const categories = email.labels.filter((l) => l !== label);
      await this.api()
        .api(`/me/messages/${emailId}`)
        .patch({ categories });
    } catch (err) {
      throw this.wrapError('Failed to remove label', err);
    }
  }

  async createLabel(name: string, color?: string): Promise<Label> {
    try {
      const body: Record<string, unknown> = { displayName: name };
      if (color) body.color = color;

      const res = (await this.api()
        .api('/me/outlook/masterCategories')
        .post(body)) as { id: string; displayName: string; color: string };

      return {
        id: res.id,
        name: res.displayName,
        color: res.color,
        type: 'user',
      };
    } catch (err) {
      throw this.wrapError('Failed to create label', err);
    }
  }

  async deleteLabel(labelId: string): Promise<void> {
    try {
      await this.api().api(`/me/outlook/masterCategories/${labelId}`).delete();
    } catch (err) {
      throw this.wrapError('Failed to delete label', err);
    }
  }

  async watch(callback: (email: Email) => void): Promise<WatchHandle> {
    this.ensureConnected();
    try {
      const subscription = (await this.api()
        .api('/subscriptions')
        .post({
          changeType: 'created',
          notificationUrl: 'https://emai.webhook.example/outlook',
          resource: "/me/mailFolders('Inbox')/messages",
          expirationDateTime: new Date(
            Date.now() + 3 * 24 * 60 * 60 * 1000,
          ).toISOString(),
          clientState: `emai-${Date.now()}`,
        })) as { id: string };

      let polling = true;
      let lastCheck = new Date();

      const pollInterval = setInterval(async () => {
        if (!polling) return;
        try {
          const since = lastCheck.toISOString();
          lastCheck = new Date();
          const res = (await this.api()
            .api("/me/mailFolders/inbox/messages")
            .filter(`receivedDateTime ge ${since}`)
            .orderby('receivedDateTime desc')
            .top(10)
            .select(
              'id,conversationId,internetMessageId,subject,bodyPreview,body,from,toRecipients,ccRecipients,bccRecipients,sentDateTime,receivedDateTime,isRead,importance,flag,isDraft,categories',
            )
            .get()) as { value: OutlookMessage[] };

          for (const msg of res.value) {
            const email = await this.parseOutlookMessage(msg, 'inbox');
            callback(email);
          }
        } catch {
          // polling errors are non-fatal
        }
      }, 30000);

      return {
        stop: async () => {
          polling = false;
          clearInterval(pollInterval);
          try {
            await this.api().api(`/subscriptions/${subscription.id}`).delete();
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

  private async parseOutlookMessage(
    msg: OutlookMessage,
    folderHint?: string,
  ): Promise<Email> {
    const from: EmailAddress = msg.from?.emailAddress
      ? { name: msg.from.emailAddress.name, address: msg.from.emailAddress.address }
      : { address: '' };

    const to = (msg.toRecipients ?? []).map((r) => ({
      name: r.emailAddress.name,
      address: r.emailAddress.address,
    }));

    const cc = (msg.ccRecipients ?? []).map((r) => ({
      name: r.emailAddress.name,
      address: r.emailAddress.address,
    }));

    const bcc = (msg.bccRecipients ?? []).map((r) => ({
      name: r.emailAddress.name,
      address: r.emailAddress.address,
    }));

    const replyTo = msg.replyTo?.[0]?.emailAddress
      ? { name: msg.replyTo[0].emailAddress.name, address: msg.replyTo[0].emailAddress.address }
      : undefined;

    const date = msg.sentDateTime ? new Date(msg.sentDateTime) : new Date();
    const receivedDate = msg.receivedDateTime
      ? new Date(msg.receivedDateTime)
      : date;

    const headers: EmailHeaders = {
      messageId: msg.internetMessageId ?? '',
    };

    if (msg.internetMessageHeaders) {
      for (const h of msg.internetMessageHeaders) {
        const lower = h.name.toLowerCase();
        if (lower === 'in-reply-to') {
          headers.inReplyTo = h.value;
        } else if (lower === 'references') {
          headers.references = h.value.split(/\s+/).filter(Boolean);
        } else {
          headers[lower] = h.value;
        }
      }
    }

    const body: EmailBody = {};
    if (msg.body) {
      if (msg.body.contentType === 'html') {
        body.html = msg.body.content;
      } else {
        body.text = msg.body.content;
      }
    }

    const folder = folderHint ?? this.parentFolderToName(msg.parentFolderId);

    return {
      id: msg.id ?? '',
      threadId: msg.conversationId,
      provider: 'outlook',
      from,
      to,
      cc,
      bcc,
      replyTo,
      subject: msg.subject ?? '',
      body,
      attachments: (msg.attachments ?? []).map((a) => this.parseAttachment(a)),
      labels: msg.categories ?? [],
      folder,
      date,
      receivedDate,
      isRead: msg.isRead ?? false,
      isStarred: msg.flag?.flagStatus === 'flagged',
      isDraft: msg.isDraft ?? false,
      headers,
      snippet: msg.bodyPreview,
    };
  }

  private parseAttachment(att: OutlookAttachment): Attachment {
    return {
      id: att.id ?? '',
      filename: att.name ?? '',
      contentType: att.contentType ?? 'application/octet-stream',
      size: att.size ?? 0,
      content: att.contentBytes
        ? Buffer.from(att.contentBytes, 'base64')
        : undefined,
      contentId: att.contentId,
      isInline: att.isInline ?? false,
    };
  }

  private parseFolder(f: OutlookFolder): Folder {
    const nameLower = f.displayName.toLowerCase();
    const folderType: Folder['type'] =
      WELL_KNOWN_FOLDERS[nameLower] ?? 'custom';

    return {
      id: f.id,
      name: f.displayName,
      path: f.displayName,
      type: folderType,
      unreadCount: f.unreadItemCount ?? 0,
      totalCount: f.totalItemCount ?? 0,
    };
  }

  private parentFolderToName(folderId?: string): string {
    if (!folderId) return 'inbox';
    const lower = folderId.toLowerCase();
    return WELL_KNOWN_FOLDERS[lower] ?? 'custom';
  }

  private resolveFolderId(folder: string): string {
    const lower = folder.toLowerCase();
    for (const [key] of Object.entries(WELL_KNOWN_FOLDERS)) {
      if (key === lower) return key;
    }
    if (lower === 'inbox') return 'inbox';
    if (lower === 'sent') return 'sentitems';
    if (lower === 'trash') return 'deleteditems';
    if (lower === 'spam') return 'junkemail';
    return folder;
  }

  private buildFilter(options: ListEmailsOptions): string[] {
    const filters: string[] = [];
    if (options.from) filters.push(`from/emailAddress/address eq '${options.from}'`);
    if (options.to) filters.push(`toRecipients/any(r: r/emailAddress/address eq '${options.to}')`);
    if (options.subject) filters.push(`contains(subject, '${options.subject}')`);
    if (options.after) filters.push(`receivedDateTime ge ${options.after.toISOString()}`);
    if (options.before) filters.push(`receivedDateTime le ${options.before.toISOString()}`);
    if (options.hasAttachment !== undefined) filters.push(`hasAttachments eq ${options.hasAttachment}`);
    if (options.isRead !== undefined) filters.push(`isRead eq ${options.isRead}`);
    if (options.isStarred === true) filters.push("flag/flagStatus eq 'flagged'");
    if (options.isStarred === false) filters.push("flag/flagStatus eq 'notFlagged'");
    return filters;
  }

  private buildOutlookMessage(options: SendEmailOptions): Record<string, unknown> {
    const to = normalizeAddresses(options.to);
    const cc = normalizeAddresses(options.cc);
    const bcc = normalizeAddresses(options.bcc);

    const message: Record<string, unknown> = {
      subject: options.subject,
      body: {
        contentType: options.html ? 'html' : 'text',
        content: options.html ?? options.text ?? '',
      },
      toRecipients: to.map((addr) => ({
        emailAddress: { name: addr.name, address: addr.address },
      })),
    };

    if (cc.length > 0) {
      message.ccRecipients = cc.map((addr) => ({
        emailAddress: { name: addr.name, address: addr.address },
      }));
    }

    if (bcc.length > 0) {
      message.bccRecipients = bcc.map((addr) => ({
        emailAddress: { name: addr.name, address: addr.address },
      }));
    }

    if (options.replyTo) {
      const rt = normalizeAddresses(options.replyTo);
      if (rt.length > 0) {
        message.replyTo = rt.map((addr) => ({
          emailAddress: { name: addr.name, address: addr.address },
        }));
      }
    }

    if (options.headers) {
      message.internetMessageHeaders = Object.entries(options.headers).map(
        ([name, value]) => ({ name, value }),
      );
    }

    if (options.attachments && options.attachments.length > 0) {
      message.attachments = options.attachments.map((att) => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: att.filename,
        contentType: att.contentType ?? 'application/octet-stream',
        contentBytes:
          typeof att.content === 'string'
            ? att.content
            : Buffer.from(att.content).toString('base64'),
      }));
    }

    return message;
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
