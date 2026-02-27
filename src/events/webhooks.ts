import type { EmaiEvent, EmaiEventMap } from '../core/types.js';
import { generateId } from '../core/utils.js';
import type { EmaiEventEmitter } from './emitter.js';

export interface WebhookOptions {
  secret?: string;
  headers?: Record<string, string>;
  retries?: number;
  retryDelay?: number;
  timeout?: number;
}

export interface WebhookRegistration {
  id: string;
  url: string;
  events: EmaiEvent[];
  options: WebhookOptions;
  createdAt: Date;
  lastTriggered?: Date;
  failureCount: number;
}

export interface WebhookResult {
  webhookId: string;
  url: string;
  status: number;
  success: boolean;
  error?: string;
  duration: number;
}

const MAX_CONSECUTIVE_FAILURES = 10;
const DEFAULT_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 1_000;
const DEFAULT_TIMEOUT = 10_000;

async function signPayload(payload: string, secret: string): Promise<string> {
  if (typeof globalThis.crypto?.subtle !== 'undefined') {
    const encoder = new TextEncoder();
    const key = await globalThis.crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    return Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  const { createHmac } = await import('node:crypto');
  return createHmac('sha256', secret).update(payload).digest('hex');
}

export class WebhookManager {
  private webhooks = new Map<string, WebhookRegistration>();
  private unsubscribers = new Map<string, Array<() => void>>();

  constructor(private readonly emitter: EmaiEventEmitter) {}

  register(url: string, events: EmaiEvent[], options: WebhookOptions = {}): string {
    const id = generateId();
    const registration: WebhookRegistration = {
      id,
      url,
      events,
      options,
      createdAt: new Date(),
      failureCount: 0,
    };

    this.webhooks.set(id, registration);

    const unsubs: Array<() => void> = [];
    for (const event of events) {
      const unsub = this.emitter.on(event, (data: EmaiEventMap[typeof event]) => {
        void this.deliverToWebhook(registration, event, data);
      });
      unsubs.push(unsub);
    }
    this.unsubscribers.set(id, unsubs);

    return id;
  }

  unregister(webhookId: string): void {
    const unsubs = this.unsubscribers.get(webhookId);
    if (unsubs) {
      for (const unsub of unsubs) unsub();
      this.unsubscribers.delete(webhookId);
    }
    this.webhooks.delete(webhookId);
  }

  list(): WebhookRegistration[] {
    return [...this.webhooks.values()];
  }

  async trigger(event: EmaiEvent, data: unknown): Promise<WebhookResult[]> {
    const results: WebhookResult[] = [];

    for (const registration of this.webhooks.values()) {
      if (!registration.events.includes(event)) continue;
      if (registration.failureCount >= MAX_CONSECUTIVE_FAILURES) continue;

      const result = await this.deliverToWebhook(registration, event, data);
      results.push(result);
    }

    return results;
  }

  private async deliverToWebhook(
    registration: WebhookRegistration,
    event: EmaiEvent,
    data: unknown,
  ): Promise<WebhookResult> {
    const { options } = registration;
    const retries = options.retries ?? DEFAULT_RETRIES;
    const retryDelay = options.retryDelay ?? DEFAULT_RETRY_DELAY;
    const timeout = options.timeout ?? DEFAULT_TIMEOUT;

    const deliveryId = generateId();
    const timestamp = Date.now();
    const payload = JSON.stringify({
      event,
      data,
      timestamp,
      deliveryId,
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Emai-Event': event,
      'X-Emai-Delivery': deliveryId,
      'X-Emai-Timestamp': String(timestamp),
      ...options.headers,
    };

    if (options.secret) {
      headers['X-Emai-Signature'] = await signPayload(payload, options.secret);
    }

    let lastError: string | undefined;
    let lastStatus = 0;

    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) {
        const delay = retryDelay * 2 ** (attempt - 1);
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }

      const start = Date.now();

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(registration.url, {
          method: 'POST',
          headers,
          body: payload,
          signal: controller.signal,
        });

        clearTimeout(timer);
        const duration = Date.now() - start;

        if (response.ok) {
          registration.failureCount = 0;
          registration.lastTriggered = new Date();
          return {
            webhookId: registration.id,
            url: registration.url,
            status: response.status,
            success: true,
            duration,
          };
        }

        lastStatus = response.status;
        lastError = `HTTP ${response.status}`;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        lastStatus = 0;
      }
    }

    registration.failureCount++;
    registration.lastTriggered = new Date();

    return {
      webhookId: registration.id,
      url: registration.url,
      status: lastStatus,
      success: false,
      error: lastError,
      duration: Date.now() - timestamp,
    };
  }
}
