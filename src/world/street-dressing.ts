/**
 * Mediterranean street dressing at human scale (look-dev): bougainvillea over
 * the garden walls, slim street lamps, a few palms and zebra crossings. Placed
 * by sampling the real built street (`surface(x, z)`: highest surface under a
 * point), so it follows whichever authored layout stands there.
 *
 * Honest by construction: it only dresses a planned neighbourhood, and the
 * flowers follow the projection — full and bright where the land is green,
 * sparse and faded where it is parched (`FutureVisualState`).
 * Everything is instanced (one draw call per part).
 */
import {
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  BoxGeometry,
  TetrahedronGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  MeshStandardMaterial,
  type MeshStandardMaterialParameters,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Vector3,
  type BufferGeometry,
} from '@iwsdk/core';
import type { FutureVisualState } from './future-visual-state.js';
import { rng } from './rand.js';

const SIDEWALK = 0.62;
const ROAD = 0.32;

interface Spot {
  x: number;
  y: number;
  z: number;
  s: number;
  yaw?: number;
  color?: Color;
}

function instanced(geo: BufferGeometry, mat: MeshStandardMaterial, spots: Spot[], name: string): InstancedMesh | null {
  if (!spots.length) return null;
  const m = new InstancedMesh(geo, mat, spots.length);
  m.name = name;
  const mx = new Matrix4();
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const p = new Vector3();
  const sc = new Vector3();
  spots.forEach((s, i) => {
    q.setFromAxisAngle(up, s.yaw ?? 0);
    mx.compose(p.set(s.x, s.y, s.z), q, sc.setScalar(s.s));
    m.setMatrixAt(i, mx);
    if (s.color) m.setColorAt(i, s.color);
  });
  m.instanceMatrix.needsUpdate = true;
  if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const flat = (color: string, extra: MeshStandardMaterialParameters = {}) =>
  new MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...extra });

/**
 * @param surface highest surface (street-inner metres) under (x, z)
 * @param st      the projected look of this future
 */
export function createStreetDressing(
  surface: (x: number, z: number) => number,
  st: FutureVisualState,
  /** Standing points: nothing grows within arm's reach of a viewpoint (it would fill the view). */
  keepClear: ReadonlyArray<{ x: number; z: number }> = [],
): Group {
  const clear = (x: number, z: number) => keepClear.every((v) => Math.hypot(v.x - x, v.z - z) > 3.6);
  const g = new Group();
  g.name = 'street-dressing';
  const r = rng(4242);
  const green = Math.max(0, Math.min(1, 1 - st.dryness * 1.2 + st.greening * 0.3));
  const near = (a: number, b: number, eps = 0.06) => Math.abs(a - b) < eps;

  // --- where things are: curb line and garden-wall tops, per side, along x.
  const curbZ: Record<number, number> = {};
  for (const side of [-1, 1]) {
    for (let z = 1; z < 7; z += 0.1) {
      if (surface(0, side * z) > ROAD + 0.15) {
        curbZ[side] = side * z;
        break;
      }
    }
  }

  // Bougainvillea: clusters on wall tops (a surface 0.9–2.4 m above the
  // sidewalk), scanning outward from the curb on both sides.
  const bloom: Spot[] = [];
  const leaves: Spot[] = [];
  const pink = [new Color('#d8338f'), new Color('#c22a86'), new Color('#e65aa8'), new Color('#b84aa6')];
  const faded = new Color('#a77a7e');
  for (const side of [-1, 1]) {
    const c0 = Math.abs(curbZ[side] ?? side * 2.6);
    for (let x = -28; x <= 28; x += 0.9) {
      for (let dz = 0.6; dz < 4.5; dz += 0.2) {
        const z = side * (c0 + dz);
        const h = surface(x, z);
        if (h > SIDEWALK + 0.6 && h < SIDEWALK + 1.8 && surface(x, z - side * 0.25) < h - 0.4) {
          // the street-facing edge of a wall top
          if (clear(x, z) && r() < 0.3 + 0.6 * green) {
            // A cloud of small magenta bracts over the wall top, a few
            // trailing down the street face, over a low cushion of leaves.
            const n = Math.round(10 + 16 * green);
            for (let k = 0; k < n; k++) {
              const col = pink[Math.floor(r() * pink.length)].clone().lerp(faded, 1 - green);
              const drape = r() < 0.35;
              bloom.push({
                x: x + (r() - 0.5) * 1.1,
                y: drape ? h - 0.05 - r() * 0.6 : h + r() * 0.32,
                z: z + (drape ? -side * 0.16 : (r() - 0.6) * 0.4 * side),
                s: 0.06 + r() * 0.06,
                yaw: r() * 6.28,
                color: col,
              });
            }
            for (let k = 0; k < 3; k++) leaves.push({ x: x + (r() - 0.5) * 0.9, y: h + 0.04, z: z + side * 0.05, s: 0.16 + r() * 0.1, yaw: r() * 6.28 });
            // the vine itself, hanging on the street face (the bracts trail over it)
            for (let k = 0; k < 2; k++) leaves.push({ x: x + (r() - 0.5) * 0.8, y: h - 0.2 - r() * 0.35, z: z - side * 0.02, s: 0.13 + r() * 0.08, yaw: r() * 6.28 });
          }
          break;
        }
      }
    }
  }
  // Bracts: small tilted tetrahedra read as papery petals at a few metres.
  const bloomMesh = instanced(new TetrahedronGeometry(1, 0).rotateX(0.6), flat('#ffffff', { roughness: 0.6 }), bloom, 'bougainvillea');
  const leafMesh = instanced(new DodecahedronGeometry(1, 0).scale(1.3, 0.55, 1), flat(new Color('#3f7a35').lerp(new Color('#8f8250'), 1 - green).getStyle()), leaves, 'bougainvillea-leaves');

  // Street lamps: on the sidewalk 0.55 m from the curb, every ~11 m, sides alternating.
  const poles: Spot[] = [];
  const heads: Spot[] = [];
  let i = 0;
  for (let x = -24; x <= 26; x += 11, i++) {
    const side = i % 2 ? 1 : -1;
    const cz = curbZ[side] ?? side * 2.6;
    const z = cz + side * 0.55;
    const ground = surface(x, z);
    if (!near(ground, SIDEWALK, 0.12)) continue;
    // keep clear of trunks / walls right there
    if (surface(x + 0.4, z) > ground + 0.3 || surface(x - 0.4, z) > ground + 0.3) continue;
    poles.push({ x, y: ground, z, s: 1 });
    heads.push({ x, y: ground + 3.6, z, s: 1 });
  }
  const pole = instanced(new CylinderGeometry(0.045, 0.07, 3.6, 6).translate(0, 1.8, 0), flat('#2b3a3f', { metalness: 0.4, roughness: 0.5 }), poles, 'street-lamp-poles');
  // A classic lantern: warm glass box under a small dark cap.
  const head = instanced(new BoxGeometry(0.24, 0.34, 0.24).translate(0, 0.12, 0), flat('#f6e3b4', { emissive: '#ffcf80', emissiveIntensity: 0.35 }), heads, 'street-lamp-glass');
  const cap = instanced(new ConeGeometry(0.22, 0.2, 4).rotateY(Math.PI / 4).translate(0, 0.38, 0), flat('#2b3a3f'), heads, 'street-lamp-caps');

  // Palms at both street ends (where the sidewalk is free).
  const trunks: Spot[] = [];
  const fronds: Spot[] = [];
  for (const [x, side] of [[-27, 1], [-26, -1], [27.5, 1], [26.5, -1]] as const) {
    const cz = curbZ[side] ?? side * 2.6;
    const z = cz + side * 0.9;
    const ground = surface(x, z);
    if (ground > SIDEWALK + 0.2) continue;
    const h = 5.2 + r() * 1.6;
    trunks.push({ x, y: ground, z, s: h / 6 });
    const top = ground + h;
    for (let k = 0; k < 8; k++) {
      fronds.push({ x, y: top, z, s: 1 + r() * 0.2, yaw: (k / 8) * Math.PI * 2 + r() * 0.3 });
    }
  }
  const trunk = instanced(new CylinderGeometry(0.13, 0.2, 6, 6).translate(0, 3, 0), flat('#8a6a48'), trunks, 'palm-trunks');
  // A frond: a long flattened cone leaning out and down.
  const frondGeo = new ConeGeometry(0.28, 2.6, 4).rotateZ(-Math.PI / 2 - 0.35).translate(1.25, -0.35, 0).scale(1, 0.4, 1);
  const frond = instanced(frondGeo, flat(new Color('#4e8d3e').lerp(new Color('#a39255'), 1 - green).getStyle()), fronds, 'palm-fronds');

  // Zebra crossings across the carriageway.
  const stripes: Spot[] = [];
  const cw = Math.abs((curbZ[1] ?? 2.6) - (curbZ[-1] ?? -2.6));
  const midZ = ((curbZ[1] ?? 2.6) + (curbZ[-1] ?? -2.6)) / 2;
  for (const x0 of [-5.5, 19.5]) {
    if (!near(surface(x0, midZ), ROAD, 0.1)) continue;
    for (let k = 0; k < 6; k++) stripes.push({ x: x0 + (k - 2.5) * 0.9, y: ROAD + 0.006, z: midZ, s: 1 });
  }
  const stripeGeo = new PlaneGeometry(0.5, Math.max(1, cw - 0.6)).rotateX(-Math.PI / 2);
  const zebra = instanced(stripeGeo, new MeshStandardMaterial({ color: '#f4efe2', roughness: 0.9 }), stripes, 'zebra');
  if (zebra) zebra.castShadow = false;

  for (const m of [bloomMesh, leafMesh, pole, head, cap, trunk, frond, zebra]) if (m) g.add(m);
  return g;
}

/** Free a dressing group (its geometries and materials are its own). */
export function disposeDressing(g: Object3D): void {
  g.traverse((o) => {
    const m = o as InstancedMesh;
    if (!m.isInstancedMesh) return;
    m.geometry.dispose();
    (m.material as MeshStandardMaterial).dispose();
    m.dispose();
  });
}

