/**
 * Placement rules: can a structure go on a tile, what does it cost, and what
 * does the player need to know about it? Pure and deterministic.
 */
import { BALANCE } from '../config/balance.js';
import { StructureType, TerrainType } from '../config/scenario.js';
import { STRUCTURES } from '../config/structures.js';
import type { Tile } from '../world/terrain-map.js';

export type PlacementVerdict =
  | { ok: true; cost: number; warning?: string }
  | { ok: false; reason: string };

/** Elevation at or above which homes are not allowed (too steep). */
export const MAX_RESIDENTIAL_ELEVATION = STRUCTURES.residential.maxElevation + 1;

const TERRAIN_REASON: Partial<Record<TerrainType, string>> = {
  sea: 'Cannot build on water',
  river: 'Cannot build on water',
  beach: 'Coastal setback: beach is protected',
  protected: 'Protected natural area',
  town: 'Existing town',
};

/** Construction cost including the slope surcharge. */
export function constructionCost(structure: StructureType, tile: Tile): number {
  const spec = STRUCTURES[structure];
  const steps = tile.type === TerrainType.Hill ? tile.elevation : 0;
  const bridge = tile.type === TerrainType.River ? (spec.bridgeCost ?? 0) : 0;
  return spec.cost + spec.slopeCostPerStep * steps + bridge;
}

/**
 * Terrain/occupancy/budget check. `budgetLeft` is optional so callers that
 * move an already-paid structure can skip the budget test.
 */
export function canPlace(
  structure: StructureType,
  tile: Tile | undefined,
  occupied: boolean,
  budgetLeft = Infinity,
): PlacementVerdict {
  if (!tile) return { ok: false, reason: 'Outside the region' };
  if (occupied) return { ok: false, reason: 'Tile already built' };
  const spec = STRUCTURES[structure];
  if (!spec.allowed.includes(tile.type)) {
    return { ok: false, reason: TERRAIN_REASON[tile.type] ?? `No ${spec.noun} on ${tile.type}` };
  }
  if (tile.elevation > spec.maxElevation) {
    return {
      ok: false,
      reason:
        structure === StructureType.Residential
          ? 'Steep hillside: erosion and wildfire risk - homes need flat land or a gentle slope'
          : `Slope too steep for ${spec.noun}`,
    };
  }
  const cost = constructionCost(structure, tile);
  if (cost > budgetLeft) {
    return { ok: false, reason: `Over budget: needs ${cost}, ${budgetLeft} left` };
  }

  const warnings: string[] = [];
  if (tile.type === TerrainType.Farmland && spec.farmlandPenalty < 0) {
    warnings.push('Uses fertile farmland');
  }
  if (tile.type === TerrainType.Hill && spec.slopeCostPerStep > 0) {
    warnings.push(`Hillside: +${spec.slopeCostPerStep * tile.elevation} cost`);
  }
  if (tile.type === TerrainType.River) warnings.push(`Bridge: +${spec.bridgeCost ?? 0} cost`);
  if (structure === StructureType.Wind && tile.elevation >= BALANCE.windRidgeElevation) {
    warnings.push(`Windy ridge: +${BALANCE.windRidgeBonus} energy`);
  }
  return warnings.length ? { ok: true, cost, warning: warnings.join(', ') } : { ok: true, cost };
}
