import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLogger = {
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
};

vi.mock('@/config/logger.js', () => ({
  getLogger: (): typeof mockLogger => mockLogger,
}));

import { ShardErrorListener } from '@/listeners/shardError.js';
import { ShardDisconnectListener } from '@/listeners/shardDisconnect.js';

describe('ShardErrorListener', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs shardId and the error at error level (AC-1)', () => {
    const listener = new ShardErrorListener({} as never, { event: 'shardError' });
    const shardError = new Error('websocket died');

    listener.run(shardError, 3);

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({ shardId: 3, error: shardError }),
      expect.any(String),
    );
  });
});

describe('ShardDisconnectListener', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs shardId and the close code at warn level (AC-1)', () => {
    const listener = new ShardDisconnectListener(
      {} as never,
      { event: 'shardDisconnect' },
    );
    const closeEvent = { code: 1006 } as CloseEvent;

    listener.run(closeEvent, 2);

    expect(mockLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ shardId: 2, code: 1006 }),
      expect.any(String),
    );
  });
});
