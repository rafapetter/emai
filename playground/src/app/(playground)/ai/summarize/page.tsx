'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/header';
import { MethodExecutor } from '@/components/playground/method-executor';
import { EmailPicker } from '@/components/playground/email-picker';
import { useEmaiExecute } from '@/hooks/use-emai-execute';
import { SummaryResultView } from '@/components/playground/results/summary-result';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const API = '/api/emai/ai';

export default function SummarizePage() {
  const [emailId, setEmailId] = useState('');
  const summarize = useEmaiExecute(API, 'summarize');

  const [threadId, setThreadId] = useState('');
  const summarizeThread = useEmaiExecute(API, 'summarizeThread');

  return (
    <>
      <Header title="AI / Summarize" />
      <div className="flex flex-1 flex-col gap-6 p-6 max-w-3xl">
        <MethodExecutor
          title="ai.summarize()"
          description="Generate a summary of a single email"
          loading={summarize.loading}
          error={summarize.error}
          data={summarize.data}
          duration={summarize.duration}
          resultRenderer={(data) => <SummaryResultView data={data} />}
          onExecute={() => summarize.execute({ emailId })}
        >
          <EmailPicker value={emailId} onChange={setEmailId} />
        </MethodExecutor>

        <MethodExecutor
          title="ai.summarizeThread()"
          description="Summarize an entire conversation thread"
          loading={summarizeThread.loading}
          error={summarizeThread.error}
          data={summarizeThread.data}
          duration={summarizeThread.duration}
          resultRenderer={(data) => <SummaryResultView data={data} />}
          onExecute={() => summarizeThread.execute({ threadId })}
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
