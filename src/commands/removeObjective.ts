import { Command } from '@sapphire/framework';
import {
  ApplicationIntegrationType,
  InteractionContextType,
  MessageFlags,
  PermissionsBitField,
  type GuildChannel,
  type TextChannel,
} from 'discord.js';

// Config
import database from '@/config/db.js';
import { getLogger } from '@/config/logger.js';

// Constants
import { COOLDOWN_DEFAULT } from '@/constants/config.js';

// Models
import ObjectiveModel from '@/models/objective.model.js';

// Services
import { findObjectiveByGuildId } from '@/services/objective.service.js';

// Tasks
import { deletePreviousMessage, getMessage, sendMessageBatches } from '@/tasks/message.js';

// Utils
import { replyError } from '@/utils/reply.js';

export class RemoveObjectiveCommand extends Command {
  constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, {
      ...options,
      name: 'remove',
      description: 'Remove an objective from the list',
      cooldownDelay: COOLDOWN_DEFAULT,
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
        .addStringOption((option) =>
          option
            .setName('index')
            .setDescription('Write the index number display as #[INDEX] from the objective line')
            .setRequired(true),
        ),
    );
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction,
  ): Promise<void> {
    const logger = getLogger();
    const guildId = interaction.guildId;
    const channelId = interaction.channelId;
    const objectiveIndex = interaction.options.getString('index')?.replace(/\D/g, '');

    if (!guildId || !objectiveIndex) {
      logger.error(
        {
          command: 'remove',
          guildId: guildId ?? undefined,
          objectiveIndex: objectiveIndex ?? undefined,
        },
        'Command missing required values',
      );

      await replyError(interaction, 'generic');

      return;
    }

    // Get data
    if (guildId && channelId) {
      const channel = await this.container.client.channels.fetch(channelId);

      // Get all data for this guild and send a new message
      const objectives = await findObjectiveByGuildId(guildId);

      if (objectives.length === 0 || parseInt(objectiveIndex, 10) > objectives.length) {
        await replyError(interaction, 'objectiveNotFound');

        return;
      }

      if (objectives.length > 0 && interaction.channel) {
        const objective = objectives.find(
          (_item, index) => index + 1 === parseInt(objectiveIndex, 10),
        );

        if (!objective) {
          await replyError(interaction, 'objectiveNotFound');

          return;
        }

        // Check permissions
        const guildChannel = channel as GuildChannel;
        const userPermissions = guildChannel.permissionsFor(interaction.user.id);
        const isAdmin = userPermissions?.has(PermissionsBitField.Flags.Administrator) ?? false;
        const canManageMessages =
          userPermissions?.has(PermissionsBitField.Flags.ManageMessages) ?? false;
        const isOwner = interaction.user.id === objective.userId;

        if (!isAdmin && !canManageMessages && !isOwner) {
          await replyError(interaction, 'permissionDenied');

          return;
        }

        // Atomic delete + re-fetch in a single transaction
        const remainingObjectives = await database.transaction(async (transaction) => {
          await ObjectiveModel.destroy({ where: { id: objective.id }, transaction });

          return ObjectiveModel.findAll({
            where: { guildId },
            order: [['time', 'ASC']],
            transaction,
          });
        });

        const currentObjectives = remainingObjectives.filter((o) => o.time.getTime() > Date.now());

        logger.info(
          {
            guildId,
            userId: interaction.user.id,
            objectiveId: objective.id,
            objectiveType: objective.type,
            objectiveMap: objective.map,
            removedByOwner: interaction.user.id === objective.userId,
          },
          'Objective removed successfully',
        );

        if (channel) {
          await deletePreviousMessage(this.container.client, channel.id);

          await interaction.reply({
            content: 'The objective has been removed successfully',
            flags: MessageFlags.Ephemeral,
          });

          const batches = getMessage(this.container.client, 'objective', currentObjectives);

          await sendMessageBatches(channel as TextChannel, batches);
        }

        return;
      }
    }

    await replyError(interaction, 'noObjectives');
  }
}
