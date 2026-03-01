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
import { getLogger } from '@/config/logger.js';

// Services
import { deleteObjective, findObjectiveByGuildId } from '@/services/objective.service.js';

// Tasks
import { deletePreviousMessage, getMessage } from '@/tasks/message.js';

export class RemoveObjectiveCommand extends Command {
  constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, {
      ...options,
      name: 'remove',
      description: 'Remove an objective from the list',
      cooldownDelay: 2_000,
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
          option.setName('index')
            .setDescription('Write the index number display as #[INDEX] from the objective line')
            .setRequired(true),
        ),
    );
  }

  public override async chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<void> {
    const logger = getLogger();
    const guildId = interaction.guildId;
    const channelId = interaction.channelId;
    const objectiveIndex = interaction.options.getString('index')?.replace(/\D/g, '');

    if (!guildId || !objectiveIndex) {
      logger.error({
        command: 'remove',
        guildId: guildId ?? undefined,
        objectiveIndex: objectiveIndex ?? undefined,
      }, 'Command missing required values');

      await interaction.reply({
        content: 'Something went wrong, please try again.',
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    // Get data
    if (guildId && channelId) {
      const channel = await this.container.client.channels.fetch(channelId);

      // Get all data for this guild and send a new message
      const objectives = await findObjectiveByGuildId(guildId);

      if (objectives.length === 0 || parseInt(objectiveIndex, 10) > objectives.length) {
        await interaction.reply({
          content: 'We cannot find the objective you want to remove',
          flags: MessageFlags.Ephemeral,
        });

        return;
      }

      if (objectives.length > 0 && interaction.channel) {
        const objective = objectives.find((_item, index) => (index + 1) === parseInt(objectiveIndex, 10));

        if (!objective) {
          await interaction.reply({
            content: 'We cannot find the objective you want to remove',
            flags: MessageFlags.Ephemeral,
          });

          return;
        }

        // Check permissions
        const guildChannel = channel as GuildChannel;
        const userPermissions = guildChannel.permissionsFor(interaction.user.id);
        const isAdmin = userPermissions?.has(PermissionsBitField.Flags.Administrator) ?? false;
        const canManageMessages = userPermissions?.has(PermissionsBitField.Flags.ManageMessages) ?? false;
        const isOwner = interaction.user.id === objective.userId;

        if (!isAdmin && !canManageMessages && !isOwner) {
          await interaction.reply({
            content: 'You don\'t have permission to remove this objective!',
            flags: MessageFlags.Ephemeral,
          });

          return;
        }

        await deleteObjective(objective.id);

        if (channel) {
          await deletePreviousMessage(this.container.client, channel.id);

          await interaction.reply({
            content: 'The objective has been removed successfully',
            flags: MessageFlags.Ephemeral,
          });

          logger.info({
            guildId,
            userId: interaction.user.id,
            objectiveId: objective.id,
            objectiveType: objective.type,
            objectiveMap: objective.map,
            removedByOwner: interaction.user.id === objective.userId,
          }, 'Objective removed successfully');

          const remainingObjectives = objectives.filter((o) => o.id !== objective.id);

          await (channel as TextChannel).send({
            components: getMessage(this.container.client, 'objective', remainingObjectives),
            flags: MessageFlags.IsComponentsV2,
          });
        }

        return;
      }
    }

    await interaction.reply({
      content: 'No objective to remove',
      flags: MessageFlags.Ephemeral,
    });
  }
}
