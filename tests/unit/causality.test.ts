import { describe, expect, it } from 'vitest';
import { YEARS } from '../../src/config/projection';
import { GRID_COLS, GRID_ROWS, StructureType as S } from '../../src/config/scenario';
import { causalEvent, ledger, ledgerTotal } from '../../src/simulation/causality';
import { landBudget } from '../../src/simulation/land-budget';
import type { Placement } from '../../src/simulation/metrics';
import { canPlace } from '../../src/simulation/placement';
import { projectYear } from '../../src/simulation/projection';
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

/** Random legal plans (fixed seeds): the property tests run over many of them. */
function randomPlan(seed: number): Placement[] {
  const r = rng(seed);
  const types = Object.values(S);
  const plan: Placement[] = [];
  for (let k = 0; k < 40 && plan.length < 14; k++) {
    const type = types[Math.floor(r() * types.length)];
    const col = Math.floor(r() * GRID_COLS);
    const row = Math.floor(r() * GRID_ROWS);
    if (!canPlace(type, tileAt(terrain, col, row), plan.some((q) => q.col === col && q.row === row)).ok) continue;
    plan.push({ id: `${type}-${k}`, type, col, row, rotation: 0 });
  }
  return plan;
}
const plans = [[], reference(), ...Array.from({ length: 40 }, (_, i) => randomPlan(1000 + i))];

describe('causality ledger', () => {
  it('sums exactly to the simulated metrics for every plan and year (no second source of truth)', () => {
    for (const plan of plans) {
      for (const year of YEARS) {
        const y = projectYear(terrain, plan, year);
        const l = ledger(terrain, plan, year);
        expect(ledgerTotal(l, 'housed')).toBe(y.population);
        expect(ledgerTotal(l, 'sprawl')).toBe(y.sprawlResidents);
        expect(ledgerTotal(l, 'environment')).toBe(y.environment);
        expect(ledgerTotal(l, 'budgetLeft')).toBe(y.budgetLeft);
        expect(ledgerTotal(l, 'renewableSupply')).toBe(y.renewableSupply);
        expect(ledgerTotal(l, 'landUsed')).toBeCloseTo(landBudget(terrain, plan, y).landConsumedKm2, 9);
      }
    }
  });
});

describe('causal events', () => {
  it('each effect equals the simulated difference, and names only rules that actually changed', () => {
    for (let i = 0; i + 1 < plans.length; i++) {
      const a = plans[i];
      const b = plans[i + 1];
      for (const year of YEARS) {
        const ev = causalEvent(terrain, a, b, year, 'plan-change', `t${i}`);
        const A = projectYear(terrain, a, year);
        const B = projectYear(terrain, b, year);
        for (const fx of ev.affectedMetrics) {
          const sim = { housed: [A.population, B.population], sprawl: [A.sprawlResidents, B.sprawlResidents], environment: [A.environment, B.environment], renewableCoverage: [A.renewableCoverage, B.renewableCoverage], budgetLeft: [A.budgetLeft, B.budgetLeft] } as Record<string, number[]>;
          if (sim[fx.metricId]) {
            expect(fx.previousValue).toBe(sim[fx.metricId][0]);
            expect(fx.nextValue).toBe(sim[fx.metricId][1]);
          }
          for (const rc of fx.sourceRules) expect(rc.delta).not.toBe(0);
          // Rule deltas add up to the metric delta (except coverage, a ratio of supply and demand).
          if (fx.metricId !== 'renewableCoverage') {
            expect(fx.sourceRules.reduce((s, r) => s + r.delta, 0)).toBeCloseTo(fx.delta, 9);
          }
          expect(fx.supportedExplanation).toMatch(/^[\x20-\x7e]*$/);
        }
        // No effect for a metric that did not change.
        if (A.population === B.population) expect(ev.affectedMetrics.find((e) => e.metricId === 'housed')).toBeUndefined();
        if (A.environment === B.environment) expect(ev.affectedMetrics.find((e) => e.metricId === 'environment')).toBeUndefined();
      }
    }
  });

  it('adding solar changes renewable share via supply, and never claims residents are housed', () => {
    const before = reference().filter((x) => x.type !== S.Solar);
    const ev = causalEvent(terrain, before, reference(), 2050, 'add', 'solar');
    expect(ev.affectedEntities).toEqual([{ change: 'added', placement: p(S.Solar, 9, 4) }]);
    expect(ev.affectedMetrics.find((e) => e.metricId === 'housed')).toBeUndefined();
    const cov = ev.affectedMetrics.find((e) => e.metricId === 'renewableCoverage');
    if (cov) {
      expect(cov.sourceRules.map((r) => r.rule)).toContain('structure-energy');
      expect(cov.supportedExplanation).toMatch(/renewable supply \+/);
    }
    const budget = ev.affectedMetrics.find((e) => e.metricId === 'budgetLeft')!;
    expect(budget.delta).toBeLessThan(0); // the cost is shown, not only the benefit
    expect(budget.sourceRules[0].rule).toBe('construction');
  });

  it('connecting homes houses residents and anchors the effect on the homes tile', () => {
    const before = [p(S.Residential, 8, 3), p(S.Road, 6, 3)]; // road from the town stops one tile short
    const after = [...before, p(S.Road, 7, 3)];
    const ev = causalEvent(terrain, before, after, 2050, 'add', 'road');
    const housed = ev.affectedMetrics.find((e) => e.metricId === 'housed')!;
    expect(housed.delta).toBe(4000);
    expect(housed.sourceRules[0].rule).toBe('homes-connected');
    expect(housed.sourceRules[0].tiles).toEqual([{ col: 8, row: 3 }]);
    expect(ev.explanation).toMatch(/gains housed \+4,000/);
  });

  it('a building on farmland names the farmland rule; a decision with no effect says so', () => {
    const farm = [p(S.Solar, 3, 5)];
    const ev = causalEvent(terrain, [], farm, 2026, 'add', 'farm');
    const env = ev.affectedMetrics.find((e) => e.metricId === 'environment')!;
    expect(env.sourceRules.map((r) => r.rule)).toContain('farmland-converted');
    const none = causalEvent(terrain, reference(), reference(), 2050, 'rotate', 'noop');
    expect(none.affectedMetrics).toEqual([]);
    expect(none.explanation).toBe('No change by 2050.');
  });

  it('comparing two plans reports placements only in one of them, deterministically', () => {
    const a = reference().filter((x) => x.type !== S.Park);
    const b = reference();
    const ev1 = causalEvent(terrain, a, b, 2050, 'compare', 'cmp');
    const ev2 = causalEvent(terrain, a, b, 2050, 'compare', 'cmp');
    expect(ev1).toEqual(ev2);
    expect(ev1.affectedEntities.map((e) => `${e.change}:${e.placement.type}`).sort()).toEqual(['added:park', 'added:park']);
    expect(ev1.explanation).toMatch(/^2050, Plan B vs Plan A: /);
  });
});
