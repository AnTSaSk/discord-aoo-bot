import { describe, it, expect, vi, beforeEach } from 'vitest';

import { resolveObjectiveIndex } from '@/utils/objectiveIndex.js';
import { getObjectiveModel, type Objective } from '@/models/objective.model.js';
import { getActiveObjectives } from '@/services/objective.service.js';

const objectiveModelStub = {
  findAll: vi.fn(),
};

vi.mock('@/models/objective.model.js', () => ({
  getObjectiveModel: () => objectiveModelStub,
}));

const buildObjective = (
  overrides: Partial<Pick<Objective, 'id' | 'type' | 'rarity' | 'map' | 'time'>>,
): Objective =>
  ({
    id: overrides.id ?? 1,
    type: overrides.type ?? 'Core',
    rarity: overrides.rarity ?? 'Purple',
    map: overrides.map ?? 'Thetford',
    time: overrides.time ?? new Date('2099-01-01T00:00:00Z'),
  }) as Objective;

describe('resolveObjectiveIndex', () => {
  it('resolves position N in the displayed list to the objective at #N (1-based, AC-2)', () => {
    const first = buildObjective({ id: 10 });
    const second = buildObjective({ id: 20 });
    const third = buildObjective({ id: 30 });

    const result = resolveObjectiveIndex([first, second, third], '3');

    expect(result?.id).toBe(third.id);
  });

  it('resolves "#3" the same way as "3" (non-numeric characters stripped, AC-4)', () => {
    const objectives = [
      buildObjective({ id: 10 }),
      buildObjective({ id: 20 }),
      buildObjective({ id: 30 }),
    ];

    const withHash = resolveObjectiveIndex(objectives, '#3');
    const withoutHash = resolveObjectiveIndex(objectives, '3');

    expect(withHash?.id).toBe(withoutHash?.id);
  });

  it('resolves an index above the list length to nothing, without crashing (AC-3)', () => {
    const objectives = [buildObjective({ id: 10 })];

    const result = resolveObjectiveIndex(objectives, '5');

    expect(result).toBeUndefined();
  });

  it('resolves index 0 to nothing (AC-2)', () => {
    const objectives = [buildObjective({ id: 10 })];

    const result = resolveObjectiveIndex(objectives, '0');

    expect(result).toBeUndefined();
  });

  it('resolves a negative index to nothing (AC-2)', () => {
    const objectives = [buildObjective({ id: 10 })];

    const result = resolveObjectiveIndex(objectives, '-1');

    expect(result).toBeUndefined();
  });

  it('resolves nothing against an empty active list (AC-3)', () => {
    const result = resolveObjectiveIndex([], '1');

    expect(result).toBeUndefined();
  });

  describe('coupling with the displayed active list (objective-selection AC-1, AC-2, AC-3)', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('resolves the index to the very objective shown at that position, even when an expired objective precedes the active ones in the guild\'s raw data', async () => {
      const expired = buildObjective({ id: 1, time: new Date('2020-01-01T00:00:00Z') });
      const shownFirst = buildObjective({ id: 2, time: new Date('2099-01-01T00:00:00Z') });
      const shownSecond = buildObjective({ id: 3, time: new Date('2099-06-01T00:00:00Z') });

      vi.mocked(getObjectiveModel().findAll).mockResolvedValue([expired, shownFirst, shownSecond]);

      const activeObjectives = await getActiveObjectives('guild-1');

      const displayedIndex = activeObjectives.findIndex((o) => o.id === shownSecond.id) + 1;
      const resolved = resolveObjectiveIndex(activeObjectives, String(displayedIndex));

      expect(resolved?.id).toBe(shownSecond.id);
    });
  });
});
