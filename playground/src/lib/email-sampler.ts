export interface EmailData {
  id: string;
  from: { name?: string; address: string };
  subject: string;
  date: string;
  isRead?: boolean;
  isStarred?: boolean;
  snippet?: string;
  body?: { text?: string; html?: string };
  attachments?: Array<{ filename: string; size?: number; contentType?: string }>;
  labels?: string[];
}

export interface EmailDiversityStats {
  total: number;
  withAttachments: number;
  unread: number;
  starred: number;
  uniqueSenders: number;
  dateRange: { oldest: string; newest: string } | null;
  avgBodyLength: number;
}

export interface EmailSamples {
  richest: EmailData;
  longestBody: EmailData;
  unread: EmailData | null;
  starred: EmailData | null;
  withAttachments: EmailData | null;
  withDiverseAttachments: EmailData | null;
  forSafetyScan: EmailData[];
  all: EmailData[];
  stats: EmailDiversityStats;
}

function bodyLength(email: EmailData): number {
  return (email.body?.text?.length ?? 0) + (email.body?.html?.length ?? 0);
}

function richnessScore(email: EmailData): number {
  let score = 0;
  if (email.body?.text) score += 1;
  if (email.body?.html) score += 1;
  if (email.attachments?.length) score += email.attachments.length;
  if (email.isStarred) score += 1;
  if (email.labels?.length) score += 1;
  if (email.snippet) score += 1;
  score += bodyLength(email) / 1000;
  return score;
}

// Score attachment diversity: prefer emails with a mix of documents and media
function attachmentDiversityScore(email: EmailData): number {
  const atts = email.attachments ?? [];
  if (atts.length === 0) return 0;

  let score = 0;
  let hasDocs = false;
  let hasMedia = false;
  let hasSpreadsheet = false;

  for (const att of atts) {
    const ct = (att.contentType ?? '').toLowerCase();
    const fn = (att.filename ?? '').toLowerCase();

    if (ct.includes('pdf') || fn.endsWith('.pdf') || fn.endsWith('.docx') || fn.endsWith('.doc')) {
      score += 3;
      hasDocs = true;
    } else if (ct.includes('spreadsheet') || fn.endsWith('.xlsx') || fn.endsWith('.xls') || fn.endsWith('.csv')) {
      score += 3;
      hasSpreadsheet = true;
    } else if (ct.startsWith('image/') || fn.endsWith('.png') || fn.endsWith('.jpg') || fn.endsWith('.jpeg')) {
      score += 2;
      hasMedia = true;
    } else {
      score += 1;
    }
  }

  // Bonus for diversity of attachment types
  const typeCount = [hasDocs, hasMedia, hasSpreadsheet].filter(Boolean).length;
  score += typeCount * 3;

  // Prefer 2-5 attachments (sweet spot)
  if (atts.length >= 2 && atts.length <= 5) score += 2;

  return score;
}

export function selectSamples(items: EmailData[]): EmailSamples {
  const sorted = [...items].sort((a, b) => richnessScore(b) - richnessScore(a));
  const richest = sorted[0];

  const longestBody = items.reduce(
    (best, e) => (bodyLength(e) > bodyLength(best) ? e : best),
    items[0],
  );

  const unread = items.find((e) => e.isRead === false) ?? null;
  const starred = items.find((e) => e.isStarred === true) ?? null;
  const withAttachments = items.find((e) => (e.attachments?.length ?? 0) > 0) ?? null;

  // Find email with most diverse attachments (prefer mix of docs + media, 2-5 attachments)
  const withDiverseAttachments = items
    .filter((e) => (e.attachments?.length ?? 0) >= 1)
    .sort((a, b) => attachmentDiversityScore(b) - attachmentDiversityScore(a))[0]
    ?? withAttachments;

  // Pick up to 3 diverse emails for safety scanning
  const scanSet = new Set<string>();
  const forSafetyScan: EmailData[] = [];
  for (const candidate of [richest, longestBody, ...items]) {
    if (forSafetyScan.length >= 3) break;
    if (!scanSet.has(candidate.id)) {
      scanSet.add(candidate.id);
      forSafetyScan.push(candidate);
    }
  }

  // Compute diversity stats
  const senders = new Set(items.map((e) => e.from.address));
  const dates = items
    .map((e) => e.date)
    .filter(Boolean)
    .sort();
  const totalBodyLen = items.reduce((sum, e) => sum + bodyLength(e), 0);

  const stats: EmailDiversityStats = {
    total: items.length,
    withAttachments: items.filter((e) => (e.attachments?.length ?? 0) > 0).length,
    unread: items.filter((e) => e.isRead === false).length,
    starred: items.filter((e) => e.isStarred === true).length,
    uniqueSenders: senders.size,
    dateRange: dates.length > 0 ? { oldest: dates[0], newest: dates[dates.length - 1] } : null,
    avgBodyLength: items.length > 0 ? Math.round(totalBodyLen / items.length) : 0,
  };

  return { richest, longestBody, unread, starred, withAttachments, withDiverseAttachments, forSafetyScan, all: items, stats };
}
