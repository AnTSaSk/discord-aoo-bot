import { SapphireClient } from '@sapphire/framework';

import { getClientOptions } from '@/config/clientOptions.js';
import { getDatabase } from '@/config/db.js';
import { getLogger } from '@/config/logger.js';
import { getRequiredSecret } from '@/utils/secrets.js';
import { performShutdown } from '@/utils/shutdown.js';
import { stopScheduledTask } from '@/tasks/cron.js';

// Load dotenv only in development
if (process.env.NODE_ENV !== 'production') {
  await import('dotenv/config');
}

interface Bot {
  client: SapphireClient;
}

let bot: Bot | undefined;

const main = async (): Promise<void> => {
  const logger = getLogger();
  let client: SapphireClient;
  const db = getDatabase();

  // Get Discord token from secret or env var
  const token = getRequiredSecret('APP_BOT_TOKEN', 'Discord bot token');

  if (!bot) {
    // Create a new client instance
    client = new SapphireClient(getClientOptions());

    try {
      await db.authenticate();
      logger.info('Connection has been established successfully');
    } catch (error) {
      logger.error(`Unable to connect to the database: ${String(error)}`);
      process.exit(1);
    }

    bot = {
      client,
    };
  }

  // Graceful shutdown handlers
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);

    await performShutdown(
      {
        logger,
        stopCron: stopScheduledTask,
        destroyClient: async () => {
          await bot?.client.destroy();
        },
        closeDb: async () => {
          await db.close();
        },
        exit: process.exit.bind(process),
      },
      signal,
    );
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });

  await bot.client.login(token);
};

void main();
