import type { Client } from 'discord.js';
import { Listener } from '@sapphire/framework';
import cron from 'node-cron';

// Config
import { getLogger } from '@/config/logger.js';

// Models
import ObjectiveModel from '@/models/objective.model.js';

// Tasks
import { cronTask } from '@/tasks/cron.js';

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

    void ObjectiveModel.sync().then(() => {
      logger.info('All models were synchronized successfully');
    }).catch((error: unknown) => {
      logger.error(error, 'Failed to synchronize models');
    });

    cron.schedule('*/30 * * * *', () => {
      void cronTask(logger, client);
    });
  }
}
