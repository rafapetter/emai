import type {
  Email,
  ClassificationResult,
  PriorityResult,
  LLMAdapter,
} from '../core/types.js';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ConditionType =
  | 'category'
  | 'sender'
  | 'recipient'
  | 'subject'
  | 'priority'
  | 'label'
  | 'hasAttachment'
  | 'isUrgent'
  | 'isActionRequired'
  | 'custom';

export type ConditionOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'notContains'
  | 'in'
  | 'notIn'
  | 'greaterThan'
  | 'lessThan';

export interface RuleCondition {
  type: ConditionType;
  operator: ConditionOperator;
  value: unknown;
  /** Prompt used when type is 'custom' and an LLM adapter is available. */
  customPrompt?: string;
}

export interface ConditionContext {
  classification?: ClassificationResult;
  priority?: PriorityResult;
}

// ---------------------------------------------------------------------------
// Operator helpers
// ---------------------------------------------------------------------------

function toString(val: unknown): string {
  if (typeof val === 'string') return val;
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  return '';
}

function toNumber(val: unknown): number {
  if (typeof val === 'number') return val;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

function toArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.map(toString);
  return [toString(val)];
}

/**
 * Apply an operator to a target value and a condition value.
 */
function applyOperator(
  operator: ConditionOperator,
  target: unknown,
  value: unknown,
): boolean {
  switch (operator) {
    case 'equals':
      return toString(target).toLowerCase() === toString(value).toLowerCase();

    case 'notEquals':
      return toString(target).toLowerCase() !== toString(value).toLowerCase();

    case 'contains':
      return toString(target)
        .toLowerCase()
        .includes(toString(value).toLowerCase());

    case 'notContains':
      return !toString(target)
        .toLowerCase()
        .includes(toString(value).toLowerCase());

    case 'in': {
      const arr = toArray(value);
      const targetStr = toString(target).toLowerCase();
      return arr.some((item) => item.toLowerCase() === targetStr);
    }

    case 'notIn': {
      const arr = toArray(value);
      const targetStr = toString(target).toLowerCase();
      return !arr.some((item) => item.toLowerCase() === targetStr);
    }

    case 'greaterThan':
      return toNumber(target) > toNumber(value);

    case 'lessThan':
      return toNumber(target) < toNumber(value);

    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Custom condition schema
// ---------------------------------------------------------------------------

const CustomConditionResultSchema = z.object({
  result: z.boolean(),
});

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Evaluate a single condition against an email and its context.
 *
 * For `custom` conditions, an LLM adapter is required; if not provided, the
 * condition evaluates to `false`.
 */
export async function evaluateCondition(
  condition: RuleCondition,
  email: Email,
  context: ConditionContext,
  adapter?: LLMAdapter,
): Promise<boolean> {
  switch (condition.type) {
    // ---- Email field conditions -------------------------------------------

    case 'sender':
      return applyOperator(
        condition.operator,
        email.from.address,
        condition.value,
      );

    case 'recipient': {
      const recipientAddresses = email.to.map((addr) => addr.address);
      // For array operators (in/notIn), check if any recipient matches
      if (condition.operator === 'in' || condition.operator === 'notIn') {
        return recipientAddresses.some((addr) =>
          applyOperator(condition.operator, addr, condition.value),
        );
      }
      // For other operators, check if any recipient matches
      return recipientAddresses.some((addr) =>
        applyOperator(condition.operator, addr, condition.value),
      );
    }

    case 'subject':
      return applyOperator(
        condition.operator,
        email.subject,
        condition.value,
      );

    case 'label': {
      const labelValue = toString(condition.value);
      const hasLabel = email.labels.some(
        (l) => l.toLowerCase() === labelValue.toLowerCase(),
      );
      if (condition.operator === 'equals' || condition.operator === 'contains') {
        return hasLabel;
      }
      if (condition.operator === 'notEquals' || condition.operator === 'notContains') {
        return !hasLabel;
      }
      if (condition.operator === 'in') {
        const arr = toArray(condition.value);
        return email.labels.some((l) =>
          arr.some((v) => v.toLowerCase() === l.toLowerCase()),
        );
      }
      if (condition.operator === 'notIn') {
        const arr = toArray(condition.value);
        return !email.labels.some((l) =>
          arr.some((v) => v.toLowerCase() === l.toLowerCase()),
        );
      }
      return hasLabel;
    }

    case 'hasAttachment': {
      const hasAttachments = email.attachments.length > 0;
      const expected = condition.value === true || condition.value === 'true';
      return condition.operator === 'equals'
        ? hasAttachments === expected
        : hasAttachments !== expected;
    }

    // ---- Classification context conditions --------------------------------

    case 'category':
      if (!context.classification) return false;
      return applyOperator(
        condition.operator,
        context.classification.category,
        condition.value,
      );

    case 'isUrgent': {
      if (!context.classification) return false;
      const isUrgent = context.classification.isUrgent;
      const expected = condition.value === true || condition.value === 'true';
      return condition.operator === 'equals'
        ? isUrgent === expected
        : isUrgent !== expected;
    }

    case 'isActionRequired': {
      if (!context.classification) return false;
      const isActionRequired = context.classification.isActionRequired;
      const expected = condition.value === true || condition.value === 'true';
      return condition.operator === 'equals'
        ? isActionRequired === expected
        : isActionRequired !== expected;
    }

    // ---- Priority context conditions --------------------------------------

    case 'priority': {
      if (!context.priority) return false;
      // Support comparing against both level (string) and score (number)
      if (
        condition.operator === 'greaterThan' ||
        condition.operator === 'lessThan'
      ) {
        return applyOperator(
          condition.operator,
          context.priority.score,
          condition.value,
        );
      }
      return applyOperator(
        condition.operator,
        context.priority.level,
        condition.value,
      );
    }

    // ---- Custom AI condition ----------------------------------------------

    case 'custom': {
      if (!adapter || !condition.customPrompt) return false;

      try {
        const prompt = [
          'Given this email:',
          `From: ${email.from.address}`,
          `Subject: ${email.subject}`,
          `Body: ${(email.body.text || email.body.html || '').slice(0, 2000)}`,
          '',
          `Answer the following question: ${condition.customPrompt}`,
          'Respond with {"result": true} or {"result": false}.',
        ].join('\n');

        const result = await adapter.completeJSON(
          prompt,
          CustomConditionResultSchema,
        );

        return result.result;
      } catch {
        // If the AI call fails, the condition evaluates to false
        return false;
      }
    }

    default:
      return false;
  }
}

/**
 * Evaluate multiple conditions using AND or OR logic.
 */
export async function evaluateConditions(
  conditions: RuleCondition[],
  logic: 'and' | 'or',
  email: Email,
  context: ConditionContext,
  adapter?: LLMAdapter,
): Promise<boolean> {
  if (conditions.length === 0) return true;

  if (logic === 'and') {
    for (const condition of conditions) {
      const result = await evaluateCondition(condition, email, context, adapter);
      if (!result) return false;
    }
    return true;
  }

  // 'or' logic
  for (const condition of conditions) {
    const result = await evaluateCondition(condition, email, context, adapter);
    if (result) return true;
  }
  return false;
}
