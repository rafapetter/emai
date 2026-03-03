'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/header';
import { MethodExecutor } from '@/components/playground/method-executor';
import { useEmaiExecute } from '@/hooks/use-emai-execute';
import { ThreadResultView } from '@/components/playground/results/thread-result';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const API = '/api/emai/threads';

export default function ThreadsPage() {
  const [threadId, setThreadId] = useState('');
  const getThread = useEmaiExecute(API, 'get');

  const [detectLimit, setDetectLimit] = useState('50');
  const detect = useEmaiExecute(API, 'detect');

  return (
    <>
      <Header title="Threads" />
      <div className="flex flex-1 flex-col gap-6 p-6 max-w-3xl">
        <MethodExecutor
          title="threads.detect()"
          description="Detect conversation threads from recent emails"
          loading={detect.loading}
          error={detect.error}
          data={detect.data}
          duration={detect.duration}
          executeLabel="Detect"
          resultRenderer={(data) => <ThreadResultView data={data} />}
          onExecute={() => detect.execute({ limit: Number(detectLimit) })}
        >
          <div>
            <Label>Emails to analyze</Label>
            <Input value={detectLimit} onChange={(e) => setDetectLimit(e.target.value)} type="number" />
          </div>
        </MethodExecutor>

        <MethodExecutor
          title="threads.get()"
          description="Fetch a specific thread by ID"
          loading={getThread.loading}
          error={getThread.error}
          data={getThread.data}
          duration={getThread.duration}
          resultRenderer={(data) => <ThreadResultView data={data} />}
          onExecute={() => getThread.execute({ threadId })}
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
