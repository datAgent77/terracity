/**
 * Causality Vision (CAUSALITY milestone B): make cause and effect visible.
 *
 * Every plan change produces a `CausalEvent` (simulation/causality.ts: a
 * difference of two simulation ledgers, by 2050). Always: a short luminous
 * pulse travels from the changed tile to the tiles whose contribution changed
 * (homes that got connected, farmland built over, homes next to a turbine,
 * sprawl tiles that appear or disappear...). With Causality Vision on (the
 * "Why?" button or W): calm rings stay on those tiles — teal where the effect
 * is a gain, amber where it is a cost — and a compact card answers WHAT
 * CHANGED / WHY / WHAT IT COST. With the two futures open, the same view
 * explains Plan B vs Plan A (or your plan vs nobody planning) on both boards.
 *
 * Only tiles named by the ledger are marked; nothing is drawn for a relation
 * the simulation does not compute. Pooled meshes, no per-frame allocation.
 */
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  createSystem,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Object3D,
  PlaneGeometry,
  RingGeometry,
  SphereGeometry,
  Quaternion,
  RayInteractable,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';
import { causalityOn, futuresOpen, game, phase, planA, planVersion, streetView, viewYear } from '../core/session.js';
import { causalEvent, decisionTimeline, ruleLabel, type CausalEffect, type CausalEvent, type DecisionTimeline } from '../simulation/causality.js';
import type { Year } from '../config/projection.js';
import { prefersReducedMotion } from '../ui/accessibility.js';
import { tileCenter, tileTopY } from './board-coords.js';
import { futurePair } from './futures.js';
import { seamClipPlanes } from './split-system.js';
import { tileAt } from './terrain-map.js';
import type { Placement } from '../simulation/metrics.js';

const GAIN = new Color('#3fd6c6');
const COST = new Color('#ffb04a');
const RINGS = 24;
const PULSES = 8;
const PULSE_TIME = 0.9;

type Anchor = { col: number; row: number; gain: boolean; metric: string };

export class CausalitySystem extends createSystem({}) {
  private board!: Object3D;
  private rings: Mesh[] = [];
  private pulses: Array<{ mesh: Mesh; from: Vector3; to: Vector3; t: number; delay: number }> = [];
  private card!: { mesh: Mesh; ctx: CanvasRenderingContext2D; tex: CanvasTexture; key: string };
  private last: readonly Placement[] = [];
  private event: CausalEvent | null = null;
  /** The last decision, evaluated in every simulated year (year-specific explanations). */
  private timeline: DecisionTimeline | null = null;
  /** Causal chain inspection: index of the effect in focus (-1 = all). */
  private focus = -1;
  /** The event shown now (decision at the viewed year, or the two-futures comparison). */
  private shown: CausalEvent | null = null;
  private anchors: Anchor[] = [];
  private origin: { col: number; row: number } | null = null;
  private counter = 0;
  private flash = 0;

  init(): void {
    this.board = this.world.scene.getObjectByName('terrain-board')!;
    const pool = new Group();
    pool.name = 'causality';
    this.board.add(pool);
    const ringGeo = new RingGeometry(0.019, 0.025, 32).rotateX(-Math.PI / 2);
    for (let i = 0; i < RINGS; i++) {
      const m = new Mesh(ringGeo, new MeshBasicMaterial({ color: GAIN, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending }));
      m.visible = false;
      m.raycast = () => {};
      m.renderOrder = 4;
      pool.add(m);
      this.rings.push(m);
    }
    const dot = new SphereGeometry(0.0035, 10, 8);
    for (let i = 0; i < PULSES; i++) {
      const m = new Mesh(dot, new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false, blending: AdditiveBlending }));
      m.visible = false;
      m.raycast = () => {};
      pool.add(m);
      this.pulses.push({ mesh: m, from: new Vector3(), to: new Vector3(), t: 1, delay: 0 });
    }
    this.card = this.makeCard();
    // Pinch / click the card: step through the causes one at a time.
    const cardEntity = this.world.createTransformEntity(this.card.mesh);
    cardEntity.addComponent(RayInteractable);
    this.card.mesh.addEventListener('click' as never, (() => this.nextCause()) as never);

    this.last = game.placements.map((p) => ({ ...p }));
    this.cleanupFuncs.push(
      planVersion.subscribe(() => this.onPlan()),
      causalityOn.subscribe(() => this.refresh()),
      futuresOpen.subscribe(() => {
        this.focus = -1;
        this.refresh();
      }),
      planA.subscribe(() => this.refresh()),
      viewYear.subscribe(() => {
        this.focus = -1;
        this.refresh();
      }),
      streetView.subscribe(() => this.refresh()),
    );

    const hook = ((window as unknown as Record<string, unknown>).__terracity ??= {}) as Record<string, unknown>;
    hook.causality = () => ({
      on: causalityOn.peek(),
      event: this.event && {
        id: this.event.eventId,
        type: this.event.decisionType,
        explanation: this.event.explanation,
        effects: this.event.affectedMetrics.map((e) => ({ metric: e.metricId, delta: e.delta, rules: e.sourceRules.map((r) => r.rule), text: e.supportedExplanation })),
        entities: this.event.affectedEntities.map((e) => `${e.change}:${e.placement.type}@${e.placement.col},${e.placement.row}`),
      },
      anchors: this.anchors.length,
      ringsVisible: this.rings.filter((r) => r.visible).length,
      miniMarks: this.miniMarks.length,
      card: this.card.mesh.visible ? this.card.key : '',
      focus: this.focus,
      shown: this.shown && {
        year: this.shown.year,
        scenarioId: this.shown.scenarioId,
        sourceDecisionIds: this.shown.sourceDecisionIds,
        affectedSpatialIds: this.shown.affectedSpatialIds,
        effects: this.shown.affectedMetrics.map((e) => ({ metric: e.metricId, delta: e.delta, key: e.explanationKey, scope: e.scope })),
      },
    });
    /** Step to the next cause in the chain (same as pinching the card). */
    hook.nextCause = () => this.nextCause();
  }

  // ------------------------------------------------------------- events --

  private onPlan(): void {
    const now = game.placements.map((p) => ({ ...p }));
    const before = this.last;
    this.last = now;
    if (phase.peek() !== 'building') return;
    const byId = new Map(before.map((p) => [p.id, p]));
    const added = now.filter((p) => !byId.has(p.id));
    const removed = before.filter((p) => !now.some((q) => q.id === p.id));
    const moved = now.filter((p) => byId.has(p.id) && (byId.get(p.id)!.col !== p.col || byId.get(p.id)!.row !== p.row));
    const type = added.length === 1 && !removed.length ? 'add' : removed.length === 1 && !added.length ? 'remove' : moved.length ? 'move' : 'plan-change';
    // Evaluated in every simulated year: the card says what is true now and
    // what only appears later, and follows the year being viewed.
    this.timeline = decisionTimeline(game.terrain, before, now, type, `decision-${++this.counter}`);
    this.event = this.timeline.byYear[2050];
    this.focus = -1;
    const o = added[0] ?? moved[0] ?? removed[0];
    this.origin = o ? { col: o.col, row: o.row } : null;
    this.anchors = this.anchorsOf(this.event);
    this.flash = 7; // the decision card shows briefly even with Vision off
    this.firePulses();
    this.refresh();
  }

  /** Tiles named by the event: rule anchors plus sprawl tiles that appear / disappear. */
  private anchorsOf(ev: CausalEvent): Anchor[] {
    const out: Anchor[] = [];
    const seen = new Set<string>();
    const add = (col: number, row: number, gain: boolean, metric: string) => {
      const k = `${col},${row}`;
      if (seen.has(k)) return;
      seen.add(k);
      out.push({ col, row, gain, metric });
    };
    for (const fx of ev.affectedMetrics) {
      for (const rc of fx.sourceRules) {
        // Gain or cost of this rule's change for this metric.
        const gain = (rc.delta > 0) === fx.higherIsBetter;
        for (const t of rc.tiles) add(t.col, t.row, gain, fx.metricId);
      }
    }
    const k = (t: { col: number; row: number }) => `${t.col},${t.row}`;
    const was = new Set(ev.beforeState.sprawlTiles.map(k));
    const is = new Set(ev.afterState.sprawlTiles.map(k));
    for (const t of ev.afterState.sprawlTiles) if (!was.has(k(t))) add(t.col, t.row, false, 'sprawl');
    for (const t of ev.beforeState.sprawlTiles) if (!is.has(k(t))) add(t.col, t.row, true, 'sprawl');
    return out.slice(0, RINGS);
  }

  private compareEvent(): CausalEvent {
    const pair = futurePair(planA.peek(), game.placements, viewYear.peek());
    return causalEvent(game.terrain, pair.A.plan, pair.B.plan, pair.year, 'compare', 'compare');
  }

  // ------------------------------------------------------------- visuals --

  private local(col: number, row: number, lift = 0.004): Vector3 {
    const t = tileAt(game.terrain, col, row)!;
    const { x, z } = tileCenter(col, row);
    return new Vector3(x, tileTopY(t) + lift, z);
  }

  private firePulses(): void {
    if (!this.origin || prefersReducedMotion()) return;
    const from = this.local(this.origin.col, this.origin.row, 0.012);
    const targets = this.anchors.filter((a) => a.col !== this.origin!.col || a.row !== this.origin!.row).slice(0, PULSES);
    targets.forEach((a, i) => {
      const p = this.pulses[i];
      p.from.copy(from);
      p.to.copy(this.local(a.col, a.row, 0.006));
      p.t = 0;
      p.delay = i * 0.08;
      (p.mesh.material as MeshBasicMaterial).color.copy(a.gain ? GAIN : COST);
    });
  }

  private nextCause(): void {
    const n = this.shown?.affectedMetrics.length ?? 0;
    if (!n || !this.card.mesh.visible) return;
    this.focus = this.focus + 1 >= n ? -1 : this.focus + 1;
    this.flash = Math.max(this.flash, 7);
    this.refresh();
  }

  /** Anchors of one effect (causal chain focus), or of the whole event. */
  private anchorsFor(ev: CausalEvent): Anchor[] {
    const all = this.anchorsOf(ev);
    const f = this.focus >= 0 ? ev.affectedMetrics[this.focus] : null;
    if (!f) return all;
    const k = (t: { col: number; row: number }) => `${t.col},${t.row}`;
    const tiles = new Set(f.sourceRules.flatMap((r) => r.tiles.map(k)));
    // Sprawl-driven effects point at the sprawl tiles that appear or disappear.
    if (f.metricId === 'sprawl' || f.sourceRules.some((r) => r.rule === 'sprawl-pressure' || r.rule === 'land-sprawl' || r.rule === 'housing-demand')) {
      const was = new Set(ev.beforeState.sprawlTiles.map(k));
      const is = new Set(ev.afterState.sprawlTiles.map(k));
      for (const t of was) if (!is.has(t)) tiles.add(t);
      for (const t of is) if (!was.has(t)) tiles.add(t);
    }
    return all.filter((a) => tiles.has(k(a)));
  }

  private refresh(): void {
    const split = !!futuresOpen.peek();
    const year = viewYear.peek() as Year;
    // The decision as it stands in the year being viewed.
    if (this.timeline && !split) {
      this.event = this.timeline.byYear[year];
      this.anchors = this.anchorsFor(this.event);
    }
    const show = causalityOn.peek() && !streetView.peek() && !split && phase.peek() === 'building';
    // Rings on the main board (single world).
    this.rings.forEach((r, i) => {
      const a = this.anchors[i];
      r.visible = show && !!a;
      if (!a) return;
      r.position.copy(this.local(a.col, a.row));
      (r.material as MeshBasicMaterial).color.copy(a.gain ? GAIN : COST);
    });
    // In split view the comparison of the two futures is explained instead.
    this.clearMiniMarks();
    if (split && causalityOn.peek() && !streetView.peek()) {
      const ev = this.compareEvent();
      if (this.shown?.eventId !== ev.eventId || this.shown?.year !== ev.year) this.focus = Math.min(this.focus, ev.affectedMetrics.length - 1);
      this.shown = ev;
      this.markMinis(ev);
      this.paintCard(ev, `Why the two futures differ in ${ev.year}`, null);
    } else if ((causalityOn.peek() || this.flash > 0) && this.event && this.timeline && !streetView.peek() && !split) {
      this.shown = this.event;
      if (year === 2026) this.paintCard(this.timeline.now, 'What your decision changes', this.timeline.later(2050));
      else this.paintCard(this.event, `What your decision changed by ${year}`, null);
    } else {
      this.shown = null;
      this.card.mesh.visible = false;
    }
  }

  // ------------------------------------------------------- two futures --

  private miniMarks: Mesh[] = [];
  private miniRingGeo = new RingGeometry(0.019, 0.026, 32).rotateX(-Math.PI / 2);

  private clearMiniMarks(): void {
    for (const m of this.miniMarks) {
      m.parent?.remove(m);
      (m.material as MeshBasicMaterial).dispose();
    }
    this.miniMarks = [];
  }

  /**
   * Mark, on each future, the tiles where the two plans differ: structures
   * only in that plan, and sprawl only in that future.
   */
  private markMinis(ev: CausalEvent): void {
    const find = (side: 'A' | 'B') => this.world.scene.getObjectByName(`future-${side}`)?.children[0];
    const ring = (parent: Object3D | undefined, col: number, row: number, gain: boolean) => {
      if (!parent) return;
      const m = new Mesh(this.miniRingGeo, new MeshBasicMaterial({ color: gain ? GAIN : COST, transparent: true, opacity: 0.85, depthWrite: false, blending: AdditiveBlending }));
      // Cut by the same seam as the future it marks (Reality Seam).
      (m.material as MeshBasicMaterial).clippingPlanes = [seamClipPlanes[parent === find('A') ? 'A' : 'B']];
      m.position.copy(this.local(col, row, 0.006));
      m.raycast = () => {};
      m.renderOrder = 4;
      parent.add(m);
      this.miniMarks.push(m);
    };
    for (const e of ev.affectedEntities) {
      // 'added' = only in B; 'removed' = only in A.
      ring(find(e.change === 'added' ? 'B' : 'A'), e.placement.col, e.placement.row, true);
    }
    const k = (t: { col: number; row: number }) => `${t.col},${t.row}`;
    const a = new Set(ev.beforeState.sprawlTiles.map(k));
    const b = new Set(ev.afterState.sprawlTiles.map(k));
    for (const t of ev.beforeState.sprawlTiles) if (!b.has(k(t))) ring(find('A'), t.col, t.row, false);
    for (const t of ev.afterState.sprawlTiles) if (!a.has(k(t))) ring(find('B'), t.col, t.row, false);
  }

  // ---------------------------------------------------------------- card --

  private makeCard() {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 420;
    const ctx = canvas.getContext('2d')!;
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    const mesh = new Mesh(new PlaneGeometry(1024 / 420, 1), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    mesh.name = 'causality-card';
    mesh.scale.setScalar(0.085);
    mesh.renderOrder = 7;
    mesh.visible = false;
    mesh.raycast = () => {};
    return { mesh, ctx, tex, key: '' };
  }

  /**
   * WHAT CHANGED / WHY / WHAT IT COST — from the event's numbers only.
   * `later`: effects that only appear (or grow) by 2050, listed under their
   * own heading so a sentence is never shown for a year in which it is false.
   * With a cause in focus, the card shows that cause's chain instead.
   */
  private paintCard(ev: CausalEvent, title: string, later: CausalEffect[] | null): void {
    const fx = ev.affectedMetrics;
    const good = (e: CausalEffect) => (e.delta > 0) === e.higherIsBetter;
    const region = (e: CausalEffect) => (e.scope === 'regional' ? ' Region-wide.' : e.scope === 'mixed' ? ' Partly region-wide.' : '');
    type Line = { mark: string; text: string; color: string; head?: boolean };
    const lines: Line[] = [];
    let hidden = 0;
    const list = (effects: CausalEffect[], max: number) => {
      // Tradeoffs both ways: the largest gain and the largest cost first.
      const g = effects.filter(good);
      const c = effects.filter((x) => !good(x));
      const pick = [...g.slice(0, Math.ceil(max / 2)), ...c.slice(0, Math.floor(max / 2))];
      for (const e of [...g, ...c]) if (pick.length < max && !pick.includes(e)) pick.push(e);
      hidden += effects.length - pick.length;
      for (const e of [...pick.filter(good), ...pick.filter((x) => !good(x))]) {
        lines.push({ mark: good(e) ? '+' : '-', text: e.supportedExplanation + region(e), color: good(e) ? '#0f7a6f' : '#a85a00' });
      }
    };
    const f = this.focus >= 0 ? fx[this.focus] : null;
    let heading = title;
    if (f) {
      heading = `Cause ${this.focus + 1} of ${fx.length} (${ev.year})`;
      lines.push({ mark: good(f) ? '+' : '-', text: f.supportedExplanation, color: good(f) ? '#0f7a6f' : '#a85a00' });
      for (const r of f.sourceRules.filter((x) => x.rule !== 'env-limits').slice(0, 3)) {
        const n = r.sourceIds.length;
        const places = r.tiles.length || n;
        const who = r.scope === 'regional'
          ? n > 1 ? `a region-wide rule that ${n} of your placements feed together` : 'a region-wide rule'
          : `${places} ${places === 1 ? 'place' : 'places'} on the map`;
        const amount = `${r.delta > 0 ? '+' : ''}${(Math.round(r.delta * 10) / 10).toLocaleString('en-US')}`;
        lines.push({ mark: '>', text: `${ruleLabel(r.rule, r.delta)} ${amount}, ${who}.`, color: '#3a4a4d' });
      }
    } else {
      if (!fx.length && !later?.length) lines.push({ mark: '', text: `No measurable change in ${ev.year}.`, color: '#3a4a4d' });
      if (later) {
        if (fx.length) lines.push({ mark: '', text: 'Now (2026)', color: '#1d5f6b', head: true });
        list(fx, later.length ? 2 : 4);
        if (later.length) {
          lines.push({ mark: '', text: 'By 2050', color: '#1d5f6b', head: true });
          list(later, 2);
        }
      } else list(fx, 4);
    }
    const hint = f ? 'Pinch the card: next cause' : fx.length > 1 ? `Pinch the card to inspect each cause${hidden ? ` (${hidden} more)` : ''}` : '';
    const key = `${heading}|${lines.map((l) => l.text).join('|')}`;
    this.card.key = key;
    const { ctx, tex } = this.card;
    const W = 1024;
    const H = 420;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(250,248,242,0.95)';
    ctx.beginPath();
    ctx.roundRect(6, 6, W - 12, H - 12, 36);
    ctx.fill();
    ctx.fillStyle = '#1d5f6b';
    ctx.font = 'bold 40px system-ui, sans-serif';
    ctx.fillText(heading, 40, 62);
    let y = 112;
    const wrap = (text: string, x: number, size: number) => {
      ctx.font = `${size}px system-ui, sans-serif`;
      let line = '';
      for (const w of text.split(' ')) {
        const t = line ? `${line} ${w}` : w;
        if (ctx.measureText(t).width > W - x - 40 && line) {
          ctx.fillText(line, x, y);
          y += size + 4;
          line = w;
        } else line = t;
      }
      ctx.fillText(line, x, y);
      y += size + 12;
    };
    for (const l of lines) {
      if (y > H - 74) break;
      if (l.head) {
        ctx.fillStyle = l.color;
        ctx.font = 'bold 28px system-ui, sans-serif';
        ctx.fillText(l.text.toUpperCase(), 40, y);
        y += 36;
        continue;
      }
      ctx.fillStyle = l.color;
      ctx.font = 'bold 34px system-ui, sans-serif';
      if (l.mark) ctx.fillText(l.mark, 40, y);
      ctx.fillStyle = '#2b2620';
      wrap(l.text, 80, 30);
    }
    if (hint) {
      ctx.fillStyle = '#6b7a7d';
      ctx.font = '24px system-ui, sans-serif';
      ctx.fillText(hint, 40, H - 26);
    }
    tex.needsUpdate = true;
    this.card.mesh.visible = true;
  }

  update(delta: number): void {
    // Brief decision card when Vision is off.
    if (this.flash > 0) {
      this.flash -= delta;
      if (this.flash <= 0) this.refresh();
    }
    // Card at the front-left of the table (mirroring the time dial on the right),
    // within reach and never over the city or the panels; faces the viewer.
    if (this.card.mesh.visible) {
      const xr = this.world.renderer.xr.isPresenting;
      const cam = this.world.camera;
      if (xr) {
        this.card.mesh.position.set(-0.36, 0.93, -0.16);
        this.card.mesh.scale.setScalar(0.1);
        this.card.mesh.lookAt(cam.getWorldPosition(new Vector3()));
      } else {
        // Desktop: lower-left of the view, beside the tray, square to the screen.
        cam.updateMatrixWorld();
        this.card.mesh.position.copy(cam.localToWorld(new Vector3(-0.312, -0.205, -0.6)));
        this.card.mesh.quaternion.copy(cam.getWorldQuaternion(new Quaternion()));
        this.card.mesh.scale.setScalar(0.0985);
      }
    }
    // Calm breathing of the rings (no flashing).
    const k = prefersReducedMotion() ? 0.7 : 0.55 + 0.2 * Math.sin(performance.now() / 600);
    for (const r of this.rings) if (r.visible) (r.material as MeshBasicMaterial).opacity = k;
    // Pulses: an arc from the decision to each affected tile, then a short ring flash.
    for (const p of this.pulses) {
      if (p.t >= 1) {
        p.mesh.visible = false;
        continue;
      }
      p.delay -= delta;
      if (p.delay > 0) continue;
      p.t = Math.min(1, p.t + delta / PULSE_TIME);
      const t = p.t;
      p.mesh.visible = t < 1;
      p.mesh.position.lerpVectors(p.from, p.to, t);
      p.mesh.position.y += Math.sin(Math.PI * t) * 0.05;
    }
  }
}
