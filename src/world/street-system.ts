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
  AssetManager,
  CanvasTexture,
  CircleGeometry,
  EquirectangularReflectionMapping,
  Color,
  ConeGeometry,
  createSystem,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Fog,
  FogExp2,
  Group,
  IcosahedronGeometry,
  type Intersection,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  Quaternion,
  Raycaster,
  RayInteractable,
  RingGeometry,
  SphereGeometry,
  type Texture,
  TorusGeometry,
  Vector3,
} from '@iwsdk/core';
import { UIKit, type Entity, type UIKitMLAsset } from '@iwsdk/core';
import { YEARS, type Year } from '../config/projection.js';
import type { Placement } from '../simulation/metrics.js';
// Addon not re-exported by @iwsdk/core (imports the same `three` alias).
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GRID_COLS, StructureType, TerrainType, TILE_SIZE } from '../config/scenario.js';
import { projectYear, type YearMetrics } from '../simulation/projection.js';
import { TARGETS } from '../config/balance.js';
import * as cmd from '../core/commands.js';
import { coachText, detailsOpen, futuresOpen, game, miraTalked, planA, planVersion, streetView, tutorial, viewYear } from '../core/session.js';
import { Placeable } from '../interactions/placeable-component.js';
import { sfx, streetAmbience } from '../audio/sfx.js';
import { prefersReducedMotion, soundOn } from '../ui/accessibility.js';
import { setPanelVisible } from '../ui/panel-visibility.js';
import { tileTopY, WATER_LEVEL } from './board-coords.js';
import { TERRAIN_COLORS } from './board-mesh.js';
import { districtOrientation } from './district-links.js';
import { futureVisualState, type FutureVisualState } from './future-visual-state.js';
import { createSprawl } from './houses.js';
import { hashInts, idNumber, rng } from './rand.js';
import { LEAF_CROWN, SOLAR_GLASS } from './shared-materials.js';
import { isKitResource } from './kit.js';
import { ADULT_VARIANTS, isPeopleResource, personModel } from './people.js';
import { decorPrototype } from './terrain-decor.js';
import { PAINTED, PAINTED_FLAT } from './palette.js';
import { Bubble, createChild, createGarden, disposeTree, type Child } from './child.js';
import { CHILD_AGE, CHILD_NAME, childNarrative, type ChildNarrative } from './child-narrative.js';
import { miraDialogue, narrativeContext, type DialogueLine } from './mira-dialogue.js';
import { PoiMarkers } from './poi-markers.js';
import { pointsOfInterest } from './points-of-interest.js';
import { compareRows } from './street-compare.js';
import { streetStory } from './street-story.js';
import { CHILD_SPOT, GARDEN, streetPose, STREET_SCALE, type Viewpoint, VIEWPOINTS } from './street-view.js';
import { createStructureModel, setDistrictLinks, setRoadArms, structureLook } from './structure-models.js';
import { tileAt } from './terrain-map.js';
import { createTownTile, setEra } from './villas.js';

const TABLETOP_PANELS = ['hud-panel', 'actions-panel', 'time-panel', 'overlay-panel', 'compare-panel', 'tray-labels'];
const RADIUS = 2; // tiles around the district (5 x 5)
/**
 * Info boards for the points of interest (street-inner metres): south sidewalk
 * between the gate and her garden, north sidewalk toward the street's start.
 * Both stay out of the garden viewpoint's view of Mira.
 */
const POI_BOARDS = [
  { x: 3.2, z: -3.6 },
  { x: -9, z: 3.6 },
];
const FADE = 0.22; // seconds per half of a teleport fade
const DRY_TINT = new Color('#b98f58');
const LUSH_TINT = new Color('#7fbf5c');
const MURKY = new Color('#8e9468');
const CLEAR_AIR = new Color('#dce8ec');
const SMOG_AIR = new Color('#a8957a');
const SMOG_SKY = new Color('#c9b48f');
const WHITE = new Color('#ffffff');
const BIRDS = 14;
/** Module-level materials shared by procedural models (never disposed). */
const SHARED_PAINT = new Set<object>([PAINTED, PAINTED_FLAT]);
/** Shared decor prototypes used for street trees (never disposed). */
const SHARED_GEO = new Set<object>((['round', 'pine', 'cypress', 'olive', 'shrub'] as const).map((k) => decorPrototype(k)));

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
  private saved: { camPos: Vector3; camQuat: Quaternion; fog: Fog | FogExp2 | null; hidden: Object3D[] } | null = null;
  private wasActive = false;
  private innerEntity!: Entity;
  private state: FutureVisualState | null = null;
  private story: string[] = [];
  private streetMat: MeshStandardMaterial | undefined;
  private sky!: Mesh;
  private birds!: InstancedMesh;
  private clock = 0;
  private paintPanel: (() => void) | null = null;
  private visit = { col: 0, row: 0 };
  private districtHere = true;
  private shownPlan: 'A' | 'B' | 'none' = 'B';

  init(): void {
    this.root.name = 'street-scene';
    this.root.visible = false;
    this.inner.name = 'street-inner';
    this.root.add(this.inner);
    this.inner.add(this.hood);
    const rootEntity = this.world.createTransformEntity(this.root);
    this.innerEntity = this.world.createTransformEntity(this.inner, { parent: rootEntity });
    this.pois = new PoiMarkers(this.world, this.innerEntity);
    this.buildSky();
    this.buildMarkers();
    // Birds over a recovering region (count follows `greening`).
    const wingA = new BoxGeometry(0.5, 0.05, 0.14).translate(0.24, 0, 0).rotateY(0.5);
    const wingB = new BoxGeometry(0.5, 0.05, 0.14).translate(-0.24, 0, 0).rotateY(-0.5);
    this.birds = new InstancedMesh(mergeGeometries([wingA, wingB])!, new MeshBasicMaterial({ color: '#2f3438' }), BIRDS);
    this.birds.name = 'street-birds';
    this.birds.count = 0;
    this.birds.frustumCulled = false;
    this.birds.raycast = () => {};
    this.root.add(this.birds);

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
      viewYear.subscribe(() => {
        const v = streetView.peek();
        if (!v || !this.wasActive) return;
        // A warm "time flash" (not the dark teleport fade), then the same street in the new year.
        this.fadeThen(() => {
          this.build(this.visit.col, this.visit.row);
          this.place(v.viewpoint);
        }, '#fff4d6');
      }),
      soundOn.subscribe((on) => {
        if (!on) streetAmbience.stop();
        else if (this.root.visible) {
          streetAmbience.start();
          this.applyAtmosphere();
        }
      }),
      this.world.visibilityState.subscribe(() => {
        // Leaving XR while visiting: come back to the tabletop.
        if (streetView.peek() && this.saved) cmd.exitCity();
      }),
    );

    const hook = ((window as unknown as Record<string, unknown>).__terracity ??= {}) as Record<string, unknown>;
    /** Talk to Mira: 'next' (start / next line), 'back', 'end'. Same as the panel and pinching her. */
    hook.talk = (a: 'next' | 'back' | 'end') => (a === 'next' ? this.talkNext() : a === 'back' ? this.talkBack() : this.talkEnd());
    /** Open / close point of interest i near Mira (same as pinching its sign). */
    hook.poi = (i: number) => this.pois.toggle(i);
    hook.street = () => ({
      poi: this.pois.info(),
      tile: this.visit ? `${this.visit.col},${this.visit.row}` : null,
      active: !!streetView.peek(),
      viewpoint: streetView.peek()?.viewpoint ?? null,
      name: streetView.peek() ? VIEWPOINTS[streetView.peek()!.viewpoint].name : null,
      built: this.builtKey,
      boardVisible: this.world.scene.getObjectByName('terrain-board')?.visible ?? null,
      fading: this.fadeDir !== 0,
      year: viewYear.peek(),
      plan: streetView.peek()?.plan ?? null,
      child: this.narrative
        ? { talking: this.convo.active, index: this.convo.index, dialogue: this.dialogue.map((d) => d.text), happy: this.narrative.state === 'thriving', state: this.narrative.state, garden: this.narrative.garden, lines: [...this.narrative.lines], speaking: this.talk.near, line: this.talk.line, groundY: +(this.child?.root.position.y ?? 0).toFixed(3) }
        : null,
      districtHere: this.districtHere,
      geometries: this.world.renderer.info.memory.geometries,
      story: [...this.story],
      haze: this.state?.haze ?? 0,
      greening: this.state?.greening ?? 0,
      birds: this.birds?.count ?? 0,
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
    for (const y of YEARS) click(`st-${y}`, () => cmd.setYear(y));
    click('st-details-btn', () => (detailsOpen.value = !detailsOpen.peek()));
    click('st-talk', () => this.talkNext());
    click('st-talk-back', () => this.talkBack());
    click('st-talk-end', () => this.talkEnd());
    click('st-plan-a', () => cmd.setStreetPlan('A'));
    click('st-plan-b', () => cmd.setStreetPlan('B'));
    const compare = panel.getElementById('st-compare');
    const title = panel.getElementById<UIKit.Text>('st-title');
    const sub = panel.getElementById<UIKit.Text>('st-view');
    const lines = [0, 1, 2, 3, 4].map((i) => panel.getElementById<UIKit.Text>(`st-line-${i}`));
    const tipEl = panel.getElementById<UIKit.Text>('st-tip');
    const refresh = () => {
      const v = streetView.peek();
      if (!v) return;
      title?.setProperties({ text: `${v.title ?? 'Your neighbourhood'} - ${viewYear.peek()}` });
      sub?.setProperties({ text: `Viewpoint ${v.viewpoint + 1} of ${VIEWPOINTS.length}: ${VIEWPOINTS[v.viewpoint].name}` });
      for (const y of YEARS) {
        const on = viewYear.peek() === y;
        panel.getElementById(`st-${y}`)?.setProperties({ backgroundColor: on ? '#1d5f6b' : '#eef3f4', borderColor: on ? '#1d5f6b' : '#c7d6da' });
        panel.getElementById<UIKit.Text>(`st-${y}-label`)?.setProperties({ color: on ? '#ffffff' : '#1d3f46' });
      }
      lines.forEach((el, i) => el?.setProperties({ text: this.story[i] ?? '', display: this.story[i] ? 'flex' : 'none' }));
      // Talking to Mira: Talk / Back / Next / End (only when she is here).
      const here = !!this.child && this.dialogue.length > 0;
      const talking = this.convo.active;
      panel.getElementById('st-talk-row')?.setProperties({ display: here ? 'flex' : 'none' });
      panel.getElementById<UIKit.Text>('st-talk-label')?.setProperties({ text: talking ? (this.convo.index < this.dialogue.length - 1 ? 'Next' : 'Finish') : 'Talk to Mira' });
      panel.getElementById('st-talk-back')?.setProperties({ display: talking ? 'flex' : 'none' });
      panel.getElementById('st-talk-end')?.setProperties({ display: talking ? 'flex' : 'none' });
      // Guided tips follow the player into the street; the next target glows amber.
      const tip = coachText.peek();
      tipEl?.setProperties({ text: tip || '-', display: tip ? 'flex' : 'none' });
      const cue = tutorial.active ? tutorial.step : null;
      panel.getElementById('st-return')?.setProperties({ backgroundColor: cue === 'other' ? '#b87500' : undefined });
      panel.getElementById('st-talk')?.setProperties({ backgroundColor: cue === 'talk' && !this.convo.active ? '#b87500' : undefined });
      // Compare futures (only with a saved Plan A): the four differences that matter here.
      const a = planA.peek();
      compare?.setProperties({ display: a && v.plan !== 'none' ? 'flex' : 'none' });
      if (a && v.plan !== 'none') {
        for (const tag of ['a', 'b'] as const) {
          const on = v.plan === tag.toUpperCase();
          panel.getElementById(`st-plan-${tag}`)?.setProperties({ backgroundColor: on ? '#1d5f6b' : '#ffffff', borderColor: on ? '#1d5f6b' : '#c7d6da' });
          panel.getElementById<UIKit.Text>(`st-plan-${tag}-label`)?.setProperties({ color: on ? '#ffffff' : '#1d3f46' });
        }
        compareRows(game.terrain, a, game.placements, viewYear.peek()).forEach((row, i) => {
          panel.getElementById<UIKit.Text>(`st-c${i}-l`)?.setProperties({ text: row.label });
          for (const side of ['a', 'b'] as const) {
            const best = row.better === side.toUpperCase();
            panel.getElementById<UIKit.Text>(`st-c${i}-${side}`)?.setProperties({
              text: `${side.toUpperCase()}: ${row[side]}`,
              color: best ? '#1f8a4c' : '#272727',
              fontWeight: best ? 700 : 400,
            });
          }
        });
      }
    };
    const layer = () => {
      const open = detailsOpen.value;
      panel.getElementById('st-details')?.setProperties({ display: open ? 'flex' : 'none' });
      panel.getElementById<UIKit.Text>('st-details-label')?.setProperties({ text: open ? 'Less' : 'Details' });
      const obj = this.world.getSceneEntity('street-panel')?.object3D;
      if (obj) {
        obj.userData.base_height = open ? (planA.peek() ? '56%' : '40%') : '28%';
        window.dispatchEvent(new Event('terracity-relayout'));
      }
    };
    this.cleanupFuncs.push(detailsOpen.subscribe(layer), planA.subscribe(layer));
    this.paintPanel = refresh;
    this.cleanupFuncs.push(
      streetView.subscribe(refresh),
      viewYear.subscribe(refresh),
      planA.subscribe(refresh),
      planVersion.subscribe(refresh),
      coachText.subscribe(refresh),
    );
  }

  // ------------------------------------------------------- transitions --

  private onChange(v: (typeof streetView)['value']): void {
    if (v && !this.wasActive) {
      this.wasActive = true;
      this.shownPlan = v.plan;
      sfx.enter();
      this.fadeThen(() => this.enter(v.col, v.row, v.viewpoint));
    } else if (v && this.wasActive && v.plan !== this.shownPlan) {
      // Compare futures: the same place, camera and light under the other plan.
      this.shownPlan = v.plan;
      sfx.teleport();
      this.fadeThen(() => {
        this.build(this.visit.col, this.visit.row);
        this.place(v.viewpoint);
      }, '#e8f1ff');
    } else if (v && this.wasActive) {
      sfx.teleport();
      this.fadeThen(() => this.place(v.viewpoint));
    } else if (!v && this.wasActive) {
      this.wasActive = false;
      sfx.exit();
      streetAmbience.stop();
      this.fadeThen(() => this.leave());
    }
  }

  private fadeThen(fn: () => void, color = '#0b1214'): void {
    (this.fade.material as MeshBasicMaterial).color.set(color);
    if (prefersReducedMotion()) {
      fn();
      return;
    }
    this.pending = fn;
    this.fadeDir = 1;
    this.fade.visible = true;
  }

  private enter(col: number, row: number, viewpoint: number): void {
    this.visit = { col, row };
    miraTalked.value = false; // a new visit: she has not been talked to yet
    this.build(col, row);
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
    hide(this.world.scene.getObjectByName('split-futures'));
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
      fog: (this.world.scene.fog as Fog | FogExp2 | null) ?? null,
      hidden,
    };
    this.world.scene.fog = new FogExp2('#dce8ec', 0.006);
    this.root.visible = true;
    // The real HDR sky (Poly Haven, CC0) behind the street; the dome stays as fallback.
    this.savedBackground = this.world.scene.background;
    void this.loadSky().then(() => this.applyAtmosphere());
    streetAmbience.start();
    this.applyAtmosphere();
    setPanelVisible(this.world, 'street-panel', true);
    this.place(viewpoint);
  }

  private savedBackground: unknown = null;
  private skyTex: Texture | null = null;
  private async loadSky(): Promise<Texture | null> {
    if (this.skyTex) return this.skyTex;
    try {
      const t = await AssetManager.loadHDRTexture(`${import.meta.env.BASE_URL}env/sky_1k.hdr`);
      t.mapping = EquirectangularReflectionMapping;
      this.skyTex = t;
      return t;
    } catch {
      return null;
    }
  }

  private leave(): void {
    this.root.visible = false;
    this.world.scene.background = this.savedBackground as never;
    this.sky.visible = true;
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
    // Without a district here (e.g. Plan A left this tile empty) stand on what
    // is really there: open ground or an unplanned sprawl slab, never inside a house.
    const pose = streetPose(this.districtHere ? v : this.clearStand(v), head.y);
    this.root.position.set(head.x, pose.y, head.z);
    this.root.rotation.set(0, pose.yaw + headYaw, 0);
    this.inner.position.set(pose.offsetX, 0, pose.offsetZ);
    this.markers.forEach((m, k) => (m.visible = k !== i));
  }

  update(delta: number): void {
    this.clock += delta;
    this.stepChild(delta);
    if (this.root.visible) this.pois.update(this.world.camera.getWorldPosition(new Vector3()));
    if (this.root.visible) {
      for (const c of this.cyclists) {
        c.obj.position.x += c.dir * c.speed * delta;
        if (c.obj.position.x > 26) c.obj.position.x = -26;
        if (c.obj.position.x < -26) c.obj.position.x = 26;
      }
      if (!prefersReducedMotion()) {
        for (const p of this.life.children) {
          if (p.userData.bob !== undefined) p.rotation.z = 0.02 * Math.sin(this.clock * 1.3 + (p.userData.bob as number));
        }
      }
    }
    if (this.root.visible && this.birds.count) {
      const m = new Matrix4();
      const q = new Quaternion();
      const up = new Vector3(0, 1, 0);
      const v = new Vector3();
      for (let i = 0; i < this.birds.count; i++) {
        const flock = i % 2;
        const a = this.clock * (flock ? 0.12 : -0.09) + (i >> 1) * 0.11 + flock * 2.1;
        // Low over the street (local frame of the scene root), crossing the views.
        const rad = 16 + flock * 12 + ((i * 7) % 5) * 1.2;
        v.set(Math.cos(a) * rad, 9 + flock * 4 + ((i * 3) % 4), Math.sin(a) * rad - 10);
        q.setFromAxisAngle(up, -a + (flock ? 0 : Math.PI));
        m.compose(v, q, new Vector3(1, 0.7 + 0.3 * Math.sin(this.clock * 8 + i), 1));
        this.birds.setMatrixAt(i, m);
      }
      this.birds.instanceMatrix.needsUpdate = true;
    }
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
    const tag = streetView.peek()?.plan ?? 'B';
    const plan = tag === 'none' ? [] : tag === 'A' && planA.peek() ? planA.peek()! : game.placements;
    const year = viewYear.peek();
    const key = `${tag}|${col},${row}|${year}|${plan.map((p) => `${p.id}:${p.col},${p.row},${p.rotation}`).join(';')}`;
    if (key === this.builtKey) return;
    this.builtKey = key;
    this.disposeHood();

    // Everything below follows the projection of the current plan for this year.
    // game.metrics belongs to the current map (Plan B); Plan A computes its own.
    const projected = projectYear(game.terrain, plan, year, plan === game.placements ? game.metrics : undefined);
    const st = futureVisualState(game.terrain, plan, projected);
    this.state = st;
    const era = st.homeEra;
    const sprawl = new Map(st.sprawl.map((t) => [t.row * GRID_COLS + t.col, t]));
    const home = plan.find((p) => p.col === col && p.row === row && p.type === StructureType.Residential);
    this.districtHere = !!home;
    const homeTile = tileAt(game.terrain, col, row)!;
    const base = tileTopY(homeTile);
    const q = home ? districtOrientation(game.terrain, plan, home).quarter : 0;
    const hood = new Group(); // board metres, board orientation, centred on the district
    const townTiles = game.terrain.filter((t) => t.type === TerrainType.Town);
    let sprawlNearby = 0;
    let beachesNearby = 0;

    for (let dr = -RADIUS; dr <= RADIUS; dr++) {
      for (let dc = -RADIUS; dc <= RADIUS; dc++) {
        const t = tileAt(game.terrain, col + dc, row + dr);
        if (!t) continue;
        const x = dc * TILE_SIZE;
        const z = dr * TILE_SIZE;
        const water = t.type === TerrainType.Sea || t.type === TerrainType.River;
        const top = (water ? WATER_LEVEL : tileTopY(t)) - base;
        const sp = sprawl.get(t.row * GRID_COLS + t.col);
        const p = plan.find((q) => q.col === t.col && q.row === t.row);
        if (t.type === TerrainType.Beach) beachesNearby++;
        hood.add(this.ground(t.type, x, z, top, t.col, t.row, st, !!(p || sp)));
        if (p) hood.add(this.structure(p, x, z, top, plan, era));
        else if (sp) {
          // Unplanned sprawl where the projection puts newcomers without homes.
          sprawlNearby++;
          const g = createSprawl(hashInts(sp.col, sp.row, 5), sp.buildings);
          g.position.set(x, top, z);
          hood.add(g);
        } else if (t.type === TerrainType.Town) {
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
    const kitTint = new Color('#ffffff').lerp(DRY_TINT, st.dryness * 0.55);
    hood.traverse((o) => {
      o.castShadow = false; // the sun's shadow map only covers the tabletop
      o.receiveShadow = false;
      o.raycast = () => {};
      // Kit models use a street copy of the atlas material, tinted toward dry
      // ochre with the projected dryness (lawns, gardens and trees parch).
      const mesh = o as Mesh;
      const mat = mesh.material as MeshStandardMaterial | undefined;
      if (mesh.isMesh && mat?.map && mat !== SOLAR_GLASS && mat !== LEAF_CROWN) {
        this.streetMat ??= mat.clone();
        mesh.material = this.streetMat;
      }
    });
    this.streetMat?.color.copy(kitTint);
    this.applyDrought(st.dryness);
    this.hood.add(hood);
    this.story = streetStory(projected, st, { sprawlNearby, beachesNearby, homesHere: !!home });
    this.buildLife(st, !!home);
    this.buildChild(projected, st, !!home);
    this.buildPois(plan, year, col, row, hood);
    this.applyAtmosphere();
  }

  // ------------------------------------------------------- the last child --

  private childGroup = new Group();
  private child: Child | null = null;
  private narrative: ChildNarrative | null = null;
  private bubble = new Bubble();
  private talk = { t: 0, near: false, line: 0 };

  /** Mira (2050 only) and her little garden, from the projection of this plan. */
  private buildChild(projected: YearMetrics, st: FutureVisualState, homesHere: boolean): void {
    for (const c of [...this.childGroup.children]) {
      if (c !== this.bubble.mesh) disposeTree(c);
      this.childGroup.remove(c);
    }
    if (!this.childGroup.parent) this.inner.add(this.childGroup);
    this.narrative = childNarrative(projected, st, { homesHere });
    this.child = null;
    // On a district plinth, or on whatever stands under her spot (an unplanned
    // sprawl slab is ~0.7 m tall: never bury her in it).
    const ground = homesHere ? 0.62 : this.groundAt(CHILD_SPOT.x, CHILD_SPOT.z);
    const gardenKind = this.narrative ? this.narrative.garden : projected.environment >= TARGETS.environment ? 'lush' : 'dry';
    const garden = createGarden(gardenKind, GARDEN.w, GARDEN.d);
    garden.position.set(GARDEN.x, ground, GARDEN.z);
    this.childGroup.add(garden);
    this.talk = { t: 0, near: false, line: 0 };
    this.bubble.opacity = 0;
    this.dialogue = [];
    this.convo = { active: false, index: 0, t: 0 };
    if (this.talkTarget) this.talkTarget.visible = false;
    if (!this.narrative) return;
    // Grounded, user-paced conversation for this future and this place (mira-dialogue.ts).
    const v = streetView.peek();
    if (v) {
      const tag = v.plan;
      const current = tag === 'none' ? [] : tag === 'A' && planA.peek() ? planA.peek()! : game.placements;
      const other =
        tag === 'A' ? { planId: 'B' as const, plan: game.placements }
        : tag === 'none' ? { planId: 'B' as const, plan: game.placements }
        : planA.peek() ? { planId: 'A' as const, plan: planA.peek()! }
        : futuresOpen.peek() ? { planId: 'none' as const, plan: [] }
        : null;
      const ctx = narrativeContext(game.terrain, current, tag, projected.year, this.visit.col, this.visit.row, other);
      this.dialogue = miraDialogue(ctx);
    }
    this.child = createChild();
    // Her face follows the simulated outcome: she smiles only in a thriving neighbourhood.
    this.child.mood?.(this.narrative.state === 'thriving');
    this.child.root.position.set(CHILD_SPOT.x, ground, CHILD_SPOT.z);
    this.childGroup.add(this.child.root);
    this.bubble.mesh.position.set(CHILD_SPOT.x, ground + 1.62, CHILD_SPOT.z);
    this.childGroup.add(this.bubble.mesh);
    // Soft contact shadow and the talk affordance (a ring at her feet; pinch / tap her).
    const shadow = new Mesh(new CircleGeometry(0.32, 24).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.28, depthWrite: false }));
    shadow.position.set(CHILD_SPOT.x, ground + 0.01, CHILD_SPOT.z);
    shadow.raycast = () => {};
    this.childGroup.add(shadow);
    this.ensureTalkTarget();
    this.talkTarget!.position.set(CHILD_SPOT.x, ground, CHILD_SPOT.z);
    this.talkTarget!.visible = true;
    this.paintPanel?.();
  }

  /** Nearest clear standing spot to viewpoint `v` when no district stands here. */
  private clearStand(v: Viewpoint): Viewpoint {
    for (const r of [0, 2, 4, 6, 9, 12]) {
      for (let k = 0; k < (r ? 8 : 1); k++) {
        const a = (k / 8) * Math.PI * 2;
        const x = v.x + Math.cos(a) * r;
        const z = v.z + Math.sin(a) * r;
        const tops = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => this.surfaceAt(x + dx, z + dz));
        const g = tops[0];
        if (g > 1.2 || !tops.every((t) => t < g + 0.25)) continue; // ground or a slab, never a roof
        // A clear view ahead: no wall within 8 m across the view (+-40 deg).
        const len = Math.hypot(v.lookX - x, v.lookZ - z) || 1;
        const ux = (v.lookX - x) / len;
        const uz = (v.lookZ - z) / len;
        const ahead = [-0.7, -0.35, 0, 0.35, 0.7].every((a) => {
          const c = Math.cos(a);
          const s = Math.sin(a);
          const dx = ux * c - uz * s;
          const dz = ux * s + uz * c;
          return [1, 2, 3, 4, 5, 6, 8].every((d) => this.surfaceAt(x + dx * d, z + dz * d) < g + 1);
        });
        if (ahead) return { ...v, x, z, ground: g };
      }
    }
    return { ...v, ground: 0 };
  }

  /** Highest surface of the built neighbourhood under (x, z), in street-inner metres. */
  private surfaceAt(x: number, z: number): number {
    const hits = this.rayDown(x, z);
    return hits.length ? Math.max(0, this.inner.worldToLocal(hits[0].point.clone()).y) : 0;
  }

  private rayDown(x: number, z: number): Intersection[] {
    this.inner.updateMatrixWorld(true);
    const origin = this.inner.localToWorld(new Vector3(x, 40, z));
    const down = this.inner.localToWorld(new Vector3(x, 0, z)).sub(origin).normalize();
    // The street disables raycasts on its meshes (cheap XR rays): use the
    // prototype's raycast directly.
    const rc = new Raycaster(origin, down);
    const hits: Intersection[] = [];
    this.hood.traverseVisible((o) => {
      if ((o as Mesh).isMesh) (Object.getPrototypeOf(o) as Mesh).raycast.call(o, rc, hits);
    });
    return hits.sort((a, b) => a.distance - b.distance);
  }

  /** First surface below head height under (x, z) (skips canopies and roofs). */
  private groundAt(x: number, z: number): number {
    for (const hit of this.rayDown(x, z)) {
      const y = this.inner.worldToLocal(hit.point.clone()).y;
      if (y < 1.2) return Math.max(0, y);
    }
    return 0;
  }

  // ------------------------------------------------ points of interest --

  private pois!: PoiMarkers;

  /**
   * One or two places near Mira that explain a modelled consequence, chosen
   * from this plan / future only (points-of-interest.ts). Each is an info board
   * on her street (human scale, never in front of her) whose arrow points at
   * the real place: the park, the solar farm, the unplanned houses.
   */
  private buildPois(plan: readonly Placement[], year: Year, col: number, row: number, hood: Group): void {
    const pois = pointsOfInterest(game.terrain, plan, year, col, row);
    hood.updateMatrixWorld(true);
    this.inner.updateMatrixWorld(true);
    const at: Vector3[] = [];
    const targets: Array<Vector3 | null> = [];
    pois.forEach((poi, i) => {
      const b = POI_BOARDS[i];
      at.push(new Vector3(b.x, this.groundAt(b.x, b.z), b.z));
      const dc = poi.tile.col - col;
      const dr = poi.tile.row - row;
      targets.push(dc || dr ? this.inner.worldToLocal(hood.localToWorld(new Vector3(dc * TILE_SIZE, 0, dr * TILE_SIZE))) : null);
    });
    this.pois.set(pois, at, targets);
  }

  // ------------------------------------------------- conversation (user-paced) --

  private dialogue: DialogueLine[] = [];
  private convo = { active: false, index: 0, t: 0 };
  private talkTarget: Group | null = null;
  private talkRing: Mesh | null = null;

  /** Ring at her feet + an invisible capsule: point and pinch (or tap) her to talk. */
  private ensureTalkTarget(): void {
    if (this.talkTarget) return;
    const g = new Group();
    g.name = 'mira-talk';
    this.talkRing = new Mesh(new RingGeometry(0.42, 0.5, 40).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: '#ffd36b', transparent: true, opacity: 0.8, depthWrite: false }));
    this.talkRing.position.y = 0.02;
    this.talkRing.raycast = () => {};
    const hit = new Mesh(new CylinderGeometry(0.45, 0.45, 1.5, 12).translate(0, 0.75, 0), new MeshBasicMaterial({ visible: false }));
    g.add(this.talkRing, hit);
    const entity = this.world.createTransformEntity(g, { parent: this.innerEntity });
    entity.addComponent(RayInteractable);
    g.addEventListener('click' as never, (() => this.talkNext()) as never);
    this.talkTarget = g;
  }

  /** Start the conversation, or go to the next line (the last line ends it). */
  talkNext(): void {
    if (!this.child || !this.dialogue.length) return;
    if (!this.convo.active) this.convo = { active: true, index: 0, t: 0 };
    else if (this.convo.index < this.dialogue.length - 1) this.convo = { ...this.convo, index: this.convo.index + 1, t: 0 };
    else return this.talkEnd();
    sfx.childChime(0);
    this.paintPanel?.();
  }

  talkBack(): void {
    if (!this.convo.active || this.convo.index === 0) return;
    this.convo = { ...this.convo, index: this.convo.index - 1, t: 0 };
    sfx.childChime(0);
    this.paintPanel?.();
  }

  talkEnd(): void {
    if (!this.convo.active) return;
    this.convo = { active: false, index: 0, t: 0 };
    miraTalked.value = true; // a conversation was had (the first-five-minutes step moves on)
    this.paintPanel?.();
  }

  /** She turns to you, breathes, shifts her weight and waves when a line starts. */
  private stepChild(delta: number): void {
    const c = this.child;
    const n = this.narrative;
    if (!c || !n || !this.root.visible) return;
    const cam = this.world.camera.getWorldPosition(new Vector3());
    const local = this.childGroup.worldToLocal(cam.clone());
    const dx = local.x - c.root.position.x;
    const dz = local.z - c.root.position.z;
    const near = Math.hypot(dx, dz) < 8;
    const want = Math.atan2(dx, dz);
    let dy = want - c.body.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    c.body.rotation.y += dy * Math.min(1, delta * 3);
    const calm = prefersReducedMotion();
    c.body.scale.y = calm ? 1 : 1 + 0.012 * Math.sin(this.clock * 2.1);
    c.body.rotation.z = calm ? 0 : 0.025 * Math.sin(this.clock * 0.7); // weight shift
    if (near && !this.talk.near) {
      this.talk = { t: 0, near: true, line: 0 };
      sfx.childChime(Math.max(-1, Math.min(1, dx / 6)));
    } else if (!near) {
      this.talk.near = false;
      if (this.convo.active) this.talkEnd();
    }
    this.convo.t += delta;
    // Bubble: an invitation when she notices you, then the line you are on.
    const line = this.convo.active ? this.dialogue[this.convo.index]?.text : null;
    this.bubble.set(
      line ? `${CHILD_NAME}, ${CHILD_AGE}  (${this.convo.index + 1}/${this.dialogue.length})` : `${CHILD_NAME}, ${CHILD_AGE}`,
      line ?? (this.dialogue.length ? 'Hi! Pinch me or tap Talk to Mira.' : ''),
    );
    const target = near && (line || this.dialogue.length) ? 1 : 0;
    const op = (this.bubble.mesh.material as MeshBasicMaterial).opacity;
    this.bubble.opacity = op + (target - op) * Math.min(1, delta * 4);
    this.bubble.mesh.lookAt(this.childGroup.localToWorld(new Vector3(local.x, this.bubble.mesh.position.y, local.z)));
    if (this.talkRing) {
      this.talkRing.visible = near && !this.convo.active;
      (this.talkRing.material as MeshBasicMaterial).opacity = calm ? 0.7 : 0.55 + 0.3 * Math.sin(this.clock * 3);
    }
    // Wave as each line starts (and once when she first sees you).
    const since = this.convo.active ? this.convo.t : this.talk.t;
    if (near) this.talk.t += delta;
    c.arm.rotation.z = near && since < 1.8 && !calm ? -2.5 + 0.35 * Math.sin(this.clock * 9) : -0.12;
  }

  /**
   * Daily life (street metres, district frame): people on the sidewalks and, from
   * 2035 when the cycle lane exists, cyclists riding it. Illustrative scenario:
   * under heavy smog (haze >= 0.2) fewer people are outdoors and nobody cycles.
   * Nothing is drawn when there is no planned street here.
   */
  private life = new Group();
  private cyclists: Array<{ obj: Object3D; speed: number; dir: 1 | -1 }> = [];
  private buildLife(st: FutureVisualState, homesHere: boolean): void {
    for (const c of [...this.life.children]) {
      c.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh && !isPeopleResource(m.geometry)) m.geometry.dispose();
      });
      this.life.remove(c);
    }
    this.cyclists = [];
    if (!this.life.parent) this.inner.add(this.life);
    if (!homesHere) return;
    const smog = st.haze >= 0.2;
    const r = rng(77);
    const spots: Array<[number, number, number]> = [
      [-15, 3.9, 0.3], [-9.5, -3.9, 2.8], [-3.2, 4.0, -0.4], [-6.0, -4.0, 3.4], [8.5, 3.9, 1.1], [13, -4.0, 2.2], [17.5, 4.1, -1.2], [-19.5, -3.9, 1.7],
    ];
    const outdoors = smog ? spots.filter((_, i) => i % 3 === 0) : spots;
    for (const [x, z, yaw] of outdoors) this.life.add(this.person(x, z, 0.62, yaw, r));
    if (st.homeEra >= 1 && !smog) {
      for (const [x0, dir] of [[-20, 1], [12, -1]] as const) {
        const bike = this.cyclist(r);
        bike.position.set(x0, 0.35, dir === 1 ? 2.45 : 1.85);
        bike.rotation.y = dir === 1 ? -Math.PI / 2 : Math.PI / 2;
        this.life.add(bike);
        this.cyclists.push({ obj: bike, speed: 3.2 + r(), dir });
      }
    }
  }

  private static readonly SKIN = ['#e8c4a0', '#c99a72', '#8d5a3b', '#f1d3b8'];
  private static readonly CLOTH = ['#2f5d8a', '#c0563b', '#e7d9b8', '#3f7a52', '#7a4f8f', '#f2f2f2', '#d9a441'];
  private personMat = new Map<string, MeshStandardMaterial>();
  private mat(c: string): MeshStandardMaterial {
    let m = this.personMat.get(c);
    if (!m) this.personMat.set(c, (m = new MeshStandardMaterial({ color: c, roughness: 0.85 })));
    return m;
  }

  private person(x: number, z: number, y: number, yaw: number, r: () => number): Object3D {
    const authored = personModel(`adult-${Math.floor(r() * ADULT_VARIANTS)}`);
    if (authored) {
      authored.position.set(x, y, z);
      authored.rotation.y = yaw;
      authored.scale.setScalar(0.94 + r() * 0.12);
      authored.userData.bob = r() * 6;
      return authored;
    }
    const g = new Group();
    const h = 1.55 + r() * 0.3;
    const top = this.mat(StreetSystem.CLOTH[Math.floor(r() * StreetSystem.CLOTH.length)]);
    const legs = this.mat(r() < 0.5 ? '#3a3f4a' : '#6b5a46');
    for (const dx of [-0.09, 0.09]) {
      const leg = new Mesh(new CylinderGeometry(0.07, 0.06, h * 0.47, 6), legs);
      leg.position.set(dx, h * 0.235, 0);
      g.add(leg);
    }
    const body = new Mesh(new CylinderGeometry(0.17, 0.2, h * 0.36, 8), top);
    body.position.y = h * 0.47 + h * 0.18;
    const head = new Mesh(new SphereGeometry(0.11, 10, 8), this.mat(StreetSystem.SKIN[Math.floor(r() * StreetSystem.SKIN.length)]));
    head.position.y = h * 0.47 + h * 0.36 + 0.12;
    g.add(body, head);
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    g.userData.bob = r() * 6;
    g.traverse((o) => (o.raycast = () => {}));
    return g;
  }

  private cyclist(r: () => number): Object3D {
    const g = new Group();
    const steel = this.mat('#2b2f33');
    for (const dz of [-0.55, 0.55]) {
      const wheel = new Mesh(new TorusGeometry(0.33, 0.035, 6, 18), steel);
      wheel.rotation.y = Math.PI / 2;
      wheel.position.set(0, 0.33, dz);
      g.add(wheel);
    }
    const frame = new Mesh(new BoxGeometry(0.05, 0.05, 1.0), this.mat('#c0563b'));
    frame.position.set(0, 0.62, 0);
    g.add(frame);
    const seated = personModel('rider');
    if (seated) {
      seated.position.set(0, 0.0, 0.05); // hips on the saddle, hands on the bars
      seated.rotation.y = Math.PI; // the rider faces along the frame
      g.add(seated);
    } else {
      const rider = this.person(0, 0, 0.35, 0, r);
      rider.scale.setScalar(0.85);
      g.add(rider);
    }
    g.traverse((o) => (o.raycast = () => {}));
    return g;
  }

  /**
   * Parched gardens: a copy of the kit atlas whose vegetation cells (lawn,
   * foliage, green roof) are shifted toward dry ochre by the projected dryness.
   * Walls, roofs and paving keep their colours. Rebuilt in coarse steps.
   */
  private droughtKey = -1;
  private wetMap: Texture | null = null;
  private applyDrought(dryness: number): void {
    const mat = this.streetMat;
    if (!mat?.map) return;
    this.wetMap ??= mat.map;
    const step = Math.round(Math.max(0, dryness - 0.12) * 8) / 8; // 0 = no change
    if (step === this.droughtKey) return;
    this.droughtKey = step;
    if (step === 0) {
      mat.map = this.wetMap;
      mat.needsUpdate = true;
      return;
    }
    const img = this.wetMap.image as CanvasImageSource & { width: number; height: number };
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const cell = img.width / 4;
    // Atlas row 2 from the bottom (Blender origin) = third row from the top here:
    // lawn (col 0), foliage (col 1), green roof (col 2).
    const y0 = cell;
    const data = ctx.getImageData(0, y0, cell * 3, cell);
    const k = Math.min(1, step * 1.4);
    const px = data.data;
    for (let i = 0; i < px.length; i += 4) {
      const col = Math.floor((i / 4) % (cell * 3) / cell);
      if (col === 1) {
        // Foliage is grey and tinted by vertex colour: tint it toward straw.
        px[i] *= 1 - 0.02 * k;
        px[i + 1] *= 1 - 0.32 * k;
        px[i + 2] *= 1 - 0.6 * k;
      } else {
        const l = (px[i] + px[i + 1] + px[i + 2]) / 3 / 255;
        px[i] += (Math.min(255, 175 + 70 * l) - px[i]) * k;
        px[i + 1] += (Math.min(255, 135 + 60 * l) - px[i + 1]) * k;
        px[i + 2] += (Math.min(255, 80 + 40 * l) - px[i + 2]) * k;
      }
    }
    ctx.putImageData(data, 0, y0);
    const tex = new CanvasTexture(canvas);
    tex.flipY = this.wetMap.flipY;
    tex.colorSpace = this.wetMap.colorSpace;
    tex.anisotropy = this.wetMap.anisotropy;
    if (mat.map !== this.wetMap) mat.map.dispose();
    mat.map = tex;
    mat.needsUpdate = true;
  }

  /**
   * Free what the previous street build created (ground, trees, merged model
   * geometry, per-build materials). Kit geometry/materials and the shared
   * time-travel materials are kept: they are shared with the tabletop.
   */
  private treeMats = new Map<string, MeshStandardMaterial>();
  /** Vertex-coloured tree material per leaf tint (the geometry carries bark and shading). */
  private treeMat(c: Color): MeshStandardMaterial {
    const key = c.getHexString();
    let m = this.treeMats.get(key);
    if (!m) this.treeMats.set(key, (m = new MeshStandardMaterial({ color: c.clone().lerp(new Color('#ffffff'), 0.0), vertexColors: true, roughness: 0.9 })));
    return m;
  }

  private disposeHood(): void {
    const keep = new Set<object>([SOLAR_GLASS, LEAF_CROWN, ...this.treeMats.values()]);
    if (this.streetMat) keep.add(this.streetMat);
    for (const c of [...this.hood.children]) {
      c.traverse((o) => {
        const mesh = o as Mesh;
        if (!mesh.isMesh) return;
        if (!isKitResource(mesh.geometry) && !SHARED_GEO.has(mesh.geometry) && !isPeopleResource(mesh.geometry)) mesh.geometry.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) if (m && !keep.has(m) && !isKitResource(m) && !isPeopleResource(m) && !SHARED_PAINT.has(m)) m.dispose();
      });
      this.hood.remove(c);
    }
  }

  /** Smog and sky follow the projected haze; birds follow greening. */
  private applyAtmosphere(): void {
    const st = this.state;
    if (!st) return;
    const fog = this.world.scene.fog as FogExp2 | null;
    if (fog && this.root.visible) {
      // Exponential haze: clear air keeps the hills; smog veils the next block.
      fog.color.copy(CLEAR_AIR).lerp(SMOG_AIR, Math.min(1, st.haze * 1.3));
      fog.density = 0.006 + 0.04 * st.haze;
    }
    (this.sky.material as MeshBasicMaterial).color.copy(WHITE).lerp(SMOG_SKY, st.haze * 0.85);
    // Clear air: the real HDR sky. Smog: the tinted dome (a hazy, brownish sky).
    if (this.root.visible) {
      const clear = st.haze < 0.15 && !!this.skyTex;
      this.world.scene.background = clear ? this.skyTex : null;
      if (clear) this.world.scene.backgroundIntensity = 0.9;
      this.sky.visible = !clear;
    }
    this.birds.count = Math.round(BIRDS * Math.min(1, st.greening * 1.6));
    if (this.root.visible) streetAmbience.set({ birds: this.birds.count, haze: st.haze });
    this.paintPanel?.();
  }

  private ground(type: TerrainType, x: number, z: number, top: number, col: number, row: number, st: FutureVisualState, covered: boolean): Object3D {
    const g = new Group();
    const depth = 0.03;
    const color = new Color(TERRAIN_COLORS[type]);
    const land = type !== TerrainType.Sea && type !== TerrainType.River && type !== TerrainType.Town && type !== TerrainType.Beach;
    if (land) color.lerp(DRY_TINT, st.dryness * 0.8).lerp(LUSH_TINT, st.greening * 0.25);
    const block = new Mesh(new BoxGeometry(TILE_SIZE, depth, TILE_SIZE), new MeshStandardMaterial({ color, roughness: 0.95 }));
    block.position.set(x, top - depth / 2, z);
    g.add(block);
    if (covered) return g; // a structure or sprawl stands here
    const r = rng(col * 97 + row * 13 + 5);
    // Stable per-item loss share, as on the tabletop (`treeLoss`).
    const lost = (k: number) => (hashInts(col, row, 300 + k) % 1000) / 1000 < st.treeLoss;
    if (type === TerrainType.Sea || type === TerrainType.River) {
      (block.material as MeshStandardMaterial).color.set('#2f8fb3').lerp(MURKY, st.haze * 0.8);
      (block.material as MeshStandardMaterial).roughness = 0.15;
    } else if (type === TerrainType.Beach && st.seaRise > 0.02) {
      // Sea-level rise: the beach goes under water, as on the tabletop.
      const sea = new Mesh(
        new BoxGeometry(TILE_SIZE, 0.0004, TILE_SIZE * st.seaRise),
        new MeshStandardMaterial({ color: '#3aa9c4', roughness: 0.1, transparent: true, opacity: 0.88 }),
      );
      sea.position.set(x, top + 0.0002, z);
      g.add(sea);
    } else if (type === TerrainType.Farmland) {
      for (let k = -2; k <= 2; k++) {
        const crop = r() < 0.5 ? '#c8a548' : '#6f9a3c';
        const strip = new Mesh(
          new BoxGeometry(TILE_SIZE * 0.92, 0.0012, 0.0075),
          new MeshStandardMaterial({ color: lost(k) ? '#8a6a45' : crop, roughness: 1 }), // lost crops: bare soil
        );
        strip.position.set(x, top + 0.0006, z + k * 0.0105);
        g.add(strip);
      }
    } else if (type === TerrainType.Protected || type === TerrainType.Hill || type === TerrainType.Plain) {
      const n = type === TerrainType.Protected ? 9 : type === TerrainType.Hill ? 3 : 0;
      // Recovery: young woodland on free plains and hills.
      const young = type === TerrainType.Protected ? 0 : Math.round(st.greening * 6);
      for (let k = 0; k < n + young; k++) {
        const tx = x + (r() - 0.5) * TILE_SIZE * 0.85;
        const tz = z + (r() - 0.5) * TILE_SIZE * 0.85;
        const s = (0.8 + r() * 0.6) * (k >= n ? 0.6 : 1);
        const cone = r() < 0.5;
        if (k < n && lost(k)) {
          // Burn scar and a charred snag where the tree was lost.
          const scar = new Mesh(new CylinderGeometry(0.0045 * s, 0.005 * s, 0.0004, 9), new MeshStandardMaterial({ color: '#2f2a25', roughness: 1 }));
          scar.position.set(tx, top + 0.0002, tz);
          const snag = new Mesh(new CylinderGeometry(0.0003, 0.0005, 0.007 * s, 5), new MeshStandardMaterial({ color: '#2f2a25' }));
          snag.position.set(tx, top + 0.0035 * s, tz);
          g.add(scar, snag);
          continue;
        }
        // The same soft trees as on the tabletop (shared geometry), tinted by dryness.
        const kind = cone ? 'pine' : k % 3 === 0 ? 'cypress' : 'round';
        const leaf = new Color(cone ? '#3f6a37' : '#5b8a42').lerp(DRY_TINT, st.dryness * 0.5);
        const tree = new Mesh(decorPrototype(kind), this.treeMat(leaf));
        tree.position.set(tx, top, tz);
        tree.scale.setScalar(s * 0.9);
        tree.rotation.y = r() * Math.PI * 2;
        g.add(tree);
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
        const n = plan.find((q) => q.col === p.col + dc && q.row === p.row + dr);
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
    this.sky = sky;
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
