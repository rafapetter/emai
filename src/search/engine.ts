import type {
  Email,
  LLMAdapter,
  VectorStore,
  VectorEntry,
  StorageAdapter,
  SearchResult,
  SearchOptions,
  HybridSearchOptions,
} from '../core/types.js';
import { SearchError } from '../core/errors.js';
import { emailToPlainText, chunkText } from '../core/utils.js';
import { SemanticSearch } from './semantic.js';
import { FullTextSearch } from './full-text.js';
import { HybridSearch } from './hybrid.js';

const DEFAULT_CHUNK_SIZE = 1000;
const DEFAULT_CHUNK_OVERLAP = 200;
const DEFAULT_DIMENSIONS = 1536;

export class SearchEngine {
  private vectorStore: VectorStore;
  private llm: LLMAdapter;
  private storage?: StorageAdapter;

  private semanticSearch: SemanticSearch;
  private fullTextSearch: FullTextSearch;
  private hybridSearch: HybridSearch;

  private initialized = false;
  private dimensions: number;

  constructor(vectorStore: VectorStore, llm: LLMAdapter, storage?: StorageAdapter) {
    this.vectorStore = vectorStore;
    this.llm = llm;
    this.storage = storage;
    this.dimensions = DEFAULT_DIMENSIONS;

    this.semanticSearch = new SemanticSearch(vectorStore, llm, storage);
    this.fullTextSearch = new FullTextSearch();
    this.hybridSearch = new HybridSearch(this.semanticSearch, this.fullTextSearch);
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;
    await this.vectorStore.initialize(this.dimensions);
    this.initialized = true;
  }

  async index(emails: Email[]): Promise<void> {
    await this.ensureInitialized();

    const allEntries: VectorEntry[] = [];

    for (const email of emails) {
      const entries = await this.createVectorEntries(email);
      allEntries.push(...entries);

      if (this.storage) {
        await this.storage.saveEmail(email);
      }
    }

    if (allEntries.length > 0) {
      await this.vectorStore.upsert(allEntries);
    }

    await this.fullTextSearch.indexEmails(emails);
  }

  async indexEmail(email: Email): Promise<void> {
    await this.index([email]);
  }

  async removeFromIndex(emailId: string): Promise<void> {
    await this.ensureInitialized();

    const idsToDelete = [emailId];
    for (let chunk = 0; chunk < 100; chunk++) {
      idsToDelete.push(`${emailId}:chunk:${chunk}`);
    }

    await this.vectorStore.delete(idsToDelete);
    this.fullTextSearch.removeEmail(emailId);

    if (this.storage) {
      await this.storage.deleteEmail(emailId);
    }
  }

  async reindex(): Promise<void> {
    if (!this.storage) {
      throw new SearchError('Storage adapter required for reindex');
    }

    await this.ensureInitialized();
    this.fullTextSearch.clear();

    const result = await this.storage.listEmails({ limit: 10000 });
    const allEntries: VectorEntry[] = [];

    for (const email of result.items) {
      const entries = await this.createVectorEntries(email);
      allEntries.push(...entries);
    }

    if (allEntries.length > 0) {
      await this.vectorStore.upsert(allEntries);
    }

    await this.fullTextSearch.indexEmails(result.items);
  }

  async getIndexedCount(): Promise<number> {
    await this.ensureInitialized();
    return this.vectorStore.count();
  }

  async searchSemantic(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    await this.ensureInitialized();
    return this.semanticSearch.search(query, options);
  }

  async searchFullText(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    return this.fullTextSearch.search(query, options);
  }

  async searchHybrid(query: string, options?: HybridSearchOptions): Promise<SearchResult[]> {
    await this.ensureInitialized();
    return this.hybridSearch.search(query, options);
  }

  async close(): Promise<void> {
    await this.vectorStore.close();
    this.initialized = false;
  }

  private async createVectorEntries(email: Email): Promise<VectorEntry[]> {
    const text = emailToPlainText(email);
    const metadata = extractEmailMetadata(email);

    const chunks = chunkText(text, DEFAULT_CHUNK_SIZE, DEFAULT_CHUNK_OVERLAP);

    let embeddings: number[][];
    try {
      embeddings = await this.llm.embed(chunks);
    } catch (err) {
      throw new SearchError(`Failed to generate embeddings for email ${email.id}`, err);
    }

    if (embeddings.length > 0 && this.dimensions !== embeddings[0].length) {
      this.dimensions = embeddings[0].length;
    }

    return chunks.map((chunk, i) => ({
      id: chunks.length === 1 ? email.id : `${email.id}:chunk:${i}`,
      vector: embeddings[i],
      metadata: { ...metadata, chunkIndex: i, totalChunks: chunks.length },
      content: chunk,
    }));
  }
}

function extractEmailMetadata(email: Email): Record<string, unknown> {
  return {
    emailId: email.id,
    from: email.from.address,
    subject: email.subject,
    date: email.date.getTime(),
    folder: email.folder,
    labels: email.labels,
    isRead: email.isRead,
    isStarred: email.isStarred,
    hasAttachments: email.attachments.length > 0,
    threadId: email.threadId ?? null,
  };
}
