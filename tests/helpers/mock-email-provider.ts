import { vi } from 'vitest';
import type { EmailProvider } from '../../src/core/types.js';
import { makeEmail } from './fixtures.js';

export function createMockEmailProvider(overrides: Partial<EmailProvider> = {}): EmailProvider {
  return {
    type: 'gmail',
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
    isConnected: vi.fn(() => true),
    listEmails: vi.fn(async () => ({ items: [], hasMore: false, total: 0 })),
    getEmail: vi.fn(async (id: string) => makeEmail({ id })),
    getThread: vi.fn(async () => {
      throw new Error('Not found');
    }),
    getAttachmentContent: vi.fn(async () => Buffer.from('')),
    sendEmail: vi.fn(async () => ({ id: 'sent-1', threadId: 't-1', messageId: '<sent@test>' })),
    replyToEmail: vi.fn(async () => ({
      id: 'reply-1',
      threadId: 't-1',
      messageId: '<reply@test>',
    })),
    forwardEmail: vi.fn(async () => ({ id: 'fwd-1', threadId: 't-1', messageId: '<fwd@test>' })),
    createDraft: vi.fn(async () => makeEmail({ id: 'draft-1', isDraft: true })),
    updateDraft: vi.fn(async () => makeEmail({ id: 'draft-1', isDraft: true })),
    deleteDraft: vi.fn(async () => {}),
    markAsRead: vi.fn(async () => {}),
    markAsUnread: vi.fn(async () => {}),
    star: vi.fn(async () => {}),
    unstar: vi.fn(async () => {}),
    moveToFolder: vi.fn(async () => {}),
    deleteEmail: vi.fn(async () => {}),
    archiveEmail: vi.fn(async () => {}),
    listFolders: vi.fn(async () => []),
    createFolder: vi.fn(async (name: string) => ({
      id: 'f-1',
      name,
      path: name,
      type: 'custom' as const,
      unreadCount: 0,
      totalCount: 0,
    })),
    deleteFolder: vi.fn(async () => {}),
    listLabels: vi.fn(async () => []),
    addLabel: vi.fn(async () => {}),
    removeLabel: vi.fn(async () => {}),
    createLabel: vi.fn(async (name: string) => ({
      id: 'l-1',
      name,
      type: 'user' as const,
    })),
    deleteLabel: vi.fn(async () => {}),
    ...overrides,
  };
}
