// Recreates every table from scratch. Destructive by design: development only.
// The bot creates missing tables on startup, so this script is never needed to deploy.

// Config
import { getDatabase } from '@/config/db.js';

// Models
import { getGuildSettingsModel } from '@/models/guildSettings.model.js';
import { getObjectiveModel } from '@/models/objective.model.js';

const TABLES = ['Objectives', 'GuildSettings'];

const run = async (): Promise<void> => {
  if (process.env.NODE_ENV === 'production') {
    process.stderr.write(
      `Refusing to run: this script drops every table and NODE_ENV is production.
The bot creates missing tables on startup, no manual sync is required.\n`,
    );
    process.exitCode = 1;

    return;
  }

  process.stdout.write(`Dropping and recreating: ${TABLES.join(', ')}\n`);

  await getObjectiveModel().sync({ force: true });
  await getGuildSettingsModel().sync({ force: true });

  process.stdout.write('Done. All previous rows are gone.\n');

  await getDatabase().close();
};

void run();
