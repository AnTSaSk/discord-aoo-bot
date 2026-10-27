import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface CapturedPinoOptions {
  serializers?: Record<string, unknown>;
  transport?: { target?: string; targets?: unknown[] };
}

const { pinoMock } = vi.hoisted(() => ({
  pinoMock: vi.fn<(options: CapturedPinoOptions) => object>(() => ({})),
}));

vi.mock('pino', () => ({ pino: pinoMock }));

vi.mock('@/utils/secrets.js', () => ({
  getSecret: vi.fn(() => 'secret-value'),
}));

const reachedTransport = (options: CapturedPinoOptions): string | undefined => {
  if (options.transport === undefined) {
    return 'none';
  }

  if (options.transport.targets !== undefined) {
    return 'targets';
  }

  return options.transport.target;
};

describe('getLogger error serializers (logging AC-LOG-9)', () => {
  beforeEach(() => {
    vi.resetModules();
    pinoMock.mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    { variant: 'Logtail', nodeEnv: 'production', devMode: 'false', transport: 'targets' },
    { variant: 'production without Logtail', nodeEnv: 'production', devMode: 'true', transport: 'none' },
    { variant: 'development', nodeEnv: 'development', devMode: 'true', transport: 'pino-pretty' },
  ])(
    'logging AC-LOG-9 passes formatLoggedError as the error and err serializers in the $variant variant',
    async ({ nodeEnv, devMode, transport }) => {
      vi.stubEnv('NODE_ENV', nodeEnv);
      vi.stubEnv('APP_DEV_MODE', devMode);

      const { getLogger } = await import('@/config/logger.js');
      const { formatLoggedError } = await import('@/config/logSerializers.js');

      getLogger();

      expect(pinoMock).toHaveBeenCalledTimes(1);

      const options = pinoMock.mock.calls[0][0];

      expect(reachedTransport(options)).toBe(transport);
      expect(options.serializers?.error).toBe(formatLoggedError);
      expect(options.serializers?.err).toBe(formatLoggedError);
    },
  );
});
