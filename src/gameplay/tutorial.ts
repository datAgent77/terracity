/**
 * Guided first minutes: five short steps that follow the signature experience —
 * build → power → enter your city → see 2050 there → back to the tabletop (and
 * the Plan A/B comparison). Pure (no IWSDK) so it is unit-testable.
 */
import type { Year } from '../config/projection.js';
import { StructureType, TerrainType } from '../config/scenario.js';
import type { Placement } from '../simulation/metrics.js';
import type { TerrainMap } from '../world/terrain-map.js';

export type TutorialStep = 'homes' | 'wind' | 'enter' | 'future' | 'back' | 'done';

export interface TutorialContext {
  placements: readonly Placement[];
  servedIds: ReadonlySet<string>;
  viewYear: Year;
  /** Visiting a neighbourhood at street level ("Enter your city"). */
  inStreet?: boolean;
}

export const TUTORIAL_TEXT: Record<Exclude<TutorialStep, 'done'>, string> = {
  homes: 'Tip 1/5: Pinch the Homes piece in the tray and drop it on a glowing tile next to the town.',
  wind: 'Tip 2/5: Your homes need clean power. Put a Wind turbine on a glowing ridge tile - higher is windier.',
  enter: 'Tip 3/5: Tap Enter your city on the Plan pad and stand in the neighbourhood you built.',
  future: 'Tip 4/5: Tap 2050 to see what your plan does to this place.',
  back: 'Tip 5/5: Return to the tabletop and tap 2026 to keep building. Save Plan A, try a Plan B, then compare them in the street.',
};

const ORDER: TutorialStep[] = ['homes', 'wind', 'enter', 'future', 'back', 'done'];

export class Tutorial {
  step: TutorialStep = 'homes';

  get active(): boolean {
    return this.step !== 'done';
  }

  get text(): string {
    return this.step === 'done' ? '' : TUTORIAL_TEXT[this.step];
  }

  skip(): void {
    this.step = 'done';
  }

  reset(): void {
    this.step = 'homes';
  }

  /** Advance as far as the current state allows; returns true if the step changed. */
  update(ctx: TutorialContext): boolean {
    const before = this.step;
    for (;;) {
      const done =
        (this.step === 'homes' && ctx.placements.some((p) => p.type === StructureType.Residential && ctx.servedIds.has(p.id))) ||
        (this.step === 'wind' && ctx.placements.some((p) => p.type === StructureType.Wind)) ||
        (this.step === 'enter' && !!ctx.inStreet) ||
        (this.step === 'future' && ctx.viewYear === 2050) ||
        (this.step === 'back' && !ctx.inStreet && ctx.viewYear === 2026);
      if (!done || this.step === 'done') break;
      this.step = ORDER[ORDER.indexOf(this.step) + 1];
      // Steps that need a fresh action each: entering, the year, coming back.
      if (this.step === 'enter' || this.step === 'back' || this.step === 'future') break;
    }
    return this.step !== before;
  }

  /** Tiles to glow for the current step. */
  hintTiles(terrain: TerrainMap, placements: readonly Placement[]): Array<{ col: number; row: number }> {
    const free = (c: number, r: number) => !placements.some((p) => p.col === c && p.row === r);
    if (this.step === 'homes') {
      return [
        { col: 6, row: 3 },
        { col: 6, row: 4 },
        { col: 2, row: 4 },
      ].filter((t) => free(t.col, t.row));
    }
    if (this.step === 'wind') {
      return terrain
        .filter((t) => t.type === TerrainType.Hill && t.elevation >= 2 && free(t.col, t.row))
        .map(({ col, row }) => ({ col, row }));
    }
    return [];
  }
}

