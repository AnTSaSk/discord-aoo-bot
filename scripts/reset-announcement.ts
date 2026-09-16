// Clears the announced-version marker so the next startup broadcasts again.
// Development helper: the marker exists precisely to prevent replays in production.

// Config
import { getDatabase } from '@/config/db.js';

// Models
import { getGuildSettingsModel } from '@/models/guildSettings.model.js';

const run = async (): Promise<void> => {
  const model = getGuildSettingsModel();

  await model.sync();

  const [affected] = await model.update(
    { lastAnnouncedVersion: null },
    { where: {} },
  );

  process.stdout.write(`Cleared the announced version for ${String(affected)} guild(s).\n`);

  await getDatabase().close();
};

void run();
