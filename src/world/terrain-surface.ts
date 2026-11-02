/**
 * The land as ONE continuous, softly shaped surface (premium stylized look),
 * replacing the square tile columns. The logical grid is unchanged: every
 * tile's inner 80 % is a flat plateau at exactly `tileTopY(tile)` (structures,
 * decoration and picking are unaffected); tile borders blend with a smooth
 * step, so terraces become rounded banks; steep banks read as rock; beaches
 * slope down under the water; sea and river beds sit below the water surface.
 * Colours blend the same way (soft transitions, gentle noise).
 */
import { BufferAttribute, Color, Mesh, MeshStandardMaterial, PlaneGeometry, BufferGeometry, Float32BufferAttribute } from '@iwsdk/core';
import { GRID_COLS, GRID_ROWS, TILE_SIZE, TerrainType } from '../config/scenario.js';
import { tileTopY, WATER_LEVEL } from './board-coords.js';
import { tileColor } from './board-mesh.js';
import type { TerrainMap, Tile } from './terrain-map.js';

const BLEND = 0.12; // half-width of the border band, in tiles (flat inner ~76 %)
const ROCK = new Color('#9c8f7a');
const WET_SAND = new Color('#c9b78e');
const SEABED = new Color('#3f8f9a');

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Ground height of a tile's plateau (board-local metres). */
export function plateauHeight(t: Tile): number {
  return t.type === TerrainType.Sea || t.type === TerrainType.River ? WATER_LEVEL - 0.009 : tileTopY(t);
}

function noise(x: number, z: number): number {
  const s = Math.sin(x * 157.3 + z * 91.7) * 0.5 + Math.sin(x * 61.1 - z * 213.9) * 0.3 + Math.sin(x * 431 + z * 377) * 0.2;
  return s; // -1..1, smooth enough at this scale
}

export function buildTerrainSurface(
  terrain: TerrainMap,
  tint?: (tile: Tile, color: Color) => void,
  perTile = 6,
): [Mesh, Mesh] {
  const W = GRID_COLS * TILE_SIZE;
  const D = GRID_ROWS * TILE_SIZE;
  const nx = GRID_COLS * perTile;
  const nz = GRID_ROWS * perTile;
  const geo = new PlaneGeometry(W, D, nx, nz).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position as BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  // Per-tile height and colour.
  const H: number[] = [];
  const C: Color[] = [];
  for (const t of terrain) {
    H[t.row * GRID_COLS + t.col] = plateauHeight(t);
    const c = tileColor(t, terrain);
    tint?.(t, c);
    C[t.row * GRID_COLS + t.col] = c;
  }
  const at = (c: number, r: number) => {
    const cc = Math.max(0, Math.min(GRID_COLS - 1, c));
    const rr = Math.max(0, Math.min(GRID_ROWS - 1, r));
    return cc + rr * GRID_COLS;
  };
  const col = new Color();
  const tmp = new Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const u = x / TILE_SIZE + (GRID_COLS - 1) / 2;
    const v = z / TILE_SIZE + (GRID_ROWS - 1) / 2;
    const c0 = Math.floor(u);
    const r0 = Math.floor(v);
    const gx = smooth(0.5 - BLEND, 0.5 + BLEND, u - c0);
    const gz = smooth(0.5 - BLEND, 0.5 + BLEND, v - r0);
    const w = [(1 - gx) * (1 - gz), gx * (1 - gz), (1 - gx) * gz, gx * gz];
    const ids = [at(c0, r0), at(c0 + 1, r0), at(c0, r0 + 1), at(c0 + 1, r0 + 1)];
    let h = 0;
    col.setRGB(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      h += w[k] * H[ids[k]];
      tmp.copy(C[ids[k]]).multiplyScalar(w[k]);
      col.add(tmp);
    }
    // Banks between different heights read as rock / earth.
    const hs = ids.map((id) => H[id]);
    const spread = Math.max(...hs) - Math.min(...hs);
    // 1 in the middle of a border band, 0 on the plateaus.
    const border = Math.max(4 * gx * (1 - gx), 4 * gz * (1 - gz));
    const bank = Math.min(1, spread / 0.02) * border;
    if (h > WATER_LEVEL) col.lerp(ROCK, Math.min(0.7, bank * 0.8));
    // Shore: wet sand just around the waterline, sea bed below it.
    if (h < WATER_LEVEL + 0.002) col.lerp(WET_SAND, 0.6);
    if (h < WATER_LEVEL - 0.002) col.lerp(SEABED, Math.min(1, (WATER_LEVEL - h) / 0.007));
    // Gentle painterly variation.
    const n = noise(x, z);
    col.offsetHSL(0, 0, n * 0.025);
    pos.setY(i, h + (h > WATER_LEVEL + 0.002 ? n * 0.0004 * (1 - bank) : 0));
    colors.set([col.r, col.g, col.b], i * 3);
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const surface = new Mesh(geo, new MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }));
  surface.name = 'terrain-tiles'; // FutureSystem tints this material as the land dries
  surface.receiveShadow = true;
  surface.castShadow = true;

  // Skirt: earth walls from the surface edge down to the board base.
  const skirtPos: number[] = [];
  const skirtCol: number[] = [];
  const earthTop = new Color('#8a6a4a');
  const earthBottom = new Color('#5a412c');
  const edge = (pts: Array<[number, number, number]>) => {
    for (let k = 0; k < pts.length - 1; k++) {
      const [x0, y0, z0] = pts[k];
      const [x1, y1, z1] = pts[k + 1];
      const quad = [[x0, y0, z0], [x1, y1, z1], [x1, -0.002, z1], [x0, y0, z0], [x1, -0.002, z1], [x0, -0.002, z0]];
      for (const [px, py, pz] of quad) {
        skirtPos.push(px, py, pz);
        const c = py > 0 ? earthTop : earthBottom;
        skirtCol.push(c.r, c.g, c.b);
      }
    }
  };
  const vtx = (ix: number, iz: number): [number, number, number] => {
    const i = iz * (nx + 1) + ix;
    return [pos.getX(i), pos.getY(i), pos.getZ(i)];
  };
  edge(Array.from({ length: nx + 1 }, (_, ix) => vtx(ix, nz))); // front (+z)
  edge(Array.from({ length: nx + 1 }, (_, ix) => vtx(nx - ix, 0))); // back
  edge(Array.from({ length: nz + 1 }, (_, iz) => vtx(0, iz))); // left
  edge(Array.from({ length: nz + 1 }, (_, iz) => vtx(nx, nz - iz))); // right
  const sg = new BufferGeometry();
  sg.setAttribute('position', new Float32BufferAttribute(skirtPos, 3));
  sg.setAttribute('color', new Float32BufferAttribute(skirtCol, 3));
  sg.computeVertexNormals();
  const skirt = new Mesh(sg, new MeshStandardMaterial({ vertexColors: true, roughness: 1, side: 2 }));
  skirt.name = 'terrain-columns';
  skirt.receiveShadow = true;
  return [skirt, surface];
}
