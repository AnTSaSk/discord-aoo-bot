import { Command } from '@sapphire/framework';
import {
  ApplicationIntegrationType,
  InteractionContextType,
  MessageFlags,
  type GuildChannel,
  type TextChannel,
} from 'discord.js';
import utc from 'dayjs/plugin/utc.js';
import dayjs from 'dayjs';

// Config
import { getLogger } from '@/config/logger.js';

// Constants
import { COOLDOWN_DEFAULT } from '@/constants/config.js';

// Services
import { recordLastUsedChannel } from '@/services/guildSettings.service.js';
import { deleteObjective, getActiveObjectives } from '@/services/objective.service.js';

// Tasks
import { deletePreviousMessage, getMessage, sendMessageBatches } from '@/tasks/message.js';

// Utils
import {
  composeAutocompleteValue,
  computeFingerprint,
  decomposeAutocompleteValue,
} from '@/utils/objectiveFingerprint.js';
import { resolveObjectiveIndex } from '@/utils/objectiveIndex.js';
import { canModifyObjective } from '@/utils/permissions.js';
import { replyError } from '@/utils/reply.js';

dayjs.extend(utc);

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
            .setRequired(true)
            .setAutocomplete(true),
        ),
    );
  }

  public override async autocompleteRun(
    interaction: Command.AutocompleteInteraction,
  ): Promise<void> {
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.respond([]);

      return;
    }

    const activeObjectives = await getActiveObjectives(guildId);
    const choices = activeObjectives.slice(0, 25).map((objective, index) => {
      const position = index + 1;
      const fingerprint = computeFingerprint(objective);
      const time = dayjs(objective.time).utc().format('HH:mm');

      return {
        name: `#${String(position)} — ${objective.type} ${objective.rarity} ${objective.map} (${time} UTC)`,
        value: composeAutocompleteValue(position, fingerprint),
      };
    });

    await interaction.respond(choices);
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction,
  ): Promise<void> {
    const logger = getLogger();
    const guildId = interaction.guildId;
    const channelId = interaction.channelId;
    const rawIndex = interaction.options.getString('index');

    if (guildId && channelId) {
      void recordLastUsedChannel(guildId, channelId);
    }

    if (!guildId || !channelId || !rawIndex) {
      logger.error(
        {
          command: 'remove',
          guildId: guildId ?? undefined,
          rawIndex: rawIndex ?? undefined,
        },
        'Command missing required values',
      );

      await replyError(interaction, 'missingValues');

      return;
    }

    const channel = await this.container.client.channels.fetch(channelId);
    const activeObjectives = await getActiveObjectives(guildId);

    if (activeObjectives.length === 0) {
      await replyError(interaction, 'noObjectives');

      return;
    }

    const decomposed = decomposeAutocompleteValue(rawIndex);
    const carriesFingerprint = rawIndex.includes(':');
    const indexPart = decomposed.ok ? String(decomposed.index) : rawIndex;
    const fingerprint = decomposed.ok ? decomposed.fingerprint : undefined;

    // A typed index carries no fingerprint (ADR-0003); a malformed composed value is refused.
    const objective =
      carriesFingerprint && !decomposed.ok ?
        undefined :
        resolveObjectiveIndex(activeObjectives, indexPart);

    if (
      !objective ||
      (fingerprint !== undefined && computeFingerprint(objective) !== fingerprint)
    ) {
      logger.info(
        { guildId, rawIndex },
        'Objective index could not be resolved against the active list',
      );

      await replyError(interaction, 'objectiveNotFound');

      if (channel) {
        await deletePreviousMessage(this.container.client, channel.id);

        const batches = await getMessage(this.container.client, 'objective', activeObjectives);

        await sendMessageBatches(channel as TextChannel, batches);
      }

      return;
    }

    // Check permissions
    const guildChannel = interaction.channel as GuildChannel;
    const userPermissions = guildChannel.permissionsFor(interaction.user.id);
    const canModify = canModifyObjective({
      userPermissions,
      userId: interaction.user.id,
      objectiveOwnerId: objective.userId,
    });

    if (!canModify) {
      await replyError(interaction, 'permissionDenied');

      return;
    }

    await deleteObjective(guildId, objective.id);

    logger.info(
      {
        guildId,
        objectiveId: objective.id,
        objectiveType: objective.type,
        objectiveMap: objective.map,
        removedByOwner: interaction.user.id === objective.userId,
      },
      'Objective removed successfully',
    );

    await interaction.reply({
      content: 'The objective has been removed successfully',
      flags: MessageFlags.Ephemeral,
    });

    if (channel) {
      await deletePreviousMessage(this.container.client, channel.id);

      const remainingObjectives = await getActiveObjectives(guildId);
      const batches = await getMessage(this.container.client, 'objective', remainingObjectives);

      await sendMessageBatches(channel as TextChannel, batches);
    }
  }
}
