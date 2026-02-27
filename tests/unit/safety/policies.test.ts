import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  PiiPolicy,
  CredentialPolicy,
  PhishingPolicy,
  DomainPolicy,
  ContentPolicy,
  createRateLimitPolicy,
  getDefaultPolicies,
} from '../../../src/safety/policies.js';
import type { SafetyContext, SafetyConfig } from '../../../src/core/types.js';
import { ALICE, BOB } from '../../helpers/fixtures.js';

const inboundCtx: SafetyContext = { direction: 'inbound', sender: ALICE, recipients: [BOB] };
const outboundCtx: SafetyContext = { direction: 'outbound', sender: ALICE, recipients: [BOB] };

describe('PiiPolicy', () => {
  it('detects SSN', () => {
    const risks = PiiPolicy.check('SSN: 123-45-6789', inboundCtx);
    expect(risks.some((r) => r.description.includes('SSN'))).toBe(true);
  });

  it('detects phone numbers', () => {
    const risks = PiiPolicy.check('Call (555) 123-4567', inboundCtx);
    expect(risks.some((r) => r.description.includes('Phone'))).toBe(true);
  });

  it('detects credit card with Luhn validation', () => {
    const risks = PiiPolicy.check('Card: 4532015112830366', inboundCtx);
    expect(risks.some((r) => r.description.includes('Credit card'))).toBe(true);
  });

  it('detects DOB', () => {
    const risks = PiiPolicy.check('DOB: 01/15/1990', inboundCtx);
    expect(risks.some((r) => r.description.includes('Date of birth'))).toBe(true);
  });

  it('skips known email addresses', () => {
    const risks = PiiPolicy.check('Contact alice@example.com', inboundCtx);
    const emailRisks = risks.filter((r) => r.description.includes('Email address'));
    expect(emailRisks).toHaveLength(0);
  });

  it('detects unknown email addresses', () => {
    const risks = PiiPolicy.check('Contact unknown@test.com', inboundCtx);
    const emailRisks = risks.filter((r) => r.description.includes('Email address'));
    expect(emailRisks.length).toBeGreaterThan(0);
  });
});

describe('CredentialPolicy', () => {
  it('detects OpenAI API key', () => {
    const risks = CredentialPolicy.check('sk-abcdefghijklmnopqrstuvwxyz1234567890abcdef', outboundCtx);
    expect(risks.some((r) => r.description.includes('OpenAI API key'))).toBe(true);
  });

  it('detects AWS access key', () => {
    const risks = CredentialPolicy.check('AKIAIOSFODNN7EXAMPLE', outboundCtx);
    expect(risks.some((r) => r.description.includes('AWS access key'))).toBe(true);
  });

  it('detects GitHub token', () => {
    const risks = CredentialPolicy.check('ghp_' + 'a'.repeat(36), outboundCtx);
    expect(risks.some((r) => r.description.includes('GitHub'))).toBe(true);
  });

  it('detects private key', () => {
    const risks = CredentialPolicy.check('-----BEGIN RSA PRIVATE KEY-----', outboundCtx);
    expect(risks.some((r) => r.description.includes('Private key'))).toBe(true);
  });

  it('detects JWT', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop';
    const risks = CredentialPolicy.check(jwt, outboundCtx);
    expect(risks.some((r) => r.description.includes('JWT'))).toBe(true);
  });

  it('detects connection strings', () => {
    const risks = CredentialPolicy.check('postgres://user:pass@host:5432/db', outboundCtx);
    expect(risks.some((r) => r.description.includes('Connection string'))).toBe(true);
  });

  it('detects plaintext passwords', () => {
    const risks = CredentialPolicy.check('password: secret123', outboundCtx);
    expect(risks.some((r) => r.description.includes('password'))).toBe(true);
  });
});

describe('PhishingPolicy', () => {
  it('detects urgency language on inbound', () => {
    const risks = PhishingPolicy.check('Act now! Your account has been suspended.', inboundCtx);
    expect(risks.some((r) => r.description.includes('Urgency'))).toBe(true);
  });

  it('detects impersonation on inbound', () => {
    const risks = PhishingPolicy.check('From PayPal Security team', inboundCtx);
    expect(risks.some((r) => r.description.includes('impersonation'))).toBe(true);
  });

  it('skips outbound emails', () => {
    const risks = PhishingPolicy.check('Act now! Urgent!', outboundCtx);
    expect(risks).toHaveLength(0);
  });
});

describe('DomainPolicy', () => {
  it('blocks emails to blocked domain', () => {
    const policy = DomainPolicy({ blockedDomains: ['evil.com'] });
    const ctx: SafetyContext = {
      direction: 'outbound',
      recipients: [{ address: 'user@evil.com' }],
    };
    const risks = policy.check('', ctx);
    expect(risks.some((r) => r.type === 'domain')).toBe(true);
  });

  it('flags domain not in allowed list', () => {
    const policy = DomainPolicy({ allowedDomains: ['company.com'] });
    const ctx: SafetyContext = {
      direction: 'outbound',
      recipients: [{ address: 'user@other.com' }],
    };
    const risks = policy.check('', ctx);
    expect(risks.some((r) => r.type === 'domain')).toBe(true);
  });

  it('passes domain in allowed list', () => {
    const policy = DomainPolicy({ allowedDomains: ['company.com'] });
    const ctx: SafetyContext = {
      direction: 'outbound',
      recipients: [{ address: 'user@company.com' }],
    };
    const risks = policy.check('', ctx);
    expect(risks).toHaveLength(0);
  });
});

describe('ContentPolicy', () => {
  it('detects profanity on outbound', () => {
    const risks = ContentPolicy.check('What the fuck is this', outboundCtx);
    expect(risks.some((r) => r.description.includes('Profanity'))).toBe(true);
  });

  it('skips inbound emails', () => {
    const risks = ContentPolicy.check('What the fuck is this', inboundCtx);
    expect(risks).toHaveLength(0);
  });
});

describe('createRateLimitPolicy', () => {
  it('allows within limit', () => {
    const policy = createRateLimitPolicy(5, 60_000);
    const risks = policy.check('', outboundCtx);
    expect(risks).toHaveLength(0);
  });

  it('blocks when limit exceeded', () => {
    const policy = createRateLimitPolicy(2, 60_000);
    policy.check('', outboundCtx); // 1
    policy.check('', outboundCtx); // 2
    const risks = policy.check('', outboundCtx); // 3 - exceeds
    expect(risks.some((r) => r.description.includes('Rate limit'))).toBe(true);
  });

  it('only applies to outbound', () => {
    const policy = createRateLimitPolicy(1, 60_000);
    policy.check('', outboundCtx); // 1 - fills quota
    const risks = policy.check('', inboundCtx); // inbound - should skip
    expect(risks).toHaveLength(0);
  });
});

describe('getDefaultPolicies', () => {
  it('includes PII policy by default', () => {
    const policies = getDefaultPolicies({});
    expect(policies.some((p) => p.name === 'pii')).toBe(true);
  });

  it('excludes PII policy when disabled', () => {
    const policies = getDefaultPolicies({ piiScanning: false });
    expect(policies.some((p) => p.name === 'pii')).toBe(false);
  });

  it('includes credential policy by default', () => {
    const policies = getDefaultPolicies({});
    expect(policies.some((p) => p.name === 'credential')).toBe(true);
  });

  it('always includes phishing and content policies', () => {
    const policies = getDefaultPolicies({});
    expect(policies.some((p) => p.name === 'phishing')).toBe(true);
    expect(policies.some((p) => p.name === 'content')).toBe(true);
  });

  it('includes domain policy when domains configured', () => {
    const policies = getDefaultPolicies({ blockedDomains: ['evil.com'] });
    expect(policies.some((p) => p.name === 'domain')).toBe(true);
  });

  it('includes custom policies', () => {
    const policies = getDefaultPolicies({
      customPolicies: [
        { name: 'custom', description: 'test', check: () => [] },
      ],
    });
    expect(policies.some((p) => p.name === 'custom')).toBe(true);
  });
});
