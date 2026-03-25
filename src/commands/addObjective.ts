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
import { MAPS } from '@/constants/map.js';
import {
  RARITIES,
  RARITY_4_4,
  RARITY_5_4,
  RARITY_6_4,
  RARITY_7_4,
  RARITY_8_4,
  RARITY_COMMON,
  RARITY_EPIC,
  RARITY_LEGENDARY,
  RARITY_RARE,
} from '@/constants/rarity.js';
import {
  TYPE_CORE,
  TYPE_NODE_FIBER,
  TYPE_NODE_HIDE,
  TYPE_NODE_ORE,
  TYPE_NODE_WOOD,
  TYPE_VORTEX,
  TYPES,
} from '@/constants/type.js';

// Services
import {
  createObjective,
  findAllObjective,
  findObjectiveByGuildId,
} from '@/services/objective.service.js';

// Tasks
import { deletePreviousMessage, getMessage, sendMessageBatches } from '@/tasks/message.js';
import { getRelativeTime, isMaintenanceAdded } from '@/tasks/date.js';

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
            .setDescription('Rarity of the objective')
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
            .setDescription('Time remaining in hh:mm format')
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
    let choices: string[] = [];

    switch (focusedOption.name) {
      case 'type':
        choices = TYPES;

        if (rarityOption) {
          switch (rarityOption) {
            case RARITY_4_4:
            case RARITY_5_4:
            case RARITY_6_4:
            case RARITY_7_4:
            case RARITY_8_4:
              choices = choices.filter(
                (choice) =>
                  choice === TYPE_NODE_FIBER ||
                  choice === TYPE_NODE_HIDE ||
                  choice === TYPE_NODE_ORE ||
                  choice === TYPE_NODE_WOOD,
              );
              break;

            case RARITY_COMMON:
            case RARITY_RARE:
            case RARITY_EPIC:
            case RARITY_LEGENDARY:
              choices = choices.filter((choice) => choice === TYPE_CORE || choice === TYPE_VORTEX);
              break;
          }
        }

        break;

      case 'rarity':
        choices = RARITIES;

        if (typeOption) {
          switch (typeOption) {
            case TYPE_NODE_FIBER:
            case TYPE_NODE_HIDE:
            case TYPE_NODE_ORE:
            case TYPE_NODE_WOOD:
              choices = choices.filter(
                (choice) =>
                  choice === RARITY_4_4 ||
                  choice === RARITY_5_4 ||
                  choice === RARITY_6_4 ||
                  choice === RARITY_7_4 ||
                  choice === RARITY_8_4,
              );
              break;

            case TYPE_CORE:
            case TYPE_VORTEX:
              choices = choices.filter(
                (choice) =>
                  choice === RARITY_COMMON ||
                  choice === RARITY_RARE ||
                  choice === RARITY_EPIC ||
                  choice === RARITY_LEGENDARY,
              );
              break;
          }
        }

        break;

      case 'map':
        choices = MAPS;
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

    if (
      !guildId ||
      !channelId ||
      !userId ||
      !objectiveType ||
      !objectiveRarity ||
      !objectiveMap ||
      !objectiveTime
    ) {
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

    // Invalid values
    if (
      !TYPES.includes(objectiveType) ||
      !RARITIES.includes(objectiveRarity) ||
      !MAPS.includes(objectiveMap) ||
      !(/^(?:[01]?\d|2[0-3]):[0-5]\d$/).test(objectiveTime)
    ) {
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
            [Op.eq]: objectiveRarity,
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
            rarity: objectiveRarity,
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
        rarity: objectiveRarity,
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

        const batches = getMessage(this.container.client, 'objective', currentObjectives);

        await sendMessageBatches(channel as TextChannel, batches);
      }

      return;
    }

    await replyError(interaction, 'noObjectives');
  }
}
