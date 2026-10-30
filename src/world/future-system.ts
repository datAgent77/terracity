/**
 * Visual consequences of time travel. Every parameter comes from
 * `futureVisualState()` (simulation -> visuals mapping, unit-tested); this
 * system only animates toward it over ~1.4 s:
 *  - unplanned sprawl rises on the projected tiles (density = residents),
 *    and the fields/meadows under it give way;
 *  - vegetation, fields and park trees fade toward dry ochre as the projected
 *    environment falls, and stay vibrant when it holds;
 *  - below the environment target: a brown smog layer over the region, a
 *    dimmer sun, murky water, and a stable share of trees and crops lost
 *    (burn scars where woodland was); at or above it: young woodland and
 *    wildflowers return to free plains and hills, and bird flocks circle;
 *  - a "time wave" ring sweeps out from the town while a transition unfolds;
 *  - the sea floods the beaches (foam line at the new shore); at-risk coastal
 *    sites get sea walls and a calm amber outline;
 *  - solar glass glows and rotors turn with projected renewable coverage;
 *  - park trees grow with maturity.
 * Also hosts the side-by-side Plan A / Plan B miniatures.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  RingGeometry,
  CylinderGeometry,
  DirectionalLight,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Color,
  createSystem,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from '@iwsdk/core';
import { BOARD_CENTER, GRID_COLS, TILE_SIZE, TerrainType } from '../config/scenario.js';
import { compareOpen, game, phase, planA, planVersion, viewYear } from '../core/session.js';
import { Placeable, TrayToken } from '../interactions/placeable-component.js';
import { projectYear } from '../simulation/projection.js';
import { prefersReducedMotion } from '../ui/accessibility.js';
import { tileCenter, tileTopY } from './board-coords.js';
import { boardDecor } from './board-mesh.js';
import { eraForProgress, futureVisualState, MAX_DRYNESS, type FutureVisualState } from './future-visual-state.js';
import { createSprawl } from './houses.js';
import { mergeStatic } from './merge.js';
// Addon not re-exported by @iwsdk/core (imports the same `three` alias).
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createMiniBoard, labelPlate } from './mini-board.js';
import { comparePlans, type MetricKey } from '../simulation/compare.js';
import { hashInts, rng } from './rand.js';
import { LEAF_CROWN, SOLAR_GLASS } from './structure-models.js';
import { DECOR_MATERIAL, regrowPlan, TerrainDecor, TREE_KINDS, type DecorItem, type DecorKind } from './terrain-decor.js';
import { tileAt } from './terrain-map.js';

const DURATION = 2.2; // seconds per time-travel transition (the future unfolds visibly)
const MINI_SCALE = 0.27;
/** Half the distance between the two dioramas' centres (clear gap between bases). */
const MINI_GAP = 0.15;
const HALF = TILE_SIZE / 2;
const WHITE = new Color('#ffffff');
const DRY_LAND = new Color('#b98f58');
const DRY_LEAF = new Color('#b89a5a');
const LUSH_LAND = new Color('#e4f7d4');
const MURKY_WATER = new Color('#8e9468');
const HAZY_SUN = new Color('#e3b487');
const SUN_COLOR = new Color('#ffe6c4');
const ALL_REGROW: ReadonlySet<DecorKind> = new Set<DecorKind>(['olive', 'pine', 'round', 'cypress', 'flower']);
const CROWN_GREEN = new Color('#5a9b45');
const CROWN_DRY = new Color('#a89a5f');
const POOL = 8;
const BIRDS = 18;

/** Rotor speed (rad/s) read by the placement system; driven by renewable activity. */
export const rotorSpeed = { value: 2.2 };

interface Shown {
  progress: number;
  dryness: number;
  activity: number;
  parkGrowth: number;
  haze: number;
  treeLoss: number;
  greening: number;
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export class FutureSystem extends createSystem({
  placeables: { required: [Placeable] },
  tokens: { required: [TrayToken] },
}) {
  private board!: Object3D;
  private capsMat!: MeshStandardMaterial;
  private minis = new Group();
  private state!: FutureVisualState;
  private from: Shown = { progress: 0, dryness: 0, activity: 0.17, parkGrowth: 1, haze: 0, treeLoss: 0, greening: 0 };
  private to: Shown = { ...this.from };
  private shown: Shown = { ...this.from };
  private t = 1;
  /** Sprawl groups by tile index, with animated reveal toward 0/1. */
  private sprawl = new Map<number, { group: Group; key: string; from: number; to: number; reveal: number; delay: number }>();
  private shore!: InstancedMesh;
  private shoreItems: Array<{ x: number; y: number; z: number; dc: number; dr: number }> = [];
  private walls: Mesh[] = [];
  private rings: Mesh[] = [];
  private ringMat = new MeshBasicMaterial({ color: '#ff8a3d', transparent: true, opacity: 0.8, depthWrite: false });
  private crowns: Object3D[] = [];
  /** Young woodland + wildflowers revealed by `greening`. */
  private regrow!: TerrainDecor;
  /** Burn scars (charred ground + snag) where woodland trees were lost. */
  private scars!: InstancedMesh;
  private scarItems: DecorItem[] = [];
  private scarLoss = -1;
  /** Two drifting smog sheets over the region (opacity = haze). */
  private smog: Mesh[] = [];
  private sun?: DirectionalLight;
  private sunBase = 1.15;
  private waterMat?: MeshStandardMaterial;
  private foam!: InstancedMesh;
  /** "Time wave": a ring sweeping out from the town while the future unfolds. */
  private wave!: Mesh;
  private waveOrigin = new Vector3();
  /** Bird flocks over a recovering region (count follows `greening`). */
  private birds!: InstancedMesh;
  /** Garden-district era groups (era-0/1/2) of placed homes and tray tokens. */
  private eraGroups: Object3D[] = [];
  private shownEra = -1;
  private crownsDirty = true;
  private clock = 0;
  private m = new Matrix4();
  private q = new Quaternion();
  private v = new Vector3();
  private sc = new Vector3();

  init(): void {
    this.board = this.world.scene.getObjectByName('terrain-board')!;
    this.capsMat = (this.board.getObjectByName('terrain-tiles') as Mesh).material as MeshStandardMaterial;
    this.buildShore();
    this.buildRiskMarkers();
    this.buildDecline();

    // Test/debug hook: the mapped visual state and what is on screen now.
    const hook = ((window as unknown as Record<string, unknown>).__terracity ??= {}) as Record<string, unknown>;
    hook.futureVisuals = () => ({
      state: this.state && { ...this.state },
      shown: { ...this.shown },
      sprawlVisible: [...this.sprawl.values()].filter((e) => e.group.visible).length,
      wallsVisible: this.walls.filter((w) => w.visible).length,
      ringsVisible: this.rings.filter((r) => r.visible).length,
      transitionDone: this.t >= 1,
      scars: this.scars?.count ?? 0,
      smogVisible: this.smog.filter((m) => m.visible).length,
      birds: this.birds?.count ?? 0,
      minis: this.minis.children.map((c) => c.name),
    });

    // Compile the shaders of everything that first appears on time travel or at
    // the end of a session (shore sheets, walls, outlines, sprawl, motes) now,
    // instead of on the first 2035/2050 frame.
    setTimeout(() => this.prewarmShaders(), 300);

    this.minis.name = 'plan-comparison-minis';
    this.world.scene.add(this.minis);

    const dirty = () => {
      this.crownsDirty = true;
    };
    this.cleanupFuncs.push(
      this.queries.placeables.subscribe('qualify', dirty),
      this.queries.placeables.subscribe('disqualify', dirty),
    );
    const refresh = () => this.recompute();
    this.cleanupFuncs.push(
      viewYear.subscribe(refresh),
      planVersion.subscribe(refresh),
      phase.subscribe(refresh),
      compareOpen.subscribe(() => {
        this.rebuildMinis();
        this.recompute();
      }),
      planA.subscribe(() => this.rebuildMinis()),
      planVersion.subscribe(() => this.rebuildMinis()),
    );
  }

  /** Regrowth layer, burn scars, smog sheets; sun and water handles. */
  private buildDecline(): void {
    this.regrow = new TerrainDecor(regrowPlan(game.terrain));
    this.regrow.group.name = 'regrowth';
    this.regrow.setLoss(1, ALL_REGROW);
    this.board.add(this.regrow.group);

    const decor = boardDecor(this.board);
    this.scarItems = (decor?.items ?? []).filter((it) => {
      const t = game.terrain[it.tile];
      return TREE_KINDS.has(it.kind) && (t.type === TerrainType.Protected || t.type === TerrainType.Hill);
    });
    const scarGeo = new CylinderGeometry(0.0062, 0.007, 0.0006, 9).translate(0, 0.0003, 0);
    this.scars = new InstancedMesh(scarGeo, new MeshStandardMaterial({ color: '#2f2a25', roughness: 1 }), Math.max(1, this.scarItems.length));
    this.scars.name = 'burn-scars';
    this.scars.raycast = () => {};
    this.scars.count = 0;
    this.board.add(this.scars);
    // A charred snag standing on each scar (same material, second instanced mesh).
    const snag = new CylinderGeometry(0.00035, 0.0006, 0.0075, 5).translate(0, 0.00375, 0);
    const snags = new InstancedMesh(snag, this.scars.material as MeshStandardMaterial, Math.max(1, this.scarItems.length));
    snags.name = 'burn-snags';
    snags.raycast = () => {};
    snags.count = 0;
    this.board.add(snags);
    this.scars.userData.snags = snags;

    // Smog: soft cloud patches that fade out before the board's edges (no
    // visible sheet borders), on two layers 4 and 8 cm above the board.
    const w = GRID_COLS * TILE_SIZE;
    const d = 10 * TILE_SIZE;
    for (const [layer, y] of [[0, 0.04], [1, 0.08]] as const) {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 384;
      const ctx = canvas.getContext('2d')!;
      const r = rng(2050 + layer);
      for (let i = 0; i < 26; i++) {
        const x = 40 + r() * 432;
        const cy = 40 + r() * 304;
        const rad = 50 + r() * 110;
        const g = ctx.createRadialGradient(x, cy, 0, x, cy, rad);
        g.addColorStop(0, `rgba(255,255,255,${0.35 + r() * 0.4})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 512, 384);
      }
      // Feather the borders to zero.
      ctx.globalCompositeOperation = 'destination-in';
      const fx = ctx.createLinearGradient(0, 0, 512, 0);
      fx.addColorStop(0, 'rgba(0,0,0,0)');
      fx.addColorStop(0.12, 'rgba(0,0,0,1)');
      fx.addColorStop(0.88, 'rgba(0,0,0,1)');
      fx.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fx;
      ctx.fillRect(0, 0, 512, 384);
      const fy = ctx.createLinearGradient(0, 0, 0, 384);
      fy.addColorStop(0, 'rgba(0,0,0,0)');
      fy.addColorStop(0.15, 'rgba(0,0,0,1)');
      fy.addColorStop(0.85, 'rgba(0,0,0,1)');
      fy.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fy;
      ctx.fillRect(0, 0, 512, 384);
      const tex = new CanvasTexture(canvas);
      tex.colorSpace = SRGBColorSpace;
      const m = new Mesh(
        new PlaneGeometry(w, d).rotateX(-Math.PI / 2),
        new MeshBasicMaterial({ color: '#8a7559', map: tex, transparent: true, opacity: 0, depthWrite: false }),
      );
      m.position.y = y;
      m.name = `smog-${layer}`;
      m.raycast = () => {};
      m.visible = false;
      m.renderOrder = 2;
      this.board.add(m);
      this.smog.push(m);
    }

    // Time wave from the town centre.
    const town = game.terrain.filter((t) => t.type === TerrainType.Town);
    const c = town.reduce((a, t) => ({ x: a.x + tileCenter(t.col, t.row).x / town.length, z: a.z + tileCenter(t.col, t.row).z / town.length }), { x: 0, z: 0 });
    this.waveOrigin.set(c.x, tileTopY(town[0] ?? game.terrain[0]) + 0.012, c.z);
    this.wave = new Mesh(
      new RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending }),
    );
    this.wave.name = 'time-wave';
    this.wave.raycast = () => {};
    this.wave.visible = false;
    this.wave.position.copy(this.waveOrigin);
    this.board.add(this.wave);

    // Birds: tiny chevrons in two loose flocks circling above the board.
    const chevron = new BoxGeometry(0.006, 0.0006, 0.0016);
    const wing = new BoxGeometry(0.006, 0.0006, 0.0016);
    chevron.translate(0.0028, 0, 0).rotateY(0.5);
    wing.translate(-0.0028, 0, 0).rotateY(-0.5);
    const bird = mergeGeometries([chevron, wing])!;
    this.birds = new InstancedMesh(bird, new MeshBasicMaterial({ color: '#3b3f44' }), BIRDS);
    this.birds.name = 'bird-flocks';
    this.birds.raycast = () => {};
    this.birds.count = 0;
    this.board.add(this.birds);

    this.world.scene.traverse((o) => {
      if ((o as DirectionalLight).isDirectionalLight && !this.sun) this.sun = o as DirectionalLight;
    });
    if (this.sun) this.sunBase = this.sun.intensity;
    const water = this.board.getObjectByName('water-surface') as Mesh | undefined;
    this.waterMat = water?.material as MeshStandardMaterial | undefined;
  }

  /** Burn scars where woodland trees are currently lost (and not under a structure). */
  private layoutScars(): void {
    const decor = boardDecor(this.board);
    if (!decor) return;
    const snags = this.scars.userData.snags as InstancedMesh;
    let n = 0;
    for (const it of this.scarItems) {
      if (!decor.isLost(it) || decor.isTileHidden(it.tile)) continue;
      const s = typeof it.scale === 'number' ? it.scale : it.scale[0];
      this.m.compose(this.v.set(it.x, it.y, it.z), this.q.identity(), this.sc.set(s, 1, s));
      this.scars.setMatrixAt(n, this.m);
      this.m.compose(this.v.set(it.x, it.y, it.z), this.q.setFromAxisAngle(this.up, it.rotY).multiply(this.tilt), this.sc.set(1, s, 1));
      snags.setMatrixAt(n, this.m);
      n++;
    }
    this.scars.count = n;
    snags.count = n;
    this.scars.instanceMatrix.needsUpdate = true;
    snags.instanceMatrix.needsUpdate = true;
    this.scars.computeBoundingSphere();
    snags.computeBoundingSphere();
  }

  private up = new Vector3(0, 1, 0);
  private tilt = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.25);

  /** Thin water sheets anchored at each beach's seaward edge (scaled by sea rise). */
  private buildShore(): void {
    for (const t of game.terrain) {
      if (t.type !== TerrainType.Beach) continue;
      for (const [dc, dr] of [[0, -1], [1, 0], [-1, 0], [0, 1]] as const) {
        if (tileAt(game.terrain, t.col + dc, t.row + dr)?.type !== TerrainType.Sea) continue;
        const { x, z } = tileCenter(t.col, t.row);
        this.shoreItems.push({ x, y: tileTopY(t) + 0.0005, z, dc, dr });
        break;
      }
    }
    this.shore = new InstancedMesh(
      new BoxGeometry(TILE_SIZE, 0.0012, TILE_SIZE),
      new MeshStandardMaterial({ color: '#3aa9c4', transparent: true, opacity: 0.86, roughness: 0.1, metalness: 0.15 }),
      this.shoreItems.length,
    );
    this.shore.name = 'sea-level-rise';
    this.shore.raycast = () => {};
    this.board.add(this.shore);
    // White foam line along the new, inland shoreline.
    this.foam = new InstancedMesh(
      new BoxGeometry(TILE_SIZE, 0.0016, 0.0026),
      new MeshStandardMaterial({ color: '#ffffff', roughness: 0.6 }),
      this.shoreItems.length,
    );
    this.foam.name = 'sea-level-foam';
    this.foam.raycast = () => {};
    this.board.add(this.foam);
    this.layoutShore(0);
  }

  private layoutShore(rise: number): void {
    this.shoreItems.forEach((it, i) => {
      const k = Math.max(0.0001, rise);
      // Anchor at the seaward edge and grow inland.
      const off = HALF - (HALF * k);
      this.v.set(it.x + it.dc * off, it.y, it.z + it.dr * off);
      this.sc.set(it.dc ? k : 1, 1, it.dr ? k : 1);
      this.m.compose(this.v, this.q.identity(), this.sc);
      this.shore.setMatrixAt(i, this.m);
      // Foam at the inland edge, running along the beach.
      const edge = HALF - TILE_SIZE * k + 0.0012 * Math.sin(this.clock * 1.6 + i);
      this.v.set(it.x + it.dc * edge, it.y + 0.0004, it.z + it.dr * edge);
      this.q.setFromAxisAngle(this.up, it.dc ? Math.PI / 2 : 0);
      this.m.compose(this.v, this.q, this.sc.set(1, 1, 1));
      this.foam.setMatrixAt(i, this.m);
      this.q.identity();
    });
    this.shore.instanceMatrix.needsUpdate = true;
    this.foam.instanceMatrix.needsUpdate = true;
    this.shore.visible = rise > 0.01;
    this.foam.visible = rise > 0.05;
  }

  private buildRiskMarkers(): void {
    const wallMat = new MeshStandardMaterial({ color: '#8c8273', roughness: 0.9 });
    for (let i = 0; i < POOL * 2; i++) {
      const w = new Mesh(new BoxGeometry(TILE_SIZE * 0.96, 0.012, 0.0045).translate(0, 0.006, 0), wallMat);
      w.visible = false;
      w.castShadow = true;
      w.name = `sea-wall-${i}`;
      w.raycast = () => {};
      this.board.add(w);
      this.walls.push(w);
    }
    // Calm amber outline on at-risk sites (four thin bars, merged).
    for (let i = 0; i < POOL; i++) {
      const g = new Group();
      const L = TILE_SIZE * 0.96;
      const b = 0.0032;
      for (const [x, z, w, d] of [[0, -L / 2, L, b], [0, L / 2, L, b], [-L / 2, 0, b, L], [L / 2, 0, b, L]]) {
        const bar = new Mesh(new BoxGeometry(w, 0.0012, d), this.ringMat);
        bar.position.set(x, 0.0004, z);
        g.add(bar);
      }
      const ring = mergeStatic(g).children[0] as Mesh;
      ring.visible = false;
      ring.name = `flood-risk-${i}`;
      ring.raycast = () => {};
      this.board.add(ring);
      this.rings.push(ring);
    }
  }

  /**
   * Render everything that first appears on time travel or at the end of a
   * session for two real frames (shrunk to near-zero size, so nothing visibly
   * flashes). Programs are then linked under the exact render state instead of
   * on the first 2035/2050 frame.
   */
  private prewarming = false;

  private prewarmShaders(): void {
    this.prewarming = true;
    const sample = this.sprawlGroup(0, 0, 0, 2);
    const objs: Object3D[] = [this.shore, this.foam, this.walls[0], this.rings[0], sample, this.scars, this.scars.userData.snags as Object3D, ...this.smog, this.wave, this.birds];
    this.birds.count = 1;
    this.scars.count = 1;
    (this.scars.userData.snags as InstancedMesh).count = 1;
    for (const name of ['outcome-mark-0', 'celebration-motes', 'tutorial-beacon']) {
      const o = this.world.scene.getObjectByName(name);
      if (o) objs.push(o);
    }
    const saved = objs.map((o) => ({ visible: o.visible, scale: o.scale.clone() }));
    objs.forEach((o) => {
      o.visible = true;
      o.scale.setScalar(1e-4);
    });
    let frames = 0;
    const restore = () => {
      if (++frames < 3) return requestAnimationFrame(restore);
      objs.forEach((o, i) => {
        o.visible = saved[i].visible;
        o.scale.copy(saved[i].scale);
      });
      this.prewarming = false;
      this.layoutShore(this.shown.progress);
      this.scarLoss = -1; // re-layout scars (counts were borrowed for prewarming)
      this.birds.count = 0;
    };
    requestAnimationFrame(restore);
  }

  /** Built sprawl meshes by `tile:buildings` (hidden until used). */
  private sprawlCache = new Map<string, Group>();
  private prebuildQueue: Array<[number, number, number, number]> = [];
  private prebuildScheduled = false;

  private sprawlGroup(idx: number, col: number, row: number, buildings: number): Group {
    const key = `${idx}:${buildings}`;
    let group = this.sprawlCache.get(key);
    if (!group) {
      group = mergeStatic(createSprawl(hashInts(col, row, 5), buildings));
      const { x, z } = tileCenter(col, row);
      group.position.set(x, tileTopY(game.terrain[idx]), z);
      group.name = `sprawl-${col}-${row}`;
      group.traverse((o) => (o.raycast = () => {}));
      group.visible = false;
      this.board.add(group);
      this.sprawlCache.set(key, group);
    }
    return group;
  }

  /**
   * Build the sprawl the 2035 / 2050 projections will need while the player is
   * still in 2026, one mesh per idle slice, so the first time-travel transition
   * does not stall on geometry building.
   */
  private schedulePrebuild(): void {
    this.prebuildQueue = [];
    for (const year of [2035, 2050] as const) {
      const st = futureVisualState(game.terrain, game.placements, projectYear(game.terrain, game.placements, year, game.metrics));
      for (const t of st.sprawl) this.prebuildQueue.push([t.row * GRID_COLS + t.col, t.col, t.row, t.buildings]);
    }
    if (this.prebuildScheduled) return;
    this.prebuildScheduled = true;
    const idle = (cb: () => void) =>
      'requestIdleCallback' in window
        ? (window as unknown as { requestIdleCallback(f: () => void, o?: object): void }).requestIdleCallback(cb, { timeout: 500 })
        : setTimeout(cb, 30);
    const step = () => {
      const next = this.prebuildQueue.shift();
      if (!next) {
        this.prebuildScheduled = false;
        return;
      }
      this.sprawlGroup(...next);
      idle(step);
    };
    idle(step);
  }

  private recompute(): void {
    const plan = game.placements;
    const year = viewYear.peek();
    const projected = projectYear(game.terrain, plan, year, game.metrics);
    this.state = futureVisualState(game.terrain, plan, projected);
    const st = this.state;
    // Models may have been swapped (a carried tray piece adopts its look).
    this.crownsDirty = true;

    // Start a transition from whatever is on screen now.
    this.from = { ...this.shown };
    this.to = {
      progress: st.progress,
      dryness: st.dryness,
      activity: st.renewableActivity,
      parkGrowth: st.parkGrowth,
      haze: st.haze,
      treeLoss: st.treeLoss,
      greening: st.greening,
    };
    // Regrowth never covers built or sprawl tiles.
    const occupied = new Set<number>([...plan.map((p) => p.row * GRID_COLS + p.col), ...st.sprawl.map((t) => t.row * GRID_COLS + t.col)]);
    this.regrow.setHiddenLayer('occupied', occupied);
    this.t = prefersReducedMotion() ? 1 : 0;

    // Sprawl: build what the projection needs, fade out what it no longer needs.
    const wanted = new Map(st.sprawl.map((s, i) => [s.row * GRID_COLS + s.col, { s, i }]));
    for (const [idx, e] of this.sprawl) {
      if (!wanted.has(idx)) {
        e.from = e.reveal;
        e.to = 0;
        e.delay = 0;
      }
    }
    for (const [idx, { s, i }] of wanted) {
      const key = `${idx}:${s.buildings}`;
      let e = this.sprawl.get(idx);
      if (e && e.key !== key) {
        e.group.visible = false; // stays cached for later
        e = undefined;
      }
      if (!e) {
        e = { group: this.sprawlGroup(idx, s.col, s.row, s.buildings), key, from: 0, to: 0, reveal: 0, delay: 0 };
        this.sprawl.set(idx, e);
      }
      e.from = e.reveal;
      e.to = 1;
      e.delay = (i / Math.max(1, st.sprawl.length)) * 0.45; // spread out, nearest the town first
    }

    // Sea walls along the seaward edges of at-risk sites, plus amber outlines.
    let w = 0;
    st.floodRisk.forEach((f, i) => {
      const { x, z } = tileCenter(f.col, f.row);
      const y = tileTopY(game.terrain[f.row * GRID_COLS + f.col]);
      for (const [dc, dr] of f.seaward) {
        const wall = this.walls[w++];
        if (!wall) break;
        wall.position.set(x + dc * HALF * 0.96, y, z + dr * HALF * 0.96);
        wall.rotation.y = dc ? Math.PI / 2 : 0;
        wall.userData.active = true;
      }
      const ring = this.rings[i];
      if (ring) {
        ring.position.set(x, y + 0.0026, z); // just above the home's ground pad
        ring.userData.active = true;
      }
    });
    for (; w < this.walls.length; w++) this.walls[w].userData.active = false;
    for (let i = st.floodRisk.length; i < this.rings.length; i++) this.rings[i].userData.active = false;

    if (year === 2026) this.schedulePrebuild();

    // Tray tokens only while editing 2026 (and not while comparing plans).
    const editable = year === 2026 && phase.peek() === 'building' && !compareOpen.peek();
    for (const e of this.queries.tokens.entities) e.object3D!.visible = editable;
  }

  update(delta: number): void {
    if (!this.state) return;
    this.clock += delta;
    const animating = this.t < 1;
    if (animating) this.t = Math.min(1, this.t + delta / DURATION);
    const k = smooth(this.t);
    this.shown = {
      progress: lerp(this.from.progress, this.to.progress, k),
      dryness: lerp(this.from.dryness, this.to.dryness, k),
      activity: lerp(this.from.activity, this.to.activity, k),
      parkGrowth: lerp(this.from.parkGrowth, this.to.parkGrowth, k),
      haze: lerp(this.from.haze, this.to.haze, k),
      treeLoss: lerp(this.from.treeLoss, this.to.treeLoss, k),
      greening: lerp(this.from.greening, this.to.greening, k),
    };
    const s = this.shown;
    // Time wave: expands from the town across the board during a transition.
    const waveOn = animating && !prefersReducedMotion() && Math.abs(this.to.progress - this.from.progress) > 0.01;
    this.wave.visible = waveOn;
    if (waveOn) {
      const r = 0.02 + this.t * 0.62;
      this.wave.scale.set(r, 1, r);
      (this.wave.material as MeshBasicMaterial).opacity = 0.55 * Math.sin(Math.PI * Math.min(1, this.t));
    }
    // Birds over a recovering region.
    const nBirds = Math.round(BIRDS * Math.min(1, s.greening * 1.6));
    this.birds.count = nBirds;
    if (nBirds) {
      for (let i = 0; i < nBirds; i++) {
        const flock = i % 2;
        const a = this.clock * (flock ? 0.35 : -0.28) + (i >> 1) * 0.09 + flock * 2.4;
        const rad = 0.16 + flock * 0.12 + ((i * 37) % 7) * 0.004;
        const flap = prefersReducedMotion() ? 1 : 0.75 + 0.25 * Math.sin(this.clock * 9 + i);
        this.v.set(Math.cos(a) * rad * 1.4 + (flock ? 0.1 : -0.12), 0.13 + flock * 0.03 + ((i * 13) % 5) * 0.003, Math.sin(a) * rad);
        this.q.setFromAxisAngle(this.up, -a + (flock ? 0 : Math.PI));
        this.m.compose(this.v, this.q, this.sc.set(1, flap, 1));
        this.birds.setMatrixAt(i, this.m);
      }
      this.birds.instanceMatrix.needsUpdate = true;
      this.birds.computeBoundingSphere();
    }
    this.q.identity();
    // Smog drifts slowly whenever it is visible (a few mm, never past the board).
    for (const [i, m] of this.smog.entries()) {
      if (m.visible && !prefersReducedMotion()) m.position.x = 0.012 * Math.sin(this.clock * (i ? 0.11 : 0.07) + i);
    }

    if ((animating || this.t === 1) && !this.prewarming) {
      // Sprawl reveal, staggered; fields under visible sprawl give way.
      let hiddenChanged = false;
      for (const [idx, e] of this.sprawl) {
        const local = this.t >= 1 ? 1 : Math.max(0, Math.min(1, (this.t - e.delay) / Math.max(0.2, 1 - e.delay)));
        const r = lerp(e.from, e.to, smooth(local));
        if (Math.abs(r - e.reveal) > 1e-4) {
          const wasShown = e.reveal > 0.35;
          e.reveal = r;
          e.group.visible = r > 0.01;
          e.group.scale.set(1, Math.max(0.01, r), 1);
          if (wasShown !== r > 0.35) hiddenChanged = true;
        }
        if (this.t >= 1 && e.to === 0 && e.reveal <= 0.01) {
          e.group.visible = false; // kept in the cache, not rebuilt next time
          this.sprawl.delete(idx);
        }
      }
      if (hiddenChanged) {
        const tiles = new Set<number>();
        for (const [idx, e] of this.sprawl) if (e.reveal > 0.35) tiles.add(idx);
        boardDecor(this.board)?.setHiddenLayer('sprawl', tiles);
      }

      this.layoutShore(s.progress);
      for (const wall of this.walls) {
        const h = Math.max(0, Math.min(1, (s.progress - 0.25) / 0.5));
        wall.visible = !!wall.userData.active && h > 0.02;
        wall.scale.set(1, Math.max(0.01, h), 1);
      }

      // Vegetation and land: parched when the environment collapses, lush when it recovers.
      this.capsMat.color.copy(WHITE).lerp(DRY_LAND, s.dryness).lerp(LUSH_LAND, s.greening * 0.8);
      const decor = boardDecor(this.board);
      decor?.setLoss(s.treeLoss);
      this.regrow.setLoss(1 - s.greening, ALL_REGROW);
      const lossKey = Math.round(s.treeLoss * 50);
      if (lossKey !== this.scarLoss || hiddenChanged) {
        this.scarLoss = lossKey;
        this.layoutScars();
      }
      for (const [i, m] of this.smog.entries()) {
        const o = s.haze * (i ? 0.8 : 0.95);
        (m.material as MeshBasicMaterial).opacity = o;
        m.visible = o > 0.01;
      }
      if (this.sun) {
        this.sun.intensity = this.sunBase * (1 - 0.45 * s.haze);
        this.sun.color.copy(SUN_COLOR).lerp(HAZY_SUN, s.haze);
      }
      this.waterMat?.color.copy(WHITE).lerp(MURKY_WATER, s.haze * 0.8);
      DECOR_MATERIAL.color.copy(WHITE).lerp(DRY_LEAF, s.dryness);
      LEAF_CROWN.color.copy(CROWN_GREEN).lerp(CROWN_DRY, s.dryness / MAX_DRYNESS);
      SOLAR_GLASS.emissiveIntensity = 0.04 + 0.3 * s.activity;
      rotorSpeed.value = 0.6 + 2.6 * s.activity;
    }

    // Calm pulse on at-risk sites (only in projection years).
    const ringsOn = s.progress > 0.25 || this.prewarming;
    for (const ring of this.rings) ring.visible = ringsOn && !!ring.userData.active;
    if (ringsOn) this.ringMat.opacity = prefersReducedMotion() ? 0.8 : 0.6 + 0.25 * Math.sin(this.clock * 2.4);

    if (this.crownsDirty) {
      this.crowns.length = 0;
      this.eraGroups.length = 0;
      for (const e of this.queries.placeables.entities) {
        const type = e.getValue(Placeable, 'structureType');
        if (type !== 'park' && type !== 'residential') continue;
        e.object3D!.traverse((o) => {
          if (o.name === 'crown') this.crowns.push(o);
          if (/^era-[012]$/.test(o.name)) this.eraGroups.push(o);
        });
      }
      // The existing town evolves with the same eras (solar / green roofs, trees).
      for (const o of this.board.getObjectByName('existing-town')?.children ?? []) {
        if (/^era-[012]$/.test(o.name)) this.eraGroups.push(o);
      }
      this.crownsDirty = false;
      this.shownEra = -1;
    }
    // Villa and town architecture follow the displayed year (switch mid-transition).
    // Tray tokens keep the 2026 look: they are only shown while editing 2026.
    const era = eraForProgress(s.progress);
    if (era !== this.shownEra) {
      for (const g of this.eraGroups) g.visible = g.name === `era-${era}`;
      this.shownEra = era;
    }
    for (const o of this.crowns) o.scale.setScalar((o.userData.baseScale as number) * s.parkGrowth);
  }

  /** Current mapped state (tests / debugging). */
  get visualState(): FutureVisualState | undefined {
    return this.state;
  }

  private rebuildMinis(): void {
    for (const c of [...this.minis.children]) {
      this.minis.remove(c);
      // Dispose per-diorama geometry and label textures; shared materials stay.
      c.traverse((o) => {
        const mesh = o as Mesh;
        mesh.geometry?.dispose();
        const mat = mesh.material as MeshBasicMaterial | undefined;
        if (mat?.map) {
          mat.map.dispose();
          mat.dispose();
        }
      });
    }
    const a = planA.peek();
    if (!compareOpen.peek() || !a) return;
    const b = game.placements;
    const cmp = comparePlans(game.terrain, a, b, 2050);
    const metricRows = (side: 'a' | 'b') => {
      const y = cmp[side];
      const t = side === 'a' ? cmp.aTargets : cmp.bTargets;
      const better = (k: MetricKey) => cmp.better[k] === side.toUpperCase();
      return [
        { label: 'Housed', value: y.population.toLocaleString('en-US'), ok: t.population, better: better('population') },
        { label: 'Nature', value: String(y.environment), ok: t.environment, better: better('environment') },
        { label: 'Renewable', value: `${y.renewableCoverage}%`, ok: t.renewableCoverage, better: better('renewableCoverage') },
        { label: 'Budget', value: String(y.budgetLeft), ok: t.budget, better: better('budgetLeft') },
      ];
    };
    const met = (t: typeof cmp.aTargets) => [t.population, t.environment, t.renewableCoverage, t.budget].filter(Boolean).length;
    const place = (plan: readonly typeof b[number][], side: 'a' | 'b', x: number) => {
      const projected = side === 'a' ? cmp.a : cmp.b;
      const mini = createMiniBoard(game.terrain, plan, futureVisualState(game.terrain, plan, projected));
      mini.name = `mini-plan-${side}`;
      mini.scale.setScalar(MINI_SCALE);
      // Two separate dioramas held low over the front of the table: below the
      // sight lines to the HUD, Plan pad and year buttons, in front of (never
      // through) the main board's turbines, ±35° of a seated gaze, tilted to the eye.
      mini.position.set(BOARD_CENTER[0] + x, BOARD_CENTER[1] + 0.1, BOARD_CENTER[2] + 0.38);
      mini.rotation.x = 0.95;
      const n = met(side === 'a' ? cmp.aTargets : cmp.bTargets);
      const other = met(side === 'a' ? cmp.bTargets : cmp.aTargets);
      const plate = labelPlate({
        title: `PLAN ${side.toUpperCase()} — 2050`,
        verdict: `${n} of 4 targets`,
        winner: n === 4 || (n > other && n > 0),
        metrics: metricRows(side),
      });
      // A sign standing on the diorama's far edge, upright and facing the player.
      plate.position.set(0, 0.17, -0.42);
      plate.rotation.x = -0.95;
      mini.add(plate);
      this.minis.add(mini);
    };
    place(a, 'a', -MINI_GAP);
    place(b, 'b', MINI_GAP);
  }
}
