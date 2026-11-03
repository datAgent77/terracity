/**
 * In-world boards for the points of interest near Mira (points-of-interest.ts).
 *
 * Each is a slim post on her street with an arrow pointing at the real place
 * (the park, the solar farm, the unplanned houses) and a sign that faces the
 * viewer and keeps a readable size at any distance. Collapsed it shows the
 * title; pinch / click it to read what the simulation attributes to that place
 * (layer 2: contextual, never all open at once).
 */
import {
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RayInteractable,
  SRGBColorSpace,
  Vector3,
  type Entity,
  type World,
} from '@iwsdk/core';
import type { PointOfInterest, PoiKind } from './points-of-interest.js';

const ACCENT: Record<PoiKind, string> = { park: '#3f9d5a', energy: '#1f8a9a', homes: '#3a6fb0', sprawl: '#c27a12' };
const W = 1024;
/** Sign width in metres at READ_DIST; farther signs grow so they read the same. */
const SIGN_W = 1.6;
/** Board height (the sign's lower edge) above the ground, metres. */
const BOARD_H = 1.9;
const READ_DIST = 5;

interface Marker {
  poi: PointOfInterest | null;
  root: Group;
  beam: Mesh;
  arrow: Mesh;
  sign: Mesh;
  canvas: HTMLCanvasElement;
  tex: CanvasTexture;
  open: boolean;
}

/** At most two points of interest (points-of-interest.ts): two reusable slots. */
const SLOTS = 2;

export class PoiMarkers {
  private markers: Marker[] = [];

  /** `parent` is the street's inner entity (marker positions are in its space). */
  constructor(world: World, parent: Entity) {
    for (let i = 0; i < SLOTS; i++) {
      const root = new Group();
      root.name = `poi-${i}`;
      root.visible = false;
      const beam = new Mesh(new CylinderGeometry(0.05, 0.05, 1, 8).translate(0, 0.5, 0), new MeshBasicMaterial({ transparent: true, opacity: 0.55, depthWrite: false }));
      beam.raycast = () => {};
      root.add(beam);
      // Points (horizontally) at the real place the board is about.
      const arrow = new Mesh(new ConeGeometry(0.11, 0.34, 12).rotateX(Math.PI / 2), new MeshBasicMaterial());
      arrow.raycast = () => {};
      root.add(arrow);
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = 512;
      const tex = new CanvasTexture(canvas);
      tex.colorSpace = SRGBColorSpace;
      // Bottom edge at the origin: the beam meets the panel there.
      const sign = new Mesh(new PlaneGeometry(1, 0.5).translate(0, 0.25, 0), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, fog: false }));
      // A beacon: the sign reads through haze and over roofs; its beam stays in the scene.
      sign.renderOrder = 6;
      root.add(sign);
      const e = world.createTransformEntity(root, { parent });
      e.addComponent(RayInteractable);
      root.addEventListener('click' as never, (() => this.toggle(i)) as never);
      this.markers.push({ poi: null, root, beam, arrow, sign, canvas, tex, open: false });
    }
  }

  /**
   * Show `pois` (at most two) on boards standing at `at[i]` (inner space,
   * ground). The arrow points at `target[i]`, the real place (null: here).
   */
  set(pois: PointOfInterest[], at: Vector3[], target: Array<Vector3 | null>): void {
    this.markers.forEach((m, i) => {
      const poi = pois[i] ?? null;
      m.poi = poi;
      m.open = false;
      m.root.visible = !!poi;
      if (!poi) return;
      m.root.position.copy(at[i]);
      m.beam.scale.y = BOARD_H;
      (m.beam.material as MeshBasicMaterial).color.set(ACCENT[poi.kind]);
      (m.arrow.material as MeshBasicMaterial).color.set(ACCENT[poi.kind]);
      m.sign.position.y = BOARD_H;
      const t = target[i];
      m.arrow.visible = !!t;
      if (t) {
        m.arrow.position.set(0, BOARD_H - 0.3, 0);
        m.arrow.lookAt(m.root.localToWorld(new Vector3(t.x - at[i].x, BOARD_H - 0.3, t.z - at[i].z)));
      }
      this.paint(m);
    });
  }

  /** Open one marker (closing the others), or close it. */
  toggle(i: number): void {
    this.markers.forEach((m, k) => {
      if (!m.poi) return;
      const open = k === i ? !m.open : false;
      if (open !== m.open) {
        m.open = open;
        this.paint(m);
      }
    });
  }

  info(): Array<{ kind: PoiKind; title: string; lines: string[]; open: boolean }> {
    return this.markers.filter((m) => m.poi).map((m) => ({ kind: m.poi!.kind, title: m.poi!.title, lines: [...m.poi!.lines], open: m.open }));
  }

  /** Face the viewer (yaw only) and keep a constant apparent size. */
  private p = new Vector3();
  private ws = new Vector3();

  update(eye: Vector3): void {
    const { p, ws } = this;
    for (const m of this.markers) {
      if (!m.poi || !m.root.visible) continue;
      m.sign.getWorldPosition(p);
      const d = Math.max(READ_DIST, p.distanceTo(eye));
      const s = (SIGN_W * d) / READ_DIST;
      m.root.getWorldScale(ws);
      m.sign.scale.setScalar(s / (ws.x || 1));
      m.sign.lookAt(eye.x, p.y, eye.z);
    }
  }

  /** Screenshots only: hide / show the boards without changing them. */
  setHidden(hidden: boolean): void {
    for (const m of this.markers) m.root.visible = !hidden && !!m.poi;
  }

  hide(): void {
    for (const m of this.markers) {
      m.poi = null;
      m.root.visible = false;
    }
  }

  private paint(m: Marker): void {
    const c = m.canvas.getContext('2d')!;
    const poi = m.poi!;
    c.clearRect(0, 0, W, 512);
    c.font = '44px system-ui, sans-serif';
    const rows: string[] = [];
    if (m.open) {
      for (const line of poi.lines) {
        let cur = '';
        for (const w of line.split(' ')) {
          const t = cur ? `${cur} ${w}` : w;
          if (c.measureText(t).width > W - 110 && cur) {
            rows.push(cur);
            cur = w;
          } else cur = t;
        }
        rows.push(cur);
      }
    }
    const shown = rows.slice(0, 6);
    const h = m.open ? 120 + shown.length * 56 + 20 : 112;
    // Panel anchored to the bottom of the texture (the beam meets it there).
    const y0 = 512 - h;
    c.fillStyle = 'rgba(255,253,246,0.96)';
    c.beginPath();
    c.roundRect(8, y0, W - 16, h - 8, 36);
    c.fill();
    c.fillStyle = ACCENT[poi.kind];
    c.beginPath();
    c.roundRect(8, y0, 22, h - 8, [36, 0, 0, 36]);
    c.fill();
    c.fillStyle = '#1f2a2c';
    c.font = 'bold 52px system-ui, sans-serif';
    c.fillText(poi.title, 56, y0 + 70);
    c.fillStyle = '#6b7a7d';
    c.font = '38px system-ui, sans-serif';
    const hint = m.open ? 'close' : 'why?';
    c.fillText(hint, W - 56 - c.measureText(hint).width, y0 + 68);
    c.fillStyle = '#2b2620';
    c.font = '44px system-ui, sans-serif';
    shown.forEach((r, k) => c.fillText(r, 56, y0 + 140 + k * 56));
    m.tex.needsUpdate = true;
  }
}
