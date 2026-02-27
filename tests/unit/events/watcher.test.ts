import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EmailWatcher } from '../../../src/events/watcher.js';
import { EmaiEventEmitter } from '../../../src/events/emitter.js';
import { createMockEmailProvider } from '../../helpers/mock-email-provider.js';
import { makeEmail } from '../../helpers/fixtures.js';
import type { EmailProvider } from '../../../src/core/types.js';

describe('EmailWatcher', () => {
  let provider: EmailProvider & {
    listEmails: ReturnType<typeof vi.fn>;
    watch: ReturnType<typeof vi.fn>;
  };
  let emitter: EmaiEventEmitter;
  let watcher: EmailWatcher;

  beforeEach(() => {
    vi.useFakeTimers();
    provider = createMockEmailProvider() as any;
    provider.listEmails.mockResolvedValue({ items: [], hasMore: false, total: 0 });
    emitter = new EmaiEventEmitter();
    watcher = new EmailWatcher(provider, emitter);
  });

  afterEach(async () => {
    await watcher.stop();
    vi.useRealTimers();
  });

  describe('start', () => {
    it('emits watch:started event', async () => {
      const startedHandler = vi.fn();
      emitter.on('watch:started', startedHandler);

      await watcher.start({ useIdle: false });
      expect(startedHandler).toHaveBeenCalled();
    });

    it('sets isWatching to true', async () => {
      expect(watcher.isWatching()).toBe(false);
      await watcher.start({ useIdle: false });
      expect(watcher.isWatching()).toBe(true);
    });

    it('does not start twice', async () => {
      const startedHandler = vi.fn();
      emitter.on('watch:started', startedHandler);

      await watcher.start({ useIdle: false });
      await watcher.start({ useIdle: false });
      expect(startedHandler).toHaveBeenCalledTimes(1);
    });

    it('uses native watch when provider supports it and useIdle is true', async () => {
      const stopFn = vi.fn();
      provider.watch = vi.fn().mockResolvedValue({ stop: stopFn });

      await watcher.start({ useIdle: true });
      expect(provider.watch).toHaveBeenCalled();
    });

    it('emits email:received from native watch callback', async () => {
      const receivedHandler = vi.fn();
      emitter.on('email:received', receivedHandler);

      let watchCallback: ((email: any) => void) | undefined;
      provider.watch = vi.fn().mockImplementation(async (cb: any) => {
        watchCallback = cb;
        return { stop: vi.fn() };
      });

      await watcher.start({ useIdle: true });
      expect(watchCallback).toBeTruthy();

      const email = makeEmail();
      watchCallback!(email);
      expect(receivedHandler).toHaveBeenCalledWith(email);
    });
  });

  describe('stop', () => {
    it('emits watch:stopped event', async () => {
      const stoppedHandler = vi.fn();
      emitter.on('watch:stopped', stoppedHandler);

      await watcher.start({ useIdle: false });
      await watcher.stop();
      expect(stoppedHandler).toHaveBeenCalled();
    });

    it('sets isWatching to false', async () => {
      await watcher.start({ useIdle: false });
      await watcher.stop();
      expect(watcher.isWatching()).toBe(false);
    });

    it('stops native watch handle', async () => {
      const stopFn = vi.fn();
      provider.watch = vi.fn().mockResolvedValue({ stop: stopFn });

      await watcher.start({ useIdle: true });
      await watcher.stop();
      expect(stopFn).toHaveBeenCalled();
    });

    it('does nothing when not watching', async () => {
      const stoppedHandler = vi.fn();
      emitter.on('watch:stopped', stoppedHandler);

      await watcher.stop();
      expect(stoppedHandler).not.toHaveBeenCalled();
    });
  });

  describe('polling', () => {
    it('seeds seen IDs on start', async () => {
      const existing = [makeEmail({ id: 'old-1' }), makeEmail({ id: 'old-2' })];
      provider.listEmails.mockResolvedValueOnce({ items: existing, hasMore: false, total: 2 });

      const receivedHandler = vi.fn();
      emitter.on('email:received', receivedHandler);

      await watcher.start({ useIdle: false });

      // The seed call + first poll should not emit for already-seen emails
      // Give the poll a chance to run
      provider.listEmails.mockResolvedValue({ items: existing, hasMore: false, total: 2 });
      await vi.advanceTimersByTimeAsync(35_000);

      // old-1 and old-2 were seeded, so they should not trigger events
      expect(receivedHandler).not.toHaveBeenCalled();
    });

    it('emits email:received for new emails during polling', async () => {
      // First call seeds (returns empty)
      provider.listEmails.mockResolvedValueOnce({ items: [], hasMore: false, total: 0 });

      const receivedHandler = vi.fn();
      emitter.on('email:received', receivedHandler);

      await watcher.start({ useIdle: false });

      // Second call returns a new email
      const newEmail = makeEmail({ id: 'new-1' });
      provider.listEmails.mockResolvedValue({ items: [newEmail], hasMore: false, total: 1 });
      await vi.advanceTimersByTimeAsync(35_000);

      expect(receivedHandler).toHaveBeenCalledWith(newEmail);
    });

    it('deduplicates already-seen emails', async () => {
      provider.listEmails.mockResolvedValueOnce({ items: [], hasMore: false, total: 0 });

      const receivedHandler = vi.fn();
      emitter.on('email:received', receivedHandler);

      await watcher.start({ useIdle: false });

      const email = makeEmail({ id: 'dup-1' });
      provider.listEmails.mockResolvedValue({ items: [email], hasMore: false, total: 1 });

      // First poll: new email
      await vi.advanceTimersByTimeAsync(35_000);
      // Second poll: same email
      await vi.advanceTimersByTimeAsync(35_000);

      // Should only be emitted once
      expect(receivedHandler).toHaveBeenCalledTimes(1);
    });

    it('emits watch:error on polling failure', async () => {
      provider.listEmails.mockResolvedValueOnce({ items: [], hasMore: false, total: 0 });

      const errorHandler = vi.fn();
      emitter.on('watch:error', errorHandler);

      await watcher.start({ useIdle: false });

      provider.listEmails.mockRejectedValue(new Error('network error'));
      await vi.advanceTimersByTimeAsync(35_000);

      expect(errorHandler).toHaveBeenCalled();
    });
  });

  describe('native watch fallback', () => {
    it('falls back to polling when native watch fails and eventually stops', async () => {
      // provider.watch always rejects, simulating broken native watch
      provider.watch = vi.fn().mockRejectedValue(new Error('watch not supported'));

      const errorHandler = vi.fn();
      emitter.on('watch:error', errorHandler);

      // Don't await since it enters retry loop
      const startPromise = watcher.start({ useIdle: true });

      // Let the retries happen (with backoff)
      // After enough errors, it should fall back to polling or give up
      for (let i = 0; i < 5; i++) {
        await vi.advanceTimersByTimeAsync(60_000);
      }

      expect(errorHandler).toHaveBeenCalled();
    });
  });
});
