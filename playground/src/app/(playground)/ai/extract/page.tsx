'use client';

import { useState } from 'react';
import { Header } from '@/components/layout/header';
import { MethodExecutor } from '@/components/playground/method-executor';
import { EmailPicker } from '@/components/playground/email-picker';
import { useEmaiExecute } from '@/hooks/use-emai-execute';
import { ExtractionResultView } from '@/components/playground/results/extraction-result';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2 } from 'lucide-react';

const API = '/api/emai/ai';

interface SchemaField {
  name: string;
  type: string;
  optional: boolean;
}

export default function ExtractPage() {
  const [emailId, setEmailId] = useState('');
  const [fields, setFields] = useState<SchemaField[]>([
    { name: 'invoiceNumber', type: 'string', optional: false },
    { name: 'amount', type: 'number', optional: false },
    { name: 'dueDate', type: 'string', optional: true },
    { name: 'vendor', type: 'string', optional: false },
  ]);
  const extract = useEmaiExecute(API, 'extract');

  function addField() {
    setFields([...fields, { name: '', type: 'string', optional: false }]);
  }

  function removeField(index: number) {
    setFields(fields.filter((_, i) => i !== index));
  }

  function updateField(index: number, updates: Partial<SchemaField>) {
    setFields(fields.map((f, i) => (i === index ? { ...f, ...updates } : f)));
  }

  return (
    <>
      <Header title="AI / Extract" />
      <div className="flex flex-1 flex-col gap-6 p-6 max-w-3xl">
        <MethodExecutor
          title="ai.extract()"
          description="Extract structured data from an email using a Zod schema"
          loading={extract.loading}
          error={extract.error}
          data={extract.data}
          duration={extract.duration}
          resultRenderer={(data) => <ExtractionResultView data={data} />}
          onExecute={() => extract.execute({ emailId, fields })}
        >
          <EmailPicker value={emailId} onChange={setEmailId} />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Schema Fields</Label>
              <Button variant="outline" size="sm" onClick={addField}>
                <Plus className="size-3 mr-1" /> Add Field
              </Button>
            </div>

            {fields.map((field, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={field.name}
                  onChange={(e) => updateField(i, { name: e.target.value })}
                  placeholder="Field name"
                  className="flex-1"
                />
                <Select
                  value={field.type}
                  onValueChange={(v) => updateField(i, { type: v })}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="string">String</SelectItem>
                    <SelectItem value="number">Number</SelectItem>
                    <SelectItem value="boolean">Boolean</SelectItem>
                    <SelectItem value="array">Array</SelectItem>
                  </SelectContent>
                </Select>
                <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                  <input
                    type="checkbox"
                    checked={field.optional}
                    onChange={(e) => updateField(i, { optional: e.target.checked })}
                  />
                  Optional
                </label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => removeField(i)}
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>
            ))}
          </div>
        </MethodExecutor>
      </div>
    </>
  );
}
