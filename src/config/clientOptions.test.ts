import { describe, it, expect, vi } from 'vitest';
import { GatewayIntentBits, type LimitedCollection } from 'discord.js';

import { getClientOptions } from '@/config/clientOptions.js';
import { SWEEP_INTERVAL_SECONDS } from '@/constants/config.js';

const { botLoggerStub } = vi.hoisted(() => ({
  botLoggerStub: {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    isLevelEnabled: vi.fn(),
  },
}));

vi.mock('@/config/logger.js', () => ({
  getLogger: () => botLoggerStub,
}));

describe('getClientOptions framework logger (logging AC-LOG-11)', () => {
  it('logging AC-LOG-11 passes the framework a FrameworkLogger that writes through the bot logger', async () => {
    const { FrameworkLogger } = await import('@/config/frameworkLogger.js');
    const instance = getClientOptions().logger?.instance;

    expect(instance).toBeInstanceOf(FrameworkLogger);

    instance?.info('framework line');

    expect(botLoggerStub.info).toHaveBeenCalledWith('framework line');
  });
});

// client-runtime.md § Options client
describe('getClientOptions', () => {
  // AC-1
  it('declares exactly one gateway intent: Guilds', () => {
    const options = getClientOptions();

    expect(options.intents).toEqual([GatewayIntentBits.Guilds]);
  });

  // AC-2
  it('declares no partials', () => {
    const options = getClientOptions();

    expect(options.partials).toBeUndefined();
  });

  // AC-2
  it('does not enable loadMessageCommandListeners', () => {
    const options = getClientOptions();

    // Sapphire-specific client option, off by default for a slash-command-only bot.
    expect((options as unknown as Record<string, unknown>).loadMessageCommandListeners).toBeFalsy();
  });

  // AC-3: makeCache is a CacheFactory(managerType, holds, manager) -> Collection (index.d.ts:6017-6021).
  it('caps the message cache at zero entries', () => {
    const options = getClientOptions();
    const cache = options.makeCache!({ name: 'MessageManager' } as never, [] as never, {} as never);

    expect((cache as LimitedCollection<unknown, unknown>).maxSize).toBe(0);
  });

  it('does not cap a manager other than MessageManager', () => {
    const options = getClientOptions();
    const cache = options.makeCache!({ name: 'GuildManager' } as never, [] as never, {} as never);

    // Options.cacheWithLimits returns a plain Collection (no maxSize) for a manager absent from settings.
    expect((cache as LimitedCollection<unknown, unknown>).maxSize).toBeUndefined();
  });

  // AC-4: sweeper filter is a factory GlobalSweepFilter = () => (value, key) => boolean (index.d.ts:6688, 7898).
  it('configures the users sweeper with a 3600 s interval', () => {
    const options = getClientOptions();

    expect(options.sweepers!.users!.interval).toBe(SWEEP_INTERVAL_SECONDS);
  });

  it('spares the client own user from the users sweeper filter', () => {
    const options = getClientOptions();
    const predicate = options.sweepers!.users!.filter();
    const clientUser = { id: 'bot-id' };
    const ownUser = { id: 'bot-id', client: { user: clientUser } };

    expect(predicate!(ownUser as never, ownUser.id as never, undefined as never)).toBe(false);
  });

  it('evicts any other user from the users sweeper filter', () => {
    const options = getClientOptions();
    const predicate = options.sweepers!.users!.filter();
    const clientUser = { id: 'bot-id' };
    const otherUser = { id: 'other-id', client: { user: clientUser } };

    expect(predicate!(otherUser as never, otherUser.id as never, undefined as never)).toBe(true);
  });

  // AC-5
  it('configures the guildMembers sweeper with a 3600 s interval', () => {
    const options = getClientOptions();

    expect(options.sweepers!.guildMembers!.interval).toBe(SWEEP_INTERVAL_SECONDS);
  });

  it('spares the client own member from the guildMembers sweeper filter', () => {
    const options = getClientOptions();
    const predicate = options.sweepers!.guildMembers!.filter();
    const clientUser = { id: 'bot-id' };
    const ownMember = { user: { id: 'bot-id' }, client: { user: clientUser } };

    expect(predicate!(ownMember as never, 'bot-id', undefined as unknown as never)).toBe(false);
  });

  it('evicts any other member from the guildMembers sweeper filter', () => {
    const options = getClientOptions();
    const predicate = options.sweepers!.guildMembers!.filter();
    const clientUser = { id: 'bot-id' };
    const otherMember = { user: { id: 'other-id' }, client: { user: clientUser } };

    expect(predicate!(otherMember as never, 'other-id', undefined as unknown as never)).toBe(true);
  });
});
