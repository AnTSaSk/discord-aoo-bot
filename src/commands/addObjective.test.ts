import { describe, it, expect, vi } from 'vitest';
import { type MessageFlags } from 'discord.js';
import type { Command } from '@sapphire/framework';

import { AddObjectiveCommand } from '@/commands/addObjective.js';
import { TYPE_CORE, TYPE_NODE_ORE } from '@/constants/type.js';
import { RARITY_LEGENDARY } from '@/constants/rarity.js';
import { MAP_ELDERSLEEP } from '@/constants/map.js';

vi.mock('@/services/objective.service.js', () => ({
  createObjective: vi.fn(),
  findAllObjective: vi.fn(),
  findObjectiveByGuildId: vi.fn(),
}));

vi.mock('@/tasks/message.js', () => ({
  deletePreviousMessage: vi.fn(),
  getMessage: vi.fn().mockResolvedValue([]),
  sendMessageBatches: vi.fn(),
}));

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
