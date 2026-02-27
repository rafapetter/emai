import { EmaiEventEmitter } from './emitter.js';

export { EmaiEventEmitter } from './emitter.js';
export { EmailWatcher } from './watcher.js';
export type { WatchOptions } from './watcher.js';
export { WebhookManager } from './webhooks.js';
export type {
  WebhookOptions,
  WebhookRegistration,
  WebhookResult,
} from './webhooks.js';

export function createEventSystem(): { emitter: EmaiEventEmitter } {
  const emitter = new EmaiEventEmitter();
  return { emitter };
}
