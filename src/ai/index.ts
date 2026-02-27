import type { z } from 'zod';
import type {
  AiConfig,
  LLMAdapter,
  Email,
  Thread,
  ClassificationResult,
  SummaryResult,
  PriorityResult,
  ActionItem,
  ComposeOptions,
  ComposeResult,
  ExtractionResult,
  ParsedAttachment,
} from '../core/types.js';
import { AdapterNotConfiguredError } from '../core/errors.js';
import { createAdapter } from './adapter.js';
import { ClassifyEngine } from './classify.js';
import { ExtractEngine } from './extract.js';
import { ComposeEngine } from './compose.js';
import { SummarizeEngine } from './summarize.js';
import { PriorityEngine } from './priority.js';
import { ActionsEngine } from './actions.js';

export class AiEngine {
  readonly adapter: LLMAdapter;
  readonly classify: ClassifyEngine;
  readonly extract: ExtractEngine;
  readonly compose: ComposeEngine;
  readonly summarize: SummarizeEngine;
  readonly priority: PriorityEngine;
  readonly actions: ActionsEngine;

  constructor(config: AiConfig);
  constructor(adapter: LLMAdapter);
  constructor(configOrAdapter: AiConfig | LLMAdapter) {
    if (isLLMAdapter(configOrAdapter)) {
      this.adapter = configOrAdapter;
    } else {
      this.adapter = createAdapter(configOrAdapter);
    }

    this.classify = new ClassifyEngine(this.adapter);
    this.extract = new ExtractEngine(this.adapter);
    this.compose = new ComposeEngine(this.adapter);
    this.summarize = new SummarizeEngine(this.adapter);
    this.priority = new PriorityEngine(this.adapter);
    this.actions = new ActionsEngine(this.adapter);
  }

  async classifyEmail(email: Email): Promise<ClassificationResult> {
    return this.classify.classify(email);
  }

  async classifyEmails(emails: Email[]): Promise<ClassificationResult[]> {
    return this.classify.classifyBatch(emails);
  }

  async summarizeEmail(email: Email): Promise<SummaryResult> {
    return this.summarize.summarize(email);
  }

  async summarizeThread(thread: Thread): Promise<SummaryResult> {
    return this.summarize.summarizeThread(thread);
  }

  async summarizeEmails(emails: Email[]): Promise<string> {
    return this.summarize.summarizeBatch(emails);
  }

  async prioritizeEmail(
    email: Email,
    context?: { userEmail?: string; vipList?: string[] },
  ): Promise<PriorityResult> {
    return this.priority.prioritize(email, context);
  }

  async prioritizeEmails(
    emails: Email[],
    context?: { userEmail?: string; vipList?: string[] },
  ): Promise<Array<{ email: Email; priority: PriorityResult }>> {
    return this.priority.prioritizeBatch(emails, context);
  }

  async composeEmail(options: ComposeOptions): Promise<ComposeResult> {
    return this.compose.compose(options);
  }

  async replyToEmail(
    email: Email,
    options: ComposeOptions,
  ): Promise<ComposeResult> {
    return this.compose.reply(email, options);
  }

  async rewriteInTone(text: string, tone: string): Promise<string> {
    return this.compose.rewriteInTone(text, tone);
  }

  async improveWriting(text: string): Promise<string> {
    return this.compose.improveWriting(text);
  }

  async extractData<T>(
    email: Email,
    schema: z.ZodType<T>,
  ): Promise<ExtractionResult<T>> {
    return this.extract.extract(email, schema);
  }

  async extractFromAttachment<T>(
    attachment: ParsedAttachment,
    schema: z.ZodType<T>,
  ): Promise<ExtractionResult<T>> {
    return this.extract.extractFromAttachment(attachment, schema);
  }

  async detectActions(email: Email): Promise<ActionItem[]> {
    return this.actions.detectActions(email);
  }

  async detectActionsInThread(thread: Thread): Promise<ActionItem[]> {
    return this.actions.detectActionsInThread(thread);
  }
}

function isLLMAdapter(value: unknown): value is LLMAdapter {
  return (
    typeof value === 'object' &&
    value !== null &&
    'name' in value &&
    'complete' in value &&
    'completeJSON' in value &&
    'embed' in value
  );
}

export function createAiEngine(config: AiConfig): AiEngine {
  return new AiEngine(config);
}

export function requireAiEngine(
  engine: AiEngine | undefined,
  feature: string,
): AiEngine {
  if (!engine) throw new AdapterNotConfiguredError(feature);
  return engine;
}

export { createAdapter } from './adapter.js';
export { BaseLLMAdapter } from './adapter.js';
export { ClassifyEngine } from './classify.js';
export { ExtractEngine } from './extract.js';
export { ComposeEngine } from './compose.js';
export { SummarizeEngine } from './summarize.js';
export { PriorityEngine } from './priority.js';
export { ActionsEngine } from './actions.js';
export { OpenAIAdapter, AnthropicAdapter, GoogleAdapter, OllamaAdapter } from './adapters/index.js';
