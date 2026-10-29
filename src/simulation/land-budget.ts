/**
 * Land budget for the horizontal-urbanism model (pure, informational).
 * It does NOT change scoring or win conditions; it makes the land trade-offs of
 * a plan explicit. Assumptions are documented in HORIZONTAL_URBANISM_DESIGN.md.
 */
import { BALANCE, TARGETS } from '../config/balance.js';
import { GRID_COLS, StructureType, TerrainType } from '../config/scenario.js';
import { STRUCTURES } from '../config/structures.js';
import type { TerrainMap } from '../world/terrain-map.js';
import { tileAt } from '../world/terrain-map.js';
import { computeMetrics, type Placement } from './metrics.js';
import { canPlace } from './placement.js';
import type { YearMetrics } from './projection.js';

export const LAND = {
  /** Illustrative real-world area of one board tile (1.5 km x 1.5 km). */
  tileKm2: 2.25,
  /** Average household size used to turn residents into homes. */
  personsPerHome: 2.8,
  /** Preferred garden-district parcel per detached villa (m²), within the 1,000–1,500 range. */
  villaParcelM2: 1250,
  /** Extra share of land for local streets, paths, parks and services. */
  streetsAndParksShare: 0.2,
  /** Homes within this many tiles (Manhattan) of the town centre count as served by its services. */
  serviceRadiusTiles: 3,
} as const;

export interface LandBudget {
  /** Homes clusters (garden districts) in the plan. */
  districts: number;
  /** Detached villas the planned districts represent. */
  villas: number;
  /** Land those villas need on preferred parcels incl. streets and parks (km²). */
  villaLandNeededKm2: number;
  /** Land the planned districts occupy (km²). */
  districtLandKm2: number;
  /** True when the preferred parcels fit the land given to the districts. */
  villaParcelsFit: boolean;
  /** Land under any structure or unplanned sprawl (km²). */
  landConsumedKm2: number;
  /** Share of the region's fertile farmland still in agriculture (0..100). */
  farmlandKeptPct: number;
  /** Share of homes connected by road (0..100; 100 when there are none). */
  roadAccessPct: number;
  /** Share of connected homes within reach of the town's services (0..100). */
  serviceCoveragePct: number;
  /** Infrastructure spend in the year (credits incl. sea defences). */
  infrastructureCost: number;
}

const key = (c: number, r: number) => r * GRID_COLS + c;

export function landBudget(terrain: TerrainMap, plan: readonly Placement[], projected: YearMetrics): LandBudget {
  const homes = plan.filter((p) => p.type === StructureType.Residential);
  const served = computeMetrics(terrain, plan).servedIds;
  const villas = Math.round((homes.length * STRUCTURES.residential.population) / LAND.personsPerHome);
  const villaLandNeededKm2 = (villas * LAND.villaParcelM2 * (1 + LAND.streetsAndParksShare)) / 1e6;
  const districtLandKm2 = homes.length * LAND.tileKm2;

  const used = new Set([...plan.map((p) => key(p.col, p.row)), ...projected.sprawlTiles.map((t) => key(t.col, t.row))]);
  const farmland = terrain.filter((t) => t.type === TerrainType.Farmland);
  const farmUsed = farmland.filter((t) => used.has(key(t.col, t.row))).length;

  const town = terrain.filter((t) => t.type === TerrainType.Town);
  const nearTown = (c: number, r: number) => town.some((t) => Math.abs(t.col - c) + Math.abs(t.row - r) <= LAND.serviceRadiusTiles);
  const servedHomes = homes.filter((h) => served.has(h.id));

  return {
    districts: homes.length,
    villas,
    villaLandNeededKm2: +villaLandNeededKm2.toFixed(2),
    districtLandKm2: +districtLandKm2.toFixed(2),
    villaParcelsFit: villaLandNeededKm2 <= districtLandKm2 + 1e-9,
    landConsumedKm2: +(used.size * LAND.tileKm2).toFixed(2),
    farmlandKeptPct: Math.round((100 * (farmland.length - farmUsed)) / farmland.length),
    roadAccessPct: homes.length ? Math.round((100 * servedHomes.length) / homes.length) : 100,
    serviceCoveragePct: servedHomes.length ? Math.round((100 * servedHomes.filter((h) => nearTown(h.col, h.row)).length) / servedHomes.length) : 100,
    infrastructureCost: BALANCE.startBudget - projected.budgetLeft,
  };
}

/**
 * Can the 2050 housing goal be met in garden districts without touching
 * farmland, steep hills or protected land? (Scenario-level land check.)
 */
export function goalLandCheck(terrain: TerrainMap): { districtsNeeded: number; suitableTiles: number; feasible: boolean } {
  const districtsNeeded = Math.ceil((TARGETS.population - BALANCE.basePopulation) / STRUCTURES.residential.population);
  const suitableTiles = terrain.filter(
    (t) => t.type !== TerrainType.Farmland && canPlace(StructureType.Residential, tileAt(terrain, t.col, t.row), false).ok,
  ).length;
  return { districtsNeeded, suitableTiles, feasible: suitableTiles >= districtsNeeded };
}
