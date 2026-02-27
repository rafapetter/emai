import type {
  SafetyConfig,
  SafetyPolicy,
  SafetyContext,
  Risk,
} from '../core/types.js';

// ---------------------------------------------------------------------------
// PiiPolicy
// ---------------------------------------------------------------------------

const PHONE_RE = /(?<!\d)(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}(?!\d)/g;
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/g;
const CC_RE =
  /\b(?:4\d{3}|5[1-5]\d{2}|3[47]\d{2}|6(?:011|5\d{2}))[- ]?\d{4}[- ]?\d{4}[- ]?\d{1,4}\b/g;
const DOB_RE =
  /\b(?:date\s+of\s+birth|dob|born|birthday)\s*[:\-]?\s*\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b/gi;

function luhnCheck(num: string): boolean {
  const digits = num.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function knownAddrs(ctx: SafetyContext): Set<string> {
  const s = new Set<string>();
  if (ctx.sender) s.add(ctx.sender.address.toLowerCase());
  if (ctx.recipients) for (const r of ctx.recipients) s.add(r.address.toLowerCase());
  return s;
}

export const PiiPolicy: SafetyPolicy = {
  name: 'pii',
  description: 'Detects personally identifiable information such as SSNs, credit cards, and phone numbers',
  check(content: string, context: SafetyContext): Risk[] {
    const risks: Risk[] = [];
    const known = knownAddrs(context);

    const emails = content.match(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g) ?? [];
    for (const addr of emails) {
      if (!known.has(addr.toLowerCase())) {
        risks.push({ type: 'pii', severity: 'medium', description: 'Email address detected', matched: addr });
      }
    }

    PHONE_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = PHONE_RE.exec(content))) {
      risks.push({ type: 'pii', severity: 'medium', description: 'Phone number detected', matched: m[0] });
    }

    SSN_RE.lastIndex = 0;
    while ((m = SSN_RE.exec(content))) {
      risks.push({ type: 'pii', severity: 'critical', description: 'SSN detected', matched: m[0] });
    }

    CC_RE.lastIndex = 0;
    while ((m = CC_RE.exec(content))) {
      if (luhnCheck(m[0])) {
        risks.push({ type: 'pii', severity: 'critical', description: 'Credit card number detected', matched: m[0] });
      }
    }

    DOB_RE.lastIndex = 0;
    while ((m = DOB_RE.exec(content))) {
      risks.push({ type: 'pii', severity: 'high', description: 'Date of birth detected', matched: m[0] });
    }

    return risks;
  },
};

// ---------------------------------------------------------------------------
// CredentialPolicy
// ---------------------------------------------------------------------------

const CRED_PATTERNS: Array<{ re: RegExp; desc: string }> = [
  { re: /\bsk-[a-zA-Z0-9]{20,}\b/g, desc: 'OpenAI API key' },
  { re: /\bsk-proj-[a-zA-Z0-9_-]{20,}\b/g, desc: 'OpenAI project API key' },
  { re: /\bAKIA[0-9A-Z]{16}\b/g, desc: 'AWS access key' },
  { re: /\bghp_[a-zA-Z0-9]{36,}\b/g, desc: 'GitHub personal access token' },
  { re: /\bxox[bposatr]-[a-zA-Z0-9-]{10,}\b/g, desc: 'Slack token' },
  { re: /-----BEGIN\s+(?:RSA\s+)?(?:EC\s+)?(?:DSA\s+)?(?:OPENSSH\s+)?PRIVATE\s+KEY-----/g, desc: 'Private key' },
  { re: /\beyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/g, desc: 'JWT token' },
  {
    re: /(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|redis|amqp|mssql):\/\/[^\s"'<>]{10,}/gi,
    desc: 'Connection string',
  },
  {
    re: /(?:password|passwd|pwd|pass|secret|token|api[_-]?key)\s*[:=]\s*["']?([^\s"'\n]{4,})["']?/gi,
    desc: 'Plaintext password/secret',
  },
];

export const CredentialPolicy: SafetyPolicy = {
  name: 'credential',
  description: 'Detects credentials such as API keys, passwords, private keys, and connection strings',
  check(content: string): Risk[] {
    const risks: Risk[] = [];
    for (const { re, desc } of CRED_PATTERNS) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(content))) {
        risks.push({ type: 'credential', severity: 'critical', description: `${desc} detected`, matched: m[0] });
      }
    }
    return risks;
  },
};

// ---------------------------------------------------------------------------
// PhishingPolicy
// ---------------------------------------------------------------------------

const URGENCY_RE = [
  /\b(?:act\s+now|immediate(?:ly)?|urgent(?:ly)?|asap|right\s+away)\b/gi,
  /\b(?:your\s+account\s+(?:has\s+been|will\s+be|is)\s+(?:suspended|locked|closed|compromised))\b/gi,
  /\b(?:verify\s+your\s+(?:account|identity|information))\b/gi,
  /\b(?:unauthorized\s+(?:access|activity|login)\s+(?:detected|attempt))\b/gi,
];

const IMPERSONATION_RE = [
  /\b(?:(?:paypal|apple|google|microsoft|amazon|netflix)\s+(?:security|support|team|service))\b/gi,
];

export const PhishingPolicy: SafetyPolicy = {
  name: 'phishing',
  description: 'Detects phishing indicators such as urgency language and impersonation attempts',
  check(content: string, context: SafetyContext): Risk[] {
    if (context.direction !== 'inbound') return [];
    const risks: Risk[] = [];

    for (const re of URGENCY_RE) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(content))) {
        risks.push({ type: 'phishing', severity: 'medium', description: 'Urgency language detected', matched: m[0] });
      }
    }

    for (const re of IMPERSONATION_RE) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(content))) {
        risks.push({
          type: 'phishing',
          severity: 'high',
          description: 'Potential impersonation attempt',
          matched: m[0],
        });
      }
    }

    return risks;
  },
};

// ---------------------------------------------------------------------------
// DomainPolicy
// ---------------------------------------------------------------------------

function createDomainPolicy(config: SafetyConfig): SafetyPolicy {
  return {
    name: 'domain',
    description: 'Checks recipient domains against blocked and allowed lists',
    check(_content: string, context: SafetyContext): Risk[] {
      const risks: Risk[] = [];
      const recipients = context.recipients ?? [];

      for (const r of recipients) {
        const domain = r.address.split('@')[1]?.toLowerCase();
        if (!domain) continue;

        if (
          config.blockedDomains?.some(
            (d) => domain === d.toLowerCase() || domain.endsWith('.' + d.toLowerCase()),
          )
        ) {
          risks.push({
            type: 'domain',
            severity: 'high',
            description: `Blocked domain: ${domain}`,
            matched: r.address,
          });
        }

        if (
          config.allowedDomains &&
          config.allowedDomains.length > 0 &&
          !config.allowedDomains.some(
            (d) => domain === d.toLowerCase() || domain.endsWith('.' + d.toLowerCase()),
          )
        ) {
          risks.push({
            type: 'domain',
            severity: 'medium',
            description: `Domain not in allowed list: ${domain}`,
            matched: r.address,
          });
        }
      }

      return risks;
    },
  };
}

export { createDomainPolicy as DomainPolicy };

// ---------------------------------------------------------------------------
// RateLimitPolicy
// ---------------------------------------------------------------------------

export function createRateLimitPolicy(maxPerWindow: number, windowMs: number): SafetyPolicy {
  const timestamps: number[] = [];

  return {
    name: 'rate-limit',
    description: `Limits email sending to ${maxPerWindow} emails per ${windowMs / 1000}s window`,
    check(_content: string, context: SafetyContext): Risk[] {
      if (context.direction !== 'outbound') return [];

      const now = Date.now();
      while (timestamps.length > 0 && timestamps[0] < now - windowMs) {
        timestamps.shift();
      }

      if (timestamps.length >= maxPerWindow) {
        return [
          {
            type: 'policy',
            severity: 'high',
            description: `Rate limit exceeded: ${timestamps.length}/${maxPerWindow} emails in the current window`,
          },
        ];
      }

      timestamps.push(now);
      return [];
    },
  };
}

export { createRateLimitPolicy as RateLimitPolicy };

// ---------------------------------------------------------------------------
// ContentPolicy
// ---------------------------------------------------------------------------

const PROHIBITED_WORDS = [
  'fuck',
  'shit',
  'damn',
  'ass',
  'bitch',
  'bastard',
  'crap',
  'dick',
  'piss',
];

const THREAT_PATTERNS = [
  /\b(?:i\s+will\s+(?:kill|hurt|harm|destroy|attack)\s+you)\b/gi,
  /\b(?:you\s+will\s+(?:die|regret|pay\s+for\s+this|suffer))\b/gi,
  /\b(?:bomb\s+threat|death\s+threat)\b/gi,
  /\b(?:i'?m\s+going\s+to\s+(?:kill|murder|shoot|bomb|stab))\b/gi,
];

export const ContentPolicy: SafetyPolicy = {
  name: 'content',
  description: 'Checks for profanity, threats, and prohibited content',
  check(content: string, context: SafetyContext): Risk[] {
    if (context.direction !== 'outbound') return [];
    const risks: Risk[] = [];
    const lower = content.toLowerCase();

    for (const word of PROHIBITED_WORDS) {
      const re = new RegExp(`\\b${word}\\b`, 'gi');
      let m: RegExpExecArray | null;
      while ((m = re.exec(lower))) {
        risks.push({
          type: 'policy',
          severity: 'medium',
          description: 'Profanity detected',
          location: 'body',
          matched: m[0],
          redacted: m[0][0] + '*'.repeat(m[0].length - 1),
        });
      }
    }

    for (const pattern of THREAT_PATTERNS) {
      pattern.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = pattern.exec(content))) {
        risks.push({
          type: 'policy',
          severity: 'critical',
          description: 'Threatening language detected',
          location: 'body',
          matched: m[0],
        });
      }
    }

    return risks;
  },
};

// ---------------------------------------------------------------------------
// Default policies factory
// ---------------------------------------------------------------------------

export function getDefaultPolicies(config: SafetyConfig): SafetyPolicy[] {
  const policies: SafetyPolicy[] = [];

  if (config.piiScanning !== false) {
    policies.push(PiiPolicy);
  }

  if (config.credentialScanning !== false) {
    policies.push(CredentialPolicy);
  }

  policies.push(PhishingPolicy);

  if (config.blockedDomains?.length || config.allowedDomains?.length) {
    policies.push(createDomainPolicy(config));
  }

  policies.push(ContentPolicy);

  if (config.customPolicies) {
    policies.push(...config.customPolicies);
  }

  return policies;
}
