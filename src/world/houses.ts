/**
 * Procedural Mediterranean homes: plaster walls, terracotta hip roofs or flat
 * roof terraces, windows with shutters, doors, balconies, gardens and trees.
 *
 * Everything is painted with the shared vertex-colour material so a whole
 * cluster merges into one mesh. Variation is deterministic (seeded).
 */
import { ConeGeometry, CylinderGeometry, Group, IcosahedronGeometry } from '@iwsdk/core';
import { block, COLORS, painted, pick } from './palette.js';
import { rng } from './rand.js';

const STOREY = 0.0085;

type Roof = 'hip' | 'flat';
interface HouseSpec {
  x: number;
  z: number;
  w: number;
  d: number;
  storeys: number;
  roof: Roof;
}
interface ClusterSpec {
  houses: HouseSpec[];
  gardens?: Array<[number, number, number, number]>; // x, z, w, d
  trees?: Array<[number, number, number]>; // x, z, scale
  cypresses?: Array<[number, number]>;
  pool?: [number, number, number, number];
  paths?: Array<[number, number, number, number]>;
  flowers?: Array<[number, number]>;
}

/** Five residential layouts that fit a 6 cm tile (origin = tile centre). */
const LAYOUTS: ClusterSpec[] = [
  {
    // courtyard: three homes around a garden
    houses: [
      { x: -0.011, z: -0.011, w: 0.022, d: 0.018, storeys: 2, roof: 'hip' },
      { x: 0.014, z: -0.012, w: 0.017, d: 0.016, storeys: 1, roof: 'flat' },
      { x: -0.012, z: 0.014, w: 0.018, d: 0.015, storeys: 1, roof: 'hip' },
    ],
    gardens: [[0.012, 0.013, 0.022, 0.02]],
    trees: [[0.016, 0.016, 1]],
    flowers: [[0.006, 0.006], [0.02, 0.006]],
  },
  {
    // row of three townhouses with balconies, front yards
    houses: [
      { x: -0.017, z: -0.007, w: 0.016, d: 0.02, storeys: 2, roof: 'hip' },
      { x: 0, z: -0.007, w: 0.016, d: 0.02, storeys: 3, roof: 'flat' },
      { x: 0.017, z: -0.007, w: 0.016, d: 0.02, storeys: 2, roof: 'hip' },
    ],
    paths: [[0, 0.016, 0.05, 0.004]],
    trees: [[-0.017, 0.02, 0.8], [0.017, 0.02, 0.9]],
    flowers: [[-0.006, 0.021], [0.006, 0.021]],
  },
  {
    // villa with a pool and cypresses
    houses: [{ x: -0.004, z: -0.011, w: 0.03, d: 0.02, storeys: 2, roof: 'flat' }],
    pool: [0.01, 0.014, 0.018, 0.01],
    gardens: [[-0.016, 0.014, 0.014, 0.018]],
    cypresses: [[-0.022, -0.02], [-0.022, 0.022], [0.023, -0.006]],
    trees: [[-0.015, 0.015, 0.9]],
  },
  {
    // hillside cluster of four small homes along a lane
    houses: [
      { x: -0.014, z: -0.014, w: 0.014, d: 0.014, storeys: 1, roof: 'flat' },
      { x: 0.007, z: -0.016, w: 0.016, d: 0.012, storeys: 2, roof: 'hip' },
      { x: -0.012, z: 0.009, w: 0.016, d: 0.014, storeys: 2, roof: 'flat' },
      { x: 0.015, z: 0.01, w: 0.012, d: 0.016, storeys: 1, roof: 'hip' },
    ],
    paths: [[0.002, -0.002, 0.05, 0.004]],
    trees: [[0.02, -0.021, 0.7]],
  },
  {
    // L-shaped house around a lemon-tree courtyard
    houses: [
      { x: -0.006, z: -0.014, w: 0.032, d: 0.014, storeys: 2, roof: 'hip' },
      { x: 0.015, z: 0.008, w: 0.014, d: 0.024, storeys: 1, roof: 'flat' },
    ],
    gardens: [[-0.008, 0.011, 0.024, 0.02]],
    trees: [[-0.014, 0.012, 0.75], [-0.003, 0.016, 0.7]],
    flowers: [[-0.016, 0.02], [0, 0.005]],
  },
];

export const HOME_VARIANTS = LAYOUTS.length;

function addHouse(g: Group, h: HouseSpec, r: () => number, shutter: string): void {
  const height = h.storeys * STOREY;
  const plaster = pick(COLORS.plaster, r());
  // Stone plinth, plaster body.
  g.add(block(h.w + 0.0008, 0.0014, h.d + 0.0008, COLORS.stone, h.x, 0, h.z));
  g.add(block(h.w, height, h.d, plaster, h.x, 0, h.z));

  if (h.roof === 'hip') {
    const roof = painted(new ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4), pick(COLORS.terracotta, r()), true);
    roof.scale.set(h.w + 0.002, 0.0065 + 0.001 * h.storeys, h.d + 0.002);
    roof.position.set(h.x, height + roof.scale.y / 2, h.z);
    g.add(roof);
  } else {
    // Flat roof terrace: parapet rim + terrace floor (+ a pergola or water tank).
    const t = 0.0012;
    g.add(block(h.w, 0.0006, h.d, COLORS.stone, h.x, height, h.z));
    g.add(block(h.w, 0.002, t, plaster, h.x, height, h.z - h.d / 2 + t / 2));
    g.add(block(h.w, 0.002, t, plaster, h.x, height, h.z + h.d / 2 - t / 2));
    g.add(block(t, 0.002, h.d, plaster, h.x - h.w / 2 + t / 2, height, h.z));
    g.add(block(t, 0.002, h.d, plaster, h.x + h.w / 2 - t / 2, height, h.z));
    if (r() < 0.5) {
      // pergola: four posts and slats
      const px = h.w * 0.25;
      const pz = h.d * 0.2;
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        g.add(block(0.0007, 0.005, 0.0007, COLORS.wood, h.x + sx * px, height, h.z + sz * pz));
      }
      g.add(block(h.w * 0.6, 0.0006, h.d * 0.5, COLORS.wood, h.x, height + 0.005, h.z));
    } else {
      g.add(block(0.004, 0.003, 0.004, COLORS.white, h.x + h.w * 0.25, height, h.z - h.d * 0.2));
    }
  }

  // Windows (front +z and sides) with shutters; door on the ground floor.
  const front = h.z + h.d / 2 + 0.0003;
  const cols = Math.max(1, Math.round(h.w / 0.0075));
  for (let s = 0; s < h.storeys; s++) {
    const wy = s * STOREY + 0.0028;
    for (let c = 0; c < cols; c++) {
      const wx = h.x - h.w / 2 + (h.w / cols) * (c + 0.5);
      if (s === 0 && c === Math.floor(cols / 2)) {
        g.add(block(0.0032, 0.0056, 0.0006, COLORS.door, wx, 0.0012, front));
        continue;
      }
      g.add(block(0.0024, 0.0034, 0.0006, COLORS.window, wx, wy, front));
      g.add(block(0.0011, 0.0034, 0.0007, shutter, wx - 0.0019, wy, front));
      g.add(block(0.0011, 0.0034, 0.0007, shutter, wx + 0.0019, wy, front));
    }
    for (const side of [-1, 1]) {
      g.add(block(0.0006, 0.0034, 0.0024, COLORS.window, h.x + side * (h.w / 2 + 0.0003), wy, h.z));
    }
    // Balcony with a white railing on upper floors.
    if (s > 0 && h.w >= 0.016) {
      g.add(block(h.w * 0.55, 0.0007, 0.004, COLORS.stone, h.x, s * STOREY, front + 0.0018));
      g.add(block(h.w * 0.55, 0.0018, 0.0005, COLORS.white, h.x, s * STOREY + 0.0007, front + 0.0036));
    }
  }
}

export function addTree(g: Group, x: number, z: number, s: number, color: string, y = 0): void {
  const trunk = painted(new CylinderGeometry(0.0009 * s, 0.0013 * s, 0.007 * s, 5), COLORS.trunk, true);
  trunk.position.set(x, y + 0.0035 * s, z);
  const crown = painted(new IcosahedronGeometry(0.0062 * s, 0), color, true);
  crown.position.set(x, y + 0.0105 * s, z);
  g.add(trunk, crown);
}

export function addCypress(g: Group, x: number, z: number, s = 1, y = 0): void {
  const c = painted(new ConeGeometry(0.0034 * s, 0.022 * s, 6), COLORS.cypress, true);
  c.position.set(x, y + 0.011 * s + 0.001, z);
  g.add(c);
}

/**
 * A cluster of homes for one tile. `seed` makes colours deterministic;
 * `variant` (0..HOME_VARIANTS-1) picks the layout.
 */
export function createHomes(variant: number, seed: number): Group {
  const g = new Group();
  const spec = LAYOUTS[((variant % LAYOUTS.length) + LAYOUTS.length) % LAYOUTS.length];
  const r = rng(seed);
  const shutter = pick(COLORS.shutter, r());
  for (const [x, z, w, d] of spec.gardens ?? []) g.add(block(w, 0.0008, d, pick(COLORS.grass, r()), x, 0, z));
  for (const [x, z, w, d] of spec.paths ?? []) g.add(block(w, 0.0006, d, COLORS.sidewalk, x, 0, z));
  if (spec.pool) {
    const [x, z, w, d] = spec.pool;
    g.add(block(w + 0.002, 0.0012, d + 0.002, COLORS.stone, x, 0, z));
    g.add(block(w, 0.0014, d, COLORS.pool, x, 0, z));
  }
  for (const h of spec.houses) addHouse(g, h, r, shutter);
  for (const [x, z, s] of spec.trees ?? []) addTree(g, x, z, s, pick(COLORS.leaf, r()));
  for (const [x, z] of spec.cypresses ?? []) addCypress(g, x, z, 0.8 + r() * 0.3);
  for (const [x, z] of spec.flowers ?? []) g.add(block(0.004, 0.0016, 0.003, pick(COLORS.flowers, r()), x, 0, z, 0, true));
  return g;
}

/** A small bell tower for the old town square. */
export function createBellTower(): Group {
  const g = new Group();
  g.add(block(0.012, 0.03, 0.012, COLORS.plaster[0], 0, 0, 0));
  g.add(block(0.0136, 0.0012, 0.0136, COLORS.stone, 0, 0.022, 0));
  for (const [sx, sz] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
    g.add(block(sx ? 0.0006 : 0.004, 0.005, sz ? 0.0006 : 0.004, COLORS.window, sx * 0.0061, 0.024, sz * 0.0061));
  }
  const roof = painted(new ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4), COLORS.terracotta[2], true);
  roof.scale.set(0.014, 0.011, 0.014);
  roof.position.set(0, 0.03 + 0.0055, 0);
  g.add(roof);
  return g;
}
