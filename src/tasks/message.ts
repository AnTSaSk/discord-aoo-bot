import utc from 'dayjs/plugin/utc.js';
import dayjs from 'dayjs';
import {
  type Guild,
  type Message,
  type TextBasedChannel,
  type TextChannel,
  DiscordAPIError,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from 'discord.js';
import type { SapphireClient } from '@sapphire/framework';

// Config
import { getLogger } from '@/config/logger.js';

// Utils
import { getRequiredSecret } from '@/utils/secrets.js';

dayjs.extend(utc);

import { MAX_COMPONENTS_PER_MESSAGE, MESSAGE_FETCH_LIMIT } from '@/constants/config.js';
import {
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
} from '@/constants/type.js';

// Models
import type { Objective } from '@/models/objective.model.js';

interface ObjectiveIndex {
  id: number;
  index: number;
}

type MessageComponent = TextDisplayBuilder | SeparatorBuilder;

const splitIntoBatches = (components: MessageComponent[]): MessageComponent[][] => {
  if (components.length <= MAX_COMPONENTS_PER_MESSAGE) {
    return [components];
  }

  const batches: MessageComponent[][] = [];

  for (let i = 0; i < components.length; i += MAX_COMPONENTS_PER_MESSAGE) {
    batches.push(components.slice(i, i + MAX_COMPONENTS_PER_MESSAGE));
  }

  return batches;
};

export const deletePreviousMessage = async (
  client: SapphireClient,
  channelId: string,
): Promise<void> => {
  const logger = getLogger();
  let deletedCount = 0;
  let failedCount = 0;

  try {
    // Phase 3: Try cache first, fetch from API if not cached
    let channel = client.channels.cache.get(channelId) as TextBasedChannel | undefined;

    if (!channel) {
      logger.info({ channelId }, 'Channel not in cache, fetching from API');

      const fetchedChannel = await client.channels.fetch(channelId);

      channel = fetchedChannel as TextBasedChannel | undefined;
    }

    if (!channel || !('messages' in channel)) {
      logger.warn({ channelId }, 'Channel not found or is not text-based');

      return;
    }

    // Fetch recent messages
    const messages = await channel.messages.fetch({ limit: MESSAGE_FETCH_LIMIT });

    const clientId = getRequiredSecret('APP_CLIENT_ID', 'Discord client ID');

    const botMessages = messages.filter((message: Message) => message.author.id === clientId);

    logger.info(
      {
        channelId,
        totalMessages: messages.size,
        botMessages: botMessages.size,
      },
      'Fetched messages for deletion',
    );

    for (const message of botMessages.values()) {
      if (!message.deletable) {
        logger.info({ messageId: message.id, channelId }, 'Message not deletable, skipping');
        continue;
      }

      try {
        await message.delete();

        deletedCount++;

        logger.debug({ messageId: message.id, channelId }, 'Successfully deleted bot message');
      } catch (error) {
        failedCount++;

        // Discriminate error types for better logging
        if (error instanceof DiscordAPIError) {
          switch (error.code) {
            case 10008:
              // Unknown Message - already deleted (not really an error)
              logger.info(
                { messageId: message.id, channelId, code: error.code },
                'Message already deleted',
              );
              break;

            case 50013:
            case 50001:
              // Missing Permissions / Missing Access
              logger.error(
                { messageId: message.id, channelId, code: error.code },
                'Missing permissions to delete message',
              );
              break;

            default:
              logger.warn(
                { error, messageId: message.id, channelId, code: error.code },
                'Discord API error during deletion',
              );
              break;
          }
        } else {
          logger.error(
            { error, messageId: message.id, channelId },
            'Unexpected error during message deletion',
          );
        }
      }
    }

    logger.info({ channelId, deletedCount, failedCount }, 'Completed message deletion');
  } catch (error) {
    logger.error({ error, channelId }, 'Failed to delete previous messages in channel');
  }
};

const UNKNOWN_AUTHOR = 'Unknown';

// Discord API error code for a member that is not part of the guild
const UNKNOWN_MEMBER_CODE = 10007;

const isUnknownMember = (error: unknown): boolean =>
  error instanceof DiscordAPIError && error.code === UNKNOWN_MEMBER_CODE;

const resolveAuthorName = async (
  client: SapphireClient,
  guild: Guild | undefined,
  userId: string,
  guildId: string,
): Promise<string> => {
  const logger = getLogger();

  if (guild) {
    try {
      const member = await guild.members.fetch(userId);

      return member.displayName;
    } catch (error) {
      if (!isUnknownMember(error)) {
        logger.warn({ error, guildId, userId }, 'Failed to resolve guild member');
      }
    }
  }

  try {
    const user = await client.users.fetch(userId);

    return user.displayName;
  } catch {
    return UNKNOWN_AUTHOR;
  }
};

const resolveAuthorNames = async (
  client: SapphireClient,
  data: Objective[],
): Promise<Map<string, string>> => {
  const names = new Map<string, string>();

  if (data.length === 0) {
    return names;
  }

  const logger = getLogger();
  const guildId = data[0].guildId;
  const userIds = [...new Set(data.map((objective) => objective.userId))];

  let guild: Guild | undefined;

  try {
    guild = await client.guilds.fetch(guildId);
  } catch (error) {
    logger.warn({ error, guildId }, 'Failed to resolve guild for author names');
  }

  const resolved = await Promise.all(
    userIds.map(async (userId) => ({
      userId,
      name: await resolveAuthorName(client, guild, userId, guildId),
    })),
  );

  for (const { userId, name } of resolved) {
    names.set(userId, name);
  }

  return names;
};

const displayObjective = (
  data: Objective[],
  authorNames: Map<string, string>,
): MessageComponent[] => {
  const content: MessageComponent[] = [];
  const objectiveIndex: ObjectiveIndex[] = [];

  data.forEach((objective, index) => {
    objectiveIndex.push({
      id: objective.id,
      index: index + 1,
    });
  });

  const objectiveNode = data.filter(
    (item) =>
      item.type === TYPE_NODE_FIBER ||
      item.type === TYPE_NODE_HIDE ||
      item.type === TYPE_NODE_ORE ||
      item.type === TYPE_NODE_WOOD,
  );
  const objectiveCore = data.filter((item) => item.type === TYPE_CORE);
  const objectiveVortex = data.filter((item) => item.type === TYPE_VORTEX);

  [objectiveNode, objectiveCore, objectiveVortex].forEach((category, categoryIndex) => {
    if (category.length > 0) {
      let categoryName = '';

      switch (categoryIndex) {
        case 0:
          categoryName = '## Node ##';
          break;
        case 1:
          categoryName = '## Core ##';
          break;
        case 2:
          categoryName = '## Vortex ##';
          break;
      }

      const textDisplayCategoryName = new TextDisplayBuilder().setContent(categoryName);

      content.push(textDisplayCategoryName);

      category.forEach((item) => {
        let objectiveRarity = '';

        // Prefix with emoji
        switch (item.rarity) {
          case RARITY_4_4:
          case RARITY_5_4:
          case RARITY_6_4:
          case RARITY_7_4:
          case RARITY_8_4:
            objectiveRarity = `**${item.rarity} ${item.type}**`;
            break;
          case RARITY_COMMON:
            objectiveRarity = `**:green_circle: ${item.rarity}**`;
            break;
          case RARITY_RARE:
            objectiveRarity = `**:blue_circle: ${item.rarity}**`;
            break;
          case RARITY_EPIC:
            objectiveRarity = `**:purple_circle: ${item.rarity}**`;
            break;
          case RARITY_LEGENDARY:
            objectiveRarity = `**:orange_circle: ${item.rarity}**`;
            break;
        }

        const itemData = objectiveIndex.find((o) => o.id === item.id);
        const maintenance = item.maintenanceAdded ? ':white_check_mark:' : ':x:';
        const authorName = authorNames.get(item.userId) ?? UNKNOWN_AUTHOR;

        const textDisplayList = new TextDisplayBuilder().setContent(
          `- #${String(itemData?.index ?? 0)} — ${objectiveRarity} —— **${dayjs(item.time).utc().format('HH:mm')}** UTC (<t:${String(dayjs(item.time).unix())}:R>) —— **${item.map}**
-# Maintenance added: ${maintenance} —— Objective added by ${authorName}`,
        );

        content.push(textDisplayList);
      });

      const separator = new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large);

      content.push(separator);
    }
  });

  return content;
};

const displayNoObjective = (): MessageComponent[] => {
  const content: MessageComponent[] = [];

  const title = new TextDisplayBuilder().setContent('## Objective Timers ##');

  content.push(title);

  const message = new TextDisplayBuilder().setContent(
    `There is no active timer.
Use command \`/add\` to create a new one!`,
  );

  content.push(message);

  return content;
};

export const sendMessageBatches = async (
  channel: TextChannel,
  batches: MessageComponent[][],
): Promise<void> => {
  for (const batch of batches) {
    await channel.send({
      components: batch,
      flags: MessageFlags.IsComponentsV2,
    });
  }
};

export const getMessage = async (
  client: SapphireClient,
  type: string,
  data?: Objective[],
): Promise<MessageComponent[][]> => {
  let content: MessageComponent[] = [];

  switch (type) {
    case 'objective': {
      const objectives = data ?? [];
      const authorNames = await resolveAuthorNames(client, objectives);

      content = displayObjective(objectives, authorNames);
      break;
    }
    case 'empty':
      content = displayNoObjective();
      break;
  }

  return splitIntoBatches(content);
};
