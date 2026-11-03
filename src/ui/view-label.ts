/**
 * What the player is looking at (PURE; tests/unit/view-label.test.ts).
 *
 * The UI must always say which scenario, which year, whether it can be
 * edited, and whether it is a projection. Names are fixed:
 *   - "Your plan"       — the editable map (always Future A)
 *   - "Saved plan"      — a snapshot saved for comparison (Future B when it exists)
 *   - "If nobody plans" — the documented baseline (Future B otherwise)
 * ASCII only (the UI font has no dashes or dots).
 */
import type { Year } from '../config/projection.js';

export type StreetPlanTag = 'A' | 'B' | 'none';

export const SCENARIO_NAMES = { yours: 'Your plan', saved: 'Saved plan', baseline: 'If nobody plans' } as const;

/** Street / data tag -> scenario name ('B' is the current map, 'A' the saved snapshot). */
export function scenarioName(tag: StreetPlanTag): string {
  return tag === 'B' ? SCENARIO_NAMES.yours : tag === 'A' ? SCENARIO_NAMES.saved : SCENARIO_NAMES.baseline;
}

export interface ViewInput {
  phase: 'intro' | 'building' | 'finished';
  year: Year;
  futuresOpen: boolean;
  hasSaved: boolean;
  street: StreetPlanTag | null;
}

export interface ViewLabel {
  scenario: string;
  year: Year;
  editable: boolean;
  projection: boolean;
  text: string;
}

export function viewLabel(v: ViewInput): ViewLabel {
  if (v.phase === 'intro') return { scenario: SCENARIO_NAMES.yours, year: v.year, editable: false, projection: false, text: 'Ready to start' };
  // The two futures show 2050 while the year is 2026 (the present is shared: futures.ts).
  const year: Year = v.futuresOpen && !v.street && v.year === 2026 ? 2050 : v.year;
  const projection = year !== 2026;
  const when = projection ? `${year} projection` : '2026 today';
  if (v.street) {
    const scenario = scenarioName(v.street);
    return { scenario, year, editable: false, projection, text: `${scenario} - ${when} - street visit` };
  }
  if (v.futuresOpen) {
    const other = v.hasSaved ? SCENARIO_NAMES.saved : SCENARIO_NAMES.baseline;
    return { scenario: `${SCENARIO_NAMES.yours} vs ${other}`, year, editable: false, projection: true, text: `A ${SCENARIO_NAMES.yours} vs B ${other} - ${when}` };
  }
  if (v.phase === 'finished') return { scenario: SCENARIO_NAMES.yours, year, editable: false, projection, text: `${SCENARIO_NAMES.yours} - submitted - ${when}` };
  const editable = !projection;
  return { scenario: SCENARIO_NAMES.yours, year, editable, projection, text: `${SCENARIO_NAMES.yours} - ${when} - ${editable ? 'editing' : 'read only'}` };
}
