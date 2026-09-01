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

export interface Objective extends Model<
  InferAttributes<Objective>,
  InferCreationAttributes<Objective>
> {
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

let instance: ModelStatic<Objective> | undefined;

const defineObjectiveModel = (): ModelStatic<Objective> => getDatabase().define<Objective>(
  'Objective',
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
  },
  {
    // Indexes for query optimization
    indexes: [
      { fields: ['guildId'] },
      { fields: ['time'] },
      { fields: ['guildId', 'time'] },
      { fields: ['guildId', 'channelId'] },
      {
        unique: true,
        fields: ['guildId', 'type', 'rarity', 'map', 'time'],
        name: 'unique_objective_per_guild',
      },
    ],
  },
);

export const getObjectiveModel = (): ModelStatic<Objective> => {
  instance ??= defineObjectiveModel();

  return instance;
};
