import { describe, it, expect } from 'vitest';

import type { Objective } from '@/models/objective.model.js';
import {
  computeFingerprint,
  composeAutocompleteValue,
  decomposeAutocompleteValue,
} from '@/utils/objectiveFingerprint.js';

const buildObjective = (overrides: Partial<Objective> = {}): Objective =>
  ({
    id: overrides.id ?? 1,
    guildId: overrides.guildId ?? 'guild-1',
    type: overrides.type ?? 'Core',
    rarity: overrides.rarity ?? 'Green',
    map: overrides.map ?? 'Thetford',
    time: overrides.time ?? new Date('2026-09-01T14:20:00Z'),
  }) as Objective;

describe('computeFingerprint', () => {
  it('produces a different fingerprint when type differs, holding rarity/map/time equal (AC-8b)', () => {
    const a = buildObjective({ type: 'Core' });
    const b = buildObjective({ type: 'Vortex' });

    expect(computeFingerprint(a)).not.toBe(computeFingerprint(b));
  });

  it('produces a different fingerprint when rarity differs, holding type/map/time equal (AC-8b)', () => {
    const a = buildObjective({ rarity: 'Green' });
    const b = buildObjective({ rarity: 'Purple' });

    expect(computeFingerprint(a)).not.toBe(computeFingerprint(b));
  });

  it('produces a different fingerprint when map differs, holding type/rarity/time equal (AC-8b)', () => {
    const a = buildObjective({ map: 'Thetford' });
    const b = buildObjective({ map: 'Lymhurst' });

    expect(computeFingerprint(a)).not.toBe(computeFingerprint(b));
  });

  it('produces a different fingerprint when the time timestamp differs, holding type/rarity/map equal (AC-8b)', () => {
    const a = buildObjective({ time: new Date('2026-09-01T14:20:00Z') });
    const b = buildObjective({ time: new Date('2026-09-01T14:21:00Z') });

    expect(computeFingerprint(a)).not.toBe(computeFingerprint(b));
  });

  it('produces the same fingerprint twice for the same objective (stability)', () => {
    const objective = buildObjective();

    expect(computeFingerprint(objective)).toBe(computeFingerprint(objective));
  });

  it('produces the same fingerprint for two objectives with different ids but identical type/rarity/map/time (AC-8d)', () => {
    const a = buildObjective({ id: 1 });
    const b = buildObjective({ id: 2 });

    expect(computeFingerprint(a)).toBe(computeFingerprint(b));
  });

  it('does not embed the primary key value inside the fingerprint (AC-8d)', () => {
    const objective = buildObjective({ id: 42 });

    expect(computeFingerprint(objective)).not.toContain('42');
  });
});

describe('composeAutocompleteValue / decomposeAutocompleteValue', () => {
  it('decomposes a composed value back into the same index and fingerprint that were composed', () => {
    const objective = buildObjective();
    const fingerprint = computeFingerprint(objective);

    const composed = composeAutocompleteValue(3, fingerprint);
    const decomposed = decomposeAutocompleteValue(composed);

    expect(decomposed).toEqual({ ok: true, index: 3, fingerprint });
  });

  it('keeps the composed value within Discord\'s 100-character option-value limit', () => {
    const objective = buildObjective();
    const fingerprint = computeFingerprint(objective);

    const composed = composeAutocompleteValue(25, fingerprint);

    expect(composed.length).toBeLessThanOrEqual(100);
  });

  it('rejects a malformed composed value instead of silently returning a partial result', () => {
    const decomposed = decomposeAutocompleteValue('not-a-valid-composed-value');

    expect(decomposed).toEqual({ ok: false });
  });

  it('rejects a truncated composed value instead of silently returning a partial result', () => {
    const objective = buildObjective();
    const fingerprint = computeFingerprint(objective);
    const composed = composeAutocompleteValue(3, fingerprint);
    const truncated = composed.slice(0, Math.floor(composed.length / 2));

    const decomposed = decomposeAutocompleteValue(truncated);

    expect(decomposed).toEqual({ ok: false });
  });
});
