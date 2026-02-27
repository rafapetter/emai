import { describe, it, expect, vi } from 'vitest';
import { SafetyEngine } from '../../../src/safety/index.js';
import { makeEmail } from '../../helpers/fixtures.js';

describe('SafetyEngine', () => {
  describe('scanInbound', () => {
    it('scans inbound email', () => {
      const engine = new SafetyEngine({});
      const result = engine.scanInbound(
        makeEmail({ body: { text: 'Act now! Urgent!' } }),
      );
      expect(result.risks.length).toBeGreaterThan(0);
    });

    it('clean inbound returns safe', () => {
      const engine = new SafetyEngine({});
      const result = engine.scanInbound(
        makeEmail({ body: { text: 'Hello, how are you?' } }),
      );
      expect(result.safe).toBe(true);
    });
  });

  describe('scanOutbound', () => {
    it('allows clean email', async () => {
      const engine = new SafetyEngine({ humanApproval: 'none' });
      const result = await engine.scanOutbound({
        to: 'bob@example.com',
        subject: 'Hello',
        text: 'Clean email',
      });
      expect(result.safe).toBe(true);
      expect(result.blocked).toBe(false);
    });

    it('blocks when approval denied', async () => {
      const engine = new SafetyEngine({
        humanApproval: 'all',
        onApprovalRequired: vi.fn().mockResolvedValue(false),
      });
      const result = await engine.scanOutbound({
        to: 'bob@example.com',
        subject: 'Hello',
        text: 'Any email',
      });
      expect(result.blocked).toBe(true);
    });

    it('allows when approval granted', async () => {
      const engine = new SafetyEngine({
        humanApproval: 'all',
        onApprovalRequired: vi.fn().mockResolvedValue(true),
      });
      const result = await engine.scanOutbound({
        to: 'bob@example.com',
        subject: 'Hello',
        text: 'Any email',
      });
      expect(result.blocked).toBe(false);
    });
  });

  describe('checkBeforeSend', () => {
    it('allows clean email', async () => {
      const engine = new SafetyEngine({ humanApproval: 'none' });
      const { allowed, result } = await engine.checkBeforeSend({
        to: 'bob@example.com',
        subject: 'Hello',
        text: 'Clean email',
      });
      expect(allowed).toBe(true);
      expect(result.safe).toBe(true);
    });

    it('blocks email with critical risks', async () => {
      const engine = new SafetyEngine({ humanApproval: 'none' });
      const { allowed } = await engine.checkBeforeSend({
        to: 'bob@example.com',
        subject: 'Hello',
        text: 'SSN: 123-45-6789',
      });
      expect(allowed).toBe(false);
    });

    it('asks for approval when needed and approved', async () => {
      const engine = new SafetyEngine({
        humanApproval: 'high-risk',
        piiScanning: false,
        credentialScanning: false,
        blockedDomains: ['evil.com'],
        onApprovalRequired: vi.fn().mockResolvedValue(true),
      });
      const { allowed } = await engine.checkBeforeSend({
        to: 'user@evil.com',
        subject: 'Hello',
        text: 'Clean content',
      });
      expect(allowed).toBe(true);
    });

    it('blocks when approval denied', async () => {
      const engine = new SafetyEngine({
        humanApproval: 'high-risk',
        piiScanning: false,
        credentialScanning: false,
        blockedDomains: ['evil.com'],
        onApprovalRequired: vi.fn().mockResolvedValue(false),
      });
      const { allowed, result } = await engine.checkBeforeSend({
        to: 'user@evil.com',
        subject: 'Hello',
        text: 'Clean content',
      });
      expect(allowed).toBe(false);
      expect(result.blocked).toBe(true);
    });
  });
});
