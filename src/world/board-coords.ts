/** Pure conversions between grid coordinates and board-local metres. */
import {
  ELEVATION_STEP,
  GRID_COLS,
  GRID_ROWS,
  TILE_BASE_HEIGHT,
  TILE_SIZE,
  TerrainType,
} from '../config/scenario.js';
import type { Tile } from './terrain-map.js';

/** Height of the water surface above the board base (metres). */
export const WATER_LEVEL = TILE_BASE_HEIGHT * 0.55;

/** Top surface height of a tile: structures and highlights sit here. */
export function tileTopY(tile: Tile): number {
  if (tile.type === TerrainType.Sea || tile.type === TerrainType.River) return WATER_LEVEL;
  return TILE_BASE_HEIGHT + tile.elevation * ELEVATION_STEP;
}

/** Board-local x/z of a tile centre (board origin = board centre). */
export function tileCenter(col: number, row: number): { x: number; z: number } {
  return {
    x: (col - (GRID_COLS - 1) / 2) * TILE_SIZE,
    z: (row - (GRID_ROWS - 1) / 2) * TILE_SIZE,
  };
}

/** Nearest tile for a board-local x/z, or null when off the board. */
export function localToTile(x: number, z: number): { col: number; row: number } | null {
  const col = Math.round(x / TILE_SIZE + (GRID_COLS - 1) / 2);
  const row = Math.round(z / TILE_SIZE + (GRID_ROWS - 1) / 2);
  if (col < 0 || row < 0 || col >= GRID_COLS || row >= GRID_ROWS) return null;
  return { col: col + 0, row: row + 0 }; // normalise -0
}
