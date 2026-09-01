import { describe, it, expect } from 'vitest';

import type { Objective } from '@/models/objective.model.js';
import { DUPLICATE_TIME_WINDOW_MINUTES } from '@/constants/config.js';
import { isDuplicateObjective } from '@/utils/duplicateCheck.js';

const REFERENCE_TIME = new Date('2026-09-01T14:00:00Z');

const buildObjective = (overrides: Partial<Objective> = {}): Objective =>
  ({
    id: overrides.id ?? 1,
    guildId: overrides.guildId ?? 'guild-1',
    type: overrides.type ?? 'Core',
    rarity: overrides.rarity ?? 'Green',
    map: overrides.map ?? 'Thetford',
    time: overrides.time ?? REFERENCE_TIME,
  }) as Objective;

describe('isDuplicateObjective', () => {
  it('flags an existing objective as a duplicate when guildId/type/rarity/map match and time falls inside the window (AC-5)', () => {
    const candidate = {
      guildId: 'guild-1',
      type: 'Core',
      rarity: 'Green',
      map: 'Thetford',
      time: REFERENCE_TIME,
    };
    const existing = buildObjective({ id: 1, time: new Date('2026-09-01T14:02:00Z') });

    expect(isDuplicateObjective(candidate, [existing])).toBe(true);
  });

  it('does not flag an existing objective whose time falls outside the window (AC-5)', () => {
    const candidate = {
      guildId: 'guild-1',
      type: 'Core',
      rarity: 'Green',
      map: 'Thetford',
      time: REFERENCE_TIME,
    };
    const existing = buildObjective({
      id: 1,
      time: new Date(REFERENCE_TIME.getTime() + (DUPLICATE_TIME_WINDOW_MINUTES + 5) * 60_000),
    });

    expect(isDuplicateObjective(candidate, [existing])).toBe(false);
  });

  it('never treats the excluded objective as its own duplicate (AC-6)', () => {
    const candidate = {
      guildId: 'guild-1',
      type: 'Core',
      rarity: 'Green',
      map: 'Thetford',
      time: REFERENCE_TIME,
    };
    const self = buildObjective({ id: 7, time: REFERENCE_TIME });

    expect(isDuplicateObjective(candidate, [self], { excludeId: 7 })).toBe(false);
  });

  it('still detects a duplicate from another objective when one objective is excluded (AC-6)', () => {
    const candidate = {
      guildId: 'guild-1',
      type: 'Core',
      rarity: 'Green',
      map: 'Thetford',
      time: REFERENCE_TIME,
    };
    const self = buildObjective({ id: 7, time: REFERENCE_TIME });
    const other = buildObjective({ id: 9, time: new Date('2026-09-01T14:01:00Z') });

    expect(isDuplicateObjective(candidate, [self, other], { excludeId: 7 })).toBe(true);
  });

  it('flags a duplicate exactly at the lower bound of DUPLICATE_TIME_WINDOW_MINUTES read from config (AC-5)', () => {
    const candidate = {
      guildId: 'guild-1',
      type: 'Core',
      rarity: 'Green',
      map: 'Thetford',
      time: REFERENCE_TIME,
    };
    const existing = buildObjective({
      id: 1,
      time: new Date(REFERENCE_TIME.getTime() - DUPLICATE_TIME_WINDOW_MINUTES * 60_000),
    });

    expect(isDuplicateObjective(candidate, [existing])).toBe(true);
  });

  it('flags a duplicate exactly at the upper bound of DUPLICATE_TIME_WINDOW_MINUTES read from config (AC-5)', () => {
    const candidate = {
      guildId: 'guild-1',
      type: 'Core',
      rarity: 'Green',
      map: 'Thetford',
      time: REFERENCE_TIME,
    };
    const existing = buildObjective({
      id: 1,
      time: new Date(REFERENCE_TIME.getTime() + DUPLICATE_TIME_WINDOW_MINUTES * 60_000),
    });

    expect(isDuplicateObjective(candidate, [existing])).toBe(true);
  });

  it('does not flag a duplicate just past the upper bound of DUPLICATE_TIME_WINDOW_MINUTES (AC-5)', () => {
    const candidate = {
      guildId: 'guild-1',
      type: 'Core',
      rarity: 'Green',
      map: 'Thetford',
      time: REFERENCE_TIME,
    };
    const existing = buildObjective({
      id: 1,
      time: new Date(REFERENCE_TIME.getTime() + (DUPLICATE_TIME_WINDOW_MINUTES * 60_000 + 60_000)),
    });

    expect(isDuplicateObjective(candidate, [existing])).toBe(false);
  });

  it('never treats an objective belonging to another guild as a duplicate, even with identical type/rarity/map/time (multi-guild isolation)', () => {
    const candidate = {
      guildId: 'guild-1',
      type: 'Core',
      rarity: 'Green',
      map: 'Thetford',
      time: REFERENCE_TIME,
    };
    const other = buildObjective({ id: 1, guildId: 'guild-2', time: REFERENCE_TIME });

    expect(isDuplicateObjective(candidate, [other])).toBe(false);
  });
});
