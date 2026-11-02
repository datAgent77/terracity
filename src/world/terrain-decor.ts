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
  BufferAttribute,
  BufferGeometry,
  SphereGeometry,
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
import { COLORS, PAINTED, paint, pick } from './palette.js';

/** Decoration material (own instance so time travel can dry the vegetation). */
export const DECOR_MATERIAL = PAINTED.clone(); // smooth shading: soft foliage volumes
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

/** Kinds that can be lost to drought / fire / sprawl pressure (time travel). */
export const LOSABLE: ReadonlySet<DecorKind> = new Set<DecorKind>(['crop', 'olive', 'pine', 'round', 'cypress', 'shrub', 'flower']);
export const TREE_KINDS: ReadonlySet<DecorKind> = new Set<DecorKind>(['olive', 'pine', 'round', 'cypress']);

/** Stable per-item value in [0, 1): an item is lost when its value < the loss share. */
export function decorHash(it: DecorItem): number {
  return (hashInts(Math.round(it.x * 1e4), Math.round(it.z * 1e4), 7) % 1000) / 1000;
}
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

/**
 * Soft, lobed crown (premium stylized): a few overlapping smooth spheres,
 * shaded darker toward the bottom and the inside (cheap baked occlusion), so
 * trees read as volumes in soft light instead of faceted gems.
 */
function crown(r: number, lobes: Array<[number, number, number, number]>, cy: number): BufferGeometry {
  const parts = lobes.map(([x, y, z, s]) => {
    const g = new SphereGeometry(r * s, 6, 4).toNonIndexed(); // ~60 tris per lobe: smooth shading hides the low count
    g.translate(x * r, cy + y * r, z * r);
    return g;
  });
  const g = mergeGeometries(parts, false)!;
  const pos = g.attributes.position;
  const c = new Float32Array(pos.count * 3);
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    minY = Math.min(minY, pos.getY(i));
    maxY = Math.max(maxY, pos.getY(i));
  }
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - minY) / (maxY - minY);
    const k = 0.5 + 0.55 * Math.pow(t, 0.8); // dark underside, sunlit top
    c.set([k, k, k], i * 3);
  }
  g.setAttribute('color', new BufferAttribute(c, 3));
  g.computeVertexNormals();
  return g;
}

/** Bark-coloured trunk with a darker base. */
function trunk(r0: number, r1: number, h: number): BufferGeometry {
  return paint(new CylinderGeometry(r1, r0, h, 5, 1, true).translate(0, h / 2, 0).toNonIndexed(), COLORS.trunk);
}

function tree(parts: BufferGeometry[]): BufferGeometry {
  for (const p of parts) if (!p.attributes.color) paint(p, '#ffffff');
  for (const p of parts) if (p.attributes.uv) p.deleteAttribute('uv');
  return mergeGeometries(parts, false)!;
}

/** Unit prototypes (sizes in metres at scale 1; base at y = 0). */
function prototypes(): Record<DecorKind, BufferGeometry> {
  return {
    // Soft furrows, barely raised: fields read as painted stripes, not boxes.
    crop: proto([[new BoxGeometry(TILE_SIZE * 0.84, 0.0005, 0.0062), '#ffffff', at(0, 0.00025, 0)]]),
    olive: tree([
      trunk(0.0011, 0.0006, 0.004),
      crown(0.0036, [[0, 0, 0, 1], [0.75, -0.15, 0.3, 0.8]], 0.0062).scale(1, 0.82, 1),
    ]),
    pine: tree([
      trunk(0.0012, 0.0007, 0.011),
      // Umbrella pine: a broad flat canopy on a tall trunk.
      crown(0.005, [[0, 0, 0, 1], [1, -0.1, 0.2, 0.8], [-0.9, -0.05, -0.3, 0.85]], 0.0).scale(1, 0.5, 1).translate(0, 0.0125, 0),
    ]),
    round: tree([
      trunk(0.0013, 0.0008, 0.007),
      crown(0.0052, [[0, 0, 0, 1], [0.7, -0.25, 0.3, 0.8], [-0.65, -0.2, -0.3, 0.85]], 0.0115),
    ]),
    cypress: tree([
      trunk(0.0008, 0.0005, 0.003),
      crown(0.0028, [[0, 0, 0, 1], [0, 1.2, 0, 0.8], [0, 2.3, 0, 0.5]], 0.0045).scale(1, 1.55, 1),
    ]),
    shrub: tree([crown(0.0028, [[0, 0, 0, 1]], 0.0018).scale(1.25, 0.7, 1)]),
    tuft: proto([[new ConeGeometry(0.0018, 0.004, 4), '#ffffff', at(0, 0.002, 0)]]),
    flower: proto([[new IcosahedronGeometry(0.0016, 0), '#ffffff', at(0, 0.0012, 0)]]),
    wall: proto([[new BoxGeometry(TILE_SIZE * 0.94, 0.0042, 0.0024), '#ffffff', at(0, 0.0021, 0)]]),
    rock: proto([[new DodecahedronGeometry(0.0028, 0).scale(1.3, 0.7, 1), '#ffffff', at(0, 0.0012, 0)]]),
    foam: proto([[new BoxGeometry(TILE_SIZE, 0.0007, 0.0028), '#ffffff', at(0, 0, 0)]]),
  };
}

/**
 * Reforestation layer (pure, deterministic): young woodland and wildflowers on
 * plains and hills, revealed by time travel only when the projected environment
 * meets its target (`greening`). Farmland stays farmland.
 */
export function regrowPlan(terrain: TerrainMap): DecorItem[] {
  const items: DecorItem[] = [];
  for (const t of terrain) {
    if (t.type !== TerrainType.Plain && t.type !== TerrainType.Hill) continue;
    const idx = t.row * GRID_COLS + t.col;
    const { x, z } = tileCenter(t.col, t.row);
    const y = tileTopY(t);
    const r = rng(hashInts(t.col, t.row, 41));
    const jitter = (m: number) => (r() * 2 - 1) * m;
    const n = 4 + Math.floor(r() * 3);
    for (let k = 0; k < n; k++) {
      const roll = r();
      const kind: DecorKind = t.type === TerrainType.Hill ? (roll < 0.5 ? 'pine' : roll < 0.8 ? 'olive' : 'cypress') : roll < 0.5 ? 'round' : roll < 0.8 ? 'olive' : 'cypress';
      const color = kind === 'pine' ? pick(COLORS.pine, r()) : kind === 'round' ? pick(COLORS.leaf, r()) : kind === 'olive' ? pick(COLORS.olive, r()) : COLORS.cypress;
      items.push({ kind, tile: idx, x: x + jitter(0.023), y, z: z + jitter(0.023), rotY: r() * Math.PI * 2, scale: 0.55 + r() * 0.4, color });
    }
    for (let k = 0; k < 2; k++) items.push({ kind: 'flower', tile: idx, x: x + jitter(0.024), y, z: z + jitter(0.024), rotY: r() * Math.PI * 2, scale: 1.1, color: pick(COLORS.flowers, r()) });
  }
  return items;
}

/** Shared soft tree geometries (unit = board metres) for other systems (street view). */
let protoCache: Record<DecorKind, BufferGeometry> | null = null;
export function decorPrototype(kind: DecorKind): BufferGeometry {
  protoCache ??= prototypes();
  return protoCache[kind];
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
      // Trees cast shadows; small ground cover does not (halves its cost).
      mesh.castShadow = kind === 'olive' || kind === 'pine' || kind === 'round' || kind === 'cypress' || kind === 'wall';
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
  private loss = 0;
  private lossKinds: ReadonlySet<DecorKind> = LOSABLE;

  /** True when decoration on this tile is hidden by a layer (structure, sprawl). */
  isTileHidden(tile: number): boolean {
    return this.union.has(tile);
  }

  /** True when this item is lost at the current loss share. */
  isLost(it: DecorItem): boolean {
    return this.lossKinds.has(it.kind) && decorHash(it) < this.loss;
  }

  /**
   * Hide a stable share of the losable items (0..1). `kinds` overrides which
   * kinds count (a regrowth layer passes all of its kinds and 1 - growth).
   */
  setLoss(share: number, kinds?: ReadonlySet<DecorKind>): void {
    const q = Math.round(share * 50) / 50; // coarse steps: rebuild matrices rarely
    if (q === this.loss && !kinds) return;
    this.loss = q;
    if (kinds) this.lossKinds = kinds;
    this.setHidden(this.union);
  }

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
        const sc = hidden.has(it.tile) || this.isLost(it) ? 0 : it.scale;
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
