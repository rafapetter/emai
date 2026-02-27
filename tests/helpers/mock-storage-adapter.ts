import { vi } from 'vitest';
import type { StorageAdapter } from '../../src/core/types.js';

export function createMockStorageAdapter(overrides: Partial<StorageAdapter> = {}): StorageAdapter {
  return {
    name: 'mock',
    initialize: vi.fn(async () => {}),
    getEmail: vi.fn(async () => null),
    saveEmail: vi.fn(async () => {}),
    saveEmails: vi.fn(async () => {}),
    deleteEmail: vi.fn(async () => {}),
    listEmails: vi.fn(async () => ({ items: [], hasMore: false, total: 0 })),
    getThread: vi.fn(async () => null),
    saveThread: vi.fn(async () => {}),
    getMetadata: vi.fn(async () => null),
    setMetadata: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    ...overrides,
  };
}
