import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Guild } from 'discord.js';

const mockLogger = {
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
};

vi.mock('@/config/logger.js', () => ({
  getLogger: (): typeof mockLogger => mockLogger,
}));

const {
  markGuildRemovedMock,
  clearGuildRemovalMock,
  deleteGuildSettingsMock,
  deleteObjectivesByGuildIdMock,
} = vi.hoisted(() => ({
  markGuildRemovedMock: vi.fn().mockResolvedValue(undefined),
  clearGuildRemovalMock: vi.fn().mockResolvedValue(undefined),
  deleteGuildSettingsMock: vi.fn().mockResolvedValue(undefined),
  deleteObjectivesByGuildIdMock: vi.fn().mockResolvedValue(0),
}));

vi.mock('@/services/guildSettings.service.js', () => ({
  markGuildRemoved: markGuildRemovedMock,
  clearGuildRemoval: clearGuildRemovalMock,
  deleteGuildSettings: deleteGuildSettingsMock,
  updateGuildSettings: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/objective.service.js', () => ({
  deleteObjectivesByGuildId: deleteObjectivesByGuildIdMock,
}));

import { GuildCreateListener } from '@/listeners/guildCreate.js';
import { GuildDeleteListener } from '@/listeners/guildDelete.js';

const REMOVAL_INSTANT = new Date('2026-07-15T12:00:00.000Z');

const removeGuild = async (guild: Guild): Promise<void> => {
  const listener = new GuildDeleteListener({} as never, { event: 'guildDelete' });
  const run: (target: Guild) => unknown = listener.run.bind(listener);

  await run(guild);
};

const buildGuild = (memberCount: number, available = true): Guild =>
  ({
    id: 'guild-123',
    name: 'Test Guild',
    memberCount,
    available,
  }) as unknown as Guild;

describe('GuildCreateListener', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs guildId, name and member count at info level (AC-2)', async () => {
    const listener = new GuildCreateListener({} as never, { event: 'guildCreate' });
    const guild = buildGuild(42);

    await listener.run(guild);

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ guildId: 'guild-123', name: 'Test Guild', memberCount: 42 }),
      expect.any(String),
    );
  });
});

describe('GuildDeleteListener', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(REMOVAL_INSTANT);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('logs guildId and name at info level (AC-3)', async () => {
    await removeGuild(buildGuild(42));

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ guildId: 'guild-123', name: 'Test Guild' }),
      expect.any(String),
    );
  });

  it('AC-PURGE-1 / AC-3: marks an available guild as removed with the removal date', async () => {
    await removeGuild(buildGuild(42, true));

    expect(markGuildRemovedMock).toHaveBeenCalledTimes(1);
    expect(markGuildRemovedMock).toHaveBeenCalledWith('guild-123', REMOVAL_INSTANT);
  });

  it('AC-3: logs the removal before marking the guild', async () => {
    await removeGuild(buildGuild(42, true));

    const logOrder = mockLogger.info.mock.invocationCallOrder[0];
    const markOrder = markGuildRemovedMock.mock.invocationCallOrder[0];

    expect(logOrder).toBeLessThan(markOrder);
  });

  it('AC-PURGE-2 / AC-3: logs an unavailable guild without marking it', async () => {
    await removeGuild(buildGuild(42, false));

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ guildId: 'guild-123', name: 'Test Guild' }),
      expect.any(String),
    );
    expect(markGuildRemovedMock).toHaveBeenCalledTimes(0);
  });

  it('AC-PURGE-2 / AC-3: deletes no data for an unavailable guild', async () => {
    await removeGuild(buildGuild(42, false));

    expect(deleteGuildSettingsMock).toHaveBeenCalledTimes(0);
    expect(deleteObjectivesByGuildIdMock).toHaveBeenCalledTimes(0);
  });

  it('AC-PURGE-1 / AC-3: deletes no data when an available guild is removed, only marks it', async () => {
    await removeGuild(buildGuild(42, true));

    expect(markGuildRemovedMock).toHaveBeenCalledTimes(1);
    expect(deleteGuildSettingsMock).toHaveBeenCalledTimes(0);
    expect(deleteObjectivesByGuildIdMock).toHaveBeenCalledTimes(0);
  });
});
