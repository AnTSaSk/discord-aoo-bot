import { describe, it, expect, vi, beforeEach } from 'vitest';

import { getGuildSettingsModel, type GuildSettings } from '@/models/guildSettings.model.js';
import {
  findGuildsAlreadyAnnounced,
  getGuildSettings,
  recordLastUsedChannel,
  updateGuildSettings,
} from '@/services/guildSettings.service.js';

const guildSettingsModelStub = {
  findOne: vi.fn(),
  findAll: vi.fn(),
  upsert: vi.fn(),
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
