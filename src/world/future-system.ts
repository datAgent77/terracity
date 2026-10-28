/**
 * Visual consequences of time travel. When the player switches to 2035/2050
 * the diorama animates toward the projection:
 *  - grey unplanned-sprawl clusters rise on the tiles the projection picks,
 *  - the sea creeps over the beach and coastal sites get a sea wall,
 *  - park trees grow, and the land dries as environmental health falls.
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


} from '@iwsdk/core';
import { BALANCE } from '../config/balance.js';
import { PROJECTION } from '../config/projection.js';
import { BOARD_CENTER, TILE_SIZE, TerrainType } from '../config/scenario.js';
import { compareOpen, game, phase, planA, planVersion, viewYear } from '../core/session.js';
import { Placeable, TrayToken } from '../interactions/placeable-component.js';
import { projectYear, type YearMetrics } from '../simulation/projection.js';
import { tileCenter } from './board-coords.js';
import { createHouseCluster, tileTopY, WATER_LEVEL } from './board-mesh.js';
import { createMiniBoard } from './mini-board.js';

const SPRAWL_POOL = 10;
const WALL_POOL = 10;
const DRY = new Color('#d2b77a');
const WHITE = new Color('#ffffff');
const MINI_SCALE = 0.42;

export class FutureSystem extends createSystem({
  placeables: { required: [Placeable] },
  tokens: { required: [TrayToken] },
}) {
  private board!: Object3D;
  private tilesMat!: MeshStandardMaterial;
  private sprawl: Group[] = [];
  private walls: Mesh[] = [];
  private flood!: InstancedMesh;
  private minis = new Group();
  private target!: YearMetrics;
  private target2026!: YearMetrics;
  /** Animated 0..1 progress toward the viewed year (0 = 2026). */
  private shown = 0;
  private goal = 0;
  private envShown: number = BALANCE.baseEnvironment;
  private tmp = new Color();

  init(): void {
    this.board = this.world.scene.getObjectByName('terrain-board')!;
    const tiles = this.board.getObjectByName('terrain-tiles') as Mesh;
    this.tilesMat = tiles.material as MeshStandardMaterial;

    const wallMat = new MeshStandardMaterial({ color: '#f3efe6', roughness: 0.85 });
    const roofMat = new MeshStandardMaterial({ color: '#8d8a86', flatShading: true });
    for (let i = 0; i < SPRAWL_POOL; i++) {
      const g = createHouseCluster(wallMat, roofMat, i % 2);
      g.name = `sprawl-${i}`;
      g.visible = false;
      this.board.add(g);
      this.sprawl.push(g);
    }

    const seaWallMat = new MeshStandardMaterial({ color: '#9aa3ab', roughness: 0.9 });
    for (let i = 0; i < WALL_POOL; i++) {
      const w = new Mesh(new BoxGeometry(TILE_SIZE * 0.95, 0.012, 0.006), seaWallMat);
      w.visible = false;
      w.name = `sea-wall-${i}`;
      this.board.add(w);
      this.walls.push(w);
    }

    const beaches = game.terrain.filter((t) => t.type === TerrainType.Beach);
    this.flood = new InstancedMesh(
      new BoxGeometry(TILE_SIZE, 1, TILE_SIZE).translate(0, 0.5, 0),
      new MeshStandardMaterial({ color: '#46d2d8', transparent: true, opacity: 0.7, roughness: 0.15 }),
      beaches.length,
    );
    this.flood.name = 'sea-level-rise';
    const m = new Matrix4();
    beaches.forEach((t, i) => {
      const { x, z } = tileCenter(t.col, t.row);
      m.makeTranslation(x, 0, z);
      this.flood.setMatrixAt(i, m);
    });
    this.flood.visible = false;
    this.board.add(this.flood);

    this.minis.name = 'plan-comparison-minis';
    this.world.scene.add(this.minis);

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

  private recompute(): void {
    const plan = game.placements;
    const year = viewYear.peek();
    this.target = projectYear(game.terrain, plan, year, game.metrics);
    this.target2026 = projectYear(game.terrain, plan, 2026, game.metrics);
    this.goal = PROJECTION.progress[year];

    // Sprawl clusters on the projected tiles (animated in update()).
    this.sprawl.forEach((g, i) => {
      const t = this.target.sprawlTiles[i];
      if (!t) {
        g.visible = false;
        return;
      }
      const tile = game.terrain[t.row * 14 + t.col];
      const { x, z } = tileCenter(t.col, t.row);
      g.position.set(x, tileTopY(tile), z);
      g.userData.order = i / Math.max(1, this.target.sprawlTiles.length);
    });

    // Sea walls along the seaward edge of each at-risk site.
    const risk = this.target2026.floodRiskIds.length ? projectYear(game.terrain, plan, 2050).floodRiskIds : [];
    this.walls.forEach((w, i) => {
      const p = game.get(risk[i] ?? '');
      w.userData.active = !!p;
      if (!p) return;
      const { x, z } = tileCenter(p.col, p.row);
      w.position.set(x, 0.02, z - TILE_SIZE * 0.47);
    });

    // Tray tokens only while editing 2026.
    const editable = year === 2026 && phase.peek() === 'building';
    for (const e of this.queries.tokens.entities) e.object3D!.visible = editable;
  }

  update(delta: number): void {
    if (!this.target) return;
    // Ease the time-travel animation toward the viewed year (~0.8 s).
    const step = Math.min(1, delta * 2.5);
    this.shown += (this.goal - this.shown) * step;
    if (Math.abs(this.goal - this.shown) < 0.002) this.shown = this.goal;
    const k = this.goal === 0 ? 0 : this.shown / this.goal; // 0..1 within this transition

    for (const g of this.sprawl) {
      const visibleNow = this.goal > 0 && g.userData.order !== undefined && this.target.sprawlTiles.length > 0;
      const idx = this.sprawl.indexOf(g);
      const exists = visibleNow && idx < this.target.sprawlTiles.length;
      const grow = exists ? Math.max(0, Math.min(1, k * 1.5 - (g.userData.order as number) * 0.5)) : 0;
      g.visible = grow > 0.01;
      g.scale.set(1, Math.max(0.01, grow), 1);
    }

    const sea = this.shown; // 0 in 2026, 0.5 in 2035, 1 in 2050
    this.flood.visible = sea > 0.01;
    this.flood.scale.y = WATER_LEVEL * 0.6 + 0.018 * sea;
    for (const w of this.walls) w.visible = !!w.userData.active && sea > 0.6;

    const env = this.target2026.environment + (this.target.environment - this.target2026.environment) * k;
    this.envShown += (env - this.envShown) * step;
    const dryness = Math.max(0, Math.min(1, (BALANCE.baseEnvironment - this.envShown) / 45));
    this.tilesMat.color.copy(WHITE).lerp(DRY, dryness);

    const crownScale = 1 + 0.6 * this.shown;
    for (const e of this.queries.placeables.entities) {
      if (e.getValue(Placeable, 'structureType') !== 'park') continue;
      e.object3D!.traverse((o) => {
        if (o.name === 'crown') o.scale.setScalar((o.userData.baseScale as number) * crownScale);
      });
    }
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
      mini.position.set(BOARD_CENTER[0] + x, BOARD_CENTER[1] + 0.13, BOARD_CENTER[2] - 0.42);
      mini.rotation.x = 0.55; // tilt toward the seated player
      mini.add(labelPlate(label));
      this.minis.add(mini);
    };
    place(a, -0.27, 'Plan A - 2050');
    place(b, 0.27, 'Plan B - 2050');
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
