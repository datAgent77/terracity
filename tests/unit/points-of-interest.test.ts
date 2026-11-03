import { describe, expect, it } from 'vitest';
import { GRID_COLS, GRID_ROWS, StructureType as S } from '../../src/config/scenario';
import type { Placement } from '../../src/simulation/metrics';
import { ledger } from '../../src/simulation/causality';
import { canPlace } from '../../src/simulation/placement';
import { pointsOfInterest } from '../../src/world/points-of-interest';
import { rng } from '../../src/world/rand';
import { generateTerrain, tileAt } from '../../src/world/terrain-map';
const terrain = generateTerrain();
const p = (type: Placement['type'], col: number, row: number): Placement => ({ id: `${type}-${col}-${row}`, type, col, row, rotation: 0 });
const reference = () => [
  p(S.Road, 6, 3), p(S.Road, 7, 3),
  p(S.Residential, 6, 2), p(S.Residential, 6, 4), p(S.Residential, 2, 4), p(S.Residential, 8, 3),
  p(S.Wind, 10, 8), p(S.Wind, 11, 8), p(S.Wind, 12, 8),
  p(S.Park, 9, 3), p(S.Park, 1, 4), p(S.Solar, 9, 4),
];
const underHoused = () => [p(S.Road, 6, 3), p(S.Residential, 6, 4), p(S.Wind, 11, 8), p(S.Park, 9, 3)];
function randomPlan(seed: number): Placement[] {
  const r = rng(seed);
  const types = Object.values(S);
  const plan: Placement[] = [p(S.Residential, 6, 4)];
  for (let k = 0; k < 40 && plan.length < 12; k++) {
    const type = types[Math.floor(r() * types.length)];
    const col = Math.floor(r() * GRID_COLS);
    const row = Math.floor(r() * GRID_ROWS);
    if (!canPlace(type, tileAt(terrain, col, row), plan.some((q) => q.col === col && q.row === row)).ok) continue;
    plan.push({ id: `${type}-${k}`, type, col, row, rotation: 0 });
  }
  return plan;
}


const numbers = (s: string) => (s.match(/[+-]?\d[\d,]*(\.\d+)?/g) ?? []).map((n) => Number(n.replace(/,/g, '')));

describe('points of interest near Mira', () => {
  it('only features that exist in this plan, each number backed by a ledger entry of that plan', () => {
    const plans = [[], reference(), underHoused(), ...Array.from({ length: 30 }, (_, i) => randomPlan(900 + i))];
    for (const plan of plans) {
      for (const year of [2035, 2050] as const) {
        const l = ledger(terrain, plan, year);
        const pois = pointsOfInterest(terrain, plan, year, 6, 4);
        expect(pois.length).toBeLessThanOrEqual(2);
        expect(new Set(pois.map((q) => q.kind)).size).toBe(pois.length);
        for (const poi of pois) {
          expect(Math.abs(poi.tile.col - 6)).toBeLessThanOrEqual(2);
          expect(Math.abs(poi.tile.row - 4)).toBeLessThanOrEqual(2);
          expect(poi.support.length).toBeGreaterThan(0);
          for (const e of poi.support) expect(l.entries).toContainEqual(e); // real ledger entries
          if (poi.kind !== 'sprawl') expect(plan.some((q) => q.col === poi.tile.col && q.row === poi.tile.row)).toBe(true);
          else expect(l.projected.sprawlTiles.some((t) => t.col === poi.tile.col && t.row === poi.tile.row)).toBe(true);
          // Every signed amount shown is one of the supporting entries' amounts.
          const amounts = poi.support.map((e) => Math.round(e.amount));
          for (const line of poi.lines) {
            for (const n of (line.match(/[+-]\d[\d,]*/g) ?? []).map((x) => Number(x.replace(/,/g, '')))) expect(amounts).toContain(n);
          }
          expect(numbers(poi.lines.join(' ')).length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('the same place differs between futures: your plan shows its park, nobody planning shows sprawl', () => {
    // A park beside the homes at (6,4) and solar on the plain: both within view of her street.
    const plan = [...reference(), p(S.Park, 6, 5), p(S.Solar, 8, 4)];
    const mine = pointsOfInterest(terrain, plan, 2050, 6, 4);
    const none = pointsOfInterest(terrain, [], 2050, 6, 4);
    expect(mine.map((q) => q.kind)).toEqual(['park', 'energy']);
    expect(mine[0].lines[0]).toMatch(/^Next to \d+ neighbourhoods?: nature \+\d+\.$/);
    expect(mine[1].title).toBe('Solar farm');
    expect(none.map((q) => q.kind)).toEqual(['sprawl']);
    expect(none[0].lines[0]).toMatch(/newcomers without a planned home built/);
  });

  it('is deterministic', () => {
    const plan = randomPlan(77);
    expect(pointsOfInterest(terrain, plan, 2050, 6, 4)).toEqual(pointsOfInterest(terrain, plan, 2050, 6, 4));
  });
});
