/**
 * Sculpt time (GODMODE phase 4): a glowing time dial beside the table.
 *
 * Pinch the golden knob and move it along the ring: the world follows
 * continuously (trees grow or die, land parches or greens, smog, sea level,
 * architecture), interpolated between the three simulated years; the year
 * label says "~2039 (between projections)" in between. Let go and it settles
 * on the nearest simulated year (a chime). With a mouse or a hand ray, drag the
 * knob over the dial face, or tap a year notch. The year panel stays as the
 * conventional fallback. Hidden inside a street and while the futures are split.
 */
import {
  AdditiveBlending,
  CanvasTexture,
  CircleGeometry,
  createSystem,
  type Entity,
  Grabbed,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OneHandGrabbable,
  PlaneGeometry,
  Raycaster,
  RayInteractable,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
} from '@iwsdk/core';
import { PROJECTION, YEARS, type Year } from '../config/projection.js';
import { sfx } from '../audio/sfx.js';
import * as cmd from '../core/commands.js';
import { futuresOpen, phase, streetView, timeScrub, viewYear } from '../core/session.js';
import { angleFor, dialLabel, displayYear, nearestYear, progressFor } from '../interactions/time-dial.js';
import { prefersReducedMotion } from '../ui/accessibility.js';

/** Dial centre (world), to the right of the table near a seated player's right hand. */
const DIAL_POS = new Vector3(0.4, 0.88, -0.08);
/** On a flat screen the dial sits lower right in front of the table, facing the camera. */
const DESKTOP_POS = new Vector3(0.3, 0.92, -0.02);
const R = 0.075;
const SNAP_TIME = 0.25;

export class TimeDialSystem extends createSystem({ held: { required: [Grabbed] } }) {
  private dial = new Group();
  private knob!: Mesh;
  private ring!: Mesh;
  private ringMat!: MeshStandardMaterial;
  private handle!: Mesh;
  private handleEntity!: Entity;
  private label!: { mesh: Mesh; ctx: CanvasRenderingContext2D; tex: CanvasTexture; text: string };
  /** Current knob progress (0..1). */
  private p = 0;
  private dragging: 'hand' | 'ray' | null = null;
  private snap: { from: number; to: number; t: number } | null = null;
  private lastTick = 2026;
  private faceDowns = 0;

  init(): void {
    this.dial.name = 'time-dial';
    this.dial.position.copy(DIAL_POS);
    this.dial.lookAt(0, 1.2, 0.08); // face a seated player
    const dialEntity = this.world.createTransformEntity(this.dial);

    // Ring arc (240 degrees), soft glowing, with the year notches.
    this.ringMat = new MeshStandardMaterial({ color: '#7fe3ea', emissive: '#2ec4d0', emissiveIntensity: 0.35, roughness: 0.4 });
    const arc = new TorusGeometry(R, 0.0055, 10, 72, (240 * Math.PI) / 180).rotateZ((210 - 240) * (Math.PI / 180));
    this.ring = new Mesh(arc, this.ringMat);
    this.dial.add(this.ring);
    const base = new Mesh(new CircleGeometry(R * 1.35, 48), new MeshBasicMaterial({ color: '#0f2a30', transparent: true, opacity: 0.55, depthWrite: false }));
    base.position.z = -0.004;
    this.dial.add(base);
    for (const y of YEARS) {
      const a = angleFor(PROJECTION.progress[y]);
      const notch = new Mesh(new SphereGeometry(0.008, 12, 8), new MeshStandardMaterial({ color: '#ffffff', emissive: '#bfefff', emissiveIntensity: 0.4 }));
      notch.position.set(Math.cos(a) * R, Math.sin(a) * R, 0);
      this.dial.add(notch);
      const tag = this.text(`${y}`, 256, 96, 52);
      tag.mesh.scale.setScalar(0.02);
      tag.mesh.position.set(Math.cos(a) * R * 1.62, Math.sin(a) * R * 1.62, 0.002);
      this.dial.add(tag.mesh);
      // Tap a notch (ray / mouse) to go to that year.
      const hit = new Mesh(new CircleGeometry(0.014, 12), new MeshBasicMaterial({ visible: false }));
      hit.userData.hit = true;
      hit.position.copy(tag.mesh.position).setZ(0.003);
      const e = this.world.createTransformEntity(hit, { parent: dialEntity });
      e.addComponent(RayInteractable);
      hit.addEventListener('click' as never, (() => this.goTo(y)) as never);
    }
    this.label = this.text('2026', 512, 96, 54);
    this.label.mesh.scale.setScalar(0.024);
    this.label.mesh.position.set(0, -R * 0.15, 0.003);
    this.dial.add(this.label.mesh);
    const title = this.text('SCULPT TIME', 512, 80, 40, '#7fe3ea');
    title.mesh.scale.setScalar(0.016);
    title.mesh.position.set(0, R * 1.6, 0.002);
    this.dial.add(title.mesh);

    // Knob (visual) on the ring.
    this.knob = new Mesh(
      new SphereGeometry(0.014, 16, 12),
      new MeshStandardMaterial({ color: '#ffd36b', emissive: '#f2b33d', emissiveIntensity: 0.6, roughness: 0.3 }),
    );
    this.dial.add(this.knob);
    const halo = new Mesh(new SphereGeometry(0.024, 16, 12), new MeshBasicMaterial({ color: '#ffe6a6', transparent: true, opacity: 0.25, blending: AdditiveBlending, depthWrite: false }));
    this.knob.add(halo);

    // Pinchable handle (world level, so the hand can carry it freely).
    this.handle = new Mesh(new SphereGeometry(0.03, 10, 8), new MeshBasicMaterial({ visible: false }));
    this.handle.name = 'time-dial-handle';
    this.handleEntity = this.world.createTransformEntity(this.handle);
    this.handleEntity.addComponent(OneHandGrabbable, { rotate: false });

    // Ray / mouse: drag over the dial face.
    const face = new Mesh(new CircleGeometry(R * 1.4, 32), new MeshBasicMaterial({ visible: false }));
    face.position.z = 0.001;
    const faceEntity = this.world.createTransformEntity(face, { parent: dialEntity });
    faceEntity.addComponent(RayInteractable);
    const local = (e: { point: Vector3 }) => this.dial.worldToLocal(e.point.clone());
    face.addEventListener('pointerdown' as never, ((e: { point: Vector3; pointerId?: number; target?: { setPointerCapture?(id: number): void } }) => {
      this.faceDowns++;
      // Keep the drag even if the pointer slides off the dial.
      if (e.pointerId !== undefined) e.target?.setPointerCapture?.(e.pointerId);
      // Press anywhere on the ring to jump there, then drag to scrub.
      const v = local(e);
      if (Math.hypot(v.x, v.y) < R * 0.55) return; // the centre label is not a target
      this.beginDrag('ray');
      this.scrub(progressFor(v.x, v.y, this.p));
    }) as never);
    face.addEventListener('pointermove' as never, ((e: { point: Vector3 }) => {
      if (this.dragging !== 'ray') return;
      const v = local(e);
      this.scrub(progressFor(v.x, v.y, this.p));
    }) as never);
    const end = () => {
      if (this.dragging === 'ray') this.endDrag();
    };
    face.addEventListener('pointerup' as never, end as never);
    window.addEventListener('pointerup', end); // mouse released anywhere
    this.cleanupFuncs.push(() => window.removeEventListener('pointerup', end));

    // Visual parts never catch rays: the face below handles mouse / ray drags.
    for (const o of [this.ring, base, this.knob, halo]) o.raycast = () => {};
    this.dial.traverse((o) => {
      if (o !== face && !(o as Mesh).userData.hit && (o as Mesh).isMesh && o.parent === this.dial) (o as Mesh).raycast = () => {};
    });

    this.p = PROJECTION.progress[viewYear.peek()];
    this.placeKnob();
    this.cleanupFuncs.push(
      viewYear.subscribe((y) => {
        if (!this.dragging && !this.snap) {
          this.p = PROJECTION.progress[y];
          this.placeKnob();
        }
      }),
    );

    const hook = ((window as unknown as Record<string, unknown>).__terracity ??= {}) as Record<string, unknown>;
    hook.dial = () => ({ faceDowns: this.faceDowns, p: this.p, label: this.label.text, dragging: this.dragging, visible: this.dial.visible, year: viewYear.peek() });
    /** World position of the dial at progress p (for hand tests). */
    hook.dialPoint = (p: number) => this.dial.localToWorld(new Vector3(Math.cos(angleFor(p)) * R, Math.sin(angleFor(p)) * R, 0)).toArray();
    /** Debug: what a camera ray through page pixel (x, y) hits first. */
    hook.pick = (x: number, y: number) => {
      const r = this.world.renderer.domElement.getBoundingClientRect();
      const rc = new Raycaster();
      rc.setFromCamera(new Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), this.world.camera);
      return rc
        .intersectObjects(this.world.scene.children, true)
        .slice(0, 5)
        .map((h) => `${h.object.name || h.object.type}<${h.object.parent?.name ?? ''}> ${h.distance.toFixed(3)}`);
    };
    /** Page pixel position of the dial at progress p (desktop mouse tests). */
    hook.dialToScreen = (p: number) => {
      const v = this.dial.localToWorld(new Vector3(Math.cos(angleFor(p)) * R, Math.sin(angleFor(p)) * R, 0.004)).project(this.world.camera);
      const r = this.world.renderer.domElement.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    };
  }

  private text(t: string, w: number, h: number, size: number, color = '#ffffff') {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    const mesh = new Mesh(new PlaneGeometry(w / h, 1), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    mesh.raycast = () => {};
    const out = { mesh, ctx, tex, text: '' };
    this.paint(out, t, size, color);
    return out;
  }

  private paint(l: { ctx: CanvasRenderingContext2D; tex: CanvasTexture; text: string }, t: string, size = 54, color = '#ffffff'): void {
    if (l.text === t) return;
    l.text = t;
    const { ctx } = l;
    const { width: w, height: h } = ctx.canvas;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = color;
    ctx.font = `bold ${t.length > 8 ? Math.round(size * 0.62) : size}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 8;
    ctx.fillText(t, w / 2, h / 2);
    l.tex.needsUpdate = true;
  }

  private placeKnob(): void {
    const a = angleFor(this.p);
    this.knob.position.set(Math.cos(a) * R, Math.sin(a) * R, 0.004);
    this.paint(this.label, dialLabel(this.p));
  }

  private beginDrag(kind: 'hand' | 'ray'): void {
    if (this.dragging) return;
    this.dragging = kind;
    this.snap = null;
    timeScrub.value = this.p;
    this.ringMat.emissiveIntensity = 0.9;
  }

  /** Move time to progress p (continuous); the nearest simulated year follows. */
  private scrub(p: number): void {
    this.p = p;
    timeScrub.value = p;
    this.placeKnob();
    const y = nearestYear(p);
    if (y !== viewYear.peek()) cmd.setYear(y);
    const shown = displayYear(p);
    if (shown !== this.lastTick) {
      this.lastTick = shown;
      sfx.timeTick();
    }
  }

  private endDrag(): void {
    this.dragging = null;
    this.ringMat.emissiveIntensity = 0.35;
    this.goTo(nearestYear(this.p));
  }

  /** Settle on a simulated year (snap animation, then plain discrete state). */
  private goTo(y: Year): void {
    if (phase.peek() === 'intro') return;
    const to = PROJECTION.progress[y];
    if (y !== viewYear.peek()) cmd.setYear(y);
    sfx.yearSnap();
    if (prefersReducedMotion()) {
      this.p = to;
      this.placeKnob();
      timeScrub.value = null;
      return;
    }
    this.snap = { from: this.p, to, t: 0 };
    timeScrub.value = this.p;
  }

  private placedFor: 'xr' | 'desktop' | null = null;

  update(delta: number): void {
    const mode = this.world.renderer.xr.isPresenting ? 'xr' : 'desktop';
    if (mode !== this.placedFor && !this.dragging) {
      this.placedFor = mode;
      if (mode === 'xr') {
        this.dial.position.copy(DIAL_POS);
        this.dial.scale.setScalar(1);
        this.dial.lookAt(0, 1.2, 0.08);
      } else {
        this.dial.position.copy(DESKTOP_POS);
        this.dial.scale.setScalar(0.65);
        this.dial.lookAt(this.world.camera.getWorldPosition(new Vector3()));
      }
      this.placeKnob();
    }
    const show = !streetView.peek() && !futuresOpen.peek() && phase.peek() !== 'intro';
    this.dial.visible = show;
    const held = this.handleEntity.hasComponent(Grabbed);
    if (!show) {
      if (this.dragging) this.endDrag();
      return;
    }
    if (held && this.dragging !== 'hand') this.beginDrag('hand');
    if (this.dragging === 'hand') {
      if (!held) this.endDrag();
      else {
        const v = this.dial.worldToLocal(this.handle.getWorldPosition(new Vector3()));
        this.scrub(progressFor(v.x, v.y, this.p));
      }
    }
    if (this.snap) {
      this.snap.t = Math.min(1, this.snap.t + delta / SNAP_TIME);
      const k = this.snap.t * (2 - this.snap.t);
      this.p = this.snap.from + (this.snap.to - this.snap.from) * k;
      timeScrub.value = this.p;
      this.placeKnob();
      if (this.snap.t >= 1) {
        this.snap = null;
        timeScrub.value = null;
      }
    }
    // The handle rests on the knob whenever no hand holds it; it only exists
    // for hands (in XR), so it never blocks the mouse on desktop.
    if (!held) this.handle.position.copy(this.knob.getWorldPosition(new Vector3()));
    this.handle.raycast = this.world.renderer.xr.isPresenting ? Mesh.prototype.raycast : () => {};
    this.knob.scale.setScalar(this.dragging ? 1.35 : 1 + 0.08 * Math.sin(performance.now() / 300));
  }
}
