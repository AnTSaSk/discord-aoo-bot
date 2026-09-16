import { Command } from '@sapphire/framework';
import {
  ApplicationIntegrationType,
  InteractionContextType,
  MessageFlags,
  type GuildChannel,
  type TextChannel,
  type SlashCommandStringOption,
} from 'discord.js';
import utc from 'dayjs/plugin/utc.js';
import dayjs from 'dayjs';

// Config
import { getLogger } from '@/config/logger.js';

// Constants
import { COOLDOWN_DEFAULT } from '@/constants/config.js';
import { MAPS, MAPS_BLACK_ZONE } from '@/constants/map.js';
import { RARITIES, RARITY_NONE } from '@/constants/rarity.js';
import { TYPE_DRAGON, TYPES } from '@/constants/type.js';

// Models
import type { Objective } from '@/models/objective.model.js';

// Services
import { recordLastUsedChannel } from '@/services/guildSettings.service.js';
import { getActiveObjectives, updateObjective } from '@/services/objective.service.js';

// Tasks
import { deletePreviousMessage, getMessage, sendMessageBatches } from '@/tasks/message.js';
import { getRelativeTime, isMaintenanceAdded, parseTimeInput } from '@/tasks/date.js';

// Utils
import { isDuplicateObjective } from '@/utils/duplicateCheck.js';
import {
  composeAutocompleteValue,
  computeFingerprint,
  decomposeAutocompleteValue,
} from '@/utils/objectiveFingerprint.js';
import { resolveObjectiveIndex } from '@/utils/objectiveIndex.js';
import {
  getMapZoneForType,
  getRarityFamilyForType,
  isValidTypeMapCombination,
  isValidTypeRarityCombination,
  MAPS_ALL_SORTED,
} from '@/utils/objectiveValidation.js';
import { resolveTimeBoundMinutes } from '@/utils/objectiveTimeBounds.js';
import { canModifyObjective } from '@/utils/permissions.js';
import { replyError } from '@/utils/reply.js';

dayjs.extend(utc);

interface EditableFields {
  type?: string;
  rarity?: string;
  map?: string;
  time?: Date;
  maintenanceAdded?: boolean;
}

export class EditObjectiveCommand extends Command {
  constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, {
      ...options,
      name: 'edit',
      description: 'Edit an existing objective',
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
        )
        .addStringOption((option: SlashCommandStringOption) =>
          option
            .setName('type')
            .setDescription('Type of objective')
            .setRequired(false)
            .setAutocomplete(true),
        )
        .addStringOption((option: SlashCommandStringOption) =>
          option
            .setName('rarity')
            .setDescription('Rarity/Tier/Portal size - n/a for Dragon')
            .setRequired(false)
            .setAutocomplete(true),
        )
        .addStringOption((option: SlashCommandStringOption) =>
          option
            .setName('map')
            .setDescription('Name of the map where the objective is')
            .setRequired(false)
            .setAutocomplete(true),
        )
        .addStringOption((option: SlashCommandStringOption) =>
          option
            .setName('time')
            .setDescription(
              'Time remaining. Accepted formats: 1:30, 02:30, 1h30, 1h30m, 1h 30, 1h 30m, 1h, 90, 45m, 90m',
            )
            .setRequired(false)
            .setAutocomplete(false),
        ),
    );
  }

  public override async autocompleteRun(
    interaction: Command.AutocompleteInteraction,
  ): Promise<void> {
    const focusedOption = interaction.options.getFocused(true);

    if (focusedOption.name === 'index') {
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

      return;
    }

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
    const rawIndex = interaction.options.getString('index');
    const newType = interaction.options.getString('type');
    const newRarity = interaction.options.getString('rarity');
    const newMap = interaction.options.getString('map');
    const newTime = interaction.options.getString('time');

    if (guildId && channelId) {
      void recordLastUsedChannel(guildId, channelId);
    }

    if (!guildId || !channelId || !rawIndex) {
      logger.error(
        {
          command: 'edit',
          guildId: guildId ?? undefined,
          rawIndex: rawIndex ?? undefined,
        },
        'Command missing required values',
      );

      await replyError(interaction, 'missingValues');

      return;
    }

    // The sentinel is not in RARITIES (AC-N6) but is a valid referential value.
    const rarityIsInvalid =
      newRarity !== null && newRarity !== RARITY_NONE && !RARITIES.includes(newRarity);

    if (
      (newType !== null && !TYPES.includes(newType)) ||
      rarityIsInvalid ||
      (newMap !== null && !MAPS.includes(newMap))
    ) {
      logger.error(
        {
          command: 'edit',
          type: newType,
          rarity: newRarity,
          map: newMap,
        },
        'Command received incorrect values',
      );

      await replyError(interaction, 'invalidValues');

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

    const fields: EditableFields = {};

    if (newType !== null) {
      fields.type = newType;
    }

    if (newRarity !== null) {
      fields.rarity = newRarity;
    }

    if (newMap !== null) {
      fields.map = newMap;
    }

    if (Object.keys(fields).length === 0 && newTime === null) {
      await interaction.reply({
        content: 'No changes were supplied, nothing to update.',
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    const resultingType = fields.type ?? objective.type;

    // Dragon admits no rarity: moving to it with none supplied writes the sentinel (AC-19),
    // replacing whatever rarity the objective previously carried.
    if (resultingType === TYPE_DRAGON && newRarity === null) {
      fields.rarity = RARITY_NONE;
    }

    const resultingRarity = fields.rarity ?? objective.rarity;
    const admitsRarity = getRarityFamilyForType(resultingType)?.has(RARITY_NONE) !== true;

    if (!admitsRarity && resultingRarity !== RARITY_NONE) {
      await replyError(interaction, 'unexpectedRarity');

      return;
    }

    // The sentinel is not a rarity: on a type that requires one, it counts as absence (AC-18).
    if (admitsRarity && resultingRarity === RARITY_NONE) {
      await replyError(interaction, 'missingRarity');

      return;
    }

    if (!isValidTypeMapCombination(resultingType, fields.map ?? objective.map)) {
      await replyError(interaction, 'unexpectedRoyalMap');

      return;
    }

    if (!isValidTypeRarityCombination(resultingType, resultingRarity)) {
      logger.error(
        {
          command: 'edit',
          type: resultingType,
          rarity: resultingRarity,
        },
        'Command received invalid resulting type/rarity combination',
      );

      await replyError(interaction, 'invalidTypeRarity');

      return;
    }

    let parsedTime: Date | undefined;
    const resultingTimeBoundMinutes = resolveTimeBoundMinutes(resultingType, resultingRarity);

    if (newTime !== null) {
      const parseResult = parseTimeInput(newTime, resultingTimeBoundMinutes);

      if (!parseResult.ok) {
        await replyError(
          interaction,
          parseResult.reason === 'range' ? 'timeOutOfRange' : 'invalidTimeFormat',
        );

        return;
      }

      const relativeTime = getRelativeTime(new Date(), newTime, resultingTimeBoundMinutes);

      parsedTime = relativeTime.toDate();
      fields.time = parsedTime;
      fields.maintenanceAdded = isMaintenanceAdded(relativeTime);
    } else {
      // AC-20: no `time` supplied, but the resulting type/rarity may narrow the cap below the
      // remaining time already stored. Only the absolute date persists — compare against it, not
      // against whatever delay was originally typed.
      const remainingMinutes = dayjs(objective.time).diff(dayjs(), 'minute');

      if (remainingMinutes > resultingTimeBoundMinutes) {
        await replyError(interaction, 'timeOutOfRange');

        return;
      }
    }

    const resultingMap = fields.map ?? objective.map;
    const resultingTime = parsedTime ?? objective.time;

    const isDuplicate = isDuplicateObjective(
      {
        guildId,
        type: resultingType,
        rarity: resultingRarity,
        map: resultingMap,
        time: resultingTime,
      },
      activeObjectives,
      { excludeId: objective.id },
    );

    if (isDuplicate) {
      logger.info(
        {
          guildId,
          type: resultingType,
          rarity: resultingRarity,
          map: resultingMap,
        },
        'Objective already exists',
      );

      await replyError(interaction, 'duplicateObjective');

      return;
    }

    const updated = await updateObjective(guildId, objective.id, fields);

    if (!updated) {
      await replyError(interaction, 'duplicateObjective');

      return;
    }

    const changes = this.describeChanges(objective, fields);

    await interaction.reply({
      content: `Your objective has been successfully updated!
${changes.join('\n')}`,
      flags: MessageFlags.Ephemeral,
    });

    if (channel) {
      await deletePreviousMessage(this.container.client, channel.id);

      const remainingObjectives = await getActiveObjectives(guildId);
      const batches = await getMessage(this.container.client, 'objective', remainingObjectives);

      await sendMessageBatches(channel as TextChannel, batches);
    }
  }

  private describeChanges(objective: Objective, fields: EditableFields): string[] {
    const changes: string[] = [];

    if (fields.type !== undefined && fields.type !== objective.type) {
      changes.push(`type: ${objective.type} → ${fields.type}`);
    }

    if (fields.rarity !== undefined && fields.rarity !== objective.rarity) {
      changes.push(`rarity: ${objective.rarity} → ${fields.rarity}`);
    }

    if (fields.map !== undefined && fields.map !== objective.map) {
      changes.push(`map: ${objective.map} → ${fields.map}`);
    }

    if (fields.time !== undefined) {
      const oldTime = dayjs(objective.time).utc().format('HH:mm');
      const newTime = dayjs(fields.time).utc().format('HH:mm');

      changes.push(`time: ${oldTime} → ${newTime}`);
    }

    return changes;
  }
}
