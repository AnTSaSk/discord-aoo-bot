import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChannelType } from 'discord.js';
import type { SapphireClient } from '@sapphire/framework';

import { broadcastAnnouncement, getAnnounceableVersion } from '@/tasks/announcement.js';
import { ANNOUNCEMENTS } from '@/constants/announcements.js';

const {
  getGuildSettingsMock,
  updateGuildSettingsMock,
  canBotWriteToChannelMock,
  findAllObjectiveMock,
  findGuildsAlreadyAnnouncedMock,
} = vi.hoisted(() => ({
  getGuildSettingsMock: vi.fn(),
  updateGuildSettingsMock: vi.fn().mockResolvedValue(undefined),
  canBotWriteToChannelMock: vi.fn(),
  findAllObjectiveMock: vi.fn().mockResolvedValue([]),
  findGuildsAlreadyAnnouncedMock: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/services/guildSettings.service.js', () => ({
  getGuildSettings: getGuildSettingsMock,
  updateGuildSettings: updateGuildSettingsMock,
  findGuildsAlreadyAnnounced: findGuildsAlreadyAnnouncedMock,
}));

vi.mock('@/services/objective.service.js', () => ({
  findAllObjective: findAllObjectiveMock,
}));

vi.mock('@/utils/permissions.js', () => ({
  canBotWriteToChannel: canBotWriteToChannelMock,
}));

const DEFAULTS = {
  guildId: 'guild-1',
  announcementChannelId: null,
  lastUsedChannelId: null,
  announcementsEnabled: true,
  mentionEveryone: false,
  lastAnnouncedVersion: null,
};

interface SentPayload {
  components: unknown[];
  flags: number;
  allowedMentions?: { parse?: string[] };
}

const buildGuild = (
  id: string,
  channels: Record<string, unknown> = { 'channel-1': {} },
): { guild: unknown; send: ReturnType<typeof vi.fn> } => {
  const send = vi.fn<(payload: SentPayload) => Promise<void>>().mockResolvedValue(undefined);
  const resolved = Object.fromEntries(
    Object.keys(channels).map((channelId) => [
      channelId,
      {
        id: channelId,
        type: ChannelType.GuildText,
        isSendable: () => true,
        send,
        permissionsFor: vi.fn(),
      },
    ]),
  );

  const guild = {
    id,
    members: { me: {} },
    channels: {
      cache: {
        get: (channelId: string) => resolved[channelId],
      },
      fetch: vi.fn((channelId: string) => Promise.resolve(resolved[channelId] ?? null)),
    },
  };

  return { guild, send };
};

const buildClient = (guilds: unknown[]): SapphireClient =>
  ({
    guilds: { cache: new Map(guilds.map((g) => [(g as { id: string }).id, g])) },
  }) as unknown as SapphireClient;

describe('getAnnounceableVersion (AC-10)', () => {
  it('returns the highest declared version, whatever the declaration order', () => {
    const declared = ANNOUNCEMENTS.map((a) => a.version);
    const highest = [...declared].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }))[declared.length - 1];

    expect(getAnnounceableVersion()?.version).toBe(highest);
  });
});

describe('broadcastAnnouncement targeting (AC-11, AC-12, AC-13, AC-14)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canBotWriteToChannelMock.mockReturnValue({ allowed: true, missing: null });
    findAllObjectiveMock.mockResolvedValue([]);
  });

  it('sends nothing to a guild that already received this version (AC-11)', async () => {
    const { guild, send } = buildGuild('guild-1');

    getGuildSettingsMock.mockResolvedValue({
      ...DEFAULTS,
      lastUsedChannelId: 'channel-1',
      lastAnnouncedVersion: getAnnounceableVersion()?.version,
    });

    await broadcastAnnouncement(buildClient([guild]));

    expect(send).not.toHaveBeenCalled();
  });

  it('sends nothing to a guild that disabled announcements (AC-12)', async () => {
    const { guild, send } = buildGuild('guild-1');

    getGuildSettingsMock.mockResolvedValue({
      ...DEFAULTS,
      lastUsedChannelId: 'channel-1',
      announcementsEnabled: false,
    });

    await broadcastAnnouncement(buildClient([guild]));

    expect(send).not.toHaveBeenCalled();
  });

  it('posts in the configured channel, not the last used one (AC-13)', async () => {
    const sends = new Map<string, ReturnType<typeof vi.fn>>();
    const channelOf = (channelId: string): unknown => {
      const send = vi.fn().mockResolvedValue(undefined);

      sends.set(channelId, send);

      return {
        id: channelId,
        type: ChannelType.GuildText,
        isSendable: () => true,
        send,
        permissionsFor: vi.fn(),
      };
    };
    const resolved = { 'channel-1': channelOf('channel-1'), 'channel-9': channelOf('channel-9') };
    const guild = {
      id: 'guild-1',
      members: { me: {} },
      channels: {
        cache: { get: (id: string) => resolved[id as keyof typeof resolved] },
        fetch: vi.fn(),
      },
    };

    getGuildSettingsMock.mockResolvedValue({
      ...DEFAULTS,
      announcementChannelId: 'channel-9',
      lastUsedChannelId: 'channel-1',
    });

    await broadcastAnnouncement(buildClient([guild]));

    expect(sends.get('channel-9')).toHaveBeenCalled();
    expect(sends.get('channel-1')).not.toHaveBeenCalled();
  });

  it('falls back to the last used channel when none is configured (AC-13)', async () => {
    const { guild, send } = buildGuild('guild-1');

    getGuildSettingsMock.mockResolvedValue({ ...DEFAULTS, lastUsedChannelId: 'channel-1' });

    await broadcastAnnouncement(buildClient([guild]));

    expect(send).toHaveBeenCalled();
  });

  it('sends nothing when the resolved channel cannot receive messages (AC-14)', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    const guild = {
      id: 'guild-1',
      members: { me: {} },
      channels: {
        cache: {
          get: () => ({
            id: 'channel-1',
            type: ChannelType.GuildCategory,
            isSendable: () => false,
            send,
            permissionsFor: vi.fn(),
          }),
        },
        fetch: vi.fn(),
      },
    };

    getGuildSettingsMock.mockResolvedValue({ ...DEFAULTS, lastUsedChannelId: 'channel-1' });

    await broadcastAnnouncement(buildClient([guild]));

    expect(send).not.toHaveBeenCalled();
    expect(updateGuildSettingsMock).not.toHaveBeenCalled();
  });

  it('sends nothing when no channel can be resolved at all (AC-14)', async () => {
    const { guild, send } = buildGuild('guild-1');

    getGuildSettingsMock.mockResolvedValue(DEFAULTS);

    await broadcastAnnouncement(buildClient([guild]));

    expect(send).not.toHaveBeenCalled();
    expect(updateGuildSettingsMock).not.toHaveBeenCalled();
  });
});

describe('broadcastAnnouncement permissions (AC-15, AC-16)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findAllObjectiveMock.mockResolvedValue([]);
    canBotWriteToChannelMock.mockReturnValue({
      allowed: true,
      missing: null,
      canMentionEveryone: false,
    });
    getGuildSettingsMock.mockResolvedValue({ ...DEFAULTS, lastUsedChannelId: 'channel-1' });
  });

  it('sends to a channel the bot is allowed to write in (AC-15)', async () => {
    const { guild, send } = buildGuild('guild-1');

    canBotWriteToChannelMock.mockReturnValue({
      allowed: true,
      missing: null,
      canMentionEveryone: false,
    });

    await broadcastAnnouncement(buildClient([guild]));

    expect(send).toHaveBeenCalled();
  });

  it('sends nothing and marks nothing when a permission is missing (AC-16, AC-21)', async () => {
    const { guild, send } = buildGuild('guild-1');

    canBotWriteToChannelMock.mockReturnValue({ allowed: false, missing: 'Send Messages' });

    await broadcastAnnouncement(buildClient([guild]));

    expect(send).not.toHaveBeenCalled();
    expect(updateGuildSettingsMock).not.toHaveBeenCalled();
  });

  it('keeps announcing to other guilds when one is skipped (AC-14, AC-16)', async () => {
    const first = buildGuild('guild-1');
    const second = buildGuild('guild-2');
    const third = buildGuild('guild-3');

    getGuildSettingsMock.mockImplementation((guildId: string) =>
      Promise.resolve({
        ...DEFAULTS,
        guildId,
        lastUsedChannelId: guildId === 'guild-2' ? null : 'channel-1',
      }),
    );

    await broadcastAnnouncement(buildClient([first.guild, second.guild, third.guild]));

    expect(first.send).toHaveBeenCalled();
    expect(second.send).not.toHaveBeenCalled();
    expect(third.send).toHaveBeenCalled();
  });

  it('keeps announcing to other guilds when one send throws (AC-21)', async () => {
    const first = buildGuild('guild-1');
    const second = buildGuild('guild-2');

    second.send.mockRejectedValue(new Error('discord down'));
    getGuildSettingsMock.mockImplementation((guildId: string) =>
      Promise.resolve({ ...DEFAULTS, guildId, lastUsedChannelId: 'channel-1' }),
    );

    await broadcastAnnouncement(buildClient([second.guild, first.guild]));

    expect(first.send).toHaveBeenCalled();
    expect(updateGuildSettingsMock).not.toHaveBeenCalledWith('guild-2', expect.anything());
  });
});

describe('broadcastAnnouncement rendering and mention (AC-17, AC-18, AC-22, AC-22b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findAllObjectiveMock.mockResolvedValue([]);
    canBotWriteToChannelMock.mockReturnValue({ allowed: true, missing: null });
  });

  it('sends the payload with the Components V2 flag (AC-22)', async () => {
    const { guild, send } = buildGuild('guild-1');

    getGuildSettingsMock.mockResolvedValue({ ...DEFAULTS, lastUsedChannelId: 'channel-1' });

    await broadcastAnnouncement(buildClient([guild]));

    const payload = send.mock.calls[0]?.[0] as SentPayload;

    expect(payload.components.length).toBeGreaterThan(0);
    expect(payload.flags).toBeDefined();
  });

  it('separates each section and renders the footer small (AC-22)', async () => {
    const { guild, send } = buildGuild('guild-1');

    getGuildSettingsMock.mockResolvedValue({ ...DEFAULTS, lastUsedChannelId: 'channel-1' });

    await broadcastAnnouncement(buildClient([guild]));

    const payload = send.mock.calls[0]?.[0] as SentPayload;
    const rendered = JSON.stringify(payload.components);
    const separators = payload.components.filter(
      (component) => !JSON.stringify(component).includes('content'),
    );
    const broadcast = getAnnounceableVersion();

    if (!broadcast) {
      throw new Error('expected an announceable version to exist');
    }

    // Title sits directly above the first section: separators only between sections and before the footer
    expect(separators.length).toBe(broadcast.sections.length);
    expect(rendered).toContain(`-# ${broadcast.footer}`);
  });

  it('parses the everyone mention when the guild opted in and holds the permission (AC-17)', async () => {
    const { guild, send } = buildGuild('guild-1');

    getGuildSettingsMock.mockResolvedValue({
      ...DEFAULTS,
      lastUsedChannelId: 'channel-1',
      mentionEveryone: true,
    });
    canBotWriteToChannelMock.mockReturnValue({
      allowed: true,
      missing: null,
      canMentionEveryone: true,
    });

    await broadcastAnnouncement(buildClient([guild]));

    const payload = send.mock.calls[0]?.[0] as SentPayload;

    expect(payload.allowedMentions?.parse).toContain('everyone');
  });

  it('sends without the mention when the guild did not opt in (AC-17)', async () => {
    const { guild, send } = buildGuild('guild-1');

    getGuildSettingsMock.mockResolvedValue({ ...DEFAULTS, lastUsedChannelId: 'channel-1' });
    canBotWriteToChannelMock.mockReturnValue({
      allowed: true,
      missing: null,
      canMentionEveryone: true,
    });

    await broadcastAnnouncement(buildClient([guild]));

    const payload = send.mock.calls[0]?.[0] as SentPayload;

    expect(payload.allowedMentions?.parse ?? []).not.toContain('everyone');
  });

  it('sends without the mention when the permission is missing, and still delivers (AC-18)', async () => {
    const { guild, send } = buildGuild('guild-1');

    getGuildSettingsMock.mockResolvedValue({
      ...DEFAULTS,
      lastUsedChannelId: 'channel-1',
      mentionEveryone: true,
    });
    canBotWriteToChannelMock.mockReturnValue({
      allowed: true,
      missing: null,
      canMentionEveryone: false,
    });

    await broadcastAnnouncement(buildClient([guild]));

    const payload = send.mock.calls[0]?.[0] as SentPayload;

    expect(send).toHaveBeenCalled();
    expect(payload.allowedMentions?.parse ?? []).not.toContain('everyone');
  });

  it('never writes a bare everyone mention in the announcement body (AC-22b)', () => {
    for (const announcement of ANNOUNCEMENTS) {
      const everyText = [announcement.title, ...announcement.sections, announcement.footer];

      for (const text of everyText) {
        expect(text.replace(/`[^`]*`/g, '')).not.toContain('@everyone');
      }
    }
  });
});

describe('broadcastAnnouncement persistence (AC-20, AC-21)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findAllObjectiveMock.mockResolvedValue([]);
    canBotWriteToChannelMock.mockReturnValue({ allowed: true, missing: null });
  });

  it('stores the announced version after a successful send (AC-20)', async () => {
    const { guild } = buildGuild('guild-1');

    getGuildSettingsMock.mockResolvedValue({ ...DEFAULTS, lastUsedChannelId: 'channel-1' });

    await broadcastAnnouncement(buildClient([guild]));

    expect(updateGuildSettingsMock).toHaveBeenCalledWith('guild-1', {
      lastAnnouncedVersion: getAnnounceableVersion()?.version,
    });
  });

  it('stores nothing when the send fails (AC-21)', async () => {
    const { guild, send } = buildGuild('guild-1');

    send.mockRejectedValue(new Error('discord down'));
    getGuildSettingsMock.mockResolvedValue({ ...DEFAULTS, lastUsedChannelId: 'channel-1' });

    await broadcastAnnouncement(buildClient([guild]));

    expect(updateGuildSettingsMock).not.toHaveBeenCalled();
  });
});

describe('broadcastAnnouncement bootstrap (AC-13b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canBotWriteToChannelMock.mockReturnValue({ allowed: true, missing: null });
  });

  it('seeds the last used channel from the most recent active objective (AC-13b)', async () => {
    const { guild, send } = buildGuild('guild-1', { 'channel-5': {} });

    getGuildSettingsMock.mockResolvedValue(DEFAULTS);
    findAllObjectiveMock.mockResolvedValue([
      { guildId: 'guild-1', channelId: 'channel-old', time: new Date('2026-09-01T10:00:00Z') },
      { guildId: 'guild-1', channelId: 'channel-5', time: new Date('2026-09-01T18:00:00Z') },
    ]);

    await broadcastAnnouncement(buildClient([guild]));

    expect(updateGuildSettingsMock).toHaveBeenCalledWith('guild-1', {
      lastUsedChannelId: 'channel-5',
    });
    expect(send).toHaveBeenCalled();
  });

  it('picks the most recent objective whatever order the query returns (AC-13b)', async () => {
    const { guild } = buildGuild('guild-1', { 'channel-5': {} });

    getGuildSettingsMock.mockResolvedValue(DEFAULTS);
    findAllObjectiveMock.mockResolvedValue([
      { guildId: 'guild-1', channelId: 'channel-5', time: new Date('2026-09-01T18:00:00Z') },
      { guildId: 'guild-1', channelId: 'channel-old', time: new Date('2026-09-01T10:00:00Z') },
    ]);

    await broadcastAnnouncement(buildClient([guild]));

    expect(updateGuildSettingsMock).toHaveBeenCalledWith('guild-1', {
      lastUsedChannelId: 'channel-5',
    });
  });

  it('never overwrites an existing last used channel (AC-13b)', async () => {
    const { guild } = buildGuild('guild-1');

    getGuildSettingsMock.mockResolvedValue({ ...DEFAULTS, lastUsedChannelId: 'channel-1' });
    findAllObjectiveMock.mockResolvedValue(
      [{ guildId: 'guild-1', channelId: 'channel-99', time: new Date('2026-09-01T18:00:00Z') }],
    );

    await broadcastAnnouncement(buildClient([guild]));

    expect(updateGuildSettingsMock).not.toHaveBeenCalledWith('guild-1', {
      lastUsedChannelId: 'channel-99',
    });
  });

  // Load constraint, not behaviour: one query for the fleet, never one per guild
  it('reads the objectives with a single query whatever the fleet size (AC-13b)', async () => {
    const first = buildGuild('guild-1');
    const second = buildGuild('guild-2');

    getGuildSettingsMock.mockResolvedValue(DEFAULTS);
    findAllObjectiveMock.mockResolvedValue([]);

    await broadcastAnnouncement(buildClient([first.guild, second.guild]));

    expect(findAllObjectiveMock).toHaveBeenCalledTimes(1);
  });
});

describe('broadcastAnnouncement pacing (AC-19)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    findAllObjectiveMock.mockResolvedValue([]);
    canBotWriteToChannelMock.mockReturnValue({ allowed: true, missing: null });
    getGuildSettingsMock.mockImplementation((guildId: string) =>
      Promise.resolve({ ...DEFAULTS, guildId, lastUsedChannelId: 'channel-1' }),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not send to more than five guilds before waiting (AC-19)', async () => {
    const guilds = Array.from({ length: 8 }, (_, index) => buildGuild(`guild-${String(index)}`));

    const pending = broadcastAnnouncement(buildClient(guilds.map((g) => g.guild)));

    await vi.advanceTimersByTimeAsync(0);

    const sentBeforeWait = guilds.filter((g) => g.send.mock.calls.length > 0).length;

    expect(sentBeforeWait).toBeLessThanOrEqual(5);

    await vi.runAllTimersAsync();
    await pending;

    expect(guilds.every((g) => g.send.mock.calls.length === 1)).toBe(true);
  });
});

describe('broadcastAnnouncement pre-filtering (AC-11, load)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findAllObjectiveMock.mockResolvedValue([]);
    findGuildsAlreadyAnnouncedMock.mockResolvedValue([]);
    canBotWriteToChannelMock.mockReturnValue({
      allowed: true,
      missing: null,
      canMentionEveryone: false,
    });
    getGuildSettingsMock.mockImplementation((guildId: string) =>
      Promise.resolve({ ...DEFAULTS, guildId, lastUsedChannelId: 'channel-1' }),
    );
  });

  it('reads no per-guild settings when every guild already received the version (AC-11)', async () => {
    const first = buildGuild('guild-1');
    const second = buildGuild('guild-2');

    findGuildsAlreadyAnnouncedMock.mockResolvedValue(['guild-1', 'guild-2']);

    await broadcastAnnouncement(buildClient([first.guild, second.guild]));

    expect(getGuildSettingsMock).not.toHaveBeenCalled();
    expect(first.send).not.toHaveBeenCalled();
    expect(second.send).not.toHaveBeenCalled();
  });

  it('reads settings only for the guilds that still need the announcement (AC-11)', async () => {
    const first = buildGuild('guild-1');
    const second = buildGuild('guild-2');

    findGuildsAlreadyAnnouncedMock.mockResolvedValue(['guild-1']);

    await broadcastAnnouncement(buildClient([first.guild, second.guild]));

    expect(getGuildSettingsMock).toHaveBeenCalledTimes(1);
    expect(getGuildSettingsMock).toHaveBeenCalledWith('guild-2');
    expect(second.send).toHaveBeenCalled();
    expect(first.send).not.toHaveBeenCalled();
  });

  it('still announces to a guild that has no settings record at all (AC-8, AC-11)', async () => {
    const { guild, send } = buildGuild('guild-1');

    findGuildsAlreadyAnnouncedMock.mockResolvedValue([]);

    await broadcastAnnouncement(buildClient([guild]));

    expect(send).toHaveBeenCalled();
  });
});
