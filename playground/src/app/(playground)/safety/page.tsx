'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/header';
import { MethodExecutor } from '@/components/playground/method-executor';
import { EmailPicker } from '@/components/playground/email-picker';
import { useEmaiExecute } from '@/hooks/use-emai-execute';
import { ScanResultView } from '@/components/playground/results/scan-result';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const API = '/api/emai/safety';

export default function SafetyPage() {
  // Scan email
  const [emailId, setEmailId] = useState('');
  const scan = useEmaiExecute(API, 'scan');

  // Scan text
  const [scanText, setScanText] = useState(
    'My SSN is 123-45-6789 and my API key is sk-1234567890abcdef1234567890abcdef',
  );
  const scanFreeText = useEmaiExecute(API, 'scanText');

  // Check before send
  const [sendTo, setSendTo] = useState('');
  const [sendSubject, setSendSubject] = useState('');
  const [sendBody, setSendBody] = useState('');
  const checkBeforeSend = useEmaiExecute(API, 'checkBeforeSend');

  return (
    <>
      <Header title="Safety" />
      <div className="flex flex-1 flex-col gap-6 p-6 max-w-3xl">
        <MethodExecutor
          title="safety.scan() — Email"
          description="Scan an existing email for PII, credentials, and phishing risks"
          loading={scan.loading}
          error={scan.error}
          data={scan.data}
          duration={scan.duration}
          executeLabel="Scan"
          resultRenderer={(data) => <ScanResultView data={data} />}
          onExecute={() => scan.execute({ emailId })}
        >
          <EmailPicker value={emailId} onChange={setEmailId} />
        </MethodExecutor>

        <MethodExecutor
          title="safety.scan() — Free Text"
          description="Scan any text for PII and credential patterns"
          loading={scanFreeText.loading}
          error={scanFreeText.error}
          data={scanFreeText.data}
          duration={scanFreeText.duration}
          executeLabel="Scan Text"
          resultRenderer={(data) => <ScanResultView data={data} />}
          onExecute={() => scanFreeText.execute({ text: scanText })}
        >
          <div>
            <Label>Text to scan</Label>
            <Textarea
              value={scanText}
              onChange={(e) => setScanText(e.target.value)}
              rows={4}
              placeholder="Enter text with PII, credentials, etc."
            />
          </div>
        </MethodExecutor>

        <MethodExecutor
          title="safety.checkBeforeSend()"
          description="Check if an outbound email is safe to send"
          loading={checkBeforeSend.loading}
          error={checkBeforeSend.error}
          data={checkBeforeSend.data}
          duration={checkBeforeSend.duration}
          executeLabel="Check"
          resultRenderer={(data) => <ScanResultView data={data} />}
          onExecute={() =>
            checkBeforeSend.execute({
              to: sendTo,
              subject: sendSubject,
              text: sendBody,
            })
          }
        >
          <div className="space-y-3">
            <div>
              <Label>To</Label>
              <Input value={sendTo} onChange={(e) => setSendTo(e.target.value)} placeholder="recipient@example.com" />
            </div>
            <div>
              <Label>Subject</Label>
              <Input value={sendSubject} onChange={(e) => setSendSubject(e.target.value)} placeholder="Email subject" />
            </div>
            <div>
              <Label>Body</Label>
              <Textarea value={sendBody} onChange={(e) => setSendBody(e.target.value)} placeholder="Email body text..." />
            </div>
          </div>
        </MethodExecutor>
      </div>
    </>
  );
}
