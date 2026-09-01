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

  it('logs command name, guildId, userId and the error at error level (AC-4)', () => {
    const listener = new CommandErrorListener(
      {} as never,
      { event: 'chatInputCommandError' },
    );
    const commandError = new Error('boom');
    const payload = {
      command: { name: 'addobjective' },
      interaction: {
        guildId: 'guild-123',
        user: { id: 'user-456' },
      },
      duration: 12,
    } as unknown as ChatInputCommandErrorPayload;

    listener.run(commandError, payload);

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'addobjective',
        guildId: 'guild-123',
        userId: 'user-456',
        error: commandError,
      }),
      expect.any(String),
    );
  });
});
