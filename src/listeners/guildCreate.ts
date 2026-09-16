import {
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  type Guild,
} from 'discord.js';
import { Listener } from '@sapphire/framework';

import { getLogger } from '@/config/logger.js';

// Constants
import { PRIVACY_URL, TERMS_URL, WEBSITE_URL } from '@/constants/config.js';

// Services
import { updateGuildSettings } from '@/services/guildSettings.service.js';

// Tasks
import { getAnnounceableVersion } from '@/tasks/announcement.js';

// Utils
import { resolveWelcomeChannel } from '@/utils/permissions.js';

const separator = (): SeparatorBuilder =>
  new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large);

const buildWelcomeComponents = (): (TextDisplayBuilder | SeparatorBuilder)[] => [
  new TextDisplayBuilder().setContent('## Thanks for adding Albion Online Objectives ##'),
  separator(),
  new TextDisplayBuilder().setContent(
    'Use `/add` to track your first objective, and `/list` to see what is running.',
  ),
  separator(),
  new TextDisplayBuilder().setContent(
    `An admin can set things up with \`/settings\`:
- \`/settings announcement-channel\` picks where release announcements land
- \`/settings announcements\` turns them on or off, with an optional \`@everyone\` mention`,
  ),
  separator(),
  new TextDisplayBuilder().setContent(
    '-# Nothing will ever ping `@everyone` unless an admin turns it on.',
  ),
  new TextDisplayBuilder().setContent(
    `-# [Website](${WEBSITE_URL}) · [Terms of Use](${TERMS_URL}) · [Privacy Policy](${PRIVACY_URL})`,
  ),
];

export class GuildCreateListener extends Listener {
  constructor(context: Listener.LoaderContext, options: Listener.Options) {
    super(context, {
      ...options,
      event: 'guildCreate',
    });
  }

  public override async run(guild: Guild): Promise<void> {
    const logger = getLogger();

    logger.info(
      { guildId: guild.id, name: guild.name, memberCount: guild.memberCount },
      'Bot joined a guild',
    );

    // A guild joining today must not receive announcements for versions published before it arrived
    const announcement = getAnnounceableVersion();

    if (announcement) {
      try {
        await updateGuildSettings(guild.id, { lastAnnouncedVersion: announcement.version });
      } catch (error) {
        logger.error({ error, guildId: guild.id }, 'Failed to mark published versions as announced');
      }
    }

    try {
      const channel = resolveWelcomeChannel(guild);

      if (!channel) {
        logger.info({ guildId: guild.id }, 'No writable channel to welcome the guild in');

        return;
      }

      await channel.send({
        components: buildWelcomeComponents(),
        flags: MessageFlags.IsComponentsV2,
      });
    } catch (error) {
      logger.error({ error, guildId: guild.id }, 'Failed to send the welcome message');
    }
  }
}
