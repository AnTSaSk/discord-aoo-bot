import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Guild } from 'discord.js';

const mockLogger = {
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
};

vi.mock('@/config/logger.js', () => ({
  getLogger: (): typeof mockLogger => mockLogger,
}));

const destroySpy = vi.fn();

vi.mock('@/models/objective.model.js', () => ({
  getObjectiveModel: () => ({ destroy: destroySpy }),
}));

import { GuildCreateListener } from '@/listeners/guildCreate.js';
import { GuildDeleteListener } from '@/listeners/guildDelete.js';

const buildGuild = (memberCount: number): Guild =>
  ({
    id: 'guild-123',
    name: 'Test Guild',
    memberCount,
  }) as unknown as Guild;

describe('GuildCreateListener', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs guildId, name and member count at info level (AC-2)', async () => {
    const listener = new GuildCreateListener({} as never, { event: 'guildCreate' });
    const guild = buildGuild(42);

    await listener.run(guild);

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ guildId: 'guild-123', name: 'Test Guild', memberCount: 42 }),
      expect.any(String),
    );
  });
});

describe('GuildDeleteListener', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs guildId and name at info level (AC-3)', () => {
    const listener = new GuildDeleteListener({} as never, { event: 'guildDelete' });
    const guild = buildGuild(42);

    listener.run(guild);

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ guildId: 'guild-123', name: 'Test Guild' }),
      expect.any(String),
    );
  });

  it('does not invoke any data destruction function (AC-3)', () => {
    const listener = new GuildDeleteListener({} as never, { event: 'guildDelete' });
    const guild = buildGuild(42);

    listener.run(guild);

    expect(destroySpy).not.toHaveBeenCalled();
  });
});
