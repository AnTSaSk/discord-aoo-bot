import {
  TYPE_NODE_FIBER,
  TYPE_NODE_HIDE,
  TYPE_NODE_ORE,
  TYPE_NODE_WOOD,
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

const NODE_TYPES = new Set<string>([
  TYPE_NODE_FIBER,
  TYPE_NODE_HIDE,
  TYPE_NODE_ORE,
  TYPE_NODE_WOOD,
]);
const NUMERIC_TIER_RARITIES = new Set<string>([
  RARITY_4_4,
  RARITY_5_4,
  RARITY_6_4,
  RARITY_7_4,
  RARITY_8_4,
]);
const NAMED_RARITIES = new Set<string>([RARITY_COMMON, RARITY_RARE, RARITY_EPIC, RARITY_LEGENDARY]);

export const isValidTypeRarityCombination = (type: string, rarity: string): boolean => {
  if (NODE_TYPES.has(type)) {
    return NUMERIC_TIER_RARITIES.has(rarity);
  }

  return NAMED_RARITIES.has(rarity);
};
