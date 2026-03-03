'use client';

import { useState } from 'react';
import { Copy, Check, Mail, ChevronDown, ChevronRight } from 'lucide-react';
import { EmailCard } from './email-card';

interface EmailRef {
  subject: string;
  from: { name?: string; address: string } | string;
  id?: string;
  date?: string;
  body?: { text?: string; html?: string };
  to?: Array<{ name?: string; address: string }>;
  attachments?: Array<{ filename: string; size?: number; contentType?: string }>;
  labels?: string[];
  isRead?: boolean;
  isStarred?: boolean;
}

interface ComposeData {
  subject?: string;
  text?: string;
  html?: string;
}

function formatFrom(from: EmailRef['from']): string {
  if (typeof from === 'string') return from;
  return from.name || from.address;
}

function ExpandableEmailRef({ email }: { email: EmailRef }) {
  const [expanded, setExpanded] = useState(false);

  // Only show expand if we have enough data for the full card
  const hasDetailData = email.id && email.date;

  return (
    <div className="bg-muted/30 rounded-md border mb-3">
      <button
        onClick={() => hasDetailData && setExpanded(!expanded)}
        className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground ${hasDetailData ? 'hover:text-foreground cursor-pointer' : ''} transition-colors`}
      >
        {hasDetailData && (
          expanded ? <ChevronDown className="size-3 shrink-0" /> : <ChevronRight className="size-3 shrink-0" />
        )}
        <Mail className="size-3 shrink-0" />
        <span>Replying to:</span>
        <span className="font-medium truncate">{email.subject}</span>
        <span className="shrink-0">— {formatFrom(email.from)}</span>
      </button>
      {expanded && hasDetailData && (
        <div className="px-3 pb-3 pt-1 border-t">
          <EmailCard data={email} />
        </div>
      )}
    </div>
  );
}

export function ComposeResultView({
  data,
  contextEmail,
}: {
  data: unknown;
  contextEmail?: EmailRef | null;
}) {
  const result = data as ComposeData;
  const hasHtml = !!result.html;
  const hasText = !!result.text;
  const [tab, setTab] = useState<'preview' | 'text' | 'html'>(hasHtml ? 'preview' : 'text');
  const [copied, setCopied] = useState(false);

  const copyContent = () => {
    const content = tab === 'html' ? result.html : result.text;
    if (content) {
      navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-3">
      {/* Context email reference */}
      {contextEmail && <ExpandableEmailRef email={contextEmail} />}

      {/* Subject */}
      {result.subject && (
        <div>
          <span className="text-xs text-muted-foreground">Subject:</span>
          <h3 className="font-semibold text-sm">{result.subject}</h3>
        </div>
      )}

      {/* Tabs */}
      <div className="border rounded-md">
        <div className="flex items-center justify-between border-b px-3 py-1.5">
          <div className="flex items-center gap-1">
            {hasHtml && (
              <button
                onClick={() => setTab('preview')}
                className={`text-xs px-2 py-0.5 rounded ${tab === 'preview' ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Preview
              </button>
            )}
            {hasText && (
              <button
                onClick={() => setTab('text')}
                className={`text-xs px-2 py-0.5 rounded ${tab === 'text' ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              >
                Text
              </button>
            )}
            {hasHtml && (
              <button
                onClick={() => setTab('html')}
                className={`text-xs px-2 py-0.5 rounded ${tab === 'html' ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'}`}
              >
                HTML Source
              </button>
            )}
          </div>
          <button
            onClick={copyContent}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <div className="p-4 max-h-96 overflow-auto">
          {tab === 'preview' && result.html ? (
            <div
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: result.html }}
            />
          ) : tab === 'html' && result.html ? (
            <pre className="text-xs font-mono whitespace-pre-wrap text-muted-foreground">{result.html}</pre>
          ) : (
            <pre className="whitespace-pre-wrap text-sm font-sans leading-relaxed">
              {result.text || '(no content)'}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
