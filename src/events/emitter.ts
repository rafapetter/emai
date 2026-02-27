import type { EmaiEvent, EmaiEventMap } from '../core/types.js';

type Listener<K extends EmaiEvent> = (data: EmaiEventMap[K]) => void;

export class EmaiEventEmitter {
  private listeners = new Map<EmaiEvent, Set<Listener<never>>>();

  on<K extends EmaiEvent>(event: K, listener: Listener<K>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<never>);
    return () => this.off(event, listener);
  }

  once<K extends EmaiEvent>(event: K, listener: Listener<K>): () => void {
    const wrapper: Listener<K> = (data) => {
      this.off(event, wrapper);
      listener(data);
    };
    return this.on(event, wrapper);
  }

  off<K extends EmaiEvent>(event: K, listener: Listener<K>): void {
    const set = this.listeners.get(event);
    if (!set) return;
    set.delete(listener as Listener<never>);
    if (set.size === 0) this.listeners.delete(event);
  }

  emit<K extends EmaiEvent>(event: K, data: EmaiEventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of [...set]) {
      try {
        (listener as Listener<K>)(data);
      } catch {
        // swallow listener errors to avoid breaking the emitter chain
      }
    }
  }

  removeAllListeners(event?: EmaiEvent): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }

  listenerCount(event: EmaiEvent): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}
