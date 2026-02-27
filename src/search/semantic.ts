import type {
  Email,
  LLMAdapter,
  VectorStore,
  SearchResult,
  SearchOptions,
  StorageAdapter,
} from '../core/types.js';
import { SearchError } from '../core/errors.js';

export class SemanticSearch {
  constructor(
    private vectorStore: VectorStore,
    private llm: LLMAdapter,
    private storage?: StorageAdapter,
  ) {}

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const { limit = 10, minScore = 0, folder, label, from, after, before } = options;

    let queryVector: number[];
    try {
      const [vec] = await this.llm.embed([query]);
      queryVector = vec;
    } catch (err) {
      throw new SearchError('Failed to generate query embedding', err);
    }

    const filter = buildMetadataFilter({ folder, label, from, after, before });
    const results = await this.vectorStore.search(queryVector, limit * 2, filter);

    const searchResults: SearchResult[] = [];

    for (const result of results) {
      if (result.score < minScore) continue;
      if (searchResults.length >= limit) break;

      const email = await this.resolveEmail(result.metadata, result.content);
      if (!email) continue;

      searchResults.push({
        email,
        score: result.score,
        matchType: 'semantic',
        highlights: [result.content.slice(0, 200)],
      });
    }

    return searchResults;
  }

  private async resolveEmail(
    metadata: Record<string, unknown>,
    content: string,
  ): Promise<Email | null> {
    const emailId = metadata['emailId'] as string | undefined;
    if (emailId && this.storage) {
      const email = await this.storage.getEmail(emailId);
      if (email) return email;
    }

    return reconstructEmailFromMetadata(metadata, content);
  }
}

function buildMetadataFilter(opts: {
  folder?: string;
  label?: string;
  from?: string;
  after?: Date;
  before?: Date;
}): Record<string, unknown> | undefined {
  const filter: Record<string, unknown> = {};
  let hasFilter = false;

  if (opts.folder) {
    filter['folder'] = opts.folder;
    hasFilter = true;
  }
  if (opts.label) {
    filter['labels'] = { $contains: opts.label };
    hasFilter = true;
  }
  if (opts.from) {
    filter['from'] = opts.from;
    hasFilter = true;
  }
  if (opts.after || opts.before) {
    const dateFilter: Record<string, unknown> = {};
    if (opts.after) dateFilter['$gte'] = opts.after.getTime();
    if (opts.before) dateFilter['$lte'] = opts.before.getTime();
    filter['date'] = dateFilter;
    hasFilter = true;
  }

  return hasFilter ? filter : undefined;
}

function reconstructEmailFromMetadata(
  metadata: Record<string, unknown>,
  content: string,
): Email {
  return {
    id: (metadata['emailId'] as string) ?? (metadata['id'] as string) ?? '',
    provider: 'unknown',
    from: {
      address: (metadata['from'] as string) ?? '',
    },
    to: [],
    cc: [],
    bcc: [],
    subject: (metadata['subject'] as string) ?? '',
    body: { text: content },
    attachments: [],
    labels: Array.isArray(metadata['labels']) ? (metadata['labels'] as string[]) : [],
    folder: (metadata['folder'] as string) ?? '',
    date: new Date((metadata['date'] as number) ?? 0),
    receivedDate: new Date((metadata['date'] as number) ?? 0),
    isRead: true,
    isStarred: false,
    isDraft: false,
    headers: {
      messageId: (metadata['emailId'] as string) ?? '',
    },
  };
}
