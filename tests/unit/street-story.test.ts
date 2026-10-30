import { describe, expect, it } from 'vitest';
import { StructureType as S } from '../../src/config/scenario';
import type { Placement } from '../../src/simulation/metrics';
import { projectYear } from '../../src/simulation/projection';
import { futureVisualState } from '../../src/world/future-visual-state';
import { streetStory } from '../../src/world/street-story';
import { generateTerrain } from '../../src/world/terrain-map';

const terrain = generateTerrain();
let n = 0;
const p = (type: Placement['type'], col: number, row: number): Placement => ({ id: `${type}-${++n}`, type, col, row, rotation: 0 });
const story = (plan: Placement[], year: 2026 | 2035 | 2050, facts = { sprawlNearby: 0, beachesNearby: 0 }) => {
  const y = projectYear(terrain, plan, year);
  return streetStory(y, futureVisualState(terrain, plan, y), facts);
};
const reference = () => [
  p(S.Road, 6, 3), p(S.Road, 7, 3),
  p(S.Residential, 6, 2), p(S.Residential, 6, 4), p(S.Residential, 2, 4), p(S.Residential, 8, 3),
  p(S.Wind, 10, 8), p(S.Wind, 11, 8), p(S.Wind, 12, 8),
  p(S.Park, 9, 3), p(S.Park, 1, 4), p(S.Solar, 9, 4),
];
const underHoused = () => [p(S.Road, 6, 3), p(S.Residential, 6, 4)];

describe('street story', () => {
  it('words scale with the visible effect: a slight miss is not called smog', () => {
    const y = projectYear(terrain, underHoused(), 2050);
    const st = futureVisualState(terrain, underHoused(), y);
    const mild = streetStory({ ...y, environment: 59 }, { ...st, haze: 0.05, greening: 0 }, { sprawlNearby: 0, beachesNearby: 0 }).join(' ');
    expect(mild).toMatch(/first dry gardens/);
    expect(mild).not.toMatch(/smog/);
  });

  it('2026 describes today, with no consequences yet', () => {
    const s = story(underHoused(), 2026);
    expect(s[0]).toMatch(/today/);
    expect(s.join(' ')).not.toMatch(/smog|sprawl|woodland|sea/);
  });

  it('an under-housed plan shows its consequences in 2050', () => {
    const s = story(underHoused(), 2050, { sprawlNearby: 2, beachesNearby: 1 }).join(' ');
    expect(s).toMatch(/solar roofs/);
    expect(s).toMatch(/newcomers found no planned home: unplanned sprawl spreads nearby/);
    expect(s).toMatch(/sea has risen/);
  });

  it('decline and recovery sentences follow the environment target', () => {
    for (const plan of [underHoused(), reference()]) {
      const y = projectYear(terrain, plan, 2050);
      const s = story(plan, 2050).join(' ');
      if (y.environment >= 60) expect(s).toMatch(/young woodland/);
      else expect(s).toMatch(/smog|first dry gardens/);
    }
  });

  it('uses only ASCII (the UI font has no dashes or dots)', () => {
    for (const plan of [underHoused(), reference()]) {
      for (const year of [2026, 2035, 2050] as const) {
        expect(story(plan, year, { sprawlNearby: 1, beachesNearby: 1 }).join(' ')).toMatch(/^[\x20-\x7e]*$/);
      }
    }
  });
});
