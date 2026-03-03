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

interface ActionItemData {
  description: string;
  assignee?: string;
  dueDate?: string;
  priority?: string;
  status?: string;
}

interface SummaryData {
  summary: string;
  keyPoints?: string[];
  participants?: Array<{ name?: string; address: string }>;
  actionItems?: ActionItemData[];
  sentiment?: string;
  topicTags?: string[];
  email?: EmailRef;
}

const sentimentColors: Record<string, string> = {
  positive: 'bg-green-100 text-green-800',
  negative: 'bg-red-100 text-red-800',
  neutral: 'bg-gray-100 text-gray-800',
  mixed: 'bg-yellow-100 text-yellow-800',
};

const priorityColors: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-yellow-500',
  low: 'bg-gray-400',
};

function formatFrom(from: EmailRef['from']): string {
  if (typeof from === 'string') return from;
  return from.name || from.address;
}

function ExpandableEmailRef({ email }: { email: EmailRef }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border rounded-md overflow-hidden mb-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer hover:bg-muted/30"
      >
        {expanded ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />}
        <Mail className="size-3 shrink-0" />
        <span className="font-medium truncate">{email.subject}</span>
        <span className="shrink-0">— {formatFrom(email.from)}</span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t">
          <EmailCard data={email} />
        </div>
      )}
    </div>
  );
}

export function SummaryResultView({ data }: { data: unknown }) {
  const result = data as SummaryData;

  return (
    <div className="space-y-4">
      {/* Email reference */}
      {result.email && <ExpandableEmailRef email={result.email} />}

      {/* Summary */}
      <div>
        <p className="text-sm leading-relaxed">{result.summary}</p>
      </div>

      {/* Key Points */}
      {result.keyPoints && result.keyPoints.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Key Points</h4>
          <ul className="list-disc pl-4 space-y-1">
            {result.keyPoints.map((point, i) => (
              <li key={i} className="text-sm">{point}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Action Items */}
      {result.actionItems && result.actionItems.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Action Items</h4>
          <div className="space-y-2">
            {result.actionItems.map((item, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className={`mt-1.5 size-2 rounded-full shrink-0 ${priorityColors[item.priority || 'low'] || 'bg-gray-400'}`} />
                <div className="flex-1 min-w-0">
                  <p>{item.description}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {item.assignee && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{item.assignee}</Badge>
                    )}
                    {item.dueDate && (
                      <span className="text-xs text-muted-foreground">Due: {item.dueDate}</span>
                    )}
                    {item.status && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">{item.status}</Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom row: Participants, Sentiment, Tags */}
      <div className="flex items-start gap-6 flex-wrap pt-2 border-t">
        {result.participants && result.participants.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Participants</h4>
            <p className="text-xs text-foreground">
              {result.participants.map((p) => p.name || p.address).join(', ')}
            </p>
          </div>
        )}

        {result.sentiment && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Sentiment</h4>
            <Badge className={`text-[10px] ${sentimentColors[result.sentiment] || 'bg-gray-100 text-gray-800'}`} variant="outline">
              {result.sentiment}
            </Badge>
          </div>
        )}

        {result.topicTags && result.topicTags.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Topics</h4>
            <div className="flex items-center gap-1 flex-wrap">
              {result.topicTags.map((tag) => (
                <Badge key={tag} variant="outline" className="text-[10px]">
                  #{tag}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
