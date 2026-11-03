/**
 * Mira and her little garden (street metres). Procedural, small and cheap:
 * a stylised 9-year-old (about 1.25 m) with an idle breath, a turn toward the
 * viewer and a wave while speaking; a stone planter that is green and in
 * flower, or parched with a dead stump (from `child-narrative.ts`); and a
 * subtitle bubble that faces the viewer.
 */
import {
  BoxGeometry,
  CanvasTexture,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';
import { isPeopleResource, personModel } from './people.js';
import { rng } from './rand.js';

const mat = (color: string, flat = false) => new MeshStandardMaterial({ color, roughness: 0.8, flatShading: flat });

export type Expression = 'happy' | 'neutral' | 'sad';

export interface Child {
  root: Group;
  /** Set her expression (authored model only). */
  mood?: (e: Expression) => void;
  /** Right arm pivot (waves while speaking). */
  arm: Group;
  /** Left arm pivot (points at what she talks about). Authored model only. */
  armL?: Object3D;
  /** Head pivot at the neck (looks at you, nods). Authored model only. */
  head?: Object3D;
  /** Close / open her eyes (a blink). Authored model only. */
  blink?: (closed: boolean) => void;
  body: Group;
}

export function createChild(): Child {
  // The authored Mira (people.glb) when loaded: the whole figure turns, her
  // right arm (pivot at the shoulder) waves.
  const model = personModel('mira');
  const authoredArm = model?.getObjectByName('mira-arm-r');
  if (model && authoredArm) {
    const root = new Group();
    root.name = 'mira';
    const body = new Group();
    body.add(model);
    root.add(body);
    const mouths: Record<Expression, Object3D | undefined> = {
      happy: model.getObjectByName('mira-smile'),
      neutral: model.getObjectByName('mira-neutral'),
      sad: model.getObjectByName('mira-sad'),
    };
    const mood = (e: Expression) => {
      for (const [k, m] of Object.entries(mouths)) if (m) m.visible = k === e;
    };
    mood('happy');
    const lids = model.getObjectByName('mira-lids');
    const blink = (closed: boolean) => {
      if (lids) lids.visible = closed;
    };
    blink(false);
    return {
      root,
      arm: authoredArm as unknown as Group,
      armL: model.getObjectByName('mira-arm-l') ?? undefined,
      head: model.getObjectByName('mira-head') ?? undefined,
      blink,
      body,
      mood,
    };
  }
  const root = new Group();
  root.name = 'mira';
  const body = new Group();
  root.add(body);
  const skin = mat('#d8a47f');
  const dress = mat('#f2b33d');
  const hair = mat('#3b2a1e');
  // Legs and sandals.
  for (const dx of [-0.065, 0.065]) {
    const leg = new Mesh(new CylinderGeometry(0.045, 0.04, 0.42, 8), skin);
    leg.position.set(dx, 0.21, 0);
    const shoe = new Mesh(new BoxGeometry(0.08, 0.04, 0.15), mat('#c0563b'));
    shoe.position.set(dx, 0.02, 0.025);
    body.add(leg, shoe);
  }
  // Dress (flared) and torso.
  const skirt = new Mesh(new ConeGeometry(0.24, 0.42, 14, 1, true), dress);
  skirt.position.y = 0.6;
  const torso = new Mesh(new CylinderGeometry(0.13, 0.17, 0.3, 12), dress);
  torso.position.y = 0.88;
  const collar = new Mesh(new CylinderGeometry(0.1, 0.13, 0.03, 12), mat('#ffffff'));
  collar.position.y = 1.03;
  body.add(skirt, torso, collar);
  // Head: face, hair cap, a bun; eyes so she reads as looking at you.
  const head = new Mesh(new SphereGeometry(0.13, 18, 14), skin);
  head.position.y = 1.15;
  const cap = new Mesh(new SphereGeometry(0.137, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), hair);
  cap.position.y = 1.16;
  cap.rotation.x = -0.35;
  const bun = new Mesh(new SphereGeometry(0.065, 12, 10), hair);
  bun.position.set(0, 1.27, -0.1);
  body.add(head, cap, bun);
  for (const dx of [-0.045, 0.045]) {
    const eye = new Mesh(new SphereGeometry(0.014, 8, 6), mat('#2b2420'));
    eye.position.set(dx, 1.16, 0.122);
    body.add(eye);
  }
  const smile = new Mesh(new BoxGeometry(0.05, 0.008, 0.01), mat('#8a4b3a'));
  smile.position.set(0, 1.105, 0.126);
  body.add(smile);
  // Arms: the left hangs, the right pivots at the shoulder to wave.
  const left = new Mesh(new CylinderGeometry(0.035, 0.03, 0.36, 8), skin);
  left.position.set(-0.17, 0.83, 0);
  left.rotation.z = 0.12;
  body.add(left);
  const arm = new Group();
  arm.position.set(0.17, 0.99, 0);
  const right = new Mesh(new CylinderGeometry(0.035, 0.03, 0.36, 8).translate(0, -0.18, 0), skin);
  arm.add(right);
  arm.rotation.z = -0.12;
  body.add(arm);
  root.traverse((o) => (o.raycast = () => {}));
  return { root, arm, body };
}

/** The stone planter of the little garden, lush or parched. */
export function createGarden(kind: 'lush' | 'dry', w: number, d: number): Group {
  const g = new Group();
  g.name = `little-garden-${kind}`;
  const stone = mat('#cdbf9f');
  const h = 0.42;
  for (const [x, z, sw, sd] of [[0, -d / 2, w, 0.09], [0, d / 2, w, 0.09], [-w / 2, 0, 0.09, d], [w / 2, 0, 0.09, d]] as const) {
    const wall = new Mesh(new BoxGeometry(sw, h, sd), stone);
    wall.position.set(x, h / 2, z);
    g.add(wall);
  }
  const soil = new Mesh(new BoxGeometry(w - 0.1, 0.05, d - 0.1), mat(kind === 'lush' ? '#4a3a2a' : '#a8875c'));
  soil.position.y = h - 0.06;
  g.add(soil);
  const r = rng(kind === 'lush' ? 11 : 12);
  if (kind === 'lush') {
    // Young olive tree, shrubs and flowers.
    const trunk = new Mesh(new CylinderGeometry(0.04, 0.06, 0.9, 6), mat('#6b5038'));
    trunk.position.set(w * 0.22, h + 0.45, 0);
    const crown = new Mesh(new SphereGeometry(0.42, 16, 12), mat('#7f9a5a'));
    crown.position.set(w * 0.22, h + 1.05, 0);
    crown.scale.set(1, 0.8, 1);
    g.add(trunk, crown);
    for (let i = 0; i < 9; i++) {
      const x = -w / 2 + 0.18 + r() * (w * 0.55);
      const z = -d / 2 + 0.15 + r() * (d - 0.3);
      const shrub = new Mesh(new SphereGeometry(0.1 + r() * 0.06, 10, 8), mat(i % 3 ? '#4f8a3c' : '#5f9a45'));
      shrub.position.set(x, h + 0.06, z);
      g.add(shrub);
      if (i % 2 === 0) {
        const flower = new Mesh(new SphereGeometry(0.035, 6, 5), mat(['#e86a8f', '#f2d03d', '#b48ce0', '#ffffff'][i % 4]));
        flower.position.set(x + 0.04, h + 0.17, z);
        g.add(flower);
      }
    }
  } else {
    // A dead stump, cracks, dry tufts.
    const stump = new Mesh(new CylinderGeometry(0.07, 0.09, 0.32, 6), mat('#5a4a3a'));
    stump.position.set(w * 0.22, h + 0.16, 0);
    const twig = new Mesh(new CylinderGeometry(0.012, 0.02, 0.35, 4), mat('#4a3c30'));
    twig.position.set(w * 0.22 + 0.06, h + 0.38, 0);
    twig.rotation.z = -0.6;
    g.add(stump, twig);
    for (let i = 0; i < 6; i++) {
      const crack = new Mesh(new BoxGeometry(0.22 + r() * 0.2, 0.004, 0.012), mat('#6b5235'));
      crack.position.set(-w / 2 + 0.25 + r() * (w - 0.5), h - 0.033, -d / 2 + 0.15 + r() * (d - 0.3));
      crack.rotation.y = r() * Math.PI;
      g.add(crack);
      const tuft = new Mesh(new ConeGeometry(0.04, 0.09, 4), mat('#b9a06a', true));
      tuft.position.set(-w / 2 + 0.2 + r() * (w - 0.4), h, -d / 2 + 0.15 + r() * (d - 0.3));
      g.add(tuft);
    }
  }
  g.traverse((o) => (o.raycast = () => {}));
  return g;
}

/** A subtitle bubble (canvas plane) that the street system turns to the viewer. */
export class Bubble {
  readonly mesh: Mesh;
  private canvas = document.createElement('canvas');
  private tex: CanvasTexture;
  private text = '';

  constructor() {
    this.canvas.width = 1024;
    this.canvas.height = 256;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.mesh = new Mesh(new PlaneGeometry(0.86, 0.215), new MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, opacity: 0 }));
    this.mesh.name = 'mira-subtitle';
    this.mesh.renderOrder = 5;
    this.mesh.raycast = () => {};
  }

  set(speaker: string, text: string): void {
    if (text === this.text) return;
    this.text = text;
    const c = this.canvas.getContext('2d')!;
    c.clearRect(0, 0, 1024, 256);
    c.fillStyle = 'rgba(255,253,246,0.96)';
    c.beginPath();
    c.roundRect(8, 8, 1008, 206, 40);
    c.fill();
    c.beginPath();
    c.moveTo(470, 212);
    c.lineTo(512, 250);
    c.lineTo(554, 212);
    c.fill();
    c.fillStyle = '#b87500';
    c.font = 'bold 40px system-ui, sans-serif';
    c.fillText(speaker, 44, 66);
    c.fillStyle = '#2b2620';
    c.font = '46px system-ui, sans-serif';
    // Word-wrap into at most two lines.
    const words = text.split(' ');
    const rows: string[] = [''];
    for (const w of words) {
      const t = rows[rows.length - 1] ? `${rows[rows.length - 1]} ${w}` : w;
      if (c.measureText(t).width > 930 && rows[rows.length - 1]) rows.push(w);
      else rows[rows.length - 1] = t;
    }
    rows.slice(0, 2).forEach((row, i) => c.fillText(row, 44, 128 + i * 56));
    this.tex.needsUpdate = true;
  }

  set opacity(v: number) {
    (this.mesh.material as MeshBasicMaterial).opacity = v;
    this.mesh.visible = v > 0.01;
  }
}

export function disposeTree(o: Object3D): void {
  o.traverse((x) => {
    const m = x as Mesh;
    if (!m.isMesh || isPeopleResource(m.geometry)) return;
    m.geometry.dispose();
    (m.material as MeshStandardMaterial).dispose();
  });
}
