import { describe, expect, it } from 'vitest';
import { GRID_COLS, StructureType as S } from '../../src/config/scenario';
import { clampSeam, localXFromSeam, SEAM_MAX, SEAM_MIN, seamColumn, seamFromLocalX, seamReport, stepSeam } from '../../src/interactions/reality-seam';
import type { Placement } from '../../src/simulation/metrics';
import { projectYear } from '../../src/simulation/projection';
import { generateTerrain } from '../../src/world/terrain-map';

const terrain = generateTerrain();
const p = (type: Placement['type'], col: number, row: number): Placement => ({ id: `${type}-${col}-${row}`, type, col, row, rotation: 0 });
const names = { A: 'Your plan', B: 'If nobody plans' };

describe('Reality Seam', () => {
  it('maps board x <-> seam position both ways, clamped inside the board', () => {
    for (const u of [0.1, 0.25, 0.5, 0.77, 0.9]) expect(seamFromLocalX(localXFromSeam(u))).toBeCloseTo(u, 10);
    expect(clampSeam(-3)).toBe(SEAM_MIN);
    expect(clampSeam(9)).toBe(SEAM_MAX);
    expect(clampSeam(Number.NaN)).toBe(0.5);
    expect(seamColumn(0)).toBe(0);
    expect(seamColumn(1)).toBe(GRID_COLS - 1);
  });

  it('a key / button step moves exactly one column and stops at the edges', () => {
    let u = 0.5;
    const c = seamColumn(u);
    u = stepSeam(u, 1);
    expect(seamColumn(u)).toBe(c + 1);
    u = stepSeam(stepSeam(u, -1), -1);
    expect(seamColumn(u)).toBe(c - 1);
    let e = 0.5;
    for (let i = 0; i < 40; i++) e = stepSeam(e, 1);
    expect(seamColumn(e)).toBe(GRID_COLS - 1);
  });

  it('reports only what differs in the column under the seam, from the two projections', () => {
    const mine = [p(S.Road, 6, 3), p(S.Residential, 6, 4), p(S.Residential, 6, 2)];
    const u = (6 + 0.5) / GRID_COLS;
    const r = seamReport(terrain, mine, [], 2050, u, names);
    expect(r.column).toBe(6);
    const sprawl = new Set(projectYear(terrain, [], 2050).sprawlTiles.filter((t) => t.col === 6).map((t) => t.row));
    for (const d of r.differences) {
      const placed = mine.find((q) => q.row === d.row);
      expect(d.a).toBe(placed ? (placed.type === S.Road ? 'road' : 'homes') : 'open land');
      expect(d.b).toBe(sprawl.has(d.row) ? 'unplanned houses' : 'open land');
      expect(d.a).not.toBe(d.b);
    }
    expect(r.differences.map((d) => d.row)).toEqual(expect.arrayContaining([2, 3, 4]));
    expect(r.lines[0]).toMatch(/^A Your plan: /);
    expect(r.lines[1]).toMatch(/^B If nobody plans: /);
  });

  it('the same plan on both sides: nothing differs, anywhere', () => {
    const plan = [p(S.Road, 6, 3), p(S.Residential, 6, 4)];
    for (let c = 0; c < GRID_COLS; c++) {
      const r = seamReport(terrain, plan, plan, 2035, (c + 0.5) / GRID_COLS, names);
      expect(r.differences).toEqual([]);
      expect(r.lines).toEqual(['Under the seam: the same in both futures']);
    }
  });
});
