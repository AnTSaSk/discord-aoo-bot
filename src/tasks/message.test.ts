import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DiscordAPIError, TextDisplayBuilder } from 'discord.js';
import type { SapphireClient } from '@sapphire/framework';

import { getMessage } from '@/tasks/message.js';
import type { Objective } from '@/models/objective.model.js';

const warnMock = vi.fn();

vi.mock('@/config/logger.js', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: warnMock,
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

const buildObjective = (overrides: Partial<Objective>): Objective =>
  ({
    id: 1,
    guildId: 'guild-1',
    channelId: 'channel-1',
    userId: 'user-1',
    type: 'Core',
    rarity: 'Common',
    map: 'Thetford',
    time: new Date('2099-01-01T12:00:00.000Z'),
    maintenanceAdded: false,
    ...overrides,
  }) as Objective;

interface MemberStub {
  displayName: string;
}

interface UserStub {
  displayName: string;
}

interface ClientStubOptions {
  members?: Partial<Record<string, MemberStub>>;
  users?: Partial<Record<string, UserStub>>;
  guildFetchRejects?: boolean;
  memberFetchRejectsWith?: Error;
}

// Real DiscordAPIError instances: the production guard discriminates on the class
const unknownMemberError = (): Error =>
  new DiscordAPIError(
    { code: 10007, message: 'Unknown Member' },
    10007,
    404,
    'GET',
    'https://discord.com/api/v10/guilds/guild-1/members/user-1',
    {},
  );

const serverError = (): Error =>
  new DiscordAPIError(
    { code: 0, message: 'Internal Server Error' },
    0,
    500,
    'GET',
    'https://discord.com/api/v10/guilds/guild-1/members/user-1',
    {},
  );

const buildClient = (
  options: ClientStubOptions = {},
): {
  client: SapphireClient;
  memberFetch: ReturnType<typeof vi.fn>;
  userFetch: ReturnType<typeof vi.fn>;
  guildFetch: ReturnType<typeof vi.fn>;
} => {
  const { members = {}, users = {}, guildFetchRejects = false, memberFetchRejectsWith } = options;

  // Returns the raw GuildMember the API would give, or rejects like discord.js does
  const memberFetch = vi.fn((userId: string) => {
    if (memberFetchRejectsWith) {
      return Promise.reject(memberFetchRejectsWith);
    }

    const member = members[userId];

    if (!member) {
      return Promise.reject(unknownMemberError());
    }

    return Promise.resolve(member);
  });

  const userFetch = vi.fn((userId: string) => {
    const user = users[userId];

    if (!user) {
      return Promise.reject(unknownMemberError());
    }

    return Promise.resolve(user);
  });

  const guildFetch = vi.fn(() =>
    guildFetchRejects ?
      Promise.reject(serverError()) :
      Promise.resolve({ members: { fetch: memberFetch } }),
  );

  const client = {
    guilds: { fetch: guildFetch },
    users: { fetch: userFetch },
  } as unknown as SapphireClient;

  return { client, memberFetch, userFetch, guildFetch };
};

const renderedText = (batches: unknown[][]): string =>
  batches
    .flat()
    .filter((component): component is TextDisplayBuilder => component instanceof TextDisplayBuilder)
    .map((component) => component.data.content ?? '')
    .join('\n');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getMessage — author resolution', () => {
  it('displays the GuildMember displayName, i.e. the server nickname (AC-1)', async () => {
    const { client } = buildClient({
      members: { 'user-1': { displayName: 'ServerNickname' } },
      users: { 'user-1': { displayName: 'GlobalAccountName' } },
    });

    const batches = await getMessage(client, 'objective', [buildObjective({ userId: 'user-1' })]);

    expect(renderedText(batches)).toContain('Objective added by ServerNickname');
    expect(renderedText(batches)).not.toContain('GlobalAccountName');
  });

  it('falls back to the global User displayName when the author left the server (AC-2)', async () => {
    const { client } = buildClient({
      members: {},
      users: { 'user-1': { displayName: 'GlobalAccountName' } },
    });

    const batches = await getMessage(client, 'objective', [buildObjective({ userId: 'user-1' })]);

    expect(renderedText(batches)).toContain('Objective added by GlobalAccountName');
  });

  it('falls back to Unknown when neither member nor global user resolves (AC-3)', async () => {
    const { client } = buildClient({ members: {}, users: {} });

    const batches = await getMessage(client, 'objective', [buildObjective({ userId: 'user-1' })]);

    expect(renderedText(batches)).toContain('Objective added by Unknown');
  });

  it('displays the nickname of the rendered server, not a global name (AC-4)', async () => {
    const guildOne = buildClient({
      members: { 'user-1': { displayName: 'NicknameOnGuildOne' } },
      users: { 'user-1': { displayName: 'GlobalAccountName' } },
    });
    const guildTwo = buildClient({
      members: { 'user-1': { displayName: 'NicknameOnGuildTwo' } },
      users: { 'user-1': { displayName: 'GlobalAccountName' } },
    });

    const batchesOne = await getMessage(guildOne.client, 'objective', [buildObjective({ userId: 'user-1', guildId: 'guild-1' })]);
    const batchesTwo = await getMessage(guildTwo.client, 'objective', [buildObjective({ userId: 'user-1', guildId: 'guild-2' })]);

    expect(renderedText(batchesOne)).toContain('NicknameOnGuildOne');
    expect(renderedText(batchesTwo)).toContain('NicknameOnGuildTwo');
    expect(guildTwo.guildFetch).toHaveBeenCalledWith('guild-2');
  });
});

describe('getMessage — resolution batching', () => {
  it('issues exactly one member request per distinct author (AC-5)', async () => {
    const { client, memberFetch } = buildClient({
      members: {
        'user-1': { displayName: 'One' },
        'user-2': { displayName: 'Two' },
        'user-3': { displayName: 'Three' },
      },
    });

    const objectives = Array.from({ length: 12 }, (_, index) =>
      buildObjective({ id: index + 1, userId: `user-${String((index % 3) + 1)}` }),
    );

    await getMessage(client, 'objective', objectives);

    expect(memberFetch).toHaveBeenCalledTimes(3);
  });

  it('requests a shared author only once for the whole batch (AC-6)', async () => {
    const { client, memberFetch } = buildClient({
      members: { 'user-1': { displayName: 'One' } },
    });

    const objectives = Array.from({ length: 12 }, (_, index) =>
      buildObjective({ id: index + 1, userId: 'user-1' }),
    );

    await getMessage(client, 'objective', objectives);

    expect(memberFetch).toHaveBeenCalledTimes(1);
  });
});

describe('getMessage — resilience', () => {
  it('renders the message when every resolution fails, without throwing (AC-7)', async () => {
    const { client } = buildClient({ guildFetchRejects: true });

    const batches = await getMessage(client, 'objective', [buildObjective({ userId: 'user-1', map: 'Bridgewatch' })]);

    expect(renderedText(batches)).toContain('Bridgewatch');
    expect(renderedText(batches)).toContain('Objective added by Unknown');
  });

  it('keeps resolving the other authors when one of them fails (AC-7)', async () => {
    const { client } = buildClient({
      members: { 'user-2': { displayName: 'Resolved' } },
      users: {},
    });

    const batches = await getMessage(client, 'objective', [
      buildObjective({ id: 1, userId: 'user-1' }),
      buildObjective({ id: 2, userId: 'user-2' }),
    ]);

    expect(renderedText(batches)).toContain('Objective added by Unknown');
    expect(renderedText(batches)).toContain('Objective added by Resolved');
  });

  it('logs a warning with the guild id when resolution fails on the server side (AC-8)', async () => {
    const { client } = buildClient({ memberFetchRejectsWith: serverError() });

    await getMessage(client, 'objective', [buildObjective({ userId: 'user-1', guildId: 'guild-42' })]);

    expect(warnMock).toHaveBeenCalledWith(
      expect.objectContaining({ guildId: 'guild-42' }),
      expect.any(String),
    );
  });

  it('does not log a warning when the author simply left the server (AC-8b)', async () => {
    const { client } = buildClient({
      members: {},
      users: { 'user-1': { displayName: 'GlobalAccountName' } },
    });

    await getMessage(client, 'objective', [buildObjective({ userId: 'user-1' })]);

    expect(warnMock).not.toHaveBeenCalled();
  });
});

describe('getMessage — empty batch', () => {
  it('renders the empty message without any resolution request (AC-10)', async () => {
    const { client, guildFetch, memberFetch, userFetch } = buildClient();

    const batches = await getMessage(client, 'empty');

    expect(renderedText(batches)).toContain('There is no active timer.');
    expect(guildFetch).not.toHaveBeenCalled();
    expect(memberFetch).not.toHaveBeenCalled();
    expect(userFetch).not.toHaveBeenCalled();
  });
});
