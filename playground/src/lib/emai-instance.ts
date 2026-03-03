import { createRequire } from 'node:module';
import { readConfig } from './config-store';
import { eventBus } from './event-bus';

// Use createRequire to load emai outside Next.js bundling,
// so its dynamic import('imapflow') etc. resolve correctly.
const require = createRequire(import.meta.url);
const { createEmai } = require('@petter100/emai') as typeof import('@petter100/emai');

type EmaiInstance = ReturnType<typeof createEmai>;

// Store instance on globalThis so all Next.js route handlers share
// the same singleton — module-level variables can be isolated per route
// when Turbopack or the bundler creates separate module contexts.
const g = globalThis as unknown as {
  __emaiInstance?: EmaiInstance | null;
  __emaiConnected?: boolean;
};

export function getEmaiInstance(): EmaiInstance | null {
  return g.__emaiInstance ?? null;
}

export function isEmaiConnected(): boolean {
  return g.__emaiConnected ?? false;
}

const ALL_EVENTS = [
  'email:received',
  'email:sent',
  'email:read',
  'email:deleted',
  'email:moved',
  'email:labeled',
  'email:classified',
  'email:indexed',
  'safety:risk',
  'safety:blocked',
  'safety:approved',
  'watch:started',
  'watch:stopped',
  'watch:error',
  'error',
] as const;

export async function initializeEmai(): Promise<EmaiInstance> {
  const config = readConfig();
  if (!config) throw new Error('No configuration found. Visit /config first.');

  if (g.__emaiInstance && g.__emaiConnected) {
    try {
      await g.__emaiInstance.disconnect();
    } catch {
      // ignore disconnect errors
    }
  }

  g.__emaiInstance = createEmai(config);

  for (const event of ALL_EVENTS) {
    g.__emaiInstance.on(event, (data: unknown) => {
      eventBus.emit({ event, data, timestamp: Date.now() });
    });
  }

  await g.__emaiInstance.connect();
  g.__emaiConnected = true;

  return g.__emaiInstance;
}

export async function destroyEmai(): Promise<void> {
  if (g.__emaiInstance && g.__emaiConnected) {
    try {
      await g.__emaiInstance.disconnect();
    } catch {
      // ignore
    }
    g.__emaiConnected = false;
  }
  g.__emaiInstance = null;
}
