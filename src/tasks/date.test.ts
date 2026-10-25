import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import dayjs, { type Dayjs } from 'dayjs';
import utc from 'dayjs/plugin/utc.js';

import { getRelativeTime, isMaintenanceAdded, parseTimeInput } from '@/tasks/date.js';

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
  // The system clock is pinned to an instant unrelated to every scenario, so an implementation
  // reading the wall clock instead of `commandTime` cannot pass by accident.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2031-05-05T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const at = (iso: string): Date => new Date(iso);
  const unlock = (iso: string): Dayjs => dayjs.utc(iso);

  it('returns false when objective crosses reset hour on same day', () => {
    // Command 08:00 UTC (before reset), objective 11:00 UTC (after reset)
    const result = isMaintenanceAdded(unlock('2026-03-01T11:00:00Z'), at('2026-03-01T08:00:00Z'));

    expect(result).toBe(false);
  });

  it('returns true when objective is before reset on same day', () => {
    // Command 08:00 UTC, objective 09:00 UTC (both before reset)
    const result = isMaintenanceAdded(unlock('2026-03-01T09:00:00Z'), at('2026-03-01T08:00:00Z'));

    expect(result).toBe(true);
  });

  it('returns false when objective is after reset on different day', () => {
    // Command 20:00 UTC, objective next day 11:00 UTC (after reset)
    const result = isMaintenanceAdded(unlock('2026-03-02T11:00:00Z'), at('2026-03-01T20:00:00Z'));

    expect(result).toBe(false);
  });

  it('returns true when objective is before reset on different day', () => {
    // Command 20:00 UTC, objective next day 09:00 UTC (before reset)
    const result = isMaintenanceAdded(unlock('2026-03-02T09:00:00Z'), at('2026-03-01T20:00:00Z'));

    expect(result).toBe(true);
  });

  describe('time-input-parsing AC-11', () => {
    it('time-input-parsing AC-11: 09:30 → 09:59 the same day does not cross the maintenance', () => {
      const result = isMaintenanceAdded(unlock('2026-10-16T09:59:00Z'), at('2026-10-16T09:30:00Z'));

      expect(result).toBe(true);
    });

    it('time-input-parsing AC-11: 09:30 → 14:00 the same day crosses the maintenance', () => {
      const result = isMaintenanceAdded(unlock('2026-10-16T14:00:00Z'), at('2026-10-16T09:30:00Z'));

      expect(result).toBe(false);
    });

    it('time-input-parsing AC-11: 10:30 → 14:00 the same day does not cross (next maintenance is tomorrow)', () => {
      const result = isMaintenanceAdded(unlock('2026-10-16T14:00:00Z'), at('2026-10-16T10:30:00Z'));

      expect(result).toBe(true);
    });
  });

  it('time-input-parsing AC-12: 09:30 → 00:00 the next UTC day crosses the same-day maintenance', () => {
    const result = isMaintenanceAdded(unlock('2026-10-17T00:00:00Z'), at('2026-10-16T09:30:00Z'));

    expect(result).toBe(false);
  });

  it('time-input-parsing AC-13: 09:00 → exactly 10:00:00 crosses the maintenance', () => {
    const result = isMaintenanceAdded(unlock('2026-10-16T10:00:00Z'), at('2026-10-16T09:00:00Z'));

    expect(result).toBe(false);
  });

  describe('time-input-parsing AC-14', () => {
    it('time-input-parsing AC-14: command at exactly 10:00:00 → 23:00 the same day does not cross', () => {
      const result = isMaintenanceAdded(unlock('2026-10-16T23:00:00Z'), at('2026-10-16T10:00:00Z'));

      expect(result).toBe(true);
    });

    it('time-input-parsing AC-14: command at exactly 10:00:00 → 09:59 the next day does not cross', () => {
      const result = isMaintenanceAdded(unlock('2026-10-17T09:59:00Z'), at('2026-10-16T10:00:00Z'));

      expect(result).toBe(true);
    });
  });

  describe('time-input-parsing AC-15', () => {
    it('time-input-parsing AC-15: 09:59 → 10:00 crosses the maintenance', () => {
      const result = isMaintenanceAdded(unlock('2026-10-16T10:00:00Z'), at('2026-10-16T09:59:00Z'));

      expect(result).toBe(false);
    });

    it('time-input-parsing AC-15: 09:30 → 10:30 the same day crosses the maintenance', () => {
      const result = isMaintenanceAdded(unlock('2026-10-16T10:30:00Z'), at('2026-10-16T09:30:00Z'));

      expect(result).toBe(false);
    });

    it('time-input-parsing AC-15: 10:30 → 09:00 the next day does not cross', () => {
      const result = isMaintenanceAdded(unlock('2026-10-17T09:00:00Z'), at('2026-10-16T10:30:00Z'));

      expect(result).toBe(true);
    });
  });

  describe('time-input-parsing AC-16', () => {
    it('time-input-parsing AC-16: 09:30 + 1440 minutes crosses the maintenance', () => {
      const command = at('2026-10-16T09:30:00Z');

      expect(isMaintenanceAdded(getRelativeTime(command, '1440'), command)).toBe(false);
    });

    it('time-input-parsing AC-16: exactly 10:00:00 + 1440 minutes crosses the maintenance', () => {
      const command = at('2026-10-16T10:00:00Z');

      expect(isMaintenanceAdded(getRelativeTime(command, '1440'), command)).toBe(false);
    });

    it('time-input-parsing AC-16: 23:00 + 1440 minutes crosses the maintenance', () => {
      const command = at('2026-10-16T23:00:00Z');

      expect(isMaintenanceAdded(getRelativeTime(command, '1440'), command)).toBe(false);
    });
  });
});

describe('parseTimeInput', () => {
  // AC-1: H:MM, HH:MM, HhMM, HhMMm, Hh MM, Hh MMm, Hh forms resolve to hours + minutes
  it('parses "1:30" as 1h30 (90 minutes)', () => {
    const result = parseTimeInput('1:30');

    expect(result).toEqual({ ok: true, minutes: 90 });
  });

  it('parses "02:30" as 2h30 (150 minutes)', () => {
    const result = parseTimeInput('02:30');

    expect(result).toEqual({ ok: true, minutes: 150 });
  });

  it('parses "1h30" as 1h30 (90 minutes)', () => {
    const result = parseTimeInput('1h30');

    expect(result).toEqual({ ok: true, minutes: 90 });
  });

  it('parses "1h30m" as 1h30 (90 minutes)', () => {
    const result = parseTimeInput('1h30m');

    expect(result).toEqual({ ok: true, minutes: 90 });
  });

  it('parses "1h 30" as 1h30 (90 minutes)', () => {
    const result = parseTimeInput('1h 30');

    expect(result).toEqual({ ok: true, minutes: 90 });
  });

  it('parses "1h 30m" as 1h30 (90 minutes)', () => {
    const result = parseTimeInput('1h 30m');

    expect(result).toEqual({ ok: true, minutes: 90 });
  });

  it('parses "1h" as 1h (60 minutes)', () => {
    const result = parseTimeInput('1h');

    expect(result).toEqual({ ok: true, minutes: 60 });
  });

  // Spec line 70: composed-form minutes range is 0-59, zero minutes is a valid component
  it('accepts "1h0m" as 60 minutes (zero minutes is valid in a composed form)', () => {
    const result = parseTimeInput('1h0m');

    expect(result).toEqual({ ok: true, minutes: 60 });
  });

  // AC-2: bare number without separator or suffix is interpreted as minutes
  it('parses bare "90" as 90 minutes', () => {
    const result = parseTimeInput('90');

    expect(result).toEqual({ ok: true, minutes: 90 });
  });

  // Spec line 42: a bare number is always minutes, leading zeros must not be dropped or misread as octal
  it('parses bare "007" as 7 minutes', () => {
    const result = parseTimeInput('007');

    expect(result).toEqual({ ok: true, minutes: 7 });
  });

  // AC-3: number followed by suffix "m" is interpreted as minutes
  it('parses "45m" as 45 minutes', () => {
    const result = parseTimeInput('45m');

    expect(result).toEqual({ ok: true, minutes: 45 });
  });

  it('parses "90m" as 90 minutes', () => {
    const result = parseTimeInput('90m');

    expect(result).toEqual({ ok: true, minutes: 90 });
  });

  // AC-4: ';', '.', ',' behave as the ':' separator
  it('treats ";" as the ":" separator, "1;30" resolves like "1:30"', () => {
    const result = parseTimeInput('1;30');

    expect(result).toEqual({ ok: true, minutes: 90 });
  });

  it('treats "." as the ":" separator, "1.30" resolves like "1:30"', () => {
    const result = parseTimeInput('1.30');

    expect(result).toEqual({ ok: true, minutes: 90 });
  });

  it('treats "," as the ":" separator, "1,30" resolves like "1:30"', () => {
    const result = parseTimeInput('1,30');

    expect(result).toEqual({ ok: true, minutes: 90 });
  });

  // AC-5: uppercase and surrounding whitespace normalize to the canonical result
  it('normalizes uppercase "1H30" to the same result as "1h30"', () => {
    const result = parseTimeInput('1H30');

    expect(result).toEqual({ ok: true, minutes: 90 });
  });

  it('normalizes uppercase "45M" to the same result as "45m"', () => {
    const result = parseTimeInput('45M');

    expect(result).toEqual({ ok: true, minutes: 45 });
  });

  it('normalizes surrounding whitespace " 1h 30 " to the same result as "1h 30"', () => {
    const result = parseTimeInput(' 1h 30 ');

    expect(result).toEqual({ ok: true, minutes: 90 });
  });

  // AC-8: unanchored/garbage input is rejected as a format error, not partially parsed
  it('rejects "90abc" as a format error', () => {
    const result = parseTimeInput('90abc');

    expect(result).toEqual({ ok: false, reason: 'format' });
  });

  it('rejects "1h30 tonight" as a format error', () => {
    const result = parseTimeInput('1h30 tonight');

    expect(result).toEqual({ ok: false, reason: 'format' });
  });

  it('rejects "--5" as a format error', () => {
    const result = parseTimeInput('--5');

    expect(result).toEqual({ ok: false, reason: 'format' });
  });

  it('rejects "h30" as a format error (missing hours part)', () => {
    const result = parseTimeInput('h30');

    expect(result).toEqual({ ok: false, reason: 'format' });
  });

  it('rejects "1h30x" as a format error (trailing garbage)', () => {
    const result = parseTimeInput('1h30x');

    expect(result).toEqual({ ok: false, reason: 'format' });
  });

  it('rejects an empty string as a format error', () => {
    const result = parseTimeInput('');

    expect(result).toEqual({ ok: false, reason: 'format' });
  });

  it('rejects a whitespace-only string as a format error', () => {
    const result = parseTimeInput('   ');

    expect(result).toEqual({ ok: false, reason: 'format' });
  });

  // AC-8b: more than one separator, or a separator missing one of its two parts
  it('rejects "1..30" as a format error (double separator)', () => {
    const result = parseTimeInput('1..30');

    expect(result).toEqual({ ok: false, reason: 'format' });
  });

  it('rejects "1;;30" as a format error (double separator)', () => {
    const result = parseTimeInput('1;;30');

    expect(result).toEqual({ ok: false, reason: 'format' });
  });

  it('rejects ":30" as a format error (missing hours part)', () => {
    const result = parseTimeInput(':30');

    expect(result).toEqual({ ok: false, reason: 'format' });
  });

  it('rejects "30:" as a format error (missing minutes part)', () => {
    const result = parseTimeInput('30:');

    expect(result).toEqual({ ok: false, reason: 'format' });
  });

  // AC-6, AC-8d: upper bound is inclusive at 1440 minutes
  it('accepts bare "1440" at the inclusive upper bound', () => {
    const result = parseTimeInput('1440');

    expect(result).toEqual({ ok: true, minutes: 1440 });
  });

  it('accepts "24:00" at the inclusive upper bound', () => {
    const result = parseTimeInput('24:00');

    expect(result).toEqual({ ok: true, minutes: 1440 });
  });

  // AC-6: strictly above the upper bound is a range error
  it('rejects bare "1441" as out of range', () => {
    const result = parseTimeInput('1441');

    expect(result).toEqual({ ok: false, reason: 'range' });
  });

  it('rejects "25:00" as out of range', () => {
    const result = parseTimeInput('25:00');

    expect(result).toEqual({ ok: false, reason: 'range' });
  });

  // AC-7, AC-8c: a recognized form resolving to 0 minutes is a range error, not a format error
  it('rejects bare "0" as out of range, not as a format error', () => {
    const result = parseTimeInput('0');

    expect(result).toEqual({ ok: false, reason: 'range' });
  });

  it('rejects "00:00" as out of range, not as a format error', () => {
    const result = parseTimeInput('00:00');

    expect(result).toEqual({ ok: false, reason: 'range' });
  });

  it('rejects "0m" as out of range, not as a format error', () => {
    const result = parseTimeInput('0m');

    expect(result).toEqual({ ok: false, reason: 'range' });
  });

  // AC-9: minutes part >= 60 in a composed form is a format error
  it('rejects "1h90" as a format error (minutes >= 60 in composed form)', () => {
    const result = parseTimeInput('1h90');

    expect(result).toEqual({ ok: false, reason: 'format' });
  });

  it('accepts bare "90" as 90 minutes, unaffected by the composed-form minutes rule', () => {
    const result = parseTimeInput('90');

    expect(result).toEqual({ ok: true, minutes: 90 });
  });

  it('accepts "90m" as 90 minutes, unaffected by the composed-form minutes rule', () => {
    const result = parseTimeInput('90m');

    expect(result).toEqual({ ok: true, minutes: 90 });
  });
});

describe('parseTimeInput single cap (objective-taxonomy AC-31)', () => {
  it('objective-taxonomy AC-31: rejects "1441" as out of range, the parser taking no caller-supplied cap', () => {
    const result = parseTimeInput('1441');

    expect(result).toEqual({ ok: false, reason: 'range' });
  });

  it('objective-taxonomy AC-31 / AC-10: accepts "1440" unchanged, the parser taking no caller-supplied cap', () => {
    const result = parseTimeInput('1440');

    expect(result).toEqual({ ok: true, minutes: 1440 });
  });
});
