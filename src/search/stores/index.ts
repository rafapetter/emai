import type { VectorStore, SearchConfig } from '../../core/types.js';
import { SearchError } from '../../core/errors.js';
import { MemoryVectorStore } from './memory.js';

export { MemoryVectorStore } from './memory.js';
export { SqliteVectorStore } from './sqlite.js';
export { PgVectorStore } from './pgvector.js';
export { PineconeVectorStore } from './pinecone.js';
export { WeaviateVectorStore } from './weaviate.js';
export { ChromaDBVectorStore } from './chromadb.js';

export function createVectorStore(config: SearchConfig): VectorStore {
  if (typeof config.store !== 'string') return config.store;

  switch (config.store) {
    case 'memory':
      return new MemoryVectorStore();

    case 'sqlite': {
      const { SqliteVectorStore } = require('./sqlite.js') as typeof import('./sqlite.js');
      return new SqliteVectorStore(config.path);
    }

    case 'pgvector': {
      if (!config.connectionString) {
        throw new SearchError('connectionString required for pgvector store');
      }
      const { PgVectorStore } = require('./pgvector.js') as typeof import('./pgvector.js');
      return new PgVectorStore(config.connectionString, config.indexName);
    }

    case 'pinecone': {
      if (!config.apiKey) throw new SearchError('apiKey required for Pinecone store');
      if (!config.indexName) throw new SearchError('indexName required for Pinecone store');
      const { PineconeVectorStore } = require('./pinecone.js') as typeof import('./pinecone.js');
      return new PineconeVectorStore(config.apiKey, config.indexName, config.environment);
    }

    case 'weaviate': {
      const { WeaviateVectorStore } = require('./weaviate.js') as typeof import('./weaviate.js');
      return new WeaviateVectorStore(config.collectionName, config.url, config.apiKey);
    }

    case 'chromadb': {
      const { ChromaDBVectorStore } = require('./chromadb.js') as typeof import('./chromadb.js');
      return new ChromaDBVectorStore(config.collectionName, config.url);
    }

    default:
      throw new SearchError(`Unknown vector store type: ${config.store as string}`);
  }
}
