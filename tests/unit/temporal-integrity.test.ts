/**
 * Temporal integrity (COMPETITION milestone A): projections are a pure,
 * deterministic function of (terrain, plan, year); viewing never mutates the
 * plan; what exists in an earlier year stays in place later; values stay in
 * range; and the "observed" 2026 / 2035 / 2050 pattern is explained by
 * explicit rules (docs/TEMPORAL_SIMULATION_SPEC.md).
 */
import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/config/balance';
import { PROJECTION, YEARS } from '../../src/config/projection';
import { GRID_COLS, GRID_ROWS, StructureType as S } from '../../src/config/scenario';
import { ledger, ledgerTotal } from '../../src/simulation/causality';
import { landBudget } from '../../src/simulation/land-budget';
import { computeMetrics, type Placement } from '../../src/simulation/metrics';
import { canPlace } from '../../src/simulation/placement';
import { explainYear, projectYear } from '../../src/simulation/projection';
import { futureVisualState } from '../../src/world/future-visual-state';
import { rng } from '../../src/world/rand';
import { generateTerrain, tileAt } from '../../src/world/terrain-map';

const terrain = generateTerrain();
function randomPlan(seed: number): Placement[] {
  const r = rng(seed);
  const types = Object.values(S);
  const plan: Placement[] = [];
  for (let k = 0; k < 80 && plan.length < 16; k++) {
    const type = types[Math.floor(r() * types.length)];
    const col = Math.floor(r() * GRID_COLS);
    const row = Math.floor(r() * GRID_ROWS);
    if (!canPlace(type, tileAt(terrain, col, row), plan.some((q) => q.col === col && q.row === row)).ok) continue;
    const next = [...plan, { id: `${type}-${k}`, type, col, row, rotation: 0 }];
    if (computeMetrics(terrain, next).budgetLeft < 0) continue;
    plan.push(next[next.length - 1]);
  }
  return plan;
}
const PLANS = [[], ...Array.from({ length: 40 }, (_, i) => randomPlan(7000 + i))];
const snapshot = (plan: readonly Placement[], year: (typeof YEARS)[number]) => {
  const y = projectYear(terrain, plan, year);
  return { y, land: landBudget(terrain, plan, y), look: futureVisualState(terrain, plan, y) };
};

describe('temporal integrity', () => {
  it('is deterministic and idempotent: 2026 -> 2035 -> 2050 -> 2026 -> 2050 gives the same 2050 as going there directly', () => {
    for (const plan of PLANS) {
      const direct = JSON.stringify(snapshot(plan, 2050));
      for (const year of [2026, 2035, 2050, 2026] as const) snapshot(plan, year);
      expect(JSON.stringify(snapshot(plan, 2050))).toBe(direct);
    }
  });

  it('viewing any year never mutates the plan', () => {
    for (const plan of PLANS) {
      const frozen = JSON.stringify(plan);
      for (const year of YEARS) snapshot(plan, year);
      expect(JSON.stringify(plan)).toBe(frozen);
    }
  });

  it('2026 is the present: the projection of 2026 equals the plan metrics', () => {
    for (const plan of PLANS) {
      const m = computeMetrics(terrain, plan);
      const y = projectYear(terrain, plan, 2026);
      expect(y.population).toBe(m.population);
      expect(y.environment).toBe(m.environment);
      expect(y.budgetLeft).toBe(m.budgetLeft);
      expect(y.renewableCoverage).toBe(m.renewableCoverage);
      expect(y.sprawlResidents).toBe(0);
    }
  });

  it('spatial continuity: unplanned sprawl that exists in 2035 is still there, in the same place, in 2050', () => {
    for (const plan of PLANS) {
      const a = projectYear(terrain, plan, 2035).sprawlTiles.map((t) => `${t.col},${t.row}`);
      const b = projectYear(terrain, plan, 2050).sprawlTiles.map((t) => `${t.col},${t.row}`);
      expect(b.slice(0, a.length)).toEqual(a);
      // Sprawl never lands on a planned structure.
      for (const t of b) expect(plan.some((p) => p.col === Number(t.split(',')[0]) && p.row === Number(t.split(',')[1]))).toBe(false);
    }
  });

  it('monotone where the rules say so: sprawl, land used and tree loss never shrink over time; parks only add', () => {
    for (const plan of PLANS) {
      const s = YEARS.map((year) => snapshot(plan, year));
      for (let i = 1; i < s.length; i++) {
        expect(s[i].y.sprawlResidents).toBeGreaterThanOrEqual(s[i - 1].y.sprawlResidents);
        expect(s[i].land.landConsumedKm2).toBeGreaterThanOrEqual(s[i - 1].land.landConsumedKm2);
        expect(s[i].land.farmlandKeptPct).toBeLessThanOrEqual(s[i - 1].land.farmlandKeptPct);
        expect(s[i].look.treeLoss).toBeGreaterThanOrEqual(s[i - 1].look.treeLoss);
        expect(s[i].y.population).toBe(s[0].y.population); // the plan is fixed: housing capacity does not change
      }
    }
  });

  it('every metric stays in its valid range', () => {
    for (const plan of PLANS) {
      for (const year of YEARS) {
        const { y, land } = snapshot(plan, year);
        expect(y.environment).toBeGreaterThanOrEqual(0);
        expect(y.environment).toBeLessThanOrEqual(100);
        expect(y.renewableCoverage).toBeGreaterThanOrEqual(0);
        expect(y.renewableCoverage).toBeLessThanOrEqual(100);
        expect(y.population).toBeGreaterThanOrEqual(BALANCE.basePopulation);
        expect(y.sprawlResidents % 100).toBe(0);
        expect(land.farmlandKeptPct).toBeGreaterThanOrEqual(0);
        expect(land.farmlandKeptPct).toBeLessThanOrEqual(100);
        for (const v of Object.values(y)) if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it('causal attribution sums to the shown metrics in every year (no unexplained change)', () => {
    for (const plan of PLANS.slice(0, 15)) {
      for (const year of YEARS) {
        const l = ledger(terrain, plan, year);
        expect(ledgerTotal(l, 'housed')).toBe(l.projected.population);
        expect(ledgerTotal(l, 'environment')).toBe(l.projected.environment);
        expect(ledgerTotal(l, 'budgetLeft')).toBe(l.projected.budgetLeft);
      }
    }
  });
});

describe('the observed pattern (16,000 / 36 -> 28 -> 14 / 6 / 100% / 41 -> 45 -> 54 / 60 -> 57 -> 50)', () => {
  // A plan of the same shape: one connected neighbourhood, a lot of clean power, the budget nearly spent.
  const plan: Placement[] = [
    ['road', 8, 4], ['road', 7, 9], ['road', 12, 7], ['wind', 6, 3], ['road', 5, 6], ['wind', 13, 6], ['road', 0, 4], ['solar', 8, 5],
    ['wind', 12, 6], ['park', 3, 8], ['park', 4, 8], ['residential', 3, 5], ['residential', 3, 6], ['solar', 9, 6], ['park', 12, 8],
    ['solar', 6, 9], ['park', 4, 9], ['road', 6, 6], ['park', 5, 8],
  ].map(([type, col, row], i) => ({ id: `p-${i}`, type: type as S, col: col as number, row: row as number, rotation: 0 }));
  const ys = YEARS.map((year) => projectYear(terrain, plan, year));

  it('"Population" is people housed in planned, connected homes: fixed by the plan, so it does not grow', () => {
    expect(new Set(ys.map((y) => y.population)).size).toBe(1);
    // Demand grows linearly to 28,000; whoever is not housed lives in unplanned sprawl.
    ys.forEach((y, i) => {
      const demand = BALANCE.basePopulation + PROJECTION.progress[YEARS[i]] * (PROJECTION.housingDemand2050 - BALANCE.basePopulation);
      expect(y.population + y.sprawlResidents).toBe(Math.max(y.population, Math.round(demand / 100) * 100));
    });
    expect(explainYear(ys[2]).housing).toMatch(/28,000 want to live here: 16,000 in planned homes, 12,000 in unplanned sprawl/);
  });

  it('environment declines only through explicit rules (sprawl, food imports) partly offset by maturing parks', () => {
    for (const y of ys.slice(1)) {
      const rules = new Set(ledger(terrain, plan, y.year).entries.filter((e) => e.metric === 'environment').map((e) => e.rule));
      expect(rules.has('sprawl-pressure')).toBe(true);
      expect(rules.has('park-maturity')).toBe(true);
    }
    expect(ys[0].environment).toBeGreaterThan(ys[1].environment);
    expect(ys[1].environment).toBeGreaterThan(ys[2].environment);
  });

  it('budget: construction is paid once in 2026; only sea defences for coastal sites recur', () => {
    const coastal = ys[2].floodRiskIds.length;
    expect(ys[0].budgetLeft - ys[2].budgetLeft).toBe(PROJECTION.seaDefenceCost2050 * coastal);
  });

  it('renewable 100 % is a capped share: supply exceeds the growing demand every year, and the UI says so', () => {
    for (const y of ys) {
      expect(y.renewableCoverage).toBe(100);
      expect(y.renewableSupply).toBeGreaterThan(y.energyDemand);
      expect(explainYear(y).power).toMatch(/surplus/);
    }
    expect(ys[2].energyDemand).toBeGreaterThan(ys[0].energyDemand); // demand did grow
  });

  it('land used grows and farmland shrinks only because sprawl tiles are added', () => {
    const lands = ys.map((y) => landBudget(terrain, plan, y));
    for (let i = 1; i < 3; i++) {
      const added = ys[i].sprawlTiles.length - ys[i - 1].sprawlTiles.length;
      expect(lands[i].landConsumedKm2 - lands[i - 1].landConsumedKm2).toBeCloseTo(added * 2.25, 5);
    }
  });
});
