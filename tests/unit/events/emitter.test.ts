import { describe, it, expect, vi } from 'vitest';
import { EmaiEventEmitter } from '../../../src/events/emitter.js';
import type { Email } from '../../../src/core/types.js';
import { makeEmail } from '../../helpers/fixtures.js';

describe('EmaiEventEmitter', () => {
  it('calls listener on emit', () => {
    const emitter = new EmaiEventEmitter();
    const listener = vi.fn();
    emitter.on('email:received', listener);

    const email = makeEmail();
    emitter.emit('email:received', email);

    expect(listener).toHaveBeenCalledOnce();
    expect(listener).toHaveBeenCalledWith(email);
  });

  it('supports multiple listeners', () => {
    const emitter = new EmaiEventEmitter();
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    emitter.on('email:received', listener1);
    emitter.on('email:received', listener2);

    emitter.emit('email:received', makeEmail());

    expect(listener1).toHaveBeenCalledOnce();
    expect(listener2).toHaveBeenCalledOnce();
  });

  it('returns unsubscribe function from on()', () => {
    const emitter = new EmaiEventEmitter();
    const listener = vi.fn();
    const unsub = emitter.on('email:received', listener);

    unsub();
    emitter.emit('email:received', makeEmail());

    expect(listener).not.toHaveBeenCalled();
  });

  it('once() fires listener only once', () => {
    const emitter = new EmaiEventEmitter();
    const listener = vi.fn();
    emitter.once('email:received', listener);

    emitter.emit('email:received', makeEmail());
    emitter.emit('email:received', makeEmail());

    expect(listener).toHaveBeenCalledOnce();
  });

  it('off() removes a listener', () => {
    const emitter = new EmaiEventEmitter();
    const listener = vi.fn();
    emitter.on('email:received', listener);
    emitter.off('email:received', listener);

    emitter.emit('email:received', makeEmail());

    expect(listener).not.toHaveBeenCalled();
  });

  it('off() is safe for non-existent event', () => {
    const emitter = new EmaiEventEmitter();
    const listener = vi.fn();
    // Should not throw
    emitter.off('email:received', listener);
  });

  it('emit does nothing for events with no listeners', () => {
    const emitter = new EmaiEventEmitter();
    // Should not throw
    emitter.emit('email:received', makeEmail());
  });

  it('swallows listener errors', () => {
    const emitter = new EmaiEventEmitter();
    const badListener = vi.fn(() => {
      throw new Error('Listener error');
    });
    const goodListener = vi.fn();

    emitter.on('email:received', badListener);
    emitter.on('email:received', goodListener);

    // Should not throw
    emitter.emit('email:received', makeEmail());

    expect(badListener).toHaveBeenCalled();
    expect(goodListener).toHaveBeenCalled();
  });

  it('removeAllListeners() clears specific event', () => {
    const emitter = new EmaiEventEmitter();
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    emitter.on('email:received', listener1);
    emitter.on('email:sent', listener2);

    emitter.removeAllListeners('email:received');
    emitter.emit('email:received', makeEmail());
    emitter.emit('email:sent', { id: '1', threadId: 't', messageId: '<m>' });

    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).toHaveBeenCalledOnce();
  });

  it('removeAllListeners() clears all events', () => {
    const emitter = new EmaiEventEmitter();
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    emitter.on('email:received', listener1);
    emitter.on('email:sent', listener2);

    emitter.removeAllListeners();
    emitter.emit('email:received', makeEmail());
    emitter.emit('email:sent', { id: '1', threadId: 't', messageId: '<m>' });

    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).not.toHaveBeenCalled();
  });

  it('listenerCount() returns correct count', () => {
    const emitter = new EmaiEventEmitter();
    expect(emitter.listenerCount('email:received')).toBe(0);

    emitter.on('email:received', () => {});
    expect(emitter.listenerCount('email:received')).toBe(1);

    emitter.on('email:received', () => {});
    expect(emitter.listenerCount('email:received')).toBe(2);
  });

  it('listenerCount() returns 0 for unknown event', () => {
    const emitter = new EmaiEventEmitter();
    expect(emitter.listenerCount('watch:started')).toBe(0);
  });

  it('cleans up empty sets after off()', () => {
    const emitter = new EmaiEventEmitter();
    const listener = vi.fn();
    emitter.on('email:received', listener);
    emitter.off('email:received', listener);
    expect(emitter.listenerCount('email:received')).toBe(0);
  });

  it('handles different event types independently', () => {
    const emitter = new EmaiEventEmitter();
    const receivedListener = vi.fn();
    const readListener = vi.fn();

    emitter.on('email:received', receivedListener);
    emitter.on('email:read', readListener);

    emitter.emit('email:read', { emailId: '123' });

    expect(receivedListener).not.toHaveBeenCalled();
    expect(readListener).toHaveBeenCalledWith({ emailId: '123' });
  });
});
