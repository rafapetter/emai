'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Circle, HelpCircle, Calendar, User, Flag, Clock, ChevronDown, ChevronRight, Mail } from 'lucide-react';
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
  type?: string;
}

interface ActionsResult {
  actions?: ActionItemData[];
  items?: ActionItemData[];
  email?: EmailRef;
}

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

const priorityColors: Record<string, string> = {
  high: 'bg-red-100 text-red-800 border-red-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-gray-100 text-gray-800 border-gray-200',
  critical: 'bg-red-200 text-red-900 border-red-300',
};

const statusColors: Record<string, string> = {
  done: 'bg-green-100 text-green-800 border-green-200',
  completed: 'bg-green-100 text-green-800 border-green-200',
  pending: 'bg-blue-100 text-blue-800 border-blue-200',
  unknown: 'bg-gray-100 text-gray-600 border-gray-200',
};

function StatusIcon({ status }: { status?: string }) {
  switch (status) {
    case 'done':
    case 'completed':
      return <CheckCircle2 className="size-4 text-green-500 shrink-0" />;
    case 'pending':
    case 'open':
      return <Circle className="size-4 text-blue-500 shrink-0" />;
    default:
      return <HelpCircle className="size-4 text-muted-foreground/50 shrink-0" />;
  }
}

function ActionItemCard({ item }: { item: ActionItemData }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = item.assignee || item.dueDate || item.type;

  return (
    <div className="rounded-md border overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left flex items-start gap-3 p-3 hover:bg-muted/30 transition-colors cursor-pointer"
      >
        <StatusIcon status={item.status} />
        <div className="flex-1 min-w-0">
          <p className="text-sm">{item.description}</p>
          {/* Quick inline tags */}
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            {item.priority && (
              <Badge
                className={`text-[10px] ${priorityColors[item.priority] || 'bg-gray-100 text-gray-800'}`}
                variant="outline"
              >
                <Flag className="size-2.5 mr-0.5" />
                {item.priority}
              </Badge>
            )}
            {item.status && (
              <Badge
                className={`text-[10px] ${statusColors[item.status] || 'bg-gray-100 text-gray-600'}`}
                variant="outline"
              >
                {item.status}
              </Badge>
            )}
            {item.assignee && (
              <Badge variant="secondary" className="text-[10px]">
                <User className="size-2.5 mr-0.5" />
                {item.assignee}
              </Badge>
            )}
            {item.dueDate && (
              <Badge variant="outline" className="text-[10px]">
                <Calendar className="size-2.5 mr-0.5" />
                {item.dueDate}
              </Badge>
            )}
          </div>
        </div>
        {hasDetails && (
          <span className="shrink-0 mt-1">
            {expanded ? <ChevronDown className="size-3.5 text-muted-foreground" /> : <ChevronRight className="size-3.5 text-muted-foreground" />}
          </span>
        )}
      </button>

      {expanded && hasDetails && (
        <div className="px-3 pb-3 border-t bg-muted/10">
          <div className="grid grid-cols-2 gap-3 pt-3">
            {item.assignee && (
              <div className="flex items-start gap-2">
                <User className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase">Assignee</p>
                  <p className="text-xs">{item.assignee}</p>
                </div>
              </div>
            )}
            {item.dueDate && (
              <div className="flex items-start gap-2">
                <Calendar className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase">Due Date</p>
                  <p className="text-xs">{item.dueDate}</p>
                </div>
              </div>
            )}
            {item.priority && (
              <div className="flex items-start gap-2">
                <Flag className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase">Priority</p>
                  <Badge className={`text-[10px] ${priorityColors[item.priority] || 'bg-gray-100 text-gray-800'}`} variant="outline">
                    {item.priority}
                  </Badge>
                </div>
              </div>
            )}
            {item.status && (
              <div className="flex items-start gap-2">
                <Clock className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase">Status</p>
                  <Badge className={`text-[10px] ${statusColors[item.status] || 'bg-gray-100 text-gray-600'}`} variant="outline">
                    {item.status}
                  </Badge>
                </div>
              </div>
            )}
            {item.type && (
              <div className="flex items-start gap-2">
                <Flag className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
                <div>
                  <p className="text-[10px] font-medium text-muted-foreground uppercase">Type</p>
                  <p className="text-xs">{item.type}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function ActionItemsListView({ data }: { data: unknown }) {
  // Handle multiple data shapes from the SDK
  let items: ActionItemData[] = [];
  let emailRef: EmailRef | undefined;

  if (Array.isArray(data)) {
    items = data;
  } else if (data && typeof data === 'object') {
    const result = data as ActionsResult;
    if (Array.isArray(result.actions)) {
      items = result.actions;
    } else if (Array.isArray(result.items)) {
      items = result.items;
    }
    if (result.email) {
      emailRef = result.email;
    }
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No action items detected.</p>;
  }

  // Count by status
  const pending = items.filter((i) => !i.status || i.status === 'pending' || i.status === 'open');
  const done = items.filter((i) => i.status === 'done' || i.status === 'completed');

  return (
    <div className="space-y-3">
      {/* Email reference */}
      {emailRef && <ExpandableEmailRef email={emailRef} />}

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span>{items.length} action item{items.length !== 1 ? 's' : ''}</span>
        {pending.length > 0 && <Badge variant="outline" className="text-[10px]">{pending.length} pending</Badge>}
        {done.length > 0 && <Badge variant="outline" className="text-[10px] bg-green-50">{done.length} done</Badge>}
      </div>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <ActionItemCard key={i} item={item} />
        ))}
      </div>
    </div>
  );
}
