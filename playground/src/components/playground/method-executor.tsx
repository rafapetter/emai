'use client';

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { JsonViewer } from './json-viewer';
import { Play, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MethodExecutorProps {
  title: string;
  description: string;
  loading: boolean;
  error: string | null;
  data: unknown;
  duration: number | null;
  onExecute: () => void;
  executeLabel?: string;
  children: React.ReactNode;
  resultRenderer?: (data: unknown) => React.ReactNode;
}

export function MethodExecutor({
  title,
  description,
  loading,
  error,
  data,
  duration,
  onExecute,
  executeLabel = 'Execute',
  children,
  resultRenderer,
}: MethodExecutorProps) {
  const [viewMode, setViewMode] = useState<'rich' | 'json'>('rich');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {children}

        <div className="flex items-center gap-3">
          <Button onClick={onExecute} disabled={loading} size="sm">
            <Play className="size-3 mr-1" />
            {loading ? 'Running...' : executeLabel}
          </Button>
          {duration !== null && (
            <span className="text-xs text-muted-foreground">
              {duration.toFixed(0)}ms
            </span>
          )}
        </div>

        {loading && (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {data !== null && !loading && (
          <div className="space-y-2">
            {resultRenderer && (
              <div className="flex items-center gap-1 border-b pb-2">
                <button
                  onClick={() => setViewMode('rich')}
                  className={cn(
                    'text-xs px-2.5 py-1 rounded-md transition-colors',
                    viewMode === 'rich'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                  )}
                >
                  Result
                </button>
                <button
                  onClick={() => setViewMode('json')}
                  className={cn(
                    'text-xs px-2.5 py-1 rounded-md transition-colors',
                    viewMode === 'json'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted',
                  )}
                >
                  Raw JSON
                </button>
              </div>
            )}
            {viewMode === 'rich' && resultRenderer
              ? resultRenderer(data)
              : <JsonViewer data={data} />}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
