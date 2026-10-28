/**
 * Deterministic generator for the fictional "Costa Verde" coastal region.
 * Pure function of the grid coordinates — no randomness, no DOM, no Three.js —
 * so the same map is produced in tests, the runtime, and the editor.
 */
import { GRID_COLS, GRID_ROWS, TerrainType } from '../config/scenario.js';

export interface Tile {
  col: number;
  row: number;
  type: TerrainType;
  /** Integer elevation steps above the plain (0 = flat). */
  elevation: number;
}

export type TerrainMap = readonly Tile[];

/** Row index (fractional) where the sea ends for a given column. */
function coastline(col: number): number {
  return 1.4 + 0.9 * Math.sin(col * 0.55 + 0.6);
}

/** Column the river occupies on a given row (meanders toward the sea). */
function riverCol(row: number): number {
  return row >= 6 ? 8 : 7;
}

export function classifyTile(col: number, row: number): Tile {
  const coast = coastline(col);
  if (row < coast) return { col, row, type: TerrainType.Sea, elevation: 0 };
  if (row < coast + 1) return { col, row, type: TerrainType.Beach, elevation: 0 };
  if (col === riverCol(row)) return { col, row, type: TerrainType.River, elevation: 0 };

  // Low hills in the south-east corner; elevation grows toward the corner.
  if (col >= 10 && row >= 5) {
    const steep = (col - 10) + (row - 5);
    return { col, row, type: TerrainType.Hill, elevation: Math.min(3, 1 + Math.floor(steep / 3)) };
  }
  // Protected natural vegetation (pine forest) in the south-west.
  if (col <= 2 && row >= 5) return { col, row, type: TerrainType.Protected, elevation: 0 };
  // Compact existing town just behind the beach.
  if (col >= 3 && col <= 5 && row >= 3 && row <= 4) {
    return { col, row, type: TerrainType.Town, elevation: 0 };
  }
  // Fertile agricultural plain between the town and the hills.
  if (col >= 3 && col <= 9 && row >= 5) return { col, row, type: TerrainType.Farmland, elevation: 0 };
  return { col, row, type: TerrainType.Plain, elevation: 0 };
}

export function generateTerrain(): TerrainMap {
  const tiles: Tile[] = [];
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) tiles.push(classifyTile(col, row));
  }
  return tiles;
}

export function tileAt(map: TerrainMap, col: number, row: number): Tile | undefined {
  if (col < 0 || row < 0 || col >= GRID_COLS || row >= GRID_ROWS) return undefined;
  return map[row * GRID_COLS + col];
}
