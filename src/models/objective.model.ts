import { DataTypes, type Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from '@sequelize/core';

// Config
import database from '@/config/db.js';

export interface Objective extends Model<InferAttributes<Objective>, InferCreationAttributes<Objective>> {
  id: CreationOptional<number>;
  guildId: string;
  channelId: string;
  userId: string;
  type: string;
  rarity: string;
  map: string;
  time: Date;
  maintenanceAdded: boolean;
  createdAt: CreationOptional<Date>;
  updatedAt: CreationOptional<Date>;
}

export const ObjectiveModel = database.define<Objective>('Objective', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  guildId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  channelId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  userId: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  type: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  rarity: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  map: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  time: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  maintenanceAdded: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
  },
}, {
  // Indexes for query optimization
  indexes: [
    { fields: ['guildId'] },
    { fields: ['time'] },
    { fields: ['guildId', 'time'] },
    { fields: ['guildId', 'channelId'] },
  ],
});

export default ObjectiveModel;
