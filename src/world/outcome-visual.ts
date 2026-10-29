/**
 * Result -> map highlights for the end of a session. PURE (unit-tested in
 * tests/unit/outcome-visual.test.ts) and driven only by the judged 2050
 * projection, so the board can never celebrate a failing plan:
 *
 *  - success  -> 'success' marks on what made it work: connected homes, parks,
 *                wind and solar (plus a celebration flag);
 *  - failure  -> for each MISSED target only, 'problem' marks where the cause is
 *                on the map and 'opportunity' marks where a fix could go.
 */
import { BALANCE } from '../config/balance.js';
import { GRID_COLS, StructureType, TerrainType } from '../config/scenario.js';
import { computeMetrics, type Placement } from '../simulation/metrics.js';
import type { TargetCheck, YearMetrics } from '../simulation/projection.js';
import { tileAt, type TerrainMap } from './terrain-map.js';

export type HighlightKind = 'success' | 'problem' | 'opportunity';

export interface Highlight {
  col: number;
  row: number;
  kind: HighlightKind;
  /** Which target this mark explains (or 'balanced' for success marks). */
  target: keyof TargetCheck | 'balanced';
  reason: string;
}

export interface OutcomeVisual {
  celebrate: boolean;
  highlights: Highlight[];
}

const MAX_OPPORTUNITIES = 3;

export function outcomeVisual(
  terrain: TerrainMap,
  plan: readonly Placement[],
  projected: YearMetrics,
  checks: TargetCheck,
): OutcomeVisual {
  const success = checks.population && checks.environment && checks.renewableCoverage && checks.budget;
  const marks: Highlight[] = [];
  const taken = new Set(plan.map((p) => p.row * GRID_COLS + p.col));
  const sprawl = new Set(projected.sprawlTiles.map((t) => t.row * GRID_COLS + t.col));
  const free = (col: number, row: number) => !taken.has(row * GRID_COLS + col) && !sprawl.has(row * GRID_COLS + col);

  if (success) {
    const served = computeMetrics(terrain, plan).servedIds;
    for (const p of plan) {
      const good =
        (p.type === StructureType.Residential && served.has(p.id)) ||
        p.type === StructureType.Park ||
        p.type === StructureType.Wind ||
        p.type === StructureType.Solar;
      if (good) marks.push({ col: p.col, row: p.row, kind: 'success', target: 'balanced', reason: p.type });
    }
    return { celebrate: true, highlights: marks };
  }

  const metrics = computeMetrics(terrain, plan);
  if (!checks.population) {
    for (const p of plan) {
      if (p.type === StructureType.Residential && !metrics.servedIds.has(p.id)) {
        marks.push({ col: p.col, row: p.row, kind: 'problem', target: 'population', reason: 'homes without road access' });
      }
    }
    for (const t of projected.sprawlTiles) {
      marks.push({ ...t, kind: 'problem', target: 'population', reason: 'newcomers in unplanned sprawl' });
    }
  }
  if (!checks.environment) {
    for (const p of plan) {
      if (tileAt(terrain, p.col, p.row)?.type === TerrainType.Farmland) {
        marks.push({ col: p.col, row: p.row, kind: 'problem', target: 'environment', reason: 'built on fertile farmland' });
      }
    }
    if (checks.population) {
      for (const t of projected.sprawlTiles) marks.push({ ...t, kind: 'problem', target: 'environment', reason: 'sprawl' });
    }
  }
  if (!checks.renewableCoverage) {
    // Where more wind would help most: free windy-ridge tiles.
    const ridge = terrain.filter((t) => t.type === TerrainType.Hill && t.elevation >= BALANCE.windRidgeElevation && free(t.col, t.row));
    for (const t of ridge.slice(0, MAX_OPPORTUNITIES)) {
      marks.push({ col: t.col, row: t.row, kind: 'opportunity', target: 'renewableCoverage', reason: 'windy ridge: room for a turbine' });
    }
  }
  if (!checks.budget) {
    for (const id of projected.floodRiskIds) {
      const p = plan.find((x) => x.id === id);
      if (p) marks.push({ col: p.col, row: p.row, kind: 'problem', target: 'budget', reason: 'needs sea defences' });
    }
    for (const p of plan) {
      const t = tileAt(terrain, p.col, p.row);
      if (t?.type === TerrainType.Hill || t?.type === TerrainType.River) {
        marks.push({ col: p.col, row: p.row, kind: 'problem', target: 'budget', reason: t.type === TerrainType.River ? 'bridge cost' : 'hillside cost' });
      }
    }
  }
  return { celebrate: false, highlights: marks };
}
