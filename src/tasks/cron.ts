import utc from 'dayjs/plugin/utc.js';
import dayjs from 'dayjs';
import { type Client, type TextChannel } from 'discord.js';
import type { Logger } from 'pino';
import type { ScheduledTask } from 'node-cron';
import { Op } from '@sequelize/core';

// Config
import { getDatabase } from '@/config/db.js';
import { getLogger } from '@/config/logger.js';

// Constants
import { GUILD_PURGE_GRACE_PERIOD_DAYS } from '@/constants/config.js';

// Models
import { getObjectiveModel } from '@/models/objective.model.js';

// Services
import {
  clearGuildRemoval,
  deleteGuildSettings,
  findGuildsRemovedBefore,
} from '@/services/guildSettings.service.js';
import { deleteObjectivesByGuildId, getActiveObjectives } from '@/services/objective.service.js';

// Tasks
import { deletePreviousMessage, getMessage, sendMessageBatches } from '@/tasks/message.js';

dayjs.extend(utc);

interface GuildData {
  guildId: string;
  channelId: string;
}

let scheduledTask: ScheduledTask | undefined;

export const registerScheduledTask = (task: ScheduledTask): void => {
  scheduledTask = task;
};

export const stopScheduledTask = async (): Promise<void> => {
  if (!scheduledTask) {
    return;
  }

  const task = scheduledTask;

  scheduledTask = undefined;
  await task.stop();
};

export const purgeRemovedGuilds = async (
  now: Date,
  isBotMember: (guildId: string) => boolean,
): Promise<void> => {
  const logger = getLogger();
  const threshold = dayjs.utc(now).subtract(GUILD_PURGE_GRACE_PERIOD_DAYS, 'day').toDate();
  let guildIds: string[];

  try {
    guildIds = await findGuildsRemovedBefore(threshold);
  } catch (error) {
    logger.error({ error, threshold }, 'Failed to select removed guilds to purge');

    return;
  }

  for (const guildId of guildIds) {
    try {
      // A removal date left behind by a failed clear on re-invite must never purge a live guild
      if (isBotMember(guildId)) {
        await clearGuildRemoval(guildId);

        logger.warn({ guildId }, 'Skipped purge of a guild the bot is a member of, removal date cleared');

        continue;
      }

      // Settings go last: they carry removedAt, so a failed run is retried on the next pass
      const deletedObjectives = await deleteObjectivesByGuildId(guildId);

      await deleteGuildSettings(guildId);

      logger.info({ guildId, deletedObjectives }, 'Removed guild data purged');
    } catch (error) {
      logger.error({ error, guildId }, 'Failed to purge removed guild data');
    }
  }
};

export const cronTask = async (logger: Logger, client: Client<true>): Promise<void> => {
  const startTime = Date.now();
  const now = dayjs().utc();

  logger.debug('Cron task started');

  try {
    // Atomic fetch + delete in a single transaction
    const { deletedCount, guildData } = await getDatabase().transaction(async (transaction) => {
      const objectives = await getObjectiveModel().findAll({
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
      const deleted = await getObjectiveModel().destroy({
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
          const guildObjectives = await getActiveObjectives(data.guildId);

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
            const batches = await getMessage(client, 'objective', guildObjectives);

            await sendMessageBatches(channel as TextChannel, batches);
          } else {
            const batches = await getMessage(client, 'empty');

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

  await purgeRemovedGuilds(now.toDate(), (guildId) => client.guilds.cache.has(guildId));
};
