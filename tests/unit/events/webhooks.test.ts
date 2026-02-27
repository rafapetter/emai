import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebhookManager } from '../../../src/events/webhooks.js';
import { EmaiEventEmitter } from '../../../src/events/emitter.js';
import { makeEmail } from '../../helpers/fixtures.js';

describe('WebhookManager', () => {
  let emitter: EmaiEventEmitter;
  let manager: WebhookManager;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    emitter = new EmaiEventEmitter();
    manager = new WebhookManager(emitter);

    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('register', () => {
    it('returns a webhook ID', () => {
      const id = manager.register('https://example.com/hook', ['email:received']);
      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');
    });

    it('registers webhook for specified events', () => {
      manager.register('https://example.com/hook', ['email:received', 'email:sent']);
      const webhooks = manager.list();
      expect(webhooks).toHaveLength(1);
      expect(webhooks[0].events).toEqual(['email:received', 'email:sent']);
    });

    it('stores webhook options', () => {
      manager.register('https://example.com/hook', ['email:received'], {
        secret: 'my-secret',
        retries: 5,
      });
      const webhooks = manager.list();
      expect(webhooks[0].options.secret).toBe('my-secret');
      expect(webhooks[0].options.retries).toBe(5);
    });

    it('initializes failure count to 0', () => {
      manager.register('https://example.com/hook', ['email:received']);
      const webhooks = manager.list();
      expect(webhooks[0].failureCount).toBe(0);
    });
  });

  describe('unregister', () => {
    it('removes webhook by ID', () => {
      const id = manager.register('https://example.com/hook', ['email:received']);
      manager.unregister(id);
      expect(manager.list()).toHaveLength(0);
    });

    it('unsubscribes from events', () => {
      const id = manager.register('https://example.com/hook', ['email:received']);
      manager.unregister(id);

      // Emit event - should NOT trigger fetch since webhook was removed
      emitter.emit('email:received', makeEmail());
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('handles unregister of non-existent ID gracefully', () => {
      expect(() => manager.unregister('nonexistent')).not.toThrow();
    });
  });

  describe('list', () => {
    it('returns all registered webhooks', () => {
      manager.register('https://a.com/hook', ['email:received']);
      manager.register('https://b.com/hook', ['email:sent']);
      expect(manager.list()).toHaveLength(2);
    });

    it('returns empty array when none registered', () => {
      expect(manager.list()).toEqual([]);
    });
  });

  describe('trigger', () => {
    it('delivers to matching webhooks', async () => {
      manager.register('https://example.com/hook', ['email:received']);
      const results = await manager.trigger('email:received', { test: true });
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].status).toBe(200);
    });

    it('skips webhooks not subscribed to the event', async () => {
      manager.register('https://example.com/hook', ['email:sent']);
      const results = await manager.trigger('email:received', { test: true });
      expect(results).toHaveLength(0);
    });

    it('sends correct headers', async () => {
      manager.register('https://example.com/hook', ['email:received']);
      await manager.trigger('email:received', { test: true });

      const [, options] = fetchMock.mock.calls[0];
      expect(options.headers['Content-Type']).toBe('application/json');
      expect(options.headers['X-Emai-Event']).toBe('email:received');
      expect(options.headers['X-Emai-Delivery']).toBeTruthy();
      expect(options.headers['X-Emai-Timestamp']).toBeTruthy();
    });

    it('sends JSON payload with event and data', async () => {
      manager.register('https://example.com/hook', ['email:received']);
      await manager.trigger('email:received', { id: 'test' });

      const [, options] = fetchMock.mock.calls[0];
      const body = JSON.parse(options.body);
      expect(body.event).toBe('email:received');
      expect(body.data).toEqual({ id: 'test' });
      expect(body.timestamp).toBeTruthy();
      expect(body.deliveryId).toBeTruthy();
    });

    it('includes custom headers', async () => {
      manager.register('https://example.com/hook', ['email:received'], {
        headers: { 'X-Custom': 'value' },
      });
      await manager.trigger('email:received', {});

      const [, options] = fetchMock.mock.calls[0];
      expect(options.headers['X-Custom']).toBe('value');
    });

    it('signs payload when secret is provided', async () => {
      manager.register('https://example.com/hook', ['email:received'], {
        secret: 'test-secret',
      });
      await manager.trigger('email:received', {});

      const [, options] = fetchMock.mock.calls[0];
      expect(options.headers['X-Emai-Signature']).toBeTruthy();
      expect(typeof options.headers['X-Emai-Signature']).toBe('string');
    });

    it('reports failure on HTTP error', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 500 });
      manager.register('https://example.com/hook', ['email:received'], {
        retries: 0,
      });

      const results = await manager.trigger('email:received', {});
      expect(results[0].success).toBe(false);
      expect(results[0].status).toBe(500);
    });

    it('reports failure on network error', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
      manager.register('https://example.com/hook', ['email:received'], {
        retries: 0,
      });

      const results = await manager.trigger('email:received', {});
      expect(results[0].success).toBe(false);
      expect(results[0].error).toContain('ECONNREFUSED');
    });

    it('retries on failure', async () => {
      fetchMock
        .mockRejectedValueOnce(new Error('timeout'))
        .mockResolvedValue({ ok: true, status: 200 });

      manager.register('https://example.com/hook', ['email:received'], {
        retries: 1,
        retryDelay: 0,
      });

      const results = await manager.trigger('email:received', {});
      expect(results[0].success).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('increments failure count on failed delivery', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 500 });
      manager.register('https://example.com/hook', ['email:received'], {
        retries: 0,
      });

      await manager.trigger('email:received', {});
      const webhooks = manager.list();
      expect(webhooks[0].failureCount).toBe(1);
    });

    it('resets failure count on successful delivery', async () => {
      // First: fail
      fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
      manager.register('https://example.com/hook', ['email:received'], {
        retries: 0,
      });
      await manager.trigger('email:received', {});
      expect(manager.list()[0].failureCount).toBe(1);

      // Then: succeed
      fetchMock.mockResolvedValue({ ok: true, status: 200 });
      await manager.trigger('email:received', {});
      expect(manager.list()[0].failureCount).toBe(0);
    });

    it('skips webhooks that exceeded max consecutive failures', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 500 });
      manager.register('https://example.com/hook', ['email:received'], {
        retries: 0,
      });

      // Trigger 10 failures
      for (let i = 0; i < 10; i++) {
        await manager.trigger('email:received', {});
      }

      // 11th trigger should be skipped
      fetchMock.mockClear();
      const results = await manager.trigger('email:received', {});
      expect(results).toHaveLength(0);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('event-driven delivery', () => {
    it('delivers webhook when subscribed event is emitted', async () => {
      manager.register('https://example.com/hook', ['email:received']);

      emitter.emit('email:received', makeEmail());

      // Give async delivery a tick to complete
      await vi.waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1);
      });
    });
  });
});
