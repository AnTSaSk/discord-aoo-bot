import type { Guild } from 'discord.js';
import { Listener } from '@sapphire/framework';

import { getLogger } from '@/config/logger.js';

// Services
import { markGuildRemoved } from '@/services/guildSettings.service.js';

export class GuildDeleteListener extends Listener {
  constructor(context: Listener.LoaderContext, options: Listener.Options) {
    super(context, {
      ...options,
      event: 'guildDelete',
    });
  }

  public override async run(guild: Guild): Promise<void> {
    const logger = getLogger();

    logger.info({ guildId: guild.id, name: guild.name }, 'Bot removed from a guild');

    if (!guild.available) {
      return;
    }

    try {
      await markGuildRemoved(guild.id, new Date());
    } catch (error) {
      logger.error({ error, guildId: guild.id }, 'Failed to mark the guild as removed');
    }
  }
}
