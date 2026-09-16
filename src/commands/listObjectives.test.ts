import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Command } from '@sapphire/framework';

import { ListObjectivesCommand } from '@/commands/listObjectives.js';

const { findObjectiveByGuildIdMock, recordLastUsedChannelMock } = vi.hoisted(() => ({
  findObjectiveByGuildIdMock: vi.fn(),
  recordLastUsedChannelMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/services/objective.service.js', () => ({
  findObjectiveByGuildId: findObjectiveByGuildIdMock,
}));

vi.mock('@/services/guildSettings.service.js', () => ({
  recordLastUsedChannel: recordLastUsedChannelMock,
}));

vi.mock('@/tasks/message.js', () => ({
  deletePreviousMessage: vi.fn().mockResolvedValue(undefined),
  getMessage: vi.fn().mockResolvedValue([]),
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

const createCommand = (): ListObjectivesCommand => {
  const command = Object.create(ListObjectivesCommand.prototype) as ListObjectivesCommand;

  Object.defineProperty(command, 'container', {
    value: {
      client: {
        channels: { fetch: vi.fn().mockResolvedValue({ id: 'channel-1' }) },
      },
    },
  });

  return command;
};

describe('ListObjectivesCommand last used channel (guild-settings AC-9)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findObjectiveByGuildIdMock.mockResolvedValue([]);
  });

  it('records the interaction channel as the last one used by the guild', async () => {
    const { interaction } = buildInteraction();

    await createCommand().chatInputRun(interaction);

    expect(recordLastUsedChannelMock).toHaveBeenCalledWith('guild-1', 'channel-1');
  });

  it('records the channel the command was actually run in', async () => {
    const { interaction } = buildInteraction({ channelId: 'channel-77' });

    await createCommand().chatInputRun(interaction);

    expect(recordLastUsedChannelMock).toHaveBeenCalledWith('guild-1', 'channel-77');
  });

  it('records nothing when the command runs outside a guild', async () => {
    const { interaction } = buildInteraction({ guildId: null });

    await createCommand().chatInputRun(interaction);

    expect(recordLastUsedChannelMock).not.toHaveBeenCalled();
  });
});
