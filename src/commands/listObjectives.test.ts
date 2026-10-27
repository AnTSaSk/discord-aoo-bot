import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Command } from '@sapphire/framework';

import { ListObjectivesCommand } from '@/commands/listObjectives.js';
import type { Objective } from '@/models/objective.model.js';

const { getActiveObjectivesMock, getMessageMock, recordLastUsedChannelMock, loggerMock } = vi.hoisted(() => ({
  getActiveObjectivesMock: vi.fn(),
  getMessageMock: vi.fn().mockResolvedValue([]),
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

vi.mock('@/services/objective.service.js', () => ({
  getActiveObjectives: getActiveObjectivesMock,
}));

vi.mock('@/services/guildSettings.service.js', () => ({
  recordLastUsedChannel: recordLastUsedChannelMock,
}));

vi.mock('@/tasks/message.js', () => ({
  deletePreviousMessage: vi.fn().mockResolvedValue(undefined),
  getMessage: getMessageMock,
  sendMessageBatches: vi.fn().mockResolvedValue(undefined),
}));

interface FakeReplyPayload {
  content: string;
}

const buildInteraction = (
  options?: { guildId?: string | null; channelId?: string },
): {
  interaction: Command.ChatInputCommandInteraction;
  reply: ReturnType<typeof vi.fn<(payload: FakeReplyPayload) => Promise<void>>>;
} => {
  const reply = vi.fn<(payload: FakeReplyPayload) => Promise<void>>().mockResolvedValue(undefined);
  const channel = { id: options?.channelId ?? 'channel-1' };

  const interaction = {
    guildId: options?.guildId === undefined ? 'guild-1' : options.guildId,
    channelId: options?.channelId ?? 'channel-1',
    channel,
    user: { id: 'user-1' },
    reply,
  } as unknown as Command.ChatInputCommandInteraction;

  return { interaction, reply };
};

const createCommand = (): { command: ListObjectivesCommand; client: object } => {
  const command = Object.create(ListObjectivesCommand.prototype) as ListObjectivesCommand;
  const client = {
    channels: { fetch: vi.fn().mockResolvedValue({ id: 'channel-1' }) },
  };

  Object.defineProperty(command, 'container', {
    value: { client },
  });

  return { command, client };
};

describe('ListObjectivesCommand last used channel (guild-settings AC-9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getActiveObjectivesMock.mockResolvedValue([]);
  });

  it('records the interaction channel as the last one used by the guild', async () => {
    const { interaction } = buildInteraction();

    await createCommand().command.chatInputRun(interaction);

    expect(recordLastUsedChannelMock).toHaveBeenCalledWith('guild-1', 'channel-1');
  });

  it('records the channel the command was actually run in', async () => {
    const { interaction } = buildInteraction({ channelId: 'channel-77' });

    await createCommand().command.chatInputRun(interaction);

    expect(recordLastUsedChannelMock).toHaveBeenCalledWith('guild-1', 'channel-77');
  });

  it('records nothing when the command runs outside a guild', async () => {
    const { interaction } = buildInteraction({ guildId: null });

    await createCommand().command.chatInputRun(interaction);

    expect(recordLastUsedChannelMock).not.toHaveBeenCalled();
  });
});

describe('ListObjectivesCommand log lines (logging AC-LOG-1, AC-LOG-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logging AC-LOG-2 logs exactly guildId and objectivesCount when objectives are listed', async () => {
    getActiveObjectivesMock.mockResolvedValue([{ id: 7 }, { id: 8 }]);

    const { interaction } = buildInteraction();

    await createCommand().command.chatInputRun(interaction);

    expect(loggerMock.info).toHaveBeenCalledWith(
      { guildId: 'guild-1', objectivesCount: 2 },
      'List command executed successfully',
    );
  });

  it('logging AC-LOG-2 logs exactly guildId when there is no objective', async () => {
    getActiveObjectivesMock.mockResolvedValue([]);

    const { interaction } = buildInteraction();

    await createCommand().command.chatInputRun(interaction);

    expect(loggerMock.info).toHaveBeenCalledWith(
      { guildId: 'guild-1' },
      'List command executed - no objectives',
    );
  });
});

describe('ListObjectivesCommand board source (objective-selection AC-1, AC-3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-16T09:30:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('objective-selection AC-1 / AC-3: renders the board from getActiveObjectives(guildId), without re-filtering it locally', async () => {
    const activeObjectives = [
      { id: 7, guildId: 'guild-1', type: 'Core', time: new Date('2026-10-16T09:00:00Z') },
      { id: 8, guildId: 'guild-1', type: 'Dragon', time: new Date('2026-10-16T10:00:00Z') },
    ] as unknown as Objective[];

    getActiveObjectivesMock.mockResolvedValue(activeObjectives);

    const { command, client } = createCommand();
    const { interaction } = buildInteraction();

    await command.chatInputRun(interaction);

    expect(getActiveObjectivesMock).toHaveBeenCalledWith('guild-1');
    expect(getMessageMock).toHaveBeenCalledWith(client, 'objective', activeObjectives);
  });
});
