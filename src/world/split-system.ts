/**
 * Split reality (GODMODE wow moment 1): hold two futures in your hands.
 *
 * Gesture (XR, `two-hand-gesture.ts`): both open hands together over the city,
 * a luminous fracture appears; pull them apart and the world splits — left hand
 * Future A, right hand Future B. Hands together again (held) merges them.
 * Fallbacks: the "Split into two futures" button on the Plan pad, or V.
 *
 * Each future is a miniature of the SAME terrain built from its own plan and
 * its own deterministic projection (`futures.ts`, `createMiniBoard`,
 * `futureVisualState`): no second simulation or renderer. The tabletop is
 * hidden while the futures are out and restored exactly on merge; the plan is
 * never modified. Pinch / tap a future to select it.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  createSystem,
  type Entity,
  Grabbed,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  PlaneGeometry,
  RayInteractable,
  RingGeometry,
  Vector3,
} from '@iwsdk/core';
import { BOARD_CENTER, GRID_COLS, TILE_SIZE } from '../config/scenario.js';
import { sfx } from '../audio/sfx.js';
import * as cmd from '../core/commands.js';
import { futuresOpen, game, phase, planA, streetView, viewYear } from '../core/session.js';
import { Placeable } from '../interactions/placeable-component.js';
import { initialGesture, stepGesture, type GestureState, type HandSample, type Vec3 } from '../interactions/two-hand-gesture.js';
import { checkTargets, projectYear } from '../simulation/projection.js';
import { prefersReducedMotion } from '../ui/accessibility.js';
import { setPanelVisible } from '../ui/panel-visibility.js';
import { futurePair, type Side } from './futures.js';
import { futureVisualState } from './future-visual-state.js';
import { createMiniBoard, labelPlate } from './mini-board.js';
import { compareRows } from './street-compare.js';

/** Scale of each future and its offset from the board centre (world metres). */
const FUTURE_SCALE = 0.5;
const FUTURE_X = 0.25;
const OPEN_TIME = 0.8;
const BOARD_W = GRID_COLS * TILE_SIZE;
const BOARD_D = 10 * TILE_SIZE;

const smooth = (t: number) => t * t * (3 - 2 * t);

export class SplitSystem extends createSystem({
  placeables: { required: [Placeable] },
  held: { required: [Grabbed] },
}) {
  private gesture: GestureState = initialGesture();
  private progress = 0;
  private gestureMode = 'idle';
  private fracture!: Group;
  private fractureMat!: MeshBasicMaterial;
  private fractureGlow = 0;
  private futures = new Group();
  private sides: Partial<Record<Side, { root: Group; entity: Entity; ring: Mesh }>> = {};
  /** 0 = one world, 1 = two futures fully apart. */
  private t = 0;
  private target = 0;
  private builtKey = '';
  private hidden: Object3D[] = [];
  private yearBefore: (typeof viewYear)['value'] | null = null;

  init(): void {
    this.futures.name = 'split-futures';
    this.futures.visible = false;
    this.world.scene.add(this.futures);
    this.buildFracture();

    this.cleanupFuncs.push(
      futuresOpen.subscribe((f) => this.onFutures(f)),
      viewYear.subscribe(() => {
        if (futuresOpen.peek()) this.buildFutures(); // time travel while split
      }),
      planA.subscribe(() => {
        if (futuresOpen.peek()) this.buildFutures();
      }),
    );

    const hook = ((window as unknown as Record<string, unknown>).__terracity ??= {}) as Record<string, unknown>;
    hook.split = () => ({
      open: !!futuresOpen.peek(),
      selected: futuresOpen.peek()?.selected ?? null,
      t: this.t,
      gesture: this.gestureMode,
      progress: this.progress,
      boardVisible: this.world.scene.getObjectByName('terrain-board')?.visible ?? null,
      built: this.builtKey,
      hands: this.hands().map((h) => (h.pos ? h.pos.map((v) => +v.toFixed(3)) : null)),
      /** World centres of the two futures (for hand-ray tests). */
      centres: (['A', 'B'] as Side[]).map((s) => this.sides[s]?.root.getWorldPosition(new Vector3()).toArray() ?? null),
    });
  }

  // ------------------------------------------------------------ gesture --

  private hands(): [HandSample, HandSample] {
    const xr = this.world.renderer.xr.isPresenting;
    const sample = (side: 'left' | 'right'): HandSample => {
      if (!xr) return { pos: null, busy: false };
      const src = this.input.xr.getPrimaryInputSource(side);
      if (!src) return { pos: null, busy: false };
      const p = this.world.player.gripSpaces[side].getWorldPosition(new Vector3());
      const pad = this.input.xr.gamepads[side];
      let busy = false;
      try {
        busy = !!pad && (pad.getSelecting() || pad.getButtonPressed('xr-standard-squeeze'));
      } catch {
        busy = false;
      }
      return { pos: [p.x, p.y, p.z] as Vec3, busy };
    };
    return [sample('left'), sample('right')];
  }

  private stepGesture(dt: number): void {
    const allowed = phase.peek() === 'building' && !streetView.peek() && this.t === this.target;
    let [left, right] = this.hands();
    if (!allowed) left = right = { pos: null, busy: false };
    // Holding a piece is never a split gesture.
    if (this.queries.held.entities.size > 0) left = { ...left, busy: true };
    const step = stepGesture(this.gesture, left, right, !!futuresOpen.peek(), dt);
    this.gesture = step.state;
    this.gestureMode = step.state.mode;
    this.progress = step.progress;
    if (step.event === 'arm') sfx.fracture();
    if (step.event === 'split') cmd.openFutures();
    if (step.event === 'merge') cmd.closeFutures();
    // Fracture: visible while armed (split) or merging, intensity = progress.
    const show = step.state.mode === 'armed' || step.state.mode === 'merging' || step.state.mode === 'arming';
    const want = !show ? 0 : step.state.mode === 'arming' ? 0.25 * step.progress : 0.35 + 0.65 * step.progress;
    this.fractureGlow += (want - this.fractureGlow) * Math.min(1, dt * 14);
    if (step.mid && !futuresOpen.peek()) this.fracture.position.x = Math.max(-0.3, Math.min(0.3, step.mid[0] - BOARD_CENTER[0]));
  }

  // ----------------------------------------------------------- fracture --

  private buildFracture(): void {
    // A vertical sheet of light across the board (front to back), brightest at
    // the board surface, plus a thin glowing seam on the surface.
    const canvas = document.createElement('canvas');
    canvas.width = 8;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 128, 0, 0);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(180,230,255,0.6)');
    g.addColorStop(1, 'rgba(120,200,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 8, 128);
    const tex = new CanvasTexture(canvas);
    this.fractureMat = new MeshBasicMaterial({ map: tex, color: '#bfe8ff', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false });
    const sheet = new Mesh(new PlaneGeometry(BOARD_D, 0.12).rotateY(Math.PI / 2).translate(0, 0.06 + 0.035, 0), this.fractureMat);
    const seam = new Mesh(new BoxGeometry(0.004, 0.002, BOARD_D), this.fractureMat);
    seam.position.y = 0.036;
    this.fracture = new Group();
    this.fracture.name = 'split-fracture';
    this.fracture.add(sheet, seam);
    this.fracture.traverse((o) => (o.raycast = () => {}));
    this.fracture.visible = false;
    this.fracture.position.set(0, 0, 0);
    const board = this.world.scene.getObjectByName('terrain-board');
    (board ?? this.world.scene).add(this.fracture);
  }

  // ------------------------------------------------------------ futures --

  private onFutures(f: { selected: Side | null } | null): void {
    if (f && this.target === 0) {
      this.target = 1;
      // The futures are shown in 2050 (2026 is the shared present); restored on merge.
      this.yearBefore = viewYear.peek();
      if (viewYear.peek() === 2026) viewYear.value = 2050;
      this.buildFutures();
      this.hideTable();
      this.futures.visible = true;
      sfx.split();
      if (prefersReducedMotion()) this.t = 1;
    } else if (!f && this.target === 1) {
      this.target = 0;
      if (this.yearBefore !== null) viewYear.value = this.yearBefore;
      this.yearBefore = null;
      sfx.merge();
      if (prefersReducedMotion()) this.t = 0;
    }
    this.paintSelection(f?.selected ?? null);
  }

  private buildFutures(): void {
    const pair = futurePair(planA.peek(), game.placements, viewYear.peek());
    const key = `${pair.year}|${pair.A.title}:${pair.A.plan.map((p) => p.id + p.col + p.row).join(',')}|${pair.B.title}:${pair.B.plan.map((p) => p.id + p.col + p.row).join(',')}`;
    if (key === this.builtKey) return;
    this.builtKey = key;
    this.disposeFutures();
    const rows = compareRows(game.terrain, pair.A.plan, pair.B.plan, pair.year);
    for (const side of ['A', 'B'] as Side[]) {
      const f = pair[side];
      const projected = projectYear(game.terrain, f.plan, pair.year);
      const mini = createMiniBoard(game.terrain, f.plan, futureVisualState(game.terrain, f.plan, projected));
      const root = new Group();
      root.name = `future-${side}`;
      root.add(mini);
      // Label standing on the far edge: title, year, verdict and the four numbers.
      const checks = checkTargets(projected);
      const met = [checks.population, checks.environment, checks.renewableCoverage, checks.budget].filter(Boolean).length;
      const plate = labelPlate({
        title: `${side}: ${f.title}`.toUpperCase(),
        verdict: `${met}/4`,
        winner: met === 4,
        metrics: rows.map((r) => ({
          label: r.label.replace(' (target 60)', ''),
          value: side === 'A' ? r.a : r.b,
          ok: r.better === side || r.better === 'tie',
          better: r.better === side,
        })),
      });
      plate.position.set(0, 0.14, -BOARD_D / 2 - 0.02);
      plate.scale.setScalar(0.85);
      mini.add(plate);
      // Selection ring under the future, and an invisible hit box to pinch / tap it.
      const ring = new Mesh(
        new RingGeometry(0.52, 0.56, 64).rotateX(-Math.PI / 2).scale(1, 1, BOARD_D / BOARD_W),
        new MeshBasicMaterial({ color: '#ffd36b', transparent: true, opacity: 0.9, depthWrite: false }),
      );
      ring.position.y = -0.03;
      ring.visible = false;
      ring.raycast = () => {};
      mini.add(ring);
      const hit = new Mesh(new BoxGeometry(BOARD_W, 0.12, BOARD_D), new MeshBasicMaterial({ visible: false }));
      hit.position.y = 0.05;
      mini.add(hit);
      const entity = this.world.createTransformEntity(root);
      entity.addComponent(RayInteractable);
      root.addEventListener('click' as never, (() => cmd.selectFuture(side)) as never);
      this.futures.add(root);
      this.sides[side] = { root, entity, ring };
    }
    this.layout();
    this.paintSelection(futuresOpen.peek()?.selected ?? null);
  }

  private disposeFutures(): void {
    for (const side of ['A', 'B'] as Side[]) {
      const s = this.sides[side];
      if (!s) continue;
      s.root.traverse((o) => {
        const m = o as Mesh;
        if (!m.isMesh) return;
        m.geometry?.dispose();
        const mat = m.material as MeshBasicMaterial;
        if (mat?.map && mat.map.image instanceof HTMLCanvasElement) {
          mat.map.dispose();
          mat.dispose();
        }
      });
      s.entity.dispose({ disposeResources: false });
      this.futures.remove(s.root);
      delete this.sides[side];
    }
  }

  private paintSelection(selected: Side | null): void {
    for (const side of ['A', 'B'] as Side[]) {
      const s = this.sides[side];
      if (s) s.ring.visible = selected === side;
    }
  }

  /** Place the futures for the current opening amount `t`. */
  private layout(): void {
    const k = smooth(this.t);
    const scale = 1 + (FUTURE_SCALE - 1) * k;
    for (const side of ['A', 'B'] as Side[]) {
      const s = this.sides[side];
      if (!s) continue;
      const dir = side === 'A' ? -1 : 1;
      s.root.position.set(BOARD_CENTER[0] + dir * (0.015 + (FUTURE_X - 0.015) * k), BOARD_CENTER[1] + 0.02 * k, BOARD_CENTER[2] - 0.02 * k);
      s.root.scale.setScalar(scale);
      s.root.rotation.set(0.1 * k, -dir * 0.2 * k, 0); // turned toward the seated viewer
    }
  }

  private hideTable(): void {
    const hide = (o: Object3D | undefined) => {
      if (o && o.visible) {
        o.visible = false;
        this.hidden.push(o);
      }
    };
    hide(this.world.scene.getObjectByName('terrain-board'));
    hide(this.world.scene.getObjectByName('supply-tray'));
    hide(this.world.scene.getObjectByName('plan-comparison-minis'));
    for (const e of this.queries.placeables.entities) hide(e.object3D!);
    setPanelVisible(this.world, 'tray-labels', false);
  }

  private restoreTable(): void {
    for (const o of this.hidden) o.visible = true;
    this.hidden = [];
    setPanelVisible(this.world, 'tray-labels', true);
  }

  update(delta: number): void {
    this.stepGesture(delta);
    this.fracture.visible = this.fractureGlow > 0.01;
    this.fractureMat.opacity = this.fractureGlow * (0.85 + 0.15 * Math.sin(performance.now() / 70));

    if (this.t !== this.target) {
      this.t = Math.max(0, Math.min(1, this.t + (this.target > this.t ? 1 : -1) * (delta / OPEN_TIME)));
      this.layout();
      if (this.t === 0 && this.target === 0) {
        this.futures.visible = false;
        this.disposeFutures();
        this.builtKey = '';
        this.restoreTable();
      }
    }
  }
}
