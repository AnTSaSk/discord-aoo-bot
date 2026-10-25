import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Guild } from 'discord.js';

import { GuildCreateListener } from '@/listeners/guildCreate.js';
import { getAnnounceableVersion } from '@/tasks/announcement.js';

const {
  updateGuildSettingsMock,
  clearGuildRemovalMock,
  resolveWelcomeChannelMock,
  loggerInfoMock,
} = vi.hoisted(() => ({
  updateGuildSettingsMock: vi.fn().mockResolvedValue(undefined),
  clearGuildRemovalMock: vi.fn().mockResolvedValue(undefined),
  resolveWelcomeChannelMock: vi.fn(),
  loggerInfoMock: vi.fn(),
}));

vi.mock('@/services/guildSettings.service.js', () => ({
  updateGuildSettings: updateGuildSettingsMock,
  clearGuildRemoval: clearGuildRemovalMock,
}));

vi.mock('@/utils/permissions.js', () => ({
  resolveWelcomeChannel: resolveWelcomeChannelMock,
}));

vi.mock('@/config/logger.js', () => ({
  getLogger: () => ({ info: loggerInfoMock, warn: vi.fn(), error: vi.fn() }),
}));

interface SentPayload {
  components: unknown[];
  flags: number;
}

const buildGuild = (): Guild =>
  ({ id: 'guild-1', name: 'Test Guild', memberCount: 42 }) as unknown as Guild;

const buildChannel = (): { channel: unknown; send: ReturnType<typeof vi.fn> } => {
  const send = vi.fn<(payload: SentPayload) => Promise<void>>().mockResolvedValue(undefined);

  return { channel: { id: 'channel-1', send }, send };
};

const createListener = (): GuildCreateListener =>
  Object.create(GuildCreateListener.prototype) as GuildCreateListener;

describe('GuildCreateListener welcome message (AC-23, AC-25)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts a welcome message presenting /settings and the legal links (AC-23)', async () => {
    const { channel, send } = buildChannel();

    resolveWelcomeChannelMock.mockReturnValue(channel);

    await createListener().run(buildGuild());

    const payload = send.mock.calls[0]?.[0] as SentPayload;
    const text = JSON.stringify(payload.components);

    expect(send).toHaveBeenCalled();
    expect(text).toContain('/settings');
    expect(text).toContain('/privacy');
    expect(text).toContain('/terms');
  });

  it('never sends a bare everyone mention in the welcome message (AC-22b)', async () => {
    const { channel, send } = buildChannel();

    resolveWelcomeChannelMock.mockReturnValue(channel);

    await createListener().run(buildGuild());

    const text = JSON.stringify(send.mock.calls[0]?.[0]);
    const stripped = text.replace(/`[^`]*`/g, '');

    expect(stripped).not.toContain('@everyone');
  });

  it('never lets an unexpected failure escape the listener (AC-25)', async () => {
    resolveWelcomeChannelMock.mockImplementation(() => {
      throw new TypeError('guild shape unexpected');
    });

    await expect(createListener().run(buildGuild())).resolves.toBeUndefined();
  });

  it('sends nothing and raises no error when no channel is resolvable (AC-25)', async () => {
    resolveWelcomeChannelMock.mockReturnValue(null);

    await expect(createListener().run(buildGuild())).resolves.toBeUndefined();
  });

  it('still logs the join when no channel is resolvable (non-regression)', async () => {
    resolveWelcomeChannelMock.mockReturnValue(null);

    await createListener().run(buildGuild());

    expect(loggerInfoMock).toHaveBeenCalledWith(
      expect.objectContaining({ guildId: 'guild-1', name: 'Test Guild', memberCount: 42 }),
      expect.any(String),
    );
  });

  it('keeps logging the join with its context when a channel is resolvable (non-regression)', async () => {
    const { channel } = buildChannel();

    resolveWelcomeChannelMock.mockReturnValue(channel);

    await createListener().run(buildGuild());

    expect(loggerInfoMock).toHaveBeenCalledWith(
      expect.objectContaining({ guildId: 'guild-1', name: 'Test Guild', memberCount: 42 }),
      expect.any(String),
    );
  });
});

describe('GuildCreateListener version marking (AC-26)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks the published version as already announced for the new guild (AC-26)', async () => {
    const { channel } = buildChannel();

    resolveWelcomeChannelMock.mockReturnValue(channel);

    await createListener().run(buildGuild());

    expect(updateGuildSettingsMock).toHaveBeenCalledWith('guild-1', {
      lastAnnouncedVersion: getAnnounceableVersion()?.version,
    });
  });

  it('marks the version even when no welcome channel is available (AC-26)', async () => {
    resolveWelcomeChannelMock.mockReturnValue(null);

    await createListener().run(buildGuild());

    expect(updateGuildSettingsMock).toHaveBeenCalledWith('guild-1', {
      lastAnnouncedVersion: getAnnounceableVersion()?.version,
    });
  });
});

describe('GuildCreateListener removal cancellation (AC-PURGE-4, AC-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('AC-PURGE-4 / AC-2: clears the pending removal date of the joined guild', async () => {
    const { channel } = buildChannel();

    resolveWelcomeChannelMock.mockReturnValue(channel);

    await createListener().run(buildGuild());

    expect(clearGuildRemovalMock).toHaveBeenCalledTimes(1);
    expect(clearGuildRemovalMock).toHaveBeenCalledWith('guild-1');
  });

  it('AC-PURGE-4: clears the removal date before sending the welcome message', async () => {
    const { channel, send } = buildChannel();

    resolveWelcomeChannelMock.mockReturnValue(channel);

    await createListener().run(buildGuild());

    const clearOrder = clearGuildRemovalMock.mock.invocationCallOrder[0];
    const sendOrder = send.mock.invocationCallOrder[0];

    expect(clearOrder).toBeLessThan(sendOrder);
  });

  it('AC-2: logs the join before clearing the removal date', async () => {
    resolveWelcomeChannelMock.mockReturnValue(null);

    await createListener().run(buildGuild());

    const logOrder = loggerInfoMock.mock.invocationCallOrder[0];
    const clearOrder = clearGuildRemovalMock.mock.invocationCallOrder[0];

    expect(logOrder).toBeLessThan(clearOrder);
  });

  it('AC-PURGE-4 / AC-2: contains a clearing failure and still logs the join', async () => {
    resolveWelcomeChannelMock.mockReturnValue(null);
    clearGuildRemovalMock.mockRejectedValueOnce(new Error('db down'));

    await expect(createListener().run(buildGuild())).resolves.toBeUndefined();

    expect(clearGuildRemovalMock).toHaveBeenCalledWith('guild-1');
    expect(loggerInfoMock).toHaveBeenCalledWith(
      expect.objectContaining({ guildId: 'guild-1', name: 'Test Guild', memberCount: 42 }),
      expect.any(String),
    );
  });
});
