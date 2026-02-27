import type {
  SafetyConfig,
  ScanResult,
  SendEmailOptions,
  Email,
} from '../core/types.js';
import { SafetyScanner } from './scanner.js';
import { ApprovalManager } from './approval.js';

export { SafetyScanner } from './scanner.js';
export { ApprovalManager } from './approval.js';
export type { ApprovalRequest } from './approval.js';
export {
  PiiPolicy,
  CredentialPolicy,
  PhishingPolicy,
  DomainPolicy,
  RateLimitPolicy,
  ContentPolicy,
  getDefaultPolicies,
} from './policies.js';

// ---------------------------------------------------------------------------
// SafetyEngine
// ---------------------------------------------------------------------------

export class SafetyEngine {
  private readonly scanner: SafetyScanner;
  private readonly approval: ApprovalManager;
  private readonly config: SafetyConfig;

  constructor(config: SafetyConfig) {
    this.config = config;
    this.scanner = new SafetyScanner(config);
    this.approval = new ApprovalManager(config);
  }

  async scanOutbound(email: SendEmailOptions): Promise<ScanResult> {
    const result = this.scanner.scanOutbound(email);

    if (this.approval.requiresApproval(result)) {
      const approved = await this.approval.requestApproval(email, result.risks);
      if (!approved) {
        return { ...result, blocked: true };
      }
    }

    return result;
  }

  scanInbound(email: Email): ScanResult {
    return this.scanner.scanEmail(email, 'inbound');
  }

  async checkBeforeSend(
    email: SendEmailOptions,
  ): Promise<{ allowed: boolean; result: ScanResult }> {
    const result = this.scanner.scanOutbound(email);

    if (result.blocked) {
      return { allowed: false, result };
    }

    if (this.approval.requiresApproval(result)) {
      const approved = await this.approval.requestApproval(email, result.risks);
      return { allowed: approved, result: { ...result, blocked: !approved } };
    }

    return { allowed: true, result };
  }
}
