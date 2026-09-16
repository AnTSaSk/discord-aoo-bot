import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Command } from '@sapphire/framework';

import { EditObjectiveCommand } from '@/commands/editObjective.js';
import { AddObjectiveCommand } from '@/commands/addObjective.js';
import {
  TYPE_CORE,
  TYPE_NODE_ORE,
  TYPE_DRAGON,
  TYPE_ANCIENT_LANDS_PORTAL,
} from '@/constants/type.js';
import {
  RARITY_LEGENDARY,
  RARITY_4_4,
  RARITY_NONE,
  RARITY_SMALL,
  RARITY_LARGE,
} from '@/constants/rarity.js';
import {
  MAP_ELDERSLEEP,
  MAP_FARSHORE_BAY,
  MAPS_BLACK_ZONE,
  MAPS_ROYAL,
} from '@/constants/map.js';
import type { Objective } from '@/models/objective.model.js';
import * as replyModule from '@/utils/reply.js';

const {
  getActiveObjectivesMock,
  updateObjectiveMock,
  canModifyObjectiveMock,
  isDuplicateObjectiveMock,
  deletePreviousMessageMock,
  getMessageMock,
  sendMessageBatchesMock,
  recordLastUsedChannelMock,
} = vi.hoisted(() => ({
  recordLastUsedChannelMock: vi.fn().mockResolvedValue(undefined),
  getActiveObjectivesMock: vi.fn(),
  updateObjectiveMock: vi.fn(),
  canModifyObjectiveMock: vi.fn(),
  isDuplicateObjectiveMock: vi.fn(),
  deletePreviousMessageMock: vi.fn().mockResolvedValue(undefined),
  getMessageMock: vi.fn().mockResolvedValue([]),
  sendMessageBatchesMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/guildSettings.service.js', () => ({
  recordLastUsedChannel: recordLastUsedChannelMock,
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

interface StringOptionStub {
  name: string;
  description: string;
  setName: (name: string) => StringOptionStub;
  setDescription: (description: string) => StringOptionStub;
  setRequired: (required: boolean) => StringOptionStub;
  setAutocomplete: (autocomplete: boolean) => StringOptionStub;
}

const createStringOptionStub = (): StringOptionStub => {
  const stub: StringOptionStub = {
    name: '',
    description: '',
    setName(name) {
      stub.name = name;

      return stub;
    },
    setDescription(description) {
      stub.description = description;

      return stub;
    },
    setRequired() {
      return stub;
    },
    setAutocomplete() {
      return stub;
    },
  };

  return stub;
};

// Mirrors addObjective.test.ts's collector so /edit's registered options can be inspected.
const registerAndCollectEditStringOptions = (): StringOptionStub[] => {
  const collected: StringOptionStub[] = [];
  const builder = {
    setName: () => builder,
    setDescription: () => builder,
    setIntegrationTypes: () => builder,
    setContexts: () => builder,
    addStringOption: (configure: (option: StringOptionStub) => StringOptionStub) => {
      const option = createStringOptionStub();

      configure(option);
      collected.push(option);

      return builder;
    },
  };
  const registry = {
    registerChatInputCommand: (configure: (b: typeof builder) => unknown) => {
      configure(builder);
    },
  };

  const command = Object.create(EditObjectiveCommand.prototype) as EditObjectiveCommand;

  command.registerApplicationCommands(
    registry as unknown as Parameters<EditObjectiveCommand['registerApplicationCommands']>[0],
  );

  return collected;
};

const registerAndCollectAddStringOptions = (): StringOptionStub[] => {
  const collected: StringOptionStub[] = [];
  const builder = {
    setName: () => builder,
    setDescription: () => builder,
    setIntegrationTypes: () => builder,
    setContexts: () => builder,
    addStringOption: (configure: (option: StringOptionStub) => StringOptionStub) => {
      const option = createStringOptionStub();

      configure(option);
      collected.push(option);

      return builder;
    },
  };
  const registry = {
    registerChatInputCommand: (configure: (b: typeof builder) => unknown) => {
      configure(builder);
    },
  };

  const command = Object.create(AddObjectiveCommand.prototype) as AddObjectiveCommand;

  command.registerApplicationCommands(
    registry as unknown as Parameters<AddObjectiveCommand['registerApplicationCommands']>[0],
  );

  return collected;
};

describe('EditObjectiveCommand rarity option description (AC-8b)', () => {
  // AC-8b: description present, <= 100 chars, and IDENTICAL to /add's — not merely separately valid.
  it('declares a rarity description present, <= 100 chars, and identical to /add', () => {
    const editOptions = registerAndCollectEditStringOptions();
    const addOptions = registerAndCollectAddStringOptions();
    const editRarity = editOptions.find((option) => option.name === 'rarity');
    const addRarity = addOptions.find((option) => option.name === 'rarity');

    expect(editRarity).toBeDefined();
    expect(editRarity?.description).toBe('Rarity/Tier/Portal size - n/a for Dragon');
    expect(editRarity?.description.length).toBeLessThanOrEqual(100);
    expect(editRarity?.description).toBe(addRarity?.description);
  });
});

describe('EditObjectiveCommand mutations crossing the Dragon boundary', () => {
  // AC-18: editing a Dragon (sentinel) toward a rarity-requiring type, no rarity supplied, is
  // rejected as missingRarity — the sentinel counts as absence of rarity, not invalidTypeRarity.
  it('rejects editing a Dragon toward Core with no rarity via the missingRarity error key', async () => {
    const objective = buildObjective({ id: 20, type: TYPE_DRAGON, rarity: RARITY_NONE });

    getActiveObjectivesMock.mockResolvedValue([objective]);

    const replyErrorSpy = vi.spyOn(replyModule, 'replyError').mockResolvedValue(undefined);
    const command = createCommand();
    const { interaction } = buildInteraction({
      index: `1:${fingerprintFor(objective)}`,
      type: TYPE_CORE,
    });

    await command.chatInputRun(interaction);

    expect(replyErrorSpy).toHaveBeenCalledWith(interaction, 'missingRarity');
    expect(updateObjectiveMock).not.toHaveBeenCalled();

    replyErrorSpy.mockRestore();
  });

  // AC-19: editing a rarity-bearing objective toward Dragon, no rarity supplied, is accepted and
  // the sentinel is written into the updated fields (replacing the old rarity).
  it('accepts editing Core toward Dragon with no rarity and writes the sentinel into fields', async () => {
    const objective = buildObjective({ id: 21, type: TYPE_CORE, rarity: RARITY_LEGENDARY });

    getActiveObjectivesMock.mockResolvedValue([objective]);
    updateObjectiveMock.mockResolvedValue(
      buildObjective({ id: 21, type: TYPE_DRAGON, rarity: RARITY_NONE }),
    );

    const command = createCommand();
    const { interaction } = buildInteraction({
      index: `1:${fingerprintFor(objective)}`,
      type: TYPE_DRAGON,
    });

    await command.chatInputRun(interaction);

    expect(updateObjectiveMock).toHaveBeenCalledWith(
      'guild-1',
      21,
      expect.objectContaining({ type: TYPE_DRAGON, rarity: RARITY_NONE }),
    );
  });

  // AC-R9 — central trap: selecting n/a explicitly on a Dragon edit must NOT be rejected by the
  // invalidValues referential guard before the type/rarity logic runs.
  it('accepts editing toward Dragon with n/a explicitly selected as the rarity', async () => {
    const objective = buildObjective({ id: 22, type: TYPE_CORE, rarity: RARITY_LEGENDARY });

    getActiveObjectivesMock.mockResolvedValue([objective]);
    updateObjectiveMock.mockResolvedValue(
      buildObjective({ id: 22, type: TYPE_DRAGON, rarity: RARITY_NONE }),
    );

    const command = createCommand();
    const { interaction } = buildInteraction({
      index: `1:${fingerprintFor(objective)}`,
      type: TYPE_DRAGON,
      rarity: RARITY_NONE,
    });

    await command.chatInputRun(interaction);

    expect(updateObjectiveMock).toHaveBeenCalledWith(
      'guild-1',
      22,
      expect.objectContaining({ type: TYPE_DRAGON, rarity: RARITY_NONE }),
    );
  });
});

describe('EditObjectiveCommand resulting map zone guard (AC-M7, AC-26)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canModifyObjectiveMock.mockReturnValue(true);
    isDuplicateObjectiveMock.mockReturnValue(false);
  });

  // AC-M7 / AC-26: the guard applies to the RESULTING combination, so it must fire even when the
  // user supplies no map at all — otherwise /edit is a back door into a state /add refuses.
  it('rejects moving a Royal-map Dragon to another type when no map is supplied', async () => {
    const objective = buildObjective({
      id: 30,
      type: TYPE_DRAGON,
      rarity: RARITY_NONE,
      map: MAPS_ROYAL[0],
    });

    getActiveObjectivesMock.mockResolvedValue([objective]);

    const replyErrorSpy = vi.spyOn(replyModule, 'replyError').mockResolvedValue(undefined);
    const command = createCommand();
    const { interaction } = buildInteraction({
      index: `1:${fingerprintFor(objective)}`,
      type: TYPE_CORE,
      rarity: RARITY_LEGENDARY,
    });

    await command.chatInputRun(interaction);

    expect(replyErrorSpy).toHaveBeenCalledWith(interaction, 'unexpectedRoyalMap');
    expect(updateObjectiveMock).not.toHaveBeenCalled();

    replyErrorSpy.mockRestore();
  });

  it('accepts moving a Royal-map Dragon to another type when a Black Zone map is supplied', async () => {
    const objective = buildObjective({
      id: 31,
      type: TYPE_DRAGON,
      rarity: RARITY_NONE,
      map: MAPS_ROYAL[0],
    });

    getActiveObjectivesMock.mockResolvedValue([objective]);
    updateObjectiveMock.mockResolvedValue(
      buildObjective({ id: 31, type: TYPE_CORE, rarity: RARITY_LEGENDARY }),
    );

    const command = createCommand();
    const { interaction } = buildInteraction({
      index: `1:${fingerprintFor(objective)}`,
      type: TYPE_CORE,
      rarity: RARITY_LEGENDARY,
      map: MAPS_BLACK_ZONE[0],
    });

    await command.chatInputRun(interaction);

    expect(updateObjectiveMock).toHaveBeenCalledWith(
      'guild-1',
      31,
      expect.objectContaining({ type: TYPE_CORE, map: MAPS_BLACK_ZONE[0] }),
    );
  });

  it('accepts setting a Royal map on an objective already typed as Dragon', async () => {
    const objective = buildObjective({ id: 32, type: TYPE_DRAGON, rarity: RARITY_NONE });

    getActiveObjectivesMock.mockResolvedValue([objective]);
    updateObjectiveMock.mockResolvedValue(
      buildObjective({ id: 32, type: TYPE_DRAGON, rarity: RARITY_NONE, map: MAPS_ROYAL[0] }),
    );

    const command = createCommand();
    const { interaction } = buildInteraction({
      index: `1:${fingerprintFor(objective)}`,
      map: MAPS_ROYAL[0],
    });

    await command.chatInputRun(interaction);

    expect(updateObjectiveMock).toHaveBeenCalledWith(
      'guild-1',
      32,
      expect.objectContaining({ map: MAPS_ROYAL[0] }),
    );
  });
});

describe('EditObjectiveCommand rarity autocomplete filtered by family (AC-7, AC-8)', () => {
  const buildAutocompleteInteraction = (
    focusedName: string,
    typeValue: string | null,
  ): { interaction: Command.AutocompleteInteraction; respond: ReturnType<typeof vi.fn> } => {
    const respond = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      guildId: 'guild-1',
      options: {
        getFocused: () => ({ name: focusedName, value: '' }),
        getString: (name: string) => (name === 'type' ? typeValue : null),
      },
      respond,
    } as unknown as Command.AutocompleteInteraction;

    return { interaction, respond };
  };

  // AC-7: after choosing a node type, rarity autocomplete proposes only that type's family.
  it('proposes only numeric tier rarities once a node type is chosen', async () => {
    const command = createCommand();
    const { interaction, respond } = buildAutocompleteInteraction('rarity', TYPE_NODE_ORE);

    await command.autocompleteRun(interaction);

    const [[choices]] = respond.mock.calls as [[{ value: string }[]]];
    const values = choices.map((choice) => choice.value);

    expect(values.length).toBeGreaterThan(0);
    expect(values).not.toContain(RARITY_LEGENDARY);
    expect(values).not.toContain(RARITY_SMALL);
  });

  // AC-7: after choosing Ancient Lands Portal, rarity autocomplete proposes only portal sizes.
  it('proposes only portal sizes once Ancient Lands Portal is chosen', async () => {
    const command = createCommand();
    const { interaction, respond } = buildAutocompleteInteraction(
      'rarity',
      TYPE_ANCIENT_LANDS_PORTAL,
    );

    await command.autocompleteRun(interaction);

    const [[choices]] = respond.mock.calls as [[{ value: string }[]]];
    const values = choices.map((choice) => choice.value);

    expect(values).toContain(RARITY_SMALL);
    expect(values).not.toContain(RARITY_LEGENDARY);
    expect(values.every((value) => value !== RARITY_NONE)).toBe(true);
  });

  // AC-8, AC-R8: rarity autocomplete with type Dragon proposes n/a as the unique suggestion.
  it('proposes n/a as the unique suggestion for rarity autocomplete when the type is Dragon', async () => {
    const command = createCommand();
    const { interaction, respond } = buildAutocompleteInteraction('rarity', TYPE_DRAGON);

    await command.autocompleteRun(interaction);

    const [[choices]] = respond.mock.calls as [[{ value: string }[]]];

    expect(choices.map((choice) => choice.value)).toEqual([RARITY_NONE]);
  });

  // AC-8c: sentinel must never surface for a type other than Dragon.
  it.each([TYPE_NODE_ORE, TYPE_CORE, TYPE_ANCIENT_LANDS_PORTAL])(
    'never includes the sentinel in rarity autocomplete for type %s',
    async (type) => {
      const command = createCommand();
      const { interaction, respond } = buildAutocompleteInteraction('rarity', type);

      await command.autocompleteRun(interaction);

      const [[choices]] = respond.mock.calls as [[{ value: string }[]]];

      expect(choices.map((choice) => choice.value)).not.toContain(RARITY_NONE);
    },
  );

  // AC-8c: with no type chosen, the fallback stays RARITIES — no sentinel either.
  it('never includes the sentinel in rarity autocomplete when no type is chosen', async () => {
    const command = createCommand();
    const { interaction, respond } = buildAutocompleteInteraction('rarity', null);

    await command.autocompleteRun(interaction);

    const [[choices]] = respond.mock.calls as [[{ value: string }[]]];

    expect(choices.map((choice) => choice.value)).not.toContain(RARITY_NONE);
  });
});

describe('EditObjectiveCommand reverse type autocomplete narrowed by portal size (plan 2.4)', () => {
  // Choosing a portal size must narrow the type autocomplete to the portal type only.
  it('narrows type suggestions to Ancient Lands Portal once a portal size is chosen', async () => {
    const command = createCommand();
    const respond = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      guildId: 'guild-1',
      options: {
        getFocused: () => ({ name: 'type', value: '' }),
        getString: (name: string) => (name === 'rarity' ? RARITY_SMALL : null),
      },
      respond,
    } as unknown as Command.AutocompleteInteraction;

    await command.autocompleteRun(interaction);

    const [[choices]] = respond.mock.calls as [[{ value: string }[]]];
    const values = choices.map((choice) => choice.value);

    expect(values).toEqual([TYPE_ANCIENT_LANDS_PORTAL]);
  });
});

// objective-taxonomy AC-20: /edit without `time` still bounds the RESULTING type's cap against the
// REMAINING time (stored date minus edit instant), never the originally-typed delay (not persisted).
describe('EditObjectiveCommand per-type time bounds without `time` (objective-taxonomy AC-20)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    canModifyObjectiveMock.mockReturnValue(true);
    isDuplicateObjectiveMock.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // A Large portal declared at 150 minutes remaining, edited toward Small immediately after
  // creation: the full 150 minutes still remain, which exceeds the Small cap (30) — rejected.
  it('rejects narrowing a Large portal (150 min remaining) to Small with timeOutOfRange, and does not modify the objective', async () => {
    const editInstant = new Date('2026-09-01T10:00:00.000Z');
    const storedTime = new Date('2026-09-01T12:30:00.000Z'); // 150 minutes after editInstant

    vi.useFakeTimers();
    vi.setSystemTime(editInstant);

    const objective = buildObjective({
      id: 30,
      type: TYPE_ANCIENT_LANDS_PORTAL,
      rarity: RARITY_LARGE,
      time: storedTime,
    });

    getActiveObjectivesMock.mockResolvedValue([objective]);

    const replyErrorSpy = vi.spyOn(replyModule, 'replyError').mockResolvedValue(undefined);
    const command = createCommand();
    const { interaction } = buildInteraction({
      index: `1:${fingerprintFor(objective)}`,
      rarity: RARITY_SMALL,
    });

    await command.chatInputRun(interaction);

    expect(replyErrorSpy).toHaveBeenCalledWith(interaction, 'timeOutOfRange');
    expect(updateObjectiveMock).not.toHaveBeenCalled();

    replyErrorSpy.mockRestore();
  });

  // The same Large portal, edited 130 minutes after creation: only 20 minutes remain, which fits
  // under the Small cap (30) — accepted, per ADR-0005's documented remaining-time behaviour.
  it('accepts narrowing a Large portal to Small once only 20 minutes remain, leaving the stored time untouched', async () => {
    const storedTime = new Date('2026-09-01T12:30:00.000Z');
    const editInstant = new Date('2026-09-01T12:10:00.000Z'); // 20 minutes before storedTime

    vi.useFakeTimers();
    vi.setSystemTime(editInstant);

    const objective = buildObjective({
      id: 31,
      type: TYPE_ANCIENT_LANDS_PORTAL,
      rarity: RARITY_LARGE,
      time: storedTime,
    });

    getActiveObjectivesMock.mockResolvedValue([objective]);
    updateObjectiveMock.mockResolvedValue(
      buildObjective({ id: 31, type: TYPE_ANCIENT_LANDS_PORTAL, rarity: RARITY_SMALL, time: storedTime }),
    );

    const command = createCommand();
    const { interaction } = buildInteraction({
      index: `1:${fingerprintFor(objective)}`,
      rarity: RARITY_SMALL,
    });

    await command.chatInputRun(interaction);

    expect(updateObjectiveMock).toHaveBeenCalledWith(
      'guild-1',
      31,
      expect.not.objectContaining({ time: expect.anything() as unknown }),
    );
    expect(updateObjectiveMock).toHaveBeenCalledWith(
      'guild-1',
      31,
      expect.objectContaining({ rarity: RARITY_SMALL }),
    );
  });
});

describe('EditObjectiveCommand last used channel (guild-settings AC-9)', () => {
  it('records the interaction channel as the last one used by the guild', async () => {
    recordLastUsedChannelMock.mockClear();
    getActiveObjectivesMock.mockResolvedValue([]);

    const command = createCommand();
    const { interaction } = buildInteraction({ index: '1' });

    await command.chatInputRun(interaction);

    expect(recordLastUsedChannelMock).toHaveBeenCalledWith('guild-1', 'channel-1');
  });
});
