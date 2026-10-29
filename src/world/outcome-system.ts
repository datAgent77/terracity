/**
 * End-of-session moments, driven only by `outcomeVisual()` (pure, tested):
 *  - success: gold outlines on the homes, parks and clean energy that made the
 *    plan work, and a short burst of warm light motes rising from them;
 *  - failure: calm amber outlines on the problem areas of each missed target and
 *    teal outlines where a fix could go (no red, no alarm).
 * Cleared when a new session starts.
 */
import {
  BoxGeometry,
  Color,
  createSystem,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from '@iwsdk/core';
import { GRID_COLS, TILE_SIZE } from '../config/scenario.js';
import { game, result } from '../core/session.js';
import { prefersReducedMotion } from '../ui/accessibility.js';
import { tileCenter, tileTopY } from './board-coords.js';
import { mergeStatic } from './merge.js';
import { outcomeVisual, type Highlight, type HighlightKind } from './outcome-visual.js';
import { rng } from './rand.js';

const POOL = 28;
const MOTES = 72;
const BURST = 3.6; // seconds
const COLORS: Record<HighlightKind, string> = { success: '#f6c945', problem: '#f29a3b', opportunity: '#3fc1c9' };

export class OutcomeSystem extends createSystem({}) {
  private board!: Object3D;
  private outlines: Mesh[] = [];
  private mats: Record<HighlightKind, MeshBasicMaterial> = {
    success: new MeshBasicMaterial({ color: COLORS.success, transparent: true, opacity: 0.9, depthWrite: false }),
    problem: new MeshBasicMaterial({ color: COLORS.problem, transparent: true, opacity: 0.85, depthWrite: false }),
    opportunity: new MeshBasicMaterial({ color: COLORS.opportunity, transparent: true, opacity: 0.85, depthWrite: false }),
  };
  private motes!: InstancedMesh;
  private moteMat = new MeshBasicMaterial({ color: '#fff1b8', transparent: true, opacity: 0, depthWrite: false });
  private moteSeeds: Array<{ x: number; y: number; z: number; vx: number; vz: number; speed: number; delay: number; size: number }> = [];
  private burstT = BURST;
  private clock = 0;
  private current: Highlight[] = [];
  private m = new Matrix4();
  private q = new Quaternion();
  private v = new Vector3();
  private s = new Vector3();

  init(): void {
    this.board = this.world.scene.getObjectByName('terrain-board')!;
    for (let i = 0; i < POOL; i++) {
      const g = new Group();
      const L = TILE_SIZE * 0.94;
      const b = 0.003;
      for (const [x, z, w, d] of [[0, -L / 2, L, b], [0, L / 2, L, b], [-L / 2, 0, b, L], [L / 2, 0, b, L]]) {
        const bar = new Mesh(new BoxGeometry(w, 0.0014, d), this.mats.success);
        bar.position.set(x, 0, z);
        g.add(bar);
      }
      const outline = mergeStatic(g).children[0] as Mesh;
      outline.visible = false;
      outline.name = `outcome-mark-${i}`;
      outline.raycast = () => {};
      this.board.add(outline);
      this.outlines.push(outline);
    }
    this.motes = new InstancedMesh(new IcosahedronGeometry(0.0022, 0), this.moteMat, MOTES);
    this.motes.name = 'celebration-motes';
    this.motes.visible = false;
    this.motes.raycast = () => {};
    const c = new Color();
    for (let i = 0; i < MOTES; i++) this.motes.setColorAt(i, c.set(i % 3 ? '#ffe39a' : '#ffffff'));
    this.board.add(this.motes);

    // Test/debug hook.
    const hook = ((window as unknown as Record<string, unknown>).__terracity ??= {}) as Record<string, unknown>;
    hook.outcomeVisuals = () => ({
      marks: this.current.map((h) => ({ ...h })),
      visible: this.outlines.filter((o) => o.visible).length,
      celebrating: this.motes.visible,
    });

    this.cleanupFuncs.push(result.subscribe((r) => this.show(r)));
  }

  private show(r: typeof result.value): void {
    for (const o of this.outlines) o.visible = false;
    this.motes.visible = false;
    this.current = [];
    if (!r) return;
    const plan = game.placements;
    const ov = outcomeVisual(game.terrain, plan, r.metrics2050, r.checks);
    this.current = ov.highlights.slice(0, POOL);
    this.current.forEach((h, i) => {
      const o = this.outlines[i];
      const { x, z } = tileCenter(h.col, h.row);
      o.position.set(x, tileTopY(game.terrain[h.row * GRID_COLS + h.col]) + 0.0035, z);
      o.material = this.mats[h.kind];
      o.visible = true;
    });
    if (ov.celebrate && !prefersReducedMotion() && this.current.length) {
      const r2 = rng(plan.length * 7919 + 1);
      this.moteSeeds = Array.from({ length: MOTES }, (_, i) => {
        const h = this.current[i % this.current.length];
        const { x, z } = tileCenter(h.col, h.row);
        return {
          x: x + (r2() - 0.5) * TILE_SIZE * 0.8,
          y: tileTopY(game.terrain[h.row * GRID_COLS + h.col]) + 0.01,
          z: z + (r2() - 0.5) * TILE_SIZE * 0.8,
          vx: (r2() - 0.5) * 0.01,
          vz: (r2() - 0.5) * 0.01,
          speed: 0.035 + r2() * 0.03,
          delay: r2() * 1.2,
          size: 0.6 + r2() * 0.9,
        };
      });
      this.burstT = 0;
      this.motes.visible = true;
    }
  }

  update(delta: number): void {
    this.clock += delta;
    if (this.current.length) {
      // Gentle breathing; success marks settle after the burst.
      const k = prefersReducedMotion() ? 1 : 0.5 + 0.5 * Math.sin(this.clock * 3);
      this.mats.problem.opacity = 0.55 + 0.35 * k;
      this.mats.opportunity.opacity = 0.55 + 0.35 * k;
      this.mats.success.opacity = this.burstT < BURST ? 0.6 + 0.35 * k : 0.75;
    }
    if (!this.motes.visible) return;
    this.burstT += delta;
    if (this.burstT >= BURST) {
      this.motes.visible = false;
      return;
    }
    const fade = Math.min(1, this.burstT / 0.4) * Math.min(1, (BURST - this.burstT) / 0.9);
    this.moteMat.opacity = 0.9 * fade;
    this.moteSeeds.forEach((s, i) => {
      const t = Math.max(0, this.burstT - s.delay);
      this.v.set(s.x + s.vx * t, s.y + s.speed * t, s.z + s.vz * t);
      this.s.setScalar(t > 0 ? s.size : 0);
      this.m.compose(this.v, this.q, this.s);
      this.motes.setMatrixAt(i, this.m);
    });
    this.motes.instanceMatrix.needsUpdate = true;
  }
}
