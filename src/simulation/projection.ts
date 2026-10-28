/**
 * Future projection: how a plan built in 2026 plays out in 2035 and 2050.
 * Pure function of (terrain, plan, year); every effect is listed in `notes`
 * so the HUD can explain *why* a number changed.
 */
import { BALANCE, TARGETS } from '../config/balance.js';
import { PROJECTION, type Year } from '../config/projection.js';
import { GRID_COLS, StructureType, TerrainType } from '../config/scenario.js';
import { tileAt, type TerrainMap } from '../world/terrain-map.js';
import { computeMetrics, type Metrics, type Placement } from './metrics.js';

export interface YearMetrics {
  year: Year;
  /** Residents housed in planned, connected homes (incl. the town). */
  population: number;
  /** Residents who arrived but found no planned housing. */
  sprawlResidents: number;
  /** Tiles covered by unplanned sprawl, nearest to the town first. */
  sprawlTiles: ReadonlyArray<{ col: number; row: number }>;
  environment: number;
  budgetLeft: number;
  renewableCoverage: number;
  energyDemand: number;
  renewableSupply: number;
  /** Placements on low coastal tiles that need sea defences. */
  floodRiskIds: readonly string[];
  /** Human-readable causes of the change relative to 2026. */
  notes: string[];
}

export interface TargetCheck {
  population: boolean;
  environment: boolean;
  renewableCoverage: boolean;
  budget: boolean;
}

const NEIGHBOURS: ReadonlyArray<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** Low coastal tile: flat land touching beach or sea. */
export function isCoastalLowland(terrain: TerrainMap, col: number, row: number): boolean {
  const t = tileAt(terrain, col, row);
  if (!t || t.elevation > 0 || (t.type !== TerrainType.Plain && t.type !== TerrainType.Farmland)) {
    return false;
  }
  return NEIGHBOURS.some(([dc, dr]) => {
    const n = tileAt(terrain, col + dc, row + dr)?.type;
    return n === TerrainType.Beach || n === TerrainType.Sea;
  });
}

/** Where unplanned sprawl lands: free flat/gentle land, nearest the town first. */
export function sprawlTilesFor(
  terrain: TerrainMap,
  plan: readonly Placement[],
  count: number,
): Array<{ col: number; row: number }> {
  if (count <= 0) return [];
  const used = new Set(plan.map((p) => p.row * GRID_COLS + p.col));
  const centre = { col: 4, row: 3.5 }; // existing town
  const candidates = terrain
    .filter(
      (t) =>
        !used.has(t.row * GRID_COLS + t.col) &&
        (t.type === TerrainType.Plain ||
          t.type === TerrainType.Farmland ||
          (t.type === TerrainType.Hill && t.elevation <= 1)),
    )
    .map((t) => ({ col: t.col, row: t.row, d: Math.hypot(t.col - centre.col, t.row - centre.row) }))
    .sort((a, b) => a.d - b.d || a.row - b.row || a.col - b.col);
  return candidates.slice(0, count).map(({ col, row }) => ({ col, row }));
}

export function projectYear(
  terrain: TerrainMap,
  plan: readonly Placement[],
  year: Year,
  base: Metrics = computeMetrics(terrain, plan),
): YearMetrics {
  const t = PROJECTION.progress[year];
  const notes: string[] = [];

  const demand =
    BALANCE.basePopulation + t * (PROJECTION.housingDemand2050 - BALANCE.basePopulation);
  const sprawlResidents = Math.max(0, Math.round((demand - base.population) / 100) * 100);
  const sprawlTiles = sprawlTilesFor(
    terrain,
    plan,
    Math.ceil(sprawlResidents / PROJECTION.sprawlResidentsPerTile),
  );

  const parks = plan.filter((p) => p.type === StructureType.Park).length;
  const floodRiskIds = plan.filter((p) => isCoastalLowland(terrain, p.col, p.row)).map((p) => p.id);

  const sprawlEnv = Math.round((PROJECTION.sprawlEnvPer1000 * sprawlResidents) / 1000);
  const parkEnv = Math.round(PROJECTION.parkMaturity2050 * t * parks);
  const farmEnv = Math.round(PROJECTION.farmlandImport2050 * t * base.farmlandLost);
  const environment = Math.max(0, Math.min(100, base.environment + sprawlEnv + parkEnv + farmEnv));

  const defence = Math.round(PROJECTION.seaDefenceCost2050 * t * floodRiskIds.length);
  const budgetLeft = base.budgetLeft - defence;

  const perCapita = BALANCE.demandPer1000 * (1 + PROJECTION.demandGrowth2050 * t);
  const energyDemand = ((base.population + sprawlResidents) / 1000) * perCapita;
  const renewableCoverage = Math.min(100, Math.round((base.renewableSupply / energyDemand) * 100));

  if (t > 0) {
    if (sprawlResidents > 0) {
      notes.push(
        `${sprawlResidents.toLocaleString('en-US')} newcomers found no planned homes: sprawl ${sprawlEnv} env`,
      );
    }
    if (parkEnv) notes.push(`parks matured +${parkEnv} env`);
    if (farmEnv) notes.push(`lost farmland means food imports ${farmEnv} env`);
    if (defence) notes.push(`sea defences for ${floodRiskIds.length} coastal sites -${defence} budget`);
    notes.push(`electricity use per person +${Math.round(PROJECTION.demandGrowth2050 * t * 100)}%`);
  }

  return {
    year,
    population: base.population,
    sprawlResidents,
    sprawlTiles,
    environment,
    budgetLeft,
    renewableCoverage,
    energyDemand,
    renewableSupply: base.renewableSupply,
    floodRiskIds,
    notes,
  };
}

export function checkTargets(m: YearMetrics): TargetCheck {
  return {
    population: m.population >= TARGETS.population,
    environment: m.environment >= TARGETS.environment,
    renewableCoverage: m.renewableCoverage >= TARGETS.renewableCoverage,
    budget: m.budgetLeft >= TARGETS.minBudgetLeft,
  };
}

export const allMet = (c: TargetCheck) =>
  c.population && c.environment && c.renewableCoverage && c.budget;
