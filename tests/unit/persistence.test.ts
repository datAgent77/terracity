import { describe, expect, it } from 'vitest';
import { StructureType as S } from '../../src/config/scenario';
import { parseSaved, serialize, validPlan } from '../../src/core/persistence';
import type { Placement } from '../../src/simulation/metrics';
import { projectYear } from '../../src/simulation/projection';
import { generateTerrain } from '../../src/world/terrain-map';

const terrain = generateTerrain();
const p = (type: Placement['type'], col: number, row: number, id = `${type}-${col}-${row}`): Placement => ({ id, type, col, row, rotation: 0 });
const a = [p(S.Road, 6, 3), p(S.Residential, 6, 4)];
const b = [...a, p(S.Residential, 8, 3), p(S.Wind, 12, 8)];

describe('save / reload', () => {
  it('round-trips Plan A and the current map, and the futures are identical after reload', () => {
    const back = parseSaved(terrain, serialize(a, b))!;
    expect(back.planA).toEqual(a);
    expect(back.current).toEqual(b);
    expect(projectYear(terrain, back.current, 2050)).toEqual(projectYear(terrain, b, 2050));
    expect(projectYear(terrain, back.planA!, 2050)).toEqual(projectYear(terrain, a, 2050));
  });

  it('keeps Plan A and Plan B isolated (editing one copy never changes the other)', () => {
    const back = parseSaved(terrain, serialize(a, b))!;
    back.current.push(p(S.Park, 9, 3));
    expect(back.planA).toHaveLength(2);
  });

  it('rejects corrupt saves as a whole', () => {
    expect(parseSaved(terrain, '{nope')).toBeNull();
    expect(parseSaved(terrain, JSON.stringify({ version: 1, planA: null, current: [] }))).toBeNull();
    const bad = [
      [p(S.Residential, 0, 0)], // sea
      [p(S.Residential, 6, 4), p(S.Residential, 6, 4, 'x')], // same tile twice
      [p(S.Residential, 6, 4, 'dup'), p(S.Road, 6, 3, 'dup')], // duplicate id
      [{ ...p(S.Residential, 6, 4), col: 99 }],
      [{ ...p(S.Residential, 6, 4), type: 'castle' }],
      [{ ...p(S.Residential, 6, 4), rotation: 7 }],
    ];
    for (const plan of bad) {
      expect(validPlan(terrain, plan)).toBe(false);
      expect(parseSaved(terrain, JSON.stringify({ version: 2, planA: null, current: plan }))).toBeNull();
      expect(parseSaved(terrain, JSON.stringify({ version: 2, planA: plan, current: [] }))).toBeNull();
    }
  });

  it('migrates a legacy v1 Plan A', () => {
    const back = parseSaved(terrain, null, JSON.stringify(a))!;
    expect(back.planA).toEqual(a);
    expect(back.current).toEqual([]);
  });
});
