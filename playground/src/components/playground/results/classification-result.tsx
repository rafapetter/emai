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

interface ClassificationData {
  email?: EmailRef;
  category: string;
  confidence: number;
  reasoning?: string;
  labels?: string[];
  sentiment?: string;
  isUrgent?: boolean;
  isActionRequired?: boolean;
}

const categoryColors: Record<string, string> = {
  primary: 'border-l-blue-500',
  social: 'border-l-purple-500',
  promotions: 'border-l-orange-500',
  updates: 'border-l-cyan-500',
  forums: 'border-l-indigo-500',
  spam: 'border-l-red-500',
  phishing: 'border-l-red-700',
  support: 'border-l-teal-500',
  sales: 'border-l-amber-500',
  billing: 'border-l-green-500',
  newsletter: 'border-l-violet-500',
  notification: 'border-l-sky-500',
  personal: 'border-l-emerald-500',
  work: 'border-l-blue-600',
  other: 'border-l-gray-400',
};

const categoryBadgeColors: Record<string, string> = {
  primary: 'bg-blue-100 text-blue-800',
  social: 'bg-purple-100 text-purple-800',
  promotions: 'bg-orange-100 text-orange-800',
  updates: 'bg-cyan-100 text-cyan-800',
  forums: 'bg-indigo-100 text-indigo-800',
  spam: 'bg-red-100 text-red-800',
  phishing: 'bg-red-200 text-red-900',
  support: 'bg-teal-100 text-teal-800',
  sales: 'bg-amber-100 text-amber-800',
  billing: 'bg-green-100 text-green-800',
  newsletter: 'bg-violet-100 text-violet-800',
  notification: 'bg-sky-100 text-sky-800',
  personal: 'bg-emerald-100 text-emerald-800',
  work: 'bg-blue-100 text-blue-800',
  other: 'bg-gray-100 text-gray-800',
};

const sentimentColors: Record<string, string> = {
  positive: 'bg-green-100 text-green-800',
  negative: 'bg-red-100 text-red-800',
  neutral: 'bg-gray-100 text-gray-800',
  mixed: 'bg-yellow-100 text-yellow-800',
};

function formatFrom(from: EmailRef['from']): string {
  if (typeof from === 'string') return from;
  return from.name || from.address;
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

function SingleClassification({ item }: { item: ClassificationData }) {
  const borderColor = categoryColors[item.category] || 'border-l-gray-400';
  const badgeColor = categoryBadgeColors[item.category] || 'bg-gray-100 text-gray-800';
  const confidencePercent = Math.round(item.confidence * 100);

  return (
    <div className={`border-l-4 ${borderColor} rounded-md border bg-card overflow-hidden`}>
      {item.email && <ExpandableEmailRef email={item.email} />}
      <div className="p-4 space-y-3">
        {/* Category + Confidence */}
        <div className="flex items-center justify-between gap-4">
          <Badge className={`${badgeColor} text-xs font-semibold`} variant="outline">
            {item.category}
          </Badge>
          <div className="flex items-center gap-2 flex-1 max-w-48">
            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${confidencePercent}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground w-10 text-right">{confidencePercent}%</span>
          </div>
        </div>

        {/* Indicators */}
        <div className="flex items-center gap-2 flex-wrap">
          {item.sentiment && (
            <Badge className={`text-[10px] ${sentimentColors[item.sentiment] || 'bg-gray-100 text-gray-800'}`} variant="outline">
              {item.sentiment}
            </Badge>
          )}
          {item.isUrgent && (
            <Badge className="text-[10px] bg-red-100 text-red-800" variant="outline">
              Urgent
            </Badge>
          )}
          {item.isActionRequired && (
            <Badge className="text-[10px] bg-orange-100 text-orange-800" variant="outline">
              Action Required
            </Badge>
          )}
        </div>

        {/* Labels */}
        {item.labels && item.labels.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap">
            {item.labels.map((label) => (
              <Badge key={label} variant="outline" className="text-[10px]">
                {label}
              </Badge>
            ))}
          </div>
        )}

        {/* Reasoning */}
        {item.reasoning && (
          <div className="border-l-2 border-muted-foreground/20 pl-3">
            <p className="text-sm text-muted-foreground italic">{item.reasoning}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function ClassificationResultView({ data }: { data: unknown }) {
  if (Array.isArray(data)) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">{data.length} classification{data.length !== 1 ? 's' : ''}</p>
        {data.map((item, i) => (
          <SingleClassification key={i} item={item as ClassificationData} />
        ))}
      </div>
    );
  }

  return <SingleClassification item={data as ClassificationData} />;
}
