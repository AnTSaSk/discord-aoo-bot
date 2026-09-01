import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Command } from '@sapphire/framework';

import { EditObjectiveCommand } from '@/commands/editObjective.js';
import { TYPE_CORE, TYPE_NODE_ORE } from '@/constants/type.js';
import { RARITY_LEGENDARY, RARITY_4_4 } from '@/constants/rarity.js';
import { MAP_ELDERSLEEP, MAP_FARSHORE_BAY } from '@/constants/map.js';
import type { Objective } from '@/models/objective.model.js';

const {
  getActiveObjectivesMock,
  updateObjectiveMock,
  canModifyObjectiveMock,
  isDuplicateObjectiveMock,
  deletePreviousMessageMock,
  getMessageMock,
  sendMessageBatchesMock,
} = vi.hoisted(() => ({
  getActiveObjectivesMock: vi.fn(),
  updateObjectiveMock: vi.fn(),
  canModifyObjectiveMock: vi.fn(),
  isDuplicateObjectiveMock: vi.fn(),
  deletePreviousMessageMock: vi.fn().mockResolvedValue(undefined),
  getMessageMock: vi.fn().mockResolvedValue([]),
  sendMessageBatchesMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/objective.service.js', () => ({
  getActiveObjectives: getActiveObjectivesMock,
  updateObjective: updateObjectiveMock,
}));

vi.mock('@/utils/permissions.js', () => ({
  canModifyObjective: canModifyObjectiveMock,
}));

vi.mock('@/utils/duplicateCheck.js', () => ({
  isDuplicateObjective: isDuplicateObjectiveMock,
}));

vi.mock('@/tasks/message.js', () => ({
  deletePreviousMessage: deletePreviousMessageMock,
  getMessage: getMessageMock,
  sendMessageBatches: sendMessageBatchesMock,
}));

const baseTime = new Date('2026-09-01T10:00:00.000Z');

const buildObjective = (overrides: Partial<Objective>): Objective =>
  ({
    id: 10,
    guildId: 'guild-1',
    channelId: 'channel-1',
    userId: 'owner-1',
    type: TYPE_CORE,
    rarity: RARITY_LEGENDARY,
    map: MAP_ELDERSLEEP,
    time: baseTime,
    maintenanceAdded: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as Objective;

const fingerprintFor = (objective: Objective): string =>
  `${objective.type}|${objective.rarity}|${objective.map}|${String(objective.time.getTime())}`;

interface FakeReplyPayload {
  content: string;
}

const buildInteraction = (options: {
  index: string | null;
  type?: string | null;
  rarity?: string | null;
  map?: string | null;
  time?: string | null;
  userId?: string;
}): {
  interaction: Command.ChatInputCommandInteraction;
  reply: ReturnType<typeof vi.fn<(payload: FakeReplyPayload) => Promise<void>>>;
} => {
  const reply = vi.fn<(payload: FakeReplyPayload) => Promise<void>>().mockResolvedValue(undefined);
  const permissionsFor = vi.fn().mockReturnValue({ has: vi.fn().mockReturnValue(false) });
  const channel = { id: 'channel-1', permissionsFor };

  const interaction = {
    guildId: 'guild-1',
    channelId: 'channel-1',
    channel,
    user: { id: options.userId ?? 'owner-1' },
    options: {
      getString: (name: string) => {
        switch (name) {
          case 'index':
            return options.index;
          case 'type':
            return options.type ?? null;
          case 'rarity':
            return options.rarity ?? null;
          case 'map':
            return options.map ?? null;
          case 'time':
            return options.time ?? null;
          default:
            return null;
        }
      },
    },
    reply,
    client: {
      channels: { fetch: vi.fn().mockResolvedValue(channel) },
    },
  } as unknown as Command.ChatInputCommandInteraction;

  return { interaction, reply };
};

const createCommand = (): EditObjectiveCommand => {
  const command = Object.create(EditObjectiveCommand.prototype) as EditObjectiveCommand;

  Object.defineProperty(command, 'container', {
    value: {
      client: {
        channels: { fetch: vi.fn().mockResolvedValue({ id: 'channel-1' }) },
      },
    },
  });

  return command;
};

describe('EditObjectiveCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canModifyObjectiveMock.mockReturnValue(true);
    isDuplicateObjectiveMock.mockReturnValue(false);
  });

  // AC-7/AC-8: editing one field must not touch the others.
  it('changes only the supplied map, leaving time and maintenanceAdded untouched', async () => {
    const objective = buildObjective({ id: 1, map: MAP_ELDERSLEEP });

    getActiveObjectivesMock.mockResolvedValue([objective]);
    updateObjectiveMock.mockResolvedValue(buildObjective({ id: 1, map: MAP_FARSHORE_BAY }));

    const command = createCommand();
    const { interaction } = buildInteraction({
      index: `1:${fingerprintFor(objective)}`,
      map: MAP_FARSHORE_BAY,
    });

    await command.chatInputRun(interaction);

    expect(updateObjectiveMock).toHaveBeenCalledWith(
      'guild-1',
      1,
      expect.not.objectContaining({ time: expect.anything() as unknown }),
    );
    expect(updateObjectiveMock).toHaveBeenCalledWith(
      'guild-1',
      1,
      expect.objectContaining({ map: MAP_FARSHORE_BAY }),
    );
  });

  // AC-7: supplying time recomputes the delay from the edit instant and recomputes maintenanceAdded.
  it('recomputes time from the edit instant and recomputes maintenanceAdded when time is supplied', async () => {
    const objective = buildObjective({ id: 2, time: baseTime, maintenanceAdded: true });

    getActiveObjectivesMock.mockResolvedValue([objective]);
    updateObjectiveMock.mockResolvedValue(buildObjective({ id: 2 }));

    const command = createCommand();
    const { interaction } = buildInteraction({
      index: `1:${fingerprintFor(objective)}`,
      time: '30',
    });

    await command.chatInputRun(interaction);

    expect(updateObjectiveMock).toHaveBeenCalledWith(
      'guild-1',
      2,
      expect.objectContaining({
        time: expect.any(Date) as Date,
        maintenanceAdded: expect.any(Boolean) as boolean,
      }),
    );
    const [, , fields] = updateObjectiveMock.mock.calls[0] as [string, number, { time: Date }];

    expect(fields.time.getTime()).not.toBe(baseTime.getTime());
  });

  // AC-9: no field supplied is a silent no-op — nothing written, nothing republished.
  it('writes nothing and does not republish when no editable field is supplied', async () => {
    const objective = buildObjective({ id: 3 });

    getActiveObjectivesMock.mockResolvedValue([objective]);

    const command = createCommand();
    const { interaction } = buildInteraction({ index: `1:${fingerprintFor(objective)}` });

    await command.chatInputRun(interaction);

    expect(updateObjectiveMock).not.toHaveBeenCalled();
    expect(deletePreviousMessageMock).not.toHaveBeenCalled();
    expect(sendMessageBatchesMock).not.toHaveBeenCalled();
  });

  // AC-5/AC-6: an edit producing a duplicate is refused, and the edited objective excludes itself.
  it('refuses an edit that would produce a duplicate with duplicateObjective', async () => {
    const objective = buildObjective({ id: 4, map: MAP_ELDERSLEEP });

    getActiveObjectivesMock.mockResolvedValue([objective]);
    isDuplicateObjectiveMock.mockReturnValue(true);

    const command = createCommand();
    const { interaction, reply } = buildInteraction({
      index: `1:${fingerprintFor(objective)}`,
      map: MAP_FARSHORE_BAY,
    });

    await command.chatInputRun(interaction);

    expect(isDuplicateObjectiveMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ excludeId: objective.id }),
    );
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('already exists') as string }),
    );
    expect(updateObjectiveMock).not.toHaveBeenCalled();
  });

  // objective-mutation AC-3/AC-4: validated on the resulting combination, not only supplied fields.
  it('refuses an edit whose resulting type/rarity combination is invalid', async () => {
    const objective = buildObjective({ id: 5, type: TYPE_CORE, rarity: RARITY_LEGENDARY });

    getActiveObjectivesMock.mockResolvedValue([objective]);

    const command = createCommand();
    // Only "type" is supplied; the stored rarity (RARITY_LEGENDARY) is invalid for TYPE_NODE_ORE.
    const { interaction, reply } = buildInteraction({
      index: `1:${fingerprintFor(objective)}`,
      type: TYPE_NODE_ORE,
    });

    await command.chatInputRun(interaction);

    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('not valid for the selected type') as string,
      }),
    );
    expect(updateObjectiveMock).not.toHaveBeenCalled();
  });

  // command-errors AC-5: invalidTypeRarity takes precedence over invalidTimeFormat/timeOutOfRange.
  it('reports invalidTypeRarity, not a time error, when both the combination and the time are invalid', async () => {
    const objective = buildObjective({ id: 12, type: TYPE_CORE, rarity: RARITY_LEGENDARY });

    getActiveObjectivesMock.mockResolvedValue([objective]);

    const command = createCommand();
    // "type" makes the resulting combination invalid (rarity stays RARITY_LEGENDARY);
    // "time" is also malformed. The combination error must win.
    const { interaction, reply } = buildInteraction({
      index: `1:${fingerprintFor(objective)}`,
      type: TYPE_NODE_ORE,
      time: 'banana',
    });

    await command.chatInputRun(interaction);

    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining('not valid for the selected type') as string,
      }),
    );
    expect(updateObjectiveMock).not.toHaveBeenCalled();
  });

  it('accepts an edit whose resulting type/rarity combination is valid', async () => {
    const objective = buildObjective({ id: 6, type: TYPE_CORE, rarity: RARITY_LEGENDARY });

    getActiveObjectivesMock.mockResolvedValue([objective]);
    updateObjectiveMock.mockResolvedValue(
      buildObjective({ id: 6, type: TYPE_NODE_ORE, rarity: RARITY_4_4 }),
    );

    const command = createCommand();
    const { interaction } = buildInteraction({
      index: `1:${fingerprintFor(objective)}`,
      type: TYPE_NODE_ORE,
      rarity: RARITY_4_4,
    });

    await command.chatInputRun(interaction);

    expect(updateObjectiveMock).toHaveBeenCalled();
  });

  describe('permissions identical to /remove', () => {
    it.each([
      ['Administrator', 'admin-1'],
      ['ManageMessages', 'moderator-1'],
      ['author', 'owner-1'],
    ])('allows a user satisfying %s to edit the objective', async (_label, userId) => {
      const objective = buildObjective({ id: 7, userId: 'owner-1' });

      getActiveObjectivesMock.mockResolvedValue([objective]);
      updateObjectiveMock.mockResolvedValue(buildObjective({ id: 7, map: MAP_FARSHORE_BAY }));
      canModifyObjectiveMock.mockReturnValue(true);

      const command = createCommand();
      const { interaction } = buildInteraction({
        index: `1:${fingerprintFor(objective)}`,
        map: MAP_FARSHORE_BAY,
        userId,
      });

      await command.chatInputRun(interaction);

      expect(updateObjectiveMock).toHaveBeenCalled();
    });

    it('refuses a plain non-author user with permissionDenied and writes nothing', async () => {
      const objective = buildObjective({ id: 7, userId: 'owner-1' });

      getActiveObjectivesMock.mockResolvedValue([objective]);
      canModifyObjectiveMock.mockReturnValue(false);

      const command = createCommand();
      const { interaction, reply } = buildInteraction({
        index: `1:${fingerprintFor(objective)}`,
        map: MAP_FARSHORE_BAY,
        userId: 'random-user',
      });

      await command.chatInputRun(interaction);

      expect(reply).toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('permission') as string }),
      );
      expect(updateObjectiveMock).not.toHaveBeenCalled();
    });
  });

  // AC-10: ephemeral confirmation enumerates only the changed fields, "field: old → new".
  it('confirms only the changed fields in "field: old → new" form', async () => {
    const objective = buildObjective({
      id: 8,
      map: MAP_ELDERSLEEP,
      type: TYPE_CORE,
      rarity: RARITY_LEGENDARY,
    });

    getActiveObjectivesMock.mockResolvedValue([objective]);
    updateObjectiveMock.mockResolvedValue(buildObjective({ id: 8, map: MAP_FARSHORE_BAY }));

    const command = createCommand();
    const { interaction, reply } = buildInteraction({
      index: `1:${fingerprintFor(objective)}`,
      map: MAP_FARSHORE_BAY,
    });

    await command.chatInputRun(interaction);

    const confirmationCall = reply.mock.calls.find(([payload]) =>
      payload.content.includes(`${MAP_ELDERSLEEP} → ${MAP_FARSHORE_BAY}`),
    );

    expect(confirmationCall).toBeDefined();
    expect(confirmationCall?.[0].content).not.toContain(`${TYPE_CORE} →`);
    expect(confirmationCall?.[0].content).not.toContain(`${RARITY_LEGENDARY} →`);
  });

  // AC-11: after a successful edit, the previous message is deleted and the active list republished.
  it('deletes the previous message and republishes the active list after a successful edit', async () => {
    const objective = buildObjective({ id: 9, map: MAP_ELDERSLEEP });
    const updated = buildObjective({ id: 9, map: MAP_FARSHORE_BAY });

    getActiveObjectivesMock.mockResolvedValueOnce([objective]).mockResolvedValueOnce([updated]);
    updateObjectiveMock.mockResolvedValue(updated);

    const command = createCommand();
    const { interaction } = buildInteraction({
      index: `1:${fingerprintFor(objective)}`,
      map: MAP_FARSHORE_BAY,
    });

    await command.chatInputRun(interaction);

    expect(deletePreviousMessageMock).toHaveBeenCalledWith(expect.anything(), 'channel-1');
    expect(getMessageMock).toHaveBeenCalledWith(expect.anything(), 'objective', [updated]);
    expect(sendMessageBatchesMock).toHaveBeenCalled();
  });

  // objective-selection AC-8/AC-8c: index resolution and fingerprint verification identical to /remove.
  it('refuses an index out of the active-list bounds with objectiveNotFound and writes nothing', async () => {
    getActiveObjectivesMock.mockResolvedValue([buildObjective({ id: 1 })]);

    const command = createCommand();
    const { interaction, reply } = buildInteraction({ index: '2', map: MAP_FARSHORE_BAY });

    await command.chatInputRun(interaction);

    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('cannot find') as string }),
    );
    expect(updateObjectiveMock).not.toHaveBeenCalled();
  });

  it('refuses a stale fingerprint and writes nothing', async () => {
    const current = buildObjective({ id: 11, map: MAP_ELDERSLEEP, time: baseTime });

    getActiveObjectivesMock.mockResolvedValue([current]);

    const command = createCommand();
    const staleFingerprint = `${TYPE_CORE}|${RARITY_LEGENDARY}|${MAP_FARSHORE_BAY}|${String(new Date('2000-01-01T00:00:00.000Z').getTime())}`;
    const { interaction, reply } = buildInteraction({
      index: `1:${staleFingerprint}`,
      map: MAP_FARSHORE_BAY,
    });

    await command.chatInputRun(interaction);

    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining('cannot find') as string }),
    );
    expect(updateObjectiveMock).not.toHaveBeenCalled();
  });

  // objective-selection AC-6/AC-7/AC-8b/AC-5: autocomplete lists only active objectives,
  // capped at 25, with descriptive label; value carries index + fingerprint, never the primary key.
  describe('index autocomplete', () => {
    it('lists only active objectives with a descriptive label and index+fingerprint value', async () => {
      const objective = buildObjective({
        id: 123,
        type: TYPE_CORE,
        rarity: RARITY_LEGENDARY,
        map: MAP_ELDERSLEEP,
        time: new Date('2026-09-01T14:20:00.000Z'),
      });

      getActiveObjectivesMock.mockResolvedValue([objective]);

      const command = createCommand();
      const respond = vi.fn().mockResolvedValue(undefined);
      const interaction = {
        guildId: 'guild-1',
        options: {
          getFocused: () => ({ name: 'index', value: '' }),
          getString: () => null,
        },
        respond,
      } as unknown as Command.AutocompleteInteraction;

      await command.autocompleteRun(interaction);

      expect(respond).toHaveBeenCalledWith([
        expect.objectContaining({
          name: expect.stringContaining('Core Gold Eldersleep (14:20 UTC)') as string,
          value: expect.stringContaining('1:') as string,
        }),
      ]);

      const [[choices]] = respond.mock.calls as [[{ name: string; value: string }[]]];

      for (const choice of choices) {
        expect(choice.value).not.toContain(String(objective.id));
      }
    });

    it('caps the index autocomplete at 25 suggestions', async () => {
      const objectives = Array.from({ length: 30 }, (_unused, index) =>
        buildObjective({ id: index + 1, map: MAP_ELDERSLEEP }),
      );

      getActiveObjectivesMock.mockResolvedValue(objectives);

      const command = createCommand();
      const respond = vi.fn().mockResolvedValue(undefined);
      const interaction = {
        guildId: 'guild-1',
        options: {
          getFocused: () => ({ name: 'index', value: '' }),
          getString: () => null,
        },
        respond,
      } as unknown as Command.AutocompleteInteraction;

      await command.autocompleteRun(interaction);

      const [[choices]] = respond.mock.calls as [[unknown[]]];

      expect(choices).toHaveLength(25);
    });
  });
});
