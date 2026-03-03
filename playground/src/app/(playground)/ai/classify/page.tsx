'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/header';
import { MethodExecutor } from '@/components/playground/method-executor';
import { EmailPicker } from '@/components/playground/email-picker';
import { useEmaiExecute } from '@/hooks/use-emai-execute';
import { ClassificationResultView } from '@/components/playground/results/classification-result';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const API = '/api/emai/ai';

export default function ClassifyPage() {
  const [emailId, setEmailId] = useState('');
  const classify = useEmaiExecute(API, 'classify');

  const [batchLimit, setBatchLimit] = useState('5');
  const classifyBatch = useEmaiExecute(API, 'classifyBatch');

  return (
    <>
      <Header title="AI / Classify" />
      <div className="flex flex-1 flex-col gap-6 p-6 max-w-3xl">
        <MethodExecutor
          title="ai.classify()"
          description="Categorize an email (15 categories, confidence, sentiment, urgency)"
          loading={classify.loading}
          error={classify.error}
          data={classify.data}
          duration={classify.duration}
          resultRenderer={(data) => <ClassificationResultView data={data} />}
          onExecute={() => classify.execute({ emailId })}
        >
          <EmailPicker value={emailId} onChange={setEmailId} />
        </MethodExecutor>

        <MethodExecutor
          title="ai.classifyBatch()"
          description="Classify multiple emails at once"
          loading={classifyBatch.loading}
          error={classifyBatch.error}
          data={classifyBatch.data}
          duration={classifyBatch.duration}
          resultRenderer={(data) => <ClassificationResultView data={data} />}
          onExecute={() => classifyBatch.execute({ limit: Number(batchLimit) })}
        >
          <div>
            <Label>Number of emails</Label>
            <Input value={batchLimit} onChange={(e) => setBatchLimit(e.target.value)} type="number" />
          </div>
        </MethodExecutor>
      </div>
    </>
  );
}
