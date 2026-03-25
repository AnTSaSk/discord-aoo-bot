import { describe, it, expect, vi, afterEach } from 'vitest';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';

import { getRelativeTime, isMaintenanceAdded } from '@/tasks/date.js';

dayjs.extend(utc);

describe('getRelativeTime', () => {
  it('adds hours and minutes to the given date', () => {
    const base = new Date('2026-03-01T08:00:00Z');
    const result = getRelativeTime(base, '2:30');

    expect(result.utc().hour()).toBe(10);
    expect(result.utc().minute()).toBe(30);
  });

  it('handles midnight rollover', () => {
    const base = new Date('2026-03-01T23:00:00Z');
    const result = getRelativeTime(base, '3:00');

    expect(result.utc().date()).toBe(2);
    expect(result.utc().hour()).toBe(2);
  });

  it('handles zero hours', () => {
    const base = new Date('2026-03-01T12:00:00Z');
    const result = getRelativeTime(base, '0:45');

    expect(result.utc().hour()).toBe(12);
    expect(result.utc().minute()).toBe(45);
  });

  it('handles single-digit format', () => {
    const base = new Date('2026-03-01T06:00:00Z');
    const result = getRelativeTime(base, '1:05');

    expect(result.utc().hour()).toBe(7);
    expect(result.utc().minute()).toBe(5);
  });
});

describe('isMaintenanceAdded', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false when objective crosses reset hour on same day', () => {
    // Current time: 08:00 UTC (before reset), objective: 11:00 UTC (after reset)
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T08:00:00Z'));

    const objectiveTime = dayjs.utc('2026-03-01T11:00:00Z');
    const result = isMaintenanceAdded(objectiveTime);

    expect(result).toBe(false);
    vi.useRealTimers();
  });

  it('returns true when objective is before reset on same day', () => {
    // Current time: 08:00 UTC, objective: 09:00 UTC (both before reset)
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T08:00:00Z'));

    const objectiveTime = dayjs.utc('2026-03-01T09:00:00Z');
    const result = isMaintenanceAdded(objectiveTime);

    expect(result).toBe(true);
    vi.useRealTimers();
  });

  it('returns false when objective is after reset on different day', () => {
    // Current time: 20:00 UTC, objective: next day 11:00 UTC (after reset)
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T20:00:00Z'));

    const objectiveTime = dayjs.utc('2026-03-02T11:00:00Z');
    const result = isMaintenanceAdded(objectiveTime);

    expect(result).toBe(false);
    vi.useRealTimers();
  });

  it('returns true when objective is before reset on different day', () => {
    // Current time: 20:00 UTC, objective: next day 09:00 UTC (before reset)
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T20:00:00Z'));

    const objectiveTime = dayjs.utc('2026-03-02T09:00:00Z');
    const result = isMaintenanceAdded(objectiveTime);

    expect(result).toBe(true);
    vi.useRealTimers();
  });
});
