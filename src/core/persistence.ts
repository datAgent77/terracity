/**
 * Save / reload (pure; tests/unit/persistence.test.ts). Plan A and the current
 * map are stored together, versioned, and validated on load against the same
 * placement rules the game uses. A save that fails validation is discarded as
 * a whole (never partially applied), so a reload can never corrupt a scenario.
 */
import { GRID_COLS, GRID_ROWS, StructureType } from '../config/scenario.js';
import type { Placement } from '../simulation/metrics.js';
import { canPlace } from '../simulation/placement.js';
import { tileAt, type TerrainMap } from '../world/terrain-map.js';

export const SAVE_KEY = 'terracity.save.v2';
/** The v1 key held Plan A only; it is still read (migrated) on load. */
export const LEGACY_PLAN_A_KEY = 'terracity.planA.v1';

export interface SavedState {
  version: 2;
  planA: Placement[] | null;
  current: Placement[];
}

const TYPES = new Set<string>(Object.values(StructureType));

/** A plan is valid when every piece is well-formed and legal in order (no budget check). */
export function validPlan(terrain: TerrainMap, plan: unknown): plan is Placement[] {
  if (!Array.isArray(plan)) return false;
  const ids = new Set<string>();
  const taken = new Set<number>();
  for (const p of plan) {
    if (!p || typeof p !== 'object') return false;
    const { id, type, col, row, rotation } = p as Record<string, unknown>;
    if (typeof id !== 'string' || ids.has(id) || !TYPES.has(type as string)) return false;
    if (!Number.isInteger(col) || !Number.isInteger(row) || !Number.isInteger(rotation)) return false;
    if ((col as number) < 0 || (col as number) >= GRID_COLS || (row as number) < 0 || (row as number) >= GRID_ROWS) return false;
    if ((rotation as number) < 0 || (rotation as number) > 3) return false;
    const key = (row as number) * GRID_COLS + (col as number);
    if (!canPlace(type as StructureType, tileAt(terrain, col as number, row as number), taken.has(key)).ok) return false;
    ids.add(id);
    taken.add(key);
  }
  return true;
}

export function serialize(planA: readonly Placement[] | null, current: readonly Placement[]): string {
  const clean = (ps: readonly Placement[]) => ps.map(({ id, type, col, row, rotation }) => ({ id, type, col, row, rotation }));
  const s: SavedState = { version: 2, planA: planA ? clean(planA) : null, current: clean(current) };
  return JSON.stringify(s);
}

/** Parse a v2 save (or a legacy v1 Plan A); null when absent or invalid. */
export function parseSaved(terrain: TerrainMap, raw: string | null, legacyPlanA: string | null = null): SavedState | null {
  try {
    if (raw) {
      const s = JSON.parse(raw) as Partial<SavedState>;
      if (s.version !== 2) return null;
      if (!validPlan(terrain, s.current)) return null;
      if (s.planA !== null && !validPlan(terrain, s.planA)) return null;
      return { version: 2, planA: s.planA ?? null, current: s.current };
    }
    if (legacyPlanA) {
      const a = JSON.parse(legacyPlanA);
      return validPlan(terrain, a) ? { version: 2, planA: a, current: [] } : null;
    }
  } catch {
    return null;
  }
  return null;
}
