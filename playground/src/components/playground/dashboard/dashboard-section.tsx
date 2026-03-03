'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronDown, ChevronRight, Loader2, Info, CheckCircle2 } from 'lucide-react';
import { ErrorDetail } from './error-detail';

export type SectionStatus = 'idle' | 'running' | 'passed' | 'failed';

interface DashboardSectionProps {
  title: string;
  description?: string;
  status: SectionStatus;
  duration?: number | null;
  error?: string | null;
  expectation?: string;
  passCriteria?: string;
  children: React.ReactNode;
}

function StatusDot({ status }: { status: SectionStatus }) {
  switch (status) {
    case 'running':
      return <Loader2 className="size-3.5 text-blue-500 animate-spin" />;
    case 'passed':
      return <span className="size-2.5 rounded-full bg-green-500 inline-block" />;
    case 'failed':
      return <span className="size-2.5 rounded-full bg-red-500 inline-block" />;
    default:
      return <span className="size-2.5 rounded-full bg-gray-300 inline-block" />;
  }
}

export function DashboardSection({
  title,
  description,
  status,
  duration,
  error,
  expectation,
  passCriteria,
  children,
}: DashboardSectionProps) {
  const [open, setOpen] = useState(true);

  return (
    <Card>
      <CardHeader className="cursor-pointer select-none" onClick={() => setOpen(!open)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {open ? (
              <ChevronDown className="size-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-4 text-muted-foreground" />
            )}
            <StatusDot status={status} />
            <CardTitle className="text-sm">{title}</CardTitle>
            {description && (
              <span className="text-xs text-muted-foreground hidden sm:inline">{description}</span>
            )}
          </div>
          {duration != null && (
            <span className="text-xs text-muted-foreground">{duration.toFixed(0)}ms</span>
          )}
        </div>
      </CardHeader>
      {open && (
        <CardContent>
          {(status === 'idle' || status === 'running') && expectation && (
            <div className="flex items-start gap-2 p-3 rounded-md bg-blue-50 border border-blue-100 mb-3 text-sm">
              <Info className="size-4 text-blue-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-blue-800">{expectation}</p>
                {passCriteria && (
                  <p className="text-blue-600 text-xs mt-1">Pass criteria: {passCriteria}</p>
                )}
              </div>
            </div>
          )}
          {status === 'passed' && passCriteria && (
            <div className="flex items-center gap-2 text-xs text-green-600 mb-2">
              <CheckCircle2 className="size-3.5" />
              <span>{passCriteria}</span>
            </div>
          )}
          {status === 'running' && (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          )}
          {error && <ErrorDetail error={error} />}
          {status !== 'running' && children}
        </CardContent>
      )}
    </Card>
  );
}
