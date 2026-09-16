import { describe, it, expect } from 'vitest';

import { resolveTimeBoundMinutes } from '@/utils/objectiveTimeBounds.js';
import {
  TYPE_NODE_FIBER,
  TYPE_NODE_HIDE,
  TYPE_NODE_ORE,
  TYPE_NODE_WOOD,
  TYPE_CORE,
  TYPE_VORTEX,
  TYPE_ANCIENT_LANDS_PORTAL,
  TYPE_DRAGON,
} from '@/constants/type.js';
import { RARITY_SMALL, RARITY_MEDIUM, RARITY_LARGE, RARITY_LEGENDARY, RARITY_4_4, RARITY_NONE } from '@/constants/rarity.js';
import {
  MAX_TOTAL_MINUTES,
  MAX_PORTAL_SMALL_MINUTES,
  MAX_PORTAL_MEDIUM_MINUTES,
  MAX_PORTAL_LARGE_MINUTES,
} from '@/constants/config.js';

// ADR-0005 / objective-taxonomy § Bornes de temps par type
describe('resolveTimeBoundMinutes', () => {
  // AC-9 (bound source): Ancient Lands Portal caps depend on the portal size.
  it('resolves the Small portal cap to 30 minutes', () => {
    const result = resolveTimeBoundMinutes(TYPE_ANCIENT_LANDS_PORTAL, RARITY_SMALL);

    expect(result).toBe(MAX_PORTAL_SMALL_MINUTES);
  });

  it('resolves the Medium portal cap to 60 minutes', () => {
    const result = resolveTimeBoundMinutes(TYPE_ANCIENT_LANDS_PORTAL, RARITY_MEDIUM);

    expect(result).toBe(MAX_PORTAL_MEDIUM_MINUTES);
  });

  it('resolves the Large portal cap to 180 minutes', () => {
    const result = resolveTimeBoundMinutes(TYPE_ANCIENT_LANDS_PORTAL, RARITY_LARGE);

    expect(result).toBe(MAX_PORTAL_LARGE_MINUTES);
  });

  // Plan 3.1: total function — every non-portal type falls back to MAX_TOTAL_MINUTES, Dragon included.
  it.each([
    ['Fiber node', TYPE_NODE_FIBER, RARITY_4_4],
    ['Hide node', TYPE_NODE_HIDE, RARITY_4_4],
    ['Ore node', TYPE_NODE_ORE, RARITY_4_4],
    ['Wood node', TYPE_NODE_WOOD, RARITY_4_4],
    ['Core', TYPE_CORE, RARITY_LEGENDARY],
    ['Vortex', TYPE_VORTEX, RARITY_LEGENDARY],
    ['Dragon', TYPE_DRAGON, RARITY_NONE],
  ])('resolves the default cap (1440) for %s', (_label, type, rarity) => {
    const result = resolveTimeBoundMinutes(type, rarity);

    expect(result).toBe(MAX_TOTAL_MINUTES);
  });

  // Plan 3.1: total function, no failure branch — an unrecognized type still returns the default cap.
  it('resolves the default cap (1440) for an unknown type', () => {
    const result = resolveTimeBoundMinutes('Not A Real Type', 'Not A Real Rarity');

    expect(result).toBe(MAX_TOTAL_MINUTES);
  });

  // Non-regression: a non-portal type keeps the 1440 cap even when paired with a portal-shaped rarity.
  it('keeps the default cap (1440) for a non-portal type regardless of rarity value', () => {
    const result = resolveTimeBoundMinutes(TYPE_CORE, RARITY_SMALL);

    expect(result).toBe(MAX_TOTAL_MINUTES);
  });
});
