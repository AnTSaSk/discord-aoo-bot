import { Op } from '@sequelize/core';
import type { Guild, GuildBasedChannel, SendableChannels } from 'discord.js';
import type { SapphireClient } from '@sapphire/framework';

// Config
import { getLogger } from '@/config/logger.js';
import { runningVersion } from '@/config/version.js';

// Constants
import {
  ANNOUNCEMENTS,
  ANNOUNCEMENT_FALLBACK_NOTICE,
  type Announcement,
} from '@/constants/announcements.js';
import { ANNOUNCEMENT_BATCH_SIZE, ANNOUNCEMENT_BATCH_DELAY_MS } from '@/constants/config.js';

// Services
import {
  findGuildsAlreadyAnnounced,
  getGuildSettings,
  updateGuildSettings,
} from '@/services/guildSettings.service.js';
import { findAllObjective } from '@/services/objective.service.js';

// Utils
import {
  assertFitsWithEveryoneMention,
  forEachInBatches,
  resolveAnnouncementChannelId,
  withEveryoneMention,
} from '@/utils/announcementDelivery.js';
import { buildSectionedMessage, componentsV2Options } from '@/utils/componentsV2.js';
import { canBotWriteToChannel } from '@/utils/permissions.js';

type ChannelOrigin = 'configured' | 'fallback';

interface Target {
  guildId: string;
  channel: SendableChannels;
  origin: ChannelOrigin;
  mentionEveryone: boolean;
}

const compareVersions = (left: string, right: string): number => {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);

  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);

    if (difference !== 0) {
      return difference;
    }
  }

  return 0;
};

export const getAnnounceableVersion = (): Announcement | null => {
  if (ANNOUNCEMENTS.length === 0) {
    return null;
  }

  return [...ANNOUNCEMENTS].sort((a, b) => compareVersions(b.version, a.version))[0] ?? null;
};

const trailerOf = (announcement: Announcement, origin: ChannelOrigin): string[] => [
  `-# ${announcement.footer}`,
  ...(origin === 'fallback' ? [`-# ${ANNOUNCEMENT_FALLBACK_NOTICE}`] : []),
];

const seedLastUsedChannels = async (guildIds: string[]): Promise<Map<string, string>> => {
  const seeds = new Map<string, string>();

  if (guildIds.length === 0) {
    return seeds;
  }

  // One query for the whole fleet: a per-guild lookup would spend the same budget the pacing protects
  const objectives = await findAllObjective({
    where: { guildId: { [Op.in]: guildIds }, time: { [Op.gt]: new Date() } },
    order: [['time', 'ASC']],
  });

  const latestByGuild = new Map<string, Date>();

  for (const objective of objectives) {
    const known = latestByGuild.get(objective.guildId);

    if (!known || objective.time > known) {
      latestByGuild.set(objective.guildId, objective.time);
      seeds.set(objective.guildId, objective.channelId);
    }
  }

  return seeds;
};

const resolveChannel = async (
  guild: Guild,
  channelId: string,
): Promise<GuildBasedChannel | null> => {
  const cached = guild.channels.cache.get(channelId);

  if (cached) {
    return cached;
  }

  return guild.channels.fetch(channelId);
};

const sendTo = async (target: Target, announcement: Announcement): Promise<boolean> => {
  const logger = getLogger();

  try {
    const trailer = trailerOf(announcement, target.origin);

    if (target.mentionEveryone) {
      assertFitsWithEveryoneMention(announcement.title, announcement.sections, trailer);
    }

    const components = buildSectionedMessage(announcement.title, announcement.sections, trailer);

    await target.channel.send({
      components: target.mentionEveryone ? withEveryoneMention(components) : components,
      ...componentsV2Options(target.mentionEveryone),
    });

    return true;
  } catch (error) {
    logger.error(
      { error, guildId: target.guildId, channelId: target.channel.id },
      'Failed to send release announcement',
    );

    return false;
  }
};

export const broadcastAnnouncement = async (client: SapphireClient): Promise<void> => {
  const logger = getLogger();
  const announcement = getAnnounceableVersion();

  if (!announcement) {
    logger.info('No announcement declared, nothing to broadcast');

    return;
  }

  if (runningVersion === undefined) {
    logger.error(
      { announceableVersion: announcement.version },
      'Running version is unavailable, announcement skipped',
    );

    return;
  }

  if (announcement.version !== runningVersion) {
    logger.warn(
      { announceableVersion: announcement.version, runningVersion },
      'Announceable version differs from the running version, announcement skipped',
    );

    return;
  }

  const installedGuilds = [...client.guilds.cache.values()];

  // One query rules out every guild already announced, instead of one read per guild
  const alreadyAnnounced = new Set(await findGuildsAlreadyAnnounced(announcement.version));
  const guilds = installedGuilds.filter((guild) => !alreadyAnnounced.has(guild.id));

  if (guilds.length === 0) {
    logger.info(
      { version: announcement.version, guilds: installedGuilds.length },
      'Every guild already received this announcement',
    );

    return;
  }

  const settingsByGuild = new Map<string, Awaited<ReturnType<typeof getGuildSettings>>>();

  for (const guild of guilds) {
    settingsByGuild.set(guild.id, await getGuildSettings(guild.id));
  }

  const needSeeding = guilds
    .filter((guild) => !settingsByGuild.get(guild.id)?.lastUsedChannelId)
    .map((guild) => guild.id);
  const seeds = await seedLastUsedChannels(needSeeding);

  for (const [guildId, channelId] of seeds) {
    await updateGuildSettings(guildId, { lastUsedChannelId: channelId });
  }

  const targets: Target[] = [];

  for (const guild of guilds) {
    const settings = settingsByGuild.get(guild.id);

    if (!settings?.announcementsEnabled) {
      continue;
    }

    if (settings.lastAnnouncedVersion === announcement.version) {
      continue;
    }

    const configuredId = settings.announcementChannelId;
    const channelId = resolveAnnouncementChannelId({
      ...settings,
      lastUsedChannelId: settings.lastUsedChannelId ?? seeds.get(guild.id) ?? null,
    });

    if (!channelId) {
      logger.info({ guildId: guild.id }, 'No announcement target for guild, skipping');

      continue;
    }

    const channel = await resolveChannel(guild, channelId);

    if (!channel) {
      logger.warn({ guildId: guild.id, channelId }, 'Announcement channel could not be resolved');

      continue;
    }

    if (!channel.isSendable()) {
      logger.warn(
        { guildId: guild.id, channelId, type: channel.type },
        'Announcement target is not a channel the bot can post in',
      );

      continue;
    }

    const check = canBotWriteToChannel(channel, guild.members.me);

    if (!check.allowed) {
      logger.warn(
        { guildId: guild.id, channelId, missing: check.missing },
        'Cannot announce in channel, permission missing',
      );

      continue;
    }

    if (settings.mentionEveryone && !check.canMentionEveryone) {
      logger.warn(
        { guildId: guild.id, channelId },
        'Guild opted in to @everyone but the bot lacks MentionEveryone, sending without it',
      );
    }

    targets.push({
      guildId: guild.id,
      channel,
      origin: configuredId ? 'configured' : 'fallback',
      mentionEveryone: settings.mentionEveryone && check.canMentionEveryone,
    });
  }

  await forEachInBatches(
    targets,
    { size: ANNOUNCEMENT_BATCH_SIZE, delayMs: ANNOUNCEMENT_BATCH_DELAY_MS },
    async (target) => {
      const sent = await sendTo(target, announcement);

      if (sent) {
        await updateGuildSettings(target.guildId, {
          lastAnnouncedVersion: announcement.version,
        });
      }
    },
  );

  logger.info(
    {
      version: announcement.version,
      guilds: installedGuilds.length,
      considered: guilds.length,
      announced: targets.length,
    },
    'Release announcement broadcast completed',
  );
};
