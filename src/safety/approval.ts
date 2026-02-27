import type { SafetyConfig, SendEmailOptions, Risk, ScanResult } from '../core/types.js';
import { generateId } from '../core/utils.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApprovalRequest {
  id: string;
  email: SendEmailOptions;
  risks: Risk[];
  createdAt: Date;
  status: 'pending' | 'approved' | 'rejected';
}

// ---------------------------------------------------------------------------
// ApprovalManager
// ---------------------------------------------------------------------------

export class ApprovalManager {
  private readonly config: SafetyConfig;

  constructor(config: SafetyConfig) {
    this.config = config;
  }

  requiresApproval(scanResult: ScanResult): boolean {
    const mode = this.config.humanApproval ?? 'none';

    switch (mode) {
      case 'none':
        return false;
      case 'high-risk':
        return scanResult.risks.some(
          (r) => r.severity === 'critical' || r.severity === 'high',
        );
      case 'all':
        return true;
    }
  }

  async requestApproval(email: SendEmailOptions, risks: Risk[]): Promise<boolean> {
    if (!this.config.onApprovalRequired) {
      return false;
    }

    return this.config.onApprovalRequired(email, risks);
  }

  createApprovalRequest(email: SendEmailOptions, risks: Risk[]): ApprovalRequest {
    return {
      id: generateId(),
      email,
      risks,
      createdAt: new Date(),
      status: 'pending',
    };
  }
}
