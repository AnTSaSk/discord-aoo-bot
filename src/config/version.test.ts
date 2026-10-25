import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const loadRunningVersion = async (): Promise<string | undefined> => {
  vi.resetModules();

  const module = await import('@/config/version.js');

  return module.runningVersion;
};

describe('runningVersion', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('AC-ANN-3 exports the injected APP_VERSION verbatim', async () => {
    vi.stubEnv('APP_VERSION', '7.8.9');

    expect(await loadRunningVersion()).toBe('7.8.9');
  });

  it('AC-ANN-3 is undefined when APP_VERSION is absent, with no fallback value', async () => {
    vi.stubEnv('APP_VERSION', undefined);

    expect(await loadRunningVersion()).toBeUndefined();
  });

  it('AC-ANN-3 is undefined when APP_VERSION is an empty string', async () => {
    vi.stubEnv('APP_VERSION', '');

    expect(await loadRunningVersion()).toBeUndefined();
  });

  it('AC-ANN-3 reads APP_VERSION once at module load, not on each access', async () => {
    vi.stubEnv('APP_VERSION', '1.0.0');
    vi.resetModules();

    const module = await import('@/config/version.js');

    vi.stubEnv('APP_VERSION', '2.0.0');

    expect(module.runningVersion).toBe('1.0.0');
  });
});
