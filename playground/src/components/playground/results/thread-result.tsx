'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { MessageSquare, ChevronDown, ChevronRight } from 'lucide-react';
import { EmailCard } from './email-card';

interface EmailAddress {
  name?: string;
  address: string;
}

interface ThreadEmail {
  id: string;
  from: EmailAddress;
  subject: string;
  date: string;
  body?: { text?: string; html?: string };
}

interface ThreadData {
  id?: string;
  subject: string;
  participants?: EmailAddress[];
  emails?: ThreadEmail[];
  messages?: ThreadEmail[];
  messageCount?: number;
  dates?: { first?: string; last?: string };
  labels?: string[];
}

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function getInitials(addr: EmailAddress): string {
  if (addr.name) {
    return addr.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  }
  return addr.address[0].toUpperCase();
}

function ParticipantCircles({ participants }: { participants: EmailAddress[] }) {
  const shown = participants.slice(0, 5);
  const remaining = participants.length - 5;

  return (
    <div className="flex items-center -space-x-1.5">
      {shown.map((p, i) => (
        <div
          key={i}
          className="size-7 rounded-full bg-muted border-2 border-background flex items-center justify-center"
          title={p.name || p.address}
        >
          <span className="text-[9px] font-semibold text-muted-foreground">{getInitials(p)}</span>
        </div>
      ))}
      {remaining > 0 && (
        <div className="size-7 rounded-full bg-muted border-2 border-background flex items-center justify-center">
          <span className="text-[9px] font-semibold text-muted-foreground">+{remaining}</span>
        </div>
      )}
    </div>
  );
}

function SingleThread({ thread }: { thread: ThreadData }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const emails = thread.emails || thread.messages || [];

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h3 className="font-semibold text-sm">{thread.subject}</h3>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <MessageSquare className="size-3" />
              {thread.messageCount || emails.length} messages
            </span>
            {thread.dates?.first && thread.dates?.last && (
              <span>{formatShortDate(thread.dates.first)} — {formatShortDate(thread.dates.last)}</span>
            )}
          </div>
        </div>
        {thread.participants && thread.participants.length > 0 && (
          <ParticipantCircles participants={thread.participants} />
        )}
      </div>

      {/* Labels */}
      {thread.labels && thread.labels.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap">
          {thread.labels.map((label) => (
            <Badge key={label} variant="outline" className="text-[10px]">{label}</Badge>
          ))}
        </div>
      )}

      {/* Email timeline */}
      {emails.length > 0 && (
        <div className="border rounded-md divide-y">
          {emails.map((email) => (
            <div key={email.id}>
              <button
                onClick={() => setExpandedId(expandedId === email.id ? null : email.id)}
                className={`w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 transition-colors ${expandedId === email.id ? 'bg-muted/30' : ''}`}
              >
                {expandedId === email.id ? (
                  <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                )}
                <span className="text-sm font-medium w-36 truncate shrink-0">
                  {email.from.name || email.from.address}
                </span>
                <span className="text-sm text-muted-foreground truncate flex-1">
                  {email.body?.text?.slice(0, 100) || email.subject}
                </span>
                <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                  {formatShortDate(email.date)}
                </span>
              </button>

              {expandedId === email.id && (
                <div className="px-4 py-3 bg-muted/20 border-t">
                  <EmailCard data={email} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ID footer */}
      {thread.id && (
        <code className="text-[11px] text-muted-foreground font-mono block">
          thread id: {thread.id}
        </code>
      )}
    </div>
  );
}

export function ThreadResultView({ data }: { data: unknown }) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  // Handle array of threads (detect) vs single thread (get)
  if (Array.isArray(data)) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">{data.length} thread{data.length !== 1 ? 's' : ''} detected</p>
        <div className="space-y-2">
          {(data as ThreadData[]).map((thread, i) => (
            <div key={i} className="border rounded-md">
              <button
                onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
                className={`w-full text-left p-3 hover:bg-muted/50 transition-colors ${expandedIndex === i ? 'bg-muted/30' : ''}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {expandedIndex === i ? (
                      <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="font-medium text-sm truncate">{thread.subject}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary" className="text-[10px]">
                      {thread.messageCount || (thread.emails || thread.messages || []).length} msgs
                    </Badge>
                    {thread.participants && (
                      <span className="text-xs text-muted-foreground">
                        {thread.participants.length} participants
                      </span>
                    )}
                  </div>
                </div>
              </button>
              {expandedIndex === i && (
                <div className="px-4 py-3 border-t">
                  <SingleThread thread={thread} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return <SingleThread thread={data as ThreadData} />;
}
