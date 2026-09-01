import type { Objective } from '@/models/objective.model.js';

const SEPARATOR = '|';
const COMPOSED_SEPARATOR = ':';

export const computeFingerprint = (
  objective: Pick<Objective, 'type' | 'rarity' | 'map' | 'time'>,
): string =>
  [objective.type, objective.rarity, objective.map, String(objective.time.getTime())].join(
    SEPARATOR,
  );

export const composeAutocompleteValue = (index: number, fingerprint: string): string =>
  `${String(index)}${COMPOSED_SEPARATOR}${fingerprint}`;

export type DecomposedAutocompleteValue =
  { ok: true; index: number; fingerprint: string } | { ok: false };

export const decomposeAutocompleteValue = (value: string): DecomposedAutocompleteValue => {
  const separatorIndex = value.indexOf(COMPOSED_SEPARATOR);

  if (separatorIndex === -1) {
    return { ok: false };
  }

  const rawIndex = value.slice(0, separatorIndex);
  const fingerprint = value.slice(separatorIndex + 1);

  if (!(/^\d+$/).test(rawIndex) || fingerprint.split(SEPARATOR).length !== 4) {
    return { ok: false };
  }

  return { ok: true, index: Number(rawIndex), fingerprint };
};
