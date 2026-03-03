'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/header';
import { MethodExecutor } from '@/components/playground/method-executor';
import { useEmaiExecute } from '@/hooks/use-emai-execute';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const API = '/api/emai/attachments';

export default function AttachmentsPage() {
  const [emailId, setEmailId] = useState('');
  const [attachmentId, setAttachmentId] = useState('');
  const [depth, setDepth] = useState('medium');

  const listAttachments = useEmaiExecute(API, 'listFromEmail');
  const parse = useEmaiExecute(API, 'parse');
  const toText = useEmaiExecute(API, 'toText');

  return (
    <>
      <Header title="Attachments" />
      <div className="flex flex-1 flex-col gap-6 p-6 max-w-3xl">
        <MethodExecutor
          title="List Attachments"
          description="List attachments from an email"
          loading={listAttachments.loading}
          error={listAttachments.error}
          data={listAttachments.data}
          duration={listAttachments.duration}
          executeLabel="List"
          onExecute={() => listAttachments.execute({ emailId })}
        >
          <div>
            <Label>Email ID</Label>
            <Input value={emailId} onChange={(e) => setEmailId(e.target.value)} placeholder="Enter email ID" />
          </div>
        </MethodExecutor>

        <MethodExecutor
          title="attachments.parse()"
          description="Parse an attachment (PDF, image, Office doc, CSV)"
          loading={parse.loading}
          error={parse.error}
          data={parse.data}
          duration={parse.duration}
          executeLabel="Parse"
          onExecute={() =>
            parse.execute({
              emailId,
              attachmentId,
              options: { depth },
            })
          }
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Attachment ID</Label>
              <Input value={attachmentId} onChange={(e) => setAttachmentId(e.target.value)} placeholder="From list above" />
            </div>
            <div>
              <Label>Depth</Label>
              <Select value={depth} onValueChange={setDepth}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">Basic</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="deep">Deep</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </MethodExecutor>

        <MethodExecutor
          title="attachments.toText()"
          description="Extract text content from an attachment"
          loading={toText.loading}
          error={toText.error}
          data={toText.data}
          duration={toText.duration}
          executeLabel="Extract Text"
          onExecute={() =>
            toText.execute({ emailId, attachmentId })
          }
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Email ID</Label>
              <Input value={emailId} onChange={(e) => setEmailId(e.target.value)} placeholder="Email ID" />
            </div>
            <div>
              <Label>Attachment ID</Label>
              <Input value={attachmentId} onChange={(e) => setAttachmentId(e.target.value)} placeholder="Attachment ID" />
            </div>
          </div>
        </MethodExecutor>
      </div>
    </>
  );
}
