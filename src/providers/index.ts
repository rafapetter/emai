import type { ProviderConfig, EmailProvider } from '../core/types.js';
import { ValidationError } from '../core/errors.js';
import { GmailProvider } from './gmail.js';
import { OutlookProvider } from './outlook.js';
import { ImapSmtpProvider } from './imap-smtp.js';

export function createProvider(config: ProviderConfig): EmailProvider {
  switch (config.type) {
    case 'gmail':
      return new GmailProvider(config);
    case 'outlook':
      return new OutlookProvider(config);
    case 'imap':
      return new ImapSmtpProvider(config);
    default: {
      const exhaustive: never = config;
      throw new ValidationError(
        `Unknown provider type: ${(exhaustive as ProviderConfig).type}`,
      );
    }
  }
}

export { BaseProvider } from './base.js';
export { GmailProvider } from './gmail.js';
export { OutlookProvider } from './outlook.js';
export { ImapSmtpProvider } from './imap-smtp.js';
