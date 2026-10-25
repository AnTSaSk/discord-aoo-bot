import { describe, it, expect, vi } from 'vitest';
import { ComponentType } from 'discord.js';

import type { ResolvedGuildSettings } from '@/services/guildSettings.service.js';
import { forEachInBatches, resolveAnnouncementChannelId, withEveryoneMention } from '@/utils/announcementDelivery.js';
import { buildSectionedMessage } from '@/utils/componentsV2.js';

const settings = (overrides: Partial<ResolvedGuildSettings> = {}): ResolvedGuildSettings => ({
  guildId: 'guild-1',
  announcementChannelId: null,
  lastUsedChannelId: null,
  announcementsEnabled: true,
  mentionEveryone: false,
  lastAnnouncedVersion: null,
  removedAt: null,
  ...overrides,
});

const deferred = (): { promise: Promise<void>; resolve: () => void } => {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((onResolve) => {
    resolve = onResolve;
  });

  return { promise, resolve };
};

const settle = (): Promise<void> => new Promise((resolve) => {
  setImmediate(resolve);
});

describe('resolveAnnouncementChannelId', () => {
  it('P7 prefers the configured announcement channel over the last used one', () => {
    expect(resolveAnnouncementChannelId(settings({
      announcementChannelId: 'configured',
      lastUsedChannelId: 'last-used',
    }))).toBe('configured');
  });

  it('P7 falls back to the last used channel when none is configured', () => {
    expect(resolveAnnouncementChannelId(settings({ lastUsedChannelId: 'last-used' }))).toBe('last-used');
  });

  it('P7 resolves null when neither channel is known', () => {
    expect(resolveAnnouncementChannelId(settings())).toBeNull();
  });

  it('P7 keeps a blank configured channel ahead of the fallback, as the release announcement did', () => {
    expect(resolveAnnouncementChannelId(settings({
      announcementChannelId: '',
      lastUsedChannelId: 'last-used',
    }))).toBe('');
  });

  it('P7 keeps a blank last used channel as is, as the release announcement did', () => {
    expect(resolveAnnouncementChannelId(settings({ lastUsedChannelId: '' }))).toBe('');
  });
});

describe('forEachInBatches', () => {
  it('P7 calls fn once per item in order, sleeping only between batches of the given size', async () => {
    const events: string[] = [];
    const items = Array.from({ length: 12 }, (_value: unknown, index: number) => index);
    const sleep = vi.fn((ms: number) => {
      events.push(`sleep:${String(ms)}`);

      return Promise.resolve();
    });

    await forEachInBatches(items, { size: 5, delayMs: 250, sleep }, (item: number) => {
      events.push(`item:${String(item)}`);

      return Promise.resolve();
    });

    expect(events).toEqual([
      'item:0',
      'item:1',
      'item:2',
      'item:3',
      'item:4',
      'sleep:250',
      'item:5',
      'item:6',
      'item:7',
      'item:8',
      'item:9',
      'sleep:250',
      'item:10',
      'item:11',
    ]);
  });

  it('P7 never sleeps after the last batch, even when it is full', async () => {
    const sleep = vi.fn(() => Promise.resolve());
    const fn = vi.fn(() => Promise.resolve());

    await forEachInBatches([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], { size: 5, delayMs: 250, sleep }, fn);

    expect(fn).toHaveBeenCalledTimes(10);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it('P7 waits for every item of a batch to settle before the delay and the next batch', async () => {
    const pendingFirst = deferred();
    const started: number[] = [];
    const sleep = vi.fn(() => Promise.resolve());

    const run = forEachInBatches([0, 1, 2, 3, 4, 5], { size: 5, delayMs: 250, sleep }, (item: number) => {
      started.push(item);

      return item === 0 ? pendingFirst.promise : Promise.resolve();
    });

    await settle();

    expect(started).toEqual([0, 1, 2, 3, 4]);
    expect(sleep).not.toHaveBeenCalled();

    pendingFirst.resolve();
    await run;

    expect(started).toEqual([0, 1, 2, 3, 4, 5]);
    expect(sleep).toHaveBeenCalledTimes(1);
  });
});

describe('withEveryoneMention', () => {
  const rendered = {
    components: buildSectionedMessage('## Scheduled restart ##', ['First section', 'Second section'])
      .map((component) => component.toJSON()),
  };

  it('AC-ANN-8 AC-EMIT-29 places a text block of exactly @everyone first, above every original component kept in order', () => {
    const withMention: unknown = JSON.parse(JSON.stringify(withEveryoneMention(rendered.components)));

    expect(withMention).toStrictEqual([
      { type: ComponentType.TextDisplay, content: '@everyone' },
      ...rendered.components,
    ]);
  });

  it('AC-ANN-8 adds exactly one component to the message', () => {
    expect(withEveryoneMention(rendered.components)).toHaveLength(rendered.components.length + 1);
  });
});
