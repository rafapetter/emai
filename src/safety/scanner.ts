import type {
  SafetyConfig,
  SafetyContext,
  ScanResult,
  Risk,
  Email,
  SendEmailOptions,
  EmailAddress,
} from '../core/types.js';
import { normalizeAddresses, stripHtml } from '../core/utils.js';

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

const PHONE_PATTERNS = [
  /(?<!\d)(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}(?!\d)/g,
  /(?<!\d)\+\d{1,3}\s?\d{4,14}(?!\d)/g,
];

const SSN_PATTERN = /\b\d{3}-\d{2}-\d{4}\b/g;

const DOB_PATTERNS = [
  /\b(?:date\s+of\s+birth|dob|born|birthday)\s*[:\-]?\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/gi,
  /\b(?:date\s+of\s+birth|dob|born|birthday)\s*[:\-]?\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2},?\s*\d{2,4}\b/gi,
];

const PASSPORT_PATTERN = /\b(?:passport\s*(?:no|number|#)?[:\s]*)?[A-Z]{1,2}\d{6,9}\b/gi;

const ADDRESS_PATTERN =
  /\b\d{1,5}\s+(?:[A-Z][a-zA-Z]*\s){1,4}(?:St|Street|Ave|Avenue|Blvd|Boulevard|Dr|Drive|Ln|Lane|Rd|Road|Ct|Court|Way|Pl|Place)\.?\s*(?:#\s*\d+|Apt\.?\s*\d+|Suite\s*\d+|Unit\s*\d+)?\b/gi;

const API_KEY_PATTERNS = [
  /\bsk-[a-zA-Z0-9]{20,}\b/g,
  /\bsk-proj-[a-zA-Z0-9_-]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bghp_[a-zA-Z0-9]{36,}\b/g,
  /\bgho_[a-zA-Z0-9]{36,}\b/g,
  /\bghs_[a-zA-Z0-9]{36,}\b/g,
  /\bghu_[a-zA-Z0-9]{36,}\b/g,
  /\bxox[bposatr]-[a-zA-Z0-9-]{10,}\b/g,
  /\bglpat-[a-zA-Z0-9_-]{20,}\b/g,
  /\bnpm_[a-zA-Z0-9]{36,}\b/g,
  /\bSG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}\b/g,
  /\brk_live_[a-zA-Z0-9]{24,}\b/g,
  /\bsk_live_[a-zA-Z0-9]{24,}\b/g,
  /\bsk_test_[a-zA-Z0-9]{24,}\b/g,
];

const PASSWORD_PATTERNS = [
  /(?:password|passwd|pwd|pass|secret|token|api[_-]?key|auth[_-]?key)\s*[:=]\s*["']?([^\s"'\n]{4,})["']?/gi,
];

const PRIVATE_KEY_PATTERN =
  /-----BEGIN\s+(?:RSA\s+)?(?:EC\s+)?(?:DSA\s+)?(?:OPENSSH\s+)?PRIVATE\s+KEY-----/g;

const JWT_PATTERN = /\beyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g;

const CONNECTION_STRING_PATTERNS = [
  /(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|amqp|mssql):\/\/[^\s"'<>]{10,}/gi,
  /(?:Server|Data Source)=[^;]+;.*(?:Password|Pwd)=[^;]+/gi,
];

const AWS_SECRET_PATTERN = /\b[A-Za-z0-9/+=]{40}\b/g;

const URGENCY_PHRASES = [
  /\b(?:act\s+now|immediate(?:ly)?|urgent(?:ly)?|asap|right\s+away)\b/gi,
  /\b(?:your\s+account\s+(?:has\s+been|will\s+be|is)\s+(?:suspended|locked|closed|compromised))\b/gi,
  /\b(?:verify\s+your\s+(?:account|identity|information)|confirm\s+your\s+(?:account|identity))\b/gi,
  /\b(?:limited\s+time|expires?\s+(?:today|soon|in\s+\d+)|last\s+chance|final\s+warning)\b/gi,
  /\b(?:click\s+(?:here|below|this\s+link)\s+(?:to|and)\s+(?:verify|confirm|update|secure))\b/gi,
  /\b(?:failure\s+to\s+(?:respond|act|verify)\s+will\s+result)\b/gi,
  /\b(?:unauthorized\s+(?:access|activity|login)\s+(?:detected|attempt))\b/gi,
];

const IMPERSONATION_PATTERNS = [
  /\b(?:(?:paypal|apple|google|microsoft|amazon|netflix|bank\s+of\s+america|wells\s+fargo|chase)\s+(?:security|support|team|service))\b/gi,
  /\b(?:(?:IT|tech(?:nical)?)\s+(?:support|department|team|helpdesk))\b/gi,
  /\b(?:(?:CEO|CFO|CTO|COO)\s+(?:office|assistant))\b/gi,
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractHostname(url: string): string | null {
  const match = url.match(/^https?:\/\/([^/:?#]+)/i);
  return match ? match[1].toLowerCase() : null;
}

function luhnCheck(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;

  let sum = 0;
  let alternate = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

const CREDIT_CARD_PATTERN =
  /\b(?:4\d{3}|5[1-5]\d{2}|3[47]\d{2}|6(?:011|5\d{2}))[- ]?\d{4}[- ]?\d{4}[- ]?\d{1,4}\b/g;

function extractEmailAddresses(text: string): string[] {
  const matches = text.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g);
  return matches ?? [];
}

function redact(text: string, visibleChars = 4): string {
  if (text.length <= visibleChars) return '*'.repeat(text.length);
  return text.slice(0, visibleChars) + '*'.repeat(text.length - visibleChars);
}

function getKnownAddresses(context: SafetyContext): Set<string> {
  const known = new Set<string>();
  if (context.sender) known.add(context.sender.address.toLowerCase());
  if (context.recipients) {
    for (const r of context.recipients) known.add(r.address.toLowerCase());
  }
  return known;
}

function extractContentFromEmail(email: Email | SendEmailOptions): string {
  const parts: string[] = [];

  if ('subject' in email && email.subject) parts.push(email.subject);

  if ('body' in email) {
    const body = (email as Email).body;
    if (body.text) parts.push(body.text);
    if (body.html) parts.push(stripHtml(body.html));
  } else {
    if (email.text) parts.push(email.text);
    if (email.html) parts.push(stripHtml(email.html));
  }

  return parts.join('\n');
}

function buildContextFromEmail(
  email: Email | SendEmailOptions,
  direction: 'inbound' | 'outbound',
): SafetyContext {
  if ('from' in email && 'to' in email && 'date' in email) {
    const e = email as Email;
    return {
      direction,
      sender: e.from,
      recipients: [...e.to, ...e.cc, ...e.bcc],
      subject: e.subject,
      hasAttachments: e.attachments.length > 0,
    };
  }

  const opts = email as SendEmailOptions;
  return {
    direction,
    recipients: normalizeAddresses(opts.to),
    subject: opts.subject,
    hasAttachments: (opts.attachments?.length ?? 0) > 0,
  };
}

function extractRawHtml(email: Email | SendEmailOptions): string | undefined {
  if ('body' in email && 'date' in email) {
    return (email as Email).body.html ?? undefined;
  }
  return (email as SendEmailOptions).html ?? undefined;
}

function scanPhishingLinks(html: string): Risk[] {
  const risks: Risk[] = [];
  const linkPattern = /<a[^>]*href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(html)) !== null) {
    const href = match[1];
    const displayText = match[2].trim();
    if (/^https?:\/\//i.test(displayText) && !href.startsWith(displayText.replace(/\/+$/, ''))) {
      const hrefHost = extractHostname(href);
      const displayHost = extractHostname(displayText);
      if (hrefHost && displayHost && hrefHost !== displayHost) {
        risks.push({
          type: 'phishing',
          severity: 'high',
          description: `Suspicious link: display text shows "${displayHost}" but links to "${hrefHost}"`,
          location: 'body',
          matched: match[0],
          redacted: `[SUSPICIOUS LINK: ${hrefHost}]`,
        });
      }
    }
  }
  return risks;
}

// ---------------------------------------------------------------------------
// Individual scanners
// ---------------------------------------------------------------------------

function scanPii(content: string, context: SafetyContext): Risk[] {
  const risks: Risk[] = [];
  const knownAddresses = getKnownAddresses(context);

  const foundEmails = extractEmailAddresses(content);
  for (const addr of foundEmails) {
    if (!knownAddresses.has(addr.toLowerCase())) {
      risks.push({
        type: 'pii',
        severity: 'medium',
        description: 'Email address detected in content',
        location: 'body',
        matched: addr,
        redacted: redact(addr, 3),
      });
    }
  }

  for (const pattern of PHONE_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      risks.push({
        type: 'pii',
        severity: 'medium',
        description: 'Phone number detected',
        location: 'body',
        matched: match[0],
        redacted: redact(match[0], 3),
      });
    }
  }

  SSN_PATTERN.lastIndex = 0;
  let ssnMatch: RegExpExecArray | null;
  while ((ssnMatch = SSN_PATTERN.exec(content)) !== null) {
    risks.push({
      type: 'pii',
      severity: 'critical',
      description: 'Social Security Number detected',
      location: 'body',
      matched: ssnMatch[0],
      redacted: '***-**-' + ssnMatch[0].slice(-4),
    });
  }

  CREDIT_CARD_PATTERN.lastIndex = 0;
  let ccMatch: RegExpExecArray | null;
  while ((ccMatch = CREDIT_CARD_PATTERN.exec(content)) !== null) {
    if (luhnCheck(ccMatch[0])) {
      const digits = ccMatch[0].replace(/\D/g, '');
      risks.push({
        type: 'pii',
        severity: 'critical',
        description: 'Credit card number detected (Luhn-validated)',
        location: 'body',
        matched: ccMatch[0],
        redacted: '*'.repeat(digits.length - 4) + digits.slice(-4),
      });
    }
  }

  for (const pattern of DOB_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      risks.push({
        type: 'pii',
        severity: 'high',
        description: 'Date of birth detected',
        location: 'body',
        matched: match[0],
        redacted: redact(match[0]),
      });
    }
  }

  PASSPORT_PATTERN.lastIndex = 0;
  let passportMatch: RegExpExecArray | null;
  while ((passportMatch = PASSPORT_PATTERN.exec(content)) !== null) {
    risks.push({
      type: 'pii',
      severity: 'high',
      description: 'Passport number detected',
      location: 'body',
      matched: passportMatch[0],
      redacted: redact(passportMatch[0], 2),
    });
  }

  ADDRESS_PATTERN.lastIndex = 0;
  let addrMatch: RegExpExecArray | null;
  while ((addrMatch = ADDRESS_PATTERN.exec(content)) !== null) {
    risks.push({
      type: 'pii',
      severity: 'medium',
      description: 'Physical address detected',
      location: 'body',
      matched: addrMatch[0],
      redacted: redact(addrMatch[0], 5),
    });
  }

  return risks;
}

function scanCredentials(content: string): Risk[] {
  const risks: Risk[] = [];

  for (const pattern of API_KEY_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      risks.push({
        type: 'credential',
        severity: 'critical',
        description: 'API key detected',
        location: 'body',
        matched: match[0],
        redacted: redact(match[0], 6),
      });
    }
  }

  for (const pattern of PASSWORD_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      risks.push({
        type: 'credential',
        severity: 'critical',
        description: 'Plaintext password or secret detected',
        location: 'body',
        matched: match[0],
        redacted: match[0].replace(/[:=]\s*["']?.*["']?$/, ': [REDACTED]'),
      });
    }
  }

  PRIVATE_KEY_PATTERN.lastIndex = 0;
  if (PRIVATE_KEY_PATTERN.test(content)) {
    risks.push({
      type: 'credential',
      severity: 'critical',
      description: 'Private key detected',
      location: 'body',
      matched: '-----BEGIN PRIVATE KEY-----',
      redacted: '[PRIVATE KEY REDACTED]',
    });
  }

  JWT_PATTERN.lastIndex = 0;
  let jwtMatch: RegExpExecArray | null;
  while ((jwtMatch = JWT_PATTERN.exec(content)) !== null) {
    risks.push({
      type: 'credential',
      severity: 'high',
      description: 'JWT token detected',
      location: 'body',
      matched: jwtMatch[0],
      redacted: redact(jwtMatch[0], 10),
    });
  }

  for (const pattern of CONNECTION_STRING_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      risks.push({
        type: 'credential',
        severity: 'critical',
        description: 'Database connection string detected',
        location: 'body',
        matched: match[0],
        redacted: redact(match[0], 15),
      });
    }
  }

  const awsKeyPattern = /\bAKIA[0-9A-Z]{16}\b/g;
  awsKeyPattern.lastIndex = 0;
  let awsAccessMatch: RegExpExecArray | null;
  while ((awsAccessMatch = awsKeyPattern.exec(content)) !== null) {
    const nearbyText = content.slice(
      Math.max(0, awsAccessMatch.index - 200),
      Math.min(content.length, awsAccessMatch.index + awsAccessMatch[0].length + 200),
    );
    AWS_SECRET_PATTERN.lastIndex = 0;
    let secretMatch: RegExpExecArray | null;
    while ((secretMatch = AWS_SECRET_PATTERN.exec(nearbyText)) !== null) {
      if (secretMatch[0] !== awsAccessMatch[0]) {
        risks.push({
          type: 'credential',
          severity: 'critical',
          description: 'Potential AWS secret key detected near access key',
          location: 'body',
          matched: secretMatch[0],
          redacted: redact(secretMatch[0], 4),
        });
        break;
      }
    }
  }

  return risks;
}

function scanPhishing(content: string, context: SafetyContext): Risk[] {
  if (context.direction !== 'inbound') return [];

  const risks: Risk[] = [];

  risks.push(...scanPhishingLinks(content));

  for (const pattern of URGENCY_PHRASES) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      risks.push({
        type: 'phishing',
        severity: 'medium',
        description: 'Urgency/pressure language detected',
        location: 'body',
        matched: match[0],
      });
    }
  }

  for (const pattern of IMPERSONATION_PATTERNS) {
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      risks.push({
        type: 'phishing',
        severity: 'high',
        description: 'Potential impersonation attempt detected',
        location: 'body',
        matched: match[0],
      });
    }
  }

  return risks;
}

function scanDomains(context: SafetyContext, config: SafetyConfig): Risk[] {
  const risks: Risk[] = [];
  const recipients = context.recipients ?? [];

  for (const recipient of recipients) {
    const domain = recipient.address.split('@')[1]?.toLowerCase();
    if (!domain) continue;

    if (config.blockedDomains?.some((d) => domain === d.toLowerCase() || domain.endsWith('.' + d.toLowerCase()))) {
      risks.push({
        type: 'domain',
        severity: 'high',
        description: `Recipient domain "${domain}" is in the blocked list`,
        location: 'recipients',
        matched: recipient.address,
      });
    }

    if (
      config.allowedDomains &&
      config.allowedDomains.length > 0 &&
      !config.allowedDomains.some((d) => domain === d.toLowerCase() || domain.endsWith('.' + d.toLowerCase()))
    ) {
      risks.push({
        type: 'domain',
        severity: 'medium',
        description: `Recipient domain "${domain}" is not in the allowed list`,
        location: 'recipients',
        matched: recipient.address,
      });
    }
  }

  return risks;
}

function scanRecipientCount(context: SafetyContext, config: SafetyConfig): Risk[] {
  const max = config.maxRecipientsPerEmail;
  if (!max) return [];

  const count = context.recipients?.length ?? 0;
  if (count > max) {
    return [
      {
        type: 'policy',
        severity: 'high',
        description: `Too many recipients (${count}). Maximum allowed: ${max}`,
        location: 'recipients',
      },
    ];
  }

  return [];
}

// ---------------------------------------------------------------------------
// SafetyScanner
// ---------------------------------------------------------------------------

export class SafetyScanner {
  private readonly config: SafetyConfig;

  constructor(config: SafetyConfig) {
    this.config = config;
  }

  scan(content: string, context: SafetyContext): ScanResult {
    const risks: Risk[] = [];

    if (this.config.piiScanning !== false) {
      risks.push(...scanPii(content, context));
    }

    if (this.config.credentialScanning !== false) {
      risks.push(...scanCredentials(content));
    }

    risks.push(...scanPhishing(content, context));
    risks.push(...scanDomains(context, this.config));
    risks.push(...scanRecipientCount(context, this.config));

    if (this.config.customPolicies) {
      for (const policy of this.config.customPolicies) {
        risks.push(...policy.check(content, context));
      }
    }

    const blocked = risks.some((r) => r.severity === 'critical');
    const requiresApproval = this.shouldRequireApproval(risks);

    return { safe: risks.length === 0, risks, blocked, requiresApproval };
  }

  scanEmail(email: Email | SendEmailOptions, direction: 'inbound' | 'outbound'): ScanResult {
    const content = extractContentFromEmail(email);
    const context = buildContextFromEmail(email, direction);
    const result = this.scan(content, context);

    if (direction === 'inbound') {
      const rawHtml = extractRawHtml(email);
      if (rawHtml) {
        const linkRisks = scanPhishingLinks(rawHtml);
        if (linkRisks.length > 0) {
          result.risks.push(...linkRisks);
          result.safe = false;
          if (linkRisks.some((r) => r.severity === 'critical')) {
            result.blocked = true;
          }
          if (!result.requiresApproval) {
            result.requiresApproval = this.shouldRequireApproval(linkRisks);
          }
        }
      }
    }

    return result;
  }

  scanOutbound(options: SendEmailOptions): ScanResult {
    return this.scanEmail(options, 'outbound');
  }

  private shouldRequireApproval(risks: Risk[]): boolean {
    const mode = this.config.humanApproval ?? 'none';

    switch (mode) {
      case 'none':
        return false;
      case 'high-risk':
        return risks.some((r) => r.severity === 'critical' || r.severity === 'high');
      case 'all':
        return true;
    }
  }
}
