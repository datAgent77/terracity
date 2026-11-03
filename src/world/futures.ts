/**
 * Which two futures "Split reality" shows (pure; tests/unit/futures.test.ts).
 *
 * Future A (left) is always YOUR PLAN — the editable map. Future B (right) is
 * the comparison: the plan you saved, or, without one, the documented
 * baseline "if nobody plans" (no structures: every newcomer ends up in
 * unplanned sprawl; SIMULATION_ASSUMPTIONS.md). Both come from the same terrain and the same deterministic
 * projection, so the same plans always give the same two futures.
 */
import type { Year } from '../config/projection.js';
import type { Placement } from '../simulation/metrics.js';

export type Side = 'A' | 'B';

export interface FuturePair {
  A: { title: string; plan: readonly Placement[] };
  B: { title: string; plan: readonly Placement[] };
  /** The futures are shown in this year (2026 shows 2050: the present is shared). */
  year: Year;
}

export function futurePair(planA: readonly Placement[] | null, current: readonly Placement[], viewYear: Year): FuturePair {
  const year: Year = viewYear === 2026 ? 2050 : viewYear;
  return planA
    ? { A: { title: 'Your plan', plan: current }, B: { title: 'Saved plan', plan: planA }, year }
    : { A: { title: 'Your plan', plan: current }, B: { title: 'If nobody plans', plan: [] }, year };
}
