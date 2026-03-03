'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  FileText,
  Table2,
  Image,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Mail,
  Brain,
  Paperclip,
  AlertTriangle,
  User,
  Calendar,
  Tag,
  Star,
  Eye,
  Smile,
  Zap,
  FileSpreadsheet,
  FileImage,
} from 'lucide-react';

interface ComprehensiveData {
  emailData?: Record<string, unknown>;
  aiAnalysis?: Record<string, unknown>;
  attachmentCount?: number;
  attachments?: ParsedAttachmentData[];
  // Legacy shape support (extract action without comprehensive)
  data?: Record<string, unknown>;
  confidence?: number;
  sources?: Array<{ field?: string; text?: string }>;
  [key: string]: unknown;
}

interface ParsedAttachmentData {
  filename: string;
  contentType: string;
  size: number;
  text?: string;
  markdown?: string;
  tables?: Array<{ headers: string[]; rows: string[][]; sheetName?: string }>;
  structuredData?: Record<string, unknown>;
  pages?: number;
  images?: Array<{ text?: string; description?: string }>;
  metadata?: Record<string, unknown>;
  error?: string;
}

function renderValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground italic">null</span>;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-muted-foreground italic">empty</span>;
    }
    return (
      <div className="flex items-center gap-1 flex-wrap">
        {value.map((v, i) => (
          <Badge key={i} variant="outline" className="text-[10px]">
            {typeof v === 'object' ? JSON.stringify(v) : String(v)}
          </Badge>
        ))}
      </div>
    );
  }
  if (typeof value === 'boolean') {
    return (
      <Badge variant={value ? 'default' : 'secondary'} className="text-[10px]">
        {String(value)}
      </Badge>
    );
  }
  if (typeof value === 'object') {
    return (
      <code className="text-xs font-mono bg-muted px-1.5 py-0.5 rounded">
        {JSON.stringify(value)}
      </code>
    );
  }
  return <span className="text-sm">{String(value)}</span>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileIcon(contentType: string, filename: string) {
  const ct = contentType.toLowerCase();
  const fn = filename.toLowerCase();
  if (ct.includes('spreadsheet') || fn.endsWith('.xlsx') || fn.endsWith('.xls') || fn.endsWith('.csv')) {
    return <FileSpreadsheet className="size-4 text-green-600" />;
  }
  if (ct.startsWith('image/') || fn.endsWith('.png') || fn.endsWith('.jpg') || fn.endsWith('.jpeg') || fn.endsWith('.gif')) {
    return <FileImage className="size-4 text-purple-600" />;
  }
  if (ct.includes('pdf') || fn.endsWith('.pdf')) {
    return <FileText className="size-4 text-red-600" />;
  }
  if (ct.includes('word') || fn.endsWith('.docx') || fn.endsWith('.doc')) {
    return <FileText className="size-4 text-blue-600" />;
  }
  return <FileText className="size-4 text-muted-foreground" />;
}

// ---------- Email Metadata Card ----------
function EmailMetadataCard({ data }: { data: Record<string, unknown> }) {
  const subject = data.subject as string | undefined;
  const from = data.from as { name?: string; address?: string } | string | undefined;
  const to = data.to as Array<{ name?: string; address?: string }> | string | undefined;
  const cc = data.cc as Array<{ name?: string; address?: string }> | undefined;
  const date = data.date as string | undefined;
  const labels = data.labels as string[] | undefined;
  const isRead = data.isRead as boolean | undefined;
  const isStarred = data.isStarred as boolean | undefined;
  const snippet = data.snippet as string | undefined;
  const bodyLength = data.bodyLength as number | undefined;

  const formatAddr = (addr: { name?: string; address?: string } | string | undefined) => {
    if (!addr) return null;
    if (typeof addr === 'string') return addr;
    return addr.name ? `${addr.name} <${addr.address}>` : addr.address;
  };

  return (
    <div className="grid grid-cols-1 gap-2">
      {subject && (
        <div className="flex items-start gap-2">
          <Mail className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <p className="text-[10px] font-medium text-muted-foreground uppercase">Subject</p>
            <p className="text-sm font-medium">{subject}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {from && (
          <div className="flex items-start gap-2">
            <User className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase">From</p>
              <p className="text-xs">{formatAddr(from)}</p>
            </div>
          </div>
        )}
        {date && (
          <div className="flex items-start gap-2">
            <Calendar className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-[10px] font-medium text-muted-foreground uppercase">Date</p>
              <p className="text-xs">{new Date(date).toLocaleString()}</p>
            </div>
          </div>
        )}
      </div>

      {to && (
        <div className="flex items-start gap-2">
          <User className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <p className="text-[10px] font-medium text-muted-foreground uppercase">To</p>
            <p className="text-xs">
              {Array.isArray(to)
                ? to.map((a) => formatAddr(a)).join(', ')
                : String(to)}
            </p>
          </div>
        </div>
      )}

      {cc && cc.length > 0 && (
        <div className="flex items-start gap-2">
          <User className="size-3.5 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <p className="text-[10px] font-medium text-muted-foreground uppercase">CC</p>
            <p className="text-xs">{cc.map((a) => formatAddr(a)).join(', ')}</p>
          </div>
        </div>
      )}

      {/* Bottom row: indicators */}
      <div className="flex items-center gap-2 flex-wrap pt-1">
        {isRead === false && (
          <Badge variant="outline" className="text-[10px] bg-blue-50 text-blue-700 border-blue-200">
            <Eye className="size-2.5 mr-1" /> Unread
          </Badge>
        )}
        {isStarred && (
          <Badge variant="outline" className="text-[10px] bg-yellow-50 text-yellow-700 border-yellow-200">
            <Star className="size-2.5 mr-1" /> Starred
          </Badge>
        )}
        {labels && labels.length > 0 && labels.map((label) => (
          <Badge key={label} variant="outline" className="text-[10px]">
            <Tag className="size-2.5 mr-1" /> {label}
          </Badge>
        ))}
        {bodyLength != null && (
          <span className="text-[10px] text-muted-foreground">{bodyLength.toLocaleString()} chars</span>
        )}
      </div>

      {snippet && (
        <p className="text-xs text-muted-foreground italic border-l-2 border-muted pl-2">{snippet}</p>
      )}
    </div>
  );
}

// ---------- AI Analysis Cards ----------
const aiFieldMeta: Record<string, { icon: typeof Brain; label: string; color: string }> = {
  mainTopic: { icon: Brain, label: 'Main Topic', color: 'text-purple-600' },
  summary: { icon: Brain, label: 'Summary', color: 'text-blue-600' },
  sentiment: { icon: Smile, label: 'Sentiment', color: 'text-emerald-600' },
  language: { icon: Tag, label: 'Language', color: 'text-sky-600' },
  isUrgent: { icon: Zap, label: 'Urgent', color: 'text-red-600' },
  isActionRequired: { icon: AlertTriangle, label: 'Action Required', color: 'text-orange-600' },
  mentionedPeople: { icon: User, label: 'People Mentioned', color: 'text-indigo-600' },
  mentionedCompanies: { icon: Tag, label: 'Companies', color: 'text-teal-600' },
  mentionedDates: { icon: Calendar, label: 'Dates Mentioned', color: 'text-cyan-600' },
  links: { icon: Tag, label: 'Links', color: 'text-blue-500' },
  keyPhrases: { icon: Tag, label: 'Key Phrases', color: 'text-violet-600' },
};

function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' && value.trim() === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  return false;
}

function AiAnalysisCards({ fields }: { fields: Array<[string, unknown]> }) {
  // Filter out empty/null values
  const nonEmpty = fields.filter(([, value]) => !isEmptyValue(value));
  if (nonEmpty.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {nonEmpty.map(([key, value]) => {
        const meta = aiFieldMeta[key];
        const Icon = meta?.icon ?? Brain;
        const label = meta?.label ?? key;
        const iconColor = meta?.color ?? 'text-muted-foreground';

        // Render boolean fields as colored badge
        if (typeof value === 'boolean') {
          return (
            <div key={key} className="flex items-center gap-2 p-2 rounded-md border bg-card">
              <Icon className={`size-4 ${iconColor} shrink-0`} />
              <span className="text-xs font-medium">{label}</span>
              <Badge
                variant="outline"
                className={`text-[10px] ml-auto ${value ? 'bg-red-50 text-red-700 border-red-200' : 'bg-green-50 text-green-700 border-green-200'}`}
              >
                {value ? 'Yes' : 'No'}
              </Badge>
            </div>
          );
        }

        // Render arrays as tag badges
        if (Array.isArray(value)) {
          if (value.length === 0) return null;
          return (
            <div key={key} className="p-2 rounded-md border bg-card col-span-1 sm:col-span-2">
              <div className="flex items-center gap-2 mb-1.5">
                <Icon className={`size-4 ${iconColor} shrink-0`} />
                <span className="text-xs font-medium">{label}</span>
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {value.map((v, i) => (
                  <Badge key={i} variant="outline" className="text-[10px]">
                    {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                  </Badge>
                ))}
              </div>
            </div>
          );
        }

        // Render strings inline
        return (
          <div key={key} className="flex items-start gap-2 p-2 rounded-md border bg-card">
            <Icon className={`size-4 ${iconColor} shrink-0 mt-0.5`} />
            <div className="min-w-0">
              <p className="text-[10px] font-medium text-muted-foreground">{label}</p>
              <p className="text-xs">{String(value)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Attachment View ----------
function AttachmentView({ attachment }: { attachment: ParsedAttachmentData }) {
  const [expanded, setExpanded] = useState(true);
  const hasContent =
    attachment.text || attachment.markdown || attachment.tables?.length || attachment.structuredData;

  return (
    <div className="border rounded-md overflow-hidden">
      <div
        className="flex items-center gap-2 px-3 py-2 bg-muted/30 cursor-pointer hover:bg-muted/50"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        {getFileIcon(attachment.contentType, attachment.filename)}
        <span className="text-sm font-medium">{attachment.filename}</span>
        <Badge variant="outline" className="text-[10px]">
          {attachment.contentType.split('/').pop()}
        </Badge>
        <span className="text-xs text-muted-foreground">{formatBytes(attachment.size)}</span>
        {attachment.pages != null && (
          <span className="text-xs text-muted-foreground">{attachment.pages} pages</span>
        )}
        {attachment.error && (
          <Badge variant="destructive" className="text-[10px]">
            parse error
          </Badge>
        )}
      </div>

      {expanded && (
        <div className="p-3">
          {attachment.error ? (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle className="size-4" />
              <span>{attachment.error}</span>
            </div>
          ) : hasContent ? (
            <Tabs
              defaultValue={
                attachment.tables?.length ? 'tables' : attachment.text ? 'text' : 'structured'
              }
            >
              <TabsList className="h-8">
                {attachment.text && (
                  <TabsTrigger value="text" className="text-xs h-7">
                    <FileText className="size-3 mr-1" />
                    Text
                  </TabsTrigger>
                )}
                {attachment.tables && attachment.tables.length > 0 && (
                  <TabsTrigger value="tables" className="text-xs h-7">
                    <Table2 className="size-3 mr-1" />
                    Tables ({attachment.tables.length})
                  </TabsTrigger>
                )}
                {attachment.structuredData && (
                  <TabsTrigger value="structured" className="text-xs h-7">
                    Structured Data
                  </TabsTrigger>
                )}
                {attachment.images && attachment.images.length > 0 && (
                  <TabsTrigger value="images" className="text-xs h-7">
                    <Image className="size-3 mr-1" />
                    Images ({attachment.images.length})
                  </TabsTrigger>
                )}
                {attachment.metadata && (
                  <TabsTrigger value="metadata" className="text-xs h-7">
                    Metadata
                  </TabsTrigger>
                )}
              </TabsList>

              {attachment.text && (
                <TabsContent value="text" className="mt-2">
                  <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                    <pre className="text-xs whitespace-pre-wrap bg-muted/30 p-3 rounded">
                      {attachment.text}
                    </pre>
                  </div>
                </TabsContent>
              )}

              {attachment.tables && attachment.tables.length > 0 && (
                <TabsContent value="tables" className="mt-2">
                  <div className="space-y-3">
                    {attachment.tables.map((table, ti) => (
                      <div key={ti}>
                        {table.sheetName && (
                          <p className="text-xs font-medium text-muted-foreground mb-1">
                            {table.sheetName}
                          </p>
                        )}
                        <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                          <table className="w-full text-xs border">
                            <thead>
                              <tr className="bg-muted/50">
                                {table.headers.map((h, hi) => (
                                  <th
                                    key={hi}
                                    className="px-2 py-1 text-left border-b font-medium"
                                  >
                                    {h}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {table.rows.slice(0, 50).map((row, ri) => (
                                <tr key={ri} className="border-b last:border-b-0">
                                  {row.map((cell, ci) => (
                                    <td key={ci} className="px-2 py-1">
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                              {table.rows.length > 50 && (
                                <tr>
                                  <td
                                    colSpan={table.headers.length}
                                    className="px-2 py-1 text-muted-foreground italic"
                                  >
                                    ...and {table.rows.length - 50} more rows
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                </TabsContent>
              )}

              {attachment.structuredData && (
                <TabsContent value="structured" className="mt-2">
                  <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                    <pre className="text-xs whitespace-pre-wrap bg-muted/30 p-3 rounded font-mono">
                      {JSON.stringify(attachment.structuredData, null, 2)}
                    </pre>
                  </div>
                </TabsContent>
              )}

              {attachment.images && attachment.images.length > 0 && (
                <TabsContent value="images" className="mt-2">
                  <div className="space-y-2">
                    {attachment.images.map((img, ii) => (
                      <div key={ii} className="p-2 bg-muted/30 rounded text-xs space-y-1">
                        {img.description && <p>{img.description}</p>}
                        {img.text && (
                          <p className="text-muted-foreground">
                            <span className="font-medium">OCR: </span>
                            {img.text}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </TabsContent>
              )}

              {attachment.metadata && (
                <TabsContent value="metadata" className="mt-2">
                  <div className="border rounded-md overflow-hidden">
                    <table className="w-full text-xs">
                      <tbody>
                        {Object.entries(attachment.metadata).map(([key, val]) => (
                          <tr key={key} className="border-b last:border-b-0">
                            <td className="px-2 py-1 font-mono font-semibold text-muted-foreground bg-muted/30 w-32">
                              {key}
                            </td>
                            <td className="px-2 py-1">{renderValue(val)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </TabsContent>
              )}
            </Tabs>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              No extractable content found in this attachment.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- Main Component ----------
export function ExtractionResultView({ data }: { data: unknown }) {
  const raw = data as ComprehensiveData;

  // New comprehensive shape: { emailData, aiAnalysis, attachments }
  const emailData = raw.emailData as Record<string, unknown> | undefined;
  const aiAnalysis = raw.aiAnalysis as Record<string, unknown> | undefined;
  const attachments = Array.isArray(raw.attachments)
    ? (raw.attachments as ParsedAttachmentData[])
    : undefined;
  const attachmentCount =
    typeof raw.attachmentCount === 'number' ? raw.attachmentCount : undefined;

  // AI analysis fields
  const aiError = aiAnalysis?._aiExtractionError as string | undefined;
  const confidence =
    typeof aiAnalysis?.confidence === 'number' ? aiAnalysis.confidence : undefined;
  const sources = Array.isArray(aiAnalysis?.sources) ? aiAnalysis.sources as Array<{ field?: string; text?: string }> : undefined;
  const aiData = aiAnalysis?.data as Record<string, unknown> | undefined;

  // Get the AI-extracted fields (may be nested under .data or at top level)
  const aiFields = aiData
    ? Object.entries(aiData)
    : aiAnalysis
      ? Object.entries(aiAnalysis).filter(
          ([key]) => !['confidence', 'sources', 'data', '_aiExtractionError'].includes(key),
        )
      : [];

  // Legacy support: if no emailData/aiAnalysis, treat as flat extraction result
  if (!emailData && !aiAnalysis) {
    const extractedData =
      raw.data && typeof raw.data === 'object' ? raw.data : raw;
    const legacyConfidence =
      typeof raw.confidence === 'number' ? raw.confidence : undefined;
    const legacySources = Array.isArray(raw.sources) ? raw.sources : undefined;
    const fields = Object.entries(extractedData).filter(
      ([key]) =>
        !['confidence', 'sources', 'data', 'attachments', 'attachmentCount'].includes(key),
    );
    const confidencePercent =
      legacyConfidence != null ? Math.round(legacyConfidence * 100) : null;

    return (
      <div className="space-y-4">
        {confidencePercent != null && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">Confidence:</span>
            <div className="flex-1 max-w-48 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${confidencePercent}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground w-10 text-right">
              {confidencePercent}%
            </span>
          </div>
        )}
        <AiAnalysisCards fields={fields} />
        {legacySources && legacySources.filter((s) => s.text?.trim()).length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
              Sources
            </h4>
            <div className="space-y-1.5">
              {legacySources.filter((s) => s.text?.trim()).map((source, i) => (
                <div key={i} className="text-xs">
                  {source.field && (
                    <span className="font-mono font-semibold">{source.field}: </span>
                  )}
                  <span className="text-muted-foreground italic">{source.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  const confidencePercent = confidence != null ? Math.round(confidence * 100) : null;

  return (
    <div className="space-y-4">
      {/* Confidence bar (from AI analysis) */}
      {confidencePercent != null && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground shrink-0">AI Confidence:</span>
          <div className="flex-1 max-w-48 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${confidencePercent}%` }}
            />
          </div>
          <span className="text-xs text-muted-foreground w-10 text-right">
            {confidencePercent}%
          </span>
        </div>
      )}

      {/* Email Metadata — Card Layout */}
      {emailData && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Mail className="size-3.5" />
            Email Metadata
          </h4>
          <div className="border rounded-md p-3 bg-card">
            <EmailMetadataCard data={emailData} />
          </div>
        </div>
      )}

      {/* AI extraction error */}
      {aiError && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200">
          <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs">
            <p className="font-medium text-amber-800">AI extraction failed (non-blocking)</p>
            <p className="text-amber-700 mt-0.5">{aiError}</p>
            <p className="text-amber-600 mt-1">
              Raw email data and attachments were still extracted successfully.
            </p>
          </div>
        </div>
      )}

      {/* AI-extracted semantic fields — Card Layout */}
      {aiFields.length > 0 && !aiError && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Brain className="size-3.5" />
            AI Analysis
          </h4>
          <AiAnalysisCards fields={aiFields} />
        </div>
      )}

      {/* Sources — only show entries that have actual text */}
      {sources && sources.filter((s) => s.text?.trim()).length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
            Sources
          </h4>
          <div className="space-y-1.5">
            {sources.filter((s) => s.text?.trim()).map((source, i) => (
              <div key={i} className="text-xs">
                {source.field && (
                  <span className="font-mono font-semibold">{source.field}: </span>
                )}
                <span className="text-muted-foreground italic">{source.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Attachments section */}
      {attachmentCount != null && (
        <div>
          <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Paperclip className="size-3.5" />
            Attachments ({attachmentCount})
          </h4>
          {attachments && attachments.length > 0 ? (
            <div className="space-y-2">
              {attachments.map((att, i) => (
                <AttachmentView key={i} attachment={att} />
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">
              No attachments on this email.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
