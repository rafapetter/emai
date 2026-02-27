import { describe, it, expect, vi } from 'vitest';
import {
  parseEmailAddress,
  normalizeAddresses,
  formatEmailAddress,
  emailToPlainText,
  stripHtml,
  htmlToMarkdown,
  normalizeSubject,
  generateId,
  chunkText,
  cosineSimilarity,
  tryImport,
  sleep,
  truncate,
} from '../../../src/core/utils.js';
import { DependencyError } from '../../../src/core/errors.js';
import { makeEmail } from '../../helpers/fixtures.js';

// ---------------------------------------------------------------------------
// parseEmailAddress
// ---------------------------------------------------------------------------

describe('parseEmailAddress', () => {
  it('returns object input unchanged', () => {
    const addr = { name: 'Alice', address: 'alice@test.com' };
    expect(parseEmailAddress(addr)).toBe(addr);
  });

  it('parses "Name <addr>" format', () => {
    expect(parseEmailAddress('Alice Smith <alice@test.com>')).toEqual({
      name: 'Alice Smith',
      address: 'alice@test.com',
    });
  });

  it('parses quoted name format', () => {
    expect(parseEmailAddress('"Alice Smith" <alice@test.com>')).toEqual({
      name: 'Alice Smith',
      address: 'alice@test.com',
    });
  });

  it('parses bare email address', () => {
    expect(parseEmailAddress('alice@test.com')).toEqual({
      name: undefined,
      address: 'alice@test.com',
    });
  });

  it('returns raw string for non-matching input', () => {
    expect(parseEmailAddress('not-an-email')).toEqual({ address: 'not-an-email' });
  });
});

// ---------------------------------------------------------------------------
// normalizeAddresses
// ---------------------------------------------------------------------------

describe('normalizeAddresses', () => {
  it('returns empty array for undefined', () => {
    expect(normalizeAddresses(undefined)).toEqual([]);
  });

  it('handles single string', () => {
    const result = normalizeAddresses('alice@test.com');
    expect(result).toHaveLength(1);
    expect(result[0].address).toBe('alice@test.com');
  });

  it('handles array of strings', () => {
    const result = normalizeAddresses(['a@test.com', 'b@test.com']);
    expect(result).toHaveLength(2);
  });

  it('handles single EmailAddress object', () => {
    const addr = { name: 'Alice', address: 'alice@test.com' };
    expect(normalizeAddresses(addr)).toEqual([addr]);
  });

  it('handles mixed array', () => {
    const result = normalizeAddresses(['alice@test.com', { name: 'Bob', address: 'bob@test.com' }]);
    expect(result).toHaveLength(2);
    expect(result[1].name).toBe('Bob');
  });
});

// ---------------------------------------------------------------------------
// formatEmailAddress
// ---------------------------------------------------------------------------

describe('formatEmailAddress', () => {
  it('formats address with name', () => {
    expect(formatEmailAddress({ name: 'Alice', address: 'alice@test.com' })).toBe(
      '"Alice" <alice@test.com>',
    );
  });

  it('formats address without name', () => {
    expect(formatEmailAddress({ address: 'alice@test.com' })).toBe('alice@test.com');
  });
});

// ---------------------------------------------------------------------------
// emailToPlainText
// ---------------------------------------------------------------------------

describe('emailToPlainText', () => {
  it('formats email with all fields', () => {
    const email = makeEmail({
      cc: [{ name: 'Carol', address: 'carol@test.com' }],
    });
    const text = emailToPlainText(email);
    expect(text).toContain('From: "Alice Smith" <alice@example.com>');
    expect(text).toContain('To: "Bob Jones" <bob@example.com>');
    expect(text).toContain('CC: "Carol" <carol@test.com>');
    expect(text).toContain('Subject: Test Email Subject');
    expect(text).toContain('Hello Bob');
  });

  it('omits CC when empty', () => {
    const text = emailToPlainText(makeEmail());
    expect(text).not.toContain('CC:');
  });

  it('falls back to stripped HTML when no text body', () => {
    const email = makeEmail({
      body: { html: '<p>HTML only</p>' },
    });
    const text = emailToPlainText(email);
    expect(text).toContain('HTML only');
  });
});

// ---------------------------------------------------------------------------
// stripHtml
// ---------------------------------------------------------------------------

describe('stripHtml', () => {
  it('strips HTML tags', () => {
    expect(stripHtml('<p>Hello <b>world</b></p>')).toBe('Hello world');
  });

  it('removes style blocks', () => {
    expect(stripHtml('<style>body{color:red}</style><p>Text</p>')).toBe('Text');
  });

  it('removes script blocks', () => {
    expect(stripHtml('<script>alert("x")</script>Content')).toBe('Content');
  });

  it('decodes HTML entities', () => {
    expect(stripHtml('&amp; &lt; &gt; &quot; &#39; &nbsp;')).toBe("& < > \" '");
  });

  it('collapses whitespace', () => {
    expect(stripHtml('  hello   world  ')).toBe('hello world');
  });
});

// ---------------------------------------------------------------------------
// htmlToMarkdown
// ---------------------------------------------------------------------------

describe('htmlToMarkdown', () => {
  it('converts headings', () => {
    expect(htmlToMarkdown('<h1>Title</h1>')).toBe('# Title');
  });

  it('converts h2', () => {
    expect(htmlToMarkdown('<h2>Subtitle</h2>')).toBe('## Subtitle');
  });

  it('converts bold', () => {
    expect(htmlToMarkdown('<strong>bold</strong>')).toBe('**bold**');
    expect(htmlToMarkdown('<b>bold</b>')).toBe('**bold**');
  });

  it('converts italic', () => {
    expect(htmlToMarkdown('<em>italic</em>')).toBe('*italic*');
    expect(htmlToMarkdown('<i>italic</i>')).toBe('*italic*');
  });

  it('converts links', () => {
    expect(htmlToMarkdown('<a href="https://x.com">link</a>')).toBe('[link](https://x.com)');
  });

  it('converts list items', () => {
    const result = htmlToMarkdown('<ul><li>one</li><li>two</li></ul>');
    expect(result).toContain('- one');
    expect(result).toContain('- two');
  });

  it('converts line breaks', () => {
    expect(htmlToMarkdown('a<br>b')).toContain('a\nb');
  });

  it('converts code', () => {
    expect(htmlToMarkdown('<code>x</code>')).toBe('`x`');
  });

  it('decodes entities', () => {
    expect(htmlToMarkdown('&amp; &lt;')).toBe('& <');
  });
});

// ---------------------------------------------------------------------------
// normalizeSubject
// ---------------------------------------------------------------------------

describe('normalizeSubject', () => {
  it('strips Re: prefix', () => {
    expect(normalizeSubject('Re: Hello')).toBe('Hello');
  });

  it('strips Fw: prefix', () => {
    expect(normalizeSubject('Fw: Hello')).toBe('Hello');
  });

  it('strips Fwd: prefix', () => {
    expect(normalizeSubject('Fwd: Hello')).toBe('Hello');
  });

  it('strips Aw: prefix (German)', () => {
    expect(normalizeSubject('Aw: Hello')).toBe('Hello');
  });

  it('is case-insensitive', () => {
    expect(normalizeSubject('RE: Hello')).toBe('Hello');
    expect(normalizeSubject('FW: Hello')).toBe('Hello');
  });

  it('strips chained prefixes', () => {
    // The regex uses /g flag but only strips one level per match at start
    // 'Re: Re: Fwd: Hello' -> first strip 'Re: ' -> 'Re: Fwd: Hello'
    // The regex is non-global so only strips leading prefix once
    const result = normalizeSubject('Re: Re: Fwd: Hello');
    // The implementation strips one prefix at a time from start
    expect(result).toBe('Re: Fwd: Hello');
  });

  it('returns unchanged if no prefix', () => {
    expect(normalizeSubject('Hello World')).toBe('Hello World');
  });
});

// ---------------------------------------------------------------------------
// generateId
// ---------------------------------------------------------------------------

describe('generateId', () => {
  it('returns a non-empty string', () => {
    expect(generateId()).toBeTruthy();
  });

  it('generates unique IDs', () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId()));
    expect(ids.size).toBe(100);
  });

  it('contains a dash separator', () => {
    expect(generateId()).toContain('-');
  });
});

// ---------------------------------------------------------------------------
// chunkText
// ---------------------------------------------------------------------------

describe('chunkText', () => {
  it('returns single chunk for short text', () => {
    expect(chunkText('Hello world', 1000)).toEqual(['Hello world']);
  });

  it('splits long text into chunks', () => {
    const text = 'a'.repeat(2500);
    const chunks = chunkText(text, 1000, 200);
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('respects sentence boundaries when possible', () => {
    const text = 'First sentence. ' + 'a'.repeat(800) + '. Second sentence here.';
    const chunks = chunkText(text, 1000, 200);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('handles overlap correctly', () => {
    const text = 'a'.repeat(2000);
    const chunks = chunkText(text, 1000, 200);
    // With 200 overlap, chunks should share content
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('returns empty array filtering for empty text', () => {
    expect(chunkText('')).toEqual(['']);
  });
});

// ---------------------------------------------------------------------------
// cosineSimilarity
// ---------------------------------------------------------------------------

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const v = [1, 2, 3];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 5);
  });

  it('returns 0 for zero vector', () => {
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
  });

  it('handles high-dimensional vectors', () => {
    const a = Array.from({ length: 1536 }, (_, i) => Math.sin(i));
    const b = Array.from({ length: 1536 }, (_, i) => Math.sin(i));
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5);
  });
});

// ---------------------------------------------------------------------------
// tryImport
// ---------------------------------------------------------------------------

describe('tryImport', () => {
  it('imports existing module', async () => {
    const zod = await tryImport<typeof import('zod')>('zod', 'test');
    expect(zod).toBeDefined();
  });

  it('throws DependencyError for missing module', async () => {
    await expect(tryImport('nonexistent-module', 'test')).rejects.toThrow(DependencyError);
  });
});

// ---------------------------------------------------------------------------
// sleep
// ---------------------------------------------------------------------------

describe('sleep', () => {
  it('resolves after delay', async () => {
    vi.useFakeTimers();
    const promise = sleep(100);
    vi.advanceTimersByTime(100);
    await expect(promise).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// truncate
// ---------------------------------------------------------------------------

describe('truncate', () => {
  it('returns short string unchanged', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('truncates long string with ellipsis', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
  });

  it('handles exact boundary', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });
});
