'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';

export function ConnectionStatus() {
  const [status, setStatus] = useState<'connected' | 'disconnected' | 'loading'>('loading');

  useEffect(() => {
    async function check() {
      try {
        const res = await fetch('/api/emai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'status' }),
        });
        const data = await res.json();
        setStatus(data.data?.connected ? 'connected' : 'disconnected');
      } catch {
        setStatus('disconnected');
      }
    }
    check();
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, []);

  if (status === 'loading') {
    return (
      <Badge variant="outline" className="text-xs">
        Checking...
      </Badge>
    );
  }

  return (
    <Badge
      variant={status === 'connected' ? 'default' : 'secondary'}
      className={
        status === 'connected'
          ? 'bg-green-600 text-white text-xs'
          : 'text-xs'
      }
    >
      {status === 'connected' ? 'Connected' : 'Disconnected'}
    </Badge>
  );
}
