'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/header';
import { MethodExecutor } from '@/components/playground/method-executor';
import { EmailPicker } from '@/components/playground/email-picker';
import { useEmaiExecute } from '@/hooks/use-emai-execute';
import { ComposeResultView } from '@/components/playground/results/compose-result';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const API = '/api/emai/ai';

export default function ComposePage() {
  // Compose
  const [context, setContext] = useState('');
  const [tone, setTone] = useState('professional');
  const [length, setLength] = useState('medium');
  const [instructions, setInstructions] = useState('');
  const compose = useEmaiExecute(API, 'compose');

  // Reply
  const [replyEmailId, setReplyEmailId] = useState('');
  const [replyInstructions, setReplyInstructions] = useState('');
  const [replyTone, setReplyTone] = useState('professional');
  const reply = useEmaiExecute(API, 'reply');

  // Rewrite
  const [rewriteText, setRewriteText] = useState('');
  const [rewriteTone, setRewriteTone] = useState('professional');
  const rewrite = useEmaiExecute(API, 'rewriteInTone');

  // Improve
  const [improveText, setImproveText] = useState('');
  const improve = useEmaiExecute(API, 'improveWriting');

  return (
    <>
      <Header title="AI / Compose" />
      <div className="flex flex-1 flex-col gap-6 p-6 max-w-3xl">
        <MethodExecutor
          title="ai.compose()"
          description="AI-compose a new email with tone and context"
          loading={compose.loading}
          error={compose.error}
          data={compose.data}
          duration={compose.duration}
          resultRenderer={(data) => <ComposeResultView data={data} />}
          onExecute={() =>
            compose.execute({
              options: {
                context,
                tone,
                length,
                ...(instructions && { instructions }),
              },
            })
          }
        >
          <div className="space-y-3">
            <div>
              <Label>Context</Label>
              <Textarea value={context} onChange={(e) => setContext(e.target.value)} placeholder="What should the email be about?" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Tone</Label>
                <Select value={tone} onValueChange={setTone}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="professional">Professional</SelectItem>
                    <SelectItem value="casual">Casual</SelectItem>
                    <SelectItem value="friendly">Friendly</SelectItem>
                    <SelectItem value="formal">Formal</SelectItem>
                    <SelectItem value="empathetic">Empathetic</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Length</Label>
                <Select value={length} onValueChange={setLength}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="short">Short</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="long">Long</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Additional Instructions (optional)</Label>
              <Input value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="Any specific requirements..." />
            </div>
          </div>
        </MethodExecutor>

        <MethodExecutor
          title="ai.reply()"
          description="AI-compose a reply to an existing email"
          loading={reply.loading}
          error={reply.error}
          data={reply.data}
          duration={reply.duration}
          resultRenderer={(data) => <ComposeResultView data={data} />}
          onExecute={() =>
            reply.execute({
              emailId: replyEmailId,
              options: {
                instructions: replyInstructions,
                tone: replyTone,
              },
            })
          }
        >
          <EmailPicker value={replyEmailId} onChange={setReplyEmailId} />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Instructions</Label>
              <Input value={replyInstructions} onChange={(e) => setReplyInstructions(e.target.value)} placeholder="How should we reply?" />
            </div>
            <div>
              <Label>Tone</Label>
              <Select value={replyTone} onValueChange={setReplyTone}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="casual">Casual</SelectItem>
                  <SelectItem value="friendly">Friendly</SelectItem>
                  <SelectItem value="formal">Formal</SelectItem>
                  <SelectItem value="empathetic">Empathetic</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </MethodExecutor>

        <MethodExecutor
          title="ai.rewriteInTone()"
          description="Rewrite text in a different tone"
          loading={rewrite.loading}
          error={rewrite.error}
          data={rewrite.data}
          duration={rewrite.duration}
          resultRenderer={(data) => <ComposeResultView data={data} />}
          onExecute={() => rewrite.execute({ text: rewriteText, tone: rewriteTone })}
        >
          <div>
            <Label>Text</Label>
            <Textarea value={rewriteText} onChange={(e) => setRewriteText(e.target.value)} placeholder="Enter text to rewrite..." />
          </div>
          <div>
            <Label>Target Tone</Label>
            <Select value={rewriteTone} onValueChange={setRewriteTone}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="professional">Professional</SelectItem>
                <SelectItem value="casual">Casual</SelectItem>
                <SelectItem value="friendly">Friendly</SelectItem>
                <SelectItem value="formal">Formal</SelectItem>
                <SelectItem value="empathetic">Empathetic</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </MethodExecutor>

        <MethodExecutor
          title="ai.improveWriting()"
          description="Improve grammar and clarity of text"
          loading={improve.loading}
          error={improve.error}
          data={improve.data}
          duration={improve.duration}
          resultRenderer={(data) => <ComposeResultView data={data} />}
          onExecute={() => improve.execute({ text: improveText })}
        >
          <div>
            <Label>Text</Label>
            <Textarea value={improveText} onChange={(e) => setImproveText(e.target.value)} placeholder="Enter text to improve..." />
          </div>
        </MethodExecutor>
      </div>
    </>
  );
}
