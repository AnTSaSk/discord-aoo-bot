import { describe, it, expect, vi } from 'vitest';
import { MessageFlags } from 'discord.js';
import type { Command } from '@sapphire/framework';

import { replyError } from '@/utils/reply.js';

interface ReplyPayload {
  content: string;
  flags: MessageFlags.Ephemeral;
}

const buildInteraction = (): {
  interaction: Command.ChatInputCommandInteraction;
  reply: ReturnType<typeof vi.fn<(payload: ReplyPayload) => Promise<void>>>;
} => {
  const reply = vi.fn<(payload: ReplyPayload) => Promise<void>>().mockResolvedValue(undefined);
  const interaction = { reply } as unknown as Command.ChatInputCommandInteraction;

  return { interaction, reply };
};

describe('replyError new error keys (command-errors AC-1)', () => {
  it('gives invalidTimeFormat, timeOutOfRange and invalidTypeRarity each a distinct, non-empty message', async () => {
    const messages = await Promise.all(
      (['invalidTimeFormat', 'timeOutOfRange', 'invalidTypeRarity'] as const).map(async (type) => {
        const { interaction, reply } = buildInteraction();

        await replyError(interaction, type);

        return reply.mock.calls[0]?.[0]?.content;
      }),
    );

    for (const content of messages) {
      expect(content.length).toBeGreaterThan(0);
    }

    expect(new Set(messages).size).toBe(messages.length);
  });

  it('sends an ephemeral reply for a new error key (AC-2)', async () => {
    const { interaction, reply } = buildInteraction();

    await replyError(interaction, 'invalidTypeRarity');

    expect(reply.mock.calls[0]?.[0]?.flags).toBe(MessageFlags.Ephemeral);
  });

  it('enumerates the accepted formats in the invalidTimeFormat message (AC-4)', async () => {
    const { interaction, reply } = buildInteraction();

    await replyError(interaction, 'invalidTimeFormat');

    const content = reply.mock.calls[0]?.[0]?.content;

    expect(content).toMatch(/\d+[hH:]\d+|HH:mm|hh:mm/);
  });

  it.each(['invalidTimeFormat', 'timeOutOfRange', 'invalidTypeRarity'] as const)(
    'never leaks a database id, exception trace, or database object name in %s (AC-3)',
    async (type) => {
      const { interaction, reply } = buildInteraction();

      await replyError(interaction, type);

      const content = reply.mock.calls[0]?.[0]?.content;

      expect(content).not.toMatch(
        /objective(s)?Id|stack trace|Sequelize|Objective(Model)?\b|column|table/i,
      );
    },
  );
});
