import {
  ChannelType,
  PermissionsBitField,
  type Guild,
  type GuildBasedChannel,
  type GuildMember,
  type TextChannel,
} from 'discord.js';

interface CanModifyObjectiveParams {
  userPermissions: PermissionsBitField | null;
  userId: string;
  objectiveOwnerId: string;
}

export const canModifyObjective = ({
  userPermissions,
  userId,
  objectiveOwnerId,
}: CanModifyObjectiveParams): boolean => {
  const isAdmin = userPermissions?.has(PermissionsBitField.Flags.Administrator) ?? false;
  const canManageMessages = userPermissions?.has(PermissionsBitField.Flags.ManageMessages) ?? false;
  const isOwner = userId === objectiveOwnerId;

  return isAdmin || canManageMessages || isOwner;
};

export type ChannelWriteCheck =
  { allowed: true; missing: null; canMentionEveryone: boolean } |
  { allowed: false; missing: string; canMentionEveryone: false };

export const canBotWriteToChannel = (
  channel: GuildBasedChannel,
  botMember: GuildMember | null,
): ChannelWriteCheck => {
  if (!botMember) {
    return { allowed: false, missing: 'View Channel', canMentionEveryone: false };
  }

  const permissions = channel.permissionsFor(botMember);

  // ViewChannel gates SendMessages: without it the send fails as Missing Access
  if (!permissions.has(PermissionsBitField.Flags.ViewChannel)) {
    return { allowed: false, missing: 'View Channel', canMentionEveryone: false };
  }

  if (!permissions.has(PermissionsBitField.Flags.SendMessages)) {
    return { allowed: false, missing: 'Send Messages', canMentionEveryone: false };
  }

  return {
    allowed: true,
    missing: null,
    canMentionEveryone: permissions.has(PermissionsBitField.Flags.MentionEveryone),
  };
};

export const resolveWelcomeChannel = (guild: Guild): TextChannel | null => {
  const botMember = guild.members.me;

  if (!botMember) {
    return null;
  }

  // The system channel may be unset, and its presence never implies the bot can post there
  if (guild.systemChannel && canBotWriteToChannel(guild.systemChannel, botMember).allowed) {
    return guild.systemChannel;
  }

  for (const channel of guild.channels.cache.values()) {
    if (channel.type === ChannelType.GuildText && canBotWriteToChannel(channel, botMember).allowed) {
      return channel;
    }
  }

  return null;
};
