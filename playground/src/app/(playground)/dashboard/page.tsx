'use client';

import { useState, useCallback, useMemo, useRef } from 'react';
import { Header } from '@/components/layout/header';
import { SummaryBar, type Phase } from '@/components/playground/dashboard/summary-bar';
import { DashboardSection, type SectionStatus } from '@/components/playground/dashboard/dashboard-section';
import { ReportCard } from '@/components/playground/dashboard/report-card';
import { useEmaiExecute } from '@/hooks/use-emai-execute';
import { useEventStream } from '@/hooks/use-event-stream';
import { EmailListResult, type AiResultSummary } from '@/components/playground/results/email-list-result';
import { ExtractionResultView } from '@/components/playground/results/extraction-result';
import { ClassificationResultView } from '@/components/playground/results/classification-result';
import { SummaryResultView } from '@/components/playground/results/summary-result';
import { PriorityResultView } from '@/components/playground/results/priority-result';
import { ActionItemsListView } from '@/components/playground/results/action-items-list';
import { ComposeResultView } from '@/components/playground/results/compose-result';
import { ScanResultView } from '@/components/playground/results/scan-result';
import { SearchResultListView } from '@/components/playground/results/search-result-list';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Trash2,
  Info,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  Mail,
  Paperclip,
  Search,
  ExternalLink,
  X,
  Plus,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { selectSamples, type EmailData, type EmailSamples } from '@/lib/email-sampler';
import { ErrorDetail } from '@/components/playground/dashboard/error-detail';

// Max emails for batch AI operations (classify/prioritize)
const BATCH_LIMIT = 5;

// AI semantic fields — all optional so extraction never fails on validation
const DEFAULT_EXTRACT_FIELDS = [
  { name: 'mainTopic', type: 'string', optional: true },
  { name: 'summary', type: 'string', optional: true },
  { name: 'sentiment', type: 'string', optional: true },
  { name: 'language', type: 'string', optional: true },
  { name: 'isUrgent', type: 'boolean', optional: true },
  { name: 'isActionRequired', type: 'boolean', optional: true },
  { name: 'mentionedPeople', type: 'array', optional: true },
  { name: 'mentionedCompanies', type: 'array', optional: true },
  { name: 'mentionedDates', type: 'array', optional: true },
  { name: 'links', type: 'array', optional: true },
  { name: 'keyPhrases', type: 'array', optional: true },
];

// Suggested fields based on attachment content types
type FieldDef = { name: string; type: string; optional: boolean };

const ATTACHMENT_FIELD_SUGGESTIONS: Record<string, FieldDef[]> = {
  pdf: [
    { name: 'documentTitle', type: 'string', optional: true },
    { name: 'contractParties', type: 'array', optional: true },
    { name: 'contractDate', type: 'string', optional: true },
    { name: 'effectiveDate', type: 'string', optional: true },
    { name: 'expirationDate', type: 'string', optional: true },
    { name: 'totalAmount', type: 'string', optional: true },
    { name: 'signatories', type: 'array', optional: true },
    { name: 'clauses', type: 'array', optional: true },
  ],
  spreadsheet: [
    { name: 'columnHeaders', type: 'array', optional: true },
    { name: 'rowCount', type: 'number', optional: true },
    { name: 'dataCategories', type: 'array', optional: true },
    { name: 'numericTotals', type: 'array', optional: true },
  ],
  image: [
    { name: 'imageDescription', type: 'string', optional: true },
    { name: 'ocrText', type: 'string', optional: true },
    { name: 'visualElements', type: 'array', optional: true },
  ],
  document: [
    { name: 'documentType', type: 'string', optional: true },
    { name: 'author', type: 'string', optional: true },
    { name: 'sections', type: 'array', optional: true },
    { name: 'references', type: 'array', optional: true },
  ],
};

function getAttachmentCategory(contentType: string, filename: string): string {
  const ct = contentType.toLowerCase();
  const fn = filename.toLowerCase();
  if (ct.includes('pdf') || fn.endsWith('.pdf')) return 'pdf';
  if (ct.includes('spreadsheet') || ct.includes('csv') || fn.endsWith('.xlsx') || fn.endsWith('.xls') || fn.endsWith('.csv')) return 'spreadsheet';
  if (ct.startsWith('image/')) return 'image';
  if (ct.includes('word') || ct.includes('document') || fn.endsWith('.docx') || fn.endsWith('.doc')) return 'document';
  return 'document';
}

function deriveSuggestedFields(
  extractionData: unknown,
  currentFields: FieldDef[],
): FieldDef[] {
  const data = extractionData as { attachments?: Array<{ contentType: string; filename: string }> } | null;
  if (!data?.attachments?.length) return [];

  const currentNames = new Set(currentFields.map((f) => f.name));
  const seen = new Set<string>();
  const suggestions: FieldDef[] = [];

  // Collect categories from attachments
  const categories = new Set<string>();
  for (const att of data.attachments) {
    categories.add(getAttachmentCategory(att.contentType, att.filename));
  }

  for (const cat of categories) {
    const fields = ATTACHMENT_FIELD_SUGGESTIONS[cat] ?? [];
    for (const f of fields) {
      if (!currentNames.has(f.name) && !seen.has(f.name)) {
        seen.add(f.name);
        suggestions.push(f);
      }
    }
  }

  return suggestions;
}

// Feature descriptions for info tooltips
const featureInfo: Record<string, string> = {
  Classify:
    'Categorizes emails into 15 categories (primary, social, promotions, spam, etc.) with confidence scores. Detects sentiment, urgency, and whether action is required. Batch mode classifies multiple emails at once.',
  Summarize:
    'Generates a 2-3 sentence summary with key points, participants, action items, sentiment analysis, and topic tags. Works on individual emails or entire threads.',
  Prioritize:
    'Scores email priority 0-100 with levels (critical/high/medium/low/none). Analyzes sender importance, urgency indicators, time sensitivity, and suggests response times. Batch mode scores multiple emails.',
  Actions:
    'Detects action items from email content: explicit tasks, deadlines, requests for information, follow-ups, and approval requests. Extracts assignees, due dates, priority, and status for each item.',
  Compose:
    'AI-generated email draft based on context and instructions. Returns subject, plain text body, and optional HTML. Supports tone (professional, casual, formal) and length (short, medium, long) customization.',
};

function eventColor(event: string): string {
  if (event.startsWith('email:')) return 'bg-blue-100 text-blue-800';
  if (event.startsWith('safety:')) return 'bg-red-100 text-red-800';
  if (event.startsWith('watch:')) return 'bg-green-100 text-green-800';
  if (event.startsWith('dashboard:')) return 'bg-purple-100 text-purple-800';
  if (event.startsWith('ai:')) return 'bg-indigo-100 text-indigo-800';
  return 'bg-gray-100 text-gray-800';
}

function getStatus(hook: { data: unknown; error: string | null; loading: boolean }): SectionStatus {
  if (hook.loading) return 'running';
  if (hook.error) return 'failed';
  if (hook.data !== null) return 'passed';
  return 'idle';
}

// Helper to emit events through the event bus via API
async function emitEvent(eventType: string, data: unknown): Promise<void> {
  try {
    await fetch('/api/emai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'emitEvent', eventType, data }),
    });
  } catch {
    // best-effort — don't break the pipeline
  }
}

// ---------- Collapsible AI Feature ----------
interface FeatureHook {
  data: unknown;
  error: string | null;
  loading: boolean;
  duration: number | null;
}

function CollapsibleFeature({
  name,
  hook,
  children,
}: {
  name: string;
  hook: FeatureHook;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const info = featureInfo[name];

  const statusIcon = hook.loading ? (
    <Loader2 className="size-3.5 animate-spin text-blue-500" />
  ) : hook.error ? (
    <XCircle className="size-3.5 text-red-500" />
  ) : hook.data !== null ? (
    <CheckCircle2 className="size-3.5 text-green-500" />
  ) : (
    <Clock className="size-3.5 text-muted-foreground" />
  );

  return (
    <div className="border rounded-md overflow-hidden">
      <div
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/50"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        {statusIcon}
        <span className="text-sm font-medium">{name}</span>
        {info && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <Info className="size-3.5 text-muted-foreground hover:text-foreground transition-colors" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs text-xs leading-relaxed">
              {info}
            </TooltipContent>
          </Tooltip>
        )}
        {hook.duration != null && (
          <span className="text-xs text-muted-foreground ml-auto">
            {(hook.duration / 1000).toFixed(1)}s
          </span>
        )}
      </div>
      {open && (
        <div className="p-3 pt-0 border-t">
          {hook.loading ? (
            <p className="text-sm text-muted-foreground py-2">Running...</p>
          ) : hook.error ? (
            <ErrorDetail error={hook.error} />
          ) : hook.data !== null ? (
            children
          ) : (
            <p className="text-sm text-muted-foreground py-2">Pending...</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Source Email Card ----------
function SourceEmailCard({
  email,
  label,
}: {
  email: EmailData;
  label: string;
}) {
  const attachmentCount = email.attachments?.length ?? 0;

  return (
    <div className="flex items-start gap-3 p-3 rounded-md bg-muted/30 border mb-3">
      <Mail className="size-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
        </div>
        <p className="text-sm font-medium truncate">{email.subject}</p>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>From: {typeof email.from === 'string' ? email.from : (email.from as { address?: string })?.address ?? JSON.stringify(email.from)}</span>
          {email.date && (
            <span>{new Date(email.date as string).toLocaleDateString()}</span>
          )}
        </div>
        {attachmentCount > 0 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Paperclip className="size-3" />
            <span>
              {attachmentCount} attachment{attachmentCount !== 1 ? 's' : ''}
              {email.attachments && (
                <span className="ml-1">
                  ({(email.attachments as Array<{ filename?: string }>).map((a) => a.filename).filter(Boolean).join(', ')})
                </span>
              )}
            </span>
          </div>
        )}
      </div>
      <a
        href="/emails"
        className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0"
      >
        View <ExternalLink className="size-3" />
      </a>
    </div>
  );
}

export default function DashboardPage() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [emailSamples, setEmailSamples] = useState<EmailSamples | null>(null);
  const [searchMethod, setSearchMethod] = useState<'semantic' | 'fullText'>('semantic');
  const [manualQuery, setManualQuery] = useState('');
  const [extractFields, setExtractFields] = useState(DEFAULT_EXTRACT_FIELDS);
  const [newFieldName, setNewFieldName] = useState('');
  const [newFieldType, setNewFieldType] = useState<'string' | 'boolean' | 'number' | 'array'>('string');
  const newFieldInputRef = useRef<HTMLInputElement>(null);

  // Test hooks — each has a 60s timeout by default
  const emailList = useEmaiExecute('/api/emai/emails', 'list');
  const extraction = useEmaiExecute('/api/emai/ai', 'extractComprehensive');
  const classify = useEmaiExecute('/api/emai/ai', 'classifyBatch');
  const summarize = useEmaiExecute('/api/emai/ai', 'summarize');
  const prioritize = useEmaiExecute('/api/emai/ai', 'prioritizeBatch');
  const actions = useEmaiExecute('/api/emai/ai', 'detectActions');
  const compose = useEmaiExecute('/api/emai/ai', 'compose');
  const safetyScan = useEmaiExecute('/api/emai/safety', 'scan');
  const indexEmails = useEmaiExecute('/api/emai/search', 'index', 90_000);
  const searchEmails = useEmaiExecute('/api/emai/search', 'semantic');
  const manualSearch = useEmaiExecute('/api/emai/search', searchMethod);

  const eventStream = useEventStream();

  const allTests = [emailList, extraction, classify, summarize, prioritize, actions, compose, safetyScan, indexEmails, searchEmails];
  const isRunning = phase !== 'idle' && phase !== 'complete';

  const namedTests = [
    { name: 'Email Fetch', data: emailList.data, error: emailList.error, duration: emailList.duration },
    { name: 'Data Extraction', data: extraction.data, error: extraction.error, duration: extraction.duration },
    { name: 'Classification', data: classify.data, error: classify.error, duration: classify.duration },
    { name: 'Summarization', data: summarize.data, error: summarize.error, duration: summarize.duration },
    { name: 'Prioritization', data: prioritize.data, error: prioritize.error, duration: prioritize.duration },
    { name: 'Action Detection', data: actions.data, error: actions.error, duration: actions.duration },
    { name: 'AI Compose', data: compose.data, error: compose.error, duration: compose.duration },
    { name: 'Safety Scan', data: safetyScan.data, error: safetyScan.error, duration: safetyScan.duration },
    { name: 'Search Index', data: indexEmails.data, error: indexEmails.error, duration: indexEmails.duration },
    { name: 'Search Query', data: searchEmails.data, error: searchEmails.error, duration: searchEmails.duration },
  ];

  // Build AI results map from classify + prioritize results
  const aiResultsMap = useMemo(() => {
    const map: Record<string, AiResultSummary> = {};
    if (Array.isArray(classify.data)) {
      for (const item of classify.data as Array<{ email?: { id: string }; category?: string; isUrgent?: boolean; isActionRequired?: boolean }>) {
        if (item.email?.id) {
          map[item.email.id] = {
            ...map[item.email.id],
            category: item.category,
            isUrgent: item.isUrgent,
            isActionRequired: item.isActionRequired,
          };
        }
      }
    }
    if (Array.isArray(prioritize.data)) {
      for (const item of prioritize.data as Array<{ email?: { id: string }; level?: string; score?: number }>) {
        if (item.email?.id) {
          map[item.email.id] = {
            ...map[item.email.id],
            priorityLevel: item.level,
            priorityScore: item.score,
          };
        }
      }
    }
    return map;
  }, [classify.data, prioritize.data]);

  const runAll = useCallback(async () => {
    setEmailSamples(null);

    // Step 0: Ensure connection is alive (IMAP can drop idle connections)
    setPhase('fetching');
    try {
      await fetch('/api/emai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'connect' }),
      });
    } catch {
      // best-effort reconnect
    }

    try {
      // Step 1: Fetch up to 50 emails
      const emails = await emailList.execute({ options: { limit: 50 } });

      if (!emails || !(emails as { items?: unknown[] }).items?.length) {
        return;
      }

      const items = (emails as { items: EmailData[] }).items;
      const samples = selectSamples(items);
      setEmailSamples(samples);

      // Emit test event so event stream shows activity immediately
      await emitEvent('dashboard:started', {
        emailCount: items.length,
        timestamp: new Date().toISOString(),
      });

      // Step 2: Run AI + Safety in parallel using smart samples
      setPhase('analyzing');

      // Use the email with most diverse attachments for extraction, falling back to richest
      const extractionTarget = samples.withDiverseAttachments ?? samples.withAttachments ?? samples.richest;

      const aiResults = await Promise.allSettled([
        extraction.execute({
          emailId: extractionTarget.id,
          fields: extractFields,
        }),
        classify.execute({ limit: Math.min(items.length, BATCH_LIMIT) }),
        summarize.execute({ emailId: samples.longestBody.id }),
        prioritize.execute({ limit: Math.min(items.length, BATCH_LIMIT) }),
        actions.execute({ emailId: samples.longestBody.id }),
        compose.execute({
          options: {
            context: `Reply to an email about: ${samples.richest.subject}`,
            tone: 'professional',
            length: 'short',
            instructions: 'Write a brief, professional response acknowledging the email.',
          },
        }),
        safetyScan.execute({ emailId: samples.forSafetyScan[0].id }),
      ]);

      // Emit events for completed AI operations
      const aiOpNames = ['extraction', 'classify', 'summarize', 'prioritize', 'actions', 'compose', 'safety'];
      for (let i = 0; i < aiResults.length; i++) {
        const result = aiResults[i];
        const opName = aiOpNames[i];
        if (result.status === 'fulfilled' && result.value) {
          await emitEvent(`ai:${opName}:complete`, {
            operation: opName,
            success: true,
          });
        }
      }

      // Emit safety risk events if scan found risks
      if (safetyScan.data) {
        const scanResult = safetyScan.data as { risks?: Array<{ type: string; severity: string; description: string }> };
        for (const risk of scanResult.risks ?? []) {
          await emitEvent('safety:risk', risk);
        }
      }

      // Step 3: Index emails for search (limited to keep it fast)
      setPhase('indexing');
      const indexResult = await indexEmails.execute({ limit: Math.min(items.length, 20) });

      // Determine search method based on index result
      const indexData = indexResult as { method?: string; indexed?: number } | null;
      const useFullText = indexData?.method === 'fullText' || (indexData?.indexed ?? 0) === 0;
      if (useFullText) {
        setSearchMethod('fullText');
      }

      // Step 4: Search using the appropriate method
      setPhase('searching');
      const searchQuery = samples.richest.subject.split(' ').slice(0, 3).join(' ') || 'important';
      const searchAction = useFullText ? 'fullText' : 'semantic';
      await searchEmails.execute({ query: searchQuery, options: { limit: 10 } }, searchAction);

      await emitEvent('dashboard:complete', {
        emailCount: items.length,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setPhase('complete');
    }
  }, [emailList, extraction, classify, summarize, prioritize, actions, compose, safetyScan, indexEmails, searchEmails, extractFields]);

  const resetAll = useCallback(() => {
    emailList.reset();
    extraction.reset();
    classify.reset();
    summarize.reset();
    prioritize.reset();
    actions.reset();
    compose.reset();
    safetyScan.reset();
    indexEmails.reset();
    searchEmails.reset();
    manualSearch.reset();
    setEmailSamples(null);
    setSearchMethod('semantic');
    setManualQuery('');
    setPhase('idle');
  }, [emailList, extraction, classify, summarize, prioritize, actions, compose, safetyScan, indexEmails, searchEmails, manualSearch]);

  // Add a custom extraction field
  const addExtractField = useCallback(() => {
    const name = newFieldName.trim();
    if (!name || extractFields.some((f) => f.name === name)) return;
    setExtractFields((prev) => [...prev, { name, type: newFieldType, optional: true }]);
    setNewFieldName('');
    newFieldInputRef.current?.focus();
  }, [newFieldName, newFieldType, extractFields]);

  // Remove an extraction field
  const removeExtractField = useCallback((fieldName: string) => {
    setExtractFields((prev) => prev.filter((f) => f.name !== fieldName));
  }, []);

  // Manual search handler
  const handleManualSearch = useCallback(async () => {
    if (!manualQuery.trim()) return;
    await manualSearch.execute({
      query: manualQuery.trim(),
      options: { limit: 10 },
    });
  }, [manualQuery, manualSearch]);

  // Derive AI section status
  const aiHooks = [classify, summarize, prioritize, actions, compose];
  const aiStatus: SectionStatus = aiHooks.some((h) => h.loading)
    ? 'running'
    : aiHooks.some((h) => h.error)
      ? 'failed'
      : aiHooks.some((h) => h.data !== null)
        ? 'passed'
        : 'idle';
  const aiDuration = aiHooks.reduce((sum, h) => sum + (h.duration ?? 0), 0);

  // Derive search section status
  const searchStatus: SectionStatus = indexEmails.loading || searchEmails.loading
    ? 'running'
    : indexEmails.error || searchEmails.error
      ? 'failed'
      : indexEmails.data !== null || searchEmails.data !== null
        ? 'passed'
        : 'idle';
  const searchDuration = (indexEmails.duration ?? 0) + (searchEmails.duration ?? 0);

  // Dynamic descriptions
  const emailCount = emailSamples?.stats.total;
  const batchCount = emailCount ? Math.min(emailCount, BATCH_LIMIT) : BATCH_LIMIT;

  // Find the sample email used for extraction (prefer diverse attachments)
  const extractionEmail = emailSamples
    ? (emailSamples.withDiverseAttachments ?? emailSamples.withAttachments ?? emailSamples.richest)
    : null;

  // Context email for compose (the richest email that prompted the composition)
  const composeContextEmail = emailSamples?.richest ?? null;

  // Suggested fields based on attachment types in extraction results
  const suggestedFields = useMemo(
    () => deriveSuggestedFields(extraction.data, extractFields),
    [extraction.data, extractFields],
  );

  // Re-run extraction with updated fields
  const handleRerunExtraction = async () => {
    if (!extractionEmail) return;
    await extraction.execute({
      emailId: extractionEmail.id,
      fields: extractFields,
    });
  };

  return (
    <TooltipProvider delayDuration={300}>
      <Header title="Dashboard" />
      <div className="flex flex-1 flex-col gap-4 p-6 max-w-5xl">
        <SummaryBar
          phase={phase}
          tests={allTests}
          isRunning={isRunning}
          onRun={runAll}
          onReset={resetAll}
        />

        {/* Report Card — shown after completion */}
        {phase === 'complete' && (
          <ReportCard tests={namedTests} emailSamples={emailSamples} />
        )}

        {/* Section 1: Fetched Emails */}
        <DashboardSection
          title="Fetched Emails"
          description={emailCount ? `emails.list() — ${emailCount} emails` : 'emails.list() — up to 50 latest emails'}
          status={getStatus(emailList)}
          duration={emailList.duration}
          error={emailList.error}
          expectation="Fetches your latest emails via the connected provider. Tests the email listing API with pagination."
          passCriteria="At least 1 email fetched with valid from, subject, and date fields."
        >
          {emailList.data ? (
            <EmailListResult
              data={emailList.data}
              aiResults={Object.keys(aiResultsMap).length > 0 ? aiResultsMap : undefined}
            />
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Click &quot;Run All Tests&quot; to fetch emails.
            </p>
          )}
        </DashboardSection>

        {/* Section 2: Data Extraction */}
        <DashboardSection
          title="Data Extraction"
          description="ai.extractComprehensive() — email metadata + AI analysis + attachments"
          status={getStatus(extraction)}
          duration={extraction.duration}
          error={extraction.error}
          expectation="Extracts raw email metadata (always succeeds), runs AI semantic analysis (topic, sentiment, urgency, entities), and deeply parses all attachments (PDFs, images, spreadsheets)."
          passCriteria="Email metadata extracted. AI analysis and attachment parsing are non-blocking — partial results are shown even if AI extraction fails."
        >
          {/* Extraction Fields Editor */}
          <div className="space-y-2 mb-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Extraction Fields</h4>
              {extraction.data != null && extractionEmail && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5"
                  onClick={handleRerunExtraction}
                  disabled={extraction.loading}
                >
                  {extraction.loading ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />}
                  Re-extract
                </Button>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {extractFields.map((field) => (
                <Badge
                  key={field.name}
                  variant="outline"
                  className="text-[10px] gap-1 pr-1 cursor-default"
                >
                  <span>{field.name}</span>
                  <span className="text-muted-foreground/60">({field.type})</span>
                  <button
                    onClick={() => removeExtractField(field.name)}
                    className="ml-0.5 hover:text-red-500 transition-colors"
                  >
                    <X className="size-2.5" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <Input
                ref={newFieldInputRef}
                placeholder="Field name..."
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addExtractField()}
                className="h-7 text-xs max-w-40"
              />
              <select
                value={newFieldType}
                onChange={(e) => setNewFieldType(e.target.value as typeof newFieldType)}
                className="h-7 text-xs rounded-md border bg-background px-2"
              >
                <option value="string">string</option>
                <option value="boolean">boolean</option>
                <option value="number">number</option>
                <option value="array">array</option>
              </select>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addExtractField} disabled={!newFieldName.trim()}>
                <Plus className="size-3" /> Add
              </Button>
            </div>
            {/* Suggested fields from attachments */}
            {suggestedFields.length > 0 && (
              <div className="pt-1">
                <p className="text-[10px] text-muted-foreground mb-1">Suggested from attachments:</p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {suggestedFields.map((field) => (
                    <button
                      key={field.name}
                      onClick={() => setExtractFields((prev) => [...prev, field])}
                      className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border border-dashed border-primary/40 text-primary hover:bg-primary/5 transition-colors cursor-pointer"
                    >
                      <Plus className="size-2.5" />
                      {field.name}
                      <span className="text-muted-foreground/60">({field.type})</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {extraction.data ? (
            <>
              {extractionEmail && (
                <SourceEmailCard email={extractionEmail} label="Tested on:" />
              )}
              <div
                style={{ maxHeight: 600, overflowY: 'auto' }}
                className="rounded-md border p-3"
              >
                <ExtractionResultView data={extraction.data} />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Extracts email metadata + AI semantic analysis + deep attachment parsing.
            </p>
          )}
        </DashboardSection>

        {/* Section 3: AI Features — Collapsible Accordion */}
        <DashboardSection
          title="AI Features"
          description={emailCount ? `5 AI operations (batch: ${batchCount} emails)` : 'classify, summarize, prioritize, actions, compose'}
          status={aiStatus}
          duration={aiDuration || null}
          error={aiHooks.every((h) => h.error) ? aiHooks[0].error : undefined}
          expectation={`Runs 5 AI operations in parallel: batch classification (${batchCount}), summarization, batch priority scoring (${batchCount}), action detection, and email composition. Each has a 60s timeout.`}
          passCriteria="At least 4 of 5 operations complete with valid results."
        >
          {aiHooks.some((h) => h.data !== null) || aiHooks.some((h) => h.error) || aiHooks.some((h) => h.loading) ? (
            <div className="space-y-2">
              <CollapsibleFeature name="Classify" hook={classify}>
                <ClassificationResultView data={classify.data} />
              </CollapsibleFeature>

              <CollapsibleFeature name="Summarize" hook={summarize}>
                <SummaryResultView data={summarize.data} />
              </CollapsibleFeature>

              <CollapsibleFeature name="Prioritize" hook={prioritize}>
                <PriorityResultView data={prioritize.data} />
              </CollapsibleFeature>

              <CollapsibleFeature name="Actions" hook={actions}>
                <ActionItemsListView data={actions.data} />
              </CollapsibleFeature>

              <CollapsibleFeature name="Compose" hook={compose}>
                <ComposeResultView data={compose.data} contextEmail={composeContextEmail} />
              </CollapsibleFeature>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Runs classify, summarize, prioritize, action detection, and compose on fetched emails.
            </p>
          )}
        </DashboardSection>

        {/* Section 4: Safety Scan */}
        <DashboardSection
          title="Safety Scan"
          description="safety.scan() — PII and credential detection"
          status={getStatus(safetyScan)}
          duration={safetyScan.duration}
          error={safetyScan.error}
          expectation="Scans the selected email for PII (phone numbers, SSNs, credit cards), credentials (API keys, passwords), and phishing indicators."
          passCriteria="Scan completes with a valid safe/unsafe determination."
        >
          {safetyScan.data ? (
            <>
              <ScanResultView data={safetyScan.data} />
              <div className="mt-3 p-3 rounded-md bg-muted/50 text-xs text-muted-foreground space-y-1">
                <div className="flex items-start gap-1.5">
                  <Info className="size-3.5 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-foreground">About detected risks:</p>
                    <ul className="mt-1 space-y-0.5 list-disc list-inside">
                      <li><strong>PII</strong> — Email addresses, phone numbers, physical addresses found in the body (not from/to headers) are flagged because they could leak if forwarded.</li>
                      <li><strong>Credentials</strong> — API keys, passwords, tokens, connection strings detected in content.</li>
                      <li><strong>Phishing</strong> — Mismatched links, urgency language, impersonation attempts.</li>
                      <li>Severity levels: <span className="text-red-600">critical</span> (blocks sending), <span className="text-orange-600">high</span>, <span className="text-yellow-600">medium</span>, <span className="text-gray-500">low</span>.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Scans the selected email for PII, credentials, and phishing risks.
            </p>
          )}
        </DashboardSection>

        {/* Section 5: Search */}
        <DashboardSection
          title="Search"
          description={emailCount ? `index ${Math.min(emailCount, 20)} emails + ${searchMethod} search` : 'index + search'}
          status={searchStatus}
          duration={searchDuration || null}
          error={indexEmails.error || searchEmails.error}
          expectation="Indexes up to 20 emails, then runs a search. Automatically falls back to full-text search if the AI provider doesn't support embeddings."
          passCriteria="Emails indexed (or fallback noted) and search returns at least 1 result."
        >
          <div className="space-y-3">
            {/* Manual search input — at the top */}
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <Input
                  placeholder="Search your emails..."
                  value={manualQuery}
                  onChange={(e) => setManualQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleManualSearch()}
                  className="text-sm h-9 pl-9 pr-8"
                />
                {(manualQuery || manualSearch.data != null) && (
                  <button
                    onClick={() => {
                      setManualQuery('');
                      manualSearch.reset();
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>
              <Button
                size="sm"
                className="h-9 px-4"
                onClick={handleManualSearch}
                disabled={!manualQuery.trim() || manualSearch.loading}
              >
                {manualSearch.loading ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  'Search'
                )}
              </Button>
            </div>

            {/* Manual search results — shown when user has searched */}
            {manualSearch.data != null && (
              <SearchResultListView data={manualSearch.data} />
            )}
            {manualSearch.error && (
              <ErrorDetail error={manualSearch.error} />
            )}

            {/* Index status */}
            {indexEmails.data != null && (
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-xs">
                  Indexed: {(indexEmails.data as { indexed?: number }).indexed ?? '?'} emails
                </Badge>
                <Badge variant="outline" className="text-xs">
                  Method: {(indexEmails.data as { method?: string }).method ?? searchMethod}
                </Badge>
                {(indexEmails.data as { note?: string }).note && (
                  <span className="text-xs text-amber-600">
                    {(indexEmails.data as { note?: string }).note}
                  </span>
                )}
                {indexEmails.duration != null && (
                  <span className="text-xs text-muted-foreground">{indexEmails.duration.toFixed(0)}ms</span>
                )}
              </div>
            )}

            {/* Auto search results — hidden when manual search is active */}
            {searchEmails.data != null && manualSearch.data == null && (
              <SearchResultListView data={searchEmails.data} />
            )}

            {/* Index/search errors */}
            {(indexEmails.error || searchEmails.error) && !indexEmails.data && !searchEmails.data && (
              <ErrorDetail error={(indexEmails.error || searchEmails.error)!} />
            )}

            {/* Empty state */}
            {indexEmails.data == null && searchEmails.data == null && !indexEmails.error && !searchEmails.error && !indexEmails.loading && !searchEmails.loading && (
              <p className="text-sm text-muted-foreground py-4 text-center">
                Indexes emails and runs a search. Automatically falls back to full-text if embeddings aren&apos;t available.
              </p>
            )}
          </div>
        </DashboardSection>

        {/* Section 6: Event Stream */}
        <DashboardSection
          title="Event Stream"
          description={eventStream.isConnected ? 'SSE Connected' : 'SSE Disconnected'}
          status={eventStream.isConnected ? 'passed' : 'idle'}
        >
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {eventStream.events.length} events captured
              </span>
              <Button variant="ghost" size="sm" className="h-7" onClick={eventStream.clear}>
                <Trash2 className="size-3 mr-1" />
                Clear
              </Button>
            </div>
            {eventStream.events.length === 0 ? (
              <div className="py-4 space-y-3">
                <div className="text-sm space-y-2 px-3">
                  <p className="font-medium">What is this?</p>
                  <p className="text-muted-foreground text-xs">
                    The Event Stream shows real-time Server-Sent Events (SSE) from the emai SDK.
                    Events are emitted during operations like email indexing, AI analysis, and safety scanning.
                  </p>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p className="font-medium text-foreground">Event types you&apos;ll see:</p>
                    <ul className="space-y-0.5 ml-2">
                      <li><Badge variant="outline" className="text-[10px] bg-purple-100 text-purple-800 mr-1.5">dashboard:started</Badge> / <Badge variant="outline" className="text-[10px] bg-purple-100 text-purple-800 mr-1.5">dashboard:complete</Badge> — Test pipeline lifecycle</li>
                      <li><Badge variant="outline" className="text-[10px] bg-indigo-100 text-indigo-800 mr-1.5">ai:classify:complete</Badge> <Badge variant="outline" className="text-[10px] bg-indigo-100 text-indigo-800 mr-1.5">ai:summarize:complete</Badge> — AI operation completions</li>
                      <li><Badge variant="outline" className="text-[10px] bg-red-100 text-red-800 mr-1.5">safety:risk</Badge> — Individual security risks detected during scanning</li>
                      <li><Badge variant="outline" className="text-[10px] bg-blue-100 text-blue-800 mr-1.5">email:indexed</Badge> — Emails added to the search index</li>
                    </ul>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Run all tests to see events appear in real-time.
                </p>
              </div>
            ) : (
              <ScrollArea className="h-[200px]">
                <div className="space-y-1">
                  {eventStream.events.slice(-50).map((evt, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 py-1 px-2 rounded text-xs"
                    >
                      <Badge className={`text-[10px] ${eventColor(evt.event)}`} variant="outline">
                        {evt.event}
                      </Badge>
                      <span className="text-muted-foreground">
                        {new Date(evt.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </DashboardSection>
      </div>
    </TooltipProvider>
  );
}
