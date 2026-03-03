import { z } from 'zod';
import type {
  Email,
  Thread,
  LLMAdapter,
  ActionItem,
} from '../core/types.js';
import { AiError } from '../core/errors.js';
import { emailToPlainText, truncate, formatEmailAddress } from '../core/utils.js';

const ActionItemSchema = z.object({
  description: z.string(),
  assignee: z.string().optional(),
  dueDate: z.string().optional(),
  priority: z.enum(['high', 'medium', 'low']),
  status: z.enum(['pending', 'done', 'unknown']),
});

// Map LLM status variants to valid enum values
function normalizeStatus(raw: string): string {
  const s = raw.toLowerCase().trim();
  if (s === 'done' || s === 'complete' || s === 'completed' || s === 'finished') return 'done';
  if (s === 'pending' || s === 'open' || s === 'todo' || s === 'to do' || s === 'not started') return 'pending';
  if (s === 'in progress' || s === 'in-progress' || s === 'active' || s === 'ongoing' || s === 'started') return 'pending';
  if (s === 'unknown' || s === 'n/a' || s === 'none') return 'unknown';
  return 'unknown';
}

// Map LLM priority variants to valid enum values
function normalizePriority(raw: string): string {
  const p = raw.toLowerCase().trim();
  if (p === 'high' || p === 'critical' || p === 'urgent') return 'high';
  if (p === 'medium' || p === 'normal' || p === 'moderate') return 'medium';
  if (p === 'low' || p === 'minor' || p === 'none') return 'low';
  return 'medium';
}

// Normalize LLM quirks before validation: null → undefined, 'High' → 'high', 'In Progress' → 'pending'
function normalizeActionItems(val: unknown): unknown {
  if (typeof val !== 'object' || val === null) return val;
  const obj = val as Record<string, unknown>;
  if (Array.isArray(obj.actions)) {
    obj.actions = obj.actions.map((item: unknown) => {
      if (typeof item !== 'object' || item === null) return item;
      const a = item as Record<string, unknown>;
      return {
        ...a,
        assignee: a.assignee ?? undefined,
        dueDate: a.dueDate ?? undefined,
        priority: typeof a.priority === 'string' ? normalizePriority(a.priority) : a.priority,
        status: typeof a.status === 'string' ? normalizeStatus(a.status) : a.status,
      };
    });
  }
  return obj;
}

const ActionsResultSchema = z.preprocess(
  normalizeActionItems,
  z.object({ actions: z.array(ActionItemSchema) }),
);

const ACTIONS_SYSTEM_PROMPT = `You are an expert at identifying action items and tasks in email communications.

Detect these types of action items:
- Explicit tasks ("Please send me the report", "Can you review this?")
- Deadlines and due dates ("by Friday", "before end of month", "ASAP")
- Requests for information ("Let me know if...", "Could you confirm...")
- Follow-up items ("I'll circle back on this", "Let's discuss next week")
- Approval requests ("Please approve", "Sign off on this")
- Meeting actions ("Schedule a call", "Set up a meeting")
- Commitments made ("I will send you...", "We'll have this ready by...")

For each action item:
- Write a clear, actionable description
- Identify the assignee if mentioned (use email address or name)
- Extract due dates in ISO 8601 format when mentioned
- Assess priority: high (urgent/deadline-driven), medium (standard), low (nice-to-have)
- Set status: pending (not yet done), done (completed/confirmed), unknown (unclear)

Rules:
- Do NOT create action items from generic pleasantries ("Let me know if you have questions")
- DO identify implicit tasks (questions that need answers count as action items)
- Deduplicate similar actions across messages
- Preserve the original assignee names/emails`;

export class ActionsEngine {
  constructor(private readonly adapter: LLMAdapter) {}

  async detectActions(email: Email): Promise<ActionItem[]> {
    const emailText = truncate(emailToPlainText(email), 10000);

    const prompt = `Identify all action items in this email:

${emailText}

Return JSON with:
- actions: array of action items, each with description, assignee, dueDate, priority, status`;

    try {
      const result = await this.adapter.completeJSON(
        prompt,
        ActionsResultSchema,
        { systemPrompt: ACTIONS_SYSTEM_PROMPT, temperature: 0.1 },
      ) as { actions: ActionItem[] };
      return result.actions;
    } catch (err) {
      throw new AiError(
        `Failed to detect actions: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }

  async detectActionsInThread(thread: Thread): Promise<ActionItem[]> {
    const emailTexts = thread.emails
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map((e, i) => {
        const from = formatEmailAddress(e.from);
        const text = truncate(emailToPlainText(e), 3000);
        return `--- Message ${i + 1} from ${from} (${e.date.toISOString()}) ---\n${text}`;
      })
      .join('\n\n');

    const prompt = `Identify all action items across this email thread. Deduplicate items that appear in multiple messages — keep the most recent/complete version.

Thread subject: ${thread.subject}
Participants: ${thread.participants.map(formatEmailAddress).join(', ')}

${emailTexts}

Return JSON with:
- actions: deduplicated array of action items, each with description, assignee, dueDate, priority, status

Important: If an action was requested in an earlier message and confirmed/completed in a later message, mark its status as "done". Only include each unique action once.`;

    try {
      const result = await this.adapter.completeJSON(
        prompt,
        ActionsResultSchema,
        { systemPrompt: ACTIONS_SYSTEM_PROMPT, temperature: 0.1 },
      ) as { actions: ActionItem[] };
      return result.actions;
    } catch (err) {
      throw new AiError(
        `Failed to detect actions in thread: ${err instanceof Error ? err.message : String(err)}`,
        err,
      );
    }
  }
}
