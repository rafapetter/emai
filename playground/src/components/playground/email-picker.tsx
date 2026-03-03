'use client';

import { useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { RefreshCw } from 'lucide-react';

interface EmailSummary {
  id: string;
  subject: string;
  from: { address: string; name?: string };
  date: string;
}

interface EmailPickerProps {
  label?: string;
  value: string;
  onChange: (id: string) => void;
  onEmailsLoaded?: (emails: EmailSummary[]) => void;
}

export function EmailPicker({
  label = 'Select Email',
  value,
  onChange,
  onEmailsLoaded,
}: EmailPickerProps) {
  const [emails, setEmails] = useState<EmailSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchEmails = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/emai/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list', options: { limit: 25 } }),
      });
      const data = await res.json();
      if (data.success && data.data?.items) {
        setEmails(data.data.items);
        onEmailsLoaded?.(data.data.items);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [onEmailsLoaded]);

  useEffect(() => {
    fetchEmails();
  }, [fetchEmails]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Label>{label}</Label>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={fetchEmails}
          disabled={loading}
        >
          <RefreshCw className={`size-3 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={loading ? 'Loading...' : 'Choose an email'} />
        </SelectTrigger>
        <SelectContent>
          {emails.map((email) => (
            <SelectItem key={email.id} value={email.id}>
              <span className="truncate">
                {email.from?.name || email.from?.address} — {email.subject}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
