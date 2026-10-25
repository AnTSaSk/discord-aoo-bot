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
import { MAPS, MAPS_BLACK_ZONE, MAPS_ROYAL } from '@/constants/map.js';

const NUMERIC_TIER_RARITIES = new Set<string>([
  RARITY_4_4,
  RARITY_5_4,
  RARITY_6_4,
  RARITY_7_4,
  RARITY_8_4,
]);
const NAMED_RARITIES = new Set<string>([RARITY_COMMON, RARITY_RARE, RARITY_EPIC, RARITY_LEGENDARY]);
const SENTINEL_ONLY = new Set<string>([RARITY_NONE]);

// Type -> its admissible rarity family. Single source consumed by validation and autocomplete.
const TYPE_RARITY_FAMILY = new Map<string, Set<string>>([
  [TYPE_NODE_FIBER, NUMERIC_TIER_RARITIES],
  [TYPE_NODE_HIDE, NUMERIC_TIER_RARITIES],
  [TYPE_NODE_ORE, NUMERIC_TIER_RARITIES],
  [TYPE_NODE_WOOD, NUMERIC_TIER_RARITIES],
  [TYPE_CORE, NAMED_RARITIES],
  [TYPE_VORTEX, NAMED_RARITIES],
  [TYPE_DRAGON, SENTINEL_ONLY],
]);

export const getRarityFamilyForType = (type: string): Set<string> | undefined =>
  TYPE_RARITY_FAMILY.get(type);

export const isValidTypeRarityCombination = (type: string, rarity: string): boolean =>
  getRarityFamilyForType(type)?.has(rarity) ?? false;

const BLACK_ZONE_ONLY = new Set<string>(MAPS_BLACK_ZONE);
const BOTH_ZONES = new Set<string>([...MAPS_BLACK_ZONE, ...MAPS_ROYAL]);

// Type -> its admissible map zone. Single source consumed by autocomplete and validation.
const TYPE_MAP_ZONE = new Map<string, Set<string>>([
  [TYPE_NODE_FIBER, BLACK_ZONE_ONLY],
  [TYPE_NODE_HIDE, BLACK_ZONE_ONLY],
  [TYPE_NODE_ORE, BLACK_ZONE_ONLY],
  [TYPE_NODE_WOOD, BLACK_ZONE_ONLY],
  [TYPE_CORE, BLACK_ZONE_ONLY],
  [TYPE_VORTEX, BLACK_ZONE_ONLY],
  [TYPE_DRAGON, BOTH_ZONES],
]);

export const getMapZoneForType = (type: string): Set<string> | undefined => TYPE_MAP_ZONE.get(type);

export const isValidTypeMapCombination = (type: string, map: string): boolean =>
  getMapZoneForType(type)?.has(map) ?? false;

// Sorted once at import: autocomplete runs on every keystroke under a 3s Discord budget.
export const MAPS_ALL_SORTED = [...MAPS].sort((a, b) => a.localeCompare(b));
