import { Command } from '@sapphire/framework';
import {
  ApplicationIntegrationType,
  InteractionContextType,
  MessageFlags,
  type TextChannel,
} from 'discord.js';

// Config
import { getLogger } from '@/config/logger.js';

// Services
import { deleteObjectivesByIds, findObjectiveByGuildId } from '@/services/objective.service.js';

// Tasks
import { deletePreviousMessage, getMessage } from '@/tasks/message.js';

export class ListObjectivesCommand extends Command {
  constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, {
      ...options,
      name: 'list',
      description: 'Display list of objectives',
      cooldownDelay: 5_000,
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

  public override async chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<void> {
    const logger = getLogger();
    const guildId = interaction.guildId;
    const channelId = interaction.channelId;

    if (!guildId || !channelId) {
      logger.error({
        command: 'list',
        guildId: guildId ?? undefined,
        channelId,
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

      if (objectives.length > 0 && interaction.channel) {
        const oldObjectives = objectives.filter((objective) => objective.time.getTime() < new Date().getTime());
        const currentObjectives = objectives.filter((objective) => objective.time.getTime() > new Date().getTime());

        // Delete old objectives
        if (oldObjectives.length > 0) {
          await deleteObjectivesByIds(oldObjectives.map((o) => o.id));
        }

        if (currentObjectives.length > 0 && channel) {
          await deletePreviousMessage(this.container.client, channel.id);

          await interaction.reply({
            content: 'You can check the list of the objectives below!',
            flags: MessageFlags.Ephemeral,
          });

          logger.info({
            guildId,
            userId: interaction.user.id,
            objectivesCount: currentObjectives.length,
          }, 'List command executed successfully');

          await (channel as TextChannel).send({
            components: getMessage(this.container.client, 'objective', currentObjectives),
            flags: MessageFlags.IsComponentsV2,
          });

          return;
        }
      }

      if (channel) {
        await deletePreviousMessage(this.container.client, channel.id);

        await interaction.reply({
          content: 'No objectives to display!',
          flags: MessageFlags.Ephemeral,
        });

        logger.info({
          guildId,
          userId: interaction.user.id,
        }, 'List command executed - no objectives');

        await (channel as TextChannel).send({
          components: getMessage(this.container.client, 'empty'),
          flags: MessageFlags.IsComponentsV2,
        });

        return;
      }
    }

    await interaction.reply({
      content: 'No objectives to display',
      flags: MessageFlags.Ephemeral,
    });
  }
}
