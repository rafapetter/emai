'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/header';
import { MethodExecutor } from '@/components/playground/method-executor';
import { EmailPicker } from '@/components/playground/email-picker';
import { useEmaiExecute } from '@/hooks/use-emai-execute';
import { PriorityResultView } from '@/components/playground/results/priority-result';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const API = '/api/emai/ai';

export default function PriorityPage() {
  const [emailId, setEmailId] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [vipList, setVipList] = useState('');
  const prioritize = useEmaiExecute(API, 'prioritize');

  const [batchLimit, setBatchLimit] = useState('5');
  const prioritizeBatch = useEmaiExecute(API, 'prioritizeBatch');

  return (
    <>
      <Header title="AI / Priority" />
      <div className="flex flex-1 flex-col gap-6 p-6 max-w-3xl">
        <MethodExecutor
          title="ai.prioritize()"
          description="Score email priority (0-100, critical/high/medium/low/none)"
          loading={prioritize.loading}
          error={prioritize.error}
          data={prioritize.data}
          duration={prioritize.duration}
          resultRenderer={(data) => <PriorityResultView data={data} />}
          onExecute={() =>
            prioritize.execute({
              emailId,
              context: {
                ...(userEmail && { userEmail }),
                ...(vipList && { vipList: vipList.split(',').map((s) => s.trim()) }),
              },
            })
          }
        >
          <EmailPicker value={emailId} onChange={setEmailId} />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Your Email (optional)</Label>
              <Input value={userEmail} onChange={(e) => setUserEmail(e.target.value)} placeholder="you@company.com" />
            </div>
            <div>
              <Label>VIP List (comma-separated)</Label>
              <Input value={vipList} onChange={(e) => setVipList(e.target.value)} placeholder="ceo@co.com, vip@co.com" />
            </div>
          </div>
        </MethodExecutor>

        <MethodExecutor
          title="ai.prioritizeBatch()"
          description="Prioritize multiple emails at once"
          loading={prioritizeBatch.loading}
          error={prioritizeBatch.error}
          data={prioritizeBatch.data}
          duration={prioritizeBatch.duration}
          resultRenderer={(data) => <PriorityResultView data={data} />}
          onExecute={() => prioritizeBatch.execute({ limit: Number(batchLimit) })}
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
