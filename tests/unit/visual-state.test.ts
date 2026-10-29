import { describe, expect, it } from 'vitest';
import { TARGETS } from '../../src/config/balance';
import { PROJECTION } from '../../src/config/projection';
import { StructureType as S, TerrainType } from '../../src/config/scenario';
import type { Placement } from '../../src/simulation/metrics';
import { projectYear } from '../../src/simulation/projection';
import {
  futureVisualState,
  MAX_DRYNESS,
  VIGOR_AT_TARGET,
  vigorFor,
} from '../../src/world/future-visual-state';
import { tileAt, generateTerrain } from '../../src/world/terrain-map';

const terrain = generateTerrain();
let n = 0;
const p = (type: Placement['type'], col: number, row: number): Placement => ({ id: `${type}-${++n}`, type, col, row, rotation: 0 });
const vs = (plan: Placement[], year: 2026 | 2035 | 2050) => futureVisualState(terrain, plan, projectYear(terrain, plan, year));

const reference = () => [
  p(S.Road, 6, 3), p(S.Road, 7, 3),
  p(S.Residential, 6, 2), p(S.Residential, 6, 4), p(S.Residential, 2, 4), p(S.Residential, 8, 3),
  p(S.Wind, 10, 8), p(S.Wind, 11, 8), p(S.Wind, 12, 8),
  p(S.Park, 9, 3), p(S.Park, 1, 4), p(S.Solar, 9, 4),
];
const planA = () => reference().filter((x) => x.type !== S.Park && x.type !== S.Solar);

describe('2026 is the present', () => {
  it('no sprawl, no sea rise, no flood warnings, parks at planted size', () => {
    for (const plan of [[], planA(), reference()]) {
      const s = vs(plan, 2026);
      expect(s.sprawl).toEqual([]);
      expect(s.seaRise).toBe(0);
      expect(s.floodRisk).toEqual([]);
      expect(s.parkGrowth).toBe(1);
    }
  });
});

describe('unplanned growth follows the projection exactly', () => {
  it('sprawl tiles and density match projected sprawl residents', () => {
    for (const year of [2035, 2050] as const) {
      const y = projectYear(terrain, [], year);
      const s = futureVisualState(terrain, [], y);
      expect(s.sprawl.map(({ col, row }) => ({ col, row }))).toEqual(y.sprawlTiles);
      const housed = s.sprawl.reduce((sum, t) => sum + t.fill, 0) * PROJECTION.sprawlResidentsPerTile;
      expect(housed).toBeCloseTo(y.sprawlResidents);
      for (const t of s.sprawl) expect(t.buildings).toBeGreaterThanOrEqual(2);
    }
  });

  it('more unplanned residents -> more sprawl drawn (2035 < 2050)', () => {
    const b = (st: ReturnType<typeof vs>) => st.sprawl.reduce((sum, t) => sum + t.buildings, 0);
    expect(b(vs([], 2035))).toBeLessThan(b(vs([], 2050)));
  });

  it('a fully housed plan shows no sprawl in any year', () => {
    expect(vs(reference(), 2050).sprawl).toEqual([]);
  });
});

describe('environment -> vegetation', () => {
  it('vigour is monotonic in environment and dryness is restrained', () => {
    let last = -1;
    for (let env = 0; env <= 100; env += 5) {
      const v = vigorFor(env);
      expect(v).toBeGreaterThanOrEqual(last);
      last = v;
    }
    for (const plan of [[], planA(), reference()]) {
      for (const year of [2026, 2035, 2050] as const) {
        const s = vs(plan, year);
        expect(s.dryness).toBeGreaterThanOrEqual(0);
        expect(s.dryness).toBeLessThanOrEqual(MAX_DRYNESS);
      }
    }
  });

  it('never looks healthy when the environment target is missed', () => {
    for (const plan of [[], planA(), reference()]) {
      for (const year of [2026, 2035, 2050] as const) {
        const y = projectYear(terrain, plan, year);
        const s = futureVisualState(terrain, plan, y);
        if (y.environment < TARGETS.environment) expect(s.vigor).toBeLessThan(VIGOR_AT_TARGET);
        else expect(s.vigor).toBeGreaterThanOrEqual(VIGOR_AT_TARGET);
      }
    }
  });

  it('a do-nothing 2050 looks drier than its 2026', () => {
    expect(vs([], 2050).dryness).toBeGreaterThan(vs([], 2026).dryness);
  });
});

describe('coastal risk', () => {
  it('flags exactly the projected at-risk sites, with walls facing beach or sea', () => {
    const plan = planA();
    const y = projectYear(terrain, plan, 2050);
    const s = futureVisualState(terrain, plan, y);
    expect(s.floodRisk.map((f) => f.id).sort()).toEqual([...y.floodRiskIds].sort());
    for (const f of s.floodRisk) {
      expect(f.seaward.length).toBeGreaterThan(0);
      for (const [dc, dr] of f.seaward) {
        const t = tileAt(terrain, f.col + dc, f.row + dr)!.type;
        expect([TerrainType.Beach, TerrainType.Sea]).toContain(t);
      }
    }
    expect(vs(plan, 2035).seaRise).toBe(0.5);
    expect(s.seaRise).toBe(1);
  });
});

describe('balanced look only when every target is met', () => {
  it('reference plan is balanced in 2050; plan A (no solar, no parks) is not', () => {
    expect(vs(reference(), 2050).balanced).toBe(true);
    expect(vs(reference(), 2050).missed).toEqual([]);
    const a = vs(planA(), 2050);
    expect(a.balanced).toBe(false);
    expect(a.missed).toContain('renewableCoverage');
  });

  it('a do-nothing plan is never balanced', () => {
    for (const year of [2026, 2035, 2050] as const) expect(vs([], year).balanced).toBe(false);
  });

  it('renewable activity tracks coverage', () => {
    expect(vs(reference(), 2050).renewableActivity).toBeGreaterThan(vs([], 2050).renewableActivity);
    expect(vs(planA(), 2026).renewableActivity).toBeGreaterThan(vs(planA(), 2050).renewableActivity);
  });
});

describe('garden-district architecture by year', () => {
  it('2026 traditional, 2035 eco-villas, 2050 solar-roofed homes', () => {
    expect(vs(reference(), 2026).homeEra).toBe(0);
    expect(vs(reference(), 2035).homeEra).toBe(1);
    expect(vs(reference(), 2050).homeEra).toBe(2);
  });
  it('switches at the middle of each transition', async () => {
    const { eraForProgress } = await import('../../src/world/future-visual-state');
    expect([0, 0.24, 0.26, 0.5, 0.74, 0.76, 1].map(eraForProgress)).toEqual([0, 0, 1, 1, 1, 2, 2]);
  });
});
