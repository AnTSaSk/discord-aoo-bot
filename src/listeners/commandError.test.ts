import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChatInputCommandErrorPayload } from '@sapphire/framework';

const mockLogger = {
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
};

vi.mock('@/config/logger.js', () => ({
  getLogger: (): typeof mockLogger => mockLogger,
}));

import { CommandErrorListener } from '@/listeners/commandError.js';

describe('CommandErrorListener', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const buildPayload = (guildId: string | null): ChatInputCommandErrorPayload =>
    ({
      command: { name: 'addobjective' },
      interaction: {
        guildId,
        user: { id: 'user-456' },
      },
      duration: 12,
    }) as unknown as ChatInputCommandErrorPayload;

  it('discord-event-listeners AC-4 / logging AC-LOG-2 logs exactly command, guildId and error, without the user id', () => {
    const listener = new CommandErrorListener(
      {} as never,
      { event: 'chatInputCommandError' },
    );
    const commandError = new Error('boom');

    listener.run(commandError, buildPayload('guild-123'));

    expect(mockLogger.error).toHaveBeenCalledWith(
      { command: 'addobjective', guildId: 'guild-123', error: commandError },
      'Command execution error',
    );
  });

  it('discord-event-listeners AC-4 logs a null guildId for a command run outside a guild', () => {
    const listener = new CommandErrorListener(
      {} as never,
      { event: 'chatInputCommandError' },
    );
    const commandError = new Error('boom');

    listener.run(commandError, buildPayload(null));

    expect(mockLogger.error).toHaveBeenCalledWith(
      { command: 'addobjective', guildId: null, error: commandError },
      'Command execution error',
    );
  });
});
