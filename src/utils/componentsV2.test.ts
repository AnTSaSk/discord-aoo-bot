import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from 'discord.js';

import {
  buildSectionedMessage,
  componentsV2Options,
  fitsComponentsV2Message,
  MessageSizeError,
} from '@/utils/componentsV2.js';

const text = (content: string): unknown => new TextDisplayBuilder().setContent(content).toJSON();

const separator = (): unknown => new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large).toJSON();

const asJson = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

const sizeErrorOf = (build: () => unknown): unknown => {
  try {
    build();
  } catch (error) {
    return error;
  }

  throw new Error('Expected buildSectionedMessage to reject the message size');
};

const sectionsOf = (count: number): string[] =>
  Array.from({ length: count }, (_value: unknown, index: number) => `Part ${String(index + 1)}`);

describe('buildSectionedMessage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the title, then the sections with a Large separator between consecutive sections', () => {
    expect(asJson(buildSectionedMessage('## Title ##', ['First', 'Second', 'Third']))).toEqual([
      text('## Title ##'),
      text('First'),
      separator(),
      text('Second'),
      separator(),
      text('Third'),
    ]);
  });

  it('renders a single section without any separator when no trailer is given', () => {
    expect(asJson(buildSectionedMessage('## Title ##', ['Only']))).toEqual([text('## Title ##'), text('Only')]);
  });

  it('renders an empty trailer like an absent one', () => {
    expect(asJson(buildSectionedMessage('## Title ##', ['First', 'Second'], []))).toEqual(
      asJson(buildSectionedMessage('## Title ##', ['First', 'Second'])),
    );
  });

  it('renders a non-empty trailer after one separator, its lines as consecutive text displays', () => {
    expect(asJson(buildSectionedMessage('## Title ##', ['First', 'Second'], ['-# Footer', '-# Notice']))).toEqual([
      text('## Title ##'),
      text('First'),
      separator(),
      text('Second'),
      separator(),
      text('-# Footer'),
      text('-# Notice'),
    ]);
  });

  it('never escapes the texts it is given', () => {
    expect(asJson(buildSectionedMessage('Ping @everyone', ['Hello @everyone'], ['-# @everyone']))).toEqual([
      text('Ping @everyone'),
      text('Hello @everyone'),
      separator(),
      text('-# @everyone'),
    ]);
  });

  it('accepts a total text of exactly 4000 characters', () => {
    expect(buildSectionedMessage('T', ['a'.repeat(3999)])).toHaveLength(2);
  });

  it('rejects a total text of 4001 characters with a MessageSizeError carrying limit, max and actual', () => {
    const error = sizeErrorOf(() => buildSectionedMessage('T', ['a'.repeat(4000)]));

    expect(error).toBeInstanceOf(MessageSizeError);
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ limit: 'text', max: 4000, actual: 4001 });
  });

  it('counts the trailer lines, fallback notice included, in the total text', () => {
    const fits = buildSectionedMessage('T', ['a'.repeat(3990)], ['-# f']);
    const error = sizeErrorOf(() => buildSectionedMessage('T', ['a'.repeat(3990)], ['-# f', '-# notice']));

    expect(fits).toHaveLength(4);
    expect(error).toMatchObject({ limit: 'text', max: 4000, actual: 4004 });
  });

  it('checks the size before setting any text display content', () => {
    const setContent = vi.spyOn(TextDisplayBuilder.prototype, 'setContent');

    sizeErrorOf(() => buildSectionedMessage('T', ['a'.repeat(4001)]));

    expect(setContent).not.toHaveBeenCalled();
  });

  it('accepts exactly 40 components', () => {
    expect(buildSectionedMessage('T', sectionsOf(19), ['-# Footer'])).toHaveLength(40);
  });

  it('rejects 41 components with a MessageSizeError carrying limit, max and actual', () => {
    const error = sizeErrorOf(() => buildSectionedMessage('T', sectionsOf(19), ['-# Footer', '-# Notice']));

    expect(error).toBeInstanceOf(MessageSizeError);
    expect(error).toMatchObject({ limit: 'components', max: 40, actual: 41 });
  });
});

const textBlock = (content: string): TextDisplayBuilder => new TextDisplayBuilder().setContent(content);

// setContent rejects over 4000 characters; the constructor stores the raw content unchecked
const oversizedTextBlock = (content: string): TextDisplayBuilder => new TextDisplayBuilder({ content });

const separatorBlock = (): SeparatorBuilder => new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Large);

const containerOf = (children: readonly (TextDisplayBuilder | SeparatorBuilder)[]): ContainerBuilder =>
  children.reduce(
    (container, child) =>
      child instanceof TextDisplayBuilder ?
        container.addTextDisplayComponents(child) :
        container.addSeparatorComponents(child),
    new ContainerBuilder(),
  );

const textBlocksOf = (count: number): TextDisplayBuilder[] =>
  Array.from({ length: count }, (_value: unknown, index: number) => textBlock(`Line ${String(index + 1)}`));

const textsSeparatedBy = (lengths: readonly number[]): (TextDisplayBuilder | SeparatorBuilder)[] =>
  lengths.flatMap((length, index) =>
    index === 0 ? [textBlock('a'.repeat(length))] : [separatorBlock(), textBlock('a'.repeat(length))]);

describe('fitsComponentsV2Message', () => {
  const nineteenLengths = (last: number): number[] => [...Array.from({ length: 18 }, () => 200), last];

  it('AC-BOARD-23 accepts exactly 4000 characters of text in total and 38 components', () => {
    expect(fitsComponentsV2Message([containerOf(textsSeparatedBy(nineteenLengths(400)))])).toBe(true);
  });

  it('AC-BOARD-23 refuses 4001 characters of text in total with 38 components', () => {
    expect(fitsComponentsV2Message([containerOf(textsSeparatedBy(nineteenLengths(401)))])).toBe(false);
  });

  it('AC-BOARD-23 refuses 39 components with 4000 characters of text in total', () => {
    const children = [...textsSeparatedBy(nineteenLengths(400)), separatorBlock()];

    expect(fitsComponentsV2Message([containerOf(children)])).toBe(false);
  });

  it('AC-BOARD-23 accepts three blocks of 1500, 1500 and 1000 characters', () => {
    const blocks = [textBlock('a'.repeat(1500)), textBlock('b'.repeat(1500)), textBlock('c'.repeat(1000))];

    expect(fitsComponentsV2Message(blocks)).toBe(true);
  });

  it('AC-BOARD-23 refuses three blocks of 1500, 1500 and 1001 characters, each under 4000', () => {
    const blocks = [textBlock('a'.repeat(1500)), textBlock('b'.repeat(1500)), textBlock('c'.repeat(1001))];

    expect(fitsComponentsV2Message(blocks)).toBe(false);
  });

  it('AC-BOARD-23 measures and refuses a single text block over 4000 characters without throwing', () => {
    expect(fitsComponentsV2Message([oversizedTextBlock('a'.repeat(4001))])).toBe(false);
  });

  it('AC-BOARD-23 measures and refuses a nested text block over 4000 characters without throwing', () => {
    expect(fitsComponentsV2Message([containerOf([oversizedTextBlock('a'.repeat(4001))])])).toBe(false);
  });

  it('AC-BOARD-2 counts an emoji outside the basic plane as 2', () => {
    const emoji = '\u{1F7E2}';

    expect(fitsComponentsV2Message([textBlock(emoji.repeat(2000))])).toBe(true);
    expect(fitsComponentsV2Message([textBlock(emoji.repeat(2000)), textBlock('a')])).toBe(false);
  });

  it('AC-BOARD-2 counts a precomposed é as 1', () => {
    const precomposed = 'é';

    expect(fitsComponentsV2Message([textBlock(precomposed.repeat(4000))])).toBe(true);
    expect(fitsComponentsV2Message([textBlock(precomposed.repeat(4000)), textBlock('a')])).toBe(false);
  });

  it('AC-BOARD-2 counts the :green_circle: code as 14', () => {
    const code = ':green_circle:';

    expect(fitsComponentsV2Message([textBlock(code), textBlock('a'.repeat(4000 - 14))])).toBe(true);
    expect(fitsComponentsV2Message([textBlock(code), textBlock('a'.repeat(4000 - 13))])).toBe(false);
  });

  it('AC-BOARD-2 counts a relative date tag and its bold markers in full', () => {
    const tagged = '**<t:1767225600:R>**';
    const filler = 'a'.repeat(4000 - tagged.length);

    expect(fitsComponentsV2Message([textBlock(tagged), textBlock(filler)])).toBe(true);
    expect(fitsComponentsV2Message([textBlock(tagged), textBlock(`${filler}a`)])).toBe(false);
  });

  it('AC-BOARD-3 counts a container, 18 text blocks and 2 separators as 21 components', () => {
    const container = containerOf([
      ...textBlocksOf(6),
      separatorBlock(),
      ...textBlocksOf(6),
      separatorBlock(),
      ...textBlocksOf(6),
    ]);

    expect(fitsComponentsV2Message([container, ...textBlocksOf(17)])).toBe(true);
    expect(fitsComponentsV2Message([container, ...textBlocksOf(18)])).toBe(false);
  });

  it('AC-BOARD-3 counts top-level components one each, 38 accepted and 39 refused', () => {
    expect(fitsComponentsV2Message(textBlocksOf(38))).toBe(true);
    expect(fitsComponentsV2Message(textBlocksOf(39))).toBe(false);
  });

  it('AC-BOARD-3 counts top-level separators one each, 19 texts and 19 separators accepted, one more separator refused', () => {
    const separators = (count: number): ReturnType<typeof separatorBlock>[] => Array.from({ length: count }, () => separatorBlock());

    expect(fitsComponentsV2Message([...textBlocksOf(19), ...separators(19)])).toBe(true);
    expect(fitsComponentsV2Message([...textBlocksOf(19), ...separators(20)])).toBe(false);
  });
});

describe('componentsV2Options', () => {
  it('returns only the Components V2 flag when the everyone mention is off', () => {
    expect(componentsV2Options(false)).toStrictEqual({ flags: MessageFlags.IsComponentsV2 });
  });

  it('returns the Components V2 flag and exactly the everyone parse rule when the mention is on', () => {
    expect(componentsV2Options(true)).toStrictEqual({
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: ['everyone'] },
    });
  });
});
