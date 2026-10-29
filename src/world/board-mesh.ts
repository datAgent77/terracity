/**
 * The Mediterranean diorama: a layered earth base in a wooden frame, seamless
 * terrain tiles (coloured tops, earth-cut sides), a depth-graded sea, the old
 * town with a bell tower, and the decoration layer (fields, forest, shore).
 *
 * The logical grid is unchanged: every tile keeps its centre and top height
 * (`tileTopY`), so placement, snapping and the simulation are unaffected.
 */
import {
  BoxGeometry,
  BufferAttribute,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from '@iwsdk/core';
import { GRID_COLS, GRID_ROWS, TILE_SIZE, TerrainType } from '../config/scenario.js';
import { tileCenter, tileTopY, WATER_LEVEL } from './board-coords.js';
import { createBellTower, createHomes, HOME_VARIANTS } from './houses.js';
import { mergeStatic } from './merge.js';
import { block, COLORS } from './palette.js';
import { hashInts, rng } from './rand.js';
import { decorPlan, TerrainDecor } from './terrain-decor.js';
import type { TerrainMap, Tile } from './terrain-map.js';

export { tileTopY, WATER_LEVEL } from './board-coords.js';

/** Base colours of each terrain's top surface. */
export const TERRAIN_COLORS: Record<TerrainType, string> = {
  sea: '#2a7fa6',
  beach: '#ecd9a6',
  river: '#3aa5b8',
  farmland: '#a7b862',
  plain: '#9cc76a',
  hill: '#b5b36f',
  protected: '#5c8f4a',
  town: '#e3d6bd',
};

/** Distance (in tiles) from a tile to the nearest land tile, for water depth. */
function landDistance(terrain: TerrainMap, col: number, row: number): number {
  let best = Infinity;
  for (const t of terrain) {
    if (t.type === TerrainType.Sea || t.type === TerrainType.River) continue;
    best = Math.min(best, Math.hypot(t.col - col, t.row - row));
  }
  return best;
}

export function tileColor(tile: Tile, terrain?: TerrainMap): Color {
  const c = new Color(TERRAIN_COLORS[tile.type]);
  const r = rng(hashInts(tile.col, tile.row, 3));
  // Gentle per-tile patchwork so large areas never look like flat paint.
  c.offsetHSL((r() - 0.5) * 0.015, (r() - 0.5) * 0.06, (r() - 0.5) * 0.05);
  if (tile.type === TerrainType.Hill) c.offsetHSL(0.01, -0.04 * tile.elevation, 0.03 * tile.elevation);
  if (tile.type === TerrainType.Sea && terrain) {
    // Shallow sea floor near the coast, deep blue offshore.
    const d = Math.min(1, (landDistance(terrain, tile.col, tile.row) - 1) / 2.5);
    c.set('#8fd3c5').lerp(new Color('#1d5f8c'), Math.max(0, d));
  }
  return c;
}

/** Layered earth base in a wooden frame (one merged mesh). */
export function buildBase(): Group {
  const width = GRID_COLS * TILE_SIZE;
  const depth = GRID_ROWS * TILE_SIZE;
  const base = new Group();
  base.add(block(width + 0.004, 0.012, depth + 0.004, COLORS.earthDark, 0, -0.03, 0));
  base.add(block(width + 0.004, 0.018, depth + 0.004, COLORS.earth, 0, -0.018, 0));
  const rim = 0.014;
  base.add(block(width + 2 * rim, 0.034, rim, COLORS.wood, 0, -0.032, -(depth + rim) / 2));
  base.add(block(width + 2 * rim, 0.034, rim, COLORS.wood, 0, -0.032, (depth + rim) / 2));
  base.add(block(rim, 0.034, depth, COLORS.wood, -(width + rim) / 2, -0.032, 0));
  base.add(block(rim, 0.034, depth, COLORS.wood, (width + rim) / 2, -0.032, 0));
  base.name = 'table-slab';
  return mergeStatic(base);
}

/**
 * Seamless terrain: earth-coloured columns + a coloured cap on each tile.
 * `tint` may adjust a tile's cap colour (used by the 2050 mini dioramas).
 */
export function buildTerrainTiles(
  terrain: TerrainMap,
  tint?: (tile: Tile, color: Color) => void,
): [InstancedMesh, InstancedMesh] {
  const m = new Matrix4();
  const q = new Quaternion();
  const s = new Vector3();
  const p = new Vector3();
  const columnGeo = new BoxGeometry(TILE_SIZE, 1, TILE_SIZE).translate(0, 0.5, 0);
  const columns = new InstancedMesh(columnGeo, new MeshStandardMaterial({ roughness: 0.95 }), terrain.length);
  columns.name = 'terrain-columns';
  const capGeo = new BoxGeometry(TILE_SIZE, 0.002, TILE_SIZE).translate(0, -0.001, 0);
  const caps = new InstancedMesh(capGeo, new MeshStandardMaterial({ roughness: 0.92 }), terrain.length);
  caps.name = 'terrain-tiles'; // FutureSystem tints this material as the land dries
  const earth = new Color();
  terrain.forEach((tile, i) => {
    const { x, z } = tileCenter(tile.col, tile.row);
    const water = tile.type === TerrainType.Sea || tile.type === TerrainType.River;
    const top = water ? 0.004 : tileTopY(tile);
    m.compose(p.set(x, 0, z), q, s.set(1, top, 1));
    columns.setMatrixAt(i, m);
    columns.setColorAt(i, earth.set(water ? '#b9a27a' : COLORS.earth).offsetHSL(0, 0, (tile.elevation - 1) * 0.03));
    m.compose(p.set(x, top, z), q, s.set(1, 1, 1));
    caps.setMatrixAt(i, m);
    const c = tileColor(tile, terrain);
    tint?.(tile, c);
    caps.setColorAt(i, c);
  });
  columns.receiveShadow = caps.receiveShadow = true;
  return [columns, caps];
}

/** Sea and river: one translucent sheet, turquoise shallows to deep blue. */
export function buildWater(terrain: TerrainMap): Mesh {
  const width = GRID_COLS * TILE_SIZE;
  const depth = GRID_ROWS * TILE_SIZE;
  const waterGeo = new PlaneGeometry(width, depth, GRID_COLS * 2, GRID_ROWS * 2);
  const shallow = new Color('#6fdad3');
  const deep = new Color('#2a7db0');
  const col = new Color();
  const pos = waterGeo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const tc = pos.getX(i) / TILE_SIZE + (GRID_COLS - 1) / 2;
    const tr = -pos.getY(i) / TILE_SIZE + (GRID_ROWS - 1) / 2; // plane is rotated -90° about X
    const d = Math.max(0, Math.min(1, (landDistance(terrain, tc, tr) - 0.6) / 2.6));
    col.copy(shallow).lerp(deep, d);
    colors.set([col.r, col.g, col.b], i * 3);
  }
  waterGeo.setAttribute('color', new BufferAttribute(colors, 3));
  const water = new Mesh(
    waterGeo,
    new MeshStandardMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      roughness: 0.12,
      metalness: 0.15,
      emissive: '#2ec4d0',
      emissiveIntensity: 0.1,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_LEVEL;
  water.name = 'water-surface';
  water.raycast = () => {};
  return water;
}

export function buildBoard(terrain: TerrainMap): Group {
  const board = new Group();
  board.name = 'terrain-board';
  board.add(buildBase());
  board.add(...buildTerrainTiles(terrain));
  board.add(buildWater(terrain));
  board.add(mergeStatic(buildTown(terrain)));
  const decor = new TerrainDecor(decorPlan(terrain));
  board.add(decor.group);
  board.userData.decor = decor;
  return board;
}

/** Decoration controller attached by `buildBoard`. */
export function boardDecor(board: { userData: Record<string, unknown> }): TerrainDecor | undefined {
  return board.userData.decor as TerrainDecor | undefined;
}

export function buildTown(terrain: TerrainMap): Group {
  const town = new Group();
  town.name = 'existing-town';
  const tiles = terrain.filter((t) => t.type === TerrainType.Town);
  tiles.forEach((tile, i) => {
    const { x, z } = tileCenter(tile.col, tile.row);
    const y = tileTopY(tile);
    // The old town square with its bell tower sits on the middle tile.
    if (i === Math.floor(tiles.length / 2)) {
      const sq = new Group();
      sq.add(block(TILE_SIZE * 0.92, 0.0008, TILE_SIZE * 0.92, COLORS.stone, 0, 0, 0));
      const tower = createBellTower();
      tower.position.set(-0.012, 0, -0.01);
      sq.add(tower);
      const homes = createHomes(1, hashInts(tile.col, tile.row));
      homes.scale.setScalar(0.62);
      homes.position.set(0.006, 0, 0.014);
      sq.add(homes);
      sq.position.set(x, y, z);
      town.add(sq);
      return;
    }
    const homes = createHomes(hashInts(tile.col, tile.row, 11) % HOME_VARIANTS, hashInts(tile.col, tile.row));
    homes.position.set(x, y, z);
    town.add(homes);
  });
  return town;
}
