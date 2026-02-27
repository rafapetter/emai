import type { Email } from '../../src/core/types.js';
import { makeEmail } from './fixtures.js';

/**
 * Deterministic embedding generator for reproducible vector searches.
 * Given the same seed, always produces the same unit vector.
 */
export function deterministicEmbedding(seed: string, dimensions = 1536): number[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  const vec = Array.from({ length: dimensions }, (_, i) => {
    const x = Math.sin(hash + i) * 10000;
    return x - Math.floor(x);
  });
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  return vec.map((v) => v / norm);
}

/**
 * Make N unique emails with diverse content for search/bulk testing.
 */
export function makeDiverseEmails(count: number): Email[] {
  const subjects = [
    'Q1 Budget Review',
    'Team Standup Notes',
    'Project Deadline Reminder',
    'Invoice #12345',
    'Meeting Tomorrow at 3pm',
    'Welcome to the Team',
    'Security Alert: Login from New Device',
    'Newsletter: Weekly Updates',
    'Order Confirmation',
    'Vacation Request',
  ];
  return Array.from({ length: count }, (_, i) =>
    makeEmail({
      id: `email-${i + 1}`,
      subject: subjects[i % subjects.length],
      body: {
        text: `This is the body of email ${i + 1} about ${subjects[i % subjects.length].toLowerCase()}.`,
      },
      date: new Date(Date.UTC(2025, 0, 15 + i, 10, 0, 0)),
      headers: { messageId: `<msg-${i + 1}@example.com>` },
      isRead: i % 3 === 0,
      isStarred: i % 5 === 0,
      folder: i % 4 === 0 ? 'sent' : 'inbox',
      labels: i % 2 === 0 ? ['inbox', 'important'] : ['inbox'],
    }),
  );
}
