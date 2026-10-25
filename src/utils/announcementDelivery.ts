import { TextDisplayBuilder, type APITextDisplayComponent } from 'discord.js';

import type { ResolvedGuildSettings } from '@/services/guildSettings.service.js';
import { assertMessageFits, measureSectionedMessage } from '@/utils/componentsV2.js';

const EVERYONE_MENTION = '@everyone';

export const resolveAnnouncementChannelId = (settings: ResolvedGuildSettings): string | null => settings.announcementChannelId ?? settings.lastUsedChannelId ?? null;

const wait = (ms: number): Promise<void> => new Promise((resolve) => {
  setTimeout(resolve, ms);
});

export const forEachInBatches = async <T>(
  items: readonly T[],
  options: { size: number; delayMs: number; sleep?: (ms: number) => Promise<void> },
  fn: (item: T) => Promise<void>,
): Promise<void> => {
  const sleep = options.sleep ?? wait;

  for (let index = 0; index < items.length; index += options.size) {
    await Promise.all(items.slice(index, index + options.size).map((item) => fn(item)));

    if (index + options.size < items.length) {
      await sleep(options.delayMs);
    }
  }
};

// Discord pings only a mention present in the message text: allowed mentions alone notify nobody
export const withEveryoneMention = <T>(components: readonly T[]): (APITextDisplayComponent | T)[] => [
  new TextDisplayBuilder().setContent(EVERYONE_MENTION).toJSON(),
  ...components,
];

export const assertFitsWithEveryoneMention = (
  title: string,
  sections: readonly string[],
  trailer: readonly string[] = [],
): void => {
  const { textLength, componentCount } = measureSectionedMessage(title, sections, trailer);

  assertMessageFits({
    textLength: textLength + EVERYONE_MENTION.length,
    componentCount: componentCount + 1,
  });
};
