import {
  DataTypes,
  type Model,
  type ModelStatic,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from '@sequelize/core';

// Config
import { getDatabase } from '@/config/db.js';

export interface GuildSettings extends Model<
  InferAttributes<GuildSettings>,
  InferCreationAttributes<GuildSettings>
> {
  id: CreationOptional<number>;
  guildId: string;
  announcementChannelId: CreationOptional<string | null>;
  lastUsedChannelId: CreationOptional<string | null>;
  announcementsEnabled: CreationOptional<boolean>;
  mentionEveryone: CreationOptional<boolean>;
  lastAnnouncedVersion: CreationOptional<string | null>;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
}

let instance: ModelStatic<GuildSettings> | undefined;

const defineGuildSettingsModel = (): ModelStatic<GuildSettings> =>
  getDatabase().define<GuildSettings>(
    'GuildSettings',
    {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      guildId: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      announcementChannelId: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      lastUsedChannelId: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      announcementsEnabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      mentionEveryone: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      lastAnnouncedVersion: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false,
      },
    },
    {
      indexes: [
        {
          unique: true,
          fields: ['guildId'],
          name: 'unique_guild_settings',
        },
      ],
    },
  );

export const getGuildSettingsModel = (): ModelStatic<GuildSettings> => {
  instance ??= defineGuildSettingsModel();

  return instance;
};
