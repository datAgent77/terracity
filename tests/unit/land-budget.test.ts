import { describe, expect, it } from 'vitest';
import { StructureType as S } from '../../src/config/scenario';
import { goalLandCheck, LAND, landBudget } from '../../src/simulation/land-budget';
import type { Placement } from '../../src/simulation/metrics';
import { projectYear } from '../../src/simulation/projection';
import { generateTerrain } from '../../src/world/terrain-map';

const terrain = generateTerrain();
let n = 0;
const p = (type: Placement['type'], col: number, row: number): Placement => ({ id: `${type}-${++n}`, type, col, row, rotation: 0 });
const lb = (plan: Placement[], year: 2026 | 2050 = 2050) => landBudget(terrain, plan, projectYear(terrain, plan, year));
const reference = () => [
  p(S.Road, 6, 3), p(S.Road, 7, 3),
  p(S.Residential, 6, 2), p(S.Residential, 6, 4), p(S.Residential, 2, 4), p(S.Residential, 8, 3),
  p(S.Wind, 10, 8), p(S.Wind, 11, 8), p(S.Wind, 12, 8),
  p(S.Park, 9, 3), p(S.Park, 1, 4), p(S.Solar, 9, 4),
];

describe('horizontal-urbanism land budget', () => {
  it('the 28,000 goal fits in garden districts on non-farmland, non-steep land', () => {
    const g = goalLandCheck(terrain);
    expect(g.districtsNeeded).toBe(4);
    expect(g.suitableTiles).toBe(25); // 19 plain + 6 gentle hills
    expect(g.feasible).toBe(true);
  });

  it('a district of 4,000 residents fits ~1,430 villas on 1,250 m² parcels in one tile', () => {
    const b = lb([p(S.Residential, 6, 4)], 2026);
    expect(b.villas).toBe(Math.round(4000 / LAND.personsPerHome));
    expect(b.villaLandNeededKm2).toBeLessThanOrEqual(LAND.tileKm2);
    expect(b.villaParcelsFit).toBe(true);
  });

  it('the reference plan keeps all farmland, is fully connected and served', () => {
    const b = lb(reference());
    expect(b.farmlandKeptPct).toBe(100);
    expect(b.roadAccessPct).toBe(100);
    expect(b.serviceCoveragePct).toBe(100);
    expect(b.landConsumedKm2).toBeCloseTo(12 * LAND.tileKm2);
  });

  it('building on farmland and leaving people to sprawl costs farmland and land', () => {
    const farm = lb([p(S.Residential, 3, 5), p(S.Residential, 4, 5)]);
    expect(farm.farmlandKeptPct).toBeLessThan(100);
    const none = lb([]);
    expect(none.landConsumedKm2).toBeGreaterThan(0); // unplanned sprawl uses land too
  });

  it('far, unconnected homes lower road access and service coverage', () => {
    const b = lb([p(S.Residential, 6, 4), p(S.Residential, 11, 3)]);
    expect(b.roadAccessPct).toBe(50);
  });
});
