import type {
  EmailProvider,
  ProviderType,
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
  EmailAddress,
  SendAttachment,
} from '../core/types.js';
import { normalizeAddresses } from '../core/utils.js';
import {
  ProviderError,
  ConnectionError,
  ValidationError,
  NotFoundError,
} from '../core/errors.js';

export abstract class BaseProvider implements EmailProvider {
  abstract readonly type: ProviderType;

  protected connected = false;

  isConnected(): boolean {
    return this.connected;
  }

  protected ensureConnected(): void {
    if (!this.connected) {
      throw new ConnectionError(`${this.type} provider is not connected. Call connect() first.`);
    }
  }

  protected validateSendOptions(options: SendEmailOptions): void {
    const to = normalizeAddresses(options.to);
    if (to.length === 0) {
      throw new ValidationError('At least one recipient is required');
    }
    if (!options.subject && !options.text && !options.html) {
      throw new ValidationError('Email must have a subject, text body, or HTML body');
    }
  }

  protected normalizeRecipients(
    input: string | string[] | EmailAddress | EmailAddress[] | undefined,
  ): EmailAddress[] {
    return normalizeAddresses(input);
  }

  protected wrapError(message: string, cause: unknown): ProviderError {
    if (cause instanceof ProviderError) return cause;
    return new ProviderError(`[${this.type}] ${message}`, cause);
  }

  protected notFound(resource: string, id: string): NotFoundError {
    return new NotFoundError(resource, id);
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;

  abstract listEmails(options?: ListEmailsOptions): Promise<ListResult<Email>>;
  abstract getEmail(id: string): Promise<Email>;
  abstract getThread(threadId: string): Promise<Thread>;
  abstract getAttachmentContent(emailId: string, attachmentId: string): Promise<Buffer>;

  abstract sendEmail(options: SendEmailOptions): Promise<SendResult>;
  abstract replyToEmail(emailId: string, options: ReplyOptions): Promise<SendResult>;
  abstract forwardEmail(emailId: string, options: ForwardOptions): Promise<SendResult>;
  abstract createDraft(options: SendEmailOptions): Promise<Email>;
  abstract updateDraft(draftId: string, options: SendEmailOptions): Promise<Email>;
  abstract deleteDraft(draftId: string): Promise<void>;

  abstract markAsRead(emailId: string): Promise<void>;
  abstract markAsUnread(emailId: string): Promise<void>;
  abstract star(emailId: string): Promise<void>;
  abstract unstar(emailId: string): Promise<void>;
  abstract moveToFolder(emailId: string, folder: string): Promise<void>;
  abstract deleteEmail(emailId: string): Promise<void>;
  abstract archiveEmail(emailId: string): Promise<void>;

  abstract listFolders(): Promise<Folder[]>;
  abstract createFolder(name: string, parentId?: string): Promise<Folder>;
  abstract deleteFolder(folderId: string): Promise<void>;

  abstract listLabels(): Promise<Label[]>;
  abstract addLabel(emailId: string, label: string): Promise<void>;
  abstract removeLabel(emailId: string, label: string): Promise<void>;
  abstract createLabel(name: string, color?: string): Promise<Label>;
  abstract deleteLabel(labelId: string): Promise<void>;
}
