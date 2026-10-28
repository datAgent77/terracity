/**
 * Miniature read-only diorama of a plan in a given year, for the side-by-side
 * Plan A / Plan B comparison. One instanced mesh for terrain, one for blocks.
 */
import {
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
} from '@iwsdk/core';
import { TILE_SIZE, TerrainType, type StructureType } from '../config/scenario.js';
import type { Placement } from '../simulation/metrics.js';
import type { YearMetrics } from '../simulation/projection.js';
import { tileCenter } from './board-coords.js';
import { tileColor, tileTopY } from './board-mesh.js';
import { tileAt, type TerrainMap } from './terrain-map.js';

const BLOCK: Record<StructureType | 'sprawl', { color: string; h: number; w: number }> = {
  residential: { color: '#f3e6d0', h: 0.03, w: 0.8 },
  solar: { color: '#28508f', h: 0.01, w: 0.85 },
  wind: { color: '#ffffff', h: 0.08, w: 0.18 },
  park: { color: '#4fa64a', h: 0.02, w: 0.85 },
  road: { color: '#5d6066', h: 0.006, w: 0.9 },
  sprawl: { color: '#8d8a86', h: 0.025, w: 0.85 },
};

export function createMiniBoard(terrain: TerrainMap, plan: readonly Placement[], year: YearMetrics): Group {
  const g = new Group();
  const m = new Matrix4();
  const q = new Quaternion();
  const p = new Vector3();
  const s = new Vector3();

  const tiles = new InstancedMesh(
    new BoxGeometry(TILE_SIZE * 0.98, 1, TILE_SIZE * 0.98).translate(0, 0.5, 0),
    new MeshStandardMaterial({ roughness: 0.9 }),
    terrain.length,
  );
  const flooded = year.year === 2050;
  const sea = new Color('#2fa7b8');
  terrain.forEach((t, i) => {
    const { x, z } = tileCenter(t.col, t.row);
    m.compose(p.set(x, 0, z), q, s.set(1, Math.max(0.004, tileTopY(t)), 1));
    tiles.setMatrixAt(i, m);
    tiles.setColorAt(i, flooded && t.type === TerrainType.Beach ? sea : tileColor(t));
  });
  g.add(tiles);

  const items: Array<{ col: number; row: number; kind: StructureType | 'sprawl' }> = [
    ...plan.map((pl) => ({ col: pl.col, row: pl.row, kind: pl.type })),
    ...year.sprawlTiles.map((t) => ({ ...t, kind: 'sprawl' as const })),
  ];
  if (items.length) {
    const blocks = new InstancedMesh(
      new BoxGeometry(TILE_SIZE, 1, TILE_SIZE).translate(0, 0.5, 0),
      new MeshStandardMaterial({ roughness: 0.7 }),
      items.length,
    );
    const c = new Color();
    items.forEach((it, i) => {
      const spec = BLOCK[it.kind];
      const tile = tileAt(terrain, it.col, it.row)!;
      const { x, z } = tileCenter(it.col, it.row);
      const base = tile.type === TerrainType.River ? 0.02 : tileTopY(tile);
      m.compose(p.set(x, base, z), q, s.set(spec.w, spec.h, spec.w));
      blocks.setMatrixAt(i, m);
      blocks.setColorAt(i, c.set(spec.color));
    });
    g.add(blocks);
  }
  g.traverse((o) => {
    o.raycast = () => {};
  });
  return g;
}
