import { describe, it, expect, vi, afterEach } from 'vitest';
import type { Logger } from 'pino';

import { performShutdown, type ShutdownDeps } from '@/utils/shutdown.js';
import { SHUTDOWN_TIMEOUT_MS } from '@/constants/config.js';

const buildLogger = (): Logger =>
  ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }) as unknown as Logger;

const buildDeps = (overrides: Partial<ShutdownDeps> = {}): ShutdownDeps => ({
  logger: buildLogger(),
  stopCron: vi.fn().mockResolvedValue(undefined),
  destroyClient: vi.fn().mockResolvedValue(undefined),
  closeDb: vi.fn().mockResolvedValue(undefined),
  exit: vi.fn(),
  ...overrides,
});

// Never resolves — used to keep cleanup pending for timeout assertions.
const pendingForever = (): Promise<void> => new Promise<void>(() => undefined);

describe('performShutdown', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  // AC-9: stop cron before destroying the client before closing the database.
  it('stops the cron task before destroying the client before closing the database', async () => {
    const calls: string[] = [];
    const deps = buildDeps({
      stopCron: vi.fn().mockImplementation(() => {
        calls.push('stopCron');

        return Promise.resolve();
      }),
      destroyClient: vi.fn().mockImplementation(() => {
        calls.push('destroyClient');

        return Promise.resolve();
      }),
      closeDb: vi.fn().mockImplementation(() => {
        calls.push('closeDb');

        return Promise.resolve();
      }),
    });

    await performShutdown(deps, 'SIGTERM');

    expect(calls).toEqual(['stopCron', 'destroyClient', 'closeDb']);
  });

  // AC-9: successful cleanup exits with code 0.
  it('exits with code 0 after a successful cleanup', async () => {
    const deps = buildDeps();

    await performShutdown(deps, 'SIGTERM');

    expect(deps.exit).toHaveBeenCalledWith(0);
  });

  // AC-9: a failing cleanup step logs the error and exits with code 1.
  it('logs the error and exits with code 1 when a cleanup step fails', async () => {
    const failure = new Error('cron stop failed');
    const deps = buildDeps({
      stopCron: vi.fn().mockRejectedValue(failure),
    });

    await performShutdown(deps, 'SIGTERM');

    expect(deps.logger.error).toHaveBeenCalledWith(expect.objectContaining({ error: failure }), expect.any(String));
    expect(deps.exit).toHaveBeenCalledWith(1);
  });

  // AC-10: cleanup that never resolves triggers exit(1) after SHUTDOWN_TIMEOUT_MS.
  it('exits with code 1 after SHUTDOWN_TIMEOUT_MS when cleanup never resolves', async () => {
    vi.useFakeTimers();

    const deps = buildDeps({
      stopCron: vi.fn().mockImplementation(pendingForever),
    });

    void performShutdown(deps, 'SIGTERM');

    expect(deps.exit).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(SHUTDOWN_TIMEOUT_MS);

    expect(deps.exit).toHaveBeenCalledWith(1);
  });

  // AC-10: the timeout timer must not by itself keep the process alive.
  it('unrefs the timeout timer', async () => {
    vi.useFakeTimers();

    const originalSetTimeout = global.setTimeout;
    let unrefCalls = 0;

    vi.spyOn(global, 'setTimeout').mockImplementation((callback: () => void, ms?: number) => {
      const timer = originalSetTimeout(callback, ms);

      vi.spyOn(timer, 'unref').mockImplementation(() => {
        unrefCalls += 1;

        return timer;
      });

      return timer;
    });

    const deps = buildDeps({
      stopCron: vi.fn().mockImplementation(pendingForever),
    });

    void performShutdown(deps, 'SIGTERM');

    expect(unrefCalls).toBe(1);

    await vi.advanceTimersByTimeAsync(SHUTDOWN_TIMEOUT_MS);
  });
});

describe('performShutdown with the aggregated board (aggregated-board AC-AGG-34)', () => {
  const recordingDeps = (calls: string[], overrides: Partial<ShutdownDeps> = {}): ShutdownDeps =>
    buildDeps({
      stopHeartbeat: vi.fn(() => {
        calls.push('stopHeartbeat');
      }),
      stopCron: vi.fn(() => {
        calls.push('stopCron');

        return Promise.resolve();
      }),
      destroyClient: vi.fn(() => {
        calls.push('destroyClient');

        return Promise.resolve();
      }),
      closeDb: vi.fn(() => {
        calls.push('closeDb');

        return Promise.resolve();
      }),
      ...overrides,
    });

  it('aggregated-board AC-AGG-34: stops the aggregated board together with the heartbeat, before the cron', async () => {
    const calls: string[] = [];
    const deps = recordingDeps(calls, {
      stopAggregatedBoard: vi.fn(() => {
        calls.push('stopAggregatedBoard');
      }),
    });

    await performShutdown(deps, 'SIGTERM');

    expect([...calls.slice(0, 2)].sort()).toEqual(['stopAggregatedBoard', 'stopHeartbeat']);
    expect(calls.slice(2)).toEqual(['stopCron', 'destroyClient', 'closeDb']);
    expect(deps.exit).toHaveBeenCalledWith(0);
  });

  it('aggregated-board AC-AGG-34: without the aggregated board dependency, shutdown keeps its order without error', async () => {
    const calls: string[] = [];
    const deps = recordingDeps(calls);

    await performShutdown(deps, 'SIGTERM');

    expect(calls).toEqual(['stopHeartbeat', 'stopCron', 'destroyClient', 'closeDb']);
    expect(deps.logger.error).not.toHaveBeenCalled();
    expect(deps.exit).toHaveBeenCalledWith(0);
  });

  it('aggregated-board AC-AGG-34: shutdown does not await a render still running in the aggregated board', async () => {
    const calls: string[] = [];
    const deps = recordingDeps(calls, {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises -- a never-settling promise handed to the void dependency must not be awaited
      stopAggregatedBoard: vi.fn(pendingForever),
    });

    await performShutdown(deps, 'SIGTERM');

    expect(deps.stopAggregatedBoard).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(['stopHeartbeat', 'stopCron', 'destroyClient', 'closeDb']);
    expect(deps.exit).toHaveBeenCalledWith(0);
  });
});
