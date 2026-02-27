import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Emai, createEmai } from '../../../src/index.js';
import { createMockEmailProvider } from '../../helpers/mock-email-provider.js';
import { createMockLLMAdapter } from '../../helpers/mock-llm-adapter.js';
import { createMockVectorStore } from '../../helpers/mock-vector-store.js';
import { createMockStorageAdapter } from '../../helpers/mock-storage-adapter.js';
import { makeEmail, makeThread, CLASSIFICATION_RESPONSE } from '../../helpers/fixtures.js';
import { ConnectionError, AdapterNotConfiguredError, EmaiError } from '../../../src/core/errors.js';
import type { EmailProvider, LLMAdapter, VectorStore, StorageAdapter } from '../../../src/core/types.js';

// Mock factory functions so Emai constructor doesn't instantiate real providers
const mockProvider = createMockEmailProvider();
const mockStorage = createMockStorageAdapter();

vi.mock('../../../src/providers/index.js', () => ({
  createProvider: () => mockProvider,
}));

vi.mock('../../../src/storage/index.js', () => ({
  createStorage: () => mockStorage,
  BaseStorageAdapter: class {},
  MemoryStorage: class {},
  SqliteStorage: class {},
}));

vi.mock('../../../src/search/stores/index.js', () => ({
  createVectorStore: () => createMockVectorStore(),
  MemoryVectorStore: class {},
  SqliteVectorStore: class {},
  PgVectorStore: class {},
  PineconeVectorStore: class {},
  WeaviateVectorStore: class {},
  ChromaDBVectorStore: class {},
}));

// Mock attachment sub-parsers
vi.mock('../../../src/attachments/pdf.js', () => ({ PdfParser: class { async parse() { return { text: 'pdf' }; } } }));
vi.mock('../../../src/attachments/image.js', () => ({ ImageParser: class { async parse() { return { text: 'img' }; } async describe() { return 'desc'; } async ocr() { return 'ocr'; } } }));
vi.mock('../../../src/attachments/office.js', () => ({ OfficeParser: class { async parse() { return { text: 'office' }; } } }));
vi.mock('../../../src/attachments/csv.js', () => ({ CsvParser: class { async parse() { return { text: 'csv' }; } } }));
vi.mock('../../../src/attachments/video.js', () => ({ VideoParser: class { async parse() { return { text: 'video' }; } async parseDeep() { return { text: 'deep' }; } } }));

// Mock MCP server to avoid loading it
vi.mock('../../../src/mcp/server.js', () => ({
  startEmaiMcpServer: vi.fn(),
  createEmaiMcpServer: vi.fn(),
}));

describe('Emai', () => {
  let emai: Emai;
  let provider: ReturnType<typeof createMockEmailProvider>;
  let storage: ReturnType<typeof createMockStorageAdapter>;

  beforeEach(() => {
    // Reset mock functions
    Object.values(mockProvider).forEach((fn) => {
      if (typeof fn === 'function' && 'mockReset' in fn) {
        (fn as any).mockReset();
      }
    });
    Object.values(mockStorage).forEach((fn) => {
      if (typeof fn === 'function' && 'mockReset' in fn) {
        (fn as any).mockReset();
      }
    });

    provider = mockProvider as any;
    storage = mockStorage as any;

    emai = new Emai({
      provider: { type: 'gmail', auth: { clientId: 'x', clientSecret: 'y', refreshToken: 'z' } },
    });
  });

  describe('connection lifecycle', () => {
    it('starts disconnected', () => {
      expect(emai.isConnected()).toBe(false);
    });

    it('connects successfully', async () => {
      await emai.connect();
      expect(emai.isConnected()).toBe(true);
      expect(provider.connect).toHaveBeenCalled();
      expect(storage.initialize).toHaveBeenCalled();
    });

    it('disconnects successfully', async () => {
      await emai.connect();
      await emai.disconnect();
      expect(emai.isConnected()).toBe(false);
      expect(provider.disconnect).toHaveBeenCalled();
      expect(storage.close).toHaveBeenCalled();
    });
  });

  describe('ensureConnected guard', () => {
    it('throws ConnectionError when not connected', async () => {
      await expect(emai.emails.list()).rejects.toThrow(ConnectionError);
    });

    it('allows calls after connect', async () => {
      provider.listEmails.mockResolvedValue({ items: [], hasMore: false, total: 0 });
      await emai.connect();
      await expect(emai.emails.list()).resolves.toBeTruthy();
    });
  });

  describe('emails.*', () => {
    beforeEach(async () => {
      await emai.connect();
    });

    it('list delegates to provider', async () => {
      provider.listEmails.mockResolvedValue({ items: [], hasMore: false, total: 0 });
      const result = await emai.emails.list({ folder: 'inbox' });
      expect(provider.listEmails).toHaveBeenCalledWith({ folder: 'inbox' });
      expect(result.items).toEqual([]);
    });

    it('get delegates to provider', async () => {
      const email = makeEmail();
      provider.getEmail.mockResolvedValue(email);
      const result = await emai.emails.get('email-1');
      expect(provider.getEmail).toHaveBeenCalledWith('email-1');
      expect(result).toBe(email);
    });

    it('send runs safety check first', async () => {
      provider.sendEmail.mockResolvedValue({
        id: 'sent-1',
        threadId: 'thread-1',
      });

      const result = await emai.emails.send({
        to: 'bob@example.com',
        subject: 'Hi',
        text: 'Hello',
      });
      expect(provider.sendEmail).toHaveBeenCalled();
      expect(result.id).toBe('sent-1');
    });

    it('send blocks emails that fail safety scan', async () => {
      await expect(
        emai.emails.send({
          to: 'bob@example.com',
          subject: 'Hi',
          text: 'SSN: 123-45-6789',
        }),
      ).rejects.toThrow(EmaiError);
    });

    it('markAsRead delegates to provider', async () => {
      await emai.emails.markAsRead('email-1');
      expect(provider.markAsRead).toHaveBeenCalledWith('email-1');
    });

    it('moveToFolder delegates to provider', async () => {
      await emai.emails.moveToFolder('email-1', 'archive');
      expect(provider.moveToFolder).toHaveBeenCalledWith('email-1', 'archive');
    });

    it('delete delegates to provider', async () => {
      await emai.emails.delete('email-1');
      expect(provider.deleteEmail).toHaveBeenCalledWith('email-1');
    });

    it('archive delegates to provider', async () => {
      await emai.emails.archive('email-1');
      expect(provider.archiveEmail).toHaveBeenCalledWith('email-1');
    });
  });

  describe('threads.*', () => {
    beforeEach(async () => {
      await emai.connect();
    });

    it('get delegates to provider', async () => {
      const thread = makeThread();
      provider.getThread.mockResolvedValue(thread);
      const result = await emai.threads.get('thread-1');
      expect(provider.getThread).toHaveBeenCalledWith('thread-1');
      expect(result).toBe(thread);
    });

    it('detect uses ThreadDetector', () => {
      const emails = [
        makeEmail({ id: 'e1', headers: { messageId: '<m1@example.com>' } }),
        makeEmail({
          id: 'e2',
          headers: { messageId: '<m2@example.com>', inReplyTo: '<m1@example.com>' },
        }),
      ];
      const threads = emai.threads.detect(emails);
      expect(threads.length).toBeGreaterThan(0);
    });
  });

  describe('ai.*', () => {
    it('throws AdapterNotConfiguredError without AI config', async () => {
      await expect(emai.ai.classify(makeEmail())).rejects.toThrow(
        AdapterNotConfiguredError,
      );
    });

    it('classify works with AI adapter configured', async () => {
      const mockLLM = createMockLLMAdapter({
        completeJSONResponse: CLASSIFICATION_RESPONSE,
      });
      const emaiWithAi = new Emai({
        provider: { type: 'gmail', auth: { clientId: 'x', clientSecret: 'y', refreshToken: 'z' } },
        ai: { adapter: mockLLM },
      });
      const result = await emaiWithAi.ai.classify(makeEmail());
      expect(result).toEqual(CLASSIFICATION_RESPONSE);
    });
  });

  describe('safety.*', () => {
    it('scan analyzes inbound email', () => {
      const result = emai.safety.scan(makeEmail());
      expect(result).toHaveProperty('safe');
      expect(result).toHaveProperty('risks');
    });

    it('checkBeforeSend blocks unsafe emails', async () => {
      const { allowed } = await emai.safety.checkBeforeSend({
        to: 'bob@example.com',
        subject: 'Hi',
        text: 'SSN: 123-45-6789',
      });
      expect(allowed).toBe(false);
    });
  });

  describe('events', () => {
    it('on registers event listener', () => {
      const handler = vi.fn();
      const unsub = emai.on('email:received', handler);
      expect(typeof unsub).toBe('function');
    });

    it('emits email:sent on send', async () => {
      provider.sendEmail.mockResolvedValue({ id: 'sent-1', threadId: 'thread-1' });
      await emai.connect();

      const handler = vi.fn();
      emai.on('email:sent', handler);

      await emai.emails.send({ to: 'bob@example.com', subject: 'Hi', text: 'Hello' });
      expect(handler).toHaveBeenCalled();
    });

    it('emits email:deleted on delete', async () => {
      await emai.connect();
      const handler = vi.fn();
      emai.on('email:deleted', handler);

      await emai.emails.delete('email-1');
      expect(handler).toHaveBeenCalledWith({ emailId: 'email-1' });
    });

    it('emits email:read on markAsRead', async () => {
      await emai.connect();
      const handler = vi.fn();
      emai.on('email:read', handler);

      await emai.emails.markAsRead('email-1');
      expect(handler).toHaveBeenCalledWith({ emailId: 'email-1' });
    });

    it('emits email:moved on moveToFolder', async () => {
      await emai.connect();
      const handler = vi.fn();
      emai.on('email:moved', handler);

      await emai.emails.moveToFolder('email-1', 'trash');
      expect(handler).toHaveBeenCalledWith({ emailId: 'email-1', folder: 'trash' });
    });
  });

  describe('watch.*', () => {
    it('requires connection', async () => {
      await expect(emai.watch.start()).rejects.toThrow(ConnectionError);
    });

    it('isWatching returns false initially', () => {
      expect(emai.watch.isWatching()).toBe(false);
    });
  });

  describe('webhooks.*', () => {
    it('register returns ID', () => {
      const id = emai.webhooks.register('https://example.com/hook', ['email:received']);
      expect(id).toBeTruthy();
    });

    it('list returns registered webhooks', () => {
      emai.webhooks.register('https://example.com/hook', ['email:received']);
      const list = emai.webhooks.list();
      expect(list).toHaveLength(1);
    });

    it('unregister removes webhook', () => {
      const id = emai.webhooks.register('https://example.com/hook', ['email:received']);
      emai.webhooks.unregister(id);
      expect(emai.webhooks.list()).toHaveLength(0);
    });
  });

  describe('internal accessors', () => {
    it('getProvider returns provider', () => {
      expect(emai.getProvider()).toBeTruthy();
    });

    it('getAiEngine returns undefined without AI config', () => {
      expect(emai.getAiEngine()).toBeUndefined();
    });

    it('getAdapter returns undefined without AI config', () => {
      expect(emai.getAdapter()).toBeUndefined();
    });

    it('getStorage returns storage adapter', () => {
      expect(emai.getStorage()).toBeTruthy();
    });

    it('getEventEmitter returns emitter', () => {
      expect(emai.getEventEmitter()).toBeTruthy();
    });
  });
});

describe('createEmai', () => {
  it('creates Emai instance', () => {
    const emai = createEmai({
      provider: { type: 'gmail', auth: { clientId: 'x', clientSecret: 'y', refreshToken: 'z' } },
    });
    expect(emai).toBeInstanceOf(Emai);
  });
});
