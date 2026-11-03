/**
 * The first five minutes (CAUSALITY F): an interactive journey through the
 * core loop — one choice → split into two futures → Causality Vision → enter a
 * future → talk to Mira → look at the other future. Every step waits for the
 * player's own action; nothing plays by itself, and the full planning tools
 * stay available throughout. Pure (no IWSDK) so it is unit-testable. The
 * intro card ("Every city begins with a choice.") and the closing card ("The
 * future isn't written. It's built.") are in flow-panels.ts.
 */
import type { Year } from '../config/projection.js';
import { StructureType } from '../config/scenario.js';
import type { Placement } from '../simulation/metrics.js';
import type { TerrainMap } from '../world/terrain-map.js';

export type TutorialStep = 'homes' | 'split' | 'why' | 'enter' | 'talk' | 'other' | 'done';
export type StreetPlan = 'A' | 'B' | 'none';

export interface TutorialContext {
  placements: readonly Placement[];
  servedIds: ReadonlySet<string>;
  viewYear: Year;
  /** Visiting a neighbourhood at street level ("Enter your city"). */
  inStreet?: boolean;
  /** Two futures are held apart ("Split reality"). */
  futuresOpen?: boolean;
  /** Causality Vision is on. */
  causalityOn?: boolean;
  /** Which future the street shows (when inStreet). */
  streetPlan?: StreetPlan | null;
  /** A conversation with Mira was had (and ended) in this visit. */
  talked?: boolean;
  /** Plan version (counts every change); a replay asks for a new choice. */
  planVersion?: number;
}

export const TUTORIAL_TEXT: Record<Exclude<TutorialStep, 'done'>, string> = {
  homes: 'Step 1/6: Make one choice. Pinch Homes in the tray and drop it on a glowing tile beside the town.',
  split: 'Step 2/6: See what your choice changes. Bring both hands together and pull them apart (or tap Split).',
  why: 'Step 3/6: Tap Why? (or W): rings mark where the two futures differ, and the card says why.',
  enter: 'Step 4/6: Pinch a future and pull it toward you (or tap Enter future). Someone lives there in 2050.',
  talk: 'Step 5/6: Meet Mira. Pinch her or tap Talk to Mira.',
  other: 'Step 6/6: Return, then enter the other future: the same street, another outcome.',
};

const ORDER: TutorialStep[] = ['homes', 'split', 'why', 'enter', 'talk', 'other', 'done'];

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
        (this.step === 'split' && !!ctx.futuresOpen) ||
        (this.step === 'why' && !!ctx.futuresOpen && !!ctx.causalityOn) ||
        (this.step === 'enter' && !!ctx.inStreet && !!ctx.streetPlan) ||
        (this.step === 'talk' && !!ctx.inStreet && !!ctx.talked) ||
        (this.step === 'other' && !!ctx.inStreet && !!ctx.streetPlan && !!this.firstPlan && ctx.streetPlan !== this.firstPlan);
      if (!done || this.step === 'done') break;
      if (this.step === 'enter') this.firstPlan = ctx.streetPlan ?? null;
      this.step = ORDER[ORDER.indexOf(this.step) + 1];
      if (this.step === 'done') this.completed = true;
      // Every step needs a fresh action of its own (Causality Vision may
      // already be on when the futures split).
      if (this.step !== 'why') break;
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
