import { describe, it, expect } from 'vitest';
import { SafetyScanner } from '../../../src/safety/scanner.js';
import type { SafetyConfig, SafetyContext } from '../../../src/core/types.js';
import { makeEmail, PHISHING_EMAIL, PII_EMAIL, CREDENTIAL_EMAIL, ALICE, BOB } from '../../helpers/fixtures.js';

const defaultConfig: SafetyConfig = {
  piiScanning: true,
  credentialScanning: true,
  humanApproval: 'high-risk',
  maxRecipientsPerEmail: 50,
};

function inboundCtx(overrides: Partial<SafetyContext> = {}): SafetyContext {
  return { direction: 'inbound', sender: ALICE, recipients: [BOB], ...overrides };
}

function outboundCtx(overrides: Partial<SafetyContext> = {}): SafetyContext {
  return { direction: 'outbound', sender: ALICE, recipients: [BOB], ...overrides };
}

describe('SafetyScanner', () => {
  const scanner = new SafetyScanner(defaultConfig);

  // ---- PII scanning ----

  describe('PII scanning', () => {
    it('detects SSN', () => {
      const result = scanner.scan('My SSN is 123-45-6789.', inboundCtx());
      const ssn = result.risks.find((r) => r.description.includes('Social Security'));
      expect(ssn).toBeDefined();
      expect(ssn!.severity).toBe('critical');
    });

    it('detects phone numbers', () => {
      const result = scanner.scan('Call me at (555) 123-4567.', inboundCtx());
      const phone = result.risks.find((r) => r.description.includes('Phone number'));
      expect(phone).toBeDefined();
    });

    it('detects credit card with valid Luhn', () => {
      // 4532015112830366 is a valid Luhn number
      const result = scanner.scan('Card: 4532015112830366', inboundCtx());
      const cc = result.risks.find((r) => r.description.includes('Credit card'));
      expect(cc).toBeDefined();
      expect(cc!.severity).toBe('critical');
    });

    it('ignores credit card with invalid Luhn', () => {
      const result = scanner.scan('Number: 4532015112830367', inboundCtx());
      const cc = result.risks.find((r) => r.description.includes('Credit card'));
      expect(cc).toBeUndefined();
    });

    it('detects date of birth', () => {
      const result = scanner.scan('Date of birth: 01/15/1990', inboundCtx());
      const dob = result.risks.find((r) => r.description.includes('Date of birth'));
      expect(dob).toBeDefined();
    });

    it('detects email addresses not in known list', () => {
      const result = scanner.scan(
        'Contact unknown@example.com for details.',
        inboundCtx({ sender: ALICE, recipients: [BOB] }),
      );
      const emailRisk = result.risks.find(
        (r) => r.type === 'pii' && r.description.includes('Email address'),
      );
      expect(emailRisk).toBeDefined();
    });

    it('skips known email addresses', () => {
      const result = scanner.scan(
        'Contact alice@example.com for details.',
        inboundCtx({ sender: ALICE }),
      );
      const emailRisk = result.risks.find(
        (r) => r.type === 'pii' && r.description.includes('Email address'),
      );
      expect(emailRisk).toBeUndefined();
    });

    it('can be disabled', () => {
      const noPiiScanner = new SafetyScanner({ ...defaultConfig, piiScanning: false });
      const result = noPiiScanner.scan('SSN: 123-45-6789', inboundCtx());
      const ssn = result.risks.find((r) => r.description.includes('Social Security'));
      expect(ssn).toBeUndefined();
    });
  });

  // ---- Credential scanning ----

  describe('credential scanning', () => {
    it('detects OpenAI API key', () => {
      const result = scanner.scan(
        'Key: sk-abcdefghijklmnopqrstuvwxyz1234567890abcdef',
        outboundCtx(),
      );
      const key = result.risks.find((r) => r.type === 'credential');
      expect(key).toBeDefined();
      expect(key!.severity).toBe('critical');
    });

    it('detects AWS access key', () => {
      const result = scanner.scan('Key: AKIAIOSFODNN7EXAMPLE', outboundCtx());
      const key = result.risks.find(
        (r) => r.type === 'credential' && r.description.includes('API key'),
      );
      expect(key).toBeDefined();
    });

    it('detects GitHub personal access token', () => {
      const result = scanner.scan(
        'Token: ghp_' + 'a'.repeat(36),
        outboundCtx(),
      );
      const token = result.risks.find((r) => r.type === 'credential');
      expect(token).toBeDefined();
    });

    it('detects private keys', () => {
      const result = scanner.scan(
        '-----BEGIN RSA PRIVATE KEY-----\nMIIE...rest of key',
        outboundCtx(),
      );
      const pk = result.risks.find((r) => r.description.includes('Private key'));
      expect(pk).toBeDefined();
    });

    it('detects JWT tokens', () => {
      const header = Buffer.from('{"alg":"HS256"}').toString('base64url');
      const payload = Buffer.from('{"sub":"1234567890"}').toString('base64url');
      const sig = 'abcdefghijklmnop';
      const jwt = `eyJ${header.slice(3)}.eyJ${payload.slice(3)}.${sig}`;
      const result = scanner.scan(`Token: ${jwt}`, outboundCtx());
      const jwtRisk = result.risks.find((r) => r.description.includes('JWT'));
      expect(jwtRisk).toBeDefined();
    });

    it('detects connection strings', () => {
      const result = scanner.scan(
        'DB: postgres://user:pass@host:5432/dbname',
        outboundCtx(),
      );
      const conn = result.risks.find((r) => r.description.includes('connection string'));
      expect(conn).toBeDefined();
    });

    it('detects plaintext passwords', () => {
      const result = scanner.scan('password: mySecretP4ss!', outboundCtx());
      const pw = result.risks.find((r) => r.description.includes('password'));
      expect(pw).toBeDefined();
    });

    it('can be disabled', () => {
      const noCredScanner = new SafetyScanner({ ...defaultConfig, credentialScanning: false });
      const result = noCredScanner.scan(
        'sk-abcdefghijklmnopqrstuvwxyz1234567890abcdef',
        outboundCtx(),
      );
      const cred = result.risks.find((r) => r.type === 'credential');
      expect(cred).toBeUndefined();
    });
  });

  // ---- Phishing scanning ----

  describe('phishing scanning', () => {
    it('detects urgency phrases (inbound)', () => {
      const result = scanner.scan('Act now! Your account has been suspended.', inboundCtx());
      const phishing = result.risks.filter((r) => r.type === 'phishing');
      expect(phishing.length).toBeGreaterThan(0);
    });

    it('detects impersonation patterns (inbound)', () => {
      const result = scanner.scan('This is from PayPal Security team.', inboundCtx());
      const impersonation = result.risks.find(
        (r) => r.type === 'phishing' && r.description.includes('impersonation'),
      );
      expect(impersonation).toBeDefined();
    });

    it('skips phishing for outbound emails', () => {
      const result = scanner.scan('Act now! Your account has been suspended.', outboundCtx());
      const phishing = result.risks.filter((r) => r.type === 'phishing');
      expect(phishing).toHaveLength(0);
    });
  });

  // ---- Domain scanning ----

  describe('domain scanning', () => {
    it('detects blocked domain', () => {
      const blockedScanner = new SafetyScanner({
        ...defaultConfig,
        blockedDomains: ['evil.com'],
      });
      const result = blockedScanner.scan('', {
        direction: 'outbound',
        recipients: [{ address: 'user@evil.com' }],
      });
      const domainRisk = result.risks.find((r) => r.type === 'domain');
      expect(domainRisk).toBeDefined();
      expect(domainRisk!.severity).toBe('high');
    });

    it('detects domain not in allowed list', () => {
      const allowedScanner = new SafetyScanner({
        ...defaultConfig,
        allowedDomains: ['company.com'],
      });
      const result = allowedScanner.scan('', {
        direction: 'outbound',
        recipients: [{ address: 'user@other.com' }],
      });
      const domainRisk = result.risks.find((r) => r.type === 'domain');
      expect(domainRisk).toBeDefined();
    });

    it('allows domain in allowed list', () => {
      const allowedScanner = new SafetyScanner({
        ...defaultConfig,
        allowedDomains: ['company.com'],
      });
      const result = allowedScanner.scan('Safe content', {
        direction: 'outbound',
        recipients: [{ address: 'user@company.com' }],
      });
      const domainRisk = result.risks.find((r) => r.type === 'domain');
      expect(domainRisk).toBeUndefined();
    });

    it('matches subdomains of blocked domain', () => {
      const blockedScanner = new SafetyScanner({
        ...defaultConfig,
        blockedDomains: ['evil.com'],
      });
      const result = blockedScanner.scan('', {
        direction: 'outbound',
        recipients: [{ address: 'user@sub.evil.com' }],
      });
      const domainRisk = result.risks.find((r) => r.type === 'domain');
      expect(domainRisk).toBeDefined();
    });
  });

  // ---- Recipient count ----

  describe('recipient count', () => {
    it('flags too many recipients', () => {
      const recipients = Array.from({ length: 51 }, (_, i) => ({
        address: `user${i}@example.com`,
      }));
      const result = scanner.scan('', { direction: 'outbound', recipients });
      const policy = result.risks.find(
        (r) => r.type === 'policy' && r.description.includes('Too many recipients'),
      );
      expect(policy).toBeDefined();
    });

    it('allows within limit', () => {
      const result = scanner.scan('Clean email', outboundCtx());
      const policy = result.risks.find((r) => r.description.includes('Too many recipients'));
      expect(policy).toBeUndefined();
    });
  });

  // ---- Custom policies ----

  describe('custom policies', () => {
    it('executes custom policies', () => {
      const customScanner = new SafetyScanner({
        ...defaultConfig,
        customPolicies: [
          {
            name: 'custom-test',
            description: 'Test policy',
            check: () => [{ type: 'custom', severity: 'medium', description: 'Custom risk' }],
          },
        ],
      });
      const result = customScanner.scan('Any content', outboundCtx());
      const custom = result.risks.find((r) => r.type === 'custom');
      expect(custom).toBeDefined();
    });
  });

  // ---- Scan result flags ----

  describe('scan result flags', () => {
    it('marks safe when no risks', () => {
      const result = scanner.scan('Clean email with no issues.', outboundCtx());
      expect(result.safe).toBe(true);
      expect(result.blocked).toBe(false);
    });

    it('marks blocked when critical risk found', () => {
      const result = scanner.scan('SSN: 123-45-6789', outboundCtx());
      expect(result.blocked).toBe(true);
    });

    it('marks requiresApproval for high-risk mode', () => {
      const result = scanner.scan('SSN: 123-45-6789', outboundCtx());
      expect(result.requiresApproval).toBe(true);
    });

    it('does not require approval in none mode', () => {
      const noApprovalScanner = new SafetyScanner({ ...defaultConfig, humanApproval: 'none' });
      const result = noApprovalScanner.scan('SSN: 123-45-6789', outboundCtx());
      expect(result.requiresApproval).toBe(false);
    });
  });

  // ---- scanEmail ----

  describe('scanEmail', () => {
    it('scans inbound email with phishing link in HTML', () => {
      const result = scanner.scanEmail(PHISHING_EMAIL, 'inbound');
      expect(result.safe).toBe(false);
      const phishing = result.risks.filter((r) => r.type === 'phishing');
      expect(phishing.length).toBeGreaterThan(0);
    });

    it('scans email with PII', () => {
      const result = scanner.scanEmail(PII_EMAIL, 'inbound');
      expect(result.safe).toBe(false);
    });

    it('scans email with credentials', () => {
      const result = scanner.scanEmail(CREDENTIAL_EMAIL, 'outbound');
      const cred = result.risks.find((r) => r.type === 'credential');
      expect(cred).toBeDefined();
    });

    it('clean email passes', () => {
      const result = scanner.scanEmail(makeEmail({ body: { text: 'Hello, how are you?' } }), 'outbound');
      expect(result.safe).toBe(true);
    });
  });
});
