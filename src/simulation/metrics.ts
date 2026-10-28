/**
 * The four TerraCity metrics, computed from scratch from the terrain and the
 * current placements. Pure and deterministic: same plan in, same numbers out.
 * See SIMULATION_ASSUMPTIONS.md for the meaning of every rule.
 */
import { BALANCE } from '../config/balance.js';
import { GRID_COLS, StructureType, TerrainType } from '../config/scenario.js';
import { STRUCTURES } from '../config/structures.js';
import { tileAt, type TerrainMap } from '../world/terrain-map.js';
import { constructionCost } from './placement.js';

export interface Placement {
  id: string;
  type: StructureType;
  col: number;
  row: number;
  /** Quarter turns around Y (0-3). Cosmetic; stored so plans replay exactly. */
  rotation: number;
}

export interface Metrics {
  /** Residents with road access (existing town + connected homes). */
  population: number;
  /** Homes clusters without a road connection (their residents are not counted). */
  unservedHomes: number;
  /** Environmental health 0-100. */
  environment: number;
  budgetSpent: number;
  budgetLeft: number;
  /** Renewable energy units supplied. */
  renewableSupply: number;
  /** Energy units demanded by the served population. */
  energyDemand: number;
  /** Renewable share of demand, 0-100 (whole percent). */
  renewableCoverage: number;
  /** Farmland tiles converted to other uses. */
  farmlandLost: number;
  /** Ids of homes placements that are connected. */
  servedIds: ReadonlySet<string>;
}

const NEIGHBOURS: ReadonlyArray<[number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const key = (col: number, row: number) => row * GRID_COLS + col;

/** Homes are served when orthogonally adjacent to the town or to a road connected to it. */
export function servedHomes(terrain: TerrainMap, placements: readonly Placement[]): Set<string> {
  const roads = new Set<number>();
  for (const p of placements) if (p.type === StructureType.Road) roads.add(key(p.col, p.row));

  const isTown = (c: number, r: number) => tileAt(terrain, c, r)?.type === TerrainType.Town;
  const reached = new Set<number>();
  const queue: Array<[number, number]> = [];
  for (const p of placements) {
    if (p.type !== StructureType.Road) continue;
    if (NEIGHBOURS.some(([dc, dr]) => isTown(p.col + dc, p.row + dr))) {
      reached.add(key(p.col, p.row));
      queue.push([p.col, p.row]);
    }
  }
  while (queue.length) {
    const [c, r] = queue.shift()!;
    for (const [dc, dr] of NEIGHBOURS) {
      const k = key(c + dc, r + dr);
      if (roads.has(k) && !reached.has(k)) {
        reached.add(k);
        queue.push([c + dc, r + dr]);
      }
    }
  }

  const served = new Set<string>();
  for (const p of placements) {
    if (p.type !== StructureType.Residential) continue;
    const ok = NEIGHBOURS.some(
      ([dc, dr]) => isTown(p.col + dc, p.row + dr) || reached.has(key(p.col + dc, p.row + dr)),
    );
    if (ok) served.add(p.id);
  }
  return served;
}

function countAdjacent(
  placements: readonly Placement[],
  p: Placement,
  type: StructureType,
): number {
  return placements.filter(
    (o) => o.type === type && Math.abs(o.col - p.col) + Math.abs(o.row - p.row) === 1,
  ).length;
}

export function computeMetrics(terrain: TerrainMap, placements: readonly Placement[]): Metrics {
  const servedIds = servedHomes(terrain, placements);
  let population = BALANCE.basePopulation;
  let environment = BALANCE.baseEnvironment;
  let renewableSupply = BALANCE.baseRenewable;
  let budgetSpent = 0;
  let farmlandLost = 0;

  for (const p of placements) {
    const spec = STRUCTURES[p.type];
    const tile = tileAt(terrain, p.col, p.row)!;
    budgetSpent += constructionCost(p.type, tile);
    environment += spec.environment;
    if (tile.type === TerrainType.Farmland) {
      farmlandLost += 1;
      environment += spec.farmlandPenalty;
    }
    if (p.type === StructureType.Residential) {
      if (servedIds.has(p.id)) population += spec.population;
      environment += BALANCE.windNoisePenalty * countAdjacent(placements, p, StructureType.Wind);
    }
    if (p.type === StructureType.Park) {
      environment +=
        BALANCE.parkAdjacencyBonus * countAdjacent(placements, p, StructureType.Residential);
    }
    renewableSupply += spec.energy;
    if (p.type === StructureType.Wind && tile.elevation >= BALANCE.windRidgeElevation) {
      renewableSupply += BALANCE.windRidgeBonus;
    }
  }

  const energyDemand = (population / 1000) * BALANCE.demandPer1000;
  const renewableCoverage = Math.min(100, Math.round((renewableSupply / energyDemand) * 100));
  const homes = placements.filter((p) => p.type === StructureType.Residential).length;

  return {
    population,
    unservedHomes: homes - servedIds.size,
    environment: Math.max(0, Math.min(100, environment)),
    budgetSpent,
    budgetLeft: BALANCE.startBudget - budgetSpent,
    renewableSupply,
    energyDemand,
    renewableCoverage,
    farmlandLost,
    servedIds,
  };
}

export interface MetricDelta {
  population: number;
  environment: number;
  budgetLeft: number;
  renewableCoverage: number;
}

export function diffMetrics(before: Metrics, after: Metrics): MetricDelta {
  return {
    population: after.population - before.population,
    environment: after.environment - before.environment,
    budgetLeft: after.budgetLeft - before.budgetLeft,
    renewableCoverage: after.renewableCoverage - before.renewableCoverage,
  };
}

const signed = (n: number, unit = '') => `${n > 0 ? '+' : ''}${n.toLocaleString('en-US')}${unit}`;

/** Compact cause → consequence line, e.g. "+4,000 residents, -9 env, -12 budget". */
export function describeDelta(d: MetricDelta): string {
  const parts: string[] = [];
  if (d.population) parts.push(`${signed(d.population)} residents`);
  if (d.environment) parts.push(`${signed(d.environment)} env`);
  if (d.renewableCoverage) parts.push(`${signed(d.renewableCoverage, '%')} renewable`);
  if (d.budgetLeft) parts.push(`${signed(d.budgetLeft)} budget`);
  return parts.length ? parts.join(', ') : 'no metric change';
}
