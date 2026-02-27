import { vi } from 'vitest';
import type { VectorStore } from '../../src/core/types.js';

export function createMockVectorStore(overrides: Partial<VectorStore> = {}): VectorStore {
  return {
    name: 'mock',
    initialize: vi.fn(async () => {}),
    upsert: vi.fn(async () => {}),
    search: vi.fn(async () => []),
    delete: vi.fn(async () => {}),
    count: vi.fn(async () => 0),
    close: vi.fn(async () => {}),
    ...overrides,
  };
}
