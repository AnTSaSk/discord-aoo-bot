import { describe, it, expect } from 'vitest';

import { TYPES } from '@/constants/type.js';
import { RARITIES, RARITY_NONE } from '@/constants/rarity.js';
import {
  MAX_TOTAL_MINUTES,
  MAX_PORTAL_SMALL_MINUTES,
  MAX_PORTAL_MEDIUM_MINUTES,
  MAX_PORTAL_LARGE_MINUTES,
} from '@/constants/config.js';

describe('TYPES (Dragonfire taxonomy)', () => {
  it('contains exactly 8 types', () => {
    expect(TYPES).toHaveLength(8);
  });

  it('includes the exact value Ancient Lands Portal', () => {
    expect(TYPES).toContain('Ancient Lands Portal');
  });

  it('includes the exact value Dragon', () => {
    expect(TYPES).toContain('Dragon');
  });

  it('has no duplicate entries', () => {
    expect(new Set(TYPES).size).toBe(TYPES.length);
  });
});

describe('RARITIES (Dragonfire portal sizes)', () => {
  it('contains exactly 12 entries (9 existing + 3 sizes)', () => {
    expect(RARITIES).toHaveLength(12);
  });

  it('includes the exact value Small', () => {
    expect(RARITIES).toContain('Small');
  });

  it('includes the exact value Medium', () => {
    expect(RARITIES).toContain('Medium');
  });

  it('includes the exact value Large', () => {
    expect(RARITIES).toContain('Large');
  });

  it('has no duplicate entries', () => {
    expect(new Set(RARITIES).size).toBe(RARITIES.length);
  });

  it('never includes the RARITY_NONE sentinel value (ADR-0004)', () => {
    expect(RARITIES).not.toContain('n/a');
  });

  it('never includes the RARITY_NONE constant itself', () => {
    expect(RARITIES.includes(RARITY_NONE)).toBe(false);
  });
});

describe('RARITY_NONE sentinel', () => {
  it('is exported with the exact value n/a', () => {
    expect(RARITY_NONE).toBe('n/a');
  });
});

describe('portal size time caps (config.ts)', () => {
  it('sets MAX_PORTAL_SMALL_MINUTES to 30', () => {
    expect(MAX_PORTAL_SMALL_MINUTES).toBe(30);
  });

  it('sets MAX_PORTAL_MEDIUM_MINUTES to 60', () => {
    expect(MAX_PORTAL_MEDIUM_MINUTES).toBe(60);
  });

  it('sets MAX_PORTAL_LARGE_MINUTES to 180', () => {
    expect(MAX_PORTAL_LARGE_MINUTES).toBe(180);
  });

  it('orders the three caps strictly increasing (small < medium < large)', () => {
    expect(MAX_PORTAL_SMALL_MINUTES).toBeLessThan(MAX_PORTAL_MEDIUM_MINUTES);
    expect(MAX_PORTAL_MEDIUM_MINUTES).toBeLessThan(MAX_PORTAL_LARGE_MINUTES);
  });

  it('keeps the default MAX_TOTAL_MINUTES strictly above the largest portal cap', () => {
    expect(MAX_TOTAL_MINUTES).toBeGreaterThan(MAX_PORTAL_LARGE_MINUTES);
  });
});
