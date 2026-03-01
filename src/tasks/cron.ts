import utc from 'dayjs/plugin/utc.js';
import dayjs from 'dayjs';
import { MessageFlags, type Client, type TextChannel } from 'discord.js';
import type { Logger } from 'pino';
import { Op } from '@sequelize/core';

// Services
import { deleteObjective, findAllObjective, findObjectiveByGuildId } from '@/services/objective.service.js';

// Tasks
import { deletePreviousMessage, getMessage } from '@/tasks/message.js';

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
    logger.debug('Fetching past objectives');

    const objectives = await findAllObjective({
      order: [['time', 'ASC']],
      where: { time: { [Op.lte]: now.toDate() } },
    });

    const guildData: GuildData[] = [];
    let deletedCount = 0;
    let errorCount = 0;

    // NO PAST OBJECTIVE
    if (objectives.length <= 0) {
      logger.debug('No past objectives to process');
    } else {
      logger.debug({ count: objectives.length }, 'Processing past objectives');

      // Delete objectives
      for (const objective of objectives) {
        try {
          await deleteObjective(objective.id);
          deletedCount++;

          if (!guildData.some((item) => item.guildId === objective.guildId)) {
            guildData.push({
              guildId: objective.guildId,
              channelId: objective.channelId,
            });
          }
        } catch (error) {
          errorCount++;
          logger.error({ error, objectiveId: objective.id }, 'Failed to delete objective');
        }
      }
    }

    // For all guilds that have an updated list, send a new message
    let messagesUpdated = 0;

    // FIX BUG: > 0 instead of >= 0
    if (guildData.length > 0) {
      logger.debug({ guildCount: guildData.length }, 'Updating guild messages');

      for (const data of guildData) {
        const channel = client.channels.cache.get(data.channelId);

        if (channel) {
          const guildObjectives = await findObjectiveByGuildId(data.guildId);

          await deletePreviousMessage(client, channel.id);

          logger.debug({
            guildId: data.guildId,
            channelId: data.channelId,
            objectivesCount: guildObjectives.length,
          }, 'Sending updated message to guild');

          if (guildObjectives.length > 0) {
            await (channel as TextChannel).send({
              components: getMessage(client, 'objective', guildObjectives),
              flags: MessageFlags.IsComponentsV2,
            });
          } else {
            await (channel as TextChannel).send({
              components: getMessage(client, 'empty'),
              flags: MessageFlags.IsComponentsV2,
            });
          }

          messagesUpdated++;
        }
      }
    }

    const duration = Date.now() - startTime;

    // Single summary log
    if (deletedCount > 0 || errorCount > 0 || messagesUpdated > 0) {
      logger.info({
        deletedObjectives: deletedCount,
        errors: errorCount,
        guildsUpdated: guildData.length,
        messagesUpdated,
        duration,
      }, 'Cron task completed with changes');
    } else {
      logger.debug({ duration }, 'Cron task completed - no changes');
    }
  } catch (error) {
    logger.error({ error }, 'Cron task failed');
  }
};
