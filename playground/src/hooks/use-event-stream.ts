'use client';

import { useEffect, useRef, useCallback, useState } from 'react';

export interface EmaiEventPayload {
  event: string;
  data: unknown;
  timestamp: number;
}

export function useEventStream() {
  const [events, setEvents] = useState<EmaiEventPayload[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource('/api/emai/events/stream');
    esRef.current = es;

    es.onopen = () => setIsConnected(true);
    es.onmessage = (e) => {
      try {
        const payload: EmaiEventPayload = JSON.parse(e.data);
        setEvents((prev) => [...prev, payload].slice(-200));
      } catch {
        // ignore malformed
      }
    };
    es.onerror = () => setIsConnected(false);

    return () => {
      es.close();
      setIsConnected(false);
    };
  }, []);

  const clear = useCallback(() => setEvents([]), []);

  return { events, isConnected, clear };
}
