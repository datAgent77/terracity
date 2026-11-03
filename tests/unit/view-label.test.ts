import { describe, expect, it } from 'vitest';
import { futurePair } from '../../src/world/futures';
import { scenarioName, viewLabel } from '../../src/ui/view-label';

describe('the UI always says which scenario, which year, editable or projection', () => {
  it('tabletop 2026 is your plan, editable; 2035 / 2050 are read-only projections', () => {
    expect(viewLabel({ phase: 'building', year: 2026, futuresOpen: false, hasSaved: false, street: null })).toMatchObject({ scenario: 'Your plan', editable: true, projection: false, text: 'Your plan - 2026 today - editing' });
    expect(viewLabel({ phase: 'building', year: 2050, futuresOpen: false, hasSaved: true, street: null })).toMatchObject({ scenario: 'Your plan', editable: false, projection: true, text: 'Your plan - 2050 projection - read only' });
  });

  it('two futures: A is always your plan; B is the saved plan or the baseline; shown as a projection', () => {
    expect(viewLabel({ phase: 'building', year: 2026, futuresOpen: true, hasSaved: false, street: null }).text).toBe('A Your plan vs B If nobody plans - 2050 projection');
    expect(viewLabel({ phase: 'building', year: 2035, futuresOpen: true, hasSaved: true, street: null }).text).toBe('A Your plan vs B Saved plan - 2035 projection');
    const pair = futurePair([], [{ id: 'x', type: 'residential' as never, col: 6, row: 4, rotation: 0 }], 2026);
    expect(pair.A.title).toBe('Your plan');
    expect(futurePair([], [], 2026).B.title).toBe('Saved plan');
    expect(futurePair(null, [], 2026).B.title).toBe('If nobody plans');
  });

  it('streets name their scenario; the editable plan is never called Plan B', () => {
    expect(scenarioName('B')).toBe('Your plan');
    expect(scenarioName('A')).toBe('Saved plan');
    expect(scenarioName('none')).toBe('If nobody plans');
    expect(viewLabel({ phase: 'building', year: 2050, futuresOpen: true, hasSaved: true, street: 'A' })).toMatchObject({ scenario: 'Saved plan', editable: false, projection: true });
    for (const year of [2026, 2035, 2050] as const) {
      for (const hasSaved of [false, true]) {
        for (const futuresOpen of [false, true]) {
          for (const street of [null, 'A', 'B', 'none'] as const) {
            expect(viewLabel({ phase: 'building', year, futuresOpen, hasSaved, street }).text).not.toMatch(/Plan B|\(now\)/);
          }
        }
      }
    }
  });
});
