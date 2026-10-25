import { describe, it, expect } from 'vitest';

import {
  getMapZoneForType,
  isValidTypeMapCombination,
  isValidTypeRarityCombination,
  MAPS_ALL_SORTED,
} from '@/utils/objectiveValidation.js';
import { MAPS_BLACK_ZONE, MAPS_ROYAL } from '@/constants/map.js';
import {
  TYPE_NODE_FIBER,
  TYPE_NODE_HIDE,
  TYPE_NODE_ORE,
  TYPE_NODE_WOOD,
  TYPE_CORE,
  TYPE_VORTEX,
  TYPE_DRAGON,
} from '@/constants/type.js';
import {
  RARITY_4_4,
  RARITY_5_4,
  RARITY_6_4,
  RARITY_7_4,
  RARITY_8_4,
  RARITY_COMMON,
  RARITY_RARE,
  RARITY_EPIC,
  RARITY_LEGENDARY,
  RARITY_NONE,
} from '@/constants/rarity.js';

const NODE_TYPES = [TYPE_NODE_FIBER, TYPE_NODE_HIDE, TYPE_NODE_ORE, TYPE_NODE_WOOD];
const NAMED_RARITY_TYPES = [TYPE_CORE, TYPE_VORTEX];
const NUMERIC_TIER_RARITIES = [RARITY_4_4, RARITY_5_4, RARITY_6_4, RARITY_7_4, RARITY_8_4];
const NAMED_RARITIES = [RARITY_COMMON, RARITY_RARE, RARITY_EPIC, RARITY_LEGENDARY];

describe('isValidTypeRarityCombination', () => {
  it.each(NODE_TYPES.flatMap((type) => NUMERIC_TIER_RARITIES.map((rarity) => [type, rarity])))(
    'accepts node type %s with numeric tier rarity %s (AC-3)',
    (type, rarity) => {
      expect(isValidTypeRarityCombination(type, rarity)).toBe(true);
    },
  );

  it.each(NAMED_RARITY_TYPES.flatMap((type) => NAMED_RARITIES.map((rarity) => [type, rarity])))(
    'accepts %s with named rarity %s (AC-3)',
    (type, rarity) => {
      expect(isValidTypeRarityCombination(type, rarity)).toBe(true);
    },
  );

  it('refuses a node type combined with a named rarity (AC-4)', () => {
    expect(isValidTypeRarityCombination(TYPE_NODE_FIBER, RARITY_EPIC)).toBe(false);
  });

  it('refuses Core combined with a numeric tier rarity (AC-4)', () => {
    expect(isValidTypeRarityCombination(TYPE_CORE, RARITY_4_4)).toBe(false);
  });

  it('refuses Vortex combined with a numeric tier rarity (AC-4)', () => {
    expect(isValidTypeRarityCombination(TYPE_VORTEX, RARITY_4_4)).toBe(false);
  });

  // AC-1: node type accepts only numeric tier rarities, rejects named rarity
  it.each(NODE_TYPES)('refuses node type %s combined with a named rarity (AC-1)', (type) => {
    expect(isValidTypeRarityCombination(type, RARITY_EPIC)).toBe(false);
  });

  it.each(NODE_TYPES.flatMap((type) => NUMERIC_TIER_RARITIES.map((rarity) => [type, rarity])))(
    'accepts node type %s with numeric tier rarity %s (AC-1)',
    (type, rarity) => {
      expect(isValidTypeRarityCombination(type, rarity)).toBe(true);
    },
  );

  // AC-2: Core/Vortex accepts only named rarities, rejects numeric tier
  it.each(NAMED_RARITY_TYPES)('refuses %s combined with a numeric tier rarity (AC-2)', (type) => {
    expect(isValidTypeRarityCombination(type, RARITY_4_4)).toBe(false);
  });

  it.each(NAMED_RARITY_TYPES.flatMap((type) => NAMED_RARITIES.map((rarity) => [type, rarity])))(
    'accepts %s with named rarity %s (AC-2)',
    (type, rarity) => {
      expect(isValidTypeRarityCombination(type, rarity)).toBe(true);
    },
  );

  // Plan 2.1: an unknown type must inherit no family — no permissive fallback.
  it('refuses an unknown type regardless of rarity, including the sentinel', () => {
    expect(isValidTypeRarityCombination('Unknown type', RARITY_4_4)).toBe(false);
    expect(isValidTypeRarityCombination('Unknown type', RARITY_EPIC)).toBe(false);
    expect(isValidTypeRarityCombination('Unknown type', RARITY_NONE)).toBe(false);
  });

  it('refuses Dragon combined with any real rarity (AC-5 precondition)', () => {
    expect(isValidTypeRarityCombination(TYPE_DRAGON, RARITY_4_4)).toBe(false);
    expect(isValidTypeRarityCombination(TYPE_DRAGON, RARITY_EPIC)).toBe(false);
  });

  it('accepts Dragon only with the sentinel rarity', () => {
    expect(isValidTypeRarityCombination(TYPE_DRAGON, RARITY_NONE)).toBe(true);
  });
});

describe('type/map zone combination (ADR-0011, AC-21..AC-27)', () => {
  // AC-24: a Royal map is admissible only for the Dragon type.
  it.each([
    TYPE_NODE_FIBER,
    TYPE_NODE_HIDE,
    TYPE_NODE_ORE,
    TYPE_NODE_WOOD,
    TYPE_CORE,
    TYPE_VORTEX,
  ])('rejects a Royal map for %s', (type) => {
    expect(isValidTypeMapCombination(type, MAPS_ROYAL[0])).toBe(false);
  });

  it('accepts a Royal map for Dragon', () => {
    expect(isValidTypeMapCombination(TYPE_DRAGON, MAPS_ROYAL[0])).toBe(true);
  });

  // AC-25: the Dragon admits both zones, not only the Royal one.
  it('accepts a Black Zone map for Dragon', () => {
    expect(isValidTypeMapCombination(TYPE_DRAGON, MAPS_BLACK_ZONE[0])).toBe(true);
  });

  it('accepts a Black Zone map for a non-Dragon type', () => {
    expect(isValidTypeMapCombination(TYPE_NODE_ORE, MAPS_BLACK_ZONE[0])).toBe(true);
  });

  it('rejects any map for an unknown type, without a permissive fallback', () => {
    expect(isValidTypeMapCombination('Unknown type', MAPS_BLACK_ZONE[0])).toBe(false);
    expect(getMapZoneForType('Unknown type')).toBeUndefined();
  });

  it('sorts the full map list alphabetically across both zones', () => {
    const expected = [...MAPS_ALL_SORTED].sort((a, b) => a.localeCompare(b));

    expect(MAPS_ALL_SORTED).toEqual(expected);
    expect(MAPS_ALL_SORTED).toHaveLength(MAPS_BLACK_ZONE.length + MAPS_ROYAL.length);
  });
});
