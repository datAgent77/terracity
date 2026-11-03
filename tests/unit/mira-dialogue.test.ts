import { describe, expect, it } from 'vitest';
import { GRID_COLS, GRID_ROWS, StructureType as S } from '../../src/config/scenario';
import type { Placement } from '../../src/simulation/metrics';
import { canPlace } from '../../src/simulation/placement';
import { contextFacts, miraDialogue, narrativeContext } from '../../src/world/mira-dialogue';
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

describe('Mira 2.0 dialogue', () => {
  it('is empty before 2050 (she lives in 2050)', () => {
    expect(miraDialogue(narrativeContext(terrain, reference(), 'B', 2035, 6, 4))).toEqual([]);
  });

  it('every line is supported by a fact of its context, for many plans with and without another future', () => {
    const plans = [[], reference(), underHoused(), ...Array.from({ length: 30 }, (_, i) => randomPlan(500 + i))];
    for (let i = 0; i < plans.length; i++) {
      for (const other of [null, { planId: 'A' as const, plan: plans[(i + 1) % plans.length] }]) {
        const ctx = narrativeContext(terrain, plans[i], 'B', 2050, 6, 4, other);
        const facts = contextFacts(ctx);
        const lines = miraDialogue(ctx);
        expect(lines.length).toBeGreaterThanOrEqual(3);
        expect(lines.length).toBeLessThanOrEqual(6);
        for (const l of lines) {
          for (const s of l.support) expect(facts, `"${l.text}" needs ${s}`).toContain(s);
          expect(l.text).toMatch(/^[\x20-\x7e]+$/);
          expect(l.text).not.toMatch(/water|thirst|sick|disease|traffic|died|accident/i);
        }
      }
    }
  });

  it('the same place in two futures: one verified difference with both sides of the tradeoff', () => {
    // Plan B has her street, Plan A (nobody planned) does not.
    const ctx = narrativeContext(terrain, reference(), 'B', 2050, 6, 4, { planId: 'none', plan: [] });
    const text = miraDialogue(ctx).map((l) => l.text).join(' ');
    expect(text).toMatch(/In the other future this street was never built\. (Unplanned houses went up here instead, and|The land stayed open, but) [\d,]+ people had no planned home\./);
    // Which one is decided by the simulation: is there sprawl on this tile in the other future?
    expect(text.includes('Unplanned houses went up here')).toBe(ctx.other!.local.sprawlHere);
    // And from the other side: she lives in the unplanned houses; the planned street exists elsewhere.
    const other = narrativeContext(terrain, [], 'none', 2050, 6, 4, { planId: 'B', plan: reference() });
    expect(miraDialogue(other).map((l) => l.text).join(' ')).toMatch(/In the other future there is a planned street here/);
  });

  it('no repeated lines', () => {
    for (const plan of [[], reference(), underHoused()]) {
      for (const other of [null, { planId: 'none' as const, plan: [] }]) {
        const t = miraDialogue(narrativeContext(terrain, plan, 'B', 2050, 6, 4, other)).map((l) => l.text);
        expect(new Set(t).size).toBe(t.length);
      }
    }
  });

  it('is deterministic and changes when the plan changes', () => {
    const a = miraDialogue(narrativeContext(terrain, underHoused(), 'B', 2050, 6, 4));
    expect(miraDialogue(narrativeContext(terrain, underHoused(), 'B', 2050, 6, 4))).toEqual(a);
    expect(miraDialogue(narrativeContext(terrain, reference(), 'B', 2050, 6, 4))).not.toEqual(a);
  });

  it('local context is geographic: the neighbourhood id and the decisions she can see', () => {
    const ctx = narrativeContext(terrain, reference(), 'B', 2050, 6, 4);
    expect(ctx.neighborhoodId).toBe('6,4');
    for (const d of ctx.relevantDecisions) {
      expect(Math.abs(d.col - 6)).toBeLessThanOrEqual(2);
      expect(Math.abs(d.row - 4)).toBeLessThanOrEqual(2);
    }
  });
});
