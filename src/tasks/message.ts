import utc from 'dayjs/plugin/utc.js';
import dayjs from 'dayjs';
import {
  type Message,
  type TextBasedChannel,
  DiscordAPIError,
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

// Constants
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

export const deletePreviousMessage = async (client: SapphireClient, channelId: string): Promise<void> => {
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
    const messages = await channel.messages.fetch({ limit: 10 });

    const clientId = getRequiredSecret('APP_CLIENT_ID', 'Discord client ID');

    const botMessages = messages.filter((message: Message) =>
      message.author.id === clientId,
    );

    logger.info({
      channelId,
      totalMessages: messages.size,
      botMessages: botMessages.size,
    }, 'Fetched messages for deletion');

    for (const message of botMessages.values()) {
      if (!message.deletable) {
        logger.info(
          { messageId: message.id, channelId },
          'Message not deletable, skipping',
        );
        continue;
      }

      try {
        await message.delete();

        deletedCount++;

        logger.debug(
          { messageId: message.id, channelId },
          'Successfully deleted bot message',
        );
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

    logger.info(
      { channelId, deletedCount, failedCount },
      'Completed message deletion',
    );
  } catch (error) {
    logger.error(
      { error, channelId },
      'Failed to delete previous messages in channel',
    );
  }
};

const displayObjective = (client: SapphireClient, data: Objective[]): MessageComponent[] => {
  const content: MessageComponent[] = [];
  const objectiveIndex: ObjectiveIndex[] = [];

  data.forEach((objective, index) => {
    objectiveIndex.push({
      id: objective.id,
      index: index + 1,
    });
  });

  const objectiveNode = data.filter((item) =>
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

      const textDisplayCategoryName = new TextDisplayBuilder()
        .setContent(categoryName);

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
        const user = client.users.cache.find((u) => u.id === item.userId);

        const textDisplayList = new TextDisplayBuilder()
          .setContent(
            `- #${String(itemData?.index ?? 0)} — ${objectiveRarity} —— **${dayjs(item.time).utc().format('HH:mm')}** UTC (<t:${String(dayjs(item.time).unix())}:R>) —— **${item.map}**
-# Maintenance added: ${maintenance} —— Objective added by ${user?.displayName ?? 'Unknown'}`,
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

export const getMessage = (client: SapphireClient, type: string, data?: Objective[]): MessageComponent[] => {
  let content: MessageComponent[] = [];

  switch (type) {
    case 'objective':
      content = displayObjective(client, data ?? []);
      break;
    case 'empty':
      content = displayNoObjective();
      break;
  }

  return content;
};
