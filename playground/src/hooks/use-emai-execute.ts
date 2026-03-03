'use client';

import { useState, useCallback } from 'react';

interface ExecuteResult<T = unknown> {
  data: T | null;
  error: string | null;
  loading: boolean;
  duration: number | null;
  execute: (payload?: Record<string, unknown>, actionOverride?: string) => Promise<T | null>;
  reset: () => void;
}

const DEFAULT_TIMEOUT = 60_000; // 60 seconds

export function useEmaiExecute<T = unknown>(
  apiRoute: string,
  action: string,
  timeoutMs: number = DEFAULT_TIMEOUT,
): ExecuteResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);

  const execute = useCallback(
    async (payload?: Record<string, unknown>, actionOverride?: string) => {
      setLoading(true);
      setError(null);
      const start = performance.now();

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const res = await fetch(apiRoute, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: actionOverride ?? action, ...payload }),
          signal: controller.signal,
        });
        clearTimeout(timer);

        const result = await res.json();
        const elapsed = performance.now() - start;
        setDuration(elapsed);

        if (result.success) {
          setData(result.data);
          return result.data as T;
        } else {
          setError(result.error || 'Request failed');
          return null;
        }
      } catch (err) {
        clearTimeout(timer);
        const elapsed = performance.now() - start;
        setDuration(elapsed);

        if (err instanceof DOMException && err.name === 'AbortError') {
          setError(`Operation timed out after ${Math.round(timeoutMs / 1000)}s. The AI model may be overloaded — try again or reduce batch size.`);
        } else {
          const msg = err instanceof Error ? err.message : 'Network error';
          setError(msg);
        }
        return null;
      } finally {
        setLoading(false);
      }
    },
    [apiRoute, action, timeoutMs],
  );

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setDuration(null);
  }, []);

  return { data, error, loading, duration, execute, reset };
}
