'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Mail,
  Paperclip,
  Eye,
  Star,
  Users,
  Calendar,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Lightbulb,
  AlertTriangle,
  Info,
  BarChart3,
  Clock,
  Zap,
  TrendingUp,
} from 'lucide-react';
import type { EmailDiversityStats, EmailSamples } from '@/lib/email-sampler';

interface TestInfo {
  name: string;
  data: unknown;
  error: string | null;
  duration: number | null;
}

interface ReportCardProps {
  tests: TestInfo[];
  emailSamples: EmailSamples | null;
}

type TestStatus = 'passed' | 'failed' | 'skipped';

function getTestStatus(test: TestInfo): TestStatus {
  if (test.error) return 'failed';
  if (test.data != null) return 'passed';
  return 'skipped';
}

function StatusIcon({ status }: { status: TestStatus }) {
  switch (status) {
    case 'passed':
      return <CheckCircle2 className="size-4 text-green-600" />;
    case 'failed':
      return <XCircle className="size-4 text-red-600" />;
    case 'skipped':
      return <MinusCircle className="size-4 text-gray-400" />;
  }
}

function statusBadgeClass(status: TestStatus): string {
  switch (status) {
    case 'passed':
      return 'bg-green-50 text-green-700 border-green-200';
    case 'failed':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'skipped':
      return 'bg-gray-50 text-gray-500 border-gray-200';
  }
}

function extractNotes(test: TestInfo): string {
  if (test.error) return 'Error';
  if (test.data == null) return '--';

  const data = test.data as Record<string, unknown>;

  switch (test.name) {
    case 'Email Fetch': {
      const items = data.items as unknown[] | undefined;
      return items ? `${items.length} emails fetched` : '--';
    }
    case 'Data Extraction': {
      const parts: string[] = [];
      const emailData = data.emailData as Record<string, unknown> | undefined;
      const aiAnalysis = data.aiAnalysis as Record<string, unknown> | undefined;
      const attCount = data.attachmentCount as number | undefined;
      if (emailData) parts.push(`${Object.keys(emailData).length} metadata fields`);
      if (aiAnalysis && !aiAnalysis._aiExtractionError) {
        const aiData = (aiAnalysis.data ?? aiAnalysis) as Record<string, unknown>;
        const aiFields = Object.keys(aiData).filter((k) => !['confidence', 'sources', 'data'].includes(k));
        if (aiFields.length > 0) parts.push(`${aiFields.length} AI fields`);
      }
      if (attCount != null) parts.push(`${attCount} attachment${attCount !== 1 ? 's' : ''}`);
      return parts.length > 0 ? parts.join(', ') : '--';
    }
    case 'Classification': {
      if (Array.isArray(data)) return `${data.length} emails classified`;
      return '1 email classified';
    }
    case 'Summarization': {
      const summary = data.summary as string | undefined;
      return summary ? `${summary.length} char summary` : '--';
    }
    case 'Prioritization': {
      if (Array.isArray(data)) return `${data.length} emails scored`;
      return '1 email scored';
    }
    case 'Action Detection': {
      const items = Array.isArray(data)
        ? data
        : (data.items as unknown[] | undefined) ?? [];
      return `${items.length} action${items.length !== 1 ? 's' : ''} found`;
    }
    case 'AI Compose': {
      const text = data.text as string | undefined;
      return text ? `${text.length} char response generated` : '--';
    }
    case 'Safety Scan': {
      const safe = data.safe as boolean | undefined;
      const risks = data.risks as unknown[] | undefined;
      if (safe === true) return 'No risks detected';
      return risks ? `${risks.length} risk${risks.length !== 1 ? 's' : ''} found` : '--';
    }
    case 'Search Index': {
      const indexed = data.indexed as number | undefined;
      return indexed != null ? `${indexed} emails indexed` : '--';
    }
    case 'Semantic Search': {
      if (Array.isArray(data)) return `${data.length} result${data.length !== 1 ? 's' : ''}`;
      return '--';
    }
    default:
      return '--';
  }
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail;
  label: string;
  value: string | number;
}) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 min-w-0">
      <Icon className="size-4 text-muted-foreground shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{value}</p>
        <p className="text-[10px] text-muted-foreground truncate">{label}</p>
      </div>
    </div>
  );
}

interface Recommendation {
  type: 'success' | 'warning' | 'info';
  message: string;
}

function generateRecommendations(tests: TestInfo[], samples: EmailSamples | null): Recommendation[] {
  const recs: Recommendation[] = [];
  const passed = tests.filter((t) => getTestStatus(t) === 'passed').length;
  const failed = tests.filter((t) => getTestStatus(t) === 'failed').length;

  if (passed === tests.length) {
    recs.push({ type: 'success', message: 'All features are working correctly. Your emai setup is fully operational.' });
  }

  if (failed > 0 && passed > 0) {
    recs.push({
      type: 'info',
      message: `${passed} of ${tests.length} tests passed. Review the failed sections above for detailed error information and suggested fixes.`,
    });
  }

  // Specific test failures
  const extraction = tests.find((t) => t.name === 'Data Extraction');
  if (extraction?.error) {
    recs.push({
      type: 'warning',
      message: 'Data extraction failed. This is often due to field type mismatches — ensure the schema fields map to actual primitive values in the email.',
    });
  }

  const search = tests.find((t) => t.name === 'Search Index' || t.name === 'Semantic Search');
  if (search?.error) {
    recs.push({
      type: 'warning',
      message: 'Search features failed. Verify your AI provider supports embedding generation. Some models (e.g., certain Gemini versions) may not support embeddings.',
    });
  }

  const summarize = tests.find((t) => t.name === 'Summarization');
  if (summarize?.error?.includes('null')) {
    recs.push({
      type: 'info',
      message: 'Summarization had issues with null fields. This is common when emails lack explicit deadlines or assignees — the AI model returns null for optional data.',
    });
  }

  // Diversity-based recommendations
  if (samples) {
    const { stats } = samples;
    if (stats.withAttachments === 0) {
      recs.push({ type: 'info', message: 'No emails with attachments were found. Attachment parsing features could not be tested.' });
    }
    if (stats.starred === 0) {
      recs.push({ type: 'info', message: 'No starred emails found. Star some emails in your inbox to test starred-email filtering.' });
    }
    if (stats.total < 10) {
      recs.push({ type: 'info', message: `Only ${stats.total} emails available. More emails would provide better test coverage for batch operations.` });
    }
    if (stats.uniqueSenders <= 2) {
      recs.push({ type: 'info', message: 'Very few unique senders. Classification and priority scoring work best with diverse sender patterns.' });
    }
  }

  return recs;
}

function RecommendationIcon({ type }: { type: 'success' | 'warning' | 'info' }) {
  switch (type) {
    case 'success':
      return <CheckCircle2 className="size-3.5 text-green-600 shrink-0 mt-0.5" />;
    case 'warning':
      return <AlertTriangle className="size-3.5 text-amber-600 shrink-0 mt-0.5" />;
    case 'info':
      return <Info className="size-3.5 text-blue-600 shrink-0 mt-0.5" />;
  }
}

export function ReportCard({ tests, emailSamples }: ReportCardProps) {
  const passed = tests.filter((t) => getTestStatus(t) === 'passed').length;
  const failed = tests.filter((t) => getTestStatus(t) === 'failed').length;
  const totalDuration = tests.reduce((sum, t) => sum + (t.duration ?? 0), 0);
  const completedTests = tests.filter((t) => t.duration != null && t.duration > 0);
  const fastestTest = completedTests.length > 0
    ? completedTests.reduce((min, t) => ((t.duration ?? Infinity) < (min.duration ?? Infinity) ? t : min))
    : null;
  const slowestTest = completedTests.length > 0
    ? completedTests.reduce((max, t) => ((t.duration ?? 0) > (max.duration ?? 0) ? t : max))
    : null;

  const recommendations = generateRecommendations(tests, emailSamples);
  const stats = emailSamples?.stats;

  // Extract AI confidence data
  const classifyData = tests.find((t) => t.name === 'Classification')?.data;
  const classifyItems = Array.isArray(classifyData) ? classifyData : [];
  const avgConfidence =
    classifyItems.length > 0
      ? classifyItems.reduce((sum: number, c: Record<string, unknown>) => sum + (Number(c.confidence) || 0), 0) / classifyItems.length
      : null;

  // Category distribution
  const categories: Record<string, number> = {};
  for (const item of classifyItems) {
    const cat = String((item as Record<string, unknown>).category ?? 'unknown');
    categories[cat] = (categories[cat] ?? 0) + 1;
  }
  const topCategories = Object.entries(categories)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4);

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="size-5 text-primary" />
          <CardTitle className="text-base">Test Report</CardTitle>
          <div className="flex items-center gap-2 ml-auto">
            {passed > 0 && (
              <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700 border-green-200">
                {passed} passed
              </Badge>
            )}
            {failed > 0 && (
              <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-200">
                {failed} failed
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Feature Coverage Grid */}
        <div>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Feature Coverage</h4>
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left p-2 text-xs font-medium text-muted-foreground">Feature</th>
                  <th className="text-left p-2 text-xs font-medium text-muted-foreground w-20">Status</th>
                  <th className="text-right p-2 text-xs font-medium text-muted-foreground w-20">Time</th>
                  <th className="text-left p-2 text-xs font-medium text-muted-foreground">Details</th>
                </tr>
              </thead>
              <tbody>
                {tests.map((test) => {
                  const status = getTestStatus(test);
                  return (
                    <tr key={test.name} className="border-t">
                      <td className="p-2 flex items-center gap-2">
                        <StatusIcon status={status} />
                        <span className="text-xs">{test.name}</span>
                      </td>
                      <td className="p-2">
                        <Badge variant="outline" className={`text-[10px] ${statusBadgeClass(status)}`}>
                          {status}
                        </Badge>
                      </td>
                      <td className="p-2 text-right text-xs text-muted-foreground">
                        {test.duration != null ? `${test.duration.toFixed(0)}ms` : '--'}
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">{extractNotes(test)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Email Diversity Stats */}
        {stats && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Email Diversity</h4>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              <StatCard icon={Mail} label="Total" value={stats.total} />
              <StatCard icon={Paperclip} label="With files" value={stats.withAttachments} />
              <StatCard icon={Eye} label="Unread" value={stats.unread} />
              <StatCard icon={Star} label="Starred" value={stats.starred} />
              <StatCard icon={Users} label="Senders" value={stats.uniqueSenders} />
              <StatCard
                icon={Calendar}
                label="Date range"
                value={
                  stats.dateRange
                    ? `${Math.ceil((new Date(stats.dateRange.newest).getTime() - new Date(stats.dateRange.oldest).getTime()) / 86400000)}d`
                    : '--'
                }
              />
            </div>
          </div>
        )}

        {/* AI Confidence + Performance side by side */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* AI Confidence */}
          {(avgConfidence != null || topCategories.length > 0) && (
            <div>
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">AI Insights</h4>
              <div className="space-y-2">
                {avgConfidence != null && (
                  <div className="flex items-center gap-2">
                    <TrendingUp className="size-3.5 text-muted-foreground" />
                    <span className="text-xs">Avg classification confidence:</span>
                    <span className="text-xs font-medium">{Math.round(avgConfidence * 100)}%</span>
                  </div>
                )}
                {topCategories.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {topCategories.map(([cat, count]) => (
                      <Badge key={cat} variant="secondary" className="text-[10px]">
                        {cat}: {count}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Performance */}
          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Performance</h4>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs">
                <Clock className="size-3.5 text-muted-foreground" />
                <span>Total:</span>
                <span className="font-medium">{(totalDuration / 1000).toFixed(1)}s</span>
              </div>
              {fastestTest && (
                <div className="flex items-center gap-2 text-xs">
                  <Zap className="size-3.5 text-green-500" />
                  <span>Fastest:</span>
                  <span className="font-medium">{fastestTest.name} ({fastestTest.duration?.toFixed(0)}ms)</span>
                </div>
              )}
              {slowestTest && (
                <div className="flex items-center gap-2 text-xs">
                  <Clock className="size-3.5 text-amber-500" />
                  <span>Slowest:</span>
                  <span className="font-medium">{slowestTest.name} ({slowestTest.duration?.toFixed(0)}ms)</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <div>
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Lightbulb className="size-3.5" />
              Recommendations
            </h4>
            <div className="space-y-2">
              {recommendations.map((rec, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <RecommendationIcon type={rec.type} />
                  <span className="text-muted-foreground">{rec.message}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
