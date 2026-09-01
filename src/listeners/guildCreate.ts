import type { Guild } from 'discord.js';
import { Listener } from '@sapphire/framework';

import { getLogger } from '@/config/logger.js';

export class GuildCreateListener extends Listener {
  constructor(context: Listener.LoaderContext, options: Listener.Options) {
    super(context, {
      ...options,
      event: 'guildCreate',
    });
  }

  public override run(guild: Guild): void {
    getLogger().info(
      { guildId: guild.id, name: guild.name, memberCount: guild.memberCount },
      'Bot joined a guild',
    );
  }
}
