import { describe, it, expect } from 'vitest';
import { ChannelType, PermissionsBitField } from 'discord.js';

import {
  canBotWriteToChannel,
  canModifyObjective,
  resolveWelcomeChannel,
} from '@/utils/permissions.js';

const AUTHOR_ID = 'user-author';
const OTHER_ID = 'user-other';

const buildPermissions = (flags: bigint[]): PermissionsBitField => new PermissionsBitField(flags);

describe('canModifyObjective', () => {
  it('allows a server administrator (AC-1)', () => {
    const permissions = buildPermissions([PermissionsBitField.Flags.Administrator]);

    const result = canModifyObjective({
      userPermissions: permissions,
      userId: OTHER_ID,
      objectiveOwnerId: AUTHOR_ID,
    });

    expect(result).toBe(true);
  });

  it('allows a member with manage-messages (AC-1)', () => {
    const permissions = buildPermissions([PermissionsBitField.Flags.ManageMessages]);

    const result = canModifyObjective({
      userPermissions: permissions,
      userId: OTHER_ID,
      objectiveOwnerId: AUTHOR_ID,
    });

    expect(result).toBe(true);
  });

  it('allows the objective author (AC-1)', () => {
    const permissions = buildPermissions([]);

    const result = canModifyObjective({
      userPermissions: permissions,
      userId: AUTHOR_ID,
      objectiveOwnerId: AUTHOR_ID,
    });

    expect(result).toBe(true);
  });

  it('refuses a plain member who is not the author (AC-2)', () => {
    const permissions = buildPermissions([]);

    const result = canModifyObjective({
      userPermissions: permissions,
      userId: OTHER_ID,
      objectiveOwnerId: AUTHOR_ID,
    });

    expect(result).toBe(false);
  });

  it('refuses rather than throws when channel permissions are unreadable (null, AC-2)', () => {
    const result = canModifyObjective({
      userPermissions: null,
      userId: OTHER_ID,
      objectiveOwnerId: AUTHOR_ID,
    });

    expect(result).toBe(false);
  });
});

const buildChannel = (
  permissions: PermissionsBitField,
): Parameters<typeof canBotWriteToChannel>[0] =>
  ({
    permissionsFor: () => permissions,
  }) as unknown as Parameters<typeof canBotWriteToChannel>[0];

const BOT_MEMBER = {} as Parameters<typeof canBotWriteToChannel>[1];

describe('canBotWriteToChannel', () => {
  it('allows a channel where the bot holds both view and send (AC-3)', () => {
    const channel = buildChannel(
      buildPermissions([
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
      ]),
    );

    const result = canBotWriteToChannel(channel, BOT_MEMBER);

    expect(result.allowed).toBe(true);
    expect(result.missing).toBeNull();
  });

  it('refuses a channel where send-messages is granted but view-channel is not (AC-3, AC-4)', () => {
    const channel = buildChannel(buildPermissions([PermissionsBitField.Flags.SendMessages]));

    const result = canBotWriteToChannel(channel, BOT_MEMBER);

    expect(result.allowed).toBe(false);
    expect(result.missing).toBe('View Channel');
  });

  it('refuses a channel where view-channel is granted but send-messages is not (AC-3, AC-4)', () => {
    const channel = buildChannel(buildPermissions([PermissionsBitField.Flags.ViewChannel]));

    const result = canBotWriteToChannel(channel, BOT_MEMBER);

    expect(result.allowed).toBe(false);
    expect(result.missing).toBe('Send Messages');
  });

  it('refuses a channel where the bot holds neither permission (AC-4)', () => {
    const channel = buildChannel(buildPermissions([]));

    const result = canBotWriteToChannel(channel, BOT_MEMBER);

    expect(result.allowed).toBe(false);
    expect(result.missing).toBe('View Channel');
  });

  it('refuses when the bot member cannot be resolved (AC-3)', () => {
    const channel = buildChannel(
      buildPermissions([
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
      ]),
    );

    const result = canBotWriteToChannel(channel, null);

    expect(result.allowed).toBe(false);
  });
});

const writable = (id: string): unknown => ({
  id,
  type: ChannelType.GuildText,
  permissionsFor: () =>
    buildPermissions([
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.SendMessages,
    ]),
});

const unwritable = (id: string): unknown => ({
  id,
  type: ChannelType.GuildText,
  permissionsFor: () => buildPermissions([]),
});

const buildGuild = (options: {
  systemChannel?: unknown;
  channels?: unknown[];
  hasBotMember?: boolean;
}): Parameters<typeof resolveWelcomeChannel>[0] =>
  ({
    systemChannel: options.systemChannel ?? null,
    members: { me: options.hasBotMember === false ? null : {} },
    channels: { cache: new Map((options.channels ?? []).map((c, i) => [String(i), c])) },
  }) as unknown as Parameters<typeof resolveWelcomeChannel>[0];

describe('resolveWelcomeChannel (AC-24, AC-25)', () => {
  it('picks the system channel when the bot can write in it (AC-24)', () => {
    const guild = buildGuild({
      systemChannel: writable('system'),
      channels: [writable('other')],
    });

    expect(resolveWelcomeChannel(guild)?.id).toBe('system');
  });

  it('falls back to the first writable channel when the system channel is not writable (AC-24)', () => {
    const guild = buildGuild({
      systemChannel: unwritable('system'),
      channels: [unwritable('locked'), writable('general')],
    });

    expect(resolveWelcomeChannel(guild)?.id).toBe('general');
  });

  it('falls back to the first writable channel when there is no system channel (AC-24)', () => {
    const guild = buildGuild({ channels: [writable('general')] });

    expect(resolveWelcomeChannel(guild)?.id).toBe('general');
  });

  it('never picks a voice channel even when the bot could write there (AC-24)', () => {
    const voice = {
      id: 'voice',
      type: ChannelType.GuildVoice,
      permissionsFor: () =>
        buildPermissions([
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
        ]),
    };
    const guild = buildGuild({ channels: [voice, writable('general')] });

    expect(resolveWelcomeChannel(guild)?.id).toBe('general');
  });

  it('resolves nothing when no channel is writable (AC-25)', () => {
    const guild = buildGuild({ channels: [unwritable('locked')] });

    expect(resolveWelcomeChannel(guild)).toBeNull();
  });

  it('resolves nothing when the bot member is not in cache (AC-25)', () => {
    const guild = buildGuild({
      systemChannel: writable('system'),
      hasBotMember: false,
    });

    expect(resolveWelcomeChannel(guild)).toBeNull();
  });
});
