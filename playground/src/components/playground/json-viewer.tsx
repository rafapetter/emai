'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Check, Copy, ChevronDown, ChevronRight } from 'lucide-react';

function syntaxHighlight(json: string): string {
  return json.replace(
    /("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'text-orange-600'; // number
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'text-blue-600'; // key
        } else {
          cls = 'text-green-600'; // string
        }
      } else if (/true|false/.test(match)) {
        cls = 'text-purple-600'; // boolean
      } else if (/null/.test(match)) {
        cls = 'text-gray-400'; // null
      }
      return `<span class="${cls}">${match}</span>`;
    },
  );
}

export function JsonViewer({
  data,
  maxHeight = '500px',
}: {
  data: unknown;
  maxHeight?: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(data, null, 2);

  async function handleCopy() {
    await navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-md border bg-muted/30">
      <div className="flex items-center justify-between px-3 py-2 border-b">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {collapsed ? (
            <ChevronRight className="size-3" />
          ) : (
            <ChevronDown className="size-3" />
          )}
          Response
        </button>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs"
          onClick={handleCopy}
        >
          {copied ? (
            <Check className="size-3 mr-1" />
          ) : (
            <Copy className="size-3 mr-1" />
          )}
          {copied ? 'Copied' : 'Copy'}
        </Button>
      </div>
      {!collapsed && (
        <pre
          className="p-3 text-xs overflow-auto font-mono"
          style={{ maxHeight }}
          dangerouslySetInnerHTML={{ __html: syntaxHighlight(json) }}
        />
      )}
    </div>
  );
}
