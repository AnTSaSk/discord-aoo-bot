import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Command } from '@sapphire/framework';

import { AboutCommand } from '@/commands/about.js';
import { getAnnounceableVersion } from '@/tasks/announcement.js';
import { PRIVACY_URL, TERMS_URL, WEBSITE_URL } from '@/constants/config.js';

interface FakeReplyPayload {
  content: string;
}

const buildInteraction = (): {
  interaction: Command.ChatInputCommandInteraction;
  reply: ReturnType<typeof vi.fn<(payload: FakeReplyPayload) => Promise<void>>>;
} => {
  const reply = vi.fn<(payload: FakeReplyPayload) => Promise<void>>().mockResolvedValue(undefined);
  const interaction = { reply } as unknown as Command.ChatInputCommandInteraction;

  return { interaction, reply };
};

const createCommand = (): AboutCommand => Object.create(AboutCommand.prototype) as AboutCommand;

describe('/about content (AC-27)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('replies with the bot version', async () => {
    const { interaction, reply } = buildInteraction();

    await createCommand().chatInputRun(interaction);

    const content = reply.mock.calls[0]?.[0]?.content ?? '';

    expect(content).toContain(getAnnounceableVersion()?.version ?? '');
  });

  it('replies with the website link', async () => {
    const { interaction, reply } = buildInteraction();

    await createCommand().chatInputRun(interaction);

    expect(reply.mock.calls[0]?.[0]?.content).toContain(WEBSITE_URL);
  });

  it('replies with both legal documents, as the developer terms require', async () => {
    const { interaction, reply } = buildInteraction();

    await createCommand().chatInputRun(interaction);

    const content = reply.mock.calls[0]?.[0]?.content ?? '';

    expect(content).toContain(TERMS_URL);
    expect(content).toContain(PRIVACY_URL);
  });
});

describe('/about accessibility (AC-28)', () => {
  it('answers a member holding no permission at all, so anyone can reach the legal links', async () => {
    const { interaction, reply } = buildInteraction();

    await createCommand().chatInputRun(interaction);

    const content = reply.mock.calls[0]?.[0]?.content ?? '';

    expect(reply).toHaveBeenCalled();
    expect(content).toContain(TERMS_URL);
  });

  it('registers the command without gating it behind a member permission', () => {
    let captured: { permissions?: unknown } | null = null;

    const registry = {
      registerChatInputCommand: (factory: (builder: unknown) => unknown) => {
        const builder = {
          setName: () => builder,
          setDescription: () => builder,
          setIntegrationTypes: () => builder,
          setContexts: () => builder,
          setDefaultMemberPermissions: (value: unknown) => {
            captured = { permissions: value };

            return builder;
          },
        };

        factory(builder);
      },
    } as unknown as Command.Registry;

    const command = createCommand();

    Object.defineProperty(command, 'name', { value: 'about' });
    Object.defineProperty(command, 'description', { value: 'About the bot' });

    command.registerApplicationCommands(registry);

    expect(captured).toBeNull();
  });
});
