/**
 * Simulation -> visuals mapping for time travel. PURE: every visual parameter
 * shown for 2035 / 2050 is derived here from the projection of the current
 * plan, and nowhere else. See docs/VISUAL_STATE_MAPPING.md.
 *
 * Rules that must hold (unit-tested in tests/unit/visual-state.test.ts):
 *  - 2026 shows no sprawl, no sea rise and no flood warnings;
 *  - sprawl appears exactly on the projection's sprawl tiles, with density
 *    proportional to the residents it holds;
 *  - vegetation vigour falls monotonically with the projected environment, and
 *    only reaches "healthy" when the environment target is met;
 *  - the "balanced" look is used only when every target is met that year.
 */
import { TARGETS } from '../config/balance.js';
import { PROJECTION, type Year } from '../config/projection.js';
import { TerrainType } from '../config/scenario.js';
import type { Placement } from '../simulation/metrics.js';
import { allMet, checkTargets, type TargetCheck, type YearMetrics } from '../simulation/projection.js';
import { tileAt, type TerrainMap } from './terrain-map.js';

/** Environment at or below which vegetation is fully faded. */
export const ENV_BARREN = 30;
/** Environment of the untouched region (fully vibrant). */
export const ENV_PRISTINE = 72;
/** Strongest tint toward dry ochre, kept restrained. */
export const MAX_DRYNESS = 0.7;

export interface SprawlTile {
  col: number;
  row: number;
  /** Share of a full tile of unplanned settlement (0..1]. */
  fill: number;
  /** Number of informal buildings drawn (density). */
  buildings: number;
}

export interface FloodRisk {
  id: string;
  col: number;
  row: number;
  /** Directions (dc, dr) toward the beach/sea, where sea walls are drawn. */
  seaward: Array<[number, number]>;
}

export interface FutureVisualState {
  year: Year;
  /** Share of the 2026 -> 2050 change shown (0, 0.5, 1). */
  progress: number;
  sprawl: SprawlTile[];
  /** 0 = barren, 1 = vibrant (from the projected environment). */
  vigor: number;
  /** Tint of fields, forest and parks toward dry ochre (0..MAX_DRYNESS). */
  dryness: number;
  /** Stylised shoreline creep onto the beach (fraction of a beach tile). */
  seaRise: number;
  floodRisk: FloodRisk[];
  /** Renewable activity 0..1 (coverage / 100): panel glow, rotor speed. */
  renewableActivity: number;
  /** Park tree size multiplier (mirrors the park-maturity rule). */
  parkGrowth: number;
  /** Every target met in this year -> the balanced look. */
  balanced: boolean;
  /** Which targets are missed this year (for problem highlights). */
  missed: Array<keyof TargetCheck>;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function vigorFor(environment: number): number {
  return clamp01((environment - ENV_BARREN) / (ENV_PRISTINE - ENV_BARREN));
}

/** Vigour at the environment target: anything below reads as "not healthy". */
export const VIGOR_AT_TARGET = vigorFor(TARGETS.environment);

const DIRS: ReadonlyArray<[number, number]> = [
  [0, -1],
  [1, 0],
  [-1, 0],
  [0, 1],
];

export function futureVisualState(
  terrain: TerrainMap,
  plan: readonly Placement[],
  projected: YearMetrics,
): FutureVisualState {
  const progress = PROJECTION.progress[projected.year];
  const perTile = PROJECTION.sprawlResidentsPerTile;
  const sprawl = projected.sprawlTiles.map((t, i) => {
    const fill = clamp01((projected.sprawlResidents - i * perTile) / perTile);
    return { ...t, fill, buildings: 2 + Math.round(fill * 5) };
  });

  const floodRisk: FloodRisk[] =
    progress === 0
      ? []
      : projected.floodRiskIds.flatMap((id) => {
          const p = plan.find((x) => x.id === id);
          if (!p) return [];
          const seaward = DIRS.filter(([dc, dr]) => {
            const n = tileAt(terrain, p.col + dc, p.row + dr)?.type;
            return n === TerrainType.Beach || n === TerrainType.Sea;
          });
          return [{ id, col: p.col, row: p.row, seaward: seaward.map(([a, b]) => [a, b] as [number, number]) }];
        });

  const vigor = vigorFor(projected.environment);
  const checks = checkTargets(projected);
  return {
    year: projected.year,
    progress,
    sprawl,
    vigor,
    dryness: (1 - vigor) * MAX_DRYNESS,
    seaRise: progress,
    floodRisk,
    renewableActivity: clamp01(projected.renewableCoverage / 100),
    parkGrowth: 1 + 0.6 * progress * (PROJECTION.parkMaturity2050 / 2),
    balanced: allMet(checks),
    missed: (Object.keys(checks) as Array<keyof TargetCheck>).filter((k) => !checks[k]),
  };
}
