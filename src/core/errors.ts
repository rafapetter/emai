export class EmaiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'EmaiError';
  }
}

export class ProviderError extends EmaiError {
  constructor(message: string, cause?: unknown) {
    super(message, 'PROVIDER_ERROR', cause);
    this.name = 'ProviderError';
  }
}

export class AuthenticationError extends EmaiError {
  constructor(message: string, cause?: unknown) {
    super(message, 'AUTH_ERROR', cause);
    this.name = 'AuthenticationError';
  }
}

export class ConnectionError extends EmaiError {
  constructor(message: string, cause?: unknown) {
    super(message, 'CONNECTION_ERROR', cause);
    this.name = 'ConnectionError';
  }
}

export class NotFoundError extends EmaiError {
  constructor(resource: string, id: string) {
    super(`${resource} not found: ${id}`, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class AiError extends EmaiError {
  constructor(message: string, cause?: unknown) {
    super(message, 'AI_ERROR', cause);
    this.name = 'AiError';
  }
}

export class AdapterNotConfiguredError extends EmaiError {
  constructor(feature: string) {
    super(
      `AI adapter required for ${feature}. Configure the 'ai' option when creating Emai.`,
      'ADAPTER_NOT_CONFIGURED',
    );
    this.name = 'AdapterNotConfiguredError';
  }
}

export class SearchError extends EmaiError {
  constructor(message: string, cause?: unknown) {
    super(message, 'SEARCH_ERROR', cause);
    this.name = 'SearchError';
  }
}

export class SafetyError extends EmaiError {
  constructor(
    message: string,
    public readonly risks: Array<{ type: string; description: string }>,
  ) {
    super(message, 'SAFETY_ERROR');
    this.name = 'SafetyError';
  }
}

export class DependencyError extends EmaiError {
  constructor(pkg: string, feature: string) {
    super(
      `Package '${pkg}' is required for ${feature}. Install it with: npm install ${pkg}`,
      'MISSING_DEPENDENCY',
    );
    this.name = 'DependencyError';
  }
}

export class ValidationError extends EmaiError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}
