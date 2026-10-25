import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PermissionFlagsBits } from 'discord.js';
import type { Command } from '@sapphire/framework';

import { SettingsCommand, SETTINGS_REQUIRED_USER_PERMISSIONS } from '@/commands/settings.js';

const {
  getGuildSettingsMock,
  updateGuildSettingsMock,
  canBotWriteToChannelMock,
} = vi.hoisted(() => ({
  getGuildSettingsMock: vi.fn(),
  updateGuildSettingsMock: vi.fn(),
  canBotWriteToChannelMock: vi.fn(),
}));

vi.mock('@/services/guildSettings.service.js', () => ({
  getGuildSettings: getGuildSettingsMock,
  updateGuildSettings: updateGuildSettingsMock,
}));

vi.mock('@/utils/permissions.js', () => ({
  canBotWriteToChannel: canBotWriteToChannelMock,
}));

const DEFAULT_SETTINGS = {
  guildId: 'guild-1',
  announcementChannelId: null,
  lastUsedChannelId: null,
  announcementsEnabled: true,
  mentionEveryone: false,
  lastAnnouncedVersion: null,
  removedAt: null,
};

interface FakeReplyPayload {
  content: string;
}

interface InteractionOptions {
  subcommand: string;
  channel?: { id: string; name: string } | null;
  booleans?: Record<string, boolean | null>;
}

const buildInteraction = (
  options: InteractionOptions,
): {
  interaction: Command.ChatInputCommandInteraction;
  reply: ReturnType<typeof vi.fn<(payload: FakeReplyPayload) => Promise<void>>>;
} => {
  const reply = vi.fn<(payload: FakeReplyPayload) => Promise<void>>().mockResolvedValue(undefined);

  const interaction = {
    guildId: 'guild-1',
    channelId: 'channel-1',
    guild: { members: { me: {} } },
    options: {
      getSubcommand: () => options.subcommand,
      getChannel: () => options.channel ?? null,
      getBoolean: (name: string) => options.booleans?.[name] ?? null,
    },
    reply,
  } as unknown as Command.ChatInputCommandInteraction;

  return { interaction, reply };
};

const createCommand = (): SettingsCommand =>
  Object.create(SettingsCommand.prototype) as SettingsCommand;

describe('SettingsCommand permissions (AC-1)', () => {
  it('declares ManageGuild as the required user permission', () => {
    expect(SETTINGS_REQUIRED_USER_PERMISSIONS).toContain(PermissionFlagsBits.ManageGuild);
  });
});

describe('/settings show (AC-2, AC-2b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('replies with the stored settings of the guild (AC-2)', async () => {
    getGuildSettingsMock.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      announcementChannelId: 'channel-9',
      announcementsEnabled: false,
      mentionEveryone: true,
    });

    const { interaction, reply } = buildInteraction({ subcommand: 'show' });

    await createCommand().chatInputRun(interaction);

    const content = reply.mock.calls[0]?.[0]?.content ?? '';

    expect(getGuildSettingsMock).toHaveBeenCalledWith('guild-1');
    expect(content).toContain('channel-9');
    expect(content).toMatch(/announcements/i);
    expect(content).toMatch(/disabled/i);
    expect(content).toMatch(/everyone/i);
    expect(content).toMatch(/enabled/i);
  });

  it('shows the default values when the guild has no record (AC-2b)', async () => {
    getGuildSettingsMock.mockResolvedValue(DEFAULT_SETTINGS);

    const { interaction, reply } = buildInteraction({ subcommand: 'show' });

    await createCommand().chatInputRun(interaction);

    const content = reply.mock.calls[0]?.[0]?.content ?? '';

    expect(content).toBeTruthy();
    expect(content).not.toContain('null');
    expect(updateGuildSettingsMock).not.toHaveBeenCalled();
  });
});

describe('/settings announcement-channel (AC-3, AC-4, AC-5)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stores the channel when the bot can write in it (AC-5)', async () => {
    canBotWriteToChannelMock.mockReturnValue({ allowed: true, missing: null });

    const { interaction, reply } = buildInteraction({
      subcommand: 'announcement-channel',
      channel: { id: 'channel-7', name: 'announcements' },
    });

    await createCommand().chatInputRun(interaction);

    expect(canBotWriteToChannelMock).toHaveBeenCalled();
    expect(updateGuildSettingsMock).toHaveBeenCalledWith('guild-1', {
      announcementChannelId: 'channel-7',
    });
    expect(reply).toHaveBeenCalled();
  });

  it('stores nothing and names the missing permission when the bot cannot write (AC-3, AC-4)', async () => {
    canBotWriteToChannelMock.mockReturnValue({ allowed: false, missing: 'View Channel' });

    const { interaction, reply } = buildInteraction({
      subcommand: 'announcement-channel',
      channel: { id: 'channel-7', name: 'announcements' },
    });

    await createCommand().chatInputRun(interaction);

    const content = reply.mock.calls[0]?.[0]?.content ?? '';

    expect(updateGuildSettingsMock).not.toHaveBeenCalled();
    expect(content).toContain('View Channel');
  });

  it('checks the permissions before writing anything (AC-3)', async () => {
    const order: string[] = [];

    canBotWriteToChannelMock.mockImplementation(() => {
      order.push('check');

      return { allowed: true, missing: null };
    });
    updateGuildSettingsMock.mockImplementation(async () => {
      order.push('write');

      return Promise.resolve();
    });

    const { interaction } = buildInteraction({
      subcommand: 'announcement-channel',
      channel: { id: 'channel-7', name: 'announcements' },
    });

    await createCommand().chatInputRun(interaction);

    expect(order).toEqual(['check', 'write']);
  });
});

describe('/settings announcements (AC-6, AC-7, AC-7b, AC-7c)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getGuildSettingsMock.mockResolvedValue(DEFAULT_SETTINGS);
  });

  it('stores the announcements state when provided (AC-6)', async () => {
    const { interaction } = buildInteraction({
      subcommand: 'announcements',
      booleans: { enabled: false },
    });

    await createCommand().chatInputRun(interaction);

    expect(updateGuildSettingsMock).toHaveBeenCalledWith('guild-1', {
      announcementsEnabled: false,
    });
  });

  it('stores the mention opt-in when provided (AC-7)', async () => {
    const { interaction } = buildInteraction({
      subcommand: 'announcements',
      booleans: { 'mention-everyone': true },
    });

    await createCommand().chatInputRun(interaction);

    expect(updateGuildSettingsMock).toHaveBeenCalledWith('guild-1', {
      mentionEveryone: true,
    });
  });

  it('leaves the other setting untouched when only one option is given (AC-7b)', async () => {
    const { interaction } = buildInteraction({
      subcommand: 'announcements',
      booleans: { enabled: false },
    });

    await createCommand().chatInputRun(interaction);

    const written = updateGuildSettingsMock.mock.calls[0]?.[1] as Record<string, unknown>;

    expect(written).not.toHaveProperty('mentionEveryone');
  });

  it('writes both settings when both options are given (AC-6, AC-7)', async () => {
    const { interaction } = buildInteraction({
      subcommand: 'announcements',
      booleans: { enabled: true, 'mention-everyone': true },
    });

    await createCommand().chatInputRun(interaction);

    expect(updateGuildSettingsMock).toHaveBeenCalledWith('guild-1', {
      announcementsEnabled: true,
      mentionEveryone: true,
    });
  });

  it('writes nothing and reports the current state when no option is given (AC-7c)', async () => {
    const { interaction, reply } = buildInteraction({
      subcommand: 'announcements',
      booleans: {},
    });

    await createCommand().chatInputRun(interaction);

    expect(updateGuildSettingsMock).not.toHaveBeenCalled();
    expect(reply.mock.calls[0]?.[0]?.content).toBeTruthy();
  });
});
