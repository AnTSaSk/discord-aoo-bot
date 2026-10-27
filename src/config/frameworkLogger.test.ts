import { describe, it, expect, vi, type MockInstance } from 'vitest';
import { LogLevel } from '@sapphire/framework';
import { pino, type Logger } from 'pino';

import { FrameworkLogger } from '@/config/frameworkLogger.js';

type PinoMethod = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const PINO_METHODS: PinoMethod[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

interface BotLogger {
  logger: Logger;
  calls: () => Record<PinoMethod, unknown[][]>;
  isLevelEnabled: MockInstance<Logger['isLevelEnabled']>;
}

const buildBotLogger = (): BotLogger => {
  const logger = pino({ level: 'trace' }, { write: (): void => undefined });
  const spies = {
    trace: vi.spyOn(logger, 'trace').mockImplementation(() => undefined),
    debug: vi.spyOn(logger, 'debug').mockImplementation(() => undefined),
    info: vi.spyOn(logger, 'info').mockImplementation(() => undefined),
    warn: vi.spyOn(logger, 'warn').mockImplementation(() => undefined),
    error: vi.spyOn(logger, 'error').mockImplementation(() => undefined),
    fatal: vi.spyOn(logger, 'fatal').mockImplementation(() => undefined),
  };

  return {
    logger,
    calls: () => ({
      trace: spies.trace.mock.calls,
      debug: spies.debug.mock.calls,
      info: spies.info.mock.calls,
      warn: spies.warn.mock.calls,
      error: spies.error.mock.calls,
      fatal: spies.fatal.mock.calls,
    }),
    isLevelEnabled: vi.spyOn(logger, 'isLevelEnabled'),
  };
};

const onlyCall = (method: PinoMethod, call: unknown[]): Record<PinoMethod, unknown[][]> => ({
  trace: [],
  debug: [],
  info: [],
  warn: [],
  error: [],
  fatal: [],
  [method]: [call],
});

const LEVEL_TABLE: [LogLevel, PinoMethod][] = [
  [LogLevel.Trace, 'trace'],
  [LogLevel.Debug, 'debug'],
  [LogLevel.Info, 'info'],
  [LogLevel.Warn, 'warn'],
  [LogLevel.Error, 'error'],
  [LogLevel.Fatal, 'fatal'],
  [LogLevel.None, 'info'],
];

describe('FrameworkLogger levels (logging AC-LOG-12)', () => {
  it.each(LEVEL_TABLE)('logging AC-LOG-12 writes level %s through the bot logger method %s', (level, method) => {
    const bot = buildBotLogger();

    new FrameworkLogger(bot.logger).write(level, 'framework line');

    expect(bot.calls()).toStrictEqual(onlyCall(method, ['framework line']));
  });

  it.each(PINO_METHODS)('logging AC-LOG-12 delegates the %s alias to the matching bot logger method', (method) => {
    const bot = buildBotLogger();

    new FrameworkLogger(bot.logger)[method]('framework line');

    expect(bot.calls()).toStrictEqual(onlyCall(method, ['framework line']));
  });
});

describe('FrameworkLogger values (logging AC-LOG-12)', () => {
  it('logging AC-LOG-12 joins the text values with one space', () => {
    const bot = buildBotLogger();

    new FrameworkLogger(bot.logger).info('Loaded', '12', 'commands');

    expect(bot.calls()).toStrictEqual(onlyCall('info', ['Loaded 12 commands']));
  });

  it('logging AC-LOG-12 places the first non-text value under error', () => {
    const bot = buildBotLogger();
    const failure = new Error('boom');

    new FrameworkLogger(bot.logger).error('Encountered error on chat input command "add"', failure);

    expect(bot.calls()).toStrictEqual(
      onlyCall('error', [{ error: failure }, 'Encountered error on chat input command "add"']),
    );
  });

  it('logging AC-LOG-12 leaves out the values following the first non-text value', () => {
    const bot = buildBotLogger();
    const first = new Error('first');
    const second = new Error('second');

    new FrameworkLogger(bot.logger).error('Two failures', first, second, { extra: true });

    expect(bot.calls()).toStrictEqual(onlyCall('error', [{ error: first }, 'Two failures']));
  });

  it('logging AC-LOG-12 keeps the text values that follow the first non-text value', () => {
    const bot = buildBotLogger();
    const failure = new Error('boom');

    new FrameworkLogger(bot.logger).warn('Listener', failure, 'failed');

    expect(bot.calls()).toStrictEqual(onlyCall('warn', [{ error: failure }, 'Listener failed']));
  });

  it('logging AC-LOG-12 counts an undefined value as the first non-text value', () => {
    const bot = buildBotLogger();

    new FrameworkLogger(bot.logger).error('Rejected with', undefined, new Error('later'));

    expect(bot.calls()).toStrictEqual(onlyCall('error', [{ error: undefined }, 'Rejected with']));
  });

  it('logging AC-LOG-12 interprets no %s nor %o placeholder in the text', () => {
    const bot = buildBotLogger();

    new FrameworkLogger(bot.logger).info('value %s and %o', 'kept');

    expect(bot.calls()).toStrictEqual(onlyCall('info', ['value %s and %o kept']));
  });
});

describe('FrameworkLogger has (logging AC-LOG-13)', () => {
  it.each(LEVEL_TABLE)('logging AC-LOG-13 asks the bot logger whether level %s (%s) is enabled', (level, method) => {
    const bot = buildBotLogger();

    bot.isLevelEnabled.mockImplementation((asked) => asked === method);

    expect(new FrameworkLogger(bot.logger).has(level)).toBe(true);
    expect(bot.isLevelEnabled).toHaveBeenCalledWith(method);
  });

  it('logging AC-LOG-13 answers false when the bot logger has the level disabled', () => {
    const bot = buildBotLogger();

    bot.isLevelEnabled.mockReturnValue(false);

    expect(new FrameworkLogger(bot.logger).has(LogLevel.Debug)).toBe(false);
    expect(bot.isLevelEnabled).toHaveBeenCalledWith('debug');
  });
});
