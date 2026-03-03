'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Mail, ChevronDown, ChevronRight } from 'lucide-react';
import { EmailCard } from './email-card';

interface EmailRef {
  id: string;
  subject: string;
  from: { name?: string; address: string } | string;
  date: string;
  body?: { text?: string; html?: string };
  to?: Array<{ name?: string; address: string }>;
  attachments?: Array<{ filename: string; size?: number; contentType?: string }>;
  labels?: string[];
  isRead?: boolean;
  isStarred?: boolean;
}

interface PriorityData {
  email?: EmailRef;
  score: number;
  level: string;
  reasoning?: string;
  suggestedResponseTime?: string;
}

const levelColors: Record<string, { badge: string; ring: string }> = {
  critical: { badge: 'bg-red-100 text-red-800', ring: '#ef4444' },
  high: { badge: 'bg-orange-100 text-orange-800', ring: '#f97316' },
  medium: { badge: 'bg-yellow-100 text-yellow-800', ring: '#eab308' },
  low: { badge: 'bg-green-100 text-green-800', ring: '#22c55e' },
  none: { badge: 'bg-gray-100 text-gray-800', ring: '#9ca3af' },
};

function formatFrom(from: EmailRef['from']): string {
  if (typeof from === 'string') return from;
  return from.name || from.address;
}

function ScoreRing({ score, color }: { score: number; color: string }) {
  const safeScore = Number.isFinite(score) ? score : 0;
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (safeScore / 100) * circumference;

  return (
    <div className="relative size-24">
      <svg className="size-24 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="currentColor" strokeWidth="8" className="text-muted" />
        <circle
          cx="50" cy="50" r={radius} fill="none"
          stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xl font-bold">{safeScore}</span>
      </div>
    </div>
  );
}

function ExpandableEmailRef({ email }: { email: EmailRef }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 pt-3 pb-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      >
        {expanded ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />}
        <Mail className="size-3 shrink-0" />
        <span className="font-medium truncate">{email.subject}</span>
        <span className="shrink-0">— {formatFrom(email.from)}</span>
      </button>
      {expanded && (
        <div className="px-4 pb-3 pt-1">
          <EmailCard data={email} />
        </div>
      )}
    </div>
  );
}

function SinglePriority({ item }: { item: PriorityData }) {
  const colors = levelColors[item.level] || levelColors.none;

  return (
    <div className="border rounded-md overflow-hidden">
      {item.email && <ExpandableEmailRef email={item.email} />}
      <div className="flex items-start gap-5 p-4">
        <ScoreRing score={item.score} color={colors.ring} />
        <div className="flex-1 space-y-2 pt-1">
          <Badge className={`${colors.badge} text-xs font-semibold`} variant="outline">
            {item.level}
          </Badge>
          {item.suggestedResponseTime && (
            <p className="text-sm font-medium">
              Respond within: <span className="text-foreground">{item.suggestedResponseTime}</span>
            </p>
          )}
          {item.reasoning && (
            <div className="border-l-2 border-muted-foreground/20 pl-3">
              <p className="text-sm text-muted-foreground italic">{item.reasoning}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function PriorityResultView({ data }: { data: unknown }) {
  if (Array.isArray(data)) {
    return (
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">{data.length} prioritization{data.length !== 1 ? 's' : ''}</p>
        {(data as PriorityData[])
          .sort((a, b) => (Number.isFinite(b.score) ? b.score : 0) - (Number.isFinite(a.score) ? a.score : 0))
          .map((item, i) => (
            <SinglePriority key={i} item={item} />
          ))}
      </div>
    );
  }

  return <SinglePriority item={data as PriorityData} />;
}
