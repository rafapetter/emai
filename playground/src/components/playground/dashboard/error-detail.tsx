'use client';

import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  AlertTriangle,
  Wifi,
  Brain,
  Settings,
  HelpCircle,
  Lightbulb,
  ChevronRight,
} from 'lucide-react';

type ErrorCategory = 'schema' | 'network' | 'llm' | 'config' | 'unknown';

interface ClassifiedError {
  category: ErrorCategory;
  title: string;
  explanation: string;
  suggestion: string;
}

const categoryConfig: Record<
  ErrorCategory,
  { icon: typeof AlertTriangle; color: string; badgeClass: string }
> = {
  schema: {
    icon: AlertTriangle,
    color: 'text-amber-600',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  network: {
    icon: Wifi,
    color: 'text-red-600',
    badgeClass: 'bg-red-100 text-red-800 border-red-200',
  },
  llm: {
    icon: Brain,
    color: 'text-purple-600',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-200',
  },
  config: {
    icon: Settings,
    color: 'text-blue-600',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  unknown: {
    icon: HelpCircle,
    color: 'text-gray-600',
    badgeClass: 'bg-gray-100 text-gray-800 border-gray-200',
  },
};

function classifyError(error: string): ClassifiedError {
  const lower = error.toLowerCase();

  if (
    lower.includes('expected string, received') ||
    lower.includes('expected number, received') ||
    lower.includes('expected boolean, received') ||
    lower.includes('schema validation') ||
    (lower.includes('required') && lower.includes(':'))
  ) {
    const hasNull = lower.includes('received null') || lower.includes('received undefined');
    return {
      category: hasNull ? 'llm' : 'schema',
      title: hasNull ? 'AI Model Returned Incomplete Data' : 'Schema Validation Failed',
      explanation: hasNull
        ? 'The AI model returned null or undefined for a required field. This can happen with emails that lack explicit deadlines, assignees, or other structured data.'
        : 'The extracted data does not match the expected schema. A field type mismatch occurred between what was expected and what was returned.',
      suggestion: hasNull
        ? 'This is often normal — not all emails contain every data point. Consider marking these fields as optional, or try with a different email.'
        : 'Check that the extraction fields match the actual email data structure. Ensure field types (string, number, boolean) align with what the email contains.',
    };
  }

  if (
    lower.includes('fetch') ||
    lower.includes('econnrefused') ||
    lower.includes('timeout') ||
    lower.includes('network') ||
    lower.includes('enotfound')
  ) {
    return {
      category: 'network',
      title: 'Network Connection Error',
      explanation:
        'The request failed due to a network issue. The email provider or AI service may be unreachable.',
      suggestion:
        'Check your internet connection and ensure the email provider (IMAP/SMTP) and AI service are accessible. Try again in a moment.',
    };
  }

  if (lower.includes('not connected') || lower.includes('visit /config') || lower.includes('no provider')) {
    return {
      category: 'config',
      title: 'Configuration Required',
      explanation: 'The email provider is not connected. You need to configure your connection settings first.',
      suggestion:
        'Go to the Configuration page and set up your email provider (IMAP credentials) and AI adapter.',
    };
  }

  if (
    lower.includes('rate limit') ||
    lower.includes('429') ||
    lower.includes('quota') ||
    lower.includes('too many requests')
  ) {
    return {
      category: 'llm',
      title: 'AI Rate Limit Reached',
      explanation: 'The AI provider has rate-limited the requests. Too many API calls were made in a short period.',
      suggestion: 'Wait a minute and try again, or consider upgrading your AI provider plan for higher limits.',
    };
  }

  if (lower.includes('embedding') || lower.includes('generate embedding')) {
    return {
      category: 'llm',
      title: 'Embedding Generation Failed',
      explanation:
        'The AI provider failed to generate vector embeddings for the email content. This is needed for semantic search.',
      suggestion:
        'Verify your AI provider supports embedding generation and the API key is valid. Some models may not support embeddings.',
    };
  }

  if (lower.includes('failed to summarize') || lower.includes('failed to classify') || lower.includes('failed to')) {
    return {
      category: 'llm',
      title: 'AI Processing Failed',
      explanation:
        'The AI model was unable to process this email. The content may be too short, in an unsupported language, or the model returned an unexpected format.',
      suggestion:
        'Try with a different email that has more content. If the issue persists, check your AI provider configuration.',
    };
  }

  return {
    category: 'unknown',
    title: 'Unexpected Error',
    explanation: 'An unexpected error occurred during this test step.',
    suggestion: 'Review the raw error details below for more context. This may be a transient issue — try running the test again.',
  };
}

interface ErrorDetailProps {
  error: string;
}

export function ErrorDetail({ error }: ErrorDetailProps) {
  const [open, setOpen] = useState(false);
  const classified = classifyError(error);
  const config = categoryConfig[classified.category];
  const Icon = config.icon;

  return (
    <div className="rounded-lg border border-red-200 bg-red-50/50 p-4 mb-3 space-y-3">
      <div className="flex items-start gap-3">
        <Icon className={`size-5 mt-0.5 shrink-0 ${config.color}`} />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={`text-[10px] ${config.badgeClass}`}>
              {classified.category}
            </Badge>
            <span className="text-sm font-medium text-red-900">{classified.title}</span>
          </div>
          <p className="text-sm text-red-800/80">{classified.explanation}</p>
          <div className="flex items-start gap-2 p-2 rounded bg-amber-50 border border-amber-200">
            <Lightbulb className="size-3.5 text-amber-600 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-800">{classified.suggestion}</p>
          </div>
        </div>
      </div>

      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <ChevronRight className={`size-3 transition-transform ${open ? 'rotate-90' : ''}`} />
          {open ? 'Hide' : 'Show'} raw error
        </CollapsibleTrigger>
        <CollapsibleContent>
          <pre className="mt-2 p-3 rounded bg-gray-900 text-gray-100 text-xs overflow-x-auto whitespace-pre-wrap break-all">
            {error}
          </pre>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
