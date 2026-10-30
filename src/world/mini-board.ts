/**
 * Miniature 2050 diorama of a plan for the Plan A / Plan B comparison.
 *
 * It is the real world in small: the same terrain, town, decoration and
 * structure models, plus the same time-travel mapping (`futureVisualState`)
 * as the main board — sprawl, drying, shoreline creep and at-risk sites — so
 * the two futures differ exactly as the simulation says. Everything static is
 * baked into painted meshes (a handful of draw calls per diorama).
 */
import {
  CanvasTexture,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  type Object3D,
} from '@iwsdk/core';
import { GRID_COLS, StructureType, TILE_BASE_HEIGHT, TILE_SIZE, TerrainType } from '../config/scenario.js';
import type { Placement } from '../simulation/metrics.js';
import { tileCenter, tileTopY } from './board-coords.js';
import { buildBase, buildTerrainTiles, buildTown, buildWater } from './board-mesh.js';
import type { FutureVisualState } from './future-visual-state.js';
import { createSprawl } from './houses.js';
import { setEra } from './villas.js';
import { mergeStatic } from './merge.js';
import { block, paint, PAINTED, PAINTED_FLAT } from './palette.js';
import { hashInts, idNumber } from './rand.js';
import { districtOrientation } from './district-links.js';
import { createStructureModel, setDistrictLinks, setRoadArms, structureLook } from './structure-models.js';
import { decorHash, decorPlan, LOSABLE, regrowPlan, TerrainDecor } from './terrain-decor.js';
import { tileAt, type TerrainMap } from './terrain-map.js';

const DRY_LAND = new Color('#d6b979');
const DRY_LEAF = new Color('#c9a95c');
const WET_BEACH = new Color('#7fd3cc');

/** Convert any coloured standard material to the painted vertex-colour one, so it merges. */
function bakeMaterials(root: Object3D): void {
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh || (o as { isInstancedMesh?: boolean }).isInstancedMesh) return;
    const mat = mesh.material as MeshStandardMaterial;
    if (mat === PAINTED || mat === PAINTED_FLAT || !mat?.color || mat.map) return; // textured assets keep their material
    mesh.geometry = paint(mesh.geometry.clone(), `#${mat.color.getHexString()}`);
    mesh.material = mat.flatShading ? PAINTED_FLAT : PAINTED;
  });
}

function connects(terrain: TerrainMap, plan: readonly Placement[], col: number, row: number): boolean {
  if (plan.some((p) => p.type === StructureType.Road && p.col === col && p.row === row)) return true;
  return tileAt(terrain, col, row)?.type === TerrainType.Town;
}

export function createMiniBoard(terrain: TerrainMap, plan: readonly Placement[], state: FutureVisualState): Group {
  const g = new Group();
  const dry = state.dryness;

  g.add(buildBase());
  g.add(
    ...buildTerrainTiles(terrain, (tile, c) => {
      if (tile.type === TerrainType.Beach) c.lerp(WET_BEACH, state.seaRise * 0.85);
      else if (tile.type !== TerrainType.Sea && tile.type !== TerrainType.River && tile.type !== TerrainType.Town) c.lerp(DRY_LAND, dry);
    }),
  );
  g.add(buildWater(terrain));

  // Decoration, minus tiles that hold structures or sprawl, dried like the main board.
  const covered = new Set<number>([
    ...plan.map((p) => p.row * GRID_COLS + p.col),
    ...state.sprawl.map((s) => s.row * GRID_COLS + s.col),
  ]);
  const leaf = new Color();
  // Fine detail (tufts, flowers, shrubs, rocks, walls, foam) is invisible at
  // mini scale; keep the field, orchard and forest silhouettes only.
  const MINI_KINDS = new Set(['crop', 'olive', 'pine', 'round', 'cypress']);
  // Same stable loss / regrowth as the main board (time-travel mapping).
  const regrown = regrowPlan(terrain).filter((it) => decorHash(it) >= 1 - state.greening);
  const items = [...decorPlan(terrain), ...regrown]
    .filter((it) => !covered.has(it.tile) && MINI_KINDS.has(it.kind))
    .filter((it) => !(LOSABLE.has(it.kind) && decorHash(it) < state.treeLoss))
    .map((it) => ({ ...it, color: `#${leaf.set(it.color).lerp(DRY_LEAF, it.kind === 'foam' || it.kind === 'rock' ? 0 : dry).getHexString()}` }));
  g.add(new TerrainDecor(items, PAINTED_FLAT).group);

  // Static content baked into painted meshes.
  const statics = new Group();
  const town = buildTown(terrain);
  setEra(town, state.homeEra);
  for (const n of ['era-0', 'era-1', 'era-2']) {
    const g = town.getObjectByName(n);
    if (g && !g.visible) town.remove(g);
  }
  statics.add(town);
  for (const p of plan) {
    const { variant, seed } = structureLook(p.id, idNumber(p.id));
    const model = createStructureModel(p.type, p.id, variant, seed);
    // 2050 architecture only; drop the other eras before baking.
    setEra(model, state.homeEra);
    for (const n of ['era-0', 'era-1', 'era-2']) {
      const g = model.getObjectByName(n);
      if (g && !g.visible) g.parent?.remove(g);
    }
    if (p.type === StructureType.Road) {
      setRoadArms(model, [
        connects(terrain, plan, p.col + 1, p.row),
        connects(terrain, plan, p.col - 1, p.row),
        connects(terrain, plan, p.col, p.row + 1),
        connects(terrain, plan, p.col, p.row - 1),
      ]);
      for (const n of ['arm-e', 'arm-w', 'arm-s', 'arm-n']) {
        const arm = model.getObjectByName(n);
        if (arm && !arm.visible) arm.parent?.remove(arm);
      }
    }
    let quarter = p.type === StructureType.Road ? 0 : p.rotation;
    if (p.type === StructureType.Residential) {
      const o = districtOrientation(terrain, plan, p);
      quarter = o.quarter;
      setDistrictLinks(model, o.linkEast, o.linkWest);
      for (const n of ['link-e', 'link-w']) {
        const l = model.getObjectByName(n);
        if (l && !l.visible) l.parent?.remove(l);
      }
    }
    const tile = tileAt(terrain, p.col, p.row)!;
    const { x, z } = tileCenter(p.col, p.row);
    const y = tile.type === TerrainType.River ? TILE_BASE_HEIGHT : tileTopY(tile);
    model.position.set(x, y, z);
    model.rotation.y = quarter * (Math.PI / 2);
    statics.add(model);
  }
  for (const s of state.sprawl) {
    const sp = createSprawl(hashInts(s.col, s.row, 5), s.buildings);
    const { x, z } = tileCenter(s.col, s.row);
    sp.position.set(x, tileTopY(tileAt(terrain, s.col, s.row)!), z);
    statics.add(sp);
  }
  for (const f of state.floodRisk) {
    const { x, z } = tileCenter(f.col, f.row);
    const y = tileTopY(tileAt(terrain, f.col, f.row)!);
    for (const [dc, dr] of f.seaward) {
      statics.add(block(dc ? 0.0045 : TILE_SIZE * 0.96, 0.012, dr ? 0.0045 : TILE_SIZE * 0.96, '#8c8273', x + dc * TILE_SIZE * 0.48, y, z + dr * TILE_SIZE * 0.48));
    }
    const L = TILE_SIZE * 0.96;
    for (const [bx, bz, w, d] of [[0, -L / 2, L, 0.0035], [0, L / 2, L, 0.0035], [-L / 2, 0, 0.0035, L], [L / 2, 0, 0.0035, L]]) {
      statics.add(block(w, 0.0012, d, '#ff8a3d', x + bx, y + 0.0026, z + bz));
    }
  }
  bakeMaterials(statics);
  g.add(mergeStatic(statics));
  g.traverse((o) => {
    o.raycast = () => {};
  });
  return g;
}

export interface MiniLabel {
  title: string;
  verdict: string;
  winner: boolean;
  metrics: Array<{ label: string; value: string; ok: boolean; better: boolean }>;
}

/** Title + four colour-and-symbol coded metrics on a plate in front of a diorama. */
export function labelPlate(label: MiniLabel): Mesh {
  const W = 1024;
  const H = 300;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 44);
  ctx.fill();
  ctx.lineWidth = label.winner ? 12 : 4;
  ctx.strokeStyle = label.winner ? '#1f8a4c' : '#c7d6da';
  ctx.stroke();
  ctx.fillStyle = '#1d3f46';
  ctx.font = 'bold 74px system-ui, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(label.title, 44, 74);
  ctx.textAlign = 'right';
  ctx.font = 'bold 50px system-ui, sans-serif';
  ctx.fillStyle = label.winner ? '#1f8a4c' : '#b5651d';
  ctx.fillText(label.verdict, W - 44, 74);
  ctx.textAlign = 'left';
  label.metrics.forEach((m, i) => {
    const x = 44 + (i % 2) * 480;
    const y = 168 + Math.floor(i / 2) * 82;
    ctx.fillStyle = m.ok ? '#1f8a4c' : '#c0392b';
    ctx.font = 'bold 54px system-ui, sans-serif';
    ctx.fillText(m.ok ? '✓' : '✗', x, y);
    ctx.fillStyle = '#444';
    ctx.font = '44px system-ui, sans-serif';
    ctx.fillText(m.label, x + 56, y);
    ctx.fillStyle = m.ok ? '#1f8a4c' : '#b5651d';
    ctx.font = `${m.better ? 'bold ' : ''}46px system-ui, sans-serif`;
    ctx.fillText(m.value, x + 290, y);
  });
  const tex = new CanvasTexture(canvas);
  tex.anisotropy = 4;
  const plate = new Mesh(new PlaneGeometry(0.84, 0.246), new MeshBasicMaterial({ map: tex, transparent: true }));
  plate.name = 'mini-label';
  plate.raycast = () => {};
  return plate;
}
