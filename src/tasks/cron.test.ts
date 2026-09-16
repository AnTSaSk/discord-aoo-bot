import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ScheduledTask } from 'node-cron';

import { registerScheduledTask, stopScheduledTask } from '@/tasks/cron.js';

const buildTask = (): { task: ScheduledTask; stop: ReturnType<typeof vi.fn> } => {
  const stop = vi.fn().mockResolvedValue(undefined);

  return { task: { stop } as unknown as ScheduledTask, stop };
};

describe('cron scheduled task holder', () => {
  beforeEach(async () => {
    // Drain any handle left over from a previous test (idempotent by AC-9b).
    await stopScheduledTask();
  });

  // AC-9 / AC-9b: stopping the registered task calls stop() exactly once.
  it('stops the registered task exactly once', async () => {
    const { task, stop } = buildTask();

    registerScheduledTask(task);
    await stopScheduledTask();

    expect(stop).toHaveBeenCalledTimes(1);
  });

  // AC-9b: stopping with nothing registered is a no-op, no throw.
  it('is a no-op when nothing is registered', async () => {
    await expect(stopScheduledTask()).resolves.toBeUndefined();
  });

  // AC-9b: stopping twice does not call stop() a second time on the same handle.
  it('does not call stop() again on a second stop with no new registration', async () => {
    const { task, stop } = buildTask();

    registerScheduledTask(task);
    await stopScheduledTask();
    await stopScheduledTask();

    expect(stop).toHaveBeenCalledTimes(1);
  });
});
