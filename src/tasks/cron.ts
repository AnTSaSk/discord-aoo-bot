import utc from 'dayjs/plugin/utc.js';
import dayjs from 'dayjs';
import { type Client, type TextChannel } from 'discord.js';
import type { Logger } from 'pino';
import { Op } from '@sequelize/core';

// Config
import database from '@/config/db.js';

// Models
import ObjectiveModel from '@/models/objective.model.js';

// Services
import { findObjectiveByGuildId } from '@/services/objective.service.js';

// Tasks
import { deletePreviousMessage, getMessage, sendMessageBatches } from '@/tasks/message.js';

dayjs.extend(utc);

interface GuildData {
  guildId: string;
  channelId: string;
}

export const cronTask = async (logger: Logger, client: Client<true>): Promise<void> => {
  const startTime = Date.now();
  const now = dayjs().utc();

  logger.debug('Cron task started');

  try {
    // Atomic fetch + delete in a single transaction
    const { deletedCount, guildData } = await database.transaction(async (transaction) => {
      const objectives = await ObjectiveModel.findAll({
        where: { time: { [Op.lte]: now.toDate() } },
        order: [['time', 'ASC']],
        transaction,
      });

      if (objectives.length === 0) {
        logger.debug('No past objectives to process');

        return { deletedCount: 0, guildData: [] as GuildData[] };
      }

      logger.debug({ count: objectives.length }, 'Processing past objectives');

      // Collect unique guild/channel pairs
      const guildMap = new Map<string, GuildData>();

      for (const objective of objectives) {
        if (!guildMap.has(objective.guildId)) {
          guildMap.set(objective.guildId, {
            guildId: objective.guildId,
            channelId: objective.channelId,
          });
        }
      }

      // Batch delete all expired objectives in one query
      const deleted = await ObjectiveModel.destroy({
        where: { time: { [Op.lte]: now.toDate() } },
        transaction,
      });

      return { deletedCount: deleted, guildData: [...guildMap.values()] };
    });

    // Update messages for affected guilds (outside transaction — Discord API calls)
    let messagesUpdated = 0;

    if (guildData.length > 0) {
      logger.debug({ guildCount: guildData.length }, 'Updating guild messages');

      for (const data of guildData) {
        const channel = client.channels.cache.get(data.channelId);

        if (channel) {
          const guildObjectives = await findObjectiveByGuildId(data.guildId);

          await deletePreviousMessage(client, channel.id);

          logger.debug(
            {
              guildId: data.guildId,
              channelId: data.channelId,
              objectivesCount: guildObjectives.length,
            },
            'Sending updated message to guild',
          );

          if (guildObjectives.length > 0) {
            const batches = getMessage(client, 'objective', guildObjectives);

            await sendMessageBatches(channel as TextChannel, batches);
          } else {
            const batches = getMessage(client, 'empty');

            await sendMessageBatches(channel as TextChannel, batches);
          }

          messagesUpdated++;
        }
      }
    }

    const duration = Date.now() - startTime;

    if (deletedCount > 0 || messagesUpdated > 0) {
      logger.info(
        {
          deletedObjectives: deletedCount,
          guildsUpdated: guildData.length,
          messagesUpdated,
          duration,
        },
        'Cron task completed with changes',
      );
    } else {
      logger.debug({ duration }, 'Cron task completed - no changes');
    }
  } catch (error) {
    logger.error({ error }, 'Cron task failed');
  }
};
