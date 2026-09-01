import type { Objective } from '@/models/objective.model.js';

export const resolveObjectiveIndex = (
  activeObjectives: Objective[],
  rawIndex: string,
): Objective | undefined => {
  if (rawIndex.trim().startsWith('-')) {
    return undefined;
  }

  const normalizedIndex = parseInt(rawIndex.replace(/\D/g, ''), 10);

  if (!Number.isInteger(normalizedIndex) || normalizedIndex < 1) {
    return undefined;
  }

  return activeObjectives[normalizedIndex - 1];
};
