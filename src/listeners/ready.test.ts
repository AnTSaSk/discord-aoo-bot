import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Client } from 'discord.js';

import { ReadyListener } from '@/listeners/ready.js';

const {
  objectiveSyncMock,
  guildSettingsSyncMock,
  broadcastAnnouncementMock,
  cronScheduleMock,
  registerScheduledTaskMock,
} = vi.hoisted(() => ({
  objectiveSyncMock: vi.fn().mockResolvedValue(undefined),
  guildSettingsSyncMock: vi.fn().mockResolvedValue(undefined),
  broadcastAnnouncementMock: vi.fn().mockResolvedValue(undefined),
  cronScheduleMock: vi.fn(),
  registerScheduledTaskMock: vi.fn(),
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

  it('schedules the objective cron', () => {
    createListener().run(buildClient());

    expect(cronScheduleMock).toHaveBeenCalled();
  });

  // AC-8: the ScheduledTask returned by cron.schedule is registered for shutdown.
  it('registers the ScheduledTask returned by cron.schedule', () => {
    const scheduledTask = { stop: vi.fn() };

    cronScheduleMock.mockReturnValue(scheduledTask);

    createListener().run(buildClient());

    expect(registerScheduledTaskMock).toHaveBeenCalledWith(scheduledTask);
  });
});
