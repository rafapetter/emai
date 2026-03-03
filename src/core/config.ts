import type {
  EmaiConfig,
  AiConfig,
  SearchConfig,
  StorageConfig,
  SafetyConfig,
  UndoConfig,
  TrackingConfig,
  AutoArchiveConfig,
} from './types.js';

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

const DEFAULT_UNDO: UndoConfig = {
  undoWindow: 5_000,
};

const DEFAULT_TRACKING: TrackingConfig = {};

const DEFAULT_AUTO_ARCHIVE: AutoArchiveConfig = {
  enabled: false,
  confidenceThreshold: 0.7,
};

export function resolveConfig(config: EmaiConfig): Required<EmaiConfig> {
  return {
    provider: config.provider,
    ai: config.ai ? { ...DEFAULT_AI, ...config.ai } : (undefined as unknown as AiConfig),
    search: { ...DEFAULT_SEARCH, ...config.search },
    storage: { ...DEFAULT_STORAGE, ...config.storage },
    safety: { ...DEFAULT_SAFETY, ...config.safety },
    undo: { ...DEFAULT_UNDO, ...config.undo },
    tracking: { ...DEFAULT_TRACKING, ...config.tracking },
    autoArchive: { ...DEFAULT_AUTO_ARCHIVE, ...config.autoArchive },
  };
}
