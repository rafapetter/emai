export interface EventPayload {
  event: string;
  data: unknown;
  timestamp: number;
}

type EventListener = (payload: EventPayload) => void;

class EventBus {
  private listeners = new Set<EventListener>();

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(payload: EventPayload): void {
    for (const listener of this.listeners) {
      listener(payload);
    }
  }
}

// Store on globalThis so all Next.js route handlers share the same bus
const g = globalThis as unknown as { __emaiEventBus?: EventBus };
if (!g.__emaiEventBus) {
  g.__emaiEventBus = new EventBus();
}
export const eventBus: EventBus = g.__emaiEventBus;
