import { Op, UniqueConstraintError, type FindOptions, type InferAttributes } from '@sequelize/core';

// Config
import { getLogger } from '@/config/logger.js';

// Constants
import { TYPES } from '@/constants/type.js';

// Models
import { getObjectiveModel, type Objective } from '@/models/objective.model.js';

export const findAllObjective = async (
  options?: FindOptions<InferAttributes<Objective>>,
): Promise<Objective[]> => {
  const logger = getLogger();
  const startTime = Date.now();

  try {
    const objectives = await getObjectiveModel().findAll(options);
    const duration = Date.now() - startTime;

    logger.debug(
      {
        count: objectives.length,
        duration,
        where: options?.where,
      },
      'findAllObjective completed',
    );

    return objectives;
  } catch (error) {
    logger.error({ error, options }, 'Failed to find objectives');

    throw error;
  }
};

export const getActiveObjectives = async (guildId: string): Promise<Objective[]> => {
  const logger = getLogger();
  const startTime = Date.now();

  try {
    const objectives = await getObjectiveModel().findAll({
      order: [['time', 'ASC']],
      where: { guildId, type: { [Op.in]: TYPES }, time: { [Op.gt]: new Date() } },
    });
    const duration = Date.now() - startTime;

    logger.debug(
      {
        guildId,
        count: objectives.length,
        duration,
      },
      'Found active objectives for guild',
    );

    return objectives;
  } catch (error) {
    logger.error({ error, guildId }, 'Failed to find active objectives by guild');

    throw error;
  }
};

export const findObjectiveById = async (id: string): Promise<Objective[]> => {
  const logger = getLogger();

  try {
    const objectives = await getObjectiveModel().findAll({ where: { id } });

    logger.debug({ id, found: objectives.length > 0 }, 'findObjectiveById completed');

    return objectives;
  } catch (error) {
    logger.error({ error, id }, 'Failed to find objective by ID');

    throw error;
  }
};

export const createObjective = async (
  data: Pick<
    Objective,
    'guildId' | 'channelId' | 'userId' | 'type' | 'rarity' | 'map' | 'time' | 'maintenanceAdded'
  >,
): Promise<Objective | null> => {
  const logger = getLogger();
  const startTime = Date.now();

  try {
    const objective = await getObjectiveModel().create({
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

    logger.info(
      {
        objectiveId: objective.id,
        guildId: data.guildId,
        type: data.type,
        rarity: data.rarity,
        map: data.map,
        duration,
      },
      'Objective created successfully',
    );

    return objective;
  } catch (error) {
    const loggedKeys = {
      guildId: data.guildId,
      channelId: data.channelId,
      type: data.type,
      rarity: data.rarity,
      map: data.map,
      time: data.time,
      maintenanceAdded: data.maintenanceAdded,
    };

    if (error instanceof UniqueConstraintError) {
      logger.info(loggedKeys, 'Duplicate objective rejected by DB constraint');

      return null;
    }

    logger.error({ error, ...loggedKeys }, 'Failed to create objective');

    throw error;
  }
};

export const updateObjective = async (
  guildId: string,
  id: number,
  fields: Partial<Pick<Objective, 'type' | 'rarity' | 'map' | 'time' | 'maintenanceAdded'>>,
): Promise<Objective | null> => {
  const logger = getLogger();
  const startTime = Date.now();

  try {
    const [, affectedRows] = await getObjectiveModel().update(fields, {
      where: { guildId, id },
      returning: true,
    });
    const duration = Date.now() - startTime;

    if (affectedRows.length === 0) {
      logger.warn({ guildId, objectiveId: id, fields }, 'updateObjective matched no row');

      throw new Error(`updateObjective: no objective matched guildId=${guildId} id=${String(id)}`);
    }

    logger.info({ guildId, objectiveId: id, fields, duration }, 'Objective updated successfully');

    return affectedRows[0];
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      logger.info(
        { guildId, objectiveId: id, fields },
        'Duplicate objective rejected by DB constraint',
      );

      return null;
    }

    logger.error({ error, guildId, objectiveId: id, fields }, 'Failed to update objective');

    throw error;
  }
};

export const deleteObjective = async (guildId: string, id: number): Promise<number> => {
  const logger = getLogger();

  try {
    const deletedCount = await getObjectiveModel().destroy({ where: { guildId, id } });

    if (deletedCount > 0) {
      logger.info({ guildId, objectiveId: id, deletedCount }, 'Objective deleted');
    } else {
      logger.warn({ guildId, objectiveId: id }, 'Objective not found for deletion');
    }

    return deletedCount;
  } catch (error) {
    logger.error({ error, guildId, objectiveId: id }, 'Failed to delete objective');

    throw error;
  }
};

export const deleteObjectivesByIds = async (ids: number[]): Promise<number> => {
  const logger = getLogger();

  if (ids.length === 0) {
    return 0;
  }

  try {
    const deletedCount = await getObjectiveModel().destroy({ where: { id: { [Op.in]: ids } } });

    logger.info({ ids, deletedCount }, 'Objectives batch deleted');

    return deletedCount;
  } catch (error) {
    logger.error({ error, ids }, 'Failed to batch delete objectives');

    throw error;
  }
};

export const deleteObjectivesByGuildId = async (guildId: string): Promise<number> => {
  const logger = getLogger();

  try {
    return await getObjectiveModel().destroy({ where: { guildId } });
  } catch (error) {
    logger.error({ error, guildId }, 'Failed to delete guild objectives');

    throw error;
  }
};
