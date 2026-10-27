import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Op, UniqueConstraintError } from '@sequelize/core';

import { TYPES } from '@/constants/type.js';
import { getObjectiveModel, type Objective } from '@/models/objective.model.js';
import {
  createObjective,
  deleteObjective,
  deleteObjectivesByGuildId,
  getActiveObjectives,
  updateObjective,
} from '@/services/objective.service.js';

const objectiveModelStub = {
  findAll: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  destroy: vi.fn(),
};

vi.mock('@/models/objective.model.js', () => ({
  getObjectiveModel: () => objectiveModelStub,
}));

const { loggerMock } = vi.hoisted(() => ({
  loggerMock: {
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  },
}));

vi.mock('@/config/logger.js', () => ({
  getLogger: () => loggerMock,
}));

const buildObjective = (
  overrides: Partial<Pick<Objective, 'id' | 'guildId' | 'time'>>,
): Objective =>
  ({
    id: overrides.id ?? 1,
    guildId: overrides.guildId ?? 'guild-1',
    time: overrides.time ?? new Date('2026-09-01T12:00:00Z'),
  }) as Objective;

const mockUpdateReturning = (): void => {
  vi.mocked(getObjectiveModel().update).mockResolvedValue([1, [buildObjective({ id: 42 })]] as never);
};

describe('getActiveObjectives', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('asks the database for objectives with time strictly greater than now, scoped to guildId (AC-1)', async () => {
    vi.mocked(getObjectiveModel().findAll).mockResolvedValue([]);

    await getActiveObjectives('guild-1');

    const callArgs = vi.mocked(getObjectiveModel().findAll).mock.calls[0]?.[0];
    const where = callArgs?.where as
      { guildId?: string; time?: Record<symbol, unknown> } | undefined;

    expect(where?.guildId).toBe('guild-1');
    expect(where?.time?.[Op.gt]).toBeInstanceOf(Date);
  });

  it('objective-selection AC-1b: restricts the query itself to the tracked types referential, alongside guildId and time', async () => {
    vi.mocked(getObjectiveModel().findAll).mockResolvedValue([]);

    await getActiveObjectives('guild-1');

    const callArgs = vi.mocked(getObjectiveModel().findAll).mock.calls[0]?.[0];
    const where = callArgs?.where as
      {
        guildId?: string;
        time?: Record<symbol, unknown>;
        type?: Record<symbol, unknown>;
      } | undefined;

    expect(where?.guildId).toBe('guild-1');
    expect(where?.time?.[Op.gt]).toBeInstanceOf(Date);
    expect(where?.type?.[Op.in]).toEqual(TYPES);
  });

  it('includes an objective whose time is in the future (AC-1)', async () => {
    const past = buildObjective({ id: 1, time: new Date('2026-01-01T00:00:00Z') });
    const future = buildObjective({ id: 2, time: new Date('2099-01-01T00:00:00Z') });

    vi.mocked(getObjectiveModel().findAll).mockResolvedValue([past, future]);

    const result: Objective[] = await getActiveObjectives('guild-1');

    expect(result.map((o) => o.id)).toContain(future.id);
  });

  it('asks the database to order results by time ascending (AC-1)', async () => {
    vi.mocked(getObjectiveModel().findAll).mockResolvedValue([]);

    await getActiveObjectives('guild-1');

    const callArgs = vi.mocked(getObjectiveModel().findAll).mock.calls[0]?.[0];

    expect(callArgs?.order).toContainEqual(['time', 'ASC']);
  });

  it('never returns an objective belonging to another guild (multi-server isolation, AC-1)', async () => {
    vi.mocked(getObjectiveModel().findAll).mockResolvedValue([]);

    await getActiveObjectives('guild-1');

    const callArgs = vi.mocked(getObjectiveModel().findAll).mock.calls[0]?.[0];

    expect(callArgs?.where).toMatchObject({ guildId: 'guild-1' });
  });

  it('returns an empty list, not an error, when there are no active objectives (AC-1)', async () => {
    vi.mocked(getObjectiveModel().findAll).mockResolvedValue([]);

    const result: Objective[] = await getActiveObjectives('guild-1');

    expect(result).toEqual([]);
  });
});

describe('updateObjective', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends only the provided field to the update payload, omitting fields not supplied (AC-7/AC-8)', async () => {
    mockUpdateReturning();

    await updateObjective('guild-1', 42, { map: 'Thetford' });

    const values = vi.mocked(getObjectiveModel().update).mock.calls[0]?.[0] as Record<string, unknown>;

    expect(values).toHaveProperty('map', 'Thetford');
    expect(values).not.toHaveProperty('type');
    expect(values).not.toHaveProperty('rarity');
    expect(values).not.toHaveProperty('time');
  });

  it('scopes the update by guildId and the target objective id, never guild-wide (AC-12)', async () => {
    mockUpdateReturning();

    await updateObjective('guild-1', 42, { map: 'Thetford' });

    const options = vi.mocked(getObjectiveModel().update).mock.calls[0]?.[1] as
      { where?: Record<string, unknown> } | undefined;

    expect(options?.where).toMatchObject({ guildId: 'guild-1', id: 42 });
  });

  it('translates a UniqueConstraintError raised by the write into the same outcome createObjective returns for a duplicate (AC-6b)', async () => {
    vi.mocked(getObjectiveModel().update).mockRejectedValue(new UniqueConstraintError({ errors: [] }));

    const result = await updateObjective('guild-1', 42, { map: 'Thetford' });

    expect(result).toBeNull();
  });

  it('propagates an error unrelated to the unique constraint instead of swallowing it (AC-6b)', async () => {
    vi.mocked(getObjectiveModel().update).mockRejectedValue(new Error('connection lost'));

    await expect(updateObjective('guild-1', 42, { map: 'Thetford' })).rejects.toThrow(
      'connection lost',
    );
  });

  it('includes maintenanceAdded in the update payload when time is provided (AC-7)', async () => {
    mockUpdateReturning();

    await updateObjective('guild-1', 42, {
      time: new Date('2026-09-01T14:20:00Z'),
      maintenanceAdded: true,
    });

    const values = vi.mocked(getObjectiveModel().update).mock.calls[0]?.[0] as Record<string, unknown>;

    expect(values).toHaveProperty('time', new Date('2026-09-01T14:20:00Z'));
    expect(values).toHaveProperty('maintenanceAdded', true);
  });

  it('omits maintenanceAdded from the update payload when time is not provided (AC-8)', async () => {
    mockUpdateReturning();

    await updateObjective('guild-1', 42, { map: 'Thetford' });

    const values = vi.mocked(getObjectiveModel().update).mock.calls[0]?.[0] as Record<string, unknown>;

    expect(values).not.toHaveProperty('maintenanceAdded');
  });
});

describe('createObjective log lines (logging AC-LOG-1, AC-LOG-2)', () => {
  const creationData = {
    guildId: 'guild-1',
    channelId: 'channel-1',
    userId: 'user-1',
    type: 'Core',
    rarity: 'Legendary',
    map: 'Thetford',
    time: new Date('2026-09-01T12:00:00Z'),
    maintenanceAdded: false,
  };

  const loggedKeys = {
    guildId: 'guild-1',
    channelId: 'channel-1',
    type: 'Core',
    rarity: 'Legendary',
    map: 'Thetford',
    time: new Date('2026-09-01T12:00:00Z'),
    maintenanceAdded: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logging AC-LOG-2 logs exactly the inventory keys of a duplicate rejected by the DB constraint', async () => {
    vi.mocked(getObjectiveModel().create).mockRejectedValue(new UniqueConstraintError({ errors: [] }));

    await expect(createObjective(creationData)).resolves.toBeNull();

    expect(loggerMock.info).toHaveBeenCalledWith(loggedKeys, 'Duplicate objective rejected by DB constraint');
  });

  it('logging AC-LOG-2 logs exactly the error and the inventory keys when the creation fails', async () => {
    const failure = new Error('connection lost');

    vi.mocked(getObjectiveModel().create).mockRejectedValue(failure);

    await expect(createObjective(creationData)).rejects.toThrow('connection lost');

    expect(loggerMock.error).toHaveBeenCalledWith({ error: failure, ...loggedKeys }, 'Failed to create objective');
  });
});

describe('deleteObjective', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('scopes the delete by guildId and the target objective id, never guild-wide (AC-12)', async () => {
    vi.mocked(getObjectiveModel().destroy).mockResolvedValue(1);

    await deleteObjective('guild-1', 42);

    const options = vi.mocked(getObjectiveModel().destroy).mock.calls[0]?.[0] as
      { where?: Record<string, unknown> } | undefined;

    expect(options?.where).toMatchObject({ guildId: 'guild-1', id: 42 });
  });
});

describe('deleteObjectivesByGuildId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('AC-PURGE-7: destroys only the objectives of the requested guild', async () => {
    vi.mocked(getObjectiveModel().destroy).mockResolvedValue(3);

    await deleteObjectivesByGuildId('guild-42');

    expect(getObjectiveModel().destroy).toHaveBeenCalledTimes(1);
    expect(getObjectiveModel().destroy).toHaveBeenCalledWith({ where: { guildId: 'guild-42' } });
  });

  it('AC-PURGE-8: returns the number of destroyed objectives', async () => {
    vi.mocked(getObjectiveModel().destroy).mockResolvedValue(3);

    await expect(deleteObjectivesByGuildId('guild-42')).resolves.toBe(3);
  });
});
