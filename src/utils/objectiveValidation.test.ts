import { describe, it, expect } from 'vitest';

import { isValidTypeRarityCombination } from '@/utils/objectiveValidation.js';
import {
  TYPE_NODE_FIBER,
  TYPE_NODE_HIDE,
  TYPE_NODE_ORE,
  TYPE_NODE_WOOD,
  TYPE_CORE,
  TYPE_VORTEX,
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
});
