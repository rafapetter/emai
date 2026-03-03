'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Paperclip, Star, Copy, Check } from 'lucide-react';

interface EmailAddress {
  name?: string;
  address: string;
}

interface EmailData {
  id: string;
  from: EmailAddress;
  to: EmailAddress[];
  cc?: EmailAddress[];
  bcc?: EmailAddress[];
  subject: string;
  body: { text?: string; html?: string };
  date: string;
  isRead?: boolean;
  isStarred?: boolean;
  folder?: string;
  labels?: string[];
  attachments?: Array<{ filename: string; size?: number; contentType?: string }>;
}

function formatAddress(addr: EmailAddress): string {
  return addr.name ? `${addr.name} <${addr.address}>` : addr.address;
}

function formatAddressShort(addr: EmailAddress): string {
  return addr.name || addr.address;
}

function formatRelativeDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function AddressList({ label, addresses, max = 3 }: { label: string; addresses: EmailAddress[]; max?: number }) {
  if (!addresses || addresses.length === 0) return null;
  const shown = addresses.slice(0, max);
  const remaining = addresses.length - max;

  return (
    <div className="flex items-baseline gap-1.5 text-xs">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className="text-foreground truncate">
        {shown.map(formatAddress).join(', ')}
        {remaining > 0 && <span className="text-muted-foreground"> and {remaining} more</span>}
      </span>
    </div>
  );
}

export function EmailCard({ data }: { data: unknown }) {
  const email = data as EmailData;
  const [bodyTab, setBodyTab] = useState<'text' | 'html'>(email.body.html ? 'html' : 'text');
  const [idCopied, setIdCopied] = useState(false);

  const copyId = () => {
    navigator.clipboard.writeText(email.id);
    setIdCopied(true);
    setTimeout(() => setIdCopied(false), 2000);
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2 min-w-0">
          {email.isRead === false && (
            <span className="size-2 rounded-full bg-blue-500 shrink-0" />
          )}
          {email.isStarred && (
            <Star className="size-3.5 fill-yellow-400 text-yellow-400 shrink-0" />
          )}
          <span className="font-medium text-sm truncate">
            {formatAddressShort(email.from)}
          </span>
          <span className="text-xs text-muted-foreground truncate">
            &lt;{email.from.address}&gt;
          </span>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
              {formatRelativeDate(email.date)}
            </span>
          </TooltipTrigger>
          <TooltipContent>{new Date(email.date).toLocaleString()}</TooltipContent>
        </Tooltip>
      </div>

      {/* Subject + badges */}
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="font-semibold text-sm">{email.subject}</h3>
        {email.folder && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
            {email.folder}
          </Badge>
        )}
      </div>

      {/* Recipients */}
      <div className="space-y-0.5">
        <AddressList label="To" addresses={email.to} />
        {email.cc && email.cc.length > 0 && (
          <AddressList label="CC" addresses={email.cc} />
        )}
      </div>

      {/* Body */}
      <div className="border rounded-md">
        {email.body.html && email.body.text && (
          <div className="flex items-center gap-1 border-b px-3 py-1.5">
            <button
              onClick={() => setBodyTab('text')}
              className={`text-xs px-2 py-0.5 rounded ${bodyTab === 'text' ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'}`}
            >
              Text
            </button>
            <button
              onClick={() => setBodyTab('html')}
              className={`text-xs px-2 py-0.5 rounded ${bodyTab === 'html' ? 'bg-muted font-medium' : 'text-muted-foreground hover:text-foreground'}`}
            >
              HTML
            </button>
          </div>
        )}
        <div className="p-3 max-h-80 overflow-auto">
          {bodyTab === 'html' && email.body.html ? (
            <div
              className="prose prose-sm max-w-none text-sm"
              dangerouslySetInnerHTML={{ __html: email.body.html }}
            />
          ) : (
            <pre className="whitespace-pre-wrap text-sm text-foreground font-sans leading-relaxed">
              {email.body.text || '(no text content)'}
            </pre>
          )}
        </div>
      </div>

      {/* Attachments */}
      {email.attachments && email.attachments.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {email.attachments.map((att, i) => (
            <div
              key={i}
              className="flex items-center gap-1.5 text-xs bg-muted rounded-md px-2 py-1"
            >
              <Paperclip className="size-3 text-muted-foreground" />
              <span className="truncate max-w-40">{att.filename}</span>
              {att.size != null && (
                <span className="text-muted-foreground">({formatFileSize(att.size)})</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Labels */}
      {email.labels && email.labels.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {email.labels.map((label) => (
            <Badge key={label} variant="outline" className="text-[10px]">
              {label}
            </Badge>
          ))}
        </div>
      )}

      {/* ID footer */}
      <div className="flex items-center gap-2 pt-1 border-t">
        <code className="text-[11px] text-muted-foreground font-mono truncate">
          id: {email.id}
        </code>
        <button
          onClick={copyId}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {idCopied ? <Check className="size-3" /> : <Copy className="size-3" />}
        </button>
      </div>
    </div>
  );
}
