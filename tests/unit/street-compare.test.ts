import { describe, expect, it } from 'vitest';
import { StructureType as S } from '../../src/config/scenario';
import type { Placement } from '../../src/simulation/metrics';
import { landBudget } from '../../src/simulation/land-budget';
import { projectYear } from '../../src/simulation/projection';
import { compareRows } from '../../src/world/street-compare';
import { generateTerrain } from '../../src/world/terrain-map';

const terrain = generateTerrain();
let n = 0;
const p = (type: Placement['type'], col: number, row: number): Placement => ({ id: `${type}-${++n}`, type, col, row, rotation: 0 });
const reference = () => [
  p(S.Road, 6, 3), p(S.Road, 7, 3),
  p(S.Residential, 6, 2), p(S.Residential, 6, 4), p(S.Residential, 2, 4), p(S.Residential, 8, 3),
  p(S.Wind, 10, 8), p(S.Wind, 11, 8), p(S.Wind, 12, 8),
  p(S.Park, 9, 3), p(S.Park, 1, 4), p(S.Solar, 9, 4),
];
const underHoused = () => [p(S.Road, 6, 3), p(S.Residential, 6, 4)];

describe('street compare rows', () => {
  it('shows exactly housing, nature, renewable and land, with the projection values', () => {
    const rows = compareRows(terrain, underHoused(), reference(), 2050);
    expect(rows.map((r) => r.label.split(' ')[0])).toEqual(['Housed', 'Nature', 'Renewable', 'Land']);
    const b = projectYear(terrain, reference(), 2050);
    expect(rows[0].b).toBe(Math.round(b.population).toLocaleString('en-US'));
    expect(rows[3].b).toBe(`${Math.round(landBudget(terrain, reference(), b).landConsumedKm2)} sq km`);
  });

  it('the balanced plan houses more people; higher is better except land', () => {
    const rows = compareRows(terrain, underHoused(), reference(), 2050);
    expect(rows[0].better).toBe('B');
    const a = projectYear(terrain, underHoused(), 2050);
    const b = projectYear(terrain, reference(), 2050);
    const la = Math.round(landBudget(terrain, underHoused(), a).landConsumedKm2);
    const lb = Math.round(landBudget(terrain, reference(), b).landConsumedKm2);
    expect(rows[3].better).toBe(la === lb ? 'tie' : la < lb ? 'A' : 'B');
  });

  it('identical plans tie everywhere', () => {
    const plan = reference();
    expect(compareRows(terrain, plan, plan, 2035).every((r) => r.better === 'tie')).toBe(true);
  });

  it('uses only ASCII', () => {
    for (const r of compareRows(terrain, underHoused(), reference(), 2050)) expect(`${r.label}${r.a}${r.b}`).toMatch(/^[\x20-\x7e]*$/);
  });
});
