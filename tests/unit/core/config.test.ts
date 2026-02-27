import { describe, it, expect } from 'vitest';
import { resolveConfig } from '../../../src/core/config.js';
import type { EmaiConfig } from '../../../src/core/types.js';

const BASE_CONFIG: EmaiConfig = {
  provider: {
    type: 'gmail',
    credentials: { clientId: 'id', clientSecret: 'secret', refreshToken: 'token' },
  },
};

describe('resolveConfig', () => {
  it('applies default storage', () => {
    const resolved = resolveConfig(BASE_CONFIG);
    expect(resolved.storage).toEqual({ type: 'memory' });
  });

  it('applies default search', () => {
    const resolved = resolveConfig(BASE_CONFIG);
    expect(resolved.search).toEqual({ store: 'memory', dimensions: 1536 });
  });

  it('applies default safety', () => {
    const resolved = resolveConfig(BASE_CONFIG);
    expect(resolved.safety.piiScanning).toBe(true);
    expect(resolved.safety.credentialScanning).toBe(true);
    expect(resolved.safety.humanApproval).toBe('high-risk');
    expect(resolved.safety.maxRecipientsPerEmail).toBe(50);
  });

  it('returns undefined for ai when not provided', () => {
    const resolved = resolveConfig(BASE_CONFIG);
    expect(resolved.ai).toBeUndefined();
  });

  it('merges ai config with defaults', () => {
    const config: EmaiConfig = {
      ...BASE_CONFIG,
      ai: { adapter: 'openai', apiKey: 'sk-test' },
    };
    const resolved = resolveConfig(config);
    expect(resolved.ai.adapter).toBe('openai');
    expect(resolved.ai.apiKey).toBe('sk-test');
    expect(resolved.ai.temperature).toBe(0.3);
    expect(resolved.ai.maxTokens).toBe(4096);
  });

  it('preserves user overrides for safety', () => {
    const config: EmaiConfig = {
      ...BASE_CONFIG,
      safety: { piiScanning: false, maxRecipientsPerEmail: 10 },
    };
    const resolved = resolveConfig(config);
    expect(resolved.safety.piiScanning).toBe(false);
    expect(resolved.safety.maxRecipientsPerEmail).toBe(10);
    // Defaults still applied for non-overridden
    expect(resolved.safety.credentialScanning).toBe(true);
  });

  it('preserves provider config unchanged', () => {
    const resolved = resolveConfig(BASE_CONFIG);
    expect(resolved.provider).toBe(BASE_CONFIG.provider);
  });

  it('merges storage config with defaults', () => {
    const config: EmaiConfig = {
      ...BASE_CONFIG,
      storage: { type: 'sqlite', path: '/tmp/test.db' },
    };
    const resolved = resolveConfig(config);
    expect(resolved.storage.type).toBe('sqlite');
    expect(resolved.storage.path).toBe('/tmp/test.db');
  });
});
