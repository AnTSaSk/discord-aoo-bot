import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Client } from 'discord.js';

import { ReadyListener } from '@/listeners/ready.js';

const {
  objectiveSyncMock,
  guildSettingsSyncMock,
  broadcastAnnouncementMock,
  cronScheduleMock,
  registerScheduledTaskMock,
  reconcileGuildRemovalsMock,
  loggerMock,
} = vi.hoisted(() => ({
  objectiveSyncMock: vi.fn().mockResolvedValue(undefined),
  guildSettingsSyncMock: vi.fn().mockResolvedValue(undefined),
  broadcastAnnouncementMock: vi.fn().mockResolvedValue(undefined),
  cronScheduleMock: vi.fn(),
  registerScheduledTaskMock: vi.fn(),
  reconcileGuildRemovalsMock: vi.fn().mockResolvedValue(undefined),
  loggerMock: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('@/config/logger.js', () => ({
  getLogger: () => loggerMock,
}));

vi.mock('@/tasks/retentionReconcile.js', () => ({
  reconcileGuildRemovals: reconcileGuildRemovalsMock,
}));

vi.mock('@/models/objective.model.js', () => ({
  getObjectiveModel: () => ({ sync: objectiveSyncMock }),
}));

vi.mock('@/models/guildSettings.model.js', () => ({
  getGuildSettingsModel: () => ({ sync: guildSettingsSyncMock }),
}));

vi.mock('@/tasks/announcement.js', () => ({
  broadcastAnnouncement: broadcastAnnouncementMock,
}));

vi.mock('node-cron', () => ({
  default: { schedule: cronScheduleMock },
}));

vi.mock('@/tasks/cron.js', () => ({
  cronTask: vi.fn(),
  registerScheduledTask: registerScheduledTaskMock,
  stopScheduledTask: vi.fn(),
}));

const buildClient = (): Client<true> =>
  ({ user: { displayName: 'AOO Bot' } }) as unknown as Client<true>;

const createListener = (): ReadyListener =>
  Object.create(ReadyListener.prototype) as ReadyListener;

describe('ReadyListener startup sequence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    objectiveSyncMock.mockResolvedValue(undefined);
    guildSettingsSyncMock.mockResolvedValue(undefined);
    broadcastAnnouncementMock.mockResolvedValue(undefined);
    reconcileGuildRemovalsMock.mockResolvedValue(undefined);
    cronScheduleMock.mockReset();
  });

  it('synchronizes both models, not just the objective one', async () => {
    createListener().run(buildClient());

    await vi.waitFor(() => {
      expect(objectiveSyncMock).toHaveBeenCalled();
      expect(guildSettingsSyncMock).toHaveBeenCalled();
    });
  });

  it('broadcasts the announcement after the schema is synchronized', async () => {
    createListener().run(buildClient());

    await vi.waitFor(() => {
      expect(broadcastAnnouncementMock).toHaveBeenCalled();
    });
  });

  it('never broadcasts when the schema synchronization fails', async () => {
    guildSettingsSyncMock.mockRejectedValue(new Error('db down'));

    createListener().run(buildClient());

    await vi.waitFor(() => {
      expect(objectiveSyncMock).toHaveBeenCalled();
    });

    expect(broadcastAnnouncementMock).not.toHaveBeenCalled();
  });

  it('still schedules the cron when the broadcast fails', async () => {
    broadcastAnnouncementMock.mockRejectedValue(new Error('discord down'));

    createListener().run(buildClient());

    await vi.waitFor(() => {
      expect(broadcastAnnouncementMock).toHaveBeenCalled();
    });

    expect(cronScheduleMock).toHaveBeenCalled();
  });

  it('schedules the objective cron', async () => {
    createListener().run(buildClient());

    await vi.waitFor(() => {
      expect(cronScheduleMock).toHaveBeenCalled();
    });
  });

  // AC-8: the ScheduledTask returned by cron.schedule is registered for shutdown.
  it('registers the ScheduledTask returned by cron.schedule', async () => {
    const scheduledTask = { stop: vi.fn() };

    cronScheduleMock.mockReturnValue(scheduledTask);

    createListener().run(buildClient());

    await vi.waitFor(() => {
      expect(registerScheduledTaskMock).toHaveBeenCalledWith(scheduledTask);
    });
  });

  it('P3 runs the model sync, then the reconciliation, then the cron scheduling', async () => {
    const callOrder: string[] = [];

    guildSettingsSyncMock.mockImplementation(() => {
      callOrder.push('sync');

      return Promise.resolve(undefined);
    });
    reconcileGuildRemovalsMock.mockImplementation(() => {
      callOrder.push('reconcile');

      return Promise.resolve(undefined);
    });
    cronScheduleMock.mockImplementation(() => {
      callOrder.push('cron');

      return { stop: vi.fn() };
    });

    createListener().run(buildClient());

    await vi.waitFor(() => {
      expect(cronScheduleMock).toHaveBeenCalled();
    });

    expect(callOrder).toEqual(['sync', 'reconcile', 'cron']);
  });

  it('P3 gives the reconciliation the client and a Date', async () => {
    const client = buildClient();

    createListener().run(client);

    await vi.waitFor(() => {
      expect(reconcileGuildRemovalsMock).toHaveBeenCalledTimes(1);
    });

    expect(reconcileGuildRemovalsMock.mock.calls[0]?.[0]).toBe(client);
    expect(reconcileGuildRemovalsMock.mock.calls[0]?.[1]).toBeInstanceOf(Date);
  });

  it('P3 logs one error and still schedules the cron when the reconciliation fails', async () => {
    reconcileGuildRemovalsMock.mockRejectedValue(new Error('db down'));

    expect(() => {
      createListener().run(buildClient());
    }).not.toThrow();

    await vi.waitFor(() => {
      expect(cronScheduleMock).toHaveBeenCalled();
    });

    expect(loggerMock.error).toHaveBeenCalledTimes(1);
  });
});

