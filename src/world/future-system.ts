/**
 * Visual consequences of time travel. Every parameter comes from
 * `futureVisualState()` (simulation -> visuals mapping, unit-tested); this
 * system only animates toward it over ~1.4 s:
 *  - unplanned sprawl rises on the projected tiles (density = residents),
 *    and the fields/meadows under it give way;
 *  - vegetation, fields and park trees fade toward dry ochre as the projected
 *    environment falls (restrained), and stay vibrant when it holds;
 *  - the sea creeps onto the beaches; at-risk coastal sites get sea walls and
 *    a calm amber outline;
 *  - solar glass glows and rotors turn with projected renewable coverage;
 *  - park trees grow with maturity.
 * Also hosts the side-by-side Plan A / Plan B miniatures.
 */
import {
  BoxGeometry,
  CanvasTexture,
  MeshBasicMaterial,
  PlaneGeometry,
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
import { futureVisualState, MAX_DRYNESS, type FutureVisualState } from './future-visual-state.js';
import { createSprawl } from './houses.js';
import { mergeStatic } from './merge.js';
import { createMiniBoard } from './mini-board.js';
import { hashInts } from './rand.js';
import { LEAF_CROWN, SOLAR_GLASS } from './structure-models.js';
import { DECOR_MATERIAL } from './terrain-decor.js';
import { tileAt } from './terrain-map.js';

const DURATION = 1.4; // seconds per time-travel transition
const MINI_SCALE = 0.36;
const HALF = TILE_SIZE / 2;
const WHITE = new Color('#ffffff');
const DRY_LAND = new Color('#d6b979');
const DRY_LEAF = new Color('#c9a95c');
const CROWN_GREEN = new Color('#5a9b45');
const CROWN_DRY = new Color('#a89a5f');
const POOL = 8;

/** Rotor speed (rad/s) read by the placement system; driven by renewable activity. */
export const rotorSpeed = { value: 2.2 };

interface Shown {
  progress: number;
  dryness: number;
  activity: number;
  parkGrowth: number;
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
  private from: Shown = { progress: 0, dryness: 0, activity: 0.17, parkGrowth: 1 };
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

    // Test/debug hook: the mapped visual state and what is on screen now.
    const hook = ((window as unknown as Record<string, unknown>).__terracity ??= {}) as Record<string, unknown>;
    hook.futureVisuals = () => ({
      state: this.state && { ...this.state },
      shown: { ...this.shown },
      sprawlVisible: [...this.sprawl.values()].filter((e) => e.group.visible).length,
      wallsVisible: this.walls.filter((w) => w.visible).length,
      ringsVisible: this.rings.filter((r) => r.visible).length,
      transitionDone: this.t >= 1,
    });

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
      compareOpen.subscribe(() => this.rebuildMinis()),
      planA.subscribe(() => this.rebuildMinis()),
      planVersion.subscribe(() => this.rebuildMinis()),
    );
  }

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
      new MeshStandardMaterial({ color: '#5fd3cf', transparent: true, opacity: 0.62, roughness: 0.15, metalness: 0.1 }),
      this.shoreItems.length,
    );
    this.shore.name = 'sea-level-rise';
    this.shore.raycast = () => {};
    this.board.add(this.shore);
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
    });
    this.shore.instanceMatrix.needsUpdate = true;
    this.shore.visible = rise > 0.01;
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

  private recompute(): void {
    const plan = game.placements;
    const year = viewYear.peek();
    const projected = projectYear(game.terrain, plan, year, game.metrics);
    this.state = futureVisualState(game.terrain, plan, projected);
    const st = this.state;

    // Start a transition from whatever is on screen now.
    this.from = { ...this.shown };
    this.to = { progress: st.progress, dryness: st.dryness, activity: st.renewableActivity, parkGrowth: st.parkGrowth };
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
      const key = `${s.buildings}`;
      let e = this.sprawl.get(idx);
      if (e && e.key !== key) {
        this.board.remove(e.group);
        e = undefined;
      }
      if (!e) {
        const group = mergeStatic(createSprawl(hashInts(s.col, s.row, 5), s.buildings));
        const tile = game.terrain[idx];
        const { x, z } = tileCenter(s.col, s.row);
        group.position.set(x, tileTopY(tile), z);
        group.name = `sprawl-${s.col}-${s.row}`;
        group.traverse((o) => (o.raycast = () => {}));
        group.visible = false;
        this.board.add(group);
        e = { group, key, from: 0, to: 0, reveal: 0, delay: 0 };
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

    // Tray tokens only while editing 2026.
    const editable = year === 2026 && phase.peek() === 'building';
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
    };
    const s = this.shown;

    if (animating || this.t === 1) {
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
          this.board.remove(e.group);
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

      // Vegetation and land: restrained tint toward dry ochre.
      this.capsMat.color.copy(WHITE).lerp(DRY_LAND, s.dryness);
      DECOR_MATERIAL.color.copy(WHITE).lerp(DRY_LEAF, s.dryness);
      LEAF_CROWN.color.copy(CROWN_GREEN).lerp(CROWN_DRY, s.dryness / MAX_DRYNESS);
      SOLAR_GLASS.emissiveIntensity = 0.04 + 0.3 * s.activity;
      rotorSpeed.value = 0.6 + 2.6 * s.activity;
    }

    // Calm pulse on at-risk sites (only in projection years).
    const ringsOn = s.progress > 0.25;
    for (const ring of this.rings) ring.visible = ringsOn && !!ring.userData.active;
    if (ringsOn) this.ringMat.opacity = prefersReducedMotion() ? 0.8 : 0.6 + 0.25 * Math.sin(this.clock * 2.4);

    if (this.crownsDirty) {
      this.crowns.length = 0;
      for (const e of this.queries.placeables.entities) {
        if (e.getValue(Placeable, 'structureType') !== 'park') continue;
        e.object3D!.traverse((o) => {
          if (o.name === 'crown') this.crowns.push(o);
        });
      }
      this.crownsDirty = false;
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
      c.traverse((o) => {
        const mesh = o as Mesh;
        mesh.geometry?.dispose();
        (mesh.material as MeshStandardMaterial | undefined)?.dispose?.();
      });
    }
    const a = planA.peek();
    if (!compareOpen.peek() || !a) return;
    const b = game.placements;
    const place = (plan: readonly typeof b[number][], x: number, label: string) => {
      const mini = createMiniBoard(game.terrain, plan, projectYear(game.terrain, plan, 2050));
      mini.scale.setScalar(MINI_SCALE);
      // Float the two 2050 cities over the front of the table, between the side
      // panels and inside a comfortable field of view, tilted to the seated eye.
      mini.position.set(BOARD_CENTER[0] + x, BOARD_CENTER[1] + 0.17, BOARD_CENTER[2] + 0.06);
      mini.rotation.x = 0.7;
      mini.add(labelPlate(label));
      this.minis.add(mini);
    };
    place(a, -0.165, 'Plan A - 2050');
    place(b, 0.165, 'Plan B - 2050');
  }
}


/** Flat text plate in front of a mini board (canvas texture; ASCII only). */
function labelPlate(text: string): Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#1d5f6b';
  ctx.beginPath();
  ctx.roundRect(0, 0, 512, 96, 40);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 56px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 50);
  const plate = new Mesh(
    new PlaneGeometry(0.42, 0.079),
    new MeshBasicMaterial({ map: new CanvasTexture(canvas), transparent: true }),
  );
  plate.position.set(0, 0.06, 0.36); // just in front of the mini board (board-local metres)
  plate.rotation.x = -0.3;
  plate.raycast = () => {};
  return plate;
}
