import { GatewayIntentBits, Options, type ClientOptions } from 'discord.js';

import { SWEEP_INTERVAL_SECONDS } from '@/constants/config.js';

// Slash-command-only bot: no feature reads message events, so intents/cache/partials
// stay reduced to Guilds and the message cache is capped at zero (see ADR-0009).
export const getClientOptions = (): ClientOptions => ({
  intents: [GatewayIntentBits.Guilds],
  makeCache: Options.cacheWithLimits({
    ...Options.DefaultMakeCacheSettings,
    MessageManager: 0,
  }),
  sweepers: {
    ...Options.DefaultSweeperSettings,
    users: {
      interval: SWEEP_INTERVAL_SECONDS,
      filter: () => (user) => user.id !== user.client.user.id,
    },
    guildMembers: {
      interval: SWEEP_INTERVAL_SECONDS,
      filter: () => (member) => member.user.id !== member.client.user.id,
    },
  },
});
