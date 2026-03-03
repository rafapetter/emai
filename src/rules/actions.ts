import type { EmailProvider } from '../core/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ActionType =
  | 'label'
  | 'removeLabel'
  | 'move'
  | 'archive'
  | 'star'
  | 'markRead'
  | 'forward'
  | 'webhook'
  | 'snooze';

export interface RuleAction {
  type: ActionType;
  params: Record<string, unknown>;
}

export interface ActionContext {
  provider: EmailProvider;
  snoozeEngine?: {
    snooze(emailId: string, until: Date): Promise<void>;
  };
  webhookManager?: {
    trigger(url: string, data: unknown): void;
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Execute a single rule action against an email.
 *
 * Each action is wrapped in a try/catch so that individual failures do not
 * prevent subsequent actions from executing. Returns a result object
 * indicating success or failure.
 */
export async function executeAction(
  action: RuleAction,
  emailId: string,
  context: ActionContext,
): Promise<{ success: boolean; error?: string }> {
  try {
    switch (action.type) {
      case 'label': {
        const label = action.params.label as string;
        if (!label) {
          return { success: false, error: 'label parameter is required' };
        }
        await context.provider.addLabel(emailId, label);
        return { success: true };
      }

      case 'removeLabel': {
        const label = action.params.label as string;
        if (!label) {
          return { success: false, error: 'label parameter is required' };
        }
        await context.provider.removeLabel(emailId, label);
        return { success: true };
      }

      case 'move': {
        const folder = action.params.folder as string;
        if (!folder) {
          return { success: false, error: 'folder parameter is required' };
        }
        await context.provider.moveToFolder(emailId, folder);
        return { success: true };
      }

      case 'archive': {
        await context.provider.archiveEmail(emailId);
        return { success: true };
      }

      case 'star': {
        await context.provider.star(emailId);
        return { success: true };
      }

      case 'markRead': {
        await context.provider.markAsRead(emailId);
        return { success: true };
      }

      case 'forward': {
        const to = action.params.to as string;
        if (!to) {
          return { success: false, error: 'to parameter is required' };
        }
        await context.provider.forwardEmail(emailId, { to });
        return { success: true };
      }

      case 'snooze': {
        if (!context.snoozeEngine) {
          return {
            success: false,
            error: 'snooze engine is not configured',
          };
        }
        const until = action.params.until as string;
        if (!until) {
          return { success: false, error: 'until parameter is required' };
        }
        await context.snoozeEngine.snooze(emailId, new Date(until));
        return { success: true };
      }

      case 'webhook': {
        if (!context.webhookManager) {
          return {
            success: false,
            error: 'webhook manager is not configured',
          };
        }
        const url = action.params.url as string;
        if (!url) {
          return { success: false, error: 'url parameter is required' };
        }
        const data = action.params.data ?? { emailId };
        context.webhookManager.trigger(url, data);
        return { success: true };
      }

      default:
        return {
          success: false,
          error: `Unknown action type: ${action.type as string}`,
        };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
