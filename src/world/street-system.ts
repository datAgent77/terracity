/**
 * "Enter your city" (Signature experience, milestone 2): from the tabletop to a
 * human-scale street in the player's own garden district.
 *
 * The street scene is built from the CURRENT plan with the same models as the
 * board, scaled 1:1000 -> 1:1: the visited district (its layout and era), and
 * the 5 x 5 tiles around it — neighbouring districts, the town, roads, parks,
 * turbines and solar farms the player placed, fields, forest, hills and water —
 * plus a sky dome and distance fog (which also cover passthrough in MR).
 * Tabletop pads (1.6 mm, i.e. 1.6 m here) are dropped.
 *
 * Comfort: the viewer is never moved smoothly. The scene is placed under the
 * viewer at one of a few fixed viewpoints (`street-view.ts`); changing viewpoint
 * fades to black for ~0.2 s, swaps, and fades back (teleport). The tabletop,
 * its panels and the clock are paused/hidden while visiting; "Return to
 * tabletop" restores everything.
 */
import {
  BackSide,
  BoxGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  createSystem,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Fog,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  Quaternion,
  RayInteractable,
  RingGeometry,
  SphereGeometry,
  Vector3,
} from '@iwsdk/core';
import { UIKit, type Entity, type UIKitMLAsset } from '@iwsdk/core';
import { PROJECTION } from '../config/projection.js';
import { StructureType, TerrainType, TILE_SIZE } from '../config/scenario.js';
import * as cmd from '../core/commands.js';
import { game, streetView, viewYear } from '../core/session.js';
import { Placeable } from '../interactions/placeable-component.js';
import { prefersReducedMotion } from '../ui/accessibility.js';
import { setPanelVisible } from '../ui/panel-visibility.js';
import { tileTopY, WATER_LEVEL } from './board-coords.js';
import { TERRAIN_COLORS } from './board-mesh.js';
import { districtOrientation } from './district-links.js';
import { eraForProgress } from './future-visual-state.js';
import { idNumber, rng } from './rand.js';
import { streetPose, STREET_SCALE, VIEWPOINTS } from './street-view.js';
import { createStructureModel, setDistrictLinks, setRoadArms, structureLook } from './structure-models.js';
import { tileAt } from './terrain-map.js';
import { createTownTile, setEra } from './villas.js';

const TABLETOP_PANELS = ['hud-panel', 'actions-panel', 'time-panel', 'overlay-panel', 'compare-panel', 'tray-labels'];
const RADIUS = 2; // tiles around the district (5 x 5)
const FADE = 0.22; // seconds per half of a teleport fade

export class StreetSystem extends createSystem({ placeables: { required: [Placeable] } }) {
  private root = new Group();
  private inner = new Group();
  private hood = new Group();
  private markers: Object3D[] = [];
  private builtKey = '';
  private fade!: Mesh;
  private fadeT = 0;
  private fadeDir = 0; // -1 fading in (to clear), +1 fading out (to black), 0 idle
  private pending: (() => void) | null = null;
  private saved: { camPos: Vector3; camQuat: Quaternion; fog: Fog | null; hidden: Object3D[] } | null = null;
  private wasActive = false;
  private innerEntity!: Entity;

  init(): void {
    this.root.name = 'street-scene';
    this.root.visible = false;
    this.inner.name = 'street-inner';
    this.root.add(this.inner);
    this.inner.add(this.hood);
    const rootEntity = this.world.createTransformEntity(this.root);
    this.innerEntity = this.world.createTransformEntity(this.inner, { parent: rootEntity });
    this.buildSky();
    this.buildMarkers();

    // Fade shell around the viewer's head (teleport comfort).
    this.fade = new Mesh(
      new SphereGeometry(0.25, 16, 12),
      new MeshBasicMaterial({ color: '#0b1214', side: BackSide, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false }),
    );
    this.fade.renderOrder = 1000;
    this.fade.visible = false;
    this.fade.raycast = () => {};
    this.world.camera.add(this.fade);

    this.bindPanel();
    setPanelVisible(this.world, 'street-panel', false);
    this.cleanupFuncs.push(
      streetView.subscribe((v) => this.onChange(v)),
      this.world.visibilityState.subscribe(() => {
        // Leaving XR while visiting: come back to the tabletop.
        if (streetView.peek() && this.saved) cmd.exitCity();
      }),
    );

    const hook = ((window as unknown as Record<string, unknown>).__terracity ??= {}) as Record<string, unknown>;
    hook.street = () => ({
      active: !!streetView.peek(),
      viewpoint: streetView.peek()?.viewpoint ?? null,
      name: streetView.peek() ? VIEWPOINTS[streetView.peek()!.viewpoint].name : null,
      built: this.builtKey,
      boardVisible: this.world.scene.getObjectByName('terrain-board')?.visible ?? null,
      fading: this.fadeDir !== 0,
      /** World positions of the standing markers (beam mid-height), for hand-ray tests. */
      markers: this.markers.map((m) => (m.visible ? m.localToWorld(new Vector3(0, 1.1, 0)).toArray() : null)),
    });
  }

  // ------------------------------------------------------------- panel --

  private bindPanel(): void {
    const panel = this.world.getSceneObject<UIKitMLAsset>('street-panel');
    if (!panel) return;
    const click = (id: string, fn: () => void) => {
      const el = panel.getElementById(id) as unknown as { name: string; addEventListener(t: 'click', f: () => void): void } | null;
      if (!el) return;
      el.name = id;
      el.addEventListener('click', fn);
    };
    click('st-prev', () => cmd.stepViewpoint(-1));
    click('st-next', () => cmd.stepViewpoint(1));
    click('st-return', cmd.exitCity);
    const title = panel.getElementById<UIKit.Text>('st-title');
    const sub = panel.getElementById<UIKit.Text>('st-view');
    const refresh = () => {
      const v = streetView.peek();
      if (!v) return;
      title?.setProperties({ text: `Your neighbourhood - ${viewYear.peek()}` });
      sub?.setProperties({ text: `Viewpoint ${v.viewpoint + 1} of ${VIEWPOINTS.length}: ${VIEWPOINTS[v.viewpoint].name}` });
    };
    this.cleanupFuncs.push(streetView.subscribe(refresh), viewYear.subscribe(refresh));
  }

  // ------------------------------------------------------- transitions --

  private onChange(v: { id: string; viewpoint: number } | null): void {
    if (v && !this.wasActive) {
      this.wasActive = true;
      this.fadeThen(() => this.enter(v.id, v.viewpoint));
    } else if (v && this.wasActive) {
      this.fadeThen(() => this.place(v.viewpoint));
    } else if (!v && this.wasActive) {
      this.wasActive = false;
      this.fadeThen(() => this.leave());
    }
  }

  private fadeThen(fn: () => void): void {
    if (prefersReducedMotion()) {
      fn();
      return;
    }
    this.pending = fn;
    this.fadeDir = 1;
    this.fade.visible = true;
  }

  private enter(id: string, viewpoint: number): void {
    const p = game.get(id);
    if (!p) return;
    this.build(p.col, p.row);
    // Hide the tabletop: board, placed pieces and tray, comparison dioramas, panels.
    const hidden: Object3D[] = [];
    const hide = (o: Object3D | undefined) => {
      if (o && o.visible) {
        o.visible = false;
        hidden.push(o);
      }
    };
    hide(this.world.scene.getObjectByName('terrain-board'));
    hide(this.world.scene.getObjectByName('supply-tray'));
    hide(this.world.scene.getObjectByName('plan-comparison-minis'));
    for (const e of this.queries.placeables.entities) hide(e.object3D!);
    // Panels: hide all; remember which were shown (ScreenSpace panels may report
    // visible=false on desktop while displayed, so the always-on ones count as shown).
    const alwaysOn = new Set(['hud-panel', 'actions-panel', 'time-panel', 'tray-labels']);
    for (const id of TABLETOP_PANELS) {
      const panel = this.world.getSceneObject(id);
      if (!panel) continue;
      if (panel.visible || alwaysOn.has(id)) hidden.push(panel);
      setPanelVisible(this.world, id, false);
    }
    const cam = this.world.camera;
    this.saved = {
      camPos: cam.position.clone(),
      camQuat: cam.quaternion.clone(),
      fog: (this.world.scene.fog as Fog | null) ?? null,
      hidden,
    };
    this.world.scene.fog = new Fog('#dce8ec', 60, 175);
    this.root.visible = true;
    setPanelVisible(this.world, 'street-panel', true);
    this.place(viewpoint);
  }

  private leave(): void {
    this.root.visible = false;
    setPanelVisible(this.world, 'street-panel', false);
    const s = this.saved;
    if (!s) return;
    this.world.scene.fog = s.fog;
    for (const o of s.hidden) {
      const id = TABLETOP_PANELS.find((pid) => this.world.getSceneObject(pid) === o);
      if (id) setPanelVisible(this.world, id, true);
      else o.visible = true;
    }
    if (!this.world.renderer.xr.isPresenting) {
      this.world.camera.position.copy(s.camPos);
      this.world.camera.quaternion.copy(s.camQuat);
    }
    this.saved = null;
  }

  /** Put the scene under the viewer at viewpoint `i` (no smooth motion). */
  private place(i: number): void {
    const v = VIEWPOINTS[i];
    const cam = this.world.camera;
    const xr = this.world.renderer.xr.isPresenting;
    if (!xr) {
      // Desktop: a level eye at the camera's height, looking ahead.
      const y = this.saved?.camPos.y ?? cam.position.y;
      cam.position.set(0, y, 0);
      cam.quaternion.setFromEuler(new Euler(-0.06, 0, 0));
    }
    cam.updateMatrixWorld(true);
    const head = cam.getWorldPosition(new Vector3());
    const fwd = cam.getWorldDirection(new Vector3());
    const headYaw = Math.atan2(-fwd.x, -fwd.z);
    const pose = streetPose(v, head.y);
    this.root.position.set(head.x, pose.y, head.z);
    this.root.rotation.set(0, pose.yaw + headYaw, 0);
    this.inner.position.set(pose.offsetX, 0, pose.offsetZ);
    this.markers.forEach((m, k) => (m.visible = k !== i));
  }

  update(delta: number): void {
    if (this.fadeDir === 0) return;
    this.fadeT = Math.min(1, Math.max(0, this.fadeT + (this.fadeDir * delta) / FADE));
    (this.fade.material as MeshBasicMaterial).opacity = this.fadeT;
    if (this.fadeDir > 0 && this.fadeT >= 1) {
      this.pending?.();
      this.pending = null;
      this.fadeDir = -1;
    } else if (this.fadeDir < 0 && this.fadeT <= 0) {
      this.fadeDir = 0;
      this.fade.visible = false;
    }
  }

  // ------------------------------------------------------------- scene --

  /** Rebuild the neighbourhood around (col,row) for the current plan and year. */
  private build(col: number, row: number): void {
    const plan = game.placements;
    const year = viewYear.peek();
    const key = `${col},${row}|${year}|${plan.map((p) => `${p.id}:${p.col},${p.row},${p.rotation}`).join(';')}`;
    if (key === this.builtKey) return;
    this.builtKey = key;
    for (const c of [...this.hood.children]) this.hood.remove(c);

    const era = eraForProgress(PROJECTION.progress[year]);
    const home = plan.find((p) => p.col === col && p.row === row)!;
    const homeTile = tileAt(game.terrain, col, row)!;
    const base = tileTopY(homeTile);
    const q = districtOrientation(game.terrain, plan, home).quarter;
    const hood = new Group(); // board metres, board orientation, centred on the district
    const townTiles = game.terrain.filter((t) => t.type === TerrainType.Town);

    for (let dr = -RADIUS; dr <= RADIUS; dr++) {
      for (let dc = -RADIUS; dc <= RADIUS; dc++) {
        const t = tileAt(game.terrain, col + dc, row + dr);
        if (!t) continue;
        const x = dc * TILE_SIZE;
        const z = dr * TILE_SIZE;
        const water = t.type === TerrainType.Sea || t.type === TerrainType.River;
        const top = (water ? WATER_LEVEL : tileTopY(t)) - base;
        hood.add(this.ground(t.type, x, z, top, t.col, t.row));
        const p = game.at(t.col, t.row);
        if (p) hood.add(this.structure(p, x, z, top, plan, era));
        else if (t.type === TerrainType.Town) {
          const i = townTiles.findIndex((tt) => tt.col === t.col && tt.row === t.row);
          const mid = Math.floor(townTiles.length / 2);
          const kind = i === mid ? 'plaza' : i === townTiles.length - 1 ? 'civic' : 'block';
          const tile = createTownTile(kind, idNumber(`t-${t.col}-${t.row}`) + t.col * 31 + t.row, 3 + ((t.col + t.row) % 2));
          setEra(tile, era);
          tile.position.set(x, top, z);
          hood.add(tile);
        }
      }
    }
    // The visited district's local frame is the street frame: undo its board turn.
    hood.rotation.y = -q * (Math.PI / 2);
    hood.scale.setScalar(STREET_SCALE);
    hood.traverse((o) => {
      o.castShadow = false; // the sun's shadow map only covers the tabletop
      o.receiveShadow = false;
      o.raycast = () => {};
    });
    this.hood.add(hood);
  }

  private ground(type: TerrainType, x: number, z: number, top: number, col: number, row: number): Object3D {
    const g = new Group();
    const depth = 0.03;
    const color = new Color(TERRAIN_COLORS[type]);
    const block = new Mesh(new BoxGeometry(TILE_SIZE, depth, TILE_SIZE), new MeshStandardMaterial({ color, roughness: 0.95 }));
    block.position.set(x, top - depth / 2, z);
    g.add(block);
    const r = rng(col * 97 + row * 13 + 5);
    if (type === TerrainType.Sea || type === TerrainType.River) {
      (block.material as MeshStandardMaterial).color.set('#2f8fb3');
      (block.material as MeshStandardMaterial).roughness = 0.15;
    } else if (type === TerrainType.Farmland) {
      for (let k = -2; k <= 2; k++) {
        const strip = new Mesh(
          new BoxGeometry(TILE_SIZE * 0.92, 0.0012, 0.0075),
          new MeshStandardMaterial({ color: r() < 0.5 ? '#c8a548' : '#6f9a3c', roughness: 1 }),
        );
        strip.position.set(x, top + 0.0006, z + k * 0.0105);
        g.add(strip);
      }
    } else if (type === TerrainType.Protected || type === TerrainType.Hill) {
      const n = type === TerrainType.Protected ? 9 : 3;
      for (let k = 0; k < n; k++) {
        const tx = x + (r() - 0.5) * TILE_SIZE * 0.85;
        const tz = z + (r() - 0.5) * TILE_SIZE * 0.85;
        const s = 0.8 + r() * 0.6;
        const trunk = new Mesh(new CylinderGeometry(0.0004, 0.0006, 0.006 * s, 5), new MeshStandardMaterial({ color: '#6b4f36' }));
        trunk.position.set(tx, top + 0.003 * s, tz);
        const crown =
          r() < 0.5
            ? new Mesh(new ConeGeometry(0.0034 * s, 0.011 * s, 7), new MeshStandardMaterial({ color: '#2f5a2c', flatShading: true }))
            : new Mesh(new IcosahedronGeometry(0.0042 * s, 1), new MeshStandardMaterial({ color: '#4d7a37', flatShading: true }));
        crown.position.set(tx, top + 0.009 * s, tz);
        g.add(trunk, crown);
      }
    }
    return g;
  }

  private structure(p: { id: string; type: StructureType; col: number; row: number; rotation: number }, x: number, z: number, top: number, plan: typeof game.placements, era: 0 | 1 | 2): Object3D {
    const { variant, seed } = structureLook(p.id, idNumber(p.id));
    const model = createStructureModel(p.type, p.id, variant, seed);
    let quarter = p.rotation;
    if (p.type === StructureType.Residential) {
      const o = districtOrientation(game.terrain, plan, p as never);
      quarter = o.quarter;
      setDistrictLinks(model, o.linkEast, o.linkWest);
      setEra(model, era);
    }
    if (p.type === StructureType.Road) {
      quarter = 0;
      const c = (dc: number, dr: number) => {
        const n = game.at(p.col + dc, p.row + dr);
        return n?.type === StructureType.Road || tileAt(game.terrain, p.col + dc, p.row + dr)?.type === TerrainType.Town;
      };
      setRoadArms(model, [c(1, 0), c(-1, 0), c(0, 1), c(0, -1)]);
    } else {
      // Drop the tabletop pad: 1.6 mm on the board would be a 1.6 m plinth here.
      const pad = model.getObjectByName('pad');
      pad?.parent?.remove(pad);
      model.position.y = -0.0016;
    }
    const g = new Group();
    g.add(model);
    g.position.set(x, top, z);
    g.rotation.y = quarter * (Math.PI / 2);
    return g;
  }

  private buildSky(): void {
    // Gradient sky dome (also hides passthrough while visiting) + far ground.
    // Everything stays inside the camera's far plane (200 m, iwsdk.config.json).
    const R = 190;
    const geo = new SphereGeometry(R, 32, 16);
    const colors: number[] = [];
    const pos = geo.attributes.position;
    const zenith = new Color('#7fb8e0');
    const horizon = new Color('#e9eee8');
    const c = new Color();
    for (let i = 0; i < pos.count; i++) {
      const h = Math.max(0, pos.getY(i) / R);
      c.copy(horizon).lerp(zenith, Math.pow(h, 0.6));
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new Float32BufferAttribute(colors, 3));
    const sky = new Mesh(geo, new MeshBasicMaterial({ vertexColors: true, side: BackSide, fog: false, depthWrite: false }));
    sky.name = 'street-sky';
    sky.renderOrder = -10;
    sky.raycast = () => {};
    this.root.add(sky);
    const far = new Mesh(new CircleGeometry(185, 48).rotateX(-Math.PI / 2), new MeshStandardMaterial({ color: '#a8b874', roughness: 1 }));
    far.position.y = -1.2;
    far.raycast = () => {};
    this.root.add(far);
    // A ring of low hills on the horizon.
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2 + 0.2;
      const hill = new Mesh(new ConeGeometry(34 + (k % 3) * 10, 14 + (k % 4) * 6, 7), new MeshStandardMaterial({ color: '#9aa875', flatShading: true }));
      hill.position.set(Math.cos(a) * 165, -1.2, Math.sin(a) * 165);
      hill.raycast = () => {};
      this.root.add(hill);
    }
  }

  /** Glowing standing spots at the other viewpoints: point and pinch to teleport. */
  private buildMarkers(): void {
    VIEWPOINTS.forEach((v, i) => {
      const g = new Group();
      g.name = `viewpoint-${i}`;
      const ring = new Mesh(new RingGeometry(0.45, 0.62, 32).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: '#ffd36b', transparent: true, opacity: 0.9 }));
      const disc = new Mesh(new CircleGeometry(0.62, 32).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.25 }));
      const beam = new Mesh(new CylinderGeometry(0.04, 0.04, 2.2, 8).translate(0, 1.1, 0), new MeshBasicMaterial({ color: '#ffd36b', transparent: true, opacity: 0.55 }));
      const hit = new Mesh(new CylinderGeometry(0.7, 0.7, 2.4, 12).translate(0, 1.2, 0), new MeshBasicMaterial({ visible: false }));
      ring.position.y = disc.position.y = 0.03;
      g.add(ring, disc, beam, hit);
      g.position.set(v.x, v.ground, v.z);
      const entity = this.world.createTransformEntity(g, { parent: this.innerEntity });
      entity.addComponent(RayInteractable);
      g.addEventListener('click' as never, (() => cmd.gotoViewpoint(i)) as never);
      this.markers.push(g);
    });
  }
}
