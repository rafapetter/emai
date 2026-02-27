import { describe, it, expect, beforeEach } from 'vitest';
import { FullTextSearch } from '../../../src/search/full-text.js';
import { makeEmail } from '../../helpers/fixtures.js';

describe('FullTextSearch', () => {
  let search: FullTextSearch;

  beforeEach(() => {
    search = new FullTextSearch();
  });

  // ---- Indexing ----

  describe('indexEmails', () => {
    it('indexes a single email', async () => {
      await search.indexEmails([makeEmail()]);
      expect(search.documentCount).toBe(1);
    });

    it('indexes multiple emails', async () => {
      await search.indexEmails([
        makeEmail({ id: 'e1' }),
        makeEmail({ id: 'e2' }),
        makeEmail({ id: 'e3' }),
      ]);
      expect(search.documentCount).toBe(3);
    });

    it('updates existing email on re-index', async () => {
      await search.indexEmails([makeEmail({ id: 'e1' })]);
      await search.indexEmails([makeEmail({ id: 'e1', subject: 'Updated' })]);
      expect(search.documentCount).toBe(1);
    });
  });

  // ---- Search ----

  describe('search', () => {
    it('finds email by body term', async () => {
      await search.indexEmails([
        makeEmail({ id: 'e1', body: { text: 'Important meeting tomorrow about budget' } }),
        makeEmail({ id: 'e2', body: { text: 'Weekend plans for hiking trip' } }),
      ]);

      const results = await search.search('budget');
      expect(results.length).toBe(1);
      expect(results[0].email.id).toBe('e1');
      expect(results[0].matchType).toBe('fulltext');
    });

    it('finds email by subject', async () => {
      await search.indexEmails([
        makeEmail({ id: 'e1', subject: 'Project Deadline Reminder' }),
        makeEmail({ id: 'e2', subject: 'Weekend Plans' }),
      ]);

      const results = await search.search('deadline');
      expect(results.length).toBe(1);
      expect(results[0].email.id).toBe('e1');
    });

    it('returns empty for no match', async () => {
      await search.indexEmails([makeEmail()]);
      const results = await search.search('nonexistent');
      expect(results).toHaveLength(0);
    });

    it('returns empty for empty index', async () => {
      const results = await search.search('hello');
      expect(results).toHaveLength(0);
    });

    it('ranks more relevant docs higher', async () => {
      await search.indexEmails([
        makeEmail({ id: 'e1', body: { text: 'The budget meeting is important' } }),
        makeEmail({ id: 'e2', body: { text: 'Budget review: budget analysis of budget items. Budget summary.' } }),
      ]);

      const results = await search.search('budget');
      expect(results.length).toBe(2);
      expect(results[0].email.id).toBe('e2'); // more budget mentions = higher score
    });

    it('respects limit', async () => {
      await search.indexEmails([
        makeEmail({ id: 'e1', body: { text: 'test content here' } }),
        makeEmail({ id: 'e2', body: { text: 'test content there' } }),
        makeEmail({ id: 'e3', body: { text: 'test content everywhere' } }),
      ]);

      const results = await search.search('test', { limit: 2 });
      expect(results).toHaveLength(2);
    });

    it('respects minScore', async () => {
      await search.indexEmails([
        makeEmail({ id: 'e1', body: { text: 'budget analysis report' } }),
        makeEmail({ id: 'e2', body: { text: 'random other content' } }),
      ]);

      const results = await search.search('budget', { minScore: 100 });
      expect(results).toHaveLength(0);
    });

    it('generates highlights', async () => {
      await search.indexEmails([
        makeEmail({ id: 'e1', body: { text: 'The quarterly budget review is scheduled for next week' } }),
      ]);

      const results = await search.search('budget');
      expect(results[0].highlights).toBeDefined();
      expect(results[0].highlights!.length).toBeGreaterThan(0);
    });
  });

  // ---- Query DSL ----

  describe('query DSL', () => {
    beforeEach(async () => {
      await search.indexEmails([
        makeEmail({
          id: 'e1',
          from: { address: 'alice@example.com' },
          to: [{ address: 'bob@example.com' }],
          subject: 'Budget Report',
          isRead: true,
          isStarred: false,
          attachments: [{ id: 'a1', filename: 'report.pdf', contentType: 'application/pdf', size: 100, isInline: false }],
          date: new Date('2025-06-15T10:00:00Z'),
          body: { text: 'Here is the budget report' },
        }),
        makeEmail({
          id: 'e2',
          from: { address: 'carol@company.com' },
          to: [{ address: 'alice@example.com' }],
          subject: 'Meeting Notes',
          isRead: false,
          isStarred: true,
          attachments: [],
          date: new Date('2025-07-01T10:00:00Z'),
          body: { text: 'Notes from today meeting' },
        }),
      ]);
    });

    it('filters by from: combined with term', async () => {
      // DSL filters need a search term to produce BM25 scores
      const results = await search.search('from:alice budget');
      expect(results).toHaveLength(1);
      expect(results[0].email.id).toBe('e1');
    });

    it('filters by to: combined with term', async () => {
      const results = await search.search('to:alice notes');
      expect(results).toHaveLength(1);
      expect(results[0].email.id).toBe('e2');
    });

    it('filters by has:attachment combined with term', async () => {
      const results = await search.search('has:attachment budget');
      expect(results).toHaveLength(1);
      expect(results[0].email.id).toBe('e1');
    });

    it('filters by is:read combined with term', async () => {
      // e1 is read, e2 is unread; both have indexable terms
      const results = await search.search('is:read budget');
      expect(results).toHaveLength(1);
      expect(results[0].email.id).toBe('e1');
    });

    it('filters by is:unread combined with term', async () => {
      const results = await search.search('is:unread meeting');
      expect(results).toHaveLength(1);
      expect(results[0].email.id).toBe('e2');
    });

    it('filters by is:starred combined with term', async () => {
      const results = await search.search('is:starred meeting');
      expect(results).toHaveLength(1);
      expect(results[0].email.id).toBe('e2');
    });

    it('filters by after: date combined with term', async () => {
      const results = await search.search('after:2025-06-20 meeting');
      expect(results).toHaveLength(1);
      expect(results[0].email.id).toBe('e2');
    });

    it('filters by before: date combined with term', async () => {
      const results = await search.search('before:2025-06-20 budget');
      expect(results).toHaveLength(1);
      expect(results[0].email.id).toBe('e1');
    });

    it('combines DSL filter with text search', async () => {
      const results = await search.search('from:carol meeting');
      expect(results).toHaveLength(1);
      expect(results[0].email.id).toBe('e2');
    });
  });

  // ---- Options filters ----

  describe('search options filtering', () => {
    beforeEach(async () => {
      await search.indexEmails([
        makeEmail({ id: 'e1', folder: 'inbox', labels: ['work'], body: { text: 'test content' } }),
        makeEmail({ id: 'e2', folder: 'sent', labels: ['personal'], body: { text: 'test content' } }),
      ]);
    });

    it('filters by folder', async () => {
      const results = await search.search('test', { folder: 'inbox' });
      expect(results).toHaveLength(1);
      expect(results[0].email.id).toBe('e1');
    });

    it('filters by label', async () => {
      const results = await search.search('test', { label: 'personal' });
      expect(results).toHaveLength(1);
      expect(results[0].email.id).toBe('e2');
    });
  });

  // ---- Remove ----

  describe('removeEmail', () => {
    it('removes email from index', async () => {
      await search.indexEmails([makeEmail({ id: 'e1', body: { text: 'budget report' } })]);
      search.removeEmail('e1');

      expect(search.documentCount).toBe(0);
      const results = await search.search('budget');
      expect(results).toHaveLength(0);
    });

    it('handles removing non-existent email', () => {
      search.removeEmail('nonexistent');
      expect(search.documentCount).toBe(0);
    });
  });

  // ---- Clear ----

  describe('clear', () => {
    it('clears entire index', async () => {
      await search.indexEmails([makeEmail({ id: 'e1' }), makeEmail({ id: 'e2' })]);
      search.clear();
      expect(search.documentCount).toBe(0);
    });
  });
});
