/**
 * Input-agnostic game state. Every input path (XR hand, controller ray, mouse,
 * keyboard) ends in one of these actions, so rules live in exactly one place.
 */
import type { StructureType } from '../config/scenario.js';
import { canPlace, type PlacementVerdict } from '../simulation/placement.js';
import { generateTerrain, tileAt, type TerrainMap } from '../world/terrain-map.js';

export interface Placement {
  id: string;
  type: StructureType;
  col: number;
  row: number;
}

export type GameEvent =
  | { kind: 'placed'; placement: Placement; verdict: PlacementVerdict & { ok: true } }
  | { kind: 'rejected'; id: string; col: number; row: number; reason: string };

export class GameState {
  readonly terrain: TerrainMap = generateTerrain();
  private placements = new Map<string, Placement>();
  private listeners = new Set<(e: GameEvent) => void>();

  on(listener: (e: GameEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get(id: string): Placement | undefined {
    return this.placements.get(id);
  }

  all(): Placement[] {
    return [...this.placements.values()];
  }

  isOccupied(col: number, row: number, ignoreId?: string): boolean {
    for (const p of this.placements.values()) {
      if (p.id !== ignoreId && p.col === col && p.row === row) return true;
    }
    return false;
  }

  /** Validate without mutating — used for live hover feedback. */
  check(type: StructureType, col: number, row: number, ignoreId?: string): PlacementVerdict {
    return canPlace(type, tileAt(this.terrain, col, row), this.isOccupied(col, row, ignoreId));
  }

  /** Place a new structure or move an existing one. Returns the verdict. */
  place(id: string, type: StructureType, col: number, row: number): PlacementVerdict {
    const verdict = this.check(type, col, row, id);
    if (!verdict.ok) {
      this.emit({ kind: 'rejected', id, col, row, reason: verdict.reason });
      return verdict;
    }
    const placement = { id, type, col, row };
    this.placements.set(id, placement);
    this.emit({ kind: 'placed', placement, verdict });
    return verdict;
  }

  private emit(e: GameEvent): void {
    for (const l of this.listeners) l(e);
  }
}
