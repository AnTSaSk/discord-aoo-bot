import type { Objective } from '@/models/objective.model.js';
import { DUPLICATE_TIME_WINDOW_MINUTES } from '@/constants/config.js';

const WINDOW_MS = DUPLICATE_TIME_WINDOW_MINUTES * 60_000;

export interface DuplicateCandidate {
  guildId: string;
  type: string;
  rarity: string;
  map: string;
  time: Date;
}

export interface DuplicateCheckOptions {
  excludeId?: number;
}

export const isDuplicateObjective = (
  candidate: DuplicateCandidate,
  existing: Objective[],
  options?: DuplicateCheckOptions,
): boolean =>
  existing.some((objective) => {
    if (options?.excludeId !== undefined && objective.id === options.excludeId) {
      return false;
    }

    if (
      objective.guildId !== candidate.guildId ||
      objective.type !== candidate.type ||
      objective.rarity !== candidate.rarity ||
      objective.map !== candidate.map
    ) {
      return false;
    }

    const delta = Math.abs(objective.time.getTime() - candidate.time.getTime());

    return delta <= WINDOW_MS;
  });
