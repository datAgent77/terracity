/**
 * The Last Child (GODMODE wow moment 3): what Mira, a child living in the
 * visited neighbourhood in 2050, says — and how her little garden looks.
 * PURE and deterministic (tests/unit/child-narrative.test.ts): every sentence
 * maps to a simulated quantity and is only used when that quantity supports it.
 *
 *   environment >= target          -> thriving: green garden, "favourite place"
 *   environment < target, trees lost -> parched: dry garden, "there used to be trees"
 *   environment < target, no tree loss yet -> parched: "the garden is dry again"
 *   no planned neighbourhood here  -> unplanned: lives in unplanned sprawl
 * Second line (at most one): unplanned sprawl elsewhere (housing pressure), else
 * renewable coverage below its target (energy), else a quiet thank-you when
 * everything is met. Water is not modelled, so water is never mentioned.
 * ASCII only (the UI font has no dashes or dots).
 */
import { TARGETS } from '../config/balance.js';
import type { YearMetrics } from '../simulation/projection.js';
import type { FutureVisualState } from './future-visual-state.js';

export const CHILD_NAME = 'Mira';
export const CHILD_AGE = 9;

export type ChildState = 'thriving' | 'parched' | 'unplanned';

export interface ChildNarrative {
  state: ChildState;
  /** The little garden beside her. */
  garden: 'lush' | 'dry';
  /** One or two lines, spoken in order. */
  lines: string[];
}

/** Mira lives in 2050 only; earlier years have no child (null). */
export function childNarrative(projected: YearMetrics, state: FutureVisualState, opts: { homesHere: boolean }): ChildNarrative | null {
  if (projected.year !== 2050) return null;
  const envMet = projected.environment >= TARGETS.environment;
  const renewMet = projected.renewableCoverage >= TARGETS.renewableCoverage;
  const lines: string[] = [];
  let st: ChildState;
  if (!opts.homesHere) {
    st = 'unplanned';
    lines.push('We live in the houses out here. Nobody planned a street or a garden.');
  } else if (envMet) {
    st = 'thriving';
    lines.push('This is my favorite place. Did you help make it?');
  } else {
    st = 'parched';
    lines.push(state.treeLoss > 0 ? 'My grandmother told me there used to be trees here.' : 'The garden is dry again this summer.');
  }
  if (st !== 'unplanned' && projected.sprawlResidents > 0) {
    lines.push('My cousins live in houses built without a plan. There is no park there.');
  } else if (!renewMet) {
    lines.push('Grandpa says only some of our power comes from the wind and the sun.');
  } else if (st === 'thriving') {
    lines.push('Grandpa says most of our power comes from the wind and the sun now.');
  }
  return { state: st, garden: envMet && st !== 'unplanned' ? 'lush' : 'dry', lines };
}
