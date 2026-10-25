import type { Client } from 'discord.js';

// Config
import { getLogger } from '@/config/logger.js';

// Services
import { clearGuildRemoval, listGuildRemovalStates, markGuildRemoved } from '@/services/guildSettings.service.js';

export const reconcileGuildRemovals = async (client: Client, now: Date): Promise<void> => {
  const logger = getLogger();
  const states = await listGuildRemovalStates();

  if (client.guilds.cache.size === 0) {
    if (states.length > 0) {
      logger.error(
        { recordCount: states.length },
        'Guild cache is empty while settings records exist, skipping removal reconciliation',
      );
    }

    return;
  }

  for (const { guildId, removedAt } of states) {
    const installed = client.guilds.cache.has(guildId);

    if (removedAt === null && !installed) {
      try {
        await markGuildRemoved(guildId, now);

        logger.info({ guildId }, 'Guild missing at startup marked as removed');
      } catch (error) {
        logger.error({ error, guildId }, 'Failed to mark missing guild as removed');
      }
    } else if (removedAt !== null && installed) {
      try {
        await clearGuildRemoval(guildId);

        logger.info({ guildId }, 'Guild present at startup cleared of its removal date');
      } catch (error) {
        logger.error({ error, guildId }, 'Failed to clear the guild removal date');
      }
    }
  }
};
