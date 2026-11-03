/**
 * Reality Seam (COMPETITION milestone C) — PURE; tests/unit/reality-seam.test.ts.
 *
 * The two futures lie on the table at the same place; a boundary across the
 * board shows Future A (your plan) on its left and Future B on its right.
 * The seam position `u` runs 0..1 across the board's width (west → east).
 * What the seam reveals comes only from the two projections: the column
 * under the seam is compared tile by tile (structure only in one future,
 * unplanned sprawl only in one future).
 */
import { GRID_COLS, GRID_ROWS, StructureType, TILE_SIZE } from '../config/scenario.js';
import type { Year } from '../config/projection.js';
import type { Placement } from '../simulation/metrics.js';
import { projectYear } from '../simulation/projection.js';
import type { TerrainMap } from '../world/terrain-map.js';

export const SEAM_MIN = 0.03;
export const SEAM_MAX = 0.97;
/** Board width in board-local metres (tile centres span (GRID_COLS - 1) tiles). */
export const BOARD_SPAN = GRID_COLS * TILE_SIZE;

export const clampSeam = (u: number) => (Number.isFinite(u) ? Math.min(SEAM_MAX, Math.max(SEAM_MIN, u)) : 0.5);

/** Board-local x (0 at the board centre) -> seam position. */
export function seamFromLocalX(x: number): number {
  return clampSeam(x / BOARD_SPAN + 0.5);
}

/** Seam position -> board-local x. */
export function localXFromSeam(u: number): number {
  return (clampSeam(u) - 0.5) * BOARD_SPAN;
}

/** Board column whose tiles the seam crosses. */
export function seamColumn(u: number): number {
  return Math.min(GRID_COLS - 1, Math.max(0, Math.floor(clampSeam(u) * GRID_COLS)));
}

/** One keyboard / button step: one tile. */
export function stepSeam(u: number, dir: -1 | 1): number {
  return clampSeam((seamColumn(u) + 0.5 + dir) / GRID_COLS);
}

export interface SeamDifference {
  row: number;
  a: string;
  b: string;
}

export interface SeamReport {
  column: number;
  year: Year;
  differences: SeamDifference[];
  /** One short, factual line for the seam label. */
  text: string;
  /** The same as two lines (one per future), or one line when nothing differs. */
  lines: string[];
}

const NAMES: Record<StructureType, string> = {
  [StructureType.Residential]: 'homes',
  [StructureType.Road]: 'road',
  [StructureType.Wind]: 'wind',
  [StructureType.Solar]: 'solar',
  [StructureType.Park]: 'park',
};

/** What stands on each tile of a column in one future. */
function columnContents(terrain: TerrainMap, plan: readonly Placement[], year: Year, col: number): string[] {
  const sprawl = new Set(projectYear(terrain, plan, year).sprawlTiles.map((t) => `${t.col},${t.row}`));
  return Array.from({ length: GRID_ROWS }, (_, row) => {
    const p = plan.find((q) => q.col === col && q.row === row);
    if (p) return NAMES[p.type];
    if (sprawl.has(`${col},${row}`)) return 'unplanned houses';
    return '';
  });
}

export function seamReport(
  terrain: TerrainMap,
  planA: readonly Placement[],
  planB: readonly Placement[],
  year: Year,
  u: number,
  names: { A: string; B: string },
): SeamReport {
  const column = seamColumn(u);
  const a = columnContents(terrain, planA, year, column);
  const b = columnContents(terrain, planB, year, column);
  const differences: SeamDifference[] = [];
  for (let row = 0; row < GRID_ROWS; row++) if (a[row] !== b[row]) differences.push({ row, a: a[row] || 'open land', b: b[row] || 'open land' });
  const summarise = (side: 'a' | 'b') => {
    const counts = new Map<string, number>();
    for (const d of differences) counts.set(d[side], (counts.get(d[side]) ?? 0) + 1);
    return [...counts.entries()].map(([k, n]) => (n > 1 ? `${k} x${n}` : k)).join(', ');
  };
  const text = differences.length
    ? `Under the seam: ${names.A}: ${summarise('a')} | ${names.B}: ${summarise('b')}`
    : 'Under the seam: the same in both futures';
  const lines = differences.length ? [`A ${names.A}: ${summarise('a')}`, `B ${names.B}: ${summarise('b')}`] : ['Under the seam: the same in both futures'];
  return { column, year, differences, text, lines };
}
