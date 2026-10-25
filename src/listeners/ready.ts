import type { Client } from 'discord.js';
import { Listener } from '@sapphire/framework';
import cron from 'node-cron';

// Config
import { getLogger } from '@/config/logger.js';

// Models
import { getGuildSettingsModel } from '@/models/guildSettings.model.js';
import { getObjectiveModel } from '@/models/objective.model.js';

// Constants
import { CRON_SCHEDULE } from '@/constants/config.js';

// Tasks
import { broadcastAnnouncement } from '@/tasks/announcement.js';
import { cronTask, registerScheduledTask } from '@/tasks/cron.js';
import { reconcileGuildRemovals } from '@/tasks/retentionReconcile.js';

export class ReadyListener extends Listener {
  constructor(context: Listener.LoaderContext, options: Listener.Options) {
    super(context, {
      ...options,
      once: true,
      event: 'clientReady',
    });
  }

  public override run(client: Client<true>): void {
    const logger = getLogger();
    const { displayName } = client.user;

    logger.info(`Logged in as ${displayName}`);

    const scheduleCron = (): void => {
      const scheduledTask = cron.schedule(CRON_SCHEDULE, () => {
        void cronTask(logger, client);
      });

      registerScheduledTask(scheduledTask);
    };

    const startup = async (): Promise<void> => {
      try {
        await Promise.all([
          getObjectiveModel().sync(),
          getGuildSettingsModel().sync(),
        ]);
      } catch (error) {
        logger.error(error, 'Failed to synchronize models');
        scheduleCron();

        return;
      }

      logger.info('All models were synchronized successfully');

      try {
        await reconcileGuildRemovals(client, new Date());
      } catch (error) {
        logger.error(error, 'Failed to reconcile guild removals');
      }

      scheduleCron();

      try {
        // Broadcast reads guild_settings, so it must wait for the schema
        await broadcastAnnouncement(client);
      } catch (error) {
        logger.error(error, 'Failed to broadcast the announcement');
      }
    };

    void startup();
  }
}
