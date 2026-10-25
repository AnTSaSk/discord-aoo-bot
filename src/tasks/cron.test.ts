import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ScheduledTask } from 'node-cron';
import type { Client } from 'discord.js';
import type { Logger } from 'pino';

import { GUILD_PURGE_GRACE_PERIOD_DAYS } from '@/constants/config.js';
import {
  cronTask,
  purgeRemovedGuilds,
  registerScheduledTask,
  stopScheduledTask,
} from '@/tasks/cron.js';
import type { Objective } from '@/models/objective.model.js';

const {
  getActiveObjectivesMock,
  getMessageMock,
  findAllMock,
  destroyMock,
  deleteObjectivesByGuildIdMock,
  findGuildsRemovedBeforeMock,
  deleteGuildSettingsMock,
  clearGuildRemovalMock,
  loggerMock,
} = vi.hoisted(() => ({
  getActiveObjectivesMock: vi.fn(),
  getMessageMock: vi.fn().mockResolvedValue([]),
  findAllMock: vi.fn(),
  destroyMock: vi.fn(),
  deleteObjectivesByGuildIdMock: vi.fn().mockResolvedValue(0),
  findGuildsRemovedBeforeMock: vi.fn().mockResolvedValue([]),
  deleteGuildSettingsMock: vi.fn().mockResolvedValue(undefined),
  clearGuildRemovalMock: vi.fn().mockResolvedValue(undefined),
  loggerMock: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/config/logger.js', () => ({
  getLogger: () => loggerMock,
}));

vi.mock('@/services/guildSettings.service.js', () => ({
  findGuildsRemovedBefore: findGuildsRemovedBeforeMock,
  deleteGuildSettings: deleteGuildSettingsMock,
  clearGuildRemoval: clearGuildRemovalMock,
}));

vi.mock('@/config/db.js', () => ({
  getDatabase: () => ({
    transaction: (run: (transaction: unknown) => Promise<unknown>) => run('transaction-1'),
  }),
}));

vi.mock('@/models/objective.model.js', () => ({
  getObjectiveModel: () => ({ findAll: findAllMock, destroy: destroyMock }),
}));

vi.mock('@/services/objective.service.js', () => ({
  getActiveObjectives: getActiveObjectivesMock,
  deleteObjectivesByGuildId: deleteObjectivesByGuildIdMock,
}));

vi.mock('@/tasks/message.js', () => ({
  deletePreviousMessage: vi.fn().mockResolvedValue(undefined),
  getMessage: getMessageMock,
  sendMessageBatches: vi.fn().mockResolvedValue(undefined),
}));

const buildTask = (): { task: ScheduledTask; stop: ReturnType<typeof vi.fn> } => {
  const stop = vi.fn().mockResolvedValue(undefined);

  return { task: { stop } as unknown as ScheduledTask, stop };
};

describe('cron scheduled task holder', () => {
  beforeEach(async () => {
    // Drain any handle left over from a previous test (idempotent by AC-9b).
    await stopScheduledTask();
  });

  // AC-9 / AC-9b: stopping the registered task calls stop() exactly once.
  it('stops the registered task exactly once', async () => {
    const { task, stop } = buildTask();

    registerScheduledTask(task);
    await stopScheduledTask();

    expect(stop).toHaveBeenCalledTimes(1);
  });

  // AC-9b: stopping with nothing registered is a no-op, no throw.
  it('is a no-op when nothing is registered', async () => {
    await expect(stopScheduledTask()).resolves.toBeUndefined();
  });

  // AC-9b: stopping twice does not call stop() a second time on the same handle.
  it('does not call stop() again on a second stop with no new registration', async () => {
    const { task, stop } = buildTask();

    registerScheduledTask(task);
    await stopScheduledTask();
    await stopScheduledTask();

    expect(stop).toHaveBeenCalledTimes(1);
  });
});

describe('cronTask board refresh (objective-selection AC-1, AC-3)', () => {
  const logger = { debug: vi.fn(), info: vi.fn(), error: vi.fn() } as unknown as Logger;
  const client = {
    channels: { cache: { get: () => ({ id: 'channel-1' }) } },
    guilds: { cache: { has: () => false } },
  } as unknown as Client<true>;

  beforeEach(() => {
    vi.clearAllMocks();
    findAllMock.mockResolvedValue([{ guildId: 'guild-1', channelId: 'channel-1' }]);
    destroyMock.mockResolvedValue(1);
  });

  it('objective-selection AC-1 / AC-3: renders the refreshed board of an affected guild from getActiveObjectives(guildId)', async () => {
    const activeObjectives = [
      { id: 7, guildId: 'guild-1', type: 'Core' },
      { id: 8, guildId: 'guild-1', type: 'Dragon' },
    ] as unknown as Objective[];

    getActiveObjectivesMock.mockResolvedValue(activeObjectives);

    await cronTask(logger, client);

    expect(getActiveObjectivesMock).toHaveBeenCalledWith('guild-1');
    expect(getMessageMock).toHaveBeenCalledWith(client, 'objective', activeObjectives);
  });
});

const NOW = new Date('2026-07-15T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

const daysBefore = (reference: Date, days: number): Date =>
  new Date(reference.getTime() - days * DAY_MS);

// In-memory stand-in honouring the findGuildsRemovedBefore contract (strict Op.lt, non-null only)
const seedRemovedGuilds = (guilds: { guildId: string; removedAt: Date | null }[]): void => {
  findGuildsRemovedBeforeMock.mockImplementation((threshold: Date) =>
    Promise.resolve(
      guilds
        .filter(({ removedAt }) => removedAt !== null && removedAt.getTime() < threshold.getTime())
        .map(({ guildId }) => guildId),
    ),
  );
};

const infoLogsFor = (guildId: string, deletedCount: number): unknown[][] =>
  loggerMock.info.mock.calls.filter((call: unknown[]) => {
    const context = call[0];

    if (typeof context !== 'object' || context === null) {
      return false;
    }

    const values = Object.values(context);

    return values.includes(guildId) && values.includes(deletedCount);
  });

const botAbsent = (): boolean => false;

const callsMentioning = (calls: unknown[][], guildId: string): unknown[][] =>
  calls.filter((call) =>
    call.some((argument) => {
      if (typeof argument === 'string') {
        return argument.includes(guildId);
      }

      return (
        typeof argument === 'object' && argument !== null && Object.values(argument).includes(guildId)
      );
    }),
  );

describe('guild purge grace period (AC-PURGE-5, AC-PURGE-6)', () => {
  it('AC-PURGE-5 / AC-PURGE-6: the grace period lasts seven days', () => {
    expect(GUILD_PURGE_GRACE_PERIOD_DAYS).toBe(7);
  });
});

describe('purgeRemovedGuilds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteObjectivesByGuildIdMock.mockResolvedValue(0);
    deleteGuildSettingsMock.mockResolvedValue(undefined);
    clearGuildRemovalMock.mockResolvedValue(undefined);
  });

  it('AC-PURGE-5 / AC-PURGE-6: selects guilds removed before now minus the grace period', async () => {
    seedRemovedGuilds([]);

    await purgeRemovedGuilds(NOW, botAbsent);

    expect(findGuildsRemovedBeforeMock).toHaveBeenCalledTimes(1);
    expect(findGuildsRemovedBeforeMock).toHaveBeenCalledWith(
      daysBefore(NOW, GUILD_PURGE_GRACE_PERIOD_DAYS),
    );
  });

  it('AC-PURGE-5: deletes the objectives then the settings of a guild removed 8 days ago', async () => {
    seedRemovedGuilds([{ guildId: 'guild-old', removedAt: daysBefore(NOW, 8) }]);

    await purgeRemovedGuilds(NOW, botAbsent);

    expect(deleteObjectivesByGuildIdMock).toHaveBeenCalledWith('guild-old');
    expect(deleteGuildSettingsMock).toHaveBeenCalledWith('guild-old');

    const objectivesOrder = deleteObjectivesByGuildIdMock.mock.invocationCallOrder[0];
    const settingsOrder = deleteGuildSettingsMock.mock.invocationCallOrder[0];

    expect(objectivesOrder).toBeLessThan(settingsOrder);
  });

  it('AC-PURGE-6: deletes nothing for a guild removed 1 day ago', async () => {
    seedRemovedGuilds([{ guildId: 'guild-recent', removedAt: daysBefore(NOW, 1) }]);

    await purgeRemovedGuilds(NOW, botAbsent);

    expect(deleteObjectivesByGuildIdMock).toHaveBeenCalledTimes(0);
    expect(deleteGuildSettingsMock).toHaveBeenCalledTimes(0);
  });

  it('AC-PURGE-6: does not purge a guild removed exactly 7 days ago (strict boundary)', async () => {
    const removedAt = daysBefore(NOW, GUILD_PURGE_GRACE_PERIOD_DAYS);

    seedRemovedGuilds([{ guildId: 'guild-boundary', removedAt }]);

    await purgeRemovedGuilds(NOW, botAbsent);

    expect(deleteObjectivesByGuildIdMock).toHaveBeenCalledTimes(0);
    expect(deleteGuildSettingsMock).toHaveBeenCalledTimes(0);
  });

  it('AC-PURGE-7: every delete call carries only the id of the guild due for purge', async () => {
    seedRemovedGuilds([
      { guildId: 'guild-due', removedAt: daysBefore(NOW, 8) },
      { guildId: 'guild-kept', removedAt: daysBefore(NOW, 1) },
    ]);

    await purgeRemovedGuilds(NOW, botAbsent);

    expect(deleteObjectivesByGuildIdMock.mock.calls).toEqual([['guild-due']]);
    expect(deleteGuildSettingsMock.mock.calls).toEqual([['guild-due']]);
  });

  it('AC-PURGE-5: keeps the settings of a guild whose objectives deletion failed', async () => {
    seedRemovedGuilds([{ guildId: 'guild-failing', removedAt: daysBefore(NOW, 8) }]);
    deleteObjectivesByGuildIdMock.mockRejectedValueOnce(new Error('db down'));

    await expect(purgeRemovedGuilds(NOW, botAbsent)).resolves.toBeUndefined();

    expect(deleteObjectivesByGuildIdMock).toHaveBeenCalledWith('guild-failing');
    expect(deleteGuildSettingsMock).toHaveBeenCalledTimes(0);
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
  });

  it('AC-PURGE-8: logs one info line per purged guild with its id and deleted objectives count', async () => {
    seedRemovedGuilds([
      { guildId: 'guild-a', removedAt: daysBefore(NOW, 8) },
      { guildId: 'guild-b', removedAt: daysBefore(NOW, 30) },
    ]);
    deleteObjectivesByGuildIdMock.mockImplementation((guildId: string) =>
      Promise.resolve(guildId === 'guild-a' ? 37 : 52),
    );

    await purgeRemovedGuilds(NOW, botAbsent);

    expect(infoLogsFor('guild-a', 37)).toHaveLength(1);
    expect(infoLogsFor('guild-b', 52)).toHaveLength(1);
  });
});

describe('cronTask guild purge step (AC-PURGE-5)', () => {
  const logger = { debug: vi.fn(), info: vi.fn(), error: vi.fn() } as unknown as Logger;
  const client = {
    channels: { cache: { get: () => ({ id: 'channel-1' }) } },
    guilds: { cache: { has: () => false } },
  } as unknown as Client<true>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    getActiveObjectivesMock.mockResolvedValue([]);
    destroyMock.mockResolvedValue(0);
    deleteObjectivesByGuildIdMock.mockResolvedValue(0);
    deleteGuildSettingsMock.mockResolvedValue(undefined);
    seedRemovedGuilds([{ guildId: 'guild-old', removedAt: daysBefore(NOW, 8) }]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('AC-PURGE-5: runs the purge when no objective has expired', async () => {
    findAllMock.mockResolvedValue([]);

    await cronTask(logger, client);

    expect(findGuildsRemovedBeforeMock).toHaveBeenCalledWith(
      daysBefore(NOW, GUILD_PURGE_GRACE_PERIOD_DAYS),
    );
    expect(deleteObjectivesByGuildIdMock).toHaveBeenCalledWith('guild-old');
    expect(deleteGuildSettingsMock).toHaveBeenCalledWith('guild-old');
  });

  it('AC-PURGE-5: runs the purge alongside the expired objectives processing', async () => {
    findAllMock.mockResolvedValue([{ guildId: 'guild-1', channelId: 'channel-1' }]);
    destroyMock.mockResolvedValue(1);

    await cronTask(logger, client);

    expect(findGuildsRemovedBeforeMock).toHaveBeenCalledWith(
      daysBefore(NOW, GUILD_PURGE_GRACE_PERIOD_DAYS),
    );
    expect(deleteGuildSettingsMock).toHaveBeenCalledWith('guild-old');
  });
});

describe('purgeRemovedGuilds bot membership guard (AC-PURGE-15)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteObjectivesByGuildIdMock.mockResolvedValue(0);
    deleteGuildSettingsMock.mockResolvedValue(undefined);
    clearGuildRemovalMock.mockResolvedValue(undefined);
  });

  it('AC-PURGE-15: deletes no data of a due guild the bot is a member of, clears its removal date and warns', async () => {
    seedRemovedGuilds([{ guildId: 'guild-present', removedAt: daysBefore(NOW, 8) }]);

    await purgeRemovedGuilds(NOW, (guildId) => guildId === 'guild-present');

    expect(deleteObjectivesByGuildIdMock).toHaveBeenCalledTimes(0);
    expect(deleteGuildSettingsMock).toHaveBeenCalledTimes(0);
    expect(clearGuildRemovalMock.mock.calls).toEqual([['guild-present']]);
    expect(callsMentioning(loggerMock.warn.mock.calls, 'guild-present')).toHaveLength(1);
  });

  it('AC-PURGE-15: in a mixed due set, purges only the absent guild and clears only the present one', async () => {
    seedRemovedGuilds([
      { guildId: 'guild-present', removedAt: daysBefore(NOW, 8) },
      { guildId: 'guild-absent', removedAt: daysBefore(NOW, 10) },
    ]);

    await purgeRemovedGuilds(NOW, (guildId) => guildId === 'guild-present');

    expect(deleteObjectivesByGuildIdMock.mock.calls).toEqual([['guild-absent']]);
    expect(deleteGuildSettingsMock.mock.calls).toEqual([['guild-absent']]);
    expect(clearGuildRemovalMock.mock.calls).toEqual([['guild-present']]);
  });

  it('AC-PURGE-15: contains a clearGuildRemoval failure for a present guild without deleting anything', async () => {
    seedRemovedGuilds([{ guildId: 'guild-present', removedAt: daysBefore(NOW, 8) }]);
    clearGuildRemovalMock.mockRejectedValueOnce(new Error('db down'));

    await expect(
      purgeRemovedGuilds(NOW, (guildId) => guildId === 'guild-present'),
    ).resolves.toBeUndefined();

    expect(clearGuildRemovalMock).toHaveBeenCalledWith('guild-present');
    expect(deleteObjectivesByGuildIdMock).toHaveBeenCalledTimes(0);
    expect(deleteGuildSettingsMock).toHaveBeenCalledTimes(0);
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
  });
});

describe('cronTask bot membership guard wiring (AC-PURGE-15)', () => {
  const logger = { debug: vi.fn(), info: vi.fn(), error: vi.fn() } as unknown as Logger;
  const client = {
    channels: { cache: { get: () => ({ id: 'channel-1' }) } },
    guilds: { cache: { has: (guildId: string) => guildId === 'guild-present' } },
  } as unknown as Client<true>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    findAllMock.mockResolvedValue([]);
    deleteObjectivesByGuildIdMock.mockResolvedValue(0);
    deleteGuildSettingsMock.mockResolvedValue(undefined);
    clearGuildRemovalMock.mockResolvedValue(undefined);
    seedRemovedGuilds([
      { guildId: 'guild-present', removedAt: daysBefore(NOW, 8) },
      { guildId: 'guild-absent', removedAt: daysBefore(NOW, 8) },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('AC-PURGE-15: keeps a due guild found in the client guild cache and purges one absent from it', async () => {
    await cronTask(logger, client);

    expect(deleteObjectivesByGuildIdMock.mock.calls).toEqual([['guild-absent']]);
    expect(deleteGuildSettingsMock.mock.calls).toEqual([['guild-absent']]);
    expect(clearGuildRemovalMock.mock.calls).toEqual([['guild-present']]);
  });
});

describe('cronTask pass isolation (R1)', () => {
  const errorLog = vi.fn();
  const logger = { debug: vi.fn(), info: vi.fn(), error: errorLog } as unknown as Logger;
  const client = {
    channels: { cache: { get: () => ({ id: 'channel-1' }) } },
    guilds: { cache: { has: () => false } },
  } as unknown as Client<true>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    getActiveObjectivesMock.mockResolvedValue([]);
    destroyMock.mockResolvedValue(0);
    deleteObjectivesByGuildIdMock.mockResolvedValue(0);
    deleteGuildSettingsMock.mockResolvedValue(undefined);
    findAllMock.mockResolvedValue([]);
    seedRemovedGuilds([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('R1 a failing expired-objective processing still runs the purge and the aggregated render', async () => {
    const failure = new Error('db down');

    findAllMock.mockRejectedValue(failure);
    seedRemovedGuilds([{ guildId: 'guild-old', removedAt: daysBefore(NOW, 8) }]);

    await expect(cronTask(logger, client)).resolves.toBeUndefined();

    expect(findAllMock).toHaveBeenCalledTimes(1);
    expect(errorLog.mock.calls).toEqual([[{ error: failure }, expect.any(String)]]);

    expect(findGuildsRemovedBeforeMock).toHaveBeenCalledWith(
      daysBefore(NOW, GUILD_PURGE_GRACE_PERIOD_DAYS),
    );
    expect(deleteGuildSettingsMock.mock.calls).toEqual([['guild-old']]);
  });

  it('R1 a rejected purge selection logs one error, still runs the aggregated render and does not reject', async () => {
    findAllMock.mockResolvedValue([]);
    findGuildsRemovedBeforeMock.mockRejectedValue(new Error('db down'));

    await expect(cronTask(logger, client)).resolves.toBeUndefined();

    expect(loggerMock.error).toHaveBeenCalledTimes(1);
    expect(deleteGuildSettingsMock).not.toHaveBeenCalled();
  });
});
