import { Op } from '@sequelize/core';

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
  readonly removedAt: Date | null;
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
      removedAt: record?.removedAt ?? null,
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

export const markGuildRemoved = async (guildId: string, removedAt: Date): Promise<void> => {
  const logger = getLogger();

  try {
    await getGuildSettingsModel().upsert({ guildId, removedAt });

    logger.info({ guildId, removedAt }, 'Guild marked as removed');
  } catch (error) {
    logger.error({ error, guildId }, 'Failed to mark guild as removed');

    throw error;
  }
};

export const clearGuildRemoval = async (guildId: string): Promise<void> => {
  const logger = getLogger();

  try {
    const [affectedCount] = await getGuildSettingsModel().update(
      { removedAt: null },
      { where: { guildId } },
    );

    logger.debug({ guildId, affectedCount }, 'clearGuildRemoval completed');
  } catch (error) {
    logger.error({ error, guildId }, 'Failed to clear guild removal');

    throw error;
  }
};

export const findGuildsRemovedBefore = async (threshold: Date): Promise<string[]> => {
  const logger = getLogger();

  try {
    const records = await getGuildSettingsModel().findAll({
      attributes: ['guildId'],
      where: { removedAt: { [Op.lt]: threshold } },
    });

    logger.debug({ threshold, count: records.length }, 'findGuildsRemovedBefore completed');

    return records.map((record) => record.guildId);
  } catch (error) {
    logger.error({ error, threshold }, 'Failed to list guilds removed before threshold');

    throw error;
  }
};

export const listGuildRemovalStates = async (): Promise<
  { guildId: string; removedAt: Date | null }[]
> => {
  const logger = getLogger();

  try {
    const records = await getGuildSettingsModel().findAll({
      attributes: ['guildId', 'removedAt'],
    });

    logger.debug({ count: records.length }, 'listGuildRemovalStates completed');

    return records.map((record) => ({ guildId: record.guildId, removedAt: record.removedAt }));
  } catch (error) {
    logger.error({ error }, 'Failed to list guild removal states');

    throw error;
  }
};

export const deleteGuildSettings =async (guildId: string): Promise<void> => {
  const logger = getLogger();

  try {
    await getGuildSettingsModel().destroy({ where: { guildId } });
  } catch (error) {
    logger.error({ error, guildId }, 'Failed to delete guild settings');

    throw error;
  }
};
