/**
 * Terrain decoration: crop rows, olive orchards, meadow tufts and flowers,
 * terrace walls and shrubs on hills, a mixed forest, shoreline foam and rocks.
 *
 * `decorPlan()` is a pure, deterministic function of the terrain (unit-tested);
 * `TerrainDecor` renders it as one InstancedMesh per kind and hides the
 * decoration of tiles that a structure occupies. Decoration never affects the
 * simulation: it is purely visual and bounded by its own tile.
 */
import {
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  BoxGeometry,
  Color,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
} from '@iwsdk/core';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GRID_COLS, TILE_SIZE, TerrainType } from '../config/scenario.js';
import { tileCenter, tileTopY } from './board-coords.js';
import { COLORS, PAINTED_FLAT, paint, pick } from './palette.js';

/** Decoration material (own instance so time travel can dry the vegetation). */
export const DECOR_MATERIAL = PAINTED_FLAT.clone();
import { hashInts, rng } from './rand.js';
import { tileAt, type TerrainMap } from './terrain-map.js';

export type DecorKind =
  | 'crop'
  | 'olive'
  | 'pine'
  | 'round'
  | 'cypress'
  | 'shrub'
  | 'tuft'
  | 'flower'
  | 'wall'
  | 'rock'
  | 'foam';

export interface DecorItem {
  kind: DecorKind;
  /** Index of the owning tile (row * GRID_COLS + col). */
  tile: number;
  x: number;
  y: number;
  z: number;
  rotY: number;
  /** Uniform scale, or [x, y, z]. */
  scale: number | [number, number, number];
  color: string;
}

const HALF = TILE_SIZE / 2;
const CROPS = [
  { p: 0.32, color: '#d8b545' }, // wheat
  { p: 0.5, color: '#c9a13a' }, // ripe barley
  { p: 0.66, color: '#5f9d3d' }, // vegetables
  { p: 0.78, color: '#9d88cf' }, // lavender
  { p: 1.01, color: 'orchard' },
] as const;

const SEA_NEIGHBOURS: ReadonlyArray<[number, number, number]> = [
  [0, -1, 0], // north edge
  [1, 0, Math.PI / 2],
  [-1, 0, Math.PI / 2],
  [0, 1, 0],
];

/** Pure decoration layout for the whole board (board-local metres). */
export function decorPlan(terrain: TerrainMap): DecorItem[] {
  const items: DecorItem[] = [];
  for (const t of terrain) {
    const idx = t.row * GRID_COLS + t.col;
    const { x, z } = tileCenter(t.col, t.row);
    const y = tileTopY(t);
    const r = rng(hashInts(t.col, t.row, 7));
    const jitter = (m: number) => (r() * 2 - 1) * m;
    const add = (kind: DecorKind, dx: number, dz: number, scale: DecorItem['scale'], color: string, rotY = r() * Math.PI * 2, yy = y) =>
      items.push({ kind, tile: idx, x: x + dx, y: yy, z: z + dz, rotY, scale, color });

    switch (t.type) {
      case TerrainType.Farmland: {
        const roll = r();
        const crop = CROPS.find((c) => roll < c.p)!.color;
        if (crop === 'orchard') {
          for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) add('olive', i * 0.018 + jitter(0.002), j * 0.018 + jitter(0.002), 0.85 + r() * 0.3, pick(COLORS.olive, r()));
          }
        } else {
          for (let k = -2; k <= 2; k++) add('crop', 0, k * 0.0105, 1, crop, 0);
        }
        break;
      }
      case TerrainType.Plain: {
        const tufts = 3 + Math.floor(r() * 3);
        for (let k = 0; k < tufts; k++) add('tuft', jitter(0.024), jitter(0.024), 0.7 + r() * 0.6, pick(COLORS.grass, r()));
        if (r() < 0.6) add('flower', jitter(0.022), jitter(0.022), 1, pick(COLORS.flowers, r()));
        if (r() < 0.35) add('shrub', jitter(0.02), jitter(0.02), 0.8 + r() * 0.4, pick(COLORS.leaf, r()));
        break;
      }
      case TerrainType.Hill: {
        if (t.elevation >= 2) {
          // Dry-stone terrace walls across the slope.
          add('wall', 0, -0.012, 1, COLORS.stone, 0);
          add('wall', 0, 0.012, 1, COLORS.stoneDark, 0);
        }
        const shrubs = 1 + Math.floor(r() * 3);
        for (let k = 0; k < shrubs; k++) add('shrub', jitter(0.022), jitter(0.022), 0.7 + r() * 0.5, pick(COLORS.olive, r()));
        if (r() < 0.3) add('cypress', jitter(0.018), jitter(0.018), 0.8 + r() * 0.4, COLORS.cypress);
        if (r() < 0.25) add('rock', jitter(0.02), jitter(0.02), 0.8 + r() * 0.5, COLORS.stoneDark);
        break;
      }
      case TerrainType.Protected: {
        const clearing = r() < 0.15;
        const n = clearing ? 2 : 4 + Math.floor(r() * 3);
        for (let k = 0; k < n; k++) {
          const roll = r();
          const kind: DecorKind = roll < 0.45 ? 'pine' : roll < 0.75 ? 'round' : 'cypress';
          const color = kind === 'pine' ? pick(COLORS.pine, r()) : kind === 'round' ? pick(COLORS.leaf, r()) : COLORS.cypress;
          add(kind, jitter(0.022), jitter(0.022), 0.75 + r() * 0.55, color);
        }
        if (r() < 0.7) add('shrub', jitter(0.022), jitter(0.022), 0.8, pick(COLORS.leaf, r()));
        if (clearing) add('flower', jitter(0.01), jitter(0.01), 1.2, pick(COLORS.flowers, r()));
        break;
      }
      case TerrainType.Beach: {
        for (const [dc, dr, rot] of SEA_NEIGHBOURS) {
          if (tileAt(terrain, t.col + dc, t.row + dr)?.type !== TerrainType.Sea) continue;
          // Foam line along the seaward edge, with the odd rock.
          add('foam', dc * HALF, dr * HALF, 1, '#f4fbfb', rot, tileTopY({ ...t, type: TerrainType.Sea }) + 0.0004);
          // Rocks scatter along the edge (not across it), so they stay on this tile.
          if (r() < 0.35) {
            const along = jitter(0.022);
            add('rock', dc ? dc * (HALF - 0.004) : along, dr ? dr * (HALF - 0.004) : along, 0.7 + r() * 0.6, COLORS.stoneDark);
          }
        }
        break;
      }
      default:
        break;
    }
  }
  return items;
}

// ---------------------------------------------------------------- rendering

function proto(parts: Array<[BufferGeometry, string, Matrix4?]>): BufferGeometry {
  const geos = parts.map(([g, color, m]) => {
    const ng = g.index ? g.toNonIndexed() : g;
    if (m) ng.applyMatrix4(m);
    return paint(ng, color);
  });
  return mergeGeometries(geos, false)!;
}
const at = (x: number, y: number, z: number) => new Matrix4().makeTranslation(x, y, z);

/** Unit prototypes (sizes in metres at scale 1; base at y = 0). */
function prototypes(): Record<DecorKind, BufferGeometry> {
  return {
    crop: proto([[new BoxGeometry(TILE_SIZE * 0.86, 0.0032, 0.0056), '#ffffff', at(0, 0.0016, 0)]]),
    olive: proto([
      [new CylinderGeometry(0.0007, 0.001, 0.005, 5), COLORS.trunk, at(0, 0.0025, 0)],
      [new IcosahedronGeometry(0.0048, 0).scale(1, 0.8, 1), '#ffffff', at(0, 0.0072, 0)],
    ]),
    pine: proto([
      [new CylinderGeometry(0.0009, 0.0013, 0.007, 5), COLORS.trunk, at(0, 0.0035, 0)],
      [new ConeGeometry(0.0085, 0.016, 7), '#ffffff', at(0, 0.013, 0)],
      [new ConeGeometry(0.006, 0.013, 7), '#ffffff', at(0, 0.021, 0)],
    ]),
    round: proto([
      [new CylinderGeometry(0.0009, 0.0013, 0.008, 5), COLORS.trunk, at(0, 0.004, 0)],
      [new IcosahedronGeometry(0.0075, 1), '#ffffff', at(0, 0.0135, 0)],
    ]),
    cypress: proto([[new ConeGeometry(0.0035, 0.024, 6), '#ffffff', at(0, 0.012, 0)]]),
    shrub: proto([[new IcosahedronGeometry(0.0038, 0).scale(1.2, 0.8, 1), '#ffffff', at(0, 0.0025, 0)]]),
    tuft: proto([[new ConeGeometry(0.0018, 0.004, 4), '#ffffff', at(0, 0.002, 0)]]),
    flower: proto([[new IcosahedronGeometry(0.0016, 0), '#ffffff', at(0, 0.0012, 0)]]),
    wall: proto([[new BoxGeometry(TILE_SIZE * 0.94, 0.0042, 0.0024), '#ffffff', at(0, 0.0021, 0)]]),
    rock: proto([[new DodecahedronGeometry(0.0028, 0).scale(1.3, 0.7, 1), '#ffffff', at(0, 0.0012, 0)]]),
    foam: proto([[new BoxGeometry(TILE_SIZE, 0.0007, 0.0028), '#ffffff', at(0, 0, 0)]]),
  };
}

export class TerrainDecor {
  readonly group = new Group();
  private meshes = new Map<DecorKind, { mesh: InstancedMesh; items: DecorItem[] }>();
  private m = new Matrix4();
  private q = new Quaternion();
  private p = new Vector3();
  private s = new Vector3();
  private up = new Vector3(0, 1, 0);

  constructor(readonly items: readonly DecorItem[], material = DECOR_MATERIAL) {
    this.group.name = 'terrain-decor';
    const protos = prototypes();
    const byKind = new Map<DecorKind, DecorItem[]>();
    for (const it of items) (byKind.get(it.kind) ?? byKind.set(it.kind, []).get(it.kind)!).push(it);
    const c = new Color();
    for (const [kind, list] of byKind) {
      const mesh = new InstancedMesh(protos[kind], material, list.length);
      mesh.name = `decor-${kind}`;
      mesh.castShadow = kind !== 'crop' && kind !== 'foam' && kind !== 'tuft' && kind !== 'flower';
      mesh.receiveShadow = true;
      mesh.raycast = () => {}; // decoration never intercepts pointers
      list.forEach((it, i) => mesh.setColorAt(i, c.set(it.color)));
      this.meshes.set(kind, { mesh, items: list });
      this.group.add(mesh);
    }
    this.setHidden(new Set());
  }

  private layers = new Map<string, ReadonlySet<number>>();
  private union = new Set<number>();

  /**
   * Hide decoration on tiles, per named layer (e.g. 'structures' from the plan,
   * 'sprawl' from the projection); the union of all layers is hidden.
   */
  setHiddenLayer(layer: string, tiles: ReadonlySet<number>): void {
    this.layers.set(layer, new Set(tiles));
    this.union.clear();
    for (const set of this.layers.values()) for (const t of set) this.union.add(t);
    this.setHidden(this.union);
  }

  /** Hide decoration on the given tile indices. */
  setHidden(hidden: ReadonlySet<number>): void {
    for (const { mesh, items } of this.meshes.values()) {
      items.forEach((it, i) => {
        const sc = hidden.has(it.tile) ? 0 : it.scale;
        if (Array.isArray(sc)) this.s.set(...sc);
        else this.s.setScalar(sc);
        this.q.setFromAxisAngle(this.up, it.rotY);
        this.m.compose(this.p.set(it.x, it.y, it.z), this.q, this.s);
        mesh.setMatrixAt(i, this.m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }
}
