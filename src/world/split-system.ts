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
  OneHandGrabbable,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  PlaneGeometry,
  RayInteractable,
  type Material,
  Plane,
  RingGeometry,
  SRGBColorSpace,
  SphereGeometry,
  Vector3,
} from '@iwsdk/core';
import { BOARD_CENTER, GRID_COLS, TILE_SIZE } from '../config/scenario.js';
import { sfx } from '../audio/sfx.js';
import * as cmd from '../core/commands.js';
import { futuresOpen, game, outroOpen, phase, planA, seamPos, streetView, tutorial, viewYear } from '../core/session.js';
import { localXFromSeam, seamFromLocalX, seamReport } from '../interactions/reality-seam.js';
import { Placeable } from '../interactions/placeable-component.js';
import { initialGesture, stepGesture, type GestureState, type HandSample, type Vec3 } from '../interactions/two-hand-gesture.js';
import { checkTargets, projectYear } from '../simulation/projection.js';
import { prefersReducedMotion } from '../ui/accessibility.js';
import { setPanelVisible } from '../ui/panel-visibility.js';
import { futurePair, type Side } from './futures.js';
import { futureVisualState } from './future-visual-state.js';
import { createMiniBoard } from './mini-board.js';
import { compareRows } from './street-compare.js';

/** Scale of each future and its offset from the board centre (world metres). */
const FUTURE_SCALE = 0.5;
const FUTURE_X = 0.25;
const OPEN_TIME = 0.8;
/** A held future this close to the eyes (m) is entered. */
const ENTER_DISTANCE = 0.35;
/** Duration (s) of the dive into a future. */
const DIVE_TIME = 0.45;
/** Reality Seam: height of the handle and of the ray / mouse drag surface above the board centre. */
const SEAM_KNOB_Y = 0.05;
const SEAM_DRAG_Y = 0.045;
const BOARD_W = GRID_COLS * TILE_SIZE;
const BOARD_D = 10 * TILE_SIZE;

const smooth = (t: number) => t * t * (3 - 2 * t);

/**
 * Clipping planes of the two futures (shared so that anything drawn on a
 * future, e.g. Causality Vision rings, is cut by the same seam).
 */
export const seamClipPlanes: Record<Side, Plane> = { A: new Plane(new Vector3(-1, 0, 0), 0), B: new Plane(new Vector3(1, 0, 0), 0) };

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
  private sides: Partial<Record<Side, { root: Group; entity: Entity; ring: Mesh; hit: Mesh }>> = {};
  /** 0 = one world, 1 = two futures fully apart. */
  private t = 0;
  private target = 0;
  private builtKey = '';
  private hidden: Object3D[] = [];
  private yearBefore: (typeof viewYear)['value'] | null = null;
  /** The future being pulled into ("become small"): it grows toward the viewer, then the street opens. */
  private diving: { side: Side; t: number; from: Vector3; scale: number } | null = null;

  init(): void {
    this.futures.name = 'split-futures';
    this.futures.visible = false;
    this.world.scene.add(this.futures);
    this.buildFracture();
    this.hint = this.card(1024, 200);
    this.hint.mesh.name = 'split-hint';
    this.hint.mesh.scale.setScalar(0.08);
    this.world.scene.add(this.hint.mesh);
    this.tagline = this.card(1400, 160);
    this.tagline.mesh.name = 'tagline';
    this.tagline.mesh.scale.setScalar(0.06);
    this.paintCard(this.tagline, ["THE FUTURE ISN'T WRITTEN. CHANGE IT."], 64, 'rgba(15,42,48,0.82)', '#ffe6a6');
    this.world.scene.add(this.tagline.mesh);

    this.cleanupFuncs.push(
      futuresOpen.subscribe((f) => this.onFutures(f)),
      viewYear.subscribe(() => {
        if (futuresOpen.peek()) this.buildFutures(); // time travel while split
      }),
      // Inside a future at street level: the miniatures step aside; back on return.
      streetView.subscribe((v) => {
        if (!futuresOpen.peek()) return;
        // Inside a future the miniatures are hidden and must not catch rays.
        this.setPickable(!v && seamPos.peek() === null);
        for (const side of ['A', 'B'] as Side[]) {
          const r = this.sides[side]?.root;
          if (r) r.visible = !v;
        }
        if (!v) {
          this.diving = null;
          this.futures.visible = true;
          this.layout();
          setPanelVisible(this.world, 'tray-labels', false);
        }
      }),
      planA.subscribe(() => {
        if (futuresOpen.peek()) this.buildFutures();
      }),
      // Reality Seam: lay both futures on the table, aligned; side by side again when closed.
      seamPos.subscribe((u) => {
        if (!futuresOpen.peek()) return;
        this.target = u === null ? 1 : 0;
        if (prefersReducedMotion()) {
          this.t = this.target;
          this.layout();
        }
        this.setPickable(u === null && !streetView.peek());
        this.updateClipping();
      }),
    );
    this.buildSeam();

    const hook = ((window as unknown as Record<string, unknown>).__terracity ??= {}) as Record<string, unknown>;
    /** Test hook: select a future (what a pinch / tap on it does). */
    hook.selectFuture = (side: Side) => cmd.selectFuture(side);
    /** Page pixel of the seam drag surface at seam position u (desktop drag tests). */
    hook.seamToScreen = (u: number) => {
      const v = new Vector3(BOARD_CENTER[0] + localXFromSeam(u), BOARD_CENTER[1] + SEAM_DRAG_Y, BOARD_CENTER[2] + BOARD_D * 0.25).project(this.world.camera);
      const r = this.world.renderer.domElement.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    };
    /** World position of the seam handle at u (hand tests). */
    hook.seamHandleAt = (u: number) => [BOARD_CENTER[0] + localXFromSeam(u), BOARD_CENTER[1] + SEAM_KNOB_Y, BOARD_CENTER[2] + BOARD_D / 2 + 0.03];
    /** Visual evidence only: freeze the split transition at t (0..1); null resumes. */
    hook.splitFreeze = (t: number | null) => {
      this.frozen = t;
      if (t !== null) {
        this.t = t;
        this.layout();
        this.updateClipping();
        this.fractureGlow = Math.max(0, 1 - t * 1.6);
      }
    };
    hook.split = () => ({
      open: !!futuresOpen.peek(),
      selected: futuresOpen.peek()?.selected ?? null,
      t: this.t,
      gesture: this.gestureMode,
      progress: this.progress,
      hint: this.hint?.mesh.visible ?? false,
      comparison: this.comparison?.mesh.visible ? this.comparison.key : '',
      tagline: this.tagline?.mesh.visible ?? false,
      boardVisible: this.world.scene.getObjectByName('terrain-board')?.visible ?? null,
      built: this.builtKey,
      diving: this.diving?.side ?? null,
      grabbable: (['A', 'B'] as Side[]).filter((x) => this.sides[x]?.entity.hasComponent(OneHandGrabbable)),
      hands: this.hands().map((h) => (h.pos ? h.pos.map((v) => +v.toFixed(3)) : null)),
      seam: seamPos.peek(),
      seamVisible: this.seamGroup?.visible ?? false,
      seamReport: this.seamKey,
      seamHeld: this.seamHandleEntity?.hasComponent(Grabbed) ?? false,
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

  // -------------------------------------------------------- hint, tagline --

  private hint!: { mesh: Mesh; ctx: CanvasRenderingContext2D; tex: CanvasTexture; key: string };
  private tagline!: { mesh: Mesh; ctx: CanvasRenderingContext2D; tex: CanvasTexture; key: string };
  private taglineT = 0;

  private card(w: number, h: number) {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    const mesh = new Mesh(new PlaneGeometry(w / h, 1), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
    mesh.renderOrder = 6;
    mesh.visible = false;
    mesh.raycast = () => {};
    return { mesh, ctx, tex, key: '' };
  }

  private paintCard(c: { ctx: CanvasRenderingContext2D; tex: CanvasTexture; key: string }, lines: string[], size: number, bg: string, fg: string): void {
    const key = lines.join('|');
    if (c.key === key) return;
    c.key = key;
    const { ctx } = c;
    const { width: w, height: h } = ctx.canvas;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(6, 6, w - 12, h - 12, h / 4);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Shrink to fit the widest line (never cut a sentence).
    let px = size;
    ctx.font = `bold ${px}px system-ui, sans-serif`;
    while (px > 18 && Math.max(...lines.map((l) => ctx.measureText(l).width)) > w - 60) {
      px -= 2;
      ctx.font = `bold ${px}px system-ui, sans-serif`;
    }
    lines.forEach((l, i) => ctx.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * px * 1.15));
    c.tex.needsUpdate = true;
  }

  /** Floating guidance and the tagline: shown only when relevant, always facing the viewer. */
  private stepCards(delta: number): void {
    const cam = this.world.camera.getWorldPosition(new Vector3());
    const tip = tutorial.active && tutorial.step === 'split' && phase.peek() === 'building' && !futuresOpen.peek() && !streetView.peek() && viewYear.peek() === 2026;
    const xr = this.world.renderer.xr.isPresenting;
    if (tip) {
      this.paintCard(
        this.hint,
        xr ? ['<  Both open hands together here,  >', 'then pull them apart'] : ['Split into two futures:', 'tap the button or press V'],
        58,
        'rgba(255,230,166,0.92)',
        '#3a2a00',
      );
      // Over the middle of the city, bobbing gently.
      this.hint.mesh.position.set(BOARD_CENTER[0], BOARD_CENTER[1] + (xr ? 0.17 : 0.12) + 0.006 * Math.sin(performance.now() / 400), BOARD_CENTER[2] + 0.05);
      this.hint.mesh.lookAt(cam);
    }
    const hm = this.hint.mesh.material as MeshBasicMaterial;
    hm.opacity += ((tip ? 1 : 0) - hm.opacity) * Math.min(1, delta * 5);
    this.hint.mesh.visible = hm.opacity > 0.02 && this.fractureGlow < 0.3;
    // Tagline above two plans of yours (Plan A vs Plan B): the final reveal.
    const reveal = !!futuresOpen.peek() && !!planA.peek() && !streetView.peek() && this.t === 1;
    this.taglineT = reveal ? this.taglineT + delta : 0;
    const tm = this.tagline.mesh.material as MeshBasicMaterial;
    tm.opacity += ((reveal && this.taglineT > 1 ? 1 : 0) - tm.opacity) * Math.min(1, delta * 2);
    this.tagline.mesh.visible = tm.opacity > 0.02;
    if (this.tagline.mesh.visible) {
      // Between and below the two futures' labels, above the miniatures.
      this.tagline.mesh.position.set(BOARD_CENTER[0], BOARD_CENTER[1] + 0.17, BOARD_CENTER[2] + 0.08);
      this.tagline.mesh.lookAt(cam);
    }
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
      // A small title tag on the far edge: which future this is, and targets met.
      const checks = checkTargets(projected);
      const met = [checks.population, checks.environment, checks.renewableCoverage, checks.budget].filter(Boolean).length;
      const tag = this.titleTag(`${side}  ${f.title}`, `${met} of 4 targets`, side === 'A' ? '#8fd3ff' : '#ffd36b');
      tag.position.set(0, 0.09, -BOARD_D / 2 - 0.02);
      tag.name = 'future-tag';
      mini.add(tag);
      // Clipping: at the split each future first shows only its half of the table.
      this.clipMaterials(mini, side);
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
      this.sides[side] = { root, entity, ring, hit };
    }
    this.paintComparison(rows, pair.year, pair.A.title, pair.B.title);
    this.layout();
    this.paintSelection(futuresOpen.peek()?.selected ?? null);
  }

  // ---------------------------------------------- split moment, comparison --

  private clipPlanes = seamClipPlanes;
  private clipMats: Material[] = [];

  /** Give a future its own material copies, clipped to its half while splitting. */
  private clipMaterials(mini: Object3D, side: Side): void {
    const plane = this.clipPlanes[side];
    const copies = new Map<Material, Material>();
    mini.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh || !m.material || Array.isArray(m.material)) return;
      let c = copies.get(m.material);
      if (!c) {
        c = m.material.clone();
        c.clippingPlanes = [plane];
        copies.set(m.material, c);
        this.clipMats.push(c);
      }
      m.material = c;
    });
  }

  /**
   * The seam stays fixed in the world, at the middle of the table: Future A
   * shows only what is left of it, Future B only what is right of it. As they
   * pull apart each one slides out of the seam and appears whole — they never
   * overlap. Once apart, clipping is off.
   */
  private updateClipping(): void {
    // Reality Seam: the boundary sits where the user put it; else the middle.
    const u = seamPos.peek();
    const seam = BOARD_CENTER[0] + (u === null ? 0 : localXFromSeam(u));
    const off = this.t >= 1 ? 1e3 : 0;
    this.clipPlanes.A.set(new Vector3(-1, 0, 0), seam + off);
    this.clipPlanes.B.set(new Vector3(1, 0, 0), -seam + off);
  }

  private titleTag(title: string, sub: string, accent: string): Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = 768;
    canvas.height = 160;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(15,32,38,0.82)';
    ctx.beginPath();
    ctx.roundRect(4, 4, 760, 152, 40);
    ctx.fill();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(70, 80, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f2026';
    ctx.font = 'bold 44px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title[0], 70, 82);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 50px system-ui, sans-serif';
    ctx.fillText(title.slice(1).trim().toUpperCase(), 124, 62);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = '36px system-ui, sans-serif';
    ctx.fillText(sub, 124, 116);
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    const m = new Mesh(new PlaneGeometry(0.42, 0.0875), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    m.raycast = () => {};
    return m;
  }

  private comparison!: { mesh: Mesh; ctx: CanvasRenderingContext2D; tex: CanvasTexture; key: string };

  /** One compact strip between the futures: the differences that matter, A | B. */
  private paintComparison(rows: ReturnType<typeof compareRows>, year: number, a: string, b: string): void {
    if (!this.comparison) {
      const canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 400;
      const tex = new CanvasTexture(canvas);
      tex.colorSpace = SRGBColorSpace;
      const mesh = new Mesh(new PlaneGeometry(1024 / 400, 1), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
      mesh.name = 'futures-comparison';
      mesh.raycast = () => {};
      mesh.renderOrder = 6;
      mesh.visible = false;
      this.world.scene.add(mesh);
      this.comparison = { mesh, ctx: canvas.getContext('2d')!, tex, key: '' };
    }
    const { ctx, tex } = this.comparison;
    this.comparison.key = `${year}|${rows.map((r) => `${r.label}:${r.a}/${r.b}:${r.better}`).join('|')}`;
    ctx.clearRect(0, 0, 1024, 400);
    ctx.fillStyle = 'rgba(250,248,242,0.94)';
    ctx.beginPath();
    ctx.roundRect(4, 4, 1016, 392, 36);
    ctx.fill();
    ctx.font = 'bold 34px system-ui, sans-serif';
    ctx.fillStyle = '#1d5f6b';
    ctx.fillText(`In ${year}`, 40, 56);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#2b6f9a';
    ctx.fillText(`A  ${a}`.slice(0, 20), 690, 56);
    ctx.fillStyle = '#9a6a00';
    ctx.fillText(`B  ${b}`.slice(0, 20), 990, 56);
    rows.forEach((r, i) => {
      const y = 116 + i * 68;
      ctx.textAlign = 'left';
      ctx.fillStyle = '#3d5a60';
      ctx.font = '36px system-ui, sans-serif';
      ctx.fillText(r.label.replace(' (target 60)', ' (goal 60)'), 40, y);
      for (const [side, x, val] of [['A', 690, r.a], ['B', 990, r.b]] as const) {
        const best = r.better === side;
        ctx.textAlign = 'right';
        ctx.fillStyle = best ? '#0f7a6f' : '#2b2620';
        ctx.font = `${best ? 'bold ' : ''}38px system-ui, sans-serif`;
        ctx.fillText(`${best ? '\u2713 ' : ''}${val}`, x, y);
      }
    });
    tex.needsUpdate = true;
  }

  private disposeFutures(): void {
    for (const m of this.clipMats) m.dispose();
    this.clipMats = [];
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
      if (!s) continue;
      s.ring.visible = selected === side;
      // The selected future can be pinched and pulled toward you to enter it.
      // (Grabbable entities ignore rays, so only the selected one is grabbable.)
      const want = selected === side;
      if (want && !s.entity.hasComponent(OneHandGrabbable)) s.entity.addComponent(OneHandGrabbable, { rotate: false });
      if (!want && s.entity.hasComponent(OneHandGrabbable)) s.entity.removeComponent(OneHandGrabbable);
    }
  }

  /** Place the futures for the current opening amount `t`. */
  private layout(): void {
    for (const side of ['A', 'B'] as Side[]) {
      const s = this.sides[side];
      if (!s) continue;
      // Title tags appear once the futures are apart (no half-clipped labels).
      const tag = s.root.getObjectByName('future-tag');
      if (tag) tag.visible = this.t > 0.85;
      const p = this.pose(side, this.t);
      s.root.position.copy(p.pos);
      s.root.scale.setScalar(p.scale);
      s.root.rotation.set(p.rx, p.ry, 0);
    }
  }

  private pose(side: Side, t: number): { pos: Vector3; scale: number; rx: number; ry: number } {
    // t = 0: both futures lie exactly where the table is (each clipped to its
    // half, so together they ARE the table); they then pull apart, shrink and
    // turn toward the seated viewer.
    const k = smooth(t);
    const dir = side === 'A' ? -1 : 1;
    return {
      pos: new Vector3(BOARD_CENTER[0] + dir * FUTURE_X * k, BOARD_CENTER[1] + 0.03 * k, BOARD_CENTER[2] - 0.03 * k),
      scale: 1 + (FUTURE_SCALE - 1) * k,
      rx: 0.1 * k,
      ry: -dir * 0.2 * k,
    };
  }

  /** Pulled toward the face, or released: enter, or float back into place. */
  private stepHeld(delta: number): void {
    if (!futuresOpen.peek() || streetView.peek() || this.t !== 1) return;
    const head = this.world.camera.getWorldPosition(new Vector3());
    for (const side of ['A', 'B'] as Side[]) {
      const s = this.sides[side];
      if (!s) continue;
      if (this.diving?.side === side) continue;
      if (s.entity.hasComponent(Grabbed)) {
        // Brought close to the eyes: become small.
        if (s.root.getWorldPosition(new Vector3()).distanceTo(head) < ENTER_DISTANCE) {
          this.diving = { side, t: 0, from: s.root.position.clone(), scale: s.root.scale.x };
          s.entity.removeComponent(OneHandGrabbable); // let go of the hand
          sfx.enter();
        }
        continue;
      }
      // Not held: drift back to its place on the table.
      const p = this.pose(side, 1);
      const k = Math.min(1, delta * 6);
      s.root.position.lerp(p.pos, k);
      s.root.scale.setScalar(s.root.scale.x + (p.scale - s.root.scale.x) * k);
      s.root.rotation.set(p.rx, p.ry, 0);
    }
  }

  // ------------------------------------------------------- reality seam --

  private seamGroup!: Group;
  private seamKnob!: Mesh;
  private seamDrag!: Mesh;
  private seamHandle!: Mesh;
  private seamHandleEntity!: Entity;
  private seamLabel!: { mesh: Mesh; ctx: CanvasRenderingContext2D; tex: CanvasTexture; key: string };
  private seamTags!: Record<Side, { mesh: Mesh; ctx: CanvasRenderingContext2D; tex: CanvasTexture; key: string }>;
  private seamKey = '';
  private seamDragging = false;

  /**
   * The seam: a thin wall of light across the table, a golden handle on the
   * near edge (pinch it and move your hand sideways), a drag surface for rays
   * and the mouse, labels for the two sides, and a line that says what differs
   * in the column under the seam (from the two projections only).
   */
  private buildSeam(): void {
    const g = new Group();
    g.name = 'reality-seam';
    g.visible = false;
    const wallMat = new MeshBasicMaterial({ color: '#fff3d1', transparent: true, opacity: 0.35, depthWrite: false, blending: AdditiveBlending });
    const wall = new Mesh(new BoxGeometry(0.0025, 0.07, BOARD_D + 0.02).translate(0, 0.035, 0), wallMat);
    const edge = new Mesh(new BoxGeometry(0.0012, 0.0012, BOARD_D + 0.02).translate(0, 0.07, 0), new MeshBasicMaterial({ color: '#ffffff' }));
    this.seamKnob = new Mesh(new SphereGeometry(0.012, 16, 12), new MeshBasicMaterial({ color: '#ffd36b' }));
    this.seamKnob.position.set(0, SEAM_KNOB_Y, BOARD_D / 2 + 0.03);
    const halo = new Mesh(new SphereGeometry(0.02, 16, 12), new MeshBasicMaterial({ color: '#ffe6a6', transparent: true, opacity: 0.3, depthWrite: false, blending: AdditiveBlending }));
    this.seamKnob.add(halo);
    const stem = new Mesh(new BoxGeometry(0.002, 0.002, 0.03).translate(0, SEAM_KNOB_Y, BOARD_D / 2 + 0.015), new MeshBasicMaterial({ color: '#ffd36b' }));
    for (const o of [wall, edge, this.seamKnob, halo, stem]) o.raycast = () => {};
    g.add(wall, edge, this.seamKnob, stem);
    // Labels: which future is on which side, and what the seam reveals.
    const shown = (c: { mesh: Mesh }) => {
      // Seam labels are always readable while the seam is: full opacity, on top.
      (c.mesh.material as MeshBasicMaterial).opacity = 1;
      (c.mesh.material as MeshBasicMaterial).depthTest = false;
      c.mesh.visible = true;
      c.mesh.renderOrder = 9;
    };
    // What differs under the seam: in front of the near edge, below the handle (never over the panels).
    this.seamLabel = this.card(1300, 230);
    shown(this.seamLabel);
    this.seamLabel.mesh.scale.setScalar(0.06);
    this.seamLabel.mesh.position.set(0, -0.005, BOARD_D / 2 + 0.11);
    g.add(this.seamLabel.mesh);
    this.seamTags = { A: this.card(700, 120), B: this.card(700, 120) };
    for (const side of ['A', 'B'] as Side[]) {
      shown(this.seamTags[side]);
      this.seamTags[side].mesh.scale.setScalar(0.035);
      g.add(this.seamTags[side].mesh);
    }
    this.world.scene.add(g);
    this.seamGroup = g;

    // Hand: an invisible pinchable handle that rides on the knob.
    this.seamHandle = new Mesh(new SphereGeometry(0.035, 10, 8), new MeshBasicMaterial({ visible: false }));
    this.seamHandle.name = 'reality-seam-handle';
    this.seamHandleEntity = this.world.createTransformEntity(this.seamHandle);
    this.seamHandleEntity.addComponent(OneHandGrabbable, { rotate: false });

    // Ray / mouse: press anywhere over the table to bring the seam there, drag to move it.
    this.seamDrag = new Mesh(new PlaneGeometry(BOARD_W + 0.06, BOARD_D + 0.06).rotateX(-Math.PI / 2), new MeshBasicMaterial({ visible: false }));
    this.seamDrag.name = 'reality-seam-surface';
    this.seamDrag.position.set(BOARD_CENTER[0], BOARD_CENTER[1] + SEAM_DRAG_Y, BOARD_CENTER[2]);
    const dragEntity = this.world.createTransformEntity(this.seamDrag);
    dragEntity.addComponent(RayInteractable);
    const toU = (p: Vector3) => seamFromLocalX(p.x - BOARD_CENTER[0]);
    this.seamDrag.addEventListener('pointerdown' as never, ((e: { point: Vector3; pointerId?: number; target?: { setPointerCapture?(id: number): void } }) => {
      if (!this.seamGroup.visible) return;
      if (e.pointerId !== undefined) e.target?.setPointerCapture?.(e.pointerId);
      this.seamDragging = true;
      cmd.setSeam(toU(e.point));
    }) as never);
    this.seamDrag.addEventListener('pointermove' as never, ((e: { point: Vector3 }) => {
      if (this.seamDragging) cmd.setSeam(toU(e.point));
    }) as never);
    const end = () => (this.seamDragging = false);
    this.seamDrag.addEventListener('pointerup' as never, end as never);
    window.addEventListener('pointerup', end);
    this.cleanupFuncs.push(() => window.removeEventListener('pointerup', end));
    this.seamDrag.raycast = () => {};
  }

  private stepSeam(): void {
    const u = seamPos.peek();
    const on = u !== null && !!futuresOpen.peek() && !streetView.peek() && this.t < 0.05 && !this.diving;
    if (on !== this.seamGroup.visible) {
      this.seamGroup.visible = on;
      this.seamDrag.raycast = on ? Mesh.prototype.raycast : () => {};
    }
    const held = this.seamHandleEntity.hasComponent(Grabbed);
    if (!on) {
      if (!held) this.seamHandle.position.set(0, -10, 0); // out of reach
      return;
    }
    // The hand moves the seam sideways (only x matters; the handle snaps back to the knob on release).
    if (held) cmd.setSeam(seamFromLocalX(this.seamHandle.getWorldPosition(new Vector3()).x - BOARD_CENTER[0]));
    const x = localXFromSeam(seamPos.peek()!);
    this.seamGroup.position.set(BOARD_CENTER[0] + x, BOARD_CENTER[1], BOARD_CENTER[2]);
    if (!held) this.seamHandle.position.copy(this.seamKnob.getWorldPosition(new Vector3()));
    // Side labels sit just either side of the seam, over the far edge.
    const cam = this.world.camera.getWorldPosition(new Vector3());
    for (const side of ['A', 'B'] as Side[]) {
      const m = this.seamTags[side].mesh;
      m.position.set(side === 'A' ? -0.115 : 0.115, 0.06, -BOARD_D / 2 + 0.02);
      m.lookAt(cam);
    }
    this.seamLabel.mesh.lookAt(cam);
    // What differs under the seam (recomputed only when the column, year or plans change).
    const pair = futurePair(planA.peek(), game.placements, viewYear.peek());
    const rep = seamReport(game.terrain, pair.A.plan, pair.B.plan, pair.year, seamPos.peek()!, { A: pair.A.title, B: pair.B.title });
    const key = `${rep.lines.join("|")}`;
    if (key !== this.seamKey) {
      this.seamKey = key;
      this.paintCard(this.seamLabel, rep.lines, 46, 'rgba(15,42,48,0.85)', '#ffffff');
      this.paintCard(this.seamTags.A, [`< A  ${pair.A.title}`], 52, 'rgba(15,42,48,0.8)', '#8fd3ff');
      this.paintCard(this.seamTags.B, [`B  ${pair.B.title} >`], 52, 'rgba(15,42,48,0.8)', '#ffd36b');
    }
  }

  private setPickable(on: boolean): void {
    for (const side of ['A', 'B'] as Side[]) {
      const h = this.sides[side]?.hit;
      if (h) h.raycast = on ? Mesh.prototype.raycast : () => {};
    }
  }

  /** The dive: the chosen future grows around the viewer, then the street opens. */
  private stepDive(delta: number): void {
    const d = this.diving;
    if (!d || streetView.peek()) return;
    const s = this.sides[d.side];
    if (!s) return (this.diving = null), undefined;
    d.t = Math.min(1, d.t + delta / DIVE_TIME);
    const k = d.t * d.t;
    const head = this.world.camera.getWorldPosition(new Vector3());
    s.root.position.lerpVectors(d.from, head.clone().setY(head.y - 0.12), k);
    s.root.scale.setScalar(d.scale * (1 + 5 * k));
    if (d.t >= 1) {
      // Back to its place (hidden while inside), then open the street.
      const p = this.pose(d.side, 1);
      s.root.position.copy(p.pos);
      s.root.scale.setScalar(p.scale);
      this.diving = null;
      cmd.enterFuture(d.side);
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

  private frozen: number | null = null;
  private pulse!: Mesh;
  private pulseT = 1;

  update(delta: number): void {
    if (!this.pulse) {
      this.pulse = new Mesh(new RingGeometry(0.9, 1, 64).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: '#cfefff', transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending }));
      this.pulse.raycast = () => {};
      this.pulse.visible = false;
      this.pulse.position.set(BOARD_CENTER[0], BOARD_CENTER[1] + 0.01, BOARD_CENTER[2]);
      this.world.scene.add(this.pulse);
    }
    if (this.pulseT < 1) {
      this.pulseT = Math.min(1, this.pulseT + delta / 0.7);
      const r = 0.1 + this.pulseT * 0.7;
      this.pulse.scale.set(r, 1, r);
      (this.pulse.material as MeshBasicMaterial).opacity = 0.6 * (1 - this.pulseT);
    }
    this.pulse.visible = this.pulseT < 1;
    // The comparison strip: in front of the two futures, below them, once they are apart.
    if (this.comparison) {
      // (Hidden under the first-five-minutes closing card, which sits in front of it.)
      const show = !!futuresOpen.peek() && !streetView.peek() && this.t > 0.9 && !this.diving && !outroOpen.peek();
      this.comparison.mesh.visible = show;
      if (show) {
        const xr = this.world.renderer.xr.isPresenting;
        this.comparison.mesh.position.set(BOARD_CENTER[0], BOARD_CENTER[1] + (xr ? 0.02 : 0.0), BOARD_CENTER[2] + (xr ? 0.24 : 0.2));
        this.comparison.mesh.scale.setScalar(xr ? 0.11 : 0.12);
        this.comparison.mesh.lookAt(this.world.camera.getWorldPosition(new Vector3()));
      }
    }
    this.stepGesture(delta);
    this.stepSeam();
    this.stepCards(delta);
    this.stepHeld(delta);
    this.stepDive(delta);
    this.fracture.visible = this.fractureGlow > 0.01;
    this.fractureMat.opacity = this.fractureGlow * (0.85 + 0.15 * Math.sin(performance.now() / 70));

    if (this.t !== this.target && this.frozen === null) {
      const was = this.t;
      this.t = Math.max(0, Math.min(1, this.t + (this.target > this.t ? 1 : -1) * (delta / OPEN_TIME)));
      this.layout();
      this.updateClipping();
      // The seam glows while the halves part; a ring of light runs over the table when they are apart.
      if (this.target === 1) this.fractureGlow = Math.max(this.fractureGlow, 1 - this.t * 1.6);
      if (was < 1 && this.t === 1 && !prefersReducedMotion()) this.pulseT = 0;
      if (this.t === 0 && this.target === 0 && seamPos.peek() === null) {
        this.futures.visible = false;
        this.disposeFutures();
        this.builtKey = '';
        this.restoreTable();
      }
    }
  }
}
