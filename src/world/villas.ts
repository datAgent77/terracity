/**
 * Garden districts and the compact town centre (horizontal-urbanism directive).
 *
 * A homes tile is a low-rise garden district: a tree-lined local street with
 * six detached 1–2 storey villas on private parcels (set back, hedged, with
 * gardens and some pools). Each model carries three architectural eras as
 * separate merged groups — `era-0` (2026), `era-1` (2035), `era-2` (2050) —
 * switched by the time-travel layer. One villa model stands for a few hundred
 * real homes (see HORIZONTAL_URBANISM_DESIGN.md for the scale assumptions).
 */
import { ConeGeometry, CylinderGeometry, Group, IcosahedronGeometry } from '@iwsdk/core';
import { createBellTower } from './houses.js';
import { mergeStatic } from './merge.js';
import { block, COLORS, painted, pick } from './palette.js';
import { rng } from './rand.js';

export type Era = 0 | 1 | 2;
export const ERAS: readonly Era[] = [0, 1, 2];

const STOREY = 0.0055;
const STUCCO = ['#f7f3ea', '#f2ecdf', '#faf7f0', '#ece3d2'];
const STONE = ['#d9ccb2', '#cfc0a2', '#e2d6bf'];
const TIMBER = '#9a6b45';
const GLASS = '#34505f';
const PV = '#1d3b6e';
const PV_FRAME = '#b9c3cc';
const LAWN = ['#7fbf5c', '#86c463', '#76b555'];
const XERIC = '#d8c9a2'; // gravel + drought-tolerant planting (2050)
const LAVENDER = '#9d88cf';

type Shape = 'L' | 'compact' | 'long' | 'split';
interface Villa {
  x: number;
  z: number;
  /** +1 = faces south (+z street), -1 = faces north. */
  face: 1 | -1;
  shape: Shape;
  stone: boolean;
  pool: boolean;
  tree: boolean;
  wall: string;
}

/** Deterministic parcel layout for a district (shared by all three eras). */
function villasFor(seed: number, variant: number): Villa[] {
  const r = rng(seed);
  const shapes: Shape[] = ['L', 'compact', 'long', 'split'];
  const out: Villa[] = [];
  const xs = [-0.018, 0, 0.018];
  for (const face of [1, -1] as const) {
    xs.forEach((x, i) => {
      out.push({
        x: x + (r() - 0.5) * 0.0015,
        z: face === 1 ? -0.0165 : 0.0165,
        face: (face === 1 ? 1 : -1) as 1 | -1,
        shape: shapes[(i + variant + (face === 1 ? 0 : 2) + Math.floor(r() * 2)) % shapes.length],
        stone: r() < 0.35,
        pool: r() < 0.35,
        tree: r() < 0.75,
        wall: pick(STUCCO, r()),
      });
    });
  }
  return out;
}

function hipRoof(g: Group, x: number, y: number, z: number, w: number, d: number, color: string): void {
  const roof = painted(new ConeGeometry(Math.SQRT1_2, 1, 4).rotateY(Math.PI / 4), color, true);
  roof.scale.set(w + 0.0012, 0.0038, d + 0.0012);
  roof.position.set(x, y + 0.0019, z);
  g.add(roof);
}

/** Roof by era: terracotta hip (2026), flat with PV + parapet (2035), full PV roof (2050). */
function roof(g: Group, era: Era, x: number, y: number, z: number, w: number, d: number, r: () => number, wall: string): void {
  if (era === 0) return hipRoof(g, x, y, z, w, d, pick(COLORS.terracotta, r()));
  g.add(block(w + 0.0006, 0.0008, d + 0.0006, wall, x, y, z)); // parapet slab
  if (era === 1) {
    if (r() < 0.65) {
      for (const dx of [-w * 0.22, w * 0.22]) {
        const p = block(w * 0.38, 0.0005, d * 0.6, PV, x + dx, y + 0.0011, z);
        p.rotation.x = -0.25;
        g.add(p);
      }
    }
  } else {
    // Integrated solar roof: the whole roof is a framed PV surface.
    g.add(block(w * 0.94, 0.0006, d * 0.9, PV, x, y + 0.0008, z));
    for (const t of [-0.25, 0.25]) g.add(block(w * 0.94, 0.0007, 0.0003, PV_FRAME, x, y + 0.0009, z + d * t));
  }
}

function windows(g: Group, era: Era, x: number, y0: number, zFront: number, w: number, storeys: number, face: 1 | -1): void {
  const cols = Math.max(1, Math.round(w / 0.0045));
  for (let s = 0; s < storeys; s++) {
    for (let c = 0; c < cols; c++) {
      const wx = x - w / 2 + (w / cols) * (c + 0.5);
      if (era === 0) {
        g.add(block(0.0016, 0.0022, 0.0004, COLORS.window, wx, y0 + s * STOREY + 0.0018, zFront));
        g.add(block(0.0007, 0.0022, 0.0005, COLORS.shutter[0], wx - 0.0012 * face, y0 + s * STOREY + 0.0018, zFront));
      } else {
        // Large glazing with a timber brise-soleil above (climate-responsive shading).
        g.add(block(0.0034, 0.0034, 0.0004, GLASS, wx, y0 + s * STOREY + 0.0012, zFront));
        g.add(block(0.0038, 0.0005, 0.0016, TIMBER, wx, y0 + s * STOREY + 0.0048, zFront + 0.0007 * face));
      }
    }
  }
}

function villa(g: Group, v: Villa, era: Era, r: () => number): void {
  const front = v.face; // windows face the street
  const wall = v.stone && era > 0 ? pick(STONE, r()) : v.wall;
  const vol = (x: number, z: number, w: number, d: number, storeys: number) => {
    const h = storeys * STOREY;
    g.add(block(w, h, d, wall, x, 0, z));
    windows(g, era, x, 0, z + (d / 2 + 0.0002) * front, w, storeys, front);
    roof(g, era, x, h, z, w, d, r, wall);
  };
  const { x, z } = v;
  switch (v.shape) {
    case 'L':
      vol(x - 0.0015, z, 0.009, 0.0055, 1);
      vol(x + 0.0035, z - 0.0035 * front, 0.0045, 0.0045, 1);
      break;
    case 'compact':
      vol(x, z, 0.0075, 0.0065, 2);
      break;
    case 'long':
      vol(x, z, 0.011, 0.005, 1);
      g.add(block(0.0006, 0.0045, 0.0006, TIMBER, x - 0.004, 0, z + 0.0046 * front));
      g.add(block(0.0006, 0.0045, 0.0006, TIMBER, x + 0.004, 0, z + 0.0046 * front));
      g.add(block(0.0088, 0.0005, 0.0034, TIMBER, x, 0.0045, z + 0.003 * front)); // pergola
      break;
    case 'split':
      vol(x - 0.0025, z, 0.006, 0.006, 2);
      vol(x + 0.0035, z + 0.001 * front, 0.006, 0.005, 1);
      break;
  }
  // Door toward the street.
  g.add(block(0.0018, 0.0034, 0.0004, era === 0 ? COLORS.door : TIMBER, x, 0, z + 0.0034 * front));
  // 2050 home systems: battery wall unit, EV charger at the drive, rain cistern.
  if (era === 2) {
    g.add(block(0.0016, 0.0024, 0.0009, '#eef1f3', x + 0.0062, 0, z));
    g.add(block(0.0006, 0.0026, 0.0006, '#3a3f44', x - 0.0062, 0, z + 0.0068 * front));
    g.add(block(0.0007, 0.0007, 0.0007, '#4cd17a', x - 0.0062, 0.0024, z + 0.0068 * front));
    const tank = painted(new CylinderGeometry(0.0011, 0.0011, 0.0024, 8), '#c9d3d8');
    tank.position.set(x + 0.006, 0.0012, z - 0.004 * front);
    g.add(tank);
  }
}

/** Gardens, hedges, pools and trees of a parcel for an era. */
function parcel(g: Group, v: Villa, era: Era, r: () => number): void {
  const { x, z, face } = v;
  const pz = z + 0.0015 * face; // parcel centre (house set back from the street)
  const garden = era === 2 ? XERIC : pick(LAWN, r());
  g.add(block(0.0166, 0.0004, 0.0215, garden, x, 0, pz));
  // Low hedge / stone wall on three sides; open to the street (privacy without towers).
  const hedge = era === 0 ? '#5f8f45' : '#d6cab0';
  g.add(block(0.0166, 0.0014, 0.0007, hedge, x, 0, pz - 0.0105 * face));
  g.add(block(0.0007, 0.0014, 0.0215, hedge, x - 0.0083, 0, pz));
  g.add(block(0.0007, 0.0014, 0.0215, hedge, x + 0.0083, 0, pz));
  // Driveway to the street.
  g.add(block(0.0025, 0.0005, 0.006, era === 0 ? '#d9cfba' : '#cfc6b3', x - 0.0062, 0, z + 0.0075 * face));
  if (v.pool) {
    g.add(block(0.0062, 0.0007, 0.0038, '#e8e1d2', x + 0.0035, 0, z - 0.0072 * face));
    g.add(block(0.0054, 0.0009, 0.003, COLORS.pool, x + 0.0035, 0, z - 0.0072 * face));
  }
  if (v.tree) {
    const s = era === 2 ? 1.15 : era === 1 ? 1.0 : 0.85;
    const tx = x - 0.005;
    const tz = z - 0.0075 * face;
    const t = painted(new CylinderGeometry(0.0005, 0.0007, 0.004 * s, 5), COLORS.trunk, true);
    t.position.set(tx, 0.002 * s, tz);
    const c = painted(new IcosahedronGeometry(0.0034 * s, 0), era === 2 ? pick(COLORS.olive, r()) : pick(COLORS.leaf, r()), true);
    c.position.set(tx, 0.0055 * s, tz);
    g.add(t, c);
  }
  if (era === 2) {
    // Drought-tolerant beds: lavender and rosemary instead of lawn.
    for (const dx of [-0.004, 0.001, 0.006]) g.add(block(0.0018, 0.0012, 0.0018, LAVENDER, x + dx, 0, z + 0.0058 * face, 0, true));
  }
}

/** Shared local street with sidewalks and street trees (all eras). */
function street(g: Group, era: Era): void {
  g.add(block(0.0552, 0.0006, 0.0052, COLORS.sidewalk, 0, 0, 0));
  g.add(block(0.0552, 0.0007, 0.0036, COLORS.asphalt, 0, 0, 0));
  if (era > 0) g.add(block(0.0552, 0.00075, 0.0007, '#6fae73', 0, 0, 0.0011)); // cycle lane
  for (const x of [-0.024, -0.009, 0.009, 0.024]) {
    for (const side of [-1, 1]) {
      const c = painted(new IcosahedronGeometry(0.0019, 0), COLORS.leaf[1], true);
      c.position.set(x, 0.004, side * 0.0024);
      const t = painted(new CylinderGeometry(0.0003, 0.0004, 0.003, 4), COLORS.trunk);
      t.position.set(x, 0.0015, side * 0.0024);
      g.add(t, c);
    }
  }
}

/**
 * A garden district for one homes tile with all three eras. Each era is merged
 * into its own group `era-N`; only one is visible at a time (era 0 by default).
 */
export function createVillaDistrict(variant: number, seed: number): Group {
  const root = new Group();
  const villas = villasFor(seed, variant);
  for (const era of ERAS) {
    const r = rng(seed + era * 7919);
    const g = new Group();
    street(g, era);
    for (const v of villas) {
      parcel(g, v, era, r);
      villa(g, v, era, r);
    }
    const merged = mergeStatic(g);
    merged.name = `era-${era}`;
    merged.visible = era === 0;
    root.add(merged);
  }
  return root;
}

/** Show one era of a district model (or of anything containing era groups). */
export function setEra(model: { getObjectByName(n: string): { visible: boolean } | undefined }, era: Era): void {
  for (const e of ERAS) {
    const g = model.getObjectByName(`era-${e}`);
    if (g) g.visible = e === era;
  }
}

// ------------------------------------------------------------ town centre --

const TOWN_STOREY = 0.0062;

function perimeterBlock(g: Group, r: () => number, storeys: number): void {
  // Compact 3–4 storey mixed-use block around a courtyard; arcaded ground floor.
  const h = storeys * TOWN_STOREY;
  const bars: Array<[number, number, number, number]> = [
    [0, -0.019, 0.05, 0.012],
    [0, 0.019, 0.05, 0.012],
    [-0.019, 0, 0.012, 0.026],
    [0.019, 0, 0.012, 0.026],
  ];
  for (const [x, z, w, d] of bars) {
    const wall = pick(STUCCO, r());
    g.add(block(w, TOWN_STOREY, d, '#c9b996', x, 0, z)); // arcade / shop level
    g.add(block(w, h - TOWN_STOREY, d, wall, x, TOWN_STOREY, z));
    const horizontal = w > d;
    const len = horizontal ? w : d;
    const n = Math.round(len / 0.006);
    for (let s = 1; s < storeys; s++) {
      for (let i = 0; i < n; i++) {
        const t = -len / 2 + (len / n) * (i + 0.5);
        const off = (horizontal ? d : w) / 2 + 0.0002;
        const sign = horizontal ? Math.sign(z) || 1 : Math.sign(x) || 1;
        if (horizontal) g.add(block(0.0018, 0.0026, 0.0004, COLORS.window, x + t, s * TOWN_STOREY + 0.0018, z + off * sign));
        else g.add(block(0.0004, 0.0026, 0.0018, COLORS.window, x + off * sign, s * TOWN_STOREY + 0.0018, z + t));
      }
    }
    if (r() < 0.6) hipRoof(g, x, h, z, w, d, pick(COLORS.terracotta, r()));
    else g.add(block(w, 0.001, d, '#d8cdb8', x, h, z));
  }
  g.add(block(0.026, 0.0005, 0.026, pick(LAWN, r()), 0, 0, 0)); // courtyard garden
  const c = painted(new IcosahedronGeometry(0.004, 0), COLORS.leaf[0], true);
  c.position.set(0, 0.006, 0);
  g.add(c);
}

function civicTile(g: Group, r: () => number): void {
  // School / clinic (2–3 storeys) with a sports court and a small park.
  g.add(block(0.032, 3 * TOWN_STOREY, 0.012, '#f3eee4', -0.008, 0, -0.016));
  g.add(block(0.012, 2 * TOWN_STOREY, 0.02, '#e9e1d0', 0.016, 0, -0.004));
  for (let i = 0; i < 6; i++) g.add(block(0.0035, 0.0025, 0.0004, GLASS, -0.022 + i * 0.0055, TOWN_STOREY * 1.3, -0.0098));
  g.add(block(0.033, 0.0008, 0.0122, '#d8cdb8', -0.008, 3 * TOWN_STOREY, -0.016));
  g.add(block(0.022, 0.0006, 0.014, '#5f9f6a', -0.01, 0, 0.014)); // sports court
  g.add(block(0.022, 0.0007, 0.0005, '#f4efe2', -0.01, 0, 0.014));
  for (const [x, z] of [[0.016, 0.016], [0.022, 0.008], [0.01, 0.022]]) {
    const c = painted(new IcosahedronGeometry(0.0038, 0), pick(COLORS.leaf, r()), true);
    c.position.set(x, 0.006, z);
    g.add(c);
  }
}

function plazaTile(g: Group, r: () => number): void {
  g.add(block(0.055, 0.0008, 0.055, COLORS.stone, 0, 0, 0));
  const tower = createBellTower();
  tower.position.set(-0.014, 0, -0.014);
  g.add(tower);
  const fountain = painted(new CylinderGeometry(0.004, 0.0045, 0.0018, 12), COLORS.stoneDark);
  fountain.position.set(0.006, 0.0018, 0.004);
  g.add(fountain);
  g.add(block(0.006, 0.0012, 0.006, COLORS.pool, 0.006, 0.0018, 0.004));
  // Market awnings along the square.
  for (let i = 0; i < 4; i++) g.add(block(0.006, 0.0006, 0.004, pick(COLORS.flowers, r()), -0.012 + i * 0.008, 0.005, 0.02));
  for (let i = 0; i < 4; i++) g.add(block(0.0005, 0.005, 0.0005, TIMBER, -0.012 + i * 0.008, 0, 0.018));
  for (const [x, z] of [[0.02, -0.018], [0.02, 0.02], [-0.022, 0.012]]) {
    const c = painted(new IcosahedronGeometry(0.004, 0), pick(COLORS.leaf, r()), true);
    c.position.set(x, 0.0068, z);
    const t = painted(new CylinderGeometry(0.0006, 0.0008, 0.005, 5), COLORS.trunk);
    t.position.set(x, 0.0025, z);
    g.add(t, c);
  }
}

/** The compact, walkable town centre: plaza, mixed-use blocks, civic buildings. */
export function createTownTile(kind: 'plaza' | 'block' | 'civic', seed: number, storeys = 3): Group {
  const g = new Group();
  const r = rng(seed);
  if (kind === 'plaza') plazaTile(g, r);
  else if (kind === 'civic') civicTile(g, r);
  else perimeterBlock(g, r, storeys);
  return g;
}
