/**
 * Guided first minutes along TerraCity: GODMODE — build → power → split the
 * world into two futures → pull one toward you and step inside it (2050: meet
 * Mira) → come back, merge, and rewrite the plan. Pure (no IWSDK) so it is unit-testable.
 */
import type { Year } from '../config/projection.js';
import { StructureType, TerrainType } from '../config/scenario.js';
import type { Placement } from '../simulation/metrics.js';
import type { TerrainMap } from '../world/terrain-map.js';

export type TutorialStep = 'homes' | 'wind' | 'split' | 'enter' | 'back' | 'done';

export interface TutorialContext {
  placements: readonly Placement[];
  servedIds: ReadonlySet<string>;
  viewYear: Year;
  /** Visiting a neighbourhood at street level ("Enter your city"). */
  inStreet?: boolean;
  /** Two futures are held apart ("Split reality"). */
  futuresOpen?: boolean;
}

export const TUTORIAL_TEXT: Record<Exclude<TutorialStep, 'done'>, string> = {
  homes: 'Tip 1/5: Pinch the Homes piece in the tray and drop it on a glowing tile next to the town.',
  wind: 'Tip 2/5: Your homes need clean power. Put a Wind turbine on a glowing ridge tile - higher is windier.',
  split: 'Tip 3/5: Bring both open hands together over the city, then pull them apart (or tap Split into two futures).',
  enter: 'Tip 4/5: Pinch a future and pull it toward you (or tap Enter future). Someone lives there in 2050.',
  back: 'Tip 5/5: Come back, bring your hands together to merge, change your plan, and visit her again.',
};

const ORDER: TutorialStep[] = ['homes', 'wind', 'split', 'enter', 'back', 'done'];

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
        (this.step === 'split' && !!ctx.futuresOpen) ||
        (this.step === 'enter' && !!ctx.inStreet) ||
        (this.step === 'back' && !ctx.inStreet && !ctx.futuresOpen);
      if (!done || this.step === 'done') break;
      this.step = ORDER[ORDER.indexOf(this.step) + 1];
      // Steps that need a fresh action each: splitting, entering, coming back.
      if (this.step === 'split' || this.step === 'enter' || this.step === 'back') break;
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

