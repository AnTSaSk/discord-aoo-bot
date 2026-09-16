import {
  MAX_TOTAL_MINUTES,
  MAX_PORTAL_SMALL_MINUTES,
  MAX_PORTAL_MEDIUM_MINUTES,
  MAX_PORTAL_LARGE_MINUTES,
} from '@/constants/config.js';
import { TYPE_ANCIENT_LANDS_PORTAL } from '@/constants/type.js';
import { RARITY_SMALL, RARITY_MEDIUM, RARITY_LARGE } from '@/constants/rarity.js';

// Portal size -> its stricter cap (ADR-0005). Every other type/rarity falls back to the default.
const PORTAL_SIZE_CAP = new Map<string, number>([
  [RARITY_SMALL, MAX_PORTAL_SMALL_MINUTES],
  [RARITY_MEDIUM, MAX_PORTAL_MEDIUM_MINUTES],
  [RARITY_LARGE, MAX_PORTAL_LARGE_MINUTES],
]);

// Total function: every (type, rarity) pair resolves to a cap, no failure branch.
// Lives outside date.ts so AC-20 can apply it to an already-stored objective, no parsing involved.
export const resolveTimeBoundMinutes = (type: string, rarity: string): number => {
  if (type === TYPE_ANCIENT_LANDS_PORTAL) {
    return PORTAL_SIZE_CAP.get(rarity) ?? MAX_TOTAL_MINUTES;
  }

  return MAX_TOTAL_MINUTES;
};
