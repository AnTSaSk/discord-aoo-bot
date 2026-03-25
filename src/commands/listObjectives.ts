import { Command } from '@sapphire/framework';
import {
  ApplicationIntegrationType,
  InteractionContextType,
  MessageFlags,
  type TextChannel,
} from 'discord.js';

// Config
import { getLogger } from '@/config/logger.js';

// Constants
import { COOLDOWN_LIST } from '@/constants/config.js';

// Services
import { findObjectiveByGuildId } from '@/services/objective.service.js';

// Tasks
import { deletePreviousMessage, getMessage, sendMessageBatches } from '@/tasks/message.js';

// Utils
import { replyError } from '@/utils/reply.js';

export class ListObjectivesCommand extends Command {
  constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, {
      ...options,
      name: 'list',
      description: 'Display list of objectives',
      cooldownDelay: COOLDOWN_LIST,
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
        .setContexts(contexts),
    );
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction,
  ): Promise<void> {
    const logger = getLogger();
    const guildId = interaction.guildId;
    const channelId = interaction.channelId;

    if (!guildId || !channelId) {
      logger.error(
        {
          command: 'list',
          guildId: guildId ?? undefined,
          channelId,
        },
        'Command missing required values',
      );

      await replyError(interaction, 'generic');

      return;
    }

    // Get data
    if (guildId && channelId) {
      const channel = await this.container.client.channels.fetch(channelId);

      // Get current objectives for this guild
      const objectives = await findObjectiveByGuildId(guildId);
      const currentObjectives = objectives.filter(
        (objective) => objective.time.getTime() > Date.now(),
      );

      if (channel) {
        await deletePreviousMessage(this.container.client, channel.id);

        if (currentObjectives.length > 0) {
          await interaction.reply({
            content: 'You can check the list of the objectives below!',
            flags: MessageFlags.Ephemeral,
          });

          logger.info(
            {
              guildId,
              userId: interaction.user.id,
              objectivesCount: currentObjectives.length,
            },
            'List command executed successfully',
          );

          const batches = getMessage(this.container.client, 'objective', currentObjectives);

          await sendMessageBatches(channel as TextChannel, batches);
        } else {
          await replyError(interaction, 'noObjectives');

          logger.info(
            {
              guildId,
              userId: interaction.user.id,
            },
            'List command executed - no objectives',
          );

          const batches = getMessage(this.container.client, 'empty');

          await sendMessageBatches(channel as TextChannel, batches);
        }

        return;
      }
    }

    await replyError(interaction, 'noObjectives');
  }
}
