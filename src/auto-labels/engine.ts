import { z } from 'zod';
import type { Email, LLMAdapter, StorageAdapter } from '../core/types.js';
import { AiError, ValidationError } from '../core/errors.js';
import { emailToPlainText, truncate, generateId } from '../core/utils.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AutoLabelRule {
  id: string;
  name: string;
  rule: string;
  labelName: string;
  labelColor?: string;
  enabled: boolean;
  createdAt: string;
}

export interface CreateAutoLabelOptions {
  name: string;
  rule: string;
  labelName: string;
  labelColor?: string;
}

export interface AppliedLabel {
  ruleId: string;
  ruleName: string;
  labelName: string;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

const RuleMatchResultSchema = z.array(
  z.object({
    ruleId: z.string(),
    matches: z.boolean(),
    confidence: z.number().min(0).max(1),
  }),
);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_INDEX_KEY = 'autolabels:index';
const CONFIDENCE_THRESHOLD = 0.7;

function storageKey(id: string): string {
  return `autolabels:${id}`;
}

// ---------------------------------------------------------------------------
// System Prompt
// ---------------------------------------------------------------------------

const LABEL_MATCHING_SYSTEM_PROMPT = `You are an email labeling assistant. Given an email and a set of user-defined labeling rules (described in natural language), determine which rules match the email.

Guidelines:
- Evaluate each rule independently against the email content
- Consider the email's sender, subject, body, date, and recipients
- Rules are natural language descriptions, interpret them broadly but accurately
- Confidence should reflect how clearly the email matches the rule:
  - 0.9-1.0: Perfect match, rule clearly applies
  - 0.7-0.8: Strong match, rule likely applies
  - 0.5-0.6: Partial match, some aspects align
  - 0.3-0.4: Weak match, tangentially related
  - 0.0-0.2: Does not match the rule`;

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class AutoLabelEngine {
  constructor(
    private readonly adapter: LLMAdapter,
    private readonly storage: StorageAdapter,
  ) {}

  // ---- Index helpers --------------------------------------------------------

  private async getIndex(): Promise<string[]> {
    const raw = await this.storage.getMetadata(STORAGE_INDEX_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  }

  private async setIndex(ids: string[]): Promise<void> {
    await this.storage.setMetadata(STORAGE_INDEX_KEY, JSON.stringify(ids));
  }

  // ---- CRUD -----------------------------------------------------------------

  async create(options: CreateAutoLabelOptions): Promise<AutoLabelRule> {
    if (!options.name || !options.rule || !options.labelName) {
      throw new ValidationError(
        'Auto-label rule requires name, rule, and labelName',
      );
    }

    const rule: AutoLabelRule = {
      id: generateId(),
      name: options.name,
      rule: options.rule,
      labelName: options.labelName,
      labelColor: options.labelColor,
      enabled: true,
      createdAt: new Date().toISOString(),
    };

    await this.storage.setMetadata(storageKey(rule.id), JSON.stringify(rule));

    const index = await this.getIndex();
    index.push(rule.id);
    await this.setIndex(index);

    return rule;
  }

  async list(): Promise<AutoLabelRule[]> {
    const index = await this.getIndex();
    const rules: AutoLabelRule[] = [];

    for (const id of index) {
      const rule = await this.get(id);
      if (rule) rules.push(rule);
    }

    return rules;
  }

  async get(id: string): Promise<AutoLabelRule | null> {
    const raw = await this.storage.getMetadata(storageKey(id));
    if (!raw) return null;
    return JSON.parse(raw) as AutoLabelRule;
  }

  async update(
    id: string,
    updates: Partial<CreateAutoLabelOptions>,
  ): Promise<AutoLabelRule> {
    const existing = await this.get(id);
    if (!existing) {
      throw new ValidationError(`Auto-label rule not found: ${id}`);
    }

    const updated: AutoLabelRule = {
      ...existing,
      name: updates.name ?? existing.name,
      rule: updates.rule ?? existing.rule,
      labelName: updates.labelName ?? existing.labelName,
      labelColor:
        updates.labelColor !== undefined
          ? updates.labelColor
          : existing.labelColor,
    };

    await this.storage.setMetadata(storageKey(id), JSON.stringify(updated));

    return updated;
  }

  async delete(id: string): Promise<void> {
    const existing = await this.get(id);
    if (!existing) {
      throw new ValidationError(`Auto-label rule not found: ${id}`);
    }

    await this.storage.setMetadata(storageKey(id), '');

    const index = await this.getIndex();
    const filtered = index.filter((i) => i !== id);
    await this.setIndex(filtered);
  }

  // ---- Label application ----------------------------------------------------

  async apply(email: Email): Promise<AppliedLabel[]> {
    const rules = await this.list();
    const enabledRules = rules.filter((r) => r.enabled);

    if (enabledRules.length === 0) return [];

    const emailText = truncate(emailToPlainText(email), 2000);

    // Build rules description for batch evaluation
    const rulesDescription = enabledRules
      .map((r) => `[Rule ID: ${r.id}] "${r.name}": ${r.rule}`)
      .join('\n');

    const prompt = `Evaluate this email against each labeling rule. For each rule, determine if the email matches.

Email:
${emailText}

Rules:
${rulesDescription}

Return a JSON array where each element has:
- ruleId: the rule ID
- matches: boolean indicating if the email matches the rule
- confidence: how confident you are in the match (0.0-1.0)`;

    try {
      const results = await this.adapter.completeJSON(
        prompt,
        RuleMatchResultSchema,
        { systemPrompt: LABEL_MATCHING_SYSTEM_PROMPT, temperature: 0.1 },
      );

      // Build a lookup for the rules
      const ruleMap = new Map(enabledRules.map((r) => [r.id, r]));

      return results
        .filter((r) => r.matches && r.confidence >= CONFIDENCE_THRESHOLD)
        .map((r) => {
          const rule = ruleMap.get(r.ruleId);
          return {
            ruleId: r.ruleId,
            ruleName: rule?.name ?? 'Unknown',
            labelName: rule?.labelName ?? 'Unknown',
            confidence: r.confidence,
          };
        })
        .filter((label) => label.ruleName !== 'Unknown');
    } catch (err) {
      throw new AiError(
        `Failed to apply auto-labels: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  async applyBatch(emails: Email[]): Promise<Map<string, AppliedLabel[]>> {
    const result = new Map<string, AppliedLabel[]>();

    for (const email of emails) {
      try {
        const labels = await this.apply(email);
        result.set(email.id, labels);
      } catch {
        // On failure for a single email, set empty labels and continue
        result.set(email.id, []);
      }
    }

    return result;
  }
}
