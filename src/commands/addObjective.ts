import { Command } from '@sapphire/framework';
import {
  ApplicationIntegrationType,
  InteractionContextType,
  MessageFlags,
  type TextChannel,
  type SlashCommandStringOption,
} from 'discord.js';
import { Op } from '@sequelize/core';

// Config
import { getLogger } from '@/config/logger.js';

// Constants
import { COOLDOWN_DEFAULT, DUPLICATE_TIME_WINDOW_MINUTES } from '@/constants/config.js';
import { MAPS, MAPS_BLACK_ZONE } from '@/constants/map.js';
import { RARITIES, RARITY_NONE } from '@/constants/rarity.js';
import {
  getMapZoneForType,
  getRarityFamilyForType,
  isValidTypeMapCombination,
  isValidTypeRarityCombination,
  MAPS_ALL_SORTED,
} from '@/utils/objectiveValidation.js';
import { resolveTimeBoundMinutes } from '@/utils/objectiveTimeBounds.js';
import { TYPE_DRAGON, TYPES } from '@/constants/type.js';

// Services
import { recordLastUsedChannel } from '@/services/guildSettings.service.js';
import {
  createObjective,
  findAllObjective,
  findObjectiveByGuildId,
} from '@/services/objective.service.js';

// Tasks
import { deletePreviousMessage, getMessage, sendMessageBatches } from '@/tasks/message.js';
import { getRelativeTime, isMaintenanceAdded, parseTimeInput } from '@/tasks/date.js';

// Utils
import { replyError } from '@/utils/reply.js';

export class AddObjectiveCommand extends Command {
  constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, {
      ...options,
      name: 'add',
      description: 'Add new objective',
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
        .addStringOption((option: SlashCommandStringOption) =>
          option
            .setName('type')
            .setDescription('Type of objective')
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((option: SlashCommandStringOption) =>
          option
            .setName('rarity')
            .setDescription('Rarity/Tier/Portal size - n/a for Dragon')
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((option: SlashCommandStringOption) =>
          option
            .setName('map')
            .setDescription('Name of the map where the objective is')
            .setRequired(true)
            .setAutocomplete(true),
        )
        .addStringOption((option: SlashCommandStringOption) =>
          option
            .setName('time')
            .setDescription(
              'Time remaining. Accepted formats: 1:30, 02:30, 1h30, 1h30m, 1h 30, 1h 30m, 1h, 90, 45m, 90m',
            )
            .setRequired(true)
            .setAutocomplete(false),
        ),
    );
  }

  public override async autocompleteRun(
    interaction: Command.AutocompleteInteraction,
  ): Promise<void> {
    const focusedOption = interaction.options.getFocused(true);
    const typeOption = interaction.options.getString('type');
    const rarityOption = interaction.options.getString('rarity');
    const mapOption = interaction.options.getString('map');
    let choices: string[] = [];

    switch (focusedOption.name) {
      case 'type': {
        const byRarity =
          rarityOption ?
            TYPES.filter((type) => getRarityFamilyForType(type)?.has(rarityOption) ?? false) :
            TYPES;

        choices =
          mapOption ?
            byRarity.filter((type) => getMapZoneForType(type)?.has(mapOption) ?? false) :
            byRarity;
        break;
      }

      case 'rarity':
        choices = typeOption ? [...(getRarityFamilyForType(typeOption) ?? [])] : RARITIES;
        break;

      case 'map':
        choices =
          typeOption && typeOption !== TYPE_DRAGON ?
            MAPS_BLACK_ZONE :
            MAPS_ALL_SORTED;
        break;
    }

    let filteredChoices = focusedOption.value ?
      choices.filter(
        (choice) =>
          choice.toLowerCase().startsWith(focusedOption.value.toLowerCase()) ||
          choice.toLowerCase().endsWith(focusedOption.value.toLowerCase()) ||
          choice.toLowerCase().includes(focusedOption.value.toLowerCase()),
      ) :
      choices;

    if (filteredChoices.length > 25) {
      filteredChoices = filteredChoices.slice(0, 25);
    }

    await interaction.respond(
      filteredChoices.map((choice) => ({
        name: choice,
        value: choice,
      })),
    );
  }

  public override async chatInputRun(
    interaction: Command.ChatInputCommandInteraction,
  ): Promise<void> {
    const logger = getLogger();
    const guildId = interaction.guildId;
    const channelId = interaction.channelId;
    const userId = interaction.user.id;
    const objectiveType = interaction.options.getString('type');
    const objectiveRarity = interaction.options.getString('rarity');
    const objectiveMap = interaction.options.getString('map');
    const objectiveTime = interaction.options.getString('time');

    if (guildId && channelId) {
      void recordLastUsedChannel(guildId, channelId);
    }

    if (!guildId || !channelId || !userId || !objectiveType || !objectiveMap || !objectiveTime) {
      logger.error(
        {
          command: 'addObjective',
          guildId: guildId ?? undefined,
          channelId,
          userId,
          type: objectiveType ?? undefined,
          rarity: objectiveRarity ?? undefined,
          map: objectiveMap ?? undefined,
          time: objectiveTime ?? undefined,
        },
        'Command missing required values',
      );

      await replyError(interaction, 'missingValues');

      return;
    }

    // The sentinel is not in RARITIES (AC-N6) but is a valid referential value.
    const rarityIsInvalid =
      objectiveRarity !== null &&
      objectiveRarity !== RARITY_NONE &&
      !RARITIES.includes(objectiveRarity);

    // Invalid values
    if (!TYPES.includes(objectiveType) || rarityIsInvalid || !MAPS.includes(objectiveMap)) {
      logger.error(
        {
          command: 'addObjective',
          type: objectiveType,
          rarity: objectiveRarity,
          map: objectiveMap,
          time: objectiveTime,
        },
        'Command received incorrect values',
      );

      await replyError(interaction, 'invalidValues');

      return;
    }

    const admitsRarity = getRarityFamilyForType(objectiveType)?.has(RARITY_NONE) !== true;

    if (!admitsRarity && objectiveRarity !== null && objectiveRarity !== RARITY_NONE) {
      await replyError(interaction, 'unexpectedRarity');

      return;
    }

    if (admitsRarity && (objectiveRarity === null || objectiveRarity === RARITY_NONE)) {
      await replyError(interaction, 'missingRarity');

      return;
    }

    if (!isValidTypeMapCombination(objectiveType, objectiveMap)) {
      await replyError(interaction, 'unexpectedRoyalMap');

      return;
    }

    const resolvedRarity = objectiveType === TYPE_DRAGON ? RARITY_NONE : objectiveRarity!;

    if (!isValidTypeRarityCombination(objectiveType, resolvedRarity)) {
      logger.error(
        {
          command: 'addObjective',
          type: objectiveType,
          rarity: resolvedRarity,
          map: objectiveMap,
          time: objectiveTime,
        },
        'Command received invalid type/rarity combination',
      );

      await replyError(interaction, 'invalidTypeRarity');

      return;
    }

    const timeBoundMinutes = resolveTimeBoundMinutes(objectiveType, resolvedRarity);
    const parsedTime = parseTimeInput(objectiveTime, timeBoundMinutes);

    if (!parsedTime.ok) {
      logger.error(
        {
          command: 'addObjective',
          type: objectiveType,
          rarity: resolvedRarity,
          map: objectiveMap,
          time: objectiveTime,
        },
        'Command received incorrect time value',
      );

      await replyError(
        interaction,
        parsedTime.reason === 'range' ? 'timeOutOfRange' : 'invalidTimeFormat',
      );

      return;
    }

    // Save data
    if (guildId && channelId) {
      const channel = await this.container.client.channels.fetch(channelId);
      const time = getRelativeTime(new Date(), objectiveTime);
      const maintenance = isMaintenanceAdded(time);

      // Avoid duplicate objective - Range of 8 minutes
      const timeStart = time.subtract(DUPLICATE_TIME_WINDOW_MINUTES, 'minute');
      const timeEnd = time.add(DUPLICATE_TIME_WINDOW_MINUTES, 'minute');

      const identicalObjectives = await findAllObjective({
        order: [['time', 'ASC']],
        where: {
          guildId: {
            [Op.eq]: guildId,
          },
          type: {
            [Op.eq]: objectiveType,
          },
          rarity: {
            [Op.eq]: resolvedRarity,
          },
          map: {
            [Op.eq]: objectiveMap,
          },
          time: {
            [Op.between]: [timeStart.toDate(), timeEnd.toDate()],
          },
        },
      });

      if (identicalObjectives.length > 0) {
        logger.info(
          {
            guildId,
            type: objectiveType,
            rarity: resolvedRarity,
            map: objectiveMap,
            time: objectiveTime,
          },
          'Objective already exists',
        );

        await replyError(interaction, 'duplicateObjective');

        return;
      }

      const created = await createObjective({
        guildId,
        channelId,
        userId,
        type: objectiveType,
        rarity: resolvedRarity,
        map: objectiveMap,
        time: time.toDate(),
        maintenanceAdded: maintenance,
      });

      if (!created) {
        await replyError(interaction, 'duplicateObjective');

        return;
      }

      await interaction.reply({
        content: `Your objective (${objectiveType}) has been successfully added!
It will be available at ${time.format('HH:mm')} UTC (<t:${String(time.unix())}:R>) on the map ${objectiveMap}`,
        flags: MessageFlags.Ephemeral,
      });

      // Get current objectives for this guild and update the display
      const objectives = await findObjectiveByGuildId(guildId);
      const currentObjectives = objectives.filter(
        (objective) => objective.time.getTime() > Date.now(),
      );

      if (currentObjectives.length > 0 && channel) {
        await deletePreviousMessage(this.container.client, channel.id);

        const batches = await getMessage(this.container.client, 'objective', currentObjectives);

        await sendMessageBatches(channel as TextChannel, batches);
      }

      return;
    }

    await replyError(interaction, 'noObjectives');
  }
}
