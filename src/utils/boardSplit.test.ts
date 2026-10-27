import { describe, it, expect } from 'vitest';

import { BoardSizeError, splitBoard, type BlockRole, type RoledBlock } from '@/utils/boardSplit.js';

interface Item {
  readonly id: string;
  readonly size: number;
}

interface Rendered {
  readonly text: string;
}

const block = (role: BlockRole, id: string, size = 1): RoledBlock<Item> => ({ role, content: { id, size } });

const title = (id: string, size?: number): RoledBlock<Item> => block('title', id, size);
const objective = (id: string, size?: number): RoledBlock<Item> => block('objective', id, size);
const separator = (id: string, size?: number): RoledBlock<Item> => block('separator', id, size);
const other = (id: string, size?: number): RoledBlock<Item> => block('other', id, size);

const atMostBlocks = (max: number) => (message: readonly unknown[]): boolean => message.length <= max;

const atMostSize = (max: number) => (message: readonly Item[]): boolean =>
  message.reduce((total, item) => total + item.size, 0) <= max;

const ids = (messages: readonly (readonly Item[])[]): string[][] => messages.map((message) => message.map((item) => item.id));

describe('splitBoard — decision table', () => {
  it('AC-BOARD-4 keeps a fitting block in the current non-empty message when no rule moves it', () => {
    const blocks = [title('T1'), objective('O1'), separator('S1'), title('T2'), objective('O2'), separator('S2')];

    expect(ids(splitBoard(blocks, atMostBlocks(6)))).toEqual([['T1', 'O1', 'S1', 'T2', 'O2', 'S2']]);
  });

  it('AC-BOARD-6 opens a new message with the title and the first objective when the title group does not fit', () => {
    const blocks = [
      title('T1'),
      objective('O1'),
      separator('S1'),
      title('T2'),
      objective('O2'),
      objective('O3'),
      separator('S2'),
    ];

    expect(ids(splitBoard(blocks, atMostBlocks(4)))).toEqual([['T1', 'O1', 'S1'], ['T2', 'O2', 'O3', 'S2']]);
  });

  it('AC-BOARD-7 opens a new message with the last objective and its separator when the separator does not fit after it', () => {
    const blocks = [title('T'), objective('O1'), objective('O2'), separator('S')];

    expect(ids(splitBoard(blocks, atMostBlocks(3)))).toEqual([['T', 'O1'], ['O2', 'S']]);
  });

  it('AC-BOARD-5 opens a new message with the whole block when it does not fit in the current non-empty message', () => {
    const blocks = [title('T', 1), objective('O1', 5), objective('O2', 5), objective('O3', 1), separator('S', 1)];

    expect(ids(splitBoard(blocks, atMostSize(10)))).toEqual([['T', 'O1'], ['O2', 'O3', 'S']]);
  });

  it('AC-BOARD-9 opens an empty message with a block that fits alone, even one filling it entirely', () => {
    const blocks = [title('T', 1), objective('O1', 9), objective('O2', 10), objective('O3', 5), objective('O4', 4), separator('S', 1)];

    expect(ids(splitBoard(blocks, atMostSize(10)))).toEqual([['T', 'O1'], ['O2'], ['O3', 'O4', 'S']]);
  });

  it('AC-BOARD-12 throws a BoardSizeError when a title and its first objective do not fit in an empty message', () => {
    const blocks = [title('T', 5), objective('O1', 6), objective('O2', 1), separator('S', 1)];

    expect(() => splitBoard(blocks, atMostSize(10))).toThrow(BoardSizeError);
  });

  it('AC-BOARD-12 throws a BoardSizeError when a title group moved out of a non-empty message still does not fit', () => {
    const blocks = [
      title('T1', 1),
      objective('O1', 1),
      separator('S1', 1),
      title('T2', 5),
      objective('O2', 6),
      objective('O3', 1),
      separator('S2', 1),
    ];

    expect(() => splitBoard(blocks, atMostSize(10))).toThrow(BoardSizeError);
  });

  it('AC-BOARD-12 throws a BoardSizeError when a last objective and its separator do not fit in an empty message', () => {
    const blocks = [title('T', 1), objective('O1', 8), objective('O2', 9), separator('S', 2)];

    expect(() => splitBoard(blocks, atMostSize(10))).toThrow(BoardSizeError);
  });

  it('AC-BOARD-12 throws a BoardSizeError when a one-objective category does not fit in an empty message', () => {
    const blocks = [title('T', 4), objective('O', 4), separator('S', 3)];

    expect(() => splitBoard(blocks, atMostSize(10))).toThrow(BoardSizeError);
  });

  it('AC-BOARD-11 throws a BoardSizeError when an objective does not fit alone in an empty message', () => {
    const blocks = [title('T', 1), objective('O1', 2), objective('O2', 11), objective('O3', 1), separator('S', 1)];

    expect(() => splitBoard(blocks, atMostSize(10))).toThrow(BoardSizeError);
  });

  it('AC-BOARD-11 throws a BoardSizeError when an other block does not fit alone in an empty message', () => {
    expect(() => splitBoard([other('X1', 3), other('X2', 11)], atMostSize(10))).toThrow(BoardSizeError);
  });
});

describe('splitBoard — one-objective category', () => {
  it('AC-BOARD-8 moves title, objective and separator together when the three do not fit at the end of the current message', () => {
    const blocks = [title('T1'), objective('O1'), separator('S1'), title('T2'), objective('O2'), separator('S2')];

    expect(ids(splitBoard(blocks, atMostBlocks(5)))).toEqual([['T1', 'O1', 'S1'], ['T2', 'O2', 'S2']]);
  });

  it('AC-BOARD-8 keeps a one-objective category at the end of the current message when its three blocks fill it exactly', () => {
    const blocks = [
      title('T1', 1),
      objective('O1', 1),
      separator('S1', 1),
      title('T2', 2),
      objective('O2', 3),
      separator('S2', 2),
      title('T3', 1),
      objective('O3', 1),
      separator('S3', 1),
    ];

    expect(ids(splitBoard(blocks, atMostSize(10)))).toEqual([
      ['T1', 'O1', 'S1', 'T2', 'O2', 'S2'],
      ['T3', 'O3', 'S3'],
    ]);
  });
});

describe('splitBoard — other blocks', () => {
  it('AC-BOARD-24 places lone other blocks in one message when they fit', () => {
    expect(ids(splitBoard([other('Header'), other('Empty')], atMostBlocks(2)))).toEqual([['Header', 'Empty']]);
  });

  it('AC-BOARD-24 opens a new message for an other block that does not fit, without any size error', () => {
    expect(ids(splitBoard([other('Header'), other('Empty')], atMostBlocks(1)))).toEqual([['Header'], ['Empty']]);
  });

  it('AC-BOARD-24 leaves an other block at the end of a message instead of moving it like a title', () => {
    const blocks = [title('T'), objective('O1'), other('X1'), other('X2')];

    expect(ids(splitBoard(blocks, atMostBlocks(3)))).toEqual([['T', 'O1', 'X1'], ['X2']]);
  });

  it('AC-BOARD-24 does not treat an objective followed by an other block as a last objective', () => {
    const blocks = [title('T'), objective('O1'), other('X')];

    expect(ids(splitBoard(blocks, atMostBlocks(2)))).toEqual([['T', 'O1'], ['X']]);
  });

  it('AC-BOARD-24 places an other block alone before a one-objective category, the separator staying with its objective', () => {
    const blocks = [other('X'), title('T'), objective('O'), separator('S')];

    expect(ids(splitBoard(blocks, atMostBlocks(3)))).toEqual([['X'], ['T', 'O', 'S']]);
  });
});

const thrownBy = (run: () => unknown): unknown => {
  try {
    run();
  } catch (error: unknown) {
    return error;
  }

  throw new Error('expected splitBoard to throw on a malformed sequence');
};

const expectMalformed = (blocks: readonly RoledBlock<Item>[]): void => {
  const error = thrownBy(() => splitBoard(blocks, atMostBlocks(100)));

  expect(error).toBeInstanceOf(Error);
  expect(error).not.toBeInstanceOf(BoardSizeError);
};

describe('splitBoard — malformed sequences', () => {
  it('R1 malformed: a title as the last block throws a non-size error', () => {
    expectMalformed([title('T1'), objective('O1'), separator('S1'), title('T2')]);
  });

  it('R1 malformed: a lone title throws a non-size error', () => {
    expectMalformed([other('X'), title('T')]);
  });

  it('R1 malformed: a separator as the first block throws a non-size error', () => {
    expectMalformed([separator('S0'), title('T'), objective('O'), separator('S')]);
  });

  it('R1 malformed: a separator preceded by an other block throws a non-size error', () => {
    expectMalformed([title('T'), objective('O'), other('X'), separator('S')]);
  });

  it('R1 malformed: a title directly followed by a separator throws a non-size error', () => {
    expectMalformed([title('T'), separator('S')]);
  });

  it('R1 malformed: a title directly followed by another title throws a non-size error', () => {
    expectMalformed([title('T1'), title('T2'), objective('O'), separator('S')]);
  });

  it('R1 malformed: a title directly followed by an other block throws a non-size error', () => {
    expectMalformed([title('T'), other('X'), objective('O'), separator('S')]);
  });
});

describe('splitBoard — conservation and filling', () => {
  it('AC-BOARD-10 returns exactly the input contents, same objects in the same order, duplicates kept', () => {
    const twin = { id: '#5 Twin', size: 3 };
    const twinCopy = { id: '#5 Twin', size: 3 };
    const blocks: RoledBlock<Item>[] = [
      title('T1', 1),
      objective('#1', 3),
      objective('#2', 3),
      objective('#3', 3),
      separator('S1', 1),
      title('T2', 1),
      objective('#4', 4),
      separator('S2', 1),
      title('T3', 1),
      { role: 'objective', content: twin },
      { role: 'objective', content: twinCopy },
      separator('S3', 1),
    ];

    const flat = splitBoard(blocks, atMostSize(10)).flat();

    expect(flat).toHaveLength(blocks.length);
    blocks.forEach(({ content }, index) => {
      expect(flat[index]).toBe(content);
    });
  });

  it('AC-BOARD-4 fills each message until the next block would fail the format test', () => {
    const sizes = [3, 4, 2, 5, 5, 1, 9, 1, 6];
    const blocks = sizes.map((size, index) => other(`X${String(index)}`, size));
    const fits = atMostSize(10);

    const messages = splitBoard(blocks, fits);

    expect(ids(messages)).toEqual([['X0', 'X1', 'X2'], ['X3', 'X4'], ['X5', 'X6'], ['X7', 'X8']]);
    messages.slice(1).forEach((message, index) => {
      expect(fits([...messages[index], message[0]])).toBe(false);
    });
  });
});

describe('splitBoard — format independence', () => {
  it('AC-BOARD-15 produces the same split for two formats providing the same fit test', () => {
    const roles: BlockRole[] = ['title', 'objective', 'objective', 'objective', 'separator', 'title', 'objective', 'separator'];
    const sizes = [1, 3, 4, 3, 1, 1, 5, 1];
    const sizedBlocks = roles.map((role, index): RoledBlock<Item> => ({
      role,
      content: { id: String(index), size: sizes[index] },
    }));
    const renderedBlocks = roles.map((role, index): RoledBlock<Rendered> => ({
      role,
      content: { text: String(index).padEnd(sizes[index], '.') },
    }));
    const fitsRendered = (message: readonly Rendered[]): boolean =>
      message.map(({ text }) => text).join('').length <= 10;

    const sized = splitBoard(sizedBlocks, atMostSize(10)).map((message) => message.map(({ id }) => id));
    const rendered = splitBoard(renderedBlocks, fitsRendered).map((message) => message.map(({ text }) => text[0]));

    expect(sized).toEqual([['0', '1', '2'], ['3', '4'], ['5', '6', '7']]);
    expect(rendered).toEqual(sized);
  });
});
