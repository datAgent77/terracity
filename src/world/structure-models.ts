/**
 * Procedural low-poly models for the five structures, sized to one tile.
 * Each model's origin is at the tile surface centre. Static parts are painted
 * with the shared vertex-colour material and merged (one draw call); parts that
 * animate or are restyled per instance stay separate:
 *   pad (homes tint when unconnected), rotor (spins), crown (grows by 2050),
 *   arm-e/w/s/n (road joins), solar-panels (shared reflective material).
 */
import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
} from '@iwsdk/core';
import { StructureType, TILE_SIZE } from '../config/scenario.js';
import { addCypress, createHomes, HOME_VARIANTS } from './houses.js';
import { mergeStatic } from './merge.js';
import { block, COLORS, painted, pick } from './palette.js';
import { hashInts, rng } from './rand.js';

/** Parts that animate or are restyled per instance stay separate meshes. */
const DYNAMIC = /^(rotor|crown|pad|arm-[ewsn]|solar-panels)$/;

const PAD = TILE_SIZE * 0.92;

/** Reflective photovoltaic glass, shared by every solar farm. */
export const SOLAR_GLASS = new MeshStandardMaterial({
  color: '#1d3f78',
  roughness: 0.22,
  metalness: 0.55,
  emissive: '#1a4a9a',
  emissiveIntensity: 0.12,
});
/** Park tree crowns (shared; time travel tints them with the environment). */
export const LEAF_CROWN = new MeshStandardMaterial({ color: '#5a9b45', flatShading: true, roughness: 0.9 });

function pad(color: string): Mesh {
  const m = new Mesh(new BoxGeometry(PAD, 0.0016, PAD), new MeshStandardMaterial({ color, roughness: 0.92 }));
  m.position.y = 0.0008;
  m.name = 'pad';
  m.receiveShadow = true;
  return m;
}

function residential(variant: number, seed: number): Group {
  const g = new Group();
  g.add(pad('#d8cba9'));
  const homes = createHomes(variant, seed);
  homes.position.y = 0.0016;
  g.add(homes);
  return g;
}

function solar(_v: number, seed: number): Group {
  const g = new Group();
  g.add(pad('#c9bd93'));
  const r = rng(seed);
  // Gravel bed, service path and an inverter cabin.
  g.add(block(PAD * 0.96, 0.0006, PAD * 0.9, '#d9d2bf', 0, 0.0016, 0));
  g.add(block(0.006, 0.006, 0.005, COLORS.white, 0.021, 0.0016, 0.022));
  g.add(block(0.0066, 0.0008, 0.0056, COLORS.stoneDark, 0.021, 0.0076, 0.022));
  // Two rows of tilted arrays on light steel frames, all facing south (+z).
  const panels = new Group();
  panels.name = 'solar-panels';
  const rows = [-0.012, 0.009];
  for (const z of rows) {
    for (const x of [-0.0125, 0.0125]) {
      for (const lx of [-0.01, 0.01]) g.add(block(0.0008, 0.005, 0.0008, COLORS.steel, x + lx, 0.0016, z - 0.003));
      for (const lx of [-0.01, 0.01]) g.add(block(0.0008, 0.0026, 0.0008, COLORS.steel, x + lx, 0.0016, z + 0.004));
      const frame = block(0.0236, 0.0005, 0.0128, COLORS.steel, x, 0, 0);
      frame.position.set(x, 0.0058, z);
      frame.rotation.x = -0.42;
      g.add(frame);
      const glass = new Mesh(new BoxGeometry(0.0226, 0.0007, 0.0118), SOLAR_GLASS);
      glass.position.set(x, 0.0063, z);
      glass.rotation.x = -0.42;
      glass.castShadow = true;
      panels.add(glass);
    }
  }
  g.add(panels);
  if (r() < 0.6) g.add(block(0.004, 0.0016, 0.003, pick(COLORS.flowers, r()), -0.024, 0.0016, 0.024));
  return g;
}

function wind(_v: number, seed: number): Group {
  const g = new Group();
  g.add(pad('#a9bf86'));
  const r = rng(seed);
  // Concrete foundation, tapered tower, nacelle.
  g.add(block(0.009, 0.0014, 0.009, COLORS.stone, 0, 0.0016, 0));
  const towerH = 0.074;
  const tower = painted(new CylinderGeometry(0.0013, 0.0029, towerH, 10), COLORS.white);
  tower.position.y = 0.003 + towerH / 2;
  g.add(tower);
  const nacelle = painted(new BoxGeometry(0.0042, 0.0042, 0.0105), COLORS.white);
  nacelle.position.set(0, 0.003 + towerH + 0.0006, -0.001);
  g.add(nacelle);
  // Three slender tapered blades on a hub (spins as one mesh).
  const rotor = new Group();
  rotor.name = 'rotor';
  rotor.position.set(0, 0.003 + towerH + 0.0006, 0.0048);
  const hub = painted(new SphereGeometry(0.0022, 10, 8).scale(1, 1, 1.3), COLORS.white);
  rotor.add(hub);
  for (let i = 0; i < 3; i++) {
    const blade = painted(new CylinderGeometry(0.00035, 0.0014, 0.034, 4).scale(1, 1, 0.35).translate(0, 0.019, 0), COLORS.white);
    blade.rotation.z = (i * Math.PI * 2) / 3;
    rotor.add(blade);
    const tip = painted(new CylinderGeometry(0.0003, 0.0005, 0.004, 4).scale(1, 1, 0.35).translate(0, 0.0345, 0), '#d9534f');
    tip.rotation.z = blade.rotation.z;
    rotor.add(tip);
  }
  g.add(mergeStatic(rotor));
  // Wild grasses around the base.
  for (let k = 0; k < 4; k++) {
    const t = painted(new ConeGeometry(0.0016, 0.0035, 4), pick(COLORS.grass, r()), true);
    t.position.set((r() - 0.5) * 0.045, 0.0034, (r() - 0.5) * 0.045);
    g.add(t);
  }
  return g;
}

function park(_v: number, seed: number): Group {
  const g = new Group();
  g.add(pad('#83c160'));
  const r = rng(seed);
  // Lawn patches, a curving gravel path and a small round plaza.
  g.add(block(0.022, 0.0005, 0.018, pick(COLORS.grass, r()), -0.012, 0.0016, 0.012));
  g.add(block(0.006, 0.0007, 0.03, COLORS.sand, -0.006, 0.0016, -0.012, 0.35));
  g.add(block(0.006, 0.0007, 0.026, COLORS.sand, 0.009, 0.0016, 0.014, -0.5));
  const plaza = painted(new CylinderGeometry(0.0075, 0.0075, 0.0008, 12), COLORS.sand);
  plaza.position.set(0.002, 0.002, 0.001);
  g.add(plaza);
  g.add(painted(new CylinderGeometry(0.0025, 0.003, 0.002, 10), COLORS.stone).translateX(0.002).translateY(0.003).translateZ(0.001));
  // Flower beds and a bench.
  for (const [x, z] of [[-0.02, -0.02], [0.02, -0.006], [-0.018, 0.022]]) {
    g.add(block(0.007, 0.0012, 0.004, COLORS.earthDark, x, 0.0016, z));
    for (let k = 0; k < 3; k++) g.add(block(0.0016, 0.0016, 0.0016, pick(COLORS.flowers, r()), x - 0.0022 + k * 0.0022, 0.0028, z, 0, true));
  }
  g.add(block(0.007, 0.0012, 0.0022, COLORS.wood, 0.016, 0.0028, 0.02));
  g.add(block(0.0008, 0.0012, 0.0016, COLORS.steel, 0.0135, 0.0016, 0.02));
  g.add(block(0.0008, 0.0012, 0.0016, COLORS.steel, 0.0185, 0.0016, 0.02));
  g.add(block(0.0006, 0.009, 0.0006, '#3a3f44', -0.004, 0.0016, 0.012));
  g.add(block(0.0018, 0.0016, 0.0018, '#ffe9a8', -0.004, 0.0106, 0.012));
  // Trees: two round crowns (they mature by 2050) and a cypress.
  const trunkGeo = new CylinderGeometry(0.0009, 0.0013, 0.008, 5);
  for (const [x, z, s] of [[-0.016, -0.008, 1.1], [0.017, -0.017, 0.95], [-0.008, 0.02, 0.85]] as const) {
    const t = painted(trunkGeo.clone(), COLORS.trunk, true);
    t.position.set(x, 0.0016 + 0.004, z);
    g.add(t);
    const c = new Mesh(new IcosahedronGeometry(0.0075, 1), LEAF_CROWN);
    c.name = 'crown';
    c.userData.baseScale = s;
    c.position.set(x, 0.0016 + 0.0125 * s, z);
    c.scale.setScalar(s);
    c.castShadow = true;
    g.add(c);
  }
  addCypress(g, 0.022, 0.006, 0.8, 0.0016);
  return g;
}

/** Road: a junction plate plus four arms; arms toggle with `setRoadArms`. */
function road(): Group {
  const g = new Group();
  const w = TILE_SIZE * 0.42;
  const kerb = 0.0035;
  const centre = new Group();
  centre.name = 'pad';
  centre.add(block(w + 2 * kerb, 0.0018, w + 2 * kerb, COLORS.sidewalk, 0, 0, 0));
  centre.add(block(w, 0.0022, w, COLORS.asphalt, 0, 0, 0));
  g.add(mergeStatic(centre));
  const armLen = (TILE_SIZE - w) / 2;
  // Order matches the neighbour order used in placement-system: +x, -x, +z, -z.
  const dirs: Array<[number, number, string]> = [
    [1, 0, 'arm-e'],
    [-1, 0, 'arm-w'],
    [0, 1, 'arm-s'],
    [0, -1, 'arm-n'],
  ];
  for (const [dx, dz, name] of dirs) {
    const arm = new Group();
    arm.name = name;
    arm.add(block(w + 2 * kerb, 0.0018, armLen, COLORS.sidewalk, 0, 0, 0));
    arm.add(block(w, 0.0022, armLen + 0.0004, COLORS.asphalt, 0, 0, 0));
    arm.add(block(0.0011, 0.0006, armLen * 0.45, COLORS.marking, 0, 0.0022, 0));
    arm.position.set(dx * (w / 2 + armLen / 2), 0, dz * (w / 2 + armLen / 2));
    if (dx !== 0) arm.rotation.y = Math.PI / 2;
    g.add(mergeStatic(arm));
  }
  return g;
}

const BUILDERS: Record<StructureType, (variant: number, seed: number) => Group> = {
  residential,
  solar,
  wind,
  park,
  road: () => road(),
};

/** Deterministic look for a placement: same id -> same variant and colours. */
export function structureLook(id: string, idNum: number): { variant: number; seed: number } {
  const seed = hashInts(idNum, id.length, 31);
  return { variant: seed % HOME_VARIANTS, seed };
}

export function createStructureModel(type: StructureType, name: string, variant = 0, seed = 1): Group {
  const g = mergeStatic(BUILDERS[type](variant, seed), (o) => DYNAMIC.test(o.name));
  g.name = name;
  return g;
}

/** Show the road arms that lead to connected neighbours (e, w, s, n). */
export function setRoadArms(model: Object3D, arms: readonly [boolean, boolean, boolean, boolean]): void {
  const names = ['arm-e', 'arm-w', 'arm-s', 'arm-n'];
  names.forEach((n, i) => {
    const arm = model.getObjectByName(n);
    if (arm) arm.visible = arms[i];
  });
}
