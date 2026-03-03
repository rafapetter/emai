'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { EmailCard } from './email-card';

interface EmailAddress {
  name?: string;
  address: string;
}

interface SearchResultItem {
  email?: {
    id: string;
    from: EmailAddress;
    subject: string;
    date: string;
    body?: { text?: string; html?: string };
  };
  score: number;
  highlights?: string[];
  matchType?: string;
  // Some search results have these at the top level
  id?: string;
  content?: string;
  metadata?: Record<string, unknown>;
}

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function ScorePill({ score }: { score: number }) {
  const normalized = Math.min(Math.max(score, 0), 1);
  const percent = Math.round(normalized * 100);
  const opacity = 0.15 + normalized * 0.85;

  return (
    <span
      className="inline-flex items-center justify-center text-[10px] font-mono font-bold rounded px-1.5 py-0.5 min-w-10 text-center"
      style={{
        backgroundColor: `rgba(59, 130, 246, ${opacity * 0.2})`,
        color: `rgba(29, 78, 216, ${0.5 + normalized * 0.5})`,
      }}
    >
      {percent}%
    </span>
  );
}

const matchTypeColors: Record<string, string> = {
  semantic: 'bg-purple-100 text-purple-800',
  fulltext: 'bg-blue-100 text-blue-800',
  hybrid: 'bg-cyan-100 text-cyan-800',
};

export function SearchResultListView({ data }: { data: unknown }) {
  const results: SearchResultItem[] = Array.isArray(data) ? data : [];
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  if (results.length === 0) {
    return <p className="text-sm text-muted-foreground">No results found.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{results.length} result{results.length !== 1 ? 's' : ''}</p>

      <div className="border rounded-md divide-y">
        {results.map((result, i) => (
          <div key={i}>
            <button
              onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
              className={`w-full text-left p-3 hover:bg-muted/50 transition-colors ${expandedIndex === i ? 'bg-muted/30' : ''}`}
            >
              <div className="flex items-center gap-3">
                <ScorePill score={result.score} />
                {result.matchType && (
                  <Badge className={`text-[10px] ${matchTypeColors[result.matchType] || 'bg-gray-100 text-gray-800'}`} variant="outline">
                    {result.matchType}
                  </Badge>
                )}
                {result.email ? (
                  <>
                    <span className="text-sm font-medium truncate w-36 shrink-0">
                      {result.email.from.name || result.email.from.address}
                    </span>
                    <span className="text-sm truncate flex-1">{result.email.subject}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                      {formatShortDate(result.email.date)}
                    </span>
                  </>
                ) : (
                  <span className="text-sm truncate flex-1 text-muted-foreground">
                    {result.content ? result.content.slice(0, 100) : `ID: ${result.id || 'unknown'}`}
                  </span>
                )}
              </div>

              {/* Highlights */}
              {result.highlights && result.highlights.length > 0 && (
                <div className="mt-1.5 ml-12">
                  {result.highlights.slice(0, 2).map((h, j) => (
                    <p
                      key={j}
                      className="text-xs text-muted-foreground truncate"
                      dangerouslySetInnerHTML={{
                        __html: h.replace(/<mark>/g, '<mark class="bg-yellow-200 rounded px-0.5">'),
                      }}
                    />
                  ))}
                </div>
              )}
            </button>

            {expandedIndex === i && result.email && (
              <div className="px-4 py-3 bg-muted/20 border-t">
                <EmailCard data={result.email} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
