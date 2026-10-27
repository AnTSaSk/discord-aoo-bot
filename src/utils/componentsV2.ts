import {
  ContainerBuilder,
  type ContainerComponentBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from 'discord.js';

import {
  DISCORD_MESSAGE_MAX_COMPONENTS,
  DISCORD_MESSAGE_MAX_TEXT_LENGTH,
  MAX_COMPONENTS_PER_MESSAGE,
} from '@/constants/config.js';

export class MessageSizeError extends Error {
  public readonly limit: 'text' | 'components';

  public readonly max: number;

  public readonly actual: number;

  constructor(limit: 'text' | 'components', max: number, actual: number) {
    super(
      limit === 'text' ?
        `Message text is ${String(actual)} characters, over the ${String(max)} limit of a single Discord message` :
        `Message has ${String(actual)} components, over the ${String(max)} limit of a single Discord message`,
    );
    this.name = 'MessageSizeError';
    this.limit = limit;
    this.max = max;
    this.actual = actual;
  }
}

const separator = (): SeparatorBuilder => new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large);

export interface MessageSize {
  textLength: number;
  componentCount: number;
}

export const measureSectionedMessage = (
  title: string,
  sections: readonly string[],
  trailer: readonly string[] = [],
): MessageSize => {
  const sectionComponents = Math.max(2 * sections.length - 1, 0);
  const trailerComponents = trailer.length > 0 ? 1 + trailer.length : 0;

  return {
    textLength: [title, ...sections, ...trailer].reduce((total, content) => total + content.length, 0),
    componentCount: 1 + sectionComponents + trailerComponents,
  };
};

export const assertMessageFits = ({ textLength, componentCount }: MessageSize): void => {
  if (textLength > DISCORD_MESSAGE_MAX_TEXT_LENGTH) {
    throw new MessageSizeError('text', DISCORD_MESSAGE_MAX_TEXT_LENGTH, textLength);
  }

  if (componentCount > DISCORD_MESSAGE_MAX_COMPONENTS) {
    throw new MessageSizeError('components', DISCORD_MESSAGE_MAX_COMPONENTS, componentCount);
  }
};

export const buildSectionedMessage = (
  title: string,
  sections: readonly string[],
  trailer: readonly string[] = [],
): (TextDisplayBuilder | SeparatorBuilder)[] => {
  // Checked before any setContent so the builder's own length constraint never surfaces
  assertMessageFits(measureSectionedMessage(title, sections, trailer));

  const body = sections.flatMap((section, index) => {
    const block = new TextDisplayBuilder().setContent(section);

    return index === 0 ? [block] : [separator(), block];
  });
  const footer = trailer.length > 0 ?
    [separator(), ...trailer.map((line) => new TextDisplayBuilder().setContent(line))] :
    [];

  return [new TextDisplayBuilder().setContent(title), ...body, ...footer];
};

export type ComponentsV2Block = ContainerBuilder | TextDisplayBuilder | SeparatorBuilder;

// Reads the builder data directly: toJSON() would reject a single text over 4000 characters
const measureComponent = (component: ContainerBuilder | ContainerComponentBuilder): MessageSize => {
  if (component instanceof ContainerBuilder) {
    return component.components.reduce<MessageSize>(
      (total, child) => {
        const size = measureComponent(child);

        return {
          textLength: total.textLength + size.textLength,
          componentCount: total.componentCount + size.componentCount,
        };
      },
      { textLength: 0, componentCount: 1 },
    );
  }

  if (component instanceof TextDisplayBuilder) {
    const { content } = component.data;

    if (content === undefined) {
      throw new Error('Text display has no content to measure');
    }

    return { textLength: content.length, componentCount: 1 };
  }

  if (component instanceof SeparatorBuilder) {
    return { textLength: 0, componentCount: 1 };
  }

  throw new Error(`Cannot measure a ${component.constructor.name} in a Components V2 message`);
};

export const fitsComponentsV2Message = (components: readonly ComponentsV2Block[]): boolean => {
  const { textLength, componentCount } = components.reduce<MessageSize>(
    (total, component) => {
      const size = measureComponent(component);

      return {
        textLength: total.textLength + size.textLength,
        componentCount: total.componentCount + size.componentCount,
      };
    },
    { textLength: 0, componentCount: 0 },
  );

  return textLength <= DISCORD_MESSAGE_MAX_TEXT_LENGTH && componentCount <= MAX_COMPONENTS_PER_MESSAGE;
};

export const componentsV2Options = (
  mentionEveryone: boolean,
): { flags: MessageFlags.IsComponentsV2; allowedMentions?: { parse: 'everyone'[] } } =>
  mentionEveryone ?
    { flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: ['everyone'] } } :
    { flags: MessageFlags.IsComponentsV2 };
