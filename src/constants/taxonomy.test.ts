import { describe, it, expect } from 'vitest';

import { TYPES } from '@/constants/type.js';
import { RARITIES, RARITY_NONE } from '@/constants/rarity.js';
import { MAX_TOTAL_MINUTES } from '@/constants/config.js';

describe('TYPES (tracked types referential)', () => {
  it('objective-taxonomy AC-28: holds exactly the seven tracked types, without Ancient Lands Portal', () => {
    expect(TYPES).toHaveLength(7);
    expect(new Set(TYPES)).toEqual(
      new Set(['Fiber node', 'Hide node', 'Ore node', 'Wood node', 'Core', 'Vortex', 'Dragon']),
    );
  });

  it('has no duplicate entries', () => {
    expect(new Set(TYPES).size).toBe(TYPES.length);
  });
});

describe('RARITIES (rarity referential)', () => {
  it('objective-taxonomy AC-29: holds exactly the numeric tiers and named rarities, without Small, Medium or Large', () => {
    expect(RARITIES).toHaveLength(9);
    expect(new Set(RARITIES)).toEqual(
      new Set(['4.4', '5.4', '6.4', '7.4', '8.4', 'Green', 'Blue', 'Purple', 'Gold']),
    );
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

describe('single delay cap (config.ts)', () => {
  it('objective-taxonomy AC-31: sets the single cap MAX_TOTAL_MINUTES to 1440', () => {
    expect(MAX_TOTAL_MINUTES).toBe(1440);
  });
});
