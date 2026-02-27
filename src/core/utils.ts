import type { EmailAddress, Email } from './types.js';
import { DependencyError } from './errors.js';

export function parseEmailAddress(input: string | EmailAddress): EmailAddress {
  if (typeof input !== 'string') return input;
  const match = input.match(/^(?:"?(.+?)"?\s)?<?([^\s<>]+@[^\s<>]+)>?$/);
  if (!match) return { address: input };
  return { name: match[1] || undefined, address: match[2] };
}

export function normalizeAddresses(
  input: string | string[] | EmailAddress | EmailAddress[] | undefined,
): EmailAddress[] {
  if (!input) return [];
  const arr = Array.isArray(input) ? input : [input];
  return arr.map(parseEmailAddress);
}

export function formatEmailAddress(addr: EmailAddress): string {
  return addr.name ? `"${addr.name}" <${addr.address}>` : addr.address;
}

export function emailToPlainText(email: Email): string {
  const parts = [
    `From: ${formatEmailAddress(email.from)}`,
    `To: ${email.to.map(formatEmailAddress).join(', ')}`,
    email.cc.length ? `CC: ${email.cc.map(formatEmailAddress).join(', ')}` : '',
    `Subject: ${email.subject}`,
    `Date: ${email.date.toISOString()}`,
    '',
    email.body.text || stripHtml(email.body.html || ''),
  ];
  return parts.filter(Boolean).join('\n');
}

export function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function htmlToMarkdown(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<h([1-6])[^>]*>(.*?)<\/h\1>/gi, (_m, level, text) => {
      return '#'.repeat(Number(level)) + ' ' + text.trim() + '\n\n';
    })
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
    .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
    .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    .replace(/<ul[^>]*>/gi, '')
    .replace(/<\/ul>/gi, '\n')
    .replace(/<ol[^>]*>/gi, '')
    .replace(/<\/ol>/gi, '\n')
    .replace(/<li[^>]*>(.*?)<\/li>/gi, '- $1\n')
    .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '> $1\n')
    .replace(/<code[^>]*>(.*?)<\/code>/gi, '`$1`')
    .replace(/<pre[^>]*>(.*?)<\/pre>/gis, '```\n$1\n```\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function normalizeSubject(subject: string): string {
  return subject.replace(/^(re|fw|fwd|aw|wg|sv|vs):\s*/gi, '').trim();
}

export function generateId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${random}`;
}

export function chunkText(text: string, maxChunkSize = 1000, overlap = 200): string[] {
  if (text.length <= maxChunkSize) return [text];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = start + maxChunkSize;

    if (end < text.length) {
      const lastPeriod = text.lastIndexOf('.', end);
      const lastNewline = text.lastIndexOf('\n', end);
      const breakPoint = Math.max(lastPeriod, lastNewline);
      if (breakPoint > start + maxChunkSize / 2) {
        end = breakPoint + 1;
      }
    }

    chunks.push(text.slice(start, end).trim());
    start = end - overlap;
  }

  return chunks.filter(Boolean);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dotProduct / denom;
}

export async function tryImport<T>(pkg: string, feature: string): Promise<T> {
  try {
    return await import(pkg);
  } catch {
    throw new DependencyError(pkg, feature);
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}
