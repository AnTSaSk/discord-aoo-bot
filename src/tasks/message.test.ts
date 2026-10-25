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

describe('getMessage — type sections (AC-12, AC-15, AC-17, AC-32)', () => {
  it('renders a Dragon line with no rarity segment at all (AC-12)', async () => {
    const { client } = buildClient({
      members: { 'user-1': { displayName: 'Slayer' } },
    });

    const batches = await getMessage(client, 'objective', [buildObjective({ userId: 'user-1', type: 'Dragon', rarity: 'n/a', map: 'Fort Sterling' })]);

    const line = renderedText(batches)
      .split('\n')
      .find((row) => row.startsWith('- #'));

    expect(line).toBe('- #1 — **12:00** UTC (<t:4070952000:R>) —— **Fort Sterling**');
  });

  it('never lets the n/a sentinel reach the rendered output for a Dragon (AC-12)', async () => {
    const { client } = buildClient({
      members: { 'user-1': { displayName: 'Slayer' } },
    });

    const batches = await getMessage(client, 'objective', [buildObjective({ userId: 'user-1', type: 'Dragon', rarity: 'n/a' })]);

    expect(renderedText(batches)).not.toContain('n/a');
  });

  it('does not leave a dangling separator around the empty rarity segment on a Dragon line (AC-12)', async () => {
    const { client } = buildClient({
      members: { 'user-1': { displayName: 'Slayer' } },
    });

    const batches = await getMessage(client, 'objective', [buildObjective({ userId: 'user-1', type: 'Dragon', rarity: 'n/a' })]);

    const line = renderedText(batches)
      .split('\n')
      .find((row) => row.startsWith('- #'));

    expect(line).not.toMatch(/——\s*——/);
    expect(line).not.toMatch(/^- #\d+ ——/);
    expect(line).not.toMatch(/ {2}/);
    expect(line).not.toMatch(/— —/);
  });

  it('presents at least one active Dragon under its own section (AC-15)', async () => {
    const { client } = buildClient({
      members: { 'user-1': { displayName: 'Slayer' } },
    });

    const batches = await getMessage(client, 'objective', [buildObjective({ userId: 'user-1', type: 'Dragon', rarity: 'n/a' })]);

    expect(renderedText(batches)).toContain('## Dragon ##');
  });

  it('never displays a rarity segment on a Dragon line (AC-D2)', async () => {
    const { client } = buildClient({
      members: { 'user-1': { displayName: 'Slayer' } },
    });

    const batches = await getMessage(client, 'objective', [buildObjective({ userId: 'user-1', type: 'Dragon', rarity: 'n/a', map: 'Caerleon' })]);

    const line = renderedText(batches)
      .split('\n')
      .find((row) => row.startsWith('- #'));

    expect(line).not.toMatch(/circle/);
    expect(line).not.toContain('n/a');
  });

  it('omits both the Dragon section title and its trailing separator when no Dragon is active (AC-17)', async () => {
    const { client } = buildClient({
      members: { 'user-1': { displayName: 'One' } },
    });

    const batches = await getMessage(client, 'objective', [buildObjective({ userId: 'user-1', type: 'Core', rarity: 'Common' })]);

    const text = renderedText(batches);

    expect(text).not.toContain('## Dragon ##');

    const separatorCount = batches.flat().filter((component) => !(component instanceof TextDisplayBuilder)).length;

    expect(separatorCount).toBe(1);
  });

  it('renders the three existing sections identically when the new types are also present (non-regression)', async () => {
    const { client } = buildClient({
      members: { 'user-1': { displayName: 'One' } },
    });

    const batches = await getMessage(client, 'objective', [
      buildObjective({ id: 1, userId: 'user-1', type: 'Core', rarity: 'Green', map: 'Lymhurst' }),
      buildObjective({ id: 2, userId: 'user-1', type: 'Vortex', rarity: 'Blue', map: 'Martlock' }),
      buildObjective({ id: 3, userId: 'user-1', type: 'Dragon', rarity: 'n/a', map: 'Caerleon' }),
    ]);

    const text = renderedText(batches);

    expect(text).toContain('## Core ##');
    expect(text).toContain('## Vortex ##');
    expect(text).toContain('**:green_circle: Green**');
    expect(text).toContain('**:blue_circle: Blue**');
  });

  it('objective-taxonomy AC-32 / AC-17: renders exactly the Node, Core, Vortex and Dragon sections, never an Ancient Lands Portal one, for a board holding every tracked type', async () => {
    const { client } = buildClient({
      members: { 'user-1': { displayName: 'One' } },
    });

    const batches = await getMessage(client, 'objective', [
      buildObjective({ id: 1, userId: 'user-1', type: 'Fiber node', rarity: '4.4', map: 'Lymhurst' }),
      buildObjective({ id: 2, userId: 'user-1', type: 'Hide node', rarity: '5.4', map: 'Lymhurst' }),
      buildObjective({ id: 3, userId: 'user-1', type: 'Ore node', rarity: '6.4', map: 'Lymhurst' }),
      buildObjective({ id: 4, userId: 'user-1', type: 'Wood node', rarity: '7.4', map: 'Lymhurst' }),
      buildObjective({ id: 5, userId: 'user-1', type: 'Core', rarity: 'Gold', map: 'Martlock' }),
      buildObjective({ id: 6, userId: 'user-1', type: 'Vortex', rarity: 'Purple', map: 'Martlock' }),
      buildObjective({ id: 7, userId: 'user-1', type: 'Dragon', rarity: 'n/a', map: 'Caerleon' }),
    ]);

    const text = renderedText(batches);
    const sections = [...text.matchAll(/^## (.+) ##$/gm)]
      .map((match) => match[1])
      .filter((name) => name !== 'Objective Timers');

    expect(sections).toEqual(['Node', 'Core', 'Vortex', 'Dragon']);
    expect(text).not.toContain('Ancient Lands Portal');
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
