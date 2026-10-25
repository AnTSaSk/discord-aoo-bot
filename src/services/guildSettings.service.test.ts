import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Op } from '@sequelize/core';

import { getGuildSettingsModel, type GuildSettings } from '@/models/guildSettings.model.js';
import {
  clearGuildRemoval,
  deleteGuildSettings,
  findGuildsAlreadyAnnounced,
  findGuildsRemovedBefore,
  getGuildSettings,
  listGuildRemovalStates,
  markGuildRemoved,
  recordLastUsedChannel,
  updateGuildSettings,
} from '@/services/guildSettings.service.js';

const guildSettingsModelStub = {
  findOne: vi.fn(),
  findAll: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
  destroy: vi.fn(),
};

vi.mock('@/models/guildSettings.model.js', () => ({
  getGuildSettingsModel: () => guildSettingsModelStub,
}));

const buildGuildSettings = (
  overrides: Partial<
    Pick<
      GuildSettings,
      'guildId' |
      'announcementChannelId' |
      'lastUsedChannelId' |
      'announcementsEnabled' |
      'mentionEveryone' |
      'lastAnnouncedVersion'
    >
  >,
): GuildSettings =>
  ({
    id: 1,
    guildId: overrides.guildId ?? 'guild-1',
    announcementChannelId: overrides.announcementChannelId ?? null,
    lastUsedChannelId: overrides.lastUsedChannelId ?? null,
    announcementsEnabled: overrides.announcementsEnabled ?? true,
    mentionEveryone: overrides.mentionEveryone ?? false,
    lastAnnouncedVersion: overrides.lastAnnouncedVersion ?? null,
  }) as GuildSettings;

describe('getGuildSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the default settings when the guild has no record (AC-8)', async () => {
    vi.mocked(getGuildSettingsModel().findOne).mockResolvedValue(null);

    const settings = await getGuildSettings('guild-1');

    expect(settings.announcementsEnabled).toBe(true);
    expect(settings.mentionEveryone).toBe(false);
    expect(settings.announcementChannelId).toBeNull();
    expect(settings.lastUsedChannelId).toBeNull();
    expect(settings.lastAnnouncedVersion).toBeNull();
  });

  it('returns the stored values when the guild has a record (AC-8)', async () => {
    vi.mocked(getGuildSettingsModel().findOne).mockResolvedValue(
      buildGuildSettings({
        announcementChannelId: 'channel-9',
        lastUsedChannelId: 'channel-3',
        announcementsEnabled: false,
        mentionEveryone: true,
        lastAnnouncedVersion: '0.2.1',
      }),
    );

    const settings = await getGuildSettings('guild-1');

    expect(settings.announcementChannelId).toBe('channel-9');
    expect(settings.lastUsedChannelId).toBe('channel-3');
    expect(settings.announcementsEnabled).toBe(false);
    expect(settings.mentionEveryone).toBe(true);
    expect(settings.lastAnnouncedVersion).toBe('0.2.1');
  });

  it('scopes the lookup to the requested guild (multi-server isolation, AC-8)', async () => {
    vi.mocked(getGuildSettingsModel().findOne).mockResolvedValue(null);

    await getGuildSettings('guild-42');

    const callArgs = vi.mocked(getGuildSettingsModel().findOne).mock.calls[0]?.[0];
    const where = callArgs?.where as { guildId?: string } | undefined;

    expect(where?.guildId).toBe('guild-42');
  });

  it('reports the guild id it was asked about, not the stored one', async () => {
    vi.mocked(getGuildSettingsModel().findOne).mockResolvedValue(null);

    const settings = await getGuildSettings('guild-7');

    expect(settings.guildId).toBe('guild-7');
  });
});

describe('updateGuildSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes the requested fields for the guild', async () => {
    vi.mocked(getGuildSettingsModel().upsert).mockResolvedValue([
      buildGuildSettings({}),
      true,
    ] as never);

    await updateGuildSettings('guild-1', { announcementChannelId: 'channel-5' });

    const callArgs = vi.mocked(getGuildSettingsModel().upsert).mock.calls[0]?.[0];

    expect(callArgs).toMatchObject({ guildId: 'guild-1', announcementChannelId: 'channel-5' });
  });

  it('never writes a field that was not provided (AC-7b)', async () => {
    vi.mocked(getGuildSettingsModel().upsert).mockResolvedValue([
      buildGuildSettings({}),
      true,
    ] as never);

    await updateGuildSettings('guild-1', { announcementsEnabled: false });

    const callArgs = vi.mocked(getGuildSettingsModel().upsert).mock.calls[0]?.[0];

    expect(callArgs).not.toHaveProperty('mentionEveryone');
    expect(callArgs).not.toHaveProperty('announcementChannelId');
  });

  it('always scopes the write to the requested guild (multi-server isolation)', async () => {
    vi.mocked(getGuildSettingsModel().upsert).mockResolvedValue([
      buildGuildSettings({}),
      true,
    ] as never);

    await updateGuildSettings('guild-42', { mentionEveryone: true });

    const callArgs = vi.mocked(getGuildSettingsModel().upsert).mock.calls[0]?.[0];

    expect(callArgs).toMatchObject({ guildId: 'guild-42' });
  });

  it('propagates a database failure instead of silently swallowing it', async () => {
    vi.mocked(getGuildSettingsModel().upsert).mockRejectedValue(new Error('db down'));

    await expect(updateGuildSettings('guild-1', { mentionEveryone: true })).rejects.toThrow(
      'db down',
    );
  });
});

describe('recordLastUsedChannel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stores the channel as the last one used by the guild (AC-9)', async () => {
    vi.mocked(getGuildSettingsModel().upsert).mockResolvedValue([
      buildGuildSettings({}),
      true,
    ] as never);

    await recordLastUsedChannel('guild-1', 'channel-8');

    const callArgs = vi.mocked(getGuildSettingsModel().upsert).mock.calls[0]?.[0];

    expect(callArgs).toMatchObject({ guildId: 'guild-1', lastUsedChannelId: 'channel-8' });
  });

  it('never writes another setting alongside the channel (AC-9)', async () => {
    vi.mocked(getGuildSettingsModel().upsert).mockResolvedValue([
      buildGuildSettings({}),
      true,
    ] as never);

    await recordLastUsedChannel('guild-1', 'channel-8');

    const callArgs = vi.mocked(getGuildSettingsModel().upsert).mock.calls[0]?.[0];

    expect(callArgs).not.toHaveProperty('announcementChannelId');
    expect(callArgs).not.toHaveProperty('announcementsEnabled');
  });

  it('resolves instead of throwing when the write fails, so the command still answers (AC-9)', async () => {
    vi.mocked(getGuildSettingsModel().upsert).mockRejectedValue(new Error('db down'));

    await expect(recordLastUsedChannel('guild-1', 'channel-8')).resolves.toBeUndefined();
  });
});

describe('findGuildsAlreadyAnnounced', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the guilds that already received the given version', async () => {
    vi.mocked(getGuildSettingsModel().findAll).mockResolvedValue([
      buildGuildSettings({ guildId: 'guild-1' }),
      buildGuildSettings({ guildId: 'guild-2' }),
    ]);

    const guildIds = await findGuildsAlreadyAnnounced('0.2.1');

    expect(guildIds).toEqual(['guild-1', 'guild-2']);
  });

  it('returns an empty list when no guild received it yet', async () => {
    vi.mocked(getGuildSettingsModel().findAll).mockResolvedValue([]);

    await expect(findGuildsAlreadyAnnounced('0.2.1')).resolves.toEqual([]);
  });

  it('asks the database only for records matching that exact version', async () => {
    vi.mocked(getGuildSettingsModel().findAll).mockResolvedValue([]);

    await findGuildsAlreadyAnnounced('0.2.1');

    const callArgs = vi.mocked(getGuildSettingsModel().findAll).mock.calls[0]?.[0];
    const where = callArgs?.where as { lastAnnouncedVersion?: string } | undefined;

    expect(where?.lastAnnouncedVersion).toBe('0.2.1');
  });
});

describe('markGuildRemoved', () => {
  const removedAt = new Date('2026-07-15T12:00:00.000Z');

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getGuildSettingsModel().upsert).mockResolvedValue([
      buildGuildSettings({}),
      true,
    ] as never);
  });

  it('AC-PURGE-1: writes the removal date on the record of the requested guild only', async () => {
    await markGuildRemoved('guild-42', removedAt);

    expect(getGuildSettingsModel().upsert).toHaveBeenCalledTimes(1);
    expect(vi.mocked(getGuildSettingsModel().upsert).mock.calls[0]?.[0]).toEqual({
      guildId: 'guild-42',
      removedAt,
    });
  });

  it('AC-PURGE-1: leaves the other settings of an existing record untouched', async () => {
    await markGuildRemoved('guild-42', removedAt);

    const callArgs = vi.mocked(getGuildSettingsModel().upsert).mock.calls[0]?.[0];

    expect(callArgs).not.toHaveProperty('announcementChannelId');
    expect(callArgs).not.toHaveProperty('announcementsEnabled');
    expect(callArgs).not.toHaveProperty('mentionEveryone');
    expect(callArgs).not.toHaveProperty('lastAnnouncedVersion');
  });

  it('AC-PURGE-3: creates the record carrying the removal date when none exists', async () => {
    vi.mocked(getGuildSettingsModel().findOne).mockResolvedValue(null);

    await markGuildRemoved('guild-new', removedAt);

    expect(getGuildSettingsModel().upsert).toHaveBeenCalledWith(
      expect.objectContaining({ guildId: 'guild-new', removedAt }),
    );
    expect(getGuildSettingsModel().update).toHaveBeenCalledTimes(0);
  });
});

describe('clearGuildRemoval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getGuildSettingsModel().update).mockResolvedValue([1] as never);
  });

  it('AC-PURGE-4: resets the removal date to null for the requested guild only', async () => {
    await clearGuildRemoval('guild-42');

    expect(getGuildSettingsModel().update).toHaveBeenCalledTimes(1);
    expect(getGuildSettingsModel().update).toHaveBeenCalledWith(
      { removedAt: null },
      expect.objectContaining({ where: { guildId: 'guild-42' } }),
    );
  });

  it('AC-PURGE-4: never creates a record for a guild that has none', async () => {
    vi.mocked(getGuildSettingsModel().update).mockResolvedValue([0] as never);

    await clearGuildRemoval('guild-unknown');

    expect(getGuildSettingsModel().create).toHaveBeenCalledTimes(0);
    expect(getGuildSettingsModel().upsert).toHaveBeenCalledTimes(0);
  });
});

describe('findGuildsRemovedBefore', () => {
  const threshold = new Date('2026-07-08T12:00:00.000Z');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('AC-PURGE-5 / AC-PURGE-6: asks the database for removal dates strictly before the threshold', async () => {
    vi.mocked(getGuildSettingsModel().findAll).mockResolvedValue([]);

    await findGuildsRemovedBefore(threshold);

    const callArgs = vi.mocked(getGuildSettingsModel().findAll).mock.calls[0]?.[0];
    const where = callArgs?.where as { removedAt?: Record<symbol, unknown> } | undefined;

    expect(where?.removedAt?.[Op.lt]).toBe(threshold);
    expect(Object.getOwnPropertySymbols(where?.removedAt ?? {})).toEqual([Op.lt]);
  });

  it('AC-PURGE-5: returns the ids of the selected guilds', async () => {
    vi.mocked(getGuildSettingsModel().findAll).mockResolvedValue([
      buildGuildSettings({ guildId: 'guild-1' }),
      buildGuildSettings({ guildId: 'guild-2' }),
    ]);

    await expect(findGuildsRemovedBefore(threshold)).resolves.toEqual(['guild-1', 'guild-2']);
  });
});

describe('listGuildRemovalStates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('AC-PURGE-11: scans every record with only guildId and removedAt, without any where clause', async () => {
    vi.mocked(getGuildSettingsModel().findAll).mockResolvedValue([]);

    await listGuildRemovalStates();

    expect(getGuildSettingsModel().findAll).toHaveBeenCalledTimes(1);

    const callArgs = vi.mocked(getGuildSettingsModel().findAll).mock.calls[0]?.[0];

    expect(callArgs?.attributes).toEqual(['guildId', 'removedAt']);
    expect(callArgs?.where).toBeUndefined();
  });

  it('AC-PURGE-12: maps the rows to guildId and removedAt, keeping a null date as null', async () => {
    const removedAt = new Date('2026-09-01T10:00:00.000Z');

    vi.mocked(getGuildSettingsModel().findAll).mockResolvedValue([
      { id: 1, guildId: 'guild-1', removedAt: null } as GuildSettings,
      { id: 2, guildId: 'guild-2', removedAt } as GuildSettings,
    ]);

    await expect(listGuildRemovalStates()).resolves.toEqual([
      { guildId: 'guild-1', removedAt: null },
      { guildId: 'guild-2', removedAt },
    ]);
  });
});

describe('deleteGuildSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getGuildSettingsModel().destroy).mockResolvedValue(1);
  });

  it('AC-PURGE-7: destroys only the record of the requested guild', async () => {
    await deleteGuildSettings('guild-42');

    expect(getGuildSettingsModel().destroy).toHaveBeenCalledTimes(1);
    expect(getGuildSettingsModel().destroy).toHaveBeenCalledWith(
      expect.objectContaining({ where: { guildId: 'guild-42' } }),
    );
  });
});
