import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockLogger = {
  error: vi.fn(),
  warn: vi.fn(),
  info: vi.fn(),
};

vi.mock('@/config/logger.js', () => ({
  getLogger: (): typeof mockLogger => mockLogger,
}));

const markHealthySpy = vi.fn();
const markUnhealthySpy = vi.fn();
const startHeartbeatSpy = vi.fn();
const stopHeartbeatSpy = vi.fn();

vi.mock('@/utils/liveness.js', () => ({
  markHealthy: markHealthySpy,
  markUnhealthy: markUnhealthySpy,
  startHeartbeat: startHeartbeatSpy,
  stopHeartbeat: stopHeartbeatSpy,
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

  it('does not call any liveness export (AC-5)', () => {
    const listener = new ShardErrorListener({} as never, { event: 'shardError' });

    listener.run(new Error('websocket died'), 3);

    expect(markHealthySpy).not.toHaveBeenCalled();
    expect(markUnhealthySpy).not.toHaveBeenCalled();
    expect(startHeartbeatSpy).not.toHaveBeenCalled();
    expect(stopHeartbeatSpy).not.toHaveBeenCalled();
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

  it('does not call any liveness export (AC-5)', () => {
    const listener = new ShardDisconnectListener(
      {} as never,
      { event: 'shardDisconnect' },
    );
    const closeEvent = { code: 1006 } as CloseEvent;

    listener.run(closeEvent, 2);

    expect(markHealthySpy).not.toHaveBeenCalled();
    expect(markUnhealthySpy).not.toHaveBeenCalled();
    expect(startHeartbeatSpy).not.toHaveBeenCalled();
    expect(stopHeartbeatSpy).not.toHaveBeenCalled();
  });
});
