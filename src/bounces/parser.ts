import type { Email } from '../core/types.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BounceInfo {
  bounceType: 'hard' | 'soft' | 'unknown';
  reason: string;
  recipient: string;
  diagnosticCode?: string;
  status?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Subject-line patterns that indicate a bounce / DSN email */
const BOUNCE_SUBJECT_PATTERNS = [
  /delivery status notification/i,
  /undeliverable/i,
  /mail delivery failed/i,
  /returned mail/i,
  /delivery failure/i,
  /failure notice/i,
  /undelivered mail/i,
];

/** Sender addresses that are typical of bounce messages */
const BOUNCE_SENDER_PATTERNS = [/^mailer-daemon@/i, /^postmaster@/i];

/** Headers that indicate an auto-generated response */
const AUTO_HEADERS: Array<{ key: string; pattern: RegExp }> = [
  { key: 'Auto-Submitted', pattern: /auto-replied|auto-generated/i },
  { key: 'auto-submitted', pattern: /auto-replied|auto-generated/i },
];

/** Email address regex for extracting recipients */
const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

/** DSN status code pattern (e.g. 5.1.1, 4.7.1) */
const DSN_STATUS_REGEX = /\b([45])\.\d{1,3}\.\d{1,3}\b/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matchesBounceSubject(subject: string): boolean {
  return BOUNCE_SUBJECT_PATTERNS.some((pattern) => pattern.test(subject));
}

function matchesBounceSender(fromAddress: string): boolean {
  return BOUNCE_SENDER_PATTERNS.some((pattern) => pattern.test(fromAddress));
}

function hasAutoHeaders(headers: Record<string, string | string[] | undefined>): boolean {
  for (const { key, pattern } of AUTO_HEADERS) {
    const value = headers[key];
    if (typeof value === 'string' && pattern.test(value)) {
      return true;
    }
    if (Array.isArray(value) && value.some((v) => pattern.test(v))) {
      return true;
    }
  }
  return false;
}

/**
 * Extract the first email address found after a DSN-style header in the body.
 */
function extractRecipient(body: string): string {
  // Try structured DSN headers first
  const finalRecipientMatch = body.match(
    /Final-Recipient:\s*(?:rfc822;)?\s*([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i,
  );
  if (finalRecipientMatch) return finalRecipientMatch[1];

  const xFailedMatch = body.match(
    /X-Failed-Recipients:\s*([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i,
  );
  if (xFailedMatch) return xFailedMatch[1];

  const originalRecipientMatch = body.match(
    /Original-Recipient:\s*(?:rfc822;)?\s*([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i,
  );
  if (originalRecipientMatch) return originalRecipientMatch[1];

  // Fall back to finding any email address in the body that is not the
  // mailer-daemon / postmaster sender
  const allEmails = body.match(EMAIL_REGEX);
  if (allEmails) {
    for (const email of allEmails) {
      const lower = email.toLowerCase();
      if (
        !lower.startsWith('mailer-daemon@') &&
        !lower.startsWith('postmaster@')
      ) {
        return email;
      }
    }
  }

  return '';
}

/**
 * Extract a DSN status code from the body text.
 */
function extractDiagnosticCode(body: string): string | undefined {
  // Look for explicit Diagnostic-Code header
  const diagnosticMatch = body.match(
    /Diagnostic-Code:\s*(?:smtp;)?\s*(.+?)(?:\r?\n(?!\s)|$)/i,
  );
  if (diagnosticMatch) {
    const code = diagnosticMatch[1].trim();
    return code || undefined;
  }

  // Look for Status header
  const statusMatch = body.match(/Status:\s*([45]\.\d{1,3}\.\d{1,3})/i);
  if (statusMatch) return statusMatch[1];

  return undefined;
}

/**
 * Extract the DSN status class (4.x.x or 5.x.x) from a diagnostic code or
 * body.
 */
function extractStatusCode(diagnosticCode: string | undefined, body: string): string | undefined {
  if (diagnosticCode) {
    const match = diagnosticCode.match(DSN_STATUS_REGEX);
    if (match) return match[0];
  }

  // Try to find it in the body directly
  const bodyMatch = body.match(/Status:\s*([45]\.\d{1,3}\.\d{1,3})/i);
  if (bodyMatch) return bodyMatch[1];

  const generalMatch = body.match(DSN_STATUS_REGEX);
  if (generalMatch) return generalMatch[0];

  return undefined;
}

/**
 * Extract a human-readable reason from the bounce body.
 */
function extractReason(body: string): string {
  // Try Diagnostic-Code first
  const diagnosticMatch = body.match(
    /Diagnostic-Code:\s*(?:smtp;)?\s*(.+?)(?:\r?\n(?!\s)|$)/i,
  );
  if (diagnosticMatch) {
    return diagnosticMatch[1].trim();
  }

  // Try "Action: failed" followed by reason
  const actionMatch = body.match(
    /Action:\s*failed\s*[\r\n]+\s*(?:Status:[^\r\n]*[\r\n]+\s*)?(?:Diagnostic-Code:\s*(?:smtp;)?\s*)?(.+?)(?:\r?\n|$)/i,
  );
  if (actionMatch) {
    return actionMatch[1].trim();
  }

  // Try to find a meaningful error line
  const lines = body.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    // Look for lines that describe the failure
    if (
      /(?:was not delivered|could not be delivered|has been returned|unable to deliver|rejected|refused|mailbox (?:not found|full|unavailable)|user (?:unknown|not found)|no such user|account (?:disabled|suspended))/i.test(
        trimmed,
      )
    ) {
      return trimmed;
    }
  }

  return 'Delivery failed';
}

/**
 * Determine bounce type from the DSN status code.
 *
 * - Status codes starting with 5 indicate permanent (hard) bounces.
 * - Status codes starting with 4 indicate temporary (soft) bounces.
 * - If no status code is found, returns 'unknown'.
 */
function determineBounceType(
  statusCode: string | undefined,
): 'hard' | 'soft' | 'unknown' {
  if (!statusCode) return 'unknown';

  if (statusCode.startsWith('5')) return 'hard';
  if (statusCode.startsWith('4')) return 'soft';

  return 'unknown';
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether the given email looks like a bounce / DSN message.
 */
export function isBounceEmail(email: Email): boolean {
  // Check subject
  if (matchesBounceSubject(email.subject)) return true;

  // Check sender address
  if (matchesBounceSender(email.from.address)) return true;

  // Check auto-generated headers
  if (hasAutoHeaders(email.headers)) return true;

  return false;
}

/**
 * Parse a bounce / DSN email and extract structured information about the
 * delivery failure.
 *
 * Returns `null` if the email does not appear to be a bounce message.
 */
export function parseBounce(email: Email): BounceInfo | null {
  if (!isBounceEmail(email)) return null;

  const body = email.body.text || email.body.html || '';

  const diagnosticCode = extractDiagnosticCode(body);
  const statusCode = extractStatusCode(diagnosticCode, body);
  const bounceType = determineBounceType(statusCode);
  const recipient = extractRecipient(body);
  const reason = extractReason(body);

  return {
    bounceType,
    reason,
    recipient,
    diagnosticCode,
    status: statusCode,
  };
}
