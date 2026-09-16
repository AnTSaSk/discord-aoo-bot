// Config
import { getLogger } from '@/config/logger.js';

// Models
import { getGuildSettingsModel, type GuildSettings } from '@/models/guildSettings.model.js';

export interface ResolvedGuildSettings {
  guildId: string;
  announcementChannelId: string | null;
  lastUsedChannelId: string | null;
  announcementsEnabled: boolean;
  mentionEveryone: boolean;
  lastAnnouncedVersion: string | null;
}

export type GuildSettingsFields = Partial<
  Pick<
    GuildSettings,
    'announcementChannelId' |
    'lastUsedChannelId' |
    'announcementsEnabled' |
    'mentionEveryone' |
    'lastAnnouncedVersion'
  >
>;

const DEFAULT_ANNOUNCEMENTS_ENABLED = true;
const DEFAULT_MENTION_EVERYONE = false;

export const getGuildSettings = async (guildId: string): Promise<ResolvedGuildSettings> => {
  const logger = getLogger();
  const startTime = Date.now();

  try {
    const record = await getGuildSettingsModel().findOne({ where: { guildId } });
    const duration = Date.now() - startTime;

    logger.debug(
      {
        guildId,
        found: record !== null,
        duration,
      },
      'getGuildSettings completed',
    );

    return {
      guildId,
      announcementChannelId: record?.announcementChannelId ?? null,
      lastUsedChannelId: record?.lastUsedChannelId ?? null,
      announcementsEnabled: record?.announcementsEnabled ?? DEFAULT_ANNOUNCEMENTS_ENABLED,
      mentionEveryone: record?.mentionEveryone ?? DEFAULT_MENTION_EVERYONE,
      lastAnnouncedVersion: record?.lastAnnouncedVersion ?? null,
    };
  } catch (error) {
    logger.error({ error, guildId }, 'Failed to read guild settings');

    throw error;
  }
};

export const updateGuildSettings = async (
  guildId: string,
  fields: GuildSettingsFields,
): Promise<void> => {
  const logger = getLogger();
  const startTime = Date.now();

  try {
    await getGuildSettingsModel().upsert({ guildId, ...fields });

    const duration = Date.now() - startTime;

    logger.info(
      {
        guildId,
        fields: Object.keys(fields),
        duration,
      },
      'Guild settings updated',
    );
  } catch (error) {
    logger.error({ error, guildId, fields: Object.keys(fields) }, 'Failed to update guild settings');

    throw error;
  }
};

export const recordLastUsedChannel = async (
  guildId: string,
  channelId: string,
): Promise<void> => {
  try {
    await updateGuildSettings(guildId, { lastUsedChannelId: channelId });
  } catch (error) {
    // Swallowed on purpose: a settings write must never fail the command that triggered it
    getLogger().warn({ error, guildId, channelId }, 'Failed to record last used channel');
  }
};

export const findGuildsAlreadyAnnounced = async (version: string): Promise<string[]> => {
  const logger = getLogger();
  const startTime = Date.now();

  try {
    const records = await getGuildSettingsModel().findAll({
      attributes: ['guildId'],
      where: { lastAnnouncedVersion: version },
    });
    const duration = Date.now() - startTime;

    logger.debug(
      { version, count: records.length, duration },
      'findGuildsAlreadyAnnounced completed',
    );

    return records.map((record) => record.guildId);
  } catch (error) {
    logger.error({ error, version }, 'Failed to list guilds already announced');

    throw error;
  }
};
