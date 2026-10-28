/**
 * Procedural low-poly models for the five structures, sized to one tile.
 * Each model's origin is at the tile surface centre. Materials are created per
 * model so a single instance can be tinted (e.g. homes without road access).
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
} from '@iwsdk/core';
import { StructureType, TILE_SIZE } from '../config/scenario.js';
import { createHouseCluster } from './board-mesh.js';

const PAD = TILE_SIZE * 0.9;
const shared = {
  panel: new MeshStandardMaterial({ color: '#1f3f7a', roughness: 0.35, metalness: 0.4 }),
  frame: new MeshStandardMaterial({ color: '#c9ccd1', roughness: 0.6 }),
  tower: new MeshStandardMaterial({ color: '#f4f6f8', roughness: 0.5 }),
  treeTop: new MeshStandardMaterial({ color: '#4f9a45', flatShading: true }),
  trunk: new MeshStandardMaterial({ color: '#6b4a2f' }),
  path: new MeshStandardMaterial({ color: '#e7d7b0', roughness: 0.9 }),
  asphalt: new MeshStandardMaterial({ color: '#5d6066', roughness: 0.95 }),
  stripe: new MeshStandardMaterial({ color: '#f2efe6' }),
};

function pad(color: string, name: string): Mesh {
  const m = new Mesh(
    new BoxGeometry(PAD, 0.004, PAD),
    new MeshStandardMaterial({ color, roughness: 0.9 }),
  );
  m.position.y = 0.002;
  m.name = name;
  return m;
}

function residential(): Group {
  const g = new Group();
  g.add(pad('#d9c7a3', 'pad'));
  const cluster = createHouseCluster(
    new MeshStandardMaterial({ color: '#fbf6ea', roughness: 0.8 }),
    new MeshStandardMaterial({ color: '#d4703f', flatShading: true }),
    0,
  );
  cluster.position.y = 0.004;
  g.add(cluster);
  return g;
}

function solar(): Group {
  const g = new Group();
  g.add(pad('#cdbf98', 'pad'));
  const panelGeo = new BoxGeometry(0.022, 0.0015, 0.012);
  const legGeo = new BoxGeometry(0.002, 0.006, 0.002);
  for (const x of [-0.013, 0.013]) {
    for (const z of [-0.016, 0, 0.016]) {
      const leg = new Mesh(legGeo, shared.frame);
      leg.position.set(x, 0.007, z);
      const panel = new Mesh(panelGeo, shared.panel);
      panel.position.set(x, 0.011, z);
      panel.rotation.x = -0.45; // tilted toward the southern sun (+Z)
      g.add(leg, panel);
    }
  }
  return g;
}

function wind(): Group {
  const g = new Group();
  g.add(pad('#b8c79a', 'pad'));
  const towerH = 0.075;
  const tower = new Mesh(new CylinderGeometry(0.0018, 0.0035, towerH, 8), shared.tower);
  tower.position.y = towerH / 2 + 0.004;
  tower.castShadow = true;
  const nacelle = new Mesh(new BoxGeometry(0.005, 0.005, 0.01), shared.tower);
  nacelle.position.set(0, towerH + 0.004, 0);
  const rotor = new Group();
  rotor.name = 'rotor';
  rotor.position.set(0, towerH + 0.004, 0.006);
  const bladeGeo = new BoxGeometry(0.003, 0.03, 0.0012);
  bladeGeo.translate(0, 0.015, 0);
  for (let i = 0; i < 3; i++) {
    const blade = new Mesh(bladeGeo, shared.tower);
    blade.rotation.z = (i * Math.PI * 2) / 3;
    rotor.add(blade);
  }
  rotor.add(new Mesh(new ConeGeometry(0.0025, 0.005, 8).rotateX(Math.PI / 2), shared.tower));
  g.add(tower, nacelle, rotor);
  return g;
}

function park(): Group {
  const g = new Group();
  g.add(pad('#7cc35b', 'pad'));
  const path = new Mesh(new BoxGeometry(0.006, 0.0012, PAD * 0.95), shared.path);
  path.position.y = 0.0045;
  path.rotation.y = Math.PI / 4;
  g.add(path);
  const crown = new IcosahedronGeometry(0.0085, 0);
  const trunk = new CylinderGeometry(0.0012, 0.0016, 0.008, 5);
  for (const [x, z, s] of [
    [-0.014, -0.012, 1],
    [0.015, 0.011, 1.2],
    [0.012, -0.015, 0.8],
    [-0.012, 0.015, 0.9],
  ]) {
    const t = new Mesh(trunk, shared.trunk);
    t.position.set(x, 0.008, z);
    const c = new Mesh(crown, shared.treeTop);
    c.name = 'crown';
    c.userData.baseScale = s;
    c.position.set(x, 0.015 * s + 0.004, z);
    c.scale.setScalar(s);
    g.add(t, c);
  }
  return g;
}

/** Road with a centre plate and four arms; arms are toggled by `setRoadArms`. */
function road(): Group {
  const g = new Group();
  const w = TILE_SIZE * 0.42;
  const centre = new Mesh(new BoxGeometry(w, 0.003, w), shared.asphalt);
  centre.position.y = 0.0015;
  centre.name = 'pad';
  g.add(centre);
  const armLen = (TILE_SIZE - w) / 2;
  const armGeo = new BoxGeometry(w, 0.003, armLen);
  const stripeGeo = new BoxGeometry(0.0015, 0.0008, armLen * 0.7);
  // Order matches NEIGHBOUR_DIRS in placement-system: +x, -x, +z, -z.
  const dirs: Array<[number, number, string]> = [
    [1, 0, 'arm-e'],
    [-1, 0, 'arm-w'],
    [0, 1, 'arm-s'],
    [0, -1, 'arm-n'],
  ];
  for (const [dx, dz, name] of dirs) {
    const arm = new Group();
    arm.name = name;
    const slab = new Mesh(armGeo, shared.asphalt);
    const stripe = new Mesh(stripeGeo, shared.stripe);
    stripe.position.y = 0.0018;
    arm.add(slab, stripe);
    arm.position.set(dx * (w / 2 + armLen / 2), 0.0015, dz * (w / 2 + armLen / 2));
    if (dx !== 0) arm.rotation.y = Math.PI / 2;
    g.add(arm);
  }
  return g;
}

const BUILDERS: Record<StructureType, () => Group> = { residential, solar, wind, park, road };

export function createStructureModel(type: StructureType, name: string): Group {
  const g = BUILDERS[type]();
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
