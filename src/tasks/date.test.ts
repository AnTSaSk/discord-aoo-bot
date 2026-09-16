import { describe, it, expect, vi, afterEach } from 'vitest';
import dayjs from 'dayjs';
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

// objective-taxonomy AC-9, AC-10, AC-11; time-input-parsing AC-8c — the parser accepts a
// caller-supplied cap instead of always reading the global MAX_TOTAL_MINUTES.
describe('parseTimeInput with a caller-supplied cap', () => {
  // AC-9: a delay above the applicable cap is rejected as out of range, whatever the cap.
  it('rejects 31 minutes as out of range against a 30-minute cap (Small portal)', () => {
    const result = parseTimeInput('31', 30);

    expect(result).toEqual({ ok: false, reason: 'range' });
  });

  it('rejects 61 minutes as out of range against a 60-minute cap (Medium portal)', () => {
    const result = parseTimeInput('61', 60);

    expect(result).toEqual({ ok: false, reason: 'range' });
  });

  it('rejects 181 minutes as out of range against a 180-minute cap (Large portal)', () => {
    const result = parseTimeInput('181', 180);

    expect(result).toEqual({ ok: false, reason: 'range' });
  });

  // AC-10: a value exactly at the cap is accepted (inclusive bound) and stored unchanged.
  it('accepts exactly 30 minutes against a 30-minute cap, stored unchanged', () => {
    const result = parseTimeInput('30', 30);

    expect(result).toEqual({ ok: true, minutes: 30 });
  });

  // AC-10: a value below the cap is accepted and stored unchanged — no rounding, no completion.
  it('accepts 10 minutes against a 30-minute cap, stored unchanged (no rounding, no completion)', () => {
    const result = parseTimeInput('10', 30);

    expect(result).toEqual({ ok: true, minutes: 10 });
  });

  // AC-11 / AC-8c: an input both malformed and out of range yields the FORMAT error, never range.
  // "1h90" is malformed (composed-form minutes >= 60) AND its raw numeric reading (90 minutes as
  // hours+minutes would exceed a 30-minute Small cap) would also be out of range — format must win.
  it('reports a format error, not range, for "1h90" against a 30-minute cap (malformed AND out of range)', () => {
    const result = parseTimeInput('1h90', 30);

    expect(result).toEqual({ ok: false, reason: 'format' });
  });

  // Non-regression: omitting the cap keeps the default 1440-minute ceiling behaviour.
  it('falls back to the default 1440-minute cap when no cap is supplied', () => {
    const result = parseTimeInput('1440');

    expect(result).toEqual({ ok: true, minutes: 1440 });
  });
});
