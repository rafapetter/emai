import type { Email, SearchResult, SearchOptions } from '../core/types.js';

interface TermStats {
  docFreq: number;
  postings: Map<string, number>;
}

interface DocInfo {
  email: Email;
  length: number;
  fieldLengths: { subject: number; body: number; from: number; to: number };
}

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'is', 'it', 'be', 'as', 'do', 'no', 'not', 'are',
  'was', 'were', 'been', 'has', 'have', 'had', 'this', 'that', 'from',
  'will', 'can', 'if', 'so', 'up', 'out', 'just', 'than', 'them', 'then',
]);

const K1 = 1.5;
const B = 0.75;

export class FullTextSearch {
  private termIndex = new Map<string, TermStats>();
  private docs = new Map<string, DocInfo>();
  private avgDocLength = 0;

  async indexEmails(emails: Email[]): Promise<void> {
    for (const email of emails) {
      this.indexOne(email);
    }
    this.recalcAvgLength();
  }

  async search(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
    const { limit = 10, minScore = 0 } = options;
    const parsed = parseQuery(query);

    const candidateIds = this.filterCandidates(parsed, options);
    const scores = new Map<string, number>();

    for (const term of parsed.terms) {
      const stats = this.termIndex.get(term);
      if (!stats) continue;

      const idf = Math.log(
        1 + (this.docs.size - stats.docFreq + 0.5) / (stats.docFreq + 0.5),
      );

      for (const [docId, freq] of stats.postings) {
        if (candidateIds && !candidateIds.has(docId)) continue;

        const doc = this.docs.get(docId)!;
        const tf = freq;
        const normLength = doc.length / (this.avgDocLength || 1);
        const tfNorm = (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * normLength));
        const score = idf * tfNorm;

        scores.set(docId, (scores.get(docId) ?? 0) + score);
      }
    }

    const results: SearchResult[] = [];
    const entries = [...scores.entries()].sort((a, b) => b[1] - a[1]);

    for (const [docId, score] of entries) {
      if (score < minScore) continue;
      if (results.length >= limit) break;

      const doc = this.docs.get(docId);
      if (!doc) continue;

      if (!matchesSearchOptions(doc.email, options)) continue;

      results.push({
        email: doc.email,
        score,
        matchType: 'fulltext',
        highlights: generateHighlights(doc.email, parsed.terms),
      });
    }

    return results;
  }

  removeEmail(emailId: string): void {
    const doc = this.docs.get(emailId);
    if (!doc) return;

    for (const [term, stats] of this.termIndex) {
      stats.postings.delete(emailId);
      if (stats.postings.size === 0) {
        this.termIndex.delete(term);
      } else {
        stats.docFreq = stats.postings.size;
      }
    }

    this.docs.delete(emailId);
    this.recalcAvgLength();
  }

  clear(): void {
    this.termIndex.clear();
    this.docs.clear();
    this.avgDocLength = 0;
  }

  get documentCount(): number {
    return this.docs.size;
  }

  private indexOne(email: Email): void {
    const subjectText = email.subject || '';
    const bodyText = email.body.text || '';
    const fromText = email.from.address;
    const toText = email.to.map((a) => a.address).join(' ');

    const fullText = `${subjectText} ${bodyText} ${fromText} ${toText}`;
    const tokens = tokenize(fullText);

    const termFreqs = new Map<string, number>();
    for (const token of tokens) {
      termFreqs.set(token, (termFreqs.get(token) ?? 0) + 1);
    }

    for (const [term, freq] of termFreqs) {
      let stats = this.termIndex.get(term);
      if (!stats) {
        stats = { docFreq: 0, postings: new Map() };
        this.termIndex.set(term, stats);
      }
      if (!stats.postings.has(email.id)) {
        stats.docFreq++;
      }
      stats.postings.set(email.id, freq);
    }

    this.docs.set(email.id, {
      email,
      length: tokens.length,
      fieldLengths: {
        subject: tokenize(subjectText).length,
        body: tokenize(bodyText).length,
        from: tokenize(fromText).length,
        to: tokenize(toText).length,
      },
    });
  }

  private recalcAvgLength(): void {
    if (this.docs.size === 0) {
      this.avgDocLength = 0;
      return;
    }
    let total = 0;
    for (const doc of this.docs.values()) total += doc.length;
    this.avgDocLength = total / this.docs.size;
  }

  private filterCandidates(
    parsed: ParsedQuery,
    options: SearchOptions,
  ): Set<string> | null {
    if (
      !parsed.from &&
      !parsed.to &&
      !parsed.subject &&
      !parsed.hasAttachment &&
      parsed.isRead === undefined &&
      parsed.isStarred === undefined &&
      !parsed.after &&
      !parsed.before &&
      !options.folder &&
      !options.label &&
      !options.from &&
      !options.after &&
      !options.before
    ) {
      return null;
    }

    const candidates = new Set<string>();
    for (const [id, doc] of this.docs) {
      if (matchesParsedFilters(doc.email, parsed) && matchesSearchOptions(doc.email, options)) {
        candidates.add(id);
      }
    }
    return candidates;
  }
}

interface ParsedQuery {
  terms: string[];
  from?: string;
  to?: string;
  subject?: string;
  hasAttachment?: boolean;
  isRead?: boolean;
  isStarred?: boolean;
  after?: Date;
  before?: Date;
}

function parseQuery(query: string): ParsedQuery {
  const result: ParsedQuery = { terms: [] };
  const parts = query.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];

  for (const part of parts) {
    const lower = part.toLowerCase();

    if (lower.startsWith('from:')) {
      result.from = part.slice(5).replace(/"/g, '');
    } else if (lower.startsWith('to:')) {
      result.to = part.slice(3).replace(/"/g, '');
    } else if (lower.startsWith('subject:')) {
      result.subject = part.slice(8).replace(/"/g, '');
    } else if (lower === 'has:attachment') {
      result.hasAttachment = true;
    } else if (lower === 'is:read') {
      result.isRead = true;
    } else if (lower === 'is:unread') {
      result.isRead = false;
    } else if (lower === 'is:starred') {
      result.isStarred = true;
    } else if (lower.startsWith('after:')) {
      const dateStr = part.slice(6);
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) result.after = d;
    } else if (lower.startsWith('before:')) {
      const dateStr = part.slice(7);
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) result.before = d;
    } else {
      const tokens = tokenize(part);
      result.terms.push(...tokens);
    }
  }

  return result;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s@.-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

function matchesParsedFilters(email: Email, parsed: ParsedQuery): boolean {
  if (parsed.from && !email.from.address.toLowerCase().includes(parsed.from.toLowerCase()))
    return false;

  if (parsed.to) {
    const match = email.to.some((a) =>
      a.address.toLowerCase().includes(parsed.to!.toLowerCase()),
    );
    if (!match) return false;
  }

  if (parsed.subject) {
    if (!email.subject.toLowerCase().includes(parsed.subject.toLowerCase())) return false;
  }

  if (parsed.hasAttachment !== undefined && parsed.hasAttachment) {
    if (email.attachments.length === 0) return false;
  }

  if (parsed.isRead !== undefined && email.isRead !== parsed.isRead) return false;
  if (parsed.isStarred !== undefined && email.isStarred !== parsed.isStarred) return false;

  if (parsed.after && email.date < parsed.after) return false;
  if (parsed.before && email.date > parsed.before) return false;

  return true;
}

function matchesSearchOptions(email: Email, options: SearchOptions): boolean {
  if (options.folder && email.folder !== options.folder) return false;
  if (options.label && !email.labels.includes(options.label)) return false;
  if (options.from && !email.from.address.toLowerCase().includes(options.from.toLowerCase()))
    return false;
  if (options.after && email.date < options.after) return false;
  if (options.before && email.date > options.before) return false;
  return true;
}

function generateHighlights(email: Email, terms: string[]): string[] {
  if (terms.length === 0) return [];
  const highlights: string[] = [];
  const text = email.body.text || '';
  const lowerText = text.toLowerCase();

  for (const term of terms) {
    const idx = lowerText.indexOf(term);
    if (idx === -1) continue;

    const start = Math.max(0, idx - 40);
    const end = Math.min(text.length, idx + term.length + 40);
    let snippet = text.slice(start, end).trim();
    if (start > 0) snippet = '...' + snippet;
    if (end < text.length) snippet = snippet + '...';
    highlights.push(snippet);

    if (highlights.length >= 3) break;
  }

  return highlights;
}
