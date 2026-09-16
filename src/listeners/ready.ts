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

    void Promise.all([
      getObjectiveModel().sync(),
      getGuildSettingsModel().sync(),
    ])
      .then(async () => {
        logger.info('All models were synchronized successfully');

        // Broadcast reads guild_settings, so it must wait for the schema
        await broadcastAnnouncement(client);
      })
      .catch((error: unknown) => {
        logger.error(error, 'Failed to synchronize models or broadcast the announcement');
      });

    const scheduledTask = cron.schedule(CRON_SCHEDULE, () => {
      void cronTask(logger, client);
    });

    registerScheduledTask(scheduledTask);
  }
}
