import { describe, it, expect, vi, beforeEach } from 'vitest';
import { type MessageFlags } from 'discord.js';
import type { Command } from '@sapphire/framework';
import { Op } from '@sequelize/core';

import { AddObjectiveCommand } from '@/commands/addObjective.js';
import {
  TYPE_CORE,
  TYPE_NODE_ORE,
  TYPE_DRAGON,
  TYPE_ANCIENT_LANDS_PORTAL,
} from '@/constants/type.js';
import {
  RARITY_LEGENDARY,
  RARITY_NONE,
  RARITY_SMALL,
  RARITY_MEDIUM,
  RARITY_LARGE,
} from '@/constants/rarity.js';
import { MAP_ELDERSLEEP, MAPS_BLACK_ZONE, MAPS_ROYAL } from '@/constants/map.js';
import { MAPS_ALL_SORTED } from '@/utils/objectiveValidation.js';

const { recordLastUsedChannelMock, createObjectiveMock, findAllObjectiveMock } = vi.hoisted(
  () => ({
    recordLastUsedChannelMock: vi.fn().mockResolvedValue(undefined),
    createObjectiveMock: vi.fn(),
    findAllObjectiveMock: vi.fn().mockResolvedValue([]),
  }),
);

vi.mock('@/services/guildSettings.service.js', () => ({
  recordLastUsedChannel: recordLastUsedChannelMock,
}));

vi.mock('@/services/objective.service.js', () => ({
  createObjective: createObjectiveMock,
  findAllObjective: findAllObjectiveMock,
  findObjectiveByGuildId: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/tasks/message.js', () => ({
  deletePreviousMessage: vi.fn(),
  getMessage: vi.fn().mockResolvedValue([]),
  sendMessageBatches: vi.fn(),
}));

interface StringOptionStub {
  name: string;
  description: string;
  required: boolean;
  setName: (name: string) => StringOptionStub;
  setDescription: (description: string) => StringOptionStub;
  setRequired: (required: boolean) => StringOptionStub;
  setAutocomplete: (autocomplete: boolean) => StringOptionStub;
}

const createStringOptionStub = (): StringOptionStub => {
  const stub: StringOptionStub = {
    name: '',
    description: '',
    required: false,
    setName(name) {
      stub.name = name;

      return stub;
    },
    setDescription(description) {
      stub.description = description;

      return stub;
    },
    setRequired(required) {
      stub.required = required;

      return stub;
    },
    setAutocomplete() {
      return stub;
    },
  };

  return stub;
};

// Captures every string option built by the command so the "time" one can be inspected in isolation.
const registerAndCollectStringOptions = (): StringOptionStub[] => {
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

describe('AddObjectiveCommand time option description', () => {
  // AC-10: the "time" option description must describe remaining time and enumerate accepted formats
  it('describes the "time" option as remaining time and lists the accepted formats', () => {
    const options = registerAndCollectStringOptions();
    const timeOption = options.find((option) => option.name === 'time');

    expect(timeOption).toBeDefined();
    expect(timeOption?.description).toMatch(/remaining/i);
    expect(timeOption?.description).toContain('1:30');
    expect(timeOption?.description).toContain('90m');
  });
});

interface FakeReplyPayload {
  content: string;
  flags: MessageFlags.Ephemeral;
}

const buildChatInputInteraction = (values: {
  type: string | null;
  rarity: string | null;
  map: string | null;
  time: string | null;
}): {
  interaction: Command.ChatInputCommandInteraction;
  reply: ReturnType<typeof vi.fn<(payload: FakeReplyPayload) => Promise<void>>>;
} => {
  const reply = vi.fn<(payload: FakeReplyPayload) => Promise<void>>().mockResolvedValue(undefined);
  const interaction = {
    guildId: 'guild-1',
    channelId: 'channel-1',
    user: { id: 'user-1' },
    options: {
      getString: (name: string) => {
        switch (name) {
          case 'type':
            return values.type;
          case 'rarity':
            return values.rarity;
          case 'map':
            return values.map;
          case 'time':
            return values.time;
          default:
            return null;
        }
      },
    },
    reply,
  } as unknown as Command.ChatInputCommandInteraction;

  return { interaction, reply };
};

describe('AddObjectiveCommand type/rarity combination validation', () => {
  // command-errors AC precedence: invalidTypeRarity is checked before time parsing
  it('refuses a valid-individually but invalid-in-combination type/rarity pair with invalidTypeRarity', async () => {
    const command = Object.create(AddObjectiveCommand.prototype) as AddObjectiveCommand;
    const { interaction, reply } = buildChatInputInteraction({
      type: TYPE_NODE_ORE,
      rarity: RARITY_LEGENDARY,
      map: MAP_ELDERSLEEP,
      time: 'not-a-valid-time-at-all',
    });

    await command.chatInputRun(interaction);

    expect(reply.mock.calls[0]?.[0]?.content).toBe(
      'This rarity is not valid for the selected type',
    );
  });

  it('does not refuse a valid type/rarity pair for the invalidTypeRarity reason', async () => {
    const command = Object.create(AddObjectiveCommand.prototype) as AddObjectiveCommand;
    const { interaction, reply } = buildChatInputInteraction({
      type: TYPE_CORE,
      rarity: RARITY_LEGENDARY,
      map: MAP_ELDERSLEEP,
      time: 'not-a-valid-time-at-all',
    });

    await command.chatInputRun(interaction);

    expect(reply.mock.calls[0]?.[0]?.content).not.toBe(
      'This rarity is not valid for the selected type',
    );
  });
});

describe('AddObjectiveCommand last used channel (guild-settings AC-9)', () => {
  it('records the interaction channel as the last one used by the guild', async () => {
    recordLastUsedChannelMock.mockClear();

    const command = Object.create(AddObjectiveCommand.prototype) as AddObjectiveCommand;
    const { interaction } = buildChatInputInteraction({
      type: TYPE_CORE,
      rarity: RARITY_LEGENDARY,
      map: MAP_ELDERSLEEP,
      time: 'not-a-valid-time-at-all',
    });

    await command.chatInputRun(interaction);

    expect(recordLastUsedChannelMock).toHaveBeenCalledWith('guild-1', 'channel-1');
  });
});

describe('AddObjectiveCommand rarity option is required (AC-R1, AC-R2, AC-R3, AC-8b, AC-8d)', () => {
  it('declares the four options required, in the order type, rarity, map, time', () => {
    const options = registerAndCollectStringOptions();

    expect(options.map((option) => option.name)).toEqual(['type', 'rarity', 'map', 'time']);
    expect(options.every((option) => option.required)).toBe(true);
  });

  it('declares the rarity option with the exact target description, <= 100 chars', () => {
    const options = registerAndCollectStringOptions();
    const rarityOption = options.find((option) => option.name === 'rarity');

    expect(rarityOption).toBeDefined();
    expect(rarityOption?.description).toBe('Rarity/Tier/Portal size - n/a for Dragon');
    expect(rarityOption?.description.length).toBeLessThanOrEqual(100);
  });
});

describe('AddObjectiveCommand Dragon rarity handling', () => {
  const buildInteractionWithContainer = (values: {
    type: string | null;
    rarity: string | null;
    map: string | null;
    time: string | null;
  }): {
    interaction: Command.ChatInputCommandInteraction;
    reply: ReturnType<typeof vi.fn<(payload: FakeReplyPayload) => Promise<void>>>;
    command: AddObjectiveCommand;
  } => {
    const { interaction, reply } = buildChatInputInteraction(values);
    const command = Object.create(AddObjectiveCommand.prototype) as AddObjectiveCommand;

    Object.defineProperty(command, 'container', {
      value: {
        client: {
          channels: { fetch: vi.fn().mockResolvedValue({ id: 'channel-1' }) },
        },
      },
    });

    return { interaction, reply, command };
  };

  beforeEach(() => {
    createObjectiveMock.mockReset();
    findAllObjectiveMock.mockReset();
    findAllObjectiveMock.mockResolvedValue([]);
  });

  // AC-4/AC-R7: /add Dragon with no rarity supplied still persists the sentinel RARITY_NONE.
  it('persists a Dragon objective with no rarity using the sentinel RARITY_NONE', async () => {
    createObjectiveMock.mockResolvedValue({ id: 1 });

    const { interaction, command } = buildInteractionWithContainer({
      type: TYPE_DRAGON,
      rarity: null,
      map: MAP_ELDERSLEEP,
      time: '30',
    });

    await command.chatInputRun(interaction);

    expect(createObjectiveMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: TYPE_DRAGON, rarity: RARITY_NONE }),
    );
  });

  // AC-R7 — central trap: selecting n/a on a Dragon must NOT be rejected by the invalidValues
  // referential guard before the type/rarity logic runs; it must reach persistence.
  it('accepts a Dragon objective with n/a explicitly selected as the rarity', async () => {
    createObjectiveMock.mockResolvedValue({ id: 1 });

    const { interaction, reply, command } = buildInteractionWithContainer({
      type: TYPE_DRAGON,
      rarity: RARITY_NONE,
      map: MAP_ELDERSLEEP,
      time: '30',
    });

    await command.chatInputRun(interaction);

    expect(reply.mock.calls[0]?.[0]?.content).not.toBe(
      'One or multiple value(s) are incorrect, please try again.\nIf the problem persist, please contact the Bot Developer.',
    );
    expect(createObjectiveMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: TYPE_DRAGON, rarity: RARITY_NONE }),
    );
  });

  // AC-5: /add Dragon with a rarity supplied is rejected with the unexpectedRarity error key.
  it('rejects a Dragon objective with a supplied rarity via the unexpectedRarity error key', async () => {
    const replyModule = await import('@/utils/reply.js');
    const replyErrorSpy = vi.spyOn(replyModule, 'replyError').mockResolvedValue(undefined);

    const { interaction, command } = buildInteractionWithContainer({
      type: TYPE_DRAGON,
      rarity: RARITY_LEGENDARY,
      map: MAP_ELDERSLEEP,
      time: '30',
    });

    await command.chatInputRun(interaction);

    expect(replyErrorSpy).toHaveBeenCalledWith(interaction, 'unexpectedRarity');
    expect(createObjectiveMock).not.toHaveBeenCalled();

    replyErrorSpy.mockRestore();
  });

  // AC-6: /add a rarity-requiring type with no rarity is rejected via the missingRarity error key.
  it('rejects a rarity-requiring type with no rarity via the missingRarity error key', async () => {
    const replyModule = await import('@/utils/reply.js');
    const replyErrorSpy = vi.spyOn(replyModule, 'replyError').mockResolvedValue(undefined);

    const { interaction, command } = buildInteractionWithContainer({
      type: TYPE_CORE,
      rarity: null,
      map: MAP_ELDERSLEEP,
      time: '30',
    });

    await command.chatInputRun(interaction);

    expect(replyErrorSpy).toHaveBeenCalledWith(interaction, 'missingRarity');
    expect(createObjectiveMock).not.toHaveBeenCalled();

    replyErrorSpy.mockRestore();
  });

  // AC-13: two Dragons on the same map/time/guild — the second is rejected as a duplicate.
  // Exercises the real duplicate-detection path (query args passed to findAllObjective),
  // not a re-implementation of the comparison — the findAll mock ignores where/order.
  it('rejects a second identical Dragon objective as a duplicate, querying by type/rarity/map', async () => {
    findAllObjectiveMock.mockResolvedValue([{ id: 99 }]);

    const { interaction, reply, command } = buildInteractionWithContainer({
      type: TYPE_DRAGON,
      rarity: null,
      map: MAP_ELDERSLEEP,
      time: '30',
    });

    await command.chatInputRun(interaction);

    expect(findAllObjectiveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: { [Op.eq]: TYPE_DRAGON },
          rarity: { [Op.eq]: RARITY_NONE },
          map: { [Op.eq]: MAP_ELDERSLEEP },
        }) as unknown,
      }),
    );
    expect(reply.mock.calls[0]?.[0]?.content).toContain('already exists');
    expect(createObjectiveMock).not.toHaveBeenCalled();
  });
});

describe('AddObjectiveCommand rarity autocomplete filtered by family (AC-7, AC-8)', () => {
  const buildAutocompleteInteraction = (
    focusedName: string,
    typeValue: string | null,
  ): { interaction: Command.AutocompleteInteraction; respond: ReturnType<typeof vi.fn>} => {
    const respond = vi.fn().mockResolvedValue(undefined);
    const interaction = {
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
    const command = Object.create(AddObjectiveCommand.prototype) as AddObjectiveCommand;
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
    const command = Object.create(AddObjectiveCommand.prototype) as AddObjectiveCommand;
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

  // AC-8, AC-R5: rarity autocomplete with type Dragon proposes n/a as the unique suggestion.
  it('proposes n/a as the unique suggestion for rarity autocomplete when the type is Dragon', async () => {
    const command = Object.create(AddObjectiveCommand.prototype) as AddObjectiveCommand;
    const { interaction, respond } = buildAutocompleteInteraction('rarity', TYPE_DRAGON);

    await command.autocompleteRun(interaction);

    const [[choices]] = respond.mock.calls as [[{ value: string }[]]];

    expect(choices.map((choice) => choice.value)).toEqual([RARITY_NONE]);
  });

  // AC-8c: sentinel must never surface for a type other than Dragon.
  it.each([TYPE_NODE_ORE, TYPE_CORE, TYPE_ANCIENT_LANDS_PORTAL])(
    'never includes the sentinel in rarity autocomplete for type %s',
    async (type) => {
      const command = Object.create(AddObjectiveCommand.prototype) as AddObjectiveCommand;
      const { interaction, respond } = buildAutocompleteInteraction('rarity', type);

      await command.autocompleteRun(interaction);

      const [[choices]] = respond.mock.calls as [[{ value: string }[]]];

      expect(choices.map((choice) => choice.value)).not.toContain(RARITY_NONE);
    },
  );

  // AC-8c: with no type chosen, the fallback stays RARITIES — no sentinel either.
  it('never includes the sentinel in rarity autocomplete when no type is chosen', async () => {
    const command = Object.create(AddObjectiveCommand.prototype) as AddObjectiveCommand;
    const { interaction, respond } = buildAutocompleteInteraction('rarity', null);

    await command.autocompleteRun(interaction);

    const [[choices]] = respond.mock.calls as [[{ value: string }[]]];

    expect(choices.map((choice) => choice.value)).not.toContain(RARITY_NONE);
  });
});

describe('AddObjectiveCommand per-type time bounds (objective-taxonomy AC-9, AC-11)', () => {
  const buildInteractionWithContainer = (values: {
    type: string | null;
    rarity: string | null;
    map: string | null;
    time: string | null;
  }): {
    interaction: Command.ChatInputCommandInteraction;
    reply: ReturnType<typeof vi.fn<(payload: FakeReplyPayload) => Promise<void>>>;
    command: AddObjectiveCommand;
  } => {
    const { interaction, reply } = buildChatInputInteraction(values);
    const command = Object.create(AddObjectiveCommand.prototype) as AddObjectiveCommand;

    Object.defineProperty(command, 'container', {
      value: {
        client: {
          channels: { fetch: vi.fn().mockResolvedValue({ id: 'channel-1' }) },
        },
      },
    });

    return { interaction, reply, command };
  };

  beforeEach(() => {
    createObjectiveMock.mockReset();
    findAllObjectiveMock.mockReset();
    findAllObjectiveMock.mockResolvedValue([]);
  });

  // AC-9: a Small portal declared with 31 minutes exceeds its 30-minute cap.
  it('rejects a Small portal declared at 31 minutes with timeOutOfRange', async () => {
    const replyModule = await import('@/utils/reply.js');
    const replyErrorSpy = vi.spyOn(replyModule, 'replyError').mockResolvedValue(undefined);

    const { interaction, command } = buildInteractionWithContainer({
      type: TYPE_ANCIENT_LANDS_PORTAL,
      rarity: RARITY_SMALL,
      map: MAP_ELDERSLEEP,
      time: '31',
    });

    await command.chatInputRun(interaction);

    expect(replyErrorSpy).toHaveBeenCalledWith(interaction, 'timeOutOfRange');
    expect(createObjectiveMock).not.toHaveBeenCalled();

    replyErrorSpy.mockRestore();
  });

  // AC-9: a Medium portal declared with 61 minutes exceeds its 60-minute cap.
  it('rejects a Medium portal declared at 61 minutes with timeOutOfRange', async () => {
    const replyModule = await import('@/utils/reply.js');
    const replyErrorSpy = vi.spyOn(replyModule, 'replyError').mockResolvedValue(undefined);

    const { interaction, command } = buildInteractionWithContainer({
      type: TYPE_ANCIENT_LANDS_PORTAL,
      rarity: RARITY_MEDIUM,
      map: MAP_ELDERSLEEP,
      time: '61',
    });

    await command.chatInputRun(interaction);

    expect(replyErrorSpy).toHaveBeenCalledWith(interaction, 'timeOutOfRange');
    expect(createObjectiveMock).not.toHaveBeenCalled();

    replyErrorSpy.mockRestore();
  });

  // AC-9: a Large portal declared with 181 minutes exceeds its 180-minute cap.
  it('rejects a Large portal declared at 181 minutes with timeOutOfRange', async () => {
    const replyModule = await import('@/utils/reply.js');
    const replyErrorSpy = vi.spyOn(replyModule, 'replyError').mockResolvedValue(undefined);

    const { interaction, command } = buildInteractionWithContainer({
      type: TYPE_ANCIENT_LANDS_PORTAL,
      rarity: RARITY_LARGE,
      map: MAP_ELDERSLEEP,
      time: '181',
    });

    await command.chatInputRun(interaction);

    expect(replyErrorSpy).toHaveBeenCalledWith(interaction, 'timeOutOfRange');
    expect(createObjectiveMock).not.toHaveBeenCalled();

    replyErrorSpy.mockRestore();
  });

  // AC-10: a value exactly at the portal's cap is accepted and stored unchanged (no rounding).
  it('accepts a Small portal declared at exactly 30 minutes and stores it unchanged', async () => {
    createObjectiveMock.mockResolvedValue({ id: 1 });

    const { interaction, command } = buildInteractionWithContainer({
      type: TYPE_ANCIENT_LANDS_PORTAL,
      rarity: RARITY_SMALL,
      map: MAP_ELDERSLEEP,
      time: '30',
    });

    await command.chatInputRun(interaction);

    expect(createObjectiveMock).toHaveBeenCalled();
    const [payload] = createObjectiveMock.mock.calls[0] as [{ time: Date }];
    const minutesStored = Math.round((payload.time.getTime() - Date.now()) / 60000);

    expect(minutesStored).toBe(30);
  });

  // AC-11: "1h90" on a Small portal is both malformed (composed-form minutes >= 60) and, read as
  // a raw quantity, out of range for a 30-minute cap — the format error must win.
  it('reports invalidTimeFormat, never timeOutOfRange, for "1h90" on a Small portal', async () => {
    const replyModule = await import('@/utils/reply.js');
    const replyErrorSpy = vi.spyOn(replyModule, 'replyError').mockResolvedValue(undefined);

    const { interaction, command } = buildInteractionWithContainer({
      type: TYPE_ANCIENT_LANDS_PORTAL,
      rarity: RARITY_SMALL,
      map: MAP_ELDERSLEEP,
      time: '1h90',
    });

    await command.chatInputRun(interaction);

    expect(replyErrorSpy).toHaveBeenCalledWith(interaction, 'invalidTimeFormat');
    expect(replyErrorSpy).not.toHaveBeenCalledWith(interaction, 'timeOutOfRange');
    expect(createObjectiveMock).not.toHaveBeenCalled();

    replyErrorSpy.mockRestore();
  });

  // Non-regression: a non-portal type keeps the 1440-minute cap.
  it('accepts a Core objective declared at 1000 minutes (well under the default 1440 cap)', async () => {
    createObjectiveMock.mockResolvedValue({ id: 1 });

    const { interaction, command } = buildInteractionWithContainer({
      type: TYPE_CORE,
      rarity: RARITY_LEGENDARY,
      map: MAP_ELDERSLEEP,
      time: '1000',
    });

    await command.chatInputRun(interaction);

    expect(createObjectiveMock).toHaveBeenCalled();
  });
});

describe('AddObjectiveCommand reverse type autocomplete narrowed by portal size (plan 2.4)', () => {
  // Choosing a portal size must narrow the type autocomplete to the portal type only.
  it('narrows type suggestions to Ancient Lands Portal once a portal size is chosen', async () => {
    const command = Object.create(AddObjectiveCommand.prototype) as AddObjectiveCommand;
    const respond = vi.fn().mockResolvedValue(undefined);
    const interaction = {
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

describe('AddObjectiveCommand royal map guard (AC-M5, AC-M6, AC-24, AC-25)', () => {
  const buildInteractionWithContainer = (values: {
    type: string | null;
    rarity: string | null;
    map: string | null;
    time: string | null;
  }): {
    interaction: Command.ChatInputCommandInteraction;
    reply: ReturnType<typeof vi.fn<(payload: FakeReplyPayload) => Promise<void>>>;
    command: AddObjectiveCommand;
  } => {
    const { interaction, reply } = buildChatInputInteraction(values);
    const command = Object.create(AddObjectiveCommand.prototype) as AddObjectiveCommand;

    Object.defineProperty(command, 'container', {
      value: {
        client: {
          channels: { fetch: vi.fn().mockResolvedValue({ id: 'channel-1' }) },
        },
      },
    });

    return { interaction, reply, command };
  };

  beforeEach(() => {
    createObjectiveMock.mockReset();
    findAllObjectiveMock.mockReset();
    findAllObjectiveMock.mockResolvedValue([]);
  });

  // AC-M5 / AC-24: the guard also catches free typing, which bypasses autocomplete entirely.
  it('rejects a Royal map on a non-Dragon type with unexpectedRoyalMap', async () => {
    const { interaction, reply, command } = buildInteractionWithContainer({
      type: TYPE_CORE,
      rarity: RARITY_LEGENDARY,
      map: MAPS_ROYAL[0],
      time: '30',
    });

    await command.chatInputRun(interaction);

    expect(reply.mock.calls[0]?.[0]?.content).toBe(
      'This map is in the Royal continent, which only Dragon attacks can use',
    );
    expect(createObjectiveMock).not.toHaveBeenCalled();
  });

  it('accepts a Royal map on a Dragon', async () => {
    createObjectiveMock.mockResolvedValue({ id: 1 });

    const { interaction, command } = buildInteractionWithContainer({
      type: TYPE_DRAGON,
      rarity: RARITY_NONE,
      map: MAPS_ROYAL[0],
      time: '30',
    });

    await command.chatInputRun(interaction);

    expect(createObjectiveMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: TYPE_DRAGON, map: MAPS_ROYAL[0] }),
    );
  });

  // AC-M6 / AC-25: the Dragon admits both zones, so a Black Zone map stays valid for it.
  it('accepts a Black Zone map on a Dragon', async () => {
    createObjectiveMock.mockResolvedValue({ id: 2 });

    const { interaction, command } = buildInteractionWithContainer({
      type: TYPE_DRAGON,
      rarity: RARITY_NONE,
      map: MAP_ELDERSLEEP,
      time: '30',
    });

    await command.chatInputRun(interaction);

    expect(createObjectiveMock).toHaveBeenCalledWith(
      expect.objectContaining({ type: TYPE_DRAGON, map: MAP_ELDERSLEEP }),
    );
  });
});

describe('AddObjectiveCommand map autocomplete by zone (AC-M1..AC-M4, AC-21..AC-23)', () => {
  const buildMapAutocomplete = (
    focusedName: string,
    values: { type?: string | null; rarity?: string | null; map?: string | null },
  ): { interaction: Command.AutocompleteInteraction; respond: ReturnType<typeof vi.fn>} => {
    const respond = vi.fn().mockResolvedValue(undefined);
    const interaction = {
      options: {
        getFocused: () => ({ name: focusedName, value: '' }),
        getString: (name: string) => {
          if (name === 'type') {
            return values.type ?? null;
          }

          if (name === 'rarity') {
            return values.rarity ?? null;
          }

          if (name === 'map') {
            return values.map ?? null;
          }

          return null;
        },
      },
      respond,
    } as unknown as Command.AutocompleteInteraction;

    return { interaction, respond };
  };

  const respondedNames = (respond: ReturnType<typeof vi.fn>): string[] =>
    (respond.mock.calls[0]?.[0] as { name: string }[]).map((choice) => choice.name);

  // AC-M3 / AC-22: a non-Dragon type never sees a Royal map.
  it('proposes only Black Zone maps for a non-Dragon type', async () => {
    const command = Object.create(AddObjectiveCommand.prototype) as AddObjectiveCommand;
    const { interaction, respond } = buildMapAutocomplete('map', { type: TYPE_NODE_ORE });

    await command.autocompleteRun(interaction);

    const names = respondedNames(respond);

    expect(names.every((name) => MAPS_BLACK_ZONE.includes(name))).toBe(true);
    expect(names.some((name) => MAPS_ROYAL.includes(name))).toBe(false);
  });

  // AC-M1 / AC-M2 / AC-21: Dragon sees both zones, sorted across the union.
  it('proposes both zones sorted alphabetically for Dragon', async () => {
    const command = Object.create(AddObjectiveCommand.prototype) as AddObjectiveCommand;
    const { interaction, respond } = buildMapAutocomplete('map', { type: TYPE_DRAGON });

    await command.autocompleteRun(interaction);

    const names = respondedNames(respond);

    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(names).toEqual(MAPS_ALL_SORTED.slice(0, names.length));
  });

  // AC-M4 / AC-23: with no type chosen yet, no map is hidden.
  it('proposes both zones when no type is chosen', async () => {
    const command = Object.create(AddObjectiveCommand.prototype) as AddObjectiveCommand;
    const { interaction, respond } = buildMapAutocomplete('map', { type: null });

    await command.autocompleteRun(interaction);

    expect(respondedNames(respond)).toEqual(MAPS_ALL_SORTED.slice(0, 25));
  });

  // AC-M8 / AC-27: a Royal map already typed narrows the type autocomplete to Dragon.
  it('narrows type autocomplete to Dragon when a Royal map is already set', async () => {
    const command = Object.create(AddObjectiveCommand.prototype) as AddObjectiveCommand;
    const { interaction, respond } = buildMapAutocomplete('type', { map: MAPS_ROYAL[0] });

    await command.autocompleteRun(interaction);

    expect(respondedNames(respond)).toEqual([TYPE_DRAGON]);
  });

  it('keeps every type available when a Black Zone map is already set', async () => {
    const command = Object.create(AddObjectiveCommand.prototype) as AddObjectiveCommand;
    const { interaction, respond } = buildMapAutocomplete('type', { map: MAPS_BLACK_ZONE[0] });

    await command.autocompleteRun(interaction);

    expect(respondedNames(respond)).toContain(TYPE_NODE_ORE);
    expect(respondedNames(respond)).toContain(TYPE_DRAGON);
  });
});
