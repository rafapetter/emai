import type { EmaiConfig, AiConfig, SearchConfig, StorageConfig, SafetyConfig } from './types.js';

const DEFAULT_AI: Partial<AiConfig> = {
  temperature: 0.3,
  maxTokens: 4096,
};

const DEFAULT_SEARCH: SearchConfig = {
  store: 'memory',
  dimensions: 1536,
};

const DEFAULT_STORAGE: StorageConfig = {
  type: 'memory',
};

const DEFAULT_SAFETY: SafetyConfig = {
  piiScanning: true,
  credentialScanning: true,
  humanApproval: 'high-risk',
  maxRecipientsPerEmail: 50,
};

export function resolveConfig(config: EmaiConfig): Required<EmaiConfig> {
  return {
    provider: config.provider,
    ai: config.ai ? { ...DEFAULT_AI, ...config.ai } : (undefined as unknown as AiConfig),
    search: { ...DEFAULT_SEARCH, ...config.search },
    storage: { ...DEFAULT_STORAGE, ...config.storage },
    safety: { ...DEFAULT_SAFETY, ...config.safety },
  };
}
