import { describe, it, expect, vi } from 'vitest';
import { ApprovalManager } from '../../../src/safety/approval.js';
import type { SafetyConfig, ScanResult, Risk } from '../../../src/core/types.js';

function makeScanResult(overrides: Partial<ScanResult> = {}): ScanResult {
  return { safe: true, risks: [], blocked: false, requiresApproval: false, ...overrides };
}

const highRisk: Risk = { type: 'pii', severity: 'high', description: 'High risk' };
const criticalRisk: Risk = { type: 'credential', severity: 'critical', description: 'Critical risk' };
const mediumRisk: Risk = { type: 'phishing', severity: 'medium', description: 'Medium risk' };

describe('ApprovalManager', () => {
  describe('requiresApproval', () => {
    it('returns false in none mode', () => {
      const manager = new ApprovalManager({ humanApproval: 'none' });
      expect(manager.requiresApproval(makeScanResult({ risks: [criticalRisk] }))).toBe(false);
    });

    it('returns true in all mode', () => {
      const manager = new ApprovalManager({ humanApproval: 'all' });
      expect(manager.requiresApproval(makeScanResult({ risks: [] }))).toBe(true);
    });

    it('returns true for high severity in high-risk mode', () => {
      const manager = new ApprovalManager({ humanApproval: 'high-risk' });
      expect(manager.requiresApproval(makeScanResult({ risks: [highRisk] }))).toBe(true);
    });

    it('returns true for critical severity in high-risk mode', () => {
      const manager = new ApprovalManager({ humanApproval: 'high-risk' });
      expect(manager.requiresApproval(makeScanResult({ risks: [criticalRisk] }))).toBe(true);
    });

    it('returns false for medium severity in high-risk mode', () => {
      const manager = new ApprovalManager({ humanApproval: 'high-risk' });
      expect(manager.requiresApproval(makeScanResult({ risks: [mediumRisk] }))).toBe(false);
    });

    it('defaults to none when not specified', () => {
      const manager = new ApprovalManager({});
      expect(manager.requiresApproval(makeScanResult({ risks: [criticalRisk] }))).toBe(false);
    });
  });

  describe('requestApproval', () => {
    it('returns false when no callback', async () => {
      const manager = new ApprovalManager({});
      const result = await manager.requestApproval({ to: 'a@b.com', subject: 'test' }, [highRisk]);
      expect(result).toBe(false);
    });

    it('calls callback and returns true on approval', async () => {
      const callback = vi.fn().mockResolvedValue(true);
      const manager = new ApprovalManager({ onApprovalRequired: callback });
      const email = { to: 'a@b.com', subject: 'test' };
      const result = await manager.requestApproval(email, [highRisk]);
      expect(result).toBe(true);
      expect(callback).toHaveBeenCalledWith(email, [highRisk]);
    });

    it('calls callback and returns false on rejection', async () => {
      const callback = vi.fn().mockResolvedValue(false);
      const manager = new ApprovalManager({ onApprovalRequired: callback });
      const result = await manager.requestApproval({ to: 'a@b.com', subject: 'test' }, [highRisk]);
      expect(result).toBe(false);
    });
  });

  describe('createApprovalRequest', () => {
    it('creates request with correct structure', () => {
      const manager = new ApprovalManager({});
      const email = { to: 'a@b.com', subject: 'test' };
      const request = manager.createApprovalRequest(email, [highRisk]);
      expect(request.id).toBeTruthy();
      expect(request.email).toBe(email);
      expect(request.risks).toEqual([highRisk]);
      expect(request.status).toBe('pending');
      expect(request.createdAt).toBeInstanceOf(Date);
    });
  });
});
