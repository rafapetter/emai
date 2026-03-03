'use client';

import { useState, useMemo } from 'react';
import { Star, Paperclip } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { EmailCard } from './email-card';

interface EmailAddress {
  name?: string;
  address: string;
}

interface EmailData {
  id: string;
  from: EmailAddress;
  subject: string;
  date: string;
  isRead?: boolean;
  isStarred?: boolean;
  snippet?: string;
  body?: { text?: string };
  attachments?: Array<{ filename: string; size?: number; contentType?: string }>;
}

interface ListResultData {
  items: EmailData[];
  total?: number;
  hasMore?: boolean;
  nextCursor?: string;
}

export interface AiResultSummary {
  category?: string;
  isUrgent?: boolean;
  isActionRequired?: boolean;
  priorityLevel?: string;
  priorityScore?: number;
}

type FilterKey = 'all' | 'unread' | 'urgent' | 'actionRequired' | 'highPriority' | 'attachments';

const categoryDotColors: Record<string, string> = {
  primary: 'bg-blue-500',
  social: 'bg-purple-500',
  promotions: 'bg-orange-500',
  updates: 'bg-cyan-500',
  forums: 'bg-indigo-500',
  spam: 'bg-red-500',
  phishing: 'bg-red-700',
  support: 'bg-teal-500',
  sales: 'bg-amber-500',
  billing: 'bg-green-500',
  newsletter: 'bg-violet-500',
  notification: 'bg-sky-500',
  personal: 'bg-emerald-500',
  work: 'bg-blue-600',
};

const priorityDotColors: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-green-500',
};

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diffDays < 7) {
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function senderInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function senderColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const colors = [
    'bg-blue-500', 'bg-purple-500', 'bg-teal-500', 'bg-rose-500',
    'bg-amber-500', 'bg-indigo-500', 'bg-emerald-500', 'bg-cyan-500',
    'bg-pink-500', 'bg-sky-500', 'bg-lime-500', 'bg-fuchsia-500',
  ];
  return colors[Math.abs(hash) % colors.length];
}

function AiIndicators({ ai }: { ai: AiResultSummary }) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      {ai.category && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`block size-2 rounded-full ${categoryDotColors[ai.category] ?? 'bg-gray-400'}`} />
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Category: {ai.category}
          </TooltipContent>
        </Tooltip>
      )}
      {ai.priorityLevel && (ai.priorityLevel === 'critical' || ai.priorityLevel === 'high' || ai.priorityLevel === 'medium') && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`block size-2 rounded-sm ${priorityDotColors[ai.priorityLevel] ?? 'bg-gray-400'}`} />
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Priority: {ai.priorityLevel} ({ai.priorityScore ?? '?'}/100)
          </TooltipContent>
        </Tooltip>
      )}
      {ai.isUrgent && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="block size-2 rounded-full bg-red-500 ring-1 ring-red-300" />
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Urgent
          </TooltipContent>
        </Tooltip>
      )}
      {ai.isActionRequired && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="block size-2 rounded-full bg-orange-500 ring-1 ring-orange-300" />
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Action Required
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

export function EmailListResult({
  data,
  aiResults,
}: {
  data: unknown;
  aiResults?: Record<string, AiResultSummary>;
}) {
  const result = data as ListResultData;
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>('all');

  // Sort by date descending (newest first)
  const sortedItems = useMemo(() => {
    return [...result.items].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [result.items]);

  const counts = useMemo(() => {
    const items = sortedItems;
    return {
      all: items.length,
      unread: items.filter((e) => e.isRead === false).length,
      urgent: items.filter((e) => aiResults?.[e.id]?.isUrgent).length,
      actionRequired: items.filter((e) => aiResults?.[e.id]?.isActionRequired).length,
      highPriority: items.filter((e) => {
        const level = aiResults?.[e.id]?.priorityLevel;
        return level === 'critical' || level === 'high';
      }).length,
      attachments: items.filter((e) => (e.attachments?.length ?? 0) > 0).length,
    };
  }, [sortedItems, aiResults]);

  const filteredItems = useMemo(() => {
    const items = sortedItems;
    switch (filter) {
      case 'unread':
        return items.filter((e) => e.isRead === false);
      case 'urgent':
        return items.filter((e) => aiResults?.[e.id]?.isUrgent);
      case 'actionRequired':
        return items.filter((e) => aiResults?.[e.id]?.isActionRequired);
      case 'highPriority':
        return items.filter((e) => {
          const level = aiResults?.[e.id]?.priorityLevel;
          return level === 'critical' || level === 'high';
        });
      case 'attachments':
        return items.filter((e) => (e.attachments?.length ?? 0) > 0);
      default:
        return items;
    }
  }, [sortedItems, aiResults, filter]);

  const hasAiResults = aiResults && Object.keys(aiResults).length > 0;

  const filters: Array<{ key: FilterKey; label: string; count: number; needsAi?: boolean }> = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'unread', label: 'Unread', count: counts.unread },
    { key: 'urgent', label: 'Urgent', count: counts.urgent, needsAi: true },
    { key: 'actionRequired', label: 'Action Required', count: counts.actionRequired, needsAi: true },
    { key: 'highPriority', label: 'High Priority', count: counts.highPriority, needsAi: true },
    { key: 'attachments', label: 'Attachments', count: counts.attachments },
  ];

  return (
    <TooltipProvider delayDuration={200}>
      <div className="space-y-2">
        {/* Header */}
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <span>
            {filteredItems.length} email{filteredItems.length !== 1 ? 's' : ''}
            {filter !== 'all' ? ` (filtered)` : ''}
            {result.total != null ? ` of ${result.total}` : ''}
          </span>
          <div className="flex items-center gap-3">
            {result.hasMore != null && (
              <span>Has more: {result.hasMore ? 'yes' : 'no'}</span>
            )}
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {filters.map((f) => {
            if (f.needsAi && !hasAiResults) return null;
            if (f.key !== 'all' && f.count === 0) return null;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  filter === f.key
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-muted-foreground border-border hover:bg-muted'
                }`}
              >
                {f.label}
                {f.count > 0 && (
                  <span className="ml-1 opacity-70">({f.count})</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Email list */}
        <div className="border rounded-md divide-y">
          {filteredItems.length === 0 ? (
            <div className="py-6 text-center text-sm text-muted-foreground">
              No emails match this filter.
            </div>
          ) : (
            filteredItems.map((email) => {
              const ai = aiResults?.[email.id];
              const senderName = email.from.name || email.from.address.split('@')[0];
              const isUnread = email.isRead === false;
              const hasAttachments = (email.attachments?.length ?? 0) > 0;

              return (
                <div key={email.id}>
                  <button
                    onClick={() => setExpandedId(expandedId === email.id ? null : email.id)}
                    className={`w-full text-left flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors ${
                      expandedId === email.id ? 'bg-muted/30' : ''
                    }`}
                  >
                    {/* AI indicators */}
                    <div className="w-8 shrink-0 flex justify-center">
                      {ai ? (
                        <AiIndicators ai={ai} />
                      ) : (
                        <span className="w-2">
                          {isUnread && (
                            <span className="block size-2 rounded-full bg-blue-500" />
                          )}
                        </span>
                      )}
                    </div>

                    {/* Sender avatar */}
                    <div className={`size-8 rounded-full ${senderColor(senderName)} flex items-center justify-center shrink-0`}>
                      <span className="text-[10px] font-bold text-white leading-none">
                        {senderInitials(senderName)}
                      </span>
                    </div>

                    {/* Star */}
                    <span className="w-4 shrink-0">
                      {email.isStarred && (
                        <Star className="size-3.5 fill-yellow-400 text-yellow-400" />
                      )}
                    </span>

                    {/* From */}
                    <span className={`w-36 shrink-0 truncate text-sm ${isUnread ? 'font-semibold' : 'font-medium text-muted-foreground'}`}>
                      {senderName}
                    </span>

                    {/* Subject + snippet */}
                    <span className="flex-1 min-w-0 truncate text-sm">
                      <span className={isUnread ? 'font-medium' : ''}>{email.subject}</span>
                      {email.snippet && (
                        <span className="text-muted-foreground"> — {email.snippet}</span>
                      )}
                    </span>

                    {/* Attachment icon */}
                    {hasAttachments && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="shrink-0">
                            <Paperclip className="size-3.5 text-muted-foreground" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="text-xs">
                          {email.attachments!.length} attachment{email.attachments!.length !== 1 ? 's' : ''}
                        </TooltipContent>
                      </Tooltip>
                    )}

                    {/* Date */}
                    <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                      {formatShortDate(email.date)}
                    </span>
                  </button>

                  {/* Expanded detail */}
                  {expandedId === email.id && (
                    <div className="px-4 py-3 bg-muted/20 border-t">
                      {/* AI summary badges */}
                      {ai && (
                        <div className="flex items-center gap-1.5 flex-wrap mb-3">
                          {ai.category && (
                            <Badge variant="outline" className="text-[10px]">{ai.category}</Badge>
                          )}
                          {ai.priorityLevel && (
                            <Badge variant="outline" className="text-[10px]">
                              Priority: {ai.priorityLevel}
                              {ai.priorityScore != null ? ` (${ai.priorityScore})` : ''}
                            </Badge>
                          )}
                          {ai.isUrgent && (
                            <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200">
                              Urgent
                            </Badge>
                          )}
                          {ai.isActionRequired && (
                            <Badge variant="outline" className="text-[10px] bg-orange-50 text-orange-700 border-orange-200">
                              Action Required
                            </Badge>
                          )}
                        </div>
                      )}
                      <EmailCard data={email} />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}
