/**
 * Builds the diorama and routes every input path into GameState.place():
 *  - XR hand: near pinch (OneHandGrabbable, useHandPinchForGrab) or ray pinch
 *    (DistanceGrabbable) → move → release snaps to the nearest tile.
 *  - XR controller: squeeze near the structure, same release path.
 *  - Ray tap (hand/controller) or mouse click: tap a structure's tile to select
 *    it, then tap another tile to move it there.
 *  - Keyboard (desktop dev + automated tests): arrows move, Esc deselects.
 */
import {
  createSystem,
  Entity,
  Grabbed,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  OneHandGrabbable,
  PlaneGeometry,
  RayInteractable,
  Vector3,
} from '@iwsdk/core';
import { BOARD_CENTER, StructureType } from '../config/scenario.js';
import { game, selectedId, statusText } from '../core/session.js';
import { localToTile, tileCenter } from '../world/board-coords.js';
import { buildBoard, tileTopY } from '../world/board-mesh.js';
import { createResidentialModel } from '../world/residential-model.js';
import { tileAt } from '../world/terrain-map.js';
import { Placeable, TerrainBoard } from './placeable-component.js';

const VALID_COLOR = '#3fd17a';
const INVALID_COLOR = '#ff5a4f';
const SELECT_LIFT = 0.012;

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

export class PlacementSystem extends createSystem({
  placeables: { required: [Placeable] },
  held: { required: [Placeable, Grabbed] },
}) {
  private board!: Object3D;
  private highlight!: Mesh;
  private highlightMat!: MeshBasicMaterial;
  private entitiesById = new Map<string, Entity>();
  private local = new Vector3();

  init(): void {
    this.board = buildBoard(game.terrain);
    this.board.position.set(...BOARD_CENTER);
    const boardEntity = this.world.createTransformEntity(this.board);
    boardEntity.addComponent(TerrainBoard);
    boardEntity.addComponent(RayInteractable);
    // No PokeInteractable here: a finger near the board surface would win the
    // hand's pointer arbitration and starve the active pinch-grab of moves.

    this.highlightMat = new MeshBasicMaterial({
      color: VALID_COLOR,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    this.highlight = new Mesh(new PlaneGeometry(1, 1), this.highlightMat);
    this.highlight.rotation.x = -Math.PI / 2;
    this.highlight.name = 'placement-highlight';
    this.highlight.visible = false;
    this.highlight.raycast = () => {};
    this.board.add(this.highlight);

    this.spawnResidential('residential-1', 11, 3);

    const onBoardClick = (e: { point: Vector3 }) => this.onBoardTap(e.point);
    const onBoardMove = (e: { point: Vector3 }) => this.onBoardHover(e.point);
    this.board.addEventListener('click' as never, onBoardClick as never);
    this.board.addEventListener('pointermove' as never, onBoardMove as never);

    this.cleanupFuncs.push(
      () => this.board.removeEventListener('click' as never, onBoardClick as never),
      () => this.board.removeEventListener('pointermove' as never, onBoardMove as never),
      this.queries.held.subscribe('qualify', (e) => this.onGrab(e)),
      this.queries.held.subscribe('disqualify', (e) => this.onRelease(e)),
      game.on((ev) => {
        if (ev.kind === 'placed') {
          this.snapToPlacement(ev.placement.id);
          const tile = tileAt(game.terrain, ev.placement.col, ev.placement.row)!;
          statusText.value = ev.verdict.warning
            ? `Homes placed on ${tile.type} - ${ev.verdict.warning}.`
            : `Homes placed on ${tile.type}.`;
        } else {
          this.snapToPlacement(ev.id);
          statusText.value = `Can't build there: ${ev.reason}.`;
        }
      }),
      selectedId.subscribe((id) => {
        for (const [sid] of this.entitiesById) this.snapToPlacement(sid);
        if (id) statusText.value = 'Selected. Tap a tile, or use the arrow keys.';
      }),
    );

    // Debug/test hook (read-only access to the deterministic state).
    const probe = new Vector3();
    (window as unknown as Record<string, unknown>).__terracity = {
      game,
      selectedId,
      statusText,
      /** Canvas-relative pixel position of a tile centre (for browser e2e tests). */
      tileToScreen: (col: number, row: number) => {
        const t = tileAt(game.terrain, col, row)!;
        const { x, z } = tileCenter(col, row);
        probe.set(x, tileTopY(t), z);
        this.board.localToWorld(probe).project(this.world.camera);
        const r = this.world.renderer.domElement.getBoundingClientRect();
        return { x: r.left + ((probe.x + 1) / 2) * r.width, y: r.top + ((1 - probe.y) / 2) * r.height };
      },
    };
  }

  update(): void {
    // Live hover feedback while a structure is held by a hand/controller/pointer.
    for (const entity of this.queries.held.entities) {
      const id = entity.getValue(Placeable, 'structureId')!;
      this.showHighlight(this.tileUnder(entity.object3D!), id);
    }

    const kb = this.input.keyboard;
    const sel = selectedId.peek();
    if (!sel) return;
    for (const key in ARROWS) {
      if (kb.getKeyDown(key)) {
        const p = game.get(sel)!;
        const [dc, dr] = ARROWS[key];
        game.place(sel, p.type, p.col + dc, p.row + dr);
      }
    }
    if (kb.getKeyDown('Escape')) selectedId.value = null;
  }

  private spawnResidential(id: string, col: number, row: number): void {
    const model = createResidentialModel(id);
    // World-level entity (not parented to the board): the board's own pointer
    // listeners stop propagation, so a child would never see grab moves.
    const entity = this.world.createTransformEntity(model);
    entity.addComponent(Placeable, { structureId: id });
    // Near grab: hand pinch (useHandPinchForGrab) or controller squeeze.
    // OneHandGrabbable denies ray pointers, so ray/mouse/poke taps fall
    // through to the board underneath and use the tap-to-select path.
    entity.addComponent(OneHandGrabbable, { rotate: false });
    this.entitiesById.set(id, entity);
    game.place(id, StructureType.Residential, col, row);
  }

  private snapToPlacement(id: string): void {
    const entity = this.entitiesById.get(id);
    const p = game.get(id);
    if (!entity || !p) return;
    const tile = tileAt(game.terrain, p.col, p.row)!;
    const { x, z } = tileCenter(p.col, p.row);
    const lift = selectedId.peek() === id ? SELECT_LIFT : 0;
    entity.object3D!.position.set(x + BOARD_CENTER[0], tileTopY(tile) + lift + BOARD_CENTER[1], z + BOARD_CENTER[2]);
    this.highlight.visible = false;
  }

  private showHighlight(tile: { col: number; row: number } | null, id: string): void {
    if (!tile) {
      this.highlight.visible = false;
      return;
    }
    const p = game.get(id)!;
    const verdict = game.check(p.type, tile.col, tile.row, id);
    const t = tileAt(game.terrain, tile.col, tile.row)!;
    const { x, z } = tileCenter(tile.col, tile.row);
    this.highlight.position.set(x, tileTopY(t) + 0.002, z);
    this.highlight.scale.setScalar(0.06);
    this.highlightMat.color.set(verdict.ok ? VALID_COLOR : INVALID_COLOR);
    this.highlight.visible = true;
    statusText.value = verdict.ok
      ? verdict.warning
        ? `Release to build - ${verdict.warning}.`
        : 'Release to build here.'
      : `Blocked: ${verdict.reason}.`;
  }

  private onGrab(entity: Entity): void {
    selectedId.value = null;
    statusText.value = `Moving ${entity.getValue(Placeable, 'structureId')}...`;
  }

  private onRelease(entity: Entity): void {
    const id = entity.getValue(Placeable, 'structureId')!;
    const p = game.get(id)!;
    const tile = this.tileUnder(entity.object3D!);
    if (tile) game.place(id, p.type, tile.col, tile.row);
    else {
      this.snapToPlacement(id);
      statusText.value = "Can't build there: Outside the region.";
    }
  }

  private tileUnder(obj: Object3D): { col: number; row: number } | null {
    obj.getWorldPosition(this.local);
    this.board.worldToLocal(this.local);
    return localToTile(this.local.x, this.local.z);
  }

  /** Tap (ray, poke, mouse): tap a structure's tile to select, another tile to move. */
  private onBoardTap(worldPoint: Vector3): void {
    this.local.copy(worldPoint);
    this.board.worldToLocal(this.local);
    const tile = localToTile(this.local.x, this.local.z);
    if (!tile) return;
    const here = game.all().find((p) => p.col === tile.col && p.row === tile.row);
    const sel = selectedId.peek();
    if (here) {
      selectedId.value = sel === here.id ? null : here.id;
      return;
    }
    if (!sel) return;
    const p = game.get(sel)!;
    game.place(sel, p.type, tile.col, tile.row);
    selectedId.value = null;
  }

  private onBoardHover(worldPoint: Vector3): void {
    const sel = selectedId.peek();
    if (!sel || this.queries.held.entities.size > 0) return;
    this.local.copy(worldPoint);
    this.board.worldToLocal(this.local);
    this.showHighlight(localToTile(this.local.x, this.local.z), sel);
  }
}
