export type BlockRole = 'title' | 'objective' | 'separator' | 'other';

export interface RoledBlock<T> {
  readonly role: BlockRole;
  readonly content: T;
}

export class BoardSizeError extends Error {
  public readonly blockIndex: number;

  public readonly blockCount: number;

  constructor(blockIndex: number, blockCount: number) {
    super(
      `Board block group starting at index ${String(blockIndex)} (${String(blockCount)} blocks) ` +
      'does not fit in an empty message',
    );
    this.name = 'BoardSizeError';
    this.blockIndex = blockIndex;
    this.blockCount = blockCount;
  }
}

const isLastObjective = <T>(blocks: readonly RoledBlock<T>[], index: number): boolean =>
  blocks[index]?.role === 'objective' && blocks[index + 1]?.role === 'separator';

const groupEnd = <T>(blocks: readonly RoledBlock<T>[], start: number): number => {
  const head = blocks[start];

  if (head.role === 'title') {
    if (blocks[start + 1]?.role !== 'objective') {
      throw new Error(`Board title at index ${String(start)} is not followed by an objective`);
    }

    return isLastObjective(blocks, start + 1) ? start + 3 : start + 2;
  }

  if (head.role === 'separator') {
    throw new Error(`Board separator at index ${String(start)} does not follow an objective`);
  }

  return isLastObjective(blocks, start) ? start + 2 : start + 1;
};

export const splitBoard = <T>(
  blocks: readonly RoledBlock<T>[],
  fits: (message: readonly T[]) => boolean,
): T[][] => {
  const messages: T[][] = [];
  let current: T[] = [];
  let start = 0;

  while (start < blocks.length) {
    const end = groupEnd(blocks, start);
    const group = blocks.slice(start, end).map(({ content }) => content);
    const candidate = [...current, ...group];

    if (fits(candidate)) {
      current = candidate;
    } else if (current.length > 0 && fits(group)) {
      messages.push(current);
      current = group;
    } else {
      throw new BoardSizeError(start, group.length);
    }

    start = end;
  }

  if (current.length > 0) {
    messages.push(current);
  }

  return messages;
};
