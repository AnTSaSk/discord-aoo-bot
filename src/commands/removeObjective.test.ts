import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Command } from '@sapphire/framework';

import { RemoveObjectiveCommand } from '@/commands/removeObjective.js';
import { TYPE_CORE } from '@/constants/type.js';
import { RARITY_LEGENDARY } from '@/constants/rarity.js';
import { MAP_ELDERSLEEP, MAP_FARSHORE_BAY } from '@/constants/map.js';
import type { Objective } from '@/models/objective.model.js';

const {
  getActiveObjectivesMock,
  deleteObjectiveMock,
  canModifyObjectiveMock,
  recordLastUsedChannelMock,
  loggerMock,
} = vi.hoisted(() => ({
  getActiveObjectivesMock: vi.fn(),
  deleteObjectiveMock: vi.fn(),
  canModifyObjectiveMock: vi.fn(),
  recordLastUsedChannelMock: vi.fn().mockResolvedValue(undefined),
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

vi.mock('@/services/guildSettings.service.js', () => ({
  recordLastUsedChannel: recordLastUsedChannelMock,
}));

vi.mock('@/services/objective.service.js', () => ({
  getActiveObjectives: getActiveObjectivesMock,
  deleteObjective: deleteObjectiveMock,
}));

vi.mock('@/utils/permissions.js', () => ({
  canModifyObjective: canModifyObjectiveMock,
}));

vi.mock('@/tasks/message.js', () => ({
  deletePreviousMessage: vi.fn().mockResolvedValue(undefined),
  getMessage: vi.fn().mockResolvedValue([]),
  sendMessageBatches: vi.fn().mockResolvedValue(undefined),
}));

const buildObjective = (overrides: Partial<Objective>): Objective =>
  ({
    id: 1,
    guildId: 'guild-1',
    channelId: 'channel-1',
    userId: 'owner-1',
    type: TYPE_CORE,
    rarity: RARITY_LEGENDARY,
    map: MAP_ELDERSLEEP,
    time: new Date('2026-09-01T10:00:00.000Z'),
    maintenanceAdded: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as Objective;

interface FakeReplyPayload {
  content: string;
}

const buildInteraction = (
  index: string | null,
  options?: { userId?: string; guildChannel?: boolean },
): {
  interaction: Command.ChatInputCommandInteraction;
  reply: ReturnType<typeof vi.fn<(payload: FakeReplyPayload) => Promise<void>>>;
} => {
  const reply = vi.fn<(payload: FakeReplyPayload) => Promise<void>>().mockResolvedValue(undefined);
  const permissionsFor = vi.fn().mockReturnValue({ has: vi.fn().mockReturnValue(false) });
  const channel = {
    id: 'channel-1',
    permissionsFor,
  };

  const interaction = {
    guildId: 'guild-1',
    channelId: 'channel-1',
    channel: options?.guildChannel === false ? null : channel,
    user: { id: options?.userId ?? 'owner-1' },
    options: {
      getString: (name: string) => (name === 'index' ? index : null),
    },
    reply,
    client: {
      channels: {
        fetch: vi.fn().mockResolvedValue(channel),
      },
    },
  } as unknown as Command.ChatInputCommandInteraction;

  return { interaction, reply };
};

const createCommand = (): RemoveObjectiveCommand => {
  const command = Object.create(RemoveObjectiveCommand.prototype) as RemoveObjectiveCommand;

  Object.defineProperty(command, 'container', {
    value: {
      client: {
        channels: { fetch: vi.fn().mockResolvedValue({ id: 'channel-1' }) },
      },
    },
  });

  return command;
};

describe('RemoveObjectiveCommand — index resolution against the active list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canModifyObjectiveMock.mockReturnValue(true);
  });

  // objective-selection AC-3 / AC-1: regression test for the historical index/display mismatch.
  // An expired objective still sits ahead of the active ones in a naive full-list query;
  // resolving "#1" must hit the objective actually displayed as #1 (the active one), not
  // the expired objective that a full-list resolution would pick.
  it('removes the objective displayed at #1 when an expired objective precedes the active ones', async () => {
    const expired = buildObjective({
      id: 999,
      time: new Date('2020-01-01T00:00:00.000Z'),
      map: MAP_FARSHORE_BAY,
    });
    const displayedFirst = buildObjective({ id: 42, map: MAP_ELDERSLEEP });

    // getActiveObjectives is the single source of truth and must already exclude the expired one.
    getActiveObjectivesMock.mockResolvedValue([displayedFirst]);
    deleteObjectiveMock.mockResolvedValue(1);

    const command = createCommand();
    const { interaction } = buildInteraction('1');

    await command.chatInputRun(interaction);

    expect(deleteObjectiveMock).toHaveBeenCalledWith('guild-1', displayedFirst.id);
    expect(deleteObjectiveMock).not.toHaveBeenCalledWith('guild-1', expired.id);
  });

  // objective-selection AC-8: index out of active-list bounds is refused, nothing deleted.
  it('refuses an index beyond the active list bounds with objectiveNotFound and deletes nothing', async () => {
    getActiveObjectivesMock.mockResolvedValue([buildObjective({ id: 1 })]);

    const command = createCommand();
    const { interaction, reply } = buildInteraction('2');

    await command.chatInputRun(interaction);

    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('cannot find') as string }),
    );
    expect(deleteObjectiveMock).not.toHaveBeenCalled();
  });

  // objective-selection AC-8c: a fingerprint mismatch (list changed since autocomplete) is refused.
  it('refuses a stale fingerprint and deletes nothing', async () => {
    const current = buildObjective({
      id: 7,
      map: MAP_ELDERSLEEP,
      time: new Date('2026-09-01T10:00:00.000Z'),
    });

    getActiveObjectivesMock.mockResolvedValue([current]);

    const command = createCommand();
    // Fingerprint composed for a different map/time than the objective actually at index #1.
    const staleFingerprint = `${TYPE_CORE}|${RARITY_LEGENDARY}|${MAP_FARSHORE_BAY}|${String(new Date('2000-01-01T00:00:00.000Z').getTime())}`;
    const { interaction, reply } = buildInteraction(`1:${staleFingerprint}`);

    await command.chatInputRun(interaction);

    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('cannot find') as string }),
    );
    expect(deleteObjectiveMock).not.toHaveBeenCalled();
  });

  describe('permissions preserved through the migration', () => {
    it.each([
      ['Administrator', 'admin-1'],
      ['ManageMessages', 'moderator-1'],
      ['author', 'owner-1'],
    ])('allows a user satisfying %s to remove the objective', async (_label, userId) => {
      const objective = buildObjective({ id: 5, userId: 'owner-1' });

      getActiveObjectivesMock.mockResolvedValue([objective]);
      deleteObjectiveMock.mockResolvedValue(1);
      canModifyObjectiveMock.mockReturnValue(true);

      const command = createCommand();
      const { interaction } = buildInteraction('1', { userId });

      await command.chatInputRun(interaction);

      expect(deleteObjectiveMock).toHaveBeenCalledWith('guild-1', objective.id);
    });

    it('refuses a plain non-author user with permissionDenied and deletes nothing', async () => {
      const objective = buildObjective({ id: 5, userId: 'owner-1' });

      getActiveObjectivesMock.mockResolvedValue([objective]);
      canModifyObjectiveMock.mockReturnValue(false);

      const command = createCommand();
      const { interaction, reply } = buildInteraction('1', { userId: 'random-user' });

      await command.chatInputRun(interaction);

      expect(reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('permission') as string }),
      );
      expect(deleteObjectiveMock).not.toHaveBeenCalled();
    });
  });
});

describe('RemoveObjectiveCommand removal log line (logging AC-LOG-1, AC-LOG-2, AC-LOG-3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canModifyObjectiveMock.mockReturnValue(true);
    deleteObjectiveMock.mockResolvedValue(1);
  });

  it.each([
    ['the author', 'owner-1', true],
    ['another requester', 'moderator-1', false],
  ])(
    'logging AC-LOG-2 / AC-LOG-3 logs exactly the removal keys with removedByOwner computed for %s',
    async (_label, requesterId, removedByOwner) => {
      getActiveObjectivesMock.mockResolvedValue([buildObjective({ id: 5, userId: 'owner-1' })]);

      const { interaction } = buildInteraction('1', { userId: requesterId });

      await createCommand().chatInputRun(interaction);

      expect(loggerMock.info).toHaveBeenCalledWith(
        {
          guildId: 'guild-1',
          objectiveId: 5,
          objectiveType: TYPE_CORE,
          objectiveMap: MAP_ELDERSLEEP,
          removedByOwner,
        },
        'Objective removed successfully',
      );
    },
  );
});

describe('RemoveObjectiveCommand last used channel (guild-settings AC-9)', () => {
  it('records the interaction channel as the last one used by the guild', async () => {
    recordLastUsedChannelMock.mockClear();
    getActiveObjectivesMock.mockResolvedValue([]);

    const command = createCommand();
    const { interaction } = buildInteraction('1');

    await command.chatInputRun(interaction);

    expect(recordLastUsedChannelMock).toHaveBeenCalledWith('guild-1', 'channel-1');
  });
});
