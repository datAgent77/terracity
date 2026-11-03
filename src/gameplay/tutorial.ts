/**
 * The first five minutes (COMPETITION E): an interactive journey through the
 * core loop — one choice → see it in 2050 (the decision card explains it) →
 * split into two futures → move the Reality Seam → enter a future → talk to
 * Mira → the other future. Every step waits for the
 * player's own action; nothing plays by itself, and the full planning tools
 * stay available throughout. Pure (no IWSDK) so it is unit-testable. The
 * intro card ("Every city begins with a choice.") and the closing card ("The
 * future isn't written. Change it.") are in flow-panels.ts.
 */
import type { Year } from '../config/projection.js';
import { StructureType } from '../config/scenario.js';
import type { Placement } from '../simulation/metrics.js';
import type { TerrainMap } from '../world/terrain-map.js';

export type TutorialStep = 'homes' | 'time' | 'split' | 'seam' | 'enter' | 'talk' | 'other' | 'done';
export type StreetPlan = 'A' | 'B' | 'none';

export interface TutorialContext {
  placements: readonly Placement[];
  servedIds: ReadonlySet<string>;
  viewYear: Year;
  /** Visiting a neighbourhood at street level ("Enter your city"). */
  inStreet?: boolean;
  /** Two futures are held apart ("Split reality"). */
  futuresOpen?: boolean;
  /** Causality Vision is on (no longer a step; kept for callers). */
  causalityOn?: boolean;
  /** Reality Seam position (null when closed). */
  seam?: number | null;
  /** Which future the street shows (when inStreet). */
  streetPlan?: StreetPlan | null;
  /** A conversation with Mira was had (and ended) in this visit. */
  talked?: boolean;
  /** Plan version (counts every change); a replay asks for a new choice. */
  planVersion?: number;
}

export const TUTORIAL_TEXT: Record<Exclude<TutorialStep, 'done'>, string> = {
  homes: 'Step 1/7: Make one choice. Pinch Homes in the tray and drop it on a glowing tile beside the town.',
  time: 'Step 2/7: Travel to 2050 (turn the time dial or tap 2050). The card shows what your choice did by then.',
  split: 'Step 3/7: Split the city into two futures: bring both hands together and pull them apart (or tap Split).',
  seam: 'Step 4/7: Tap Reality Seam, then pinch the golden handle and sweep it: the same place, two futures.',
  enter: 'Step 5/7: Enter a future (pull it toward you, or tap Enter future). Someone lives there in 2050.',
  talk: 'Step 6/7: Meet Mira. Pinch her or tap Talk to Mira.',
  other: 'Step 7/7: Return, then enter the other future: the same street, another outcome.',
};

const ORDER: TutorialStep[] = ['homes', 'time', 'split', 'seam', 'enter', 'talk', 'other', 'done'];

export class Tutorial {
  step: TutorialStep = 'homes';
  /** Plan version when the journey (re)started: step 1 needs a change after it. */
  private baseline: number | null = null;
  /** The future the player entered first (step 6 asks for the other one). */
  firstPlan: StreetPlan | null = null;
  /** True once the journey was completed (not skipped); cleared on reset. */
  completed = false;

  get active(): boolean {
    return this.step !== 'done';
  }

  get text(): string {
    return this.step === 'done' ? '' : TUTORIAL_TEXT[this.step];
  }

  skip(): void {
    this.step = 'done';
  }

  /** Start (again). With `planVersion`, step 1 waits for a new change (replay on an existing plan). */
  reset(planVersion?: number): void {
    this.step = 'homes';
    this.baseline = planVersion ?? null;
    this.firstPlan = null;
    this.completed = false;
  }

  /** Advance as far as the current state allows; returns true if the step changed. */
  update(ctx: TutorialContext): boolean {
    const before = this.step;
    for (;;) {
      const changed = this.baseline === null || (ctx.planVersion ?? 0) > this.baseline;
      const done =
        (this.step === 'homes' && changed && ctx.placements.some((p) => p.type === StructureType.Residential && ctx.servedIds.has(p.id))) ||
        (this.step === 'time' && ctx.viewYear === 2050) ||
        (this.step === 'split' && !!ctx.futuresOpen) ||
        // The seam has been moved (it opens at the middle).
        (this.step === 'seam' && ctx.seam != null && Math.abs(ctx.seam - 0.5) > 0.03) ||
        (this.step === 'enter' && !!ctx.inStreet && !!ctx.streetPlan) ||
        (this.step === 'talk' && !!ctx.inStreet && !!ctx.talked) ||
        (this.step === 'other' && !!ctx.inStreet && !!ctx.streetPlan && !!this.firstPlan && ctx.streetPlan !== this.firstPlan);
      if (!done || this.step === 'done') break;
      if (this.step === 'enter') this.firstPlan = ctx.streetPlan ?? null;
      this.step = ORDER[ORDER.indexOf(this.step) + 1];
      if (this.step === 'done') this.completed = true;
      // Every step needs a fresh action of its own.
      break;
    }
    return this.step !== before;
  }

  /** Tiles to glow for the current step. */
  hintTiles(_terrain: TerrainMap, placements: readonly Placement[]): Array<{ col: number; row: number }> {
    if (this.step !== 'homes') return [];
    const free = (c: number, r: number) => !placements.some((p) => p.col === c && p.row === r);
    return [
      { col: 6, row: 3 },
      { col: 6, row: 4 },
      { col: 2, row: 4 },
    ].filter((t) => free(t.col, t.row));
  }
}
