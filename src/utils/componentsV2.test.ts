import { describe, it, expect, vi, afterEach } from 'vitest';
import { MessageFlags, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder } from 'discord.js';

import { buildSectionedMessage, componentsV2Options, MessageSizeError } from '@/utils/componentsV2.js';

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
