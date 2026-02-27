import type {
  SearchConfig,
  VectorStore,
  LLMAdapter,
  StorageAdapter,
} from '../core/types.js';
import { createVectorStore } from './stores/index.js';
import { SearchEngine } from './engine.js';

export { SearchEngine } from './engine.js';
export { SemanticSearch } from './semantic.js';
export { FullTextSearch } from './full-text.js';
export { HybridSearch } from './hybrid.js';
export {
  MemoryVectorStore,
  SqliteVectorStore,
  PgVectorStore,
  PineconeVectorStore,
  WeaviateVectorStore,
  ChromaDBVectorStore,
  createVectorStore,
} from './stores/index.js';

export function createSearchEngine(
  config: SearchConfig,
  llm: LLMAdapter,
  storage?: StorageAdapter,
): SearchEngine {
  const vectorStore: VectorStore =
    typeof config.store === 'string' ? createVectorStore(config) : config.store;

  return new SearchEngine(vectorStore, llm, storage);
}
