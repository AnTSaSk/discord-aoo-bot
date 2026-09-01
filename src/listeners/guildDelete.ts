import type { Guild } from 'discord.js';
import { Listener } from '@sapphire/framework';

import { getLogger } from '@/config/logger.js';

export class GuildDeleteListener extends Listener {
  constructor(context: Listener.LoaderContext, options: Listener.Options) {
    super(context, {
      ...options,
      event: 'guildDelete',
    });
  }

  public override run(guild: Guild): void {
    getLogger().info({ guildId: guild.id, name: guild.name }, 'Bot removed from a guild');
  }
}
