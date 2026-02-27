import { describe, it, expect, beforeEach } from 'vitest';
import { ThreadDetector } from '../../../src/threading/detector.js';
import { makeEmail, ALICE, BOB, CAROL } from '../../helpers/fixtures.js';

describe('ThreadDetector', () => {
  let detector: ThreadDetector;

  beforeEach(() => {
    detector = new ThreadDetector();
  });

  // ---- detectThreads ----

  describe('detectThreads', () => {
    it('returns empty for empty array', () => {
      expect(detector.detectThreads([])).toEqual([]);
    });

    it('creates a single thread for one email', () => {
      const threads = detector.detectThreads([makeEmail()]);
      expect(threads).toHaveLength(1);
      expect(threads[0].messageCount).toBe(1);
    });

    it('groups emails by In-Reply-To header', () => {
      const emails = [
        makeEmail({
          id: 'e1',
          headers: { messageId: '<msg-1@test.com>' },
          date: new Date('2025-01-01'),
        }),
        makeEmail({
          id: 'e2',
          headers: { messageId: '<msg-2@test.com>', inReplyTo: '<msg-1@test.com>' },
          date: new Date('2025-01-02'),
        }),
      ];

      const threads = detector.detectThreads(emails);
      expect(threads).toHaveLength(1);
      expect(threads[0].messageCount).toBe(2);
    });

    it('groups emails by References header', () => {
      const emails = [
        makeEmail({
          id: 'e1',
          headers: { messageId: '<msg-1@test.com>' },
          date: new Date('2025-01-01'),
        }),
        makeEmail({
          id: 'e2',
          headers: { messageId: '<msg-2@test.com>' },
          date: new Date('2025-01-02'),
        }),
        makeEmail({
          id: 'e3',
          headers: {
            messageId: '<msg-3@test.com>',
            references: ['<msg-1@test.com>', '<msg-2@test.com>'],
          },
          date: new Date('2025-01-03'),
        }),
      ];

      const threads = detector.detectThreads(emails);
      expect(threads).toHaveLength(1);
      expect(threads[0].messageCount).toBe(3);
    });

    it('keeps unrelated emails as separate threads', () => {
      const emails = [
        makeEmail({
          id: 'e1',
          subject: 'Topic A',
          from: ALICE,
          headers: { messageId: '<a@test.com>' },
          date: new Date('2025-01-01'),
        }),
        makeEmail({
          id: 'e2',
          subject: 'Completely Different Topic',
          from: CAROL,
          to: [{ address: 'dave@other.com' }],
          headers: { messageId: '<b@test.com>' },
          date: new Date('2025-06-01'),
        }),
      ];

      const threads = detector.detectThreads(emails);
      expect(threads).toHaveLength(2);
    });

    it('sorts threads by lastDate descending', () => {
      const emails = [
        makeEmail({ id: 'e1', headers: { messageId: '<a@t>' }, date: new Date('2025-01-01') }),
        makeEmail({ id: 'e2', headers: { messageId: '<b@t>' }, date: new Date('2025-06-01') }),
      ];

      const threads = detector.detectThreads(emails);
      expect(threads[0].lastDate.getTime()).toBeGreaterThan(threads[1].lastDate.getTime());
    });
  });

  // ---- buildThread ----

  describe('buildThread', () => {
    it('sorts emails by date ascending', () => {
      const emails = [
        makeEmail({ id: 'e2', date: new Date('2025-01-02') }),
        makeEmail({ id: 'e1', date: new Date('2025-01-01') }),
      ];
      const thread = detector.buildThread(emails);
      expect(thread.emails[0].id).toBe('e1');
      expect(thread.emails[1].id).toBe('e2');
    });

    it('collects participants from all emails', () => {
      const emails = [
        makeEmail({ id: 'e1', from: ALICE, to: [BOB] }),
        makeEmail({ id: 'e2', from: BOB, to: [ALICE], cc: [CAROL] }),
      ];
      const thread = detector.buildThread(emails);
      expect(thread.participants.length).toBe(3);
    });

    it('deduplicates participants by address', () => {
      const emails = [
        makeEmail({ id: 'e1', from: ALICE, to: [BOB] }),
        makeEmail({ id: 'e2', from: ALICE, to: [BOB] }),
      ];
      const thread = detector.buildThread(emails);
      expect(thread.participants.length).toBe(2);
    });

    it('prefers participant with name over without', () => {
      const emails = [
        makeEmail({ id: 'e1', from: { address: 'alice@example.com' } }),
        makeEmail({ id: 'e2', from: { name: 'Alice Smith', address: 'alice@example.com' } }),
      ];
      const thread = detector.buildThread(emails);
      const alice = thread.participants.find((p) => p.address === 'alice@example.com');
      expect(alice?.name).toBe('Alice Smith');
    });

    it('aggregates labels', () => {
      const emails = [
        makeEmail({ id: 'e1', labels: ['inbox', 'work'] }),
        makeEmail({ id: 'e2', labels: ['inbox', 'important'] }),
      ];
      const thread = detector.buildThread(emails);
      expect(thread.labels).toContain('inbox');
      expect(thread.labels).toContain('work');
      expect(thread.labels).toContain('important');
    });

    it('uses normalized subject', () => {
      const emails = [
        makeEmail({ id: 'e1', subject: 'Meeting Tomorrow' }),
        makeEmail({ id: 'e2', subject: 'Re: Meeting Tomorrow' }),
      ];
      const thread = detector.buildThread(emails);
      expect(thread.subject).toBe('Meeting Tomorrow');
    });

    it('sets lastDate to most recent email', () => {
      const emails = [
        makeEmail({ id: 'e1', date: new Date('2025-01-01') }),
        makeEmail({ id: 'e2', date: new Date('2025-01-05') }),
      ];
      const thread = detector.buildThread(emails);
      expect(thread.lastDate).toEqual(new Date('2025-01-05'));
    });
  });

  // ---- addToThread ----

  describe('addToThread', () => {
    it('adds new email to thread', () => {
      const thread = detector.buildThread([makeEmail({ id: 'e1' })]);
      const newEmail = makeEmail({ id: 'e2', from: BOB, to: [ALICE] });
      const updated = detector.addToThread(thread, newEmail);
      expect(updated.messageCount).toBe(2);
    });

    it('deduplicates existing email', () => {
      const thread = detector.buildThread([makeEmail({ id: 'e1' })]);
      const updated = detector.addToThread(thread, makeEmail({ id: 'e1' }));
      expect(updated.messageCount).toBe(1);
    });
  });

  // ---- findThread ----

  describe('findThread', () => {
    it('finds thread by In-Reply-To header', () => {
      const thread = detector.buildThread([
        makeEmail({ id: 'e1', headers: { messageId: '<original@test>' } }),
      ]);
      const newEmail = makeEmail({
        id: 'e2',
        headers: { messageId: '<reply@test>', inReplyTo: '<original@test>' },
      });

      const found = detector.findThread(newEmail, [thread]);
      expect(found).toBe(thread);
    });

    it('finds thread by References header', () => {
      const thread = detector.buildThread([
        makeEmail({ id: 'e1', headers: { messageId: '<original@test>' } }),
      ]);
      const newEmail = makeEmail({
        id: 'e2',
        headers: { messageId: '<reply@test>', references: ['<original@test>'] },
      });

      const found = detector.findThread(newEmail, [thread]);
      expect(found).toBe(thread);
    });

    it('finds thread by subject match within time window', () => {
      const thread = detector.buildThread([
        makeEmail({
          id: 'e1',
          subject: 'Meeting Notes',
          from: ALICE,
          to: [BOB],
          date: new Date('2025-01-15'),
          headers: { messageId: '<a@test>' },
        }),
      ]);
      const newEmail = makeEmail({
        id: 'e2',
        subject: 'Re: Meeting Notes',
        from: BOB,
        to: [ALICE],
        date: new Date('2025-01-16'),
        headers: { messageId: '<b@test>' },
      });

      const found = detector.findThread(newEmail, [thread]);
      expect(found).toBe(thread);
    });

    it('returns null if no match found', () => {
      const thread = detector.buildThread([
        makeEmail({ id: 'e1', subject: 'Topic A', headers: { messageId: '<a@test>' } }),
      ]);
      const newEmail = makeEmail({
        id: 'e2',
        subject: 'Completely Different',
        headers: { messageId: '<b@test>' },
      });

      expect(detector.findThread(newEmail, [thread])).toBeNull();
    });

    it('does not match if outside time window', () => {
      const thread = detector.buildThread([
        makeEmail({
          id: 'e1',
          subject: 'Old Topic',
          from: ALICE,
          to: [BOB],
          date: new Date('2024-01-01'),
          headers: { messageId: '<a@test>' },
        }),
      ]);
      const newEmail = makeEmail({
        id: 'e2',
        subject: 'Re: Old Topic',
        from: BOB,
        to: [ALICE],
        date: new Date('2025-06-01'), // >30 days later
        headers: { messageId: '<b@test>' },
      });

      expect(detector.findThread(newEmail, [thread])).toBeNull();
    });
  });

  // ---- getConversationTree ----

  describe('getConversationTree', () => {
    it('builds a flat tree for single email', () => {
      const thread = detector.buildThread([
        makeEmail({ id: 'e1', headers: { messageId: '<a@test>' } }),
      ]);
      const tree = detector.getConversationTree(thread);
      expect(tree).toHaveLength(1);
      expect(tree[0].email.id).toBe('e1');
      expect(tree[0].children).toHaveLength(0);
      expect(tree[0].depth).toBe(0);
    });

    it('builds parent-child tree from In-Reply-To', () => {
      const thread = detector.buildThread([
        makeEmail({
          id: 'e1',
          headers: { messageId: '<msg-1@test>' },
          date: new Date('2025-01-01'),
        }),
        makeEmail({
          id: 'e2',
          headers: { messageId: '<msg-2@test>', inReplyTo: '<msg-1@test>' },
          date: new Date('2025-01-02'),
        }),
        makeEmail({
          id: 'e3',
          headers: { messageId: '<msg-3@test>', inReplyTo: '<msg-2@test>' },
          date: new Date('2025-01-03'),
        }),
      ]);

      const tree = detector.getConversationTree(thread);
      expect(tree).toHaveLength(1); // one root
      expect(tree[0].email.id).toBe('e1');
      expect(tree[0].children).toHaveLength(1);
      expect(tree[0].children[0].email.id).toBe('e2');
      expect(tree[0].children[0].children).toHaveLength(1);
      expect(tree[0].children[0].children[0].email.id).toBe('e3');
    });

    it('handles multiple roots', () => {
      const thread = detector.buildThread([
        makeEmail({
          id: 'e1',
          headers: { messageId: '<msg-1@test>' },
          date: new Date('2025-01-01'),
        }),
        makeEmail({
          id: 'e2',
          headers: { messageId: '<msg-2@test>' },
          date: new Date('2025-01-02'),
        }),
      ]);

      const tree = detector.getConversationTree(thread);
      expect(tree).toHaveLength(2);
    });
  });
});
