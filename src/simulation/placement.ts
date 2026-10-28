/**
 * Placement rules: can a structure go on a tile, and what does the player need
 * to know about it? Pure and deterministic.
 */
import { StructureType, TerrainType } from '../config/scenario.js';
import type { Tile } from '../world/terrain-map.js';

export type PlacementVerdict =
  | { ok: true; warning?: string }
  | { ok: false; reason: string };

/** Elevation at or above which homes are not allowed (too steep). */
export const MAX_RESIDENTIAL_ELEVATION = 3;

export function canPlace(
  structure: StructureType,
  tile: Tile | undefined,
  occupied: boolean,
): PlacementVerdict {
  if (!tile) return { ok: false, reason: 'Outside the region' };
  if (occupied) return { ok: false, reason: 'Tile already built' };

  switch (tile.type) {
    case TerrainType.Sea:
    case TerrainType.River:
      return { ok: false, reason: 'Cannot build on water' };
    case TerrainType.Beach:
      return { ok: false, reason: 'Coastal setback: beach is protected' };
    case TerrainType.Protected:
      return { ok: false, reason: 'Protected natural area' };
    case TerrainType.Town:
      return { ok: false, reason: 'Existing town' };
  }

  if (structure === StructureType.Residential) {
    if (tile.elevation >= MAX_RESIDENTIAL_ELEVATION) {
      return { ok: false, reason: 'Slope too steep for homes' };
    }
    if (tile.type === TerrainType.Farmland) {
      return { ok: true, warning: 'Uses fertile farmland' };
    }
    if (tile.type === TerrainType.Hill) {
      return { ok: true, warning: 'Hillside: higher infrastructure cost' };
    }
  }
  return { ok: true };
}
