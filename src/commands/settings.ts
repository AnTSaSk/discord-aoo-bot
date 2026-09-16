import { Command } from '@sapphire/framework';
import {
  ApplicationIntegrationType,
  ChannelType,
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  type GuildBasedChannel,
  type SlashCommandBooleanOption,
  type SlashCommandChannelOption,
} from 'discord.js';

// Config
import { getLogger } from '@/config/logger.js';

// Services
import {
  getGuildSettings,
  updateGuildSettings,
  type GuildSettingsFields,
  type ResolvedGuildSettings,
} from '@/services/guildSettings.service.js';

// Utils
import { canBotWriteToChannel } from '@/utils/permissions.js';
import { replyError } from '@/utils/reply.js';

export const SETTINGS_REQUIRED_USER_PERMISSIONS = [PermissionFlagsBits.ManageGuild];

const UNSET_CHANNEL = 'not set, announcements fall back to the last channel the bot was used in';

const formatSettings = (settings: ResolvedGuildSettings): string => {
  const channel = settings.announcementChannelId ?
    `<#${settings.announcementChannelId}>` :
    UNSET_CHANNEL;

  return `**Announcement channel:** ${channel}
**Announcements:** ${settings.announcementsEnabled ? 'enabled' : 'disabled'}
**Mention \`@everyone\`:** ${settings.mentionEveryone ? 'enabled' : 'disabled'}`;
};

export class SettingsCommand extends Command {
  constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, {
      ...options,
      name: 'settings',
      description: 'Configure the bot for this server',
      requiredUserPermissions: SETTINGS_REQUIRED_USER_PERMISSIONS,
    });
  }

  public override registerApplicationCommands(registry: Command.Registry): void {
    const integrationTypes: ApplicationIntegrationType[] = [ApplicationIntegrationType.GuildInstall];
    const contexts: InteractionContextType[] = [InteractionContextType.Guild];

    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .setIntegrationTypes(integrationTypes)
        .setContexts(contexts)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((subcommand) =>
          subcommand
            .setName('show')
            .setDescription('Display the current configuration of this server'))
        .addSubcommand((subcommand) =>
          subcommand
            .setName('announcement-channel')
            .setDescription('Choose the channel where release announcements are posted')
            .addChannelOption((option: SlashCommandChannelOption) =>
              option
                .setName('channel')
                .setDescription('Text channel to post announcements in')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)))
        .addSubcommand((subcommand) =>
          subcommand
            .setName('announcements')
            .setDescription('Turn announcements on or off, and opt in to the @everyone mention')
            .addBooleanOption((option: SlashCommandBooleanOption) =>
              option
                .setName('enabled')
                .setDescription('Receive release announcements on this server')
                .setRequired(false))
            .addBooleanOption((option: SlashCommandBooleanOption) =>
              option
                .setName('mention-everyone')
                .setDescription('Mention @everyone when an announcement is posted')
                .setRequired(false))));
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction,
  ): Promise<void> {
    const guildId = interaction.guildId;

    if (!guildId) {
      await replyError(interaction, 'guildOnly');

      return;
    }

    switch (interaction.options.getSubcommand()) {
      case 'show':
        await this.runShow(interaction, guildId);
        break;
      case 'announcement-channel':
        await this.runAnnouncementChannel(interaction, guildId);
        break;
      case 'announcements':
        await this.runAnnouncements(interaction, guildId);
        break;
    }
  }

  private async runShow(
    interaction: Command.ChatInputCommandInteraction,
    guildId: string,
  ): Promise<void> {
    const settings = await getGuildSettings(guildId);

    await interaction.reply({
      content: formatSettings(settings),
      flags: MessageFlags.Ephemeral,
    });
  }

  private async runAnnouncementChannel(
    interaction: Command.ChatInputCommandInteraction,
    guildId: string,
  ): Promise<void> {
    const channel = interaction.options.getChannel('channel');
    const botMember = interaction.guild?.members.me ?? null;

    if (!channel) {
      await replyError(interaction, 'missingValues');

      return;
    }

    const check = canBotWriteToChannel(channel as GuildBasedChannel, botMember);

    if (!check.allowed) {
      getLogger().info(
        { guildId, channelId: channel.id, missing: check.missing },
        'Announcement channel rejected: bot cannot write there',
      );

      await replyError(interaction, 'channelNotWritable', { permission: check.missing });

      return;
    }

    await updateGuildSettings(guildId, { announcementChannelId: channel.id });

    await interaction.reply({
      content: `Announcements will now be posted in <#${channel.id}>.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  private async runAnnouncements(
    interaction: Command.ChatInputCommandInteraction,
    guildId: string,
  ): Promise<void> {
    const enabled = interaction.options.getBoolean('enabled');
    const mentionEveryone = interaction.options.getBoolean('mention-everyone');

    if (enabled === null && mentionEveryone === null) {
      const settings = await getGuildSettings(guildId);

      await interaction.reply({
        content: formatSettings(settings),
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    const fields: GuildSettingsFields = {};

    if (enabled !== null) {
      fields.announcementsEnabled = enabled;
    }

    if (mentionEveryone !== null) {
      fields.mentionEveryone = mentionEveryone;
    }

    await updateGuildSettings(guildId, fields);

    await interaction.reply({
      content: formatSettings(await getGuildSettings(guildId)),
      flags: MessageFlags.Ephemeral,
    });
  }
}
