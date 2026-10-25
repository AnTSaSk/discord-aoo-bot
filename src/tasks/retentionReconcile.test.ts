import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Collection, type Client } from 'discord.js';

import { reconcileGuildRemovals } from '@/tasks/retentionReconcile.js';

const { listGuildRemovalStatesMock, markGuildRemovedMock, clearGuildRemovalMock, loggerMock } = vi.hoisted(() => ({
  listGuildRemovalStatesMock: vi.fn(),
  markGuildRemovedMock: vi.fn(),
  clearGuildRemovalMock: vi.fn(),
  loggerMock: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/config/logger.js', () => ({
  getLogger: () => loggerMock,
}));

vi.mock('@/services/guildSettings.service.js', () => ({
  listGuildRemovalStates: listGuildRemovalStatesMock,
  markGuildRemoved: markGuildRemovedMock,
  clearGuildRemoval: clearGuildRemovalMock,
}));

const NOW = new Date('2026-10-17T08:00:00.000Z');
const REMOVED_AT = new Date('2026-09-01T10:00:00.000Z');

const buildClient = (guilds: { id: string; available?: boolean }[]): Client =>
  ({
    guilds: {
      cache: new Collection(
        guilds.map((guild) => [guild.id, { id: guild.id, available: guild.available ?? true }]),
      ),
    },
  }) as unknown as Client;

const callsMentioning = (mock: ReturnType<typeof vi.fn>, guildId: string): unknown[][] =>
  mock.mock.calls.filter((args: unknown[]) => JSON.stringify(args).includes(guildId));

describe('reconcileGuildRemovals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listGuildRemovalStatesMock.mockResolvedValue([]);
    markGuildRemovedMock.mockResolvedValue(undefined);
    clearGuildRemovalMock.mockResolvedValue(undefined);
  });

  it('AC-PURGE-11: marks a record without installed guild with the injected finding date', async () => {
    listGuildRemovalStatesMock.mockResolvedValue([
      { guildId: 'present-1', removedAt: null },
      { guildId: 'orphan-1', removedAt: null },
    ]);

    await reconcileGuildRemovals(buildClient([{ id: 'present-1' }]), NOW);

    expect(markGuildRemovedMock).toHaveBeenCalledTimes(1);
    expect(markGuildRemovedMock.mock.calls[0]?.[0]).toBe('orphan-1');
    expect(markGuildRemovedMock.mock.calls[0]?.[1]).toBe(NOW);
  });

  it('AC-PURGE-12: leaves a dated record without installed guild unchanged', async () => {
    listGuildRemovalStatesMock.mockResolvedValue([
      { guildId: 'present-1', removedAt: null },
      { guildId: 'orphan-dated', removedAt: REMOVED_AT },
    ]);

    await reconcileGuildRemovals(buildClient([{ id: 'present-1' }]), NOW);

    expect(markGuildRemovedMock).not.toHaveBeenCalled();
    expect(clearGuildRemovalMock).not.toHaveBeenCalled();
  });

  it('AC-PURGE-13: marks nothing and logs exactly one error when the guild cache is empty but records exist', async () => {
    listGuildRemovalStatesMock.mockResolvedValue([
      { guildId: 'orphan-1', removedAt: null },
      { guildId: 'orphan-2', removedAt: null },
    ]);

    await expect(reconcileGuildRemovals(buildClient([]), NOW)).resolves.toBeUndefined();

    expect(markGuildRemovedMock).not.toHaveBeenCalled();
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
  });

  it('AC-PURGE-13: logs no error nor warning when the cache is empty and no record exists', async () => {
    listGuildRemovalStatesMock.mockResolvedValue([]);

    await expect(reconcileGuildRemovals(buildClient([]), NOW)).resolves.toBeUndefined();

    expect(markGuildRemovedMock).not.toHaveBeenCalled();
    expect(loggerMock.error).not.toHaveBeenCalled();
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  it('AC-PURGE-14: never marks a guild that is present in the cache but unavailable', async () => {
    listGuildRemovalStatesMock.mockResolvedValue([{ guildId: 'outage-1', removedAt: null }]);

    await reconcileGuildRemovals(buildClient([{ id: 'outage-1', available: false }]), NOW);

    expect(markGuildRemovedMock).not.toHaveBeenCalled();
  });

  it('AC-PURGE-11 / AC-PURGE-12 / AC-PURGE-14: marks only the orphan of a mixed batch', async () => {
    listGuildRemovalStatesMock.mockResolvedValue([
      { guildId: 'present-1', removedAt: null },
      { guildId: 'outage-1', removedAt: null },
      { guildId: 'orphan-dated', removedAt: REMOVED_AT },
      { guildId: 'orphan-new', removedAt: null },
    ]);

    await reconcileGuildRemovals(
      buildClient([{ id: 'present-1' }, { id: 'outage-1', available: false }]),
      NOW,
    );

    expect(markGuildRemovedMock).toHaveBeenCalledTimes(1);
    expect(markGuildRemovedMock).toHaveBeenCalledWith('orphan-new', NOW);
  });

  it('AC-PURGE-11: reads the settings records exactly once', async () => {
    listGuildRemovalStatesMock.mockResolvedValue([
      { guildId: 'orphan-1', removedAt: null },
      { guildId: 'present-1', removedAt: null },
    ]);

    await reconcileGuildRemovals(buildClient([{ id: 'present-1' }]), NOW);

    expect(listGuildRemovalStatesMock).toHaveBeenCalledTimes(1);
  });

  it('P3 logs one info entry carrying the id of each marked guild', async () => {
    listGuildRemovalStatesMock.mockResolvedValue([
      { guildId: 'present-1', removedAt: null },
      { guildId: 'orphan-a', removedAt: null },
      { guildId: 'orphan-b', removedAt: null },
    ]);

    await reconcileGuildRemovals(buildClient([{ id: 'present-1' }]), NOW);

    expect(callsMentioning(loggerMock.info, 'orphan-a')).toHaveLength(1);
    expect(callsMentioning(loggerMock.info, 'orphan-b')).toHaveLength(1);
    expect(callsMentioning(loggerMock.info, 'present-1')).toHaveLength(0);
  });

  it('P3 contains a markGuildRemoved failure: one error with the id, next guilds still marked', async () => {
    listGuildRemovalStatesMock.mockResolvedValue([
      { guildId: 'present-1', removedAt: null },
      { guildId: 'orphan-a', removedAt: null },
      { guildId: 'orphan-b', removedAt: null },
    ]);
    markGuildRemovedMock.mockImplementation((guildId: string) =>
      guildId === 'orphan-a' ? Promise.reject(new Error('db down')) : Promise.resolve(undefined),
    );

    await expect(
      reconcileGuildRemovals(buildClient([{ id: 'present-1' }]), NOW),
    ).resolves.toBeUndefined();

    expect(markGuildRemovedMock).toHaveBeenCalledTimes(2);
    expect(markGuildRemovedMock).toHaveBeenCalledWith('orphan-b', NOW);
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
    expect(callsMentioning(loggerMock.error, 'orphan-a')).toHaveLength(1);
  });

  it('P3 rejects when the settings records cannot be read', async () => {
    listGuildRemovalStatesMock.mockRejectedValue(new Error('db down'));

    await expect(reconcileGuildRemovals(buildClient([{ id: 'present-1' }]), NOW)).rejects.toThrow(
      'db down',
    );

    expect(markGuildRemovedMock).not.toHaveBeenCalled();
  });
});

describe('reconcileGuildRemovals stale removal date (AC-PURGE-16)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listGuildRemovalStatesMock.mockResolvedValue([]);
    markGuildRemovedMock.mockResolvedValue(undefined);
    clearGuildRemovalMock.mockResolvedValue(undefined);
  });

  it('AC-PURGE-16: clears the removal date of a dated record whose guild is installed and available', async () => {
    listGuildRemovalStatesMock.mockResolvedValue([{ guildId: 'back-available', removedAt: REMOVED_AT }]);

    await reconcileGuildRemovals(buildClient([{ id: 'back-available' }]), NOW);

    expect(clearGuildRemovalMock.mock.calls).toEqual([['back-available']]);
    expect(markGuildRemovedMock).not.toHaveBeenCalled();
    expect(callsMentioning(loggerMock.info, 'back-available')).toHaveLength(1);
  });

  it('AC-PURGE-16: clears the removal date of a dated record whose installed guild is unavailable', async () => {
    listGuildRemovalStatesMock.mockResolvedValue([{ guildId: 'back-outage', removedAt: REMOVED_AT }]);

    await reconcileGuildRemovals(buildClient([{ id: 'back-outage', available: false }]), NOW);

    expect(clearGuildRemovalMock.mock.calls).toEqual([['back-outage']]);
    expect(markGuildRemovedMock).not.toHaveBeenCalled();
  });

  it('AC-PURGE-16: contains a clear failure: one error with the id, next records still cleared and marked', async () => {
    listGuildRemovalStatesMock.mockResolvedValue([
      { guildId: 'back-failing', removedAt: REMOVED_AT },
      { guildId: 'back-next', removedAt: REMOVED_AT },
      { guildId: 'orphan-after', removedAt: null },
    ]);
    clearGuildRemovalMock.mockImplementation((guildId: string) =>
      guildId === 'back-failing' ? Promise.reject(new Error('db down')) : Promise.resolve(undefined),
    );

    await expect(
      reconcileGuildRemovals(buildClient([{ id: 'back-failing' }, { id: 'back-next' }]), NOW),
    ).resolves.toBeUndefined();

    expect(clearGuildRemovalMock.mock.calls).toEqual([['back-failing'], ['back-next']]);
    expect(markGuildRemovedMock.mock.calls).toEqual([['orphan-after', NOW]]);
    expect(loggerMock.error).toHaveBeenCalledTimes(1);
    expect(callsMentioning(loggerMock.error, 'back-failing')).toHaveLength(1);
  });

  it('AC-PURGE-16 / AC-PURGE-11 / AC-PURGE-12: in a mixed batch clears only the installed dated record and marks only the undated orphan', async () => {
    listGuildRemovalStatesMock.mockResolvedValue([
      { guildId: 'installed-dated', removedAt: REMOVED_AT },
      { guildId: 'missing-dated', removedAt: REMOVED_AT },
      { guildId: 'missing-undated', removedAt: null },
      { guildId: 'installed-undated', removedAt: null },
    ]);

    await reconcileGuildRemovals(
      buildClient([{ id: 'installed-dated' }, { id: 'installed-undated' }]),
      NOW,
    );

    expect(clearGuildRemovalMock.mock.calls).toEqual([['installed-dated']]);
    expect(markGuildRemovedMock.mock.calls).toEqual([['missing-undated', NOW]]);
  });
});
