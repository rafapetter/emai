import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryStorage } from '../../../src/storage/memory.js';
import { makeEmail, makeThread, ALICE, BOB } from '../../helpers/fixtures.js';

describe('MemoryStorage', () => {
  let storage: MemoryStorage;

  beforeEach(async () => {
    storage = new MemoryStorage();
    await storage.initialize();
  });

  describe('initialize', () => {
    it('completes without error', async () => {
      await expect(storage.initialize()).resolves.toBeUndefined();
    });
  });

  describe('name', () => {
    it('returns memory', () => {
      expect(storage.name).toBe('memory');
    });
  });

  // ---- Email CRUD ----

  describe('email CRUD', () => {
    it('saves and retrieves email', async () => {
      const email = makeEmail({ id: 'test-1' });
      await storage.saveEmail(email);
      const retrieved = await storage.getEmail('test-1');
      expect(retrieved).toEqual(email);
    });

    it('returns null for non-existent email', async () => {
      expect(await storage.getEmail('nonexistent')).toBeNull();
    });

    it('saves multiple emails', async () => {
      const emails = [makeEmail({ id: 'e1' }), makeEmail({ id: 'e2' })];
      await storage.saveEmails(emails);
      expect(await storage.getEmail('e1')).toBeTruthy();
      expect(await storage.getEmail('e2')).toBeTruthy();
    });

    it('deletes email', async () => {
      await storage.saveEmail(makeEmail({ id: 'e1' }));
      await storage.deleteEmail('e1');
      expect(await storage.getEmail('e1')).toBeNull();
    });

    it('overwrites existing email on save', async () => {
      await storage.saveEmail(makeEmail({ id: 'e1', subject: 'Original' }));
      await storage.saveEmail(makeEmail({ id: 'e1', subject: 'Updated' }));
      const email = await storage.getEmail('e1');
      expect(email?.subject).toBe('Updated');
    });
  });

  // ---- List with filters ----

  describe('listEmails', () => {
    beforeEach(async () => {
      await storage.saveEmails([
        makeEmail({
          id: 'e1',
          folder: 'inbox',
          labels: ['work', 'important'],
          from: ALICE,
          to: [BOB],
          subject: 'Budget Report Q1',
          date: new Date('2025-01-15T10:00:00Z'),
          isRead: true,
          isStarred: false,
          attachments: [{ id: 'a1', filename: 'report.pdf', contentType: 'application/pdf', size: 100, isInline: false }],
        }),
        makeEmail({
          id: 'e2',
          folder: 'sent',
          labels: ['personal'],
          from: BOB,
          to: [ALICE],
          subject: 'Weekend Plans',
          date: new Date('2025-01-16T10:00:00Z'),
          isRead: false,
          isStarred: true,
          attachments: [],
        }),
        makeEmail({
          id: 'e3',
          folder: 'inbox',
          labels: ['work'],
          from: ALICE,
          to: [BOB],
          subject: 'Follow Up on Budget',
          date: new Date('2025-01-17T10:00:00Z'),
          isRead: false,
          isStarred: false,
          attachments: [],
        }),
      ]);
    });

    it('lists all emails with default pagination', async () => {
      const result = await storage.listEmails();
      expect(result.items).toHaveLength(3);
      expect(result.total).toBe(3);
      expect(result.hasMore).toBe(false);
    });

    it('filters by folder', async () => {
      const result = await storage.listEmails({ folder: 'inbox' });
      expect(result.items).toHaveLength(2);
      expect(result.items.every((e) => e.folder === 'inbox')).toBe(true);
    });

    it('filters by label', async () => {
      const result = await storage.listEmails({ label: 'important' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('e1');
    });

    it('filters by from', async () => {
      const result = await storage.listEmails({ from: 'bob' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('e2');
    });

    it('filters by to', async () => {
      const result = await storage.listEmails({ to: 'alice' });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('e2');
    });

    it('filters by subject', async () => {
      const result = await storage.listEmails({ subject: 'budget' });
      expect(result.items).toHaveLength(2);
    });

    it('filters by isRead', async () => {
      const result = await storage.listEmails({ isRead: true });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('e1');
    });

    it('filters by isStarred', async () => {
      const result = await storage.listEmails({ isStarred: true });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('e2');
    });

    it('filters by hasAttachment', async () => {
      const result = await storage.listEmails({ hasAttachment: true });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('e1');
    });

    it('filters by date range', async () => {
      const result = await storage.listEmails({
        after: new Date('2025-01-15T12:00:00Z'),
        before: new Date('2025-01-16T12:00:00Z'),
      });
      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('e2');
    });

    it('filters by query (full-text)', async () => {
      const result = await storage.listEmails({ query: 'budget' });
      expect(result.items).toHaveLength(2);
    });

    it('sorts by date descending (default)', async () => {
      const result = await storage.listEmails();
      expect(result.items[0].id).toBe('e3');
      expect(result.items[2].id).toBe('e1');
    });

    it('sorts by date ascending', async () => {
      const result = await storage.listEmails({ sortBy: 'date', sortOrder: 'asc' });
      expect(result.items[0].id).toBe('e1');
      expect(result.items[2].id).toBe('e3');
    });

    it('sorts by subject', async () => {
      const result = await storage.listEmails({ sortBy: 'subject', sortOrder: 'asc' });
      expect(result.items[0].subject).toBe('Budget Report Q1');
    });

    it('paginates with offset and limit', async () => {
      const result = await storage.listEmails({ limit: 2, offset: 0, sortBy: 'date', sortOrder: 'asc' });
      expect(result.items).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(3);
    });

    it('offset beyond total returns empty', async () => {
      const result = await storage.listEmails({ offset: 10 });
      expect(result.items).toHaveLength(0);
      expect(result.hasMore).toBe(false);
    });
  });

  // ---- Thread CRUD ----

  describe('thread CRUD', () => {
    it('saves and retrieves thread', async () => {
      const thread = makeThread({ id: 't-1' });
      await storage.saveThread(thread);
      const retrieved = await storage.getThread('t-1');
      expect(retrieved).toEqual(thread);
    });

    it('returns null for non-existent thread', async () => {
      expect(await storage.getThread('nonexistent')).toBeNull();
    });
  });

  // ---- Metadata ----

  describe('metadata', () => {
    it('saves and retrieves metadata', async () => {
      await storage.setMetadata('key', 'value');
      expect(await storage.getMetadata('key')).toBe('value');
    });

    it('returns null for non-existent key', async () => {
      expect(await storage.getMetadata('nonexistent')).toBeNull();
    });

    it('overwrites existing metadata', async () => {
      await storage.setMetadata('key', 'old');
      await storage.setMetadata('key', 'new');
      expect(await storage.getMetadata('key')).toBe('new');
    });
  });

  // ---- Close ----

  describe('close', () => {
    it('clears all data', async () => {
      await storage.saveEmail(makeEmail({ id: 'e1' }));
      await storage.saveThread(makeThread({ id: 't1' }));
      await storage.setMetadata('key', 'value');
      await storage.close();

      expect(await storage.getEmail('e1')).toBeNull();
      expect(await storage.getThread('t1')).toBeNull();
      expect(await storage.getMetadata('key')).toBeNull();
    });
  });
});
