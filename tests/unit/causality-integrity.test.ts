import { describe, expect, it } from 'vitest';
import { YEARS } from '../../src/config/projection';
import { GRID_COLS, GRID_ROWS, StructureType as S } from '../../src/config/scenario';
import { causalEvent, decisionTimeline, ledger, REGIONAL_RULES } from '../../src/simulation/causality';
import type { Placement } from '../../src/simulation/metrics';
import { canPlace } from '../../src/simulation/placement';
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

/**
 * COMPETITION milestone B — causality integrity. Every shown claim is traceable
 * to model output; regional changes are never pinned on one decision; and an
 * explanation is only shown for a year in which it holds.
 */
describe('causality integrity', () => {
  it('year-specific: one Homes beside the town houses people now; sprawl avoided appears only in later years', () => {
    const before = [p(S.Road, 6, 3)];
    const after = [...before, p(S.Residential, 6, 4)];
    const tl = decisionTimeline(terrain, before, after, 'add', 'd');
    const metrics = (y: 2026 | 2035 | 2050) => tl.byYear[y].affectedMetrics.map((e) => e.metricId);
    expect(metrics(2026)).toContain('housed');
    expect(metrics(2026)).not.toContain('sprawl'); // nobody lives in sprawl in 2026
    expect(metrics(2050)).toContain('sprawl');
    expect(tl.later(2050).map((e) => e.metricId)).toContain('sprawl');
    expect(tl.later(2050).map((e) => e.metricId)).not.toContain('housed'); // same in every year: not repeated
    for (const y of YEARS) expect(tl.byYear[y].year).toBe(y);
  });

  it('a sentence shown under "by 2050" differs from, or is absent in, 2026', () => {
    for (let i = 0; i < 25; i++) {
      const plan = randomPlan(3000 + i);
      if (plan.length < 2) continue;
      const tl = decisionTimeline(terrain, plan.slice(0, -1), plan, 'add', `d${i}`);
      const now = new Map(tl.now.affectedMetrics.map((e) => [e.metricId, e.supportedExplanation]));
      for (const e of tl.later(2050)) expect(now.get(e.metricId)).not.toBe(e.supportedExplanation);
    }
  });

  it('regional rules are marked regional and list every placement that feeds them, never just the decision', () => {
    // Two connected neighbourhoods; then a third. The housing shortage depends on all three.
    const base = [p(S.Road, 6, 3), p(S.Residential, 6, 4), p(S.Residential, 6, 2)];
    const after = [...base, p(S.Residential, 2, 4)];
    const ev = causalEvent(terrain, base, after, 2050, 'add', 'x');
    const sprawl = ev.affectedMetrics.find((e) => e.metricId === 'sprawl')!;
    expect(sprawl.scope).toBe('regional');
    const rule = sprawl.sourceRules.find((r) => r.rule === 'housing-demand')!;
    expect(rule.scope).toBe('regional');
    expect(rule.sourceIds.length).toBeGreaterThan(1);
    for (const id of ['residential-6-4', 'residential-6-2', 'residential-2-4']) expect(rule.sourceIds).toContain(id);
    // Local rules name only the placements whose contribution changed.
    const housed = ev.affectedMetrics.find((e) => e.metricId === 'housed')!;
    expect(housed.scope).toBe('local');
    expect(housed.sourceRules[0].sourceIds).toEqual(['residential-2-4']);
  });

  it('scope, sources and spatial ids are consistent with the ledger for many plans and years', () => {
    for (let i = 0; i < 20; i++) {
      const plan = randomPlan(5000 + i);
      if (plan.length < 2) continue;
      for (const year of YEARS) {
        const ev = causalEvent(terrain, plan.slice(0, -1), plan, year, 'add', `e${i}`);
        const after = ledger(terrain, plan, year);
        const ids = new Set([...plan, ...plan.slice(0, -1)].map((q) => q.id));
        expect(ev.sourceDecisionIds).toEqual([plan[plan.length - 1].id]);
        expect(ev.affectedSpatialIds).toContain(`${plan[plan.length - 1].col},${plan[plan.length - 1].row}`);
        for (const e of ev.affectedMetrics) {
          expect(e.explanationKey.startsWith(`${e.metricId}:`)).toBe(true);
          for (const r of e.sourceRules) {
            expect(r.scope).toBe(REGIONAL_RULES.has(r.rule) ? 'regional' : 'local');
            for (const id of r.sourceIds) expect(ids.has(id)).toBe(true);
            for (const t of r.tiles) expect(ev.affectedSpatialIds).toContain(`${t.col},${t.row}`);
          }
          // The numbers in the sentence are the effect's own delta.
          expect(e.supportedExplanation).toContain(Math.abs(Math.round(e.delta * (e.metricId === 'landUsed' ? 10 : 1)) / (e.metricId === 'landUsed' ? 10 : 1)).toLocaleString('en-US', { maximumFractionDigits: 1 }));
        }
        expect(ev.afterState).toEqual(after.projected);
      }
    }
  });

  it('a comparison names placements only in one plan and is deterministic', () => {
    const a = reference();
    const b = reference().slice(0, 6);
    const e1 = causalEvent(terrain, a, b, 2050, 'compare', 'c', 'your-plan');
    const e2 = causalEvent(terrain, a, b, 2050, 'compare', 'c', 'your-plan');
    expect(e1).toEqual(e2);
    expect(e1.sourceDecisionIds.length).toBe(6);
    expect(e1.affectedMetrics.some((e) => e.delta > 0) || e1.affectedMetrics.some((e) => e.delta < 0)).toBe(true);
  });
});
