'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, RotateCcw } from 'lucide-react';

export type Phase = 'idle' | 'fetching' | 'analyzing' | 'indexing' | 'searching' | 'complete';

interface TestState {
  data: unknown;
  error: string | null;
  loading: boolean;
  duration: number | null;
}

interface SummaryBarProps {
  phase: Phase;
  tests: TestState[];
  isRunning: boolean;
  onRun: () => void;
  onReset: () => void;
}

const phaseLabels: Record<Phase, string> = {
  idle: 'Ready to run',
  fetching: 'Fetching emails...',
  analyzing: 'Running AI analysis...',
  indexing: 'Indexing for search...',
  searching: 'Running search queries...',
  complete: 'Complete',
};

const phaseProgress: Record<Phase, number> = {
  idle: 0,
  fetching: 15,
  analyzing: 50,
  indexing: 75,
  searching: 90,
  complete: 100,
};

export function SummaryBar({ phase, tests, isRunning, onRun, onReset }: SummaryBarProps) {
  const passed = tests.filter((t) => t.data !== null && !t.error).length;
  const failed = tests.filter((t) => t.error !== null).length;
  const totalDuration = tests.reduce((sum, t) => sum + (t.duration ?? 0), 0);
  const progress = phaseProgress[phase];

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">{phaseLabels[phase]}</span>
              {passed > 0 && (
                <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">
                  {passed} passed
                </Badge>
              )}
              {failed > 0 && (
                <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200">
                  {failed} failed
                </Badge>
              )}
              {totalDuration > 0 && (
                <span className="text-xs text-muted-foreground">
                  {(totalDuration / 1000).toFixed(1)}s total
                </span>
              )}
            </div>
            {/* Progress bar */}
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button onClick={onRun} disabled={isRunning} size="sm">
              <Play className="size-3 mr-1.5" />
              {isRunning ? 'Running...' : 'Run All Tests'}
            </Button>
            <Button onClick={onReset} variant="outline" size="sm" disabled={isRunning}>
              <RotateCcw className="size-3 mr-1.5" />
              Reset
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
