'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/header';
import { MethodExecutor } from '@/components/playground/method-executor';
import { EmailPicker } from '@/components/playground/email-picker';
import { useEmaiExecute } from '@/hooks/use-emai-execute';
import { ActionItemsListView } from '@/components/playground/results/action-items-list';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const API = '/api/emai/ai';

export default function ActionsPage() {
  const [emailId, setEmailId] = useState('');
  const detectActions = useEmaiExecute(API, 'detectActions');

  const [threadId, setThreadId] = useState('');
  const detectActionsInThread = useEmaiExecute(API, 'detectActionsInThread');

  return (
    <>
      <Header title="AI / Actions" />
      <div className="flex flex-1 flex-col gap-6 p-6 max-w-3xl">
        <MethodExecutor
          title="ai.detectActions()"
          description="Detect action items and tasks from an email"
          loading={detectActions.loading}
          error={detectActions.error}
          data={detectActions.data}
          duration={detectActions.duration}
          resultRenderer={(data) => <ActionItemsListView data={data} />}
          onExecute={() => detectActions.execute({ emailId })}
        >
          <EmailPicker value={emailId} onChange={setEmailId} />
        </MethodExecutor>

        <MethodExecutor
          title="ai.detectActionsInThread()"
          description="Detect action items across an entire thread"
          loading={detectActionsInThread.loading}
          error={detectActionsInThread.error}
          data={detectActionsInThread.data}
          duration={detectActionsInThread.duration}
          resultRenderer={(data) => <ActionItemsListView data={data} />}
          onExecute={() => detectActionsInThread.execute({ threadId })}
        >
          <div>
            <Label>Thread ID</Label>
            <Input value={threadId} onChange={(e) => setThreadId(e.target.value)} placeholder="Enter thread ID" />
          </div>
        </MethodExecutor>
      </div>
    </>
  );
}
