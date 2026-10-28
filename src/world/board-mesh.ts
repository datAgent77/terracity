/**
 * Procedural low-poly diorama: wooden table slab, terrain tiles, sea surface,
 * pine forest on protected land, and the existing white-stone town.
 */
import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from '@iwsdk/core';
import {
  ELEVATION_STEP,
  GRID_COLS,
  GRID_ROWS,
  TILE_BASE_HEIGHT,
  TILE_SIZE,
  TerrainType,
} from '../config/scenario.js';
import { tileCenter } from './board-coords.js';
import type { TerrainMap, Tile } from './terrain-map.js';

export const TERRAIN_COLORS: Record<TerrainType, string> = {
  sea: '#1d8ea3',
  beach: '#f0dcaa',
  river: '#2fb6c8',
  farmland: '#94c04c',
  plain: '#b9d27e',
  hill: '#a9b46a',
  protected: '#4e8748',
  town: '#e6d9c3',
};

export const WATER_LEVEL = TILE_BASE_HEIGHT * 0.55;

export function tileTopY(tile: Tile): number {
  if (tile.type === TerrainType.Sea || tile.type === TerrainType.River) return WATER_LEVEL;
  return TILE_BASE_HEIGHT + tile.elevation * ELEVATION_STEP;
}

export function tileColor(tile: Tile): Color {
  const c = new Color(TERRAIN_COLORS[tile.type]);
  // Crop stripes on farmland; darker shading with altitude on hills.
  if (tile.type === TerrainType.Farmland && tile.col % 2 === 0) c.offsetHSL(0.02, 0, -0.05);
  if (tile.type === TerrainType.Hill) c.offsetHSL(-0.02, -0.05 * tile.elevation, 0.04 * tile.elevation);
  return c;
}

export function buildBoard(terrain: TerrainMap): Group {
  const board = new Group();
  board.name = 'terrain-board';

  const width = GRID_COLS * TILE_SIZE;
  const depth = GRID_ROWS * TILE_SIZE;

  // Wooden table slab under the diorama.
  const slab = new Mesh(
    new BoxGeometry(width + 0.06, 0.03, depth + 0.06),
    new MeshStandardMaterial({ color: '#8a6a4a', roughness: 0.8 }),
  );
  slab.position.y = -0.015;
  slab.name = 'table-slab';
  board.add(slab);

  // Terrain tiles as one instanced mesh (one draw call, per-tile colour).
  const tileGeo = new BoxGeometry(TILE_SIZE * 0.98, 1, TILE_SIZE * 0.98);
  tileGeo.translate(0, 0.5, 0);
  const tiles = new InstancedMesh(
    tileGeo,
    new MeshStandardMaterial({ roughness: 0.9, flatShading: true }),
    terrain.length,
  );
  tiles.name = 'terrain-tiles';
  const m = new Matrix4();
  const q = new Quaternion();
  const s = new Vector3();
  const p = new Vector3();
  terrain.forEach((tile, i) => {
    const { x, z } = tileCenter(tile.col, tile.row);
    const top = tile.type === TerrainType.Sea || tile.type === TerrainType.River ? 0.004 : tileTopY(tile);
    m.compose(p.set(x, 0, z), q, s.set(1, top, 1));
    tiles.setMatrixAt(i, m);
    tiles.setColorAt(i, tileColor(tile));
  });
  tiles.receiveShadow = true;
  board.add(tiles);

  // Translucent turquoise water sheet spanning sea + river tiles.
  const water = new Mesh(
    new PlaneGeometry(width, depth),
    new MeshStandardMaterial({
      color: '#46d2d8',
      transparent: true,
      opacity: 0.55,
      roughness: 0.15,
      metalness: 0.1,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_LEVEL;
  water.name = 'water-surface';
  board.add(water);

  board.add(buildForest(terrain));
  board.add(buildTown(terrain));
  return board;
}

function buildForest(terrain: TerrainMap): Group {
  const forest = new Group();
  forest.name = 'protected-forest';
  const trunk = new CylinderGeometry(0.002, 0.003, 0.01, 5);
  trunk.translate(0, 0.005, 0);
  const crown = new ConeGeometry(0.011, 0.03, 6);
  crown.translate(0, 0.024, 0);
  const trunkMat = new MeshStandardMaterial({ color: '#6b4a2f' });
  const crownMat = new MeshStandardMaterial({ color: '#2f6b3a', flatShading: true });
  for (const tile of terrain) {
    if (tile.type !== TerrainType.Protected) continue;
    const { x, z } = tileCenter(tile.col, tile.row);
    // Two pines per tile, deterministic offsets.
    for (const [dx, dz] of [
      [-0.012, -0.01],
      [0.013, 0.012],
    ]) {
      const t = new Mesh(trunk, trunkMat);
      const c = new Mesh(crown, crownMat);
      t.position.set(x + dx, tileTopY(tile), z + dz);
      c.position.copy(t.position);
      forest.add(t, c);
    }
  }
  return forest;
}

function buildTown(terrain: TerrainMap): Group {
  const town = new Group();
  town.name = 'existing-town';
  const wallMat = new MeshStandardMaterial({ color: '#f4efe4', roughness: 0.85 });
  const roofMat = new MeshStandardMaterial({ color: '#c8643c', flatShading: true });
  for (const tile of terrain) {
    if (tile.type !== TerrainType.Town) continue;
    const { x, z } = tileCenter(tile.col, tile.row);
    const house = createHouseCluster(wallMat, roofMat, (tile.col + tile.row) % 2);
    house.position.set(x, tileTopY(tile), z);
    town.add(house);
  }
  return town;
}

/** Three small Mediterranean houses on one tile footprint. */
export function createHouseCluster(
  wallMat: MeshStandardMaterial,
  roofMat: MeshStandardMaterial,
  variant = 0,
): Group {
  const cluster = new Group();
  const spots: Array<[number, number, number]> =
    variant === 0
      ? [
          [-0.012, -0.01, 0.018],
          [0.013, -0.008, 0.014],
          [0, 0.013, 0.022],
        ]
      : [
          [-0.013, 0.01, 0.02],
          [0.012, 0.012, 0.016],
          [0.002, -0.013, 0.014],
        ];
  for (const [hx, hz, h] of spots) {
    const wall = new Mesh(new BoxGeometry(0.016, h, 0.016), wallMat);
    wall.position.set(hx, h / 2, hz);
    wall.castShadow = true;
    const roof = new Mesh(new ConeGeometry(0.0125, 0.008, 4), roofMat);
    roof.rotation.y = Math.PI / 4;
    roof.position.set(hx, h + 0.004, hz);
    cluster.add(wall, roof);
  }
  return cluster;
}
