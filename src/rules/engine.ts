import type { StorageAdapter, Email, LLMAdapter } from '../core/types.js';
import { generateId } from '../core/utils.js';
import { ValidationError } from '../core/errors.js';
import {
  evaluateConditions,
  type RuleCondition,
  type ConditionContext,
} from './conditions.js';
import { executeAction, type RuleAction, type ActionContext } from './actions.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Rule {
  id: string;
  name: string;
  description?: string;
  conditions: RuleCondition[];
  conditionLogic: 'and' | 'or';
  actions: RuleAction[];
  enabled: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
  lastTriggered?: string;
  triggerCount: number;
}

export interface CreateRuleOptions {
  name: string;
  description?: string;
  conditions: RuleCondition[];
  conditionLogic?: 'and' | 'or';
  actions: RuleAction[];
  enabled?: boolean;
  priority?: number;
}

export interface MatchedRule {
  rule: Rule;
  matched: boolean;
}

export interface RuleExecutionResult {
  rule: Rule;
  matched: boolean;
  actionsExecuted: Array<{
    action: RuleAction;
    success: boolean;
    error?: string;
  }>;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_INDEX_KEY = 'rule:index';

function storageKey(id: string): string {
  return `rule:${id}`;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class RulesEngine {
  constructor(private readonly storage: StorageAdapter) {}

  // ---- Index helpers ------------------------------------------------------

  private async getIndex(): Promise<string[]> {
    const raw = await this.storage.getMetadata(STORAGE_INDEX_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as string[];
  }

  private async setIndex(ids: string[]): Promise<void> {
    await this.storage.setMetadata(STORAGE_INDEX_KEY, JSON.stringify(ids));
  }

  private async load(id: string): Promise<Rule | null> {
    const raw = await this.storage.getMetadata(storageKey(id));
    if (!raw) return null;
    return JSON.parse(raw) as Rule;
  }

  private async save(rule: Rule): Promise<void> {
    await this.storage.setMetadata(storageKey(rule.id), JSON.stringify(rule));
  }

  // ---- CRUD ---------------------------------------------------------------

  /**
   * Create a new rule.
   */
  async add(options: CreateRuleOptions): Promise<Rule> {
    if (!options.name) {
      throw new ValidationError('Rule name is required');
    }
    if (!options.conditions || options.conditions.length === 0) {
      throw new ValidationError('At least one condition is required');
    }
    if (!options.actions || options.actions.length === 0) {
      throw new ValidationError('At least one action is required');
    }

    const now = new Date().toISOString();
    const rule: Rule = {
      id: generateId(),
      name: options.name,
      description: options.description,
      conditions: options.conditions,
      conditionLogic: options.conditionLogic ?? 'and',
      actions: options.actions,
      enabled: options.enabled ?? true,
      priority: options.priority ?? 0,
      createdAt: now,
      updatedAt: now,
      triggerCount: 0,
    };

    await this.save(rule);

    const index = await this.getIndex();
    index.push(rule.id);
    await this.setIndex(index);

    return rule;
  }

  /**
   * List all rules, sorted by priority (higher priority first).
   */
  async list(): Promise<Rule[]> {
    const index = await this.getIndex();
    const rules: Rule[] = [];

    for (const id of index) {
      const rule = await this.load(id);
      if (rule) rules.push(rule);
    }

    // Sort by priority descending (higher priority runs first)
    rules.sort((a, b) => b.priority - a.priority);

    return rules;
  }

  /**
   * Get a single rule by ID.
   */
  async get(id: string): Promise<Rule | null> {
    return this.load(id);
  }

  /**
   * Update an existing rule.
   */
  async update(id: string, updates: Partial<CreateRuleOptions>): Promise<Rule> {
    const existing = await this.load(id);
    if (!existing) {
      throw new ValidationError(`Rule not found: ${id}`);
    }

    const updated: Rule = {
      ...existing,
      name: updates.name ?? existing.name,
      description:
        updates.description !== undefined
          ? updates.description
          : existing.description,
      conditions: updates.conditions ?? existing.conditions,
      conditionLogic: updates.conditionLogic ?? existing.conditionLogic,
      actions: updates.actions ?? existing.actions,
      enabled: updates.enabled ?? existing.enabled,
      priority: updates.priority ?? existing.priority,
      updatedAt: new Date().toISOString(),
    };

    await this.save(updated);
    return updated;
  }

  /**
   * Delete a rule.
   */
  async delete(id: string): Promise<void> {
    const existing = await this.load(id);
    if (!existing) {
      throw new ValidationError(`Rule not found: ${id}`);
    }

    // Remove from storage
    await this.storage.setMetadata(storageKey(id), '');

    // Remove from index
    const index = await this.getIndex();
    const filtered = index.filter((i) => i !== id);
    await this.setIndex(filtered);
  }

  /**
   * Enable a rule.
   */
  async enable(id: string): Promise<void> {
    const rule = await this.load(id);
    if (!rule) {
      throw new ValidationError(`Rule not found: ${id}`);
    }

    rule.enabled = true;
    rule.updatedAt = new Date().toISOString();
    await this.save(rule);
  }

  /**
   * Disable a rule.
   */
  async disable(id: string): Promise<void> {
    const rule = await this.load(id);
    if (!rule) {
      throw new ValidationError(`Rule not found: ${id}`);
    }

    rule.enabled = false;
    rule.updatedAt = new Date().toISOString();
    await this.save(rule);
  }

  // ---- Evaluation ---------------------------------------------------------

  /**
   * Evaluate all enabled rules against an email and return which ones
   * matched.
   *
   * Rules are evaluated in priority order (highest first).
   */
  async evaluate(
    email: Email,
    context: ConditionContext,
    adapter?: LLMAdapter,
  ): Promise<MatchedRule[]> {
    const rules = await this.list();
    const results: MatchedRule[] = [];

    for (const rule of rules) {
      if (!rule.enabled) continue;

      const matched = await evaluateConditions(
        rule.conditions,
        rule.conditionLogic,
        email,
        context,
        adapter,
      );

      results.push({ rule, matched });
    }

    return results;
  }

  /**
   * Evaluate all enabled rules against an email, and execute the actions of
   * any rules that match.
   *
   * For each matched rule, updates `triggerCount` and `lastTriggered` in
   * storage.
   */
  async evaluateAndExecute(
    email: Email,
    context: ConditionContext,
    actionContext: ActionContext,
    adapter?: LLMAdapter,
  ): Promise<RuleExecutionResult[]> {
    const rules = await this.list();
    const results: RuleExecutionResult[] = [];

    for (const rule of rules) {
      if (!rule.enabled) continue;

      const matched = await evaluateConditions(
        rule.conditions,
        rule.conditionLogic,
        email,
        context,
        adapter,
      );

      const result: RuleExecutionResult = {
        rule,
        matched,
        actionsExecuted: [],
      };

      if (matched) {
        // Execute each action for this rule
        for (const action of rule.actions) {
          const actionResult = await executeAction(
            action,
            email.id,
            actionContext,
          );
          result.actionsExecuted.push({
            action,
            success: actionResult.success,
            error: actionResult.error,
          });
        }

        // Update trigger metadata
        rule.triggerCount += 1;
        rule.lastTriggered = new Date().toISOString();
        rule.updatedAt = rule.lastTriggered;
        await this.save(rule);
      }

      results.push(result);
    }

    return results;
  }
}
