import { describe, it, expect } from 'vitest';
import {
  EmaiError,
  ProviderError,
  AuthenticationError,
  ConnectionError,
  NotFoundError,
  AiError,
  AdapterNotConfiguredError,
  SearchError,
  SafetyError,
  DependencyError,
  ValidationError,
} from '../../../src/core/errors.js';

describe('EmaiError', () => {
  it('has correct name and code', () => {
    const err = new EmaiError('test', 'TEST_CODE');
    expect(err.name).toBe('EmaiError');
    expect(err.code).toBe('TEST_CODE');
    expect(err.message).toBe('test');
  });

  it('preserves cause', () => {
    const cause = new Error('root');
    const err = new EmaiError('test', 'TEST', cause);
    expect(err.cause).toBe(cause);
  });

  it('is instanceof Error', () => {
    expect(new EmaiError('x', 'X')).toBeInstanceOf(Error);
  });
});

describe('ProviderError', () => {
  it('has correct name and code', () => {
    const err = new ProviderError('provider failed');
    expect(err.name).toBe('ProviderError');
    expect(err.code).toBe('PROVIDER_ERROR');
  });

  it('is instanceof EmaiError', () => {
    expect(new ProviderError('x')).toBeInstanceOf(EmaiError);
  });
});

describe('AuthenticationError', () => {
  it('has correct name and code', () => {
    const err = new AuthenticationError('auth failed');
    expect(err.name).toBe('AuthenticationError');
    expect(err.code).toBe('AUTH_ERROR');
  });
});

describe('ConnectionError', () => {
  it('has correct name and code', () => {
    const err = new ConnectionError('disconnected');
    expect(err.name).toBe('ConnectionError');
    expect(err.code).toBe('CONNECTION_ERROR');
  });
});

describe('NotFoundError', () => {
  it('has correct name, code, and message', () => {
    const err = new NotFoundError('Email', 'abc-123');
    expect(err.name).toBe('NotFoundError');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Email not found: abc-123');
  });
});

describe('AiError', () => {
  it('has correct name and code', () => {
    const err = new AiError('ai failed');
    expect(err.name).toBe('AiError');
    expect(err.code).toBe('AI_ERROR');
  });
});

describe('AdapterNotConfiguredError', () => {
  it('has correct name, code, and message', () => {
    const err = new AdapterNotConfiguredError('classification');
    expect(err.name).toBe('AdapterNotConfiguredError');
    expect(err.code).toBe('ADAPTER_NOT_CONFIGURED');
    expect(err.message).toContain('classification');
  });
});

describe('SearchError', () => {
  it('has correct name and code', () => {
    const err = new SearchError('search failed');
    expect(err.name).toBe('SearchError');
    expect(err.code).toBe('SEARCH_ERROR');
  });
});

describe('SafetyError', () => {
  it('has correct name, code, and risks', () => {
    const risks = [{ type: 'pii', description: 'SSN found' }];
    const err = new SafetyError('blocked', risks);
    expect(err.name).toBe('SafetyError');
    expect(err.code).toBe('SAFETY_ERROR');
    expect(err.risks).toEqual(risks);
  });
});

describe('DependencyError', () => {
  it('has correct name, code, and message', () => {
    const err = new DependencyError('sharp', 'image processing');
    expect(err.name).toBe('DependencyError');
    expect(err.code).toBe('MISSING_DEPENDENCY');
    expect(err.message).toContain('sharp');
    expect(err.message).toContain('image processing');
  });
});

describe('ValidationError', () => {
  it('has correct name and code', () => {
    const err = new ValidationError('invalid input');
    expect(err.name).toBe('ValidationError');
    expect(err.code).toBe('VALIDATION_ERROR');
  });
});
