import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';

import { getSecret, getRequiredSecret } from '@/utils/secrets.js';

vi.mock('fs', () => ({
  readFileSync: vi.fn(),
}));

describe('getSecret', () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...envSnapshot };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads from _FILE env var when available', () => {
    process.env.MY_SECRET_FILE = '/run/secrets/my_secret';
    vi.mocked(readFileSync).mockReturnValue('  file-secret-value  ');

    const result = getSecret('MY_SECRET');

    expect(readFileSync).toHaveBeenCalledWith('/run/secrets/my_secret', 'utf8');
    expect(result).toBe('file-secret-value');
  });

  it('falls back to env var when _FILE is not set', () => {
    process.env.MY_SECRET = 'env-secret-value';

    const result = getSecret('MY_SECRET');

    expect(readFileSync).not.toHaveBeenCalled();
    expect(result).toBe('env-secret-value');
  });

  it('falls back to env var when file read fails', () => {
    process.env.MY_SECRET_FILE = '/run/secrets/missing';
    process.env.MY_SECRET = 'fallback-value';
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error('ENOENT: no such file');
    });
    // eslint-disable-next-line @typescript-eslint/no-empty-function -- suppress console output in test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {
    });

    const result = getSecret('MY_SECRET');

    expect(consoleSpy).toHaveBeenCalled();
    expect(result).toBe('fallback-value');
  });

  it('returns undefined when neither _FILE nor env var is set', () => {
    const result = getSecret('NONEXISTENT');

    expect(result).toBeUndefined();
  });
});

describe('getRequiredSecret', () => {
  const envSnapshot = { ...process.env };

  beforeEach(() => {
    process.env = { ...envSnapshot };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the secret value when available', () => {
    process.env.APP_TOKEN = 'token-value';

    const result = getRequiredSecret('APP_TOKEN', 'Bot token');

    expect(result).toBe('token-value');
  });

  it('throws when secret is missing', () => {
    expect(() => getRequiredSecret('MISSING_VAR', 'Missing secret')).toThrow(
      'Missing required secret: Missing secret. Set MISSING_VAR or MISSING_VAR_FILE',
    );
  });
});
