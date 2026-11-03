import { describe, expect, it } from 'vitest';
import { StructureType as S } from '../../src/config/scenario';
import type { Placement } from '../../src/simulation/metrics';
import { projectYear } from '../../src/simulation/projection';
import { futurePair } from '../../src/world/futures';
import { generateTerrain } from '../../src/world/terrain-map';

const terrain = generateTerrain();
const p = (type: Placement['type'], col: number, row: number): Placement => ({ id: `${type}-${col}-${row}`, type, col, row, rotation: 0 });
const plan = [p(S.Road, 6, 3), p(S.Residential, 6, 4), p(S.Wind, 12, 8)];

describe('futures to split', () => {
  it('with a saved plan: your (current) plan on the left (A), the saved plan on the right (B)', () => {
    const a = [p(S.Residential, 6, 4)];
    const f = futurePair(a, plan, 2026);
    expect(f.A).toEqual({ title: 'Your plan', plan });
    expect(f.B).toEqual({ title: 'Saved plan', plan: a });
    expect(f.year).toBe(2050);
  });

  it('without Plan A: your plan vs nobody planning', () => {
    const f = futurePair(null, plan, 2035);
    expect(f.A.title).toBe('Your plan');
    expect(f.B.plan).toEqual([]);
    expect(f.year).toBe(2035);
  });

  it('the two futures differ and are deterministic', () => {
    const f = futurePair(null, plan, 2026);
    const a1 = projectYear(terrain, f.A.plan, f.year);
    const b1 = projectYear(terrain, f.B.plan, f.year);
    expect(a1.sprawlResidents).toBeLessThan(b1.sprawlResidents);
    expect(projectYear(terrain, f.A.plan, f.year)).toEqual(a1);
  });
});
