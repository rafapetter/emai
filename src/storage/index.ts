import type { StorageAdapter, StorageConfig } from '../core/types.js';
import { MemoryStorage } from './memory.js';

export { BaseStorageAdapter } from './store.js';
export { MemoryStorage } from './memory.js';
export { SqliteStorage } from './sqlite.js';

export function createStorage(config: StorageConfig): StorageAdapter {
  switch (config.type) {
    case 'memory':
      return new MemoryStorage();

    case 'sqlite': {
      const { SqliteStorage } = require('./sqlite.js') as typeof import('./sqlite.js');
      return new SqliteStorage(config.path);
    }

    default:
      throw new Error(`Unknown storage type: ${config.type as string}`);
  }
}
