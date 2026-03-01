import { Op, type FindOptions, type InferAttributes } from '@sequelize/core';

// Config
import { getLogger } from '@/config/logger.js';

// Models
import ObjectiveModel, { type Objective } from '@/models/objective.model.js';

export const findAllObjective = async (options?: FindOptions<InferAttributes<Objective>>): Promise<Objective[]> => {
  const logger = getLogger();
  const startTime = Date.now();

  try {
    const objectives = await ObjectiveModel.findAll(options);
    const duration = Date.now() - startTime;

    logger.debug({
      count: objectives.length,
      duration,
      where: options?.where,
    }, 'findAllObjective completed');

    return objectives;
  } catch (error) {
    logger.error({ error, options }, 'Failed to find objectives');

    throw error;
  }
};

export const findObjectiveByGuildId = async (guildId: string): Promise<Objective[]> => {
  const logger = getLogger();
  const startTime = Date.now();

  try {
    const objectives = await ObjectiveModel.findAll({
      order: [['time', 'ASC']],
      where: { guildId },
    });
    const duration = Date.now() - startTime;

    logger.debug({
      guildId,
      count: objectives.length,
      duration,
    }, 'Found objectives for guild');

    return objectives;
  } catch (error) {
    logger.error({ error, guildId }, 'Failed to find objectives by guild');

    throw error;
  }
};

export const findObjectiveById = async (id: string): Promise<Objective[]> => {
  const logger = getLogger();

  try {
    const objectives = await ObjectiveModel.findAll({ where: { id } });

    logger.debug({ id, found: objectives.length > 0 }, 'findObjectiveById completed');

    return objectives;
  } catch (error) {
    logger.error({ error, id }, 'Failed to find objective by ID');

    throw error;
  }
};

export const createObjective = async (
  data: Pick<Objective, 'guildId' | 'channelId' | 'userId' | 'type' | 'rarity' | 'map' | 'time' | 'maintenanceAdded'>,
): Promise<Objective> => {
  const logger = getLogger();
  const startTime = Date.now();

  try {
    const objective = await ObjectiveModel.create({
      guildId: data.guildId,
      channelId: data.channelId,
      userId: data.userId,
      type: data.type,
      rarity: data.rarity,
      map: data.map,
      time: data.time,
      maintenanceAdded: data.maintenanceAdded,
    });
    const duration = Date.now() - startTime;

    logger.info({
      objectiveId: objective.id,
      guildId: data.guildId,
      type: data.type,
      rarity: data.rarity,
      map: data.map,
      duration,
    }, 'Objective created successfully');

    return objective;
  } catch (error) {
    logger.error({ error, data }, 'Failed to create objective');

    throw error;
  }
};

export const deleteObjective = async (id: number): Promise<number> => {
  const logger = getLogger();

  try {
    const deletedCount = await ObjectiveModel.destroy({ where: { id } });

    if (deletedCount > 0) {
      logger.info({ objectiveId: id, deletedCount }, 'Objective deleted');
    } else {
      logger.warn({ objectiveId: id }, 'Objective not found for deletion');
    }

    return deletedCount;
  } catch (error) {
    logger.error({ error, objectiveId: id }, 'Failed to delete objective');

    throw error;
  }
};

export const deleteObjectivesByIds = async (ids: number[]): Promise<number> => {
  const logger = getLogger();

  if (ids.length === 0) {
    return 0;
  }

  try {
    const deletedCount = await ObjectiveModel.destroy({ where: { id: { [Op.in]: ids } } });

    logger.info({ ids, deletedCount }, 'Objectives batch deleted');

    return deletedCount;
  } catch (error) {
    logger.error({ error, ids }, 'Failed to batch delete objectives');

    throw error;
  }
};
