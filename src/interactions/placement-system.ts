/**
 * Builds the diorama + supply tray and routes every input path into GameState:
 *
 *  Hands (primary, XR):  pinch a token in the tray -> carry -> release over a
 *    tile to build. Pinch a placed structure to move it; twist the wrist while
 *    holding to rotate (snaps to 90 degrees); release off the board to remove.
 *  Controller (XR): squeeze instead of pinch, same flow.
 *  Ray / mouse tap: tap a tray slot to arm a type, tap a tile to build. Tap a
 *    structure's tile to select it, tap an empty tile to move it there.
 *  Keyboard: 1-5 arm, arrows move, R rotate, Delete remove, Z undo, Y redo,
 *    Esc clear.
 *
 * The visuals never own state: `reconcile()` rebuilds entity transforms from
 * `game.placements` after every change, which keeps undo/redo exact.
 */
import {
  BoxGeometry,
  createSystem,
  Entity,
  Grabbed,
  GrabSystem,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OneHandGrabbable,
  PlaneGeometry,
  RayInteractable,
  Vector3,
} from '@iwsdk/core';
import {
  BOARD_CENTER,
  GRID_COLS,
  GRID_ROWS,
  StructureType,
  TILE_BASE_HEIGHT,
  TILE_SIZE,
  TerrainType,
} from '../config/scenario.js';
import { STRUCTURE_ORDER, STRUCTURES } from '../config/structures.js';
import * as cmd from '../core/commands.js';
import { armedType, game, planVersion, selectedId, statusText, viewYear } from '../core/session.js';
import { localToTile, tileCenter } from '../world/board-coords.js';
import { boardDecor, buildBoard, tileTopY } from '../world/board-mesh.js';
import { idNumber } from '../world/rand.js';
import { createStructureModel, setRoadArms, structureLook } from '../world/structure-models.js';
import { tileAt, type Tile } from '../world/terrain-map.js';
import { Placeable, SupplyTray, TerrainBoard, TrayToken } from './placeable-component.js';

const VALID_COLOR = '#3fd17a';
const INVALID_COLOR = '#ff5a4f';
const SELECT_LIFT = 0.012;
const HOMES_SERVED = '#d9c7a3';
const HOMES_UNSERVED = '#f08a7e';
const QUARTER = Math.PI / 2;

/** Supply tray along the near edge of the board (board-local z). */
const TRAY_Z = (GRID_ROWS * TILE_SIZE) / 2 + 0.06;
const SLOT_SPACING = 0.085;
const slotX = (slot: number) => (slot - 3) * SLOT_SPACING;

const ARROWS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};
const DIGITS = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5'];

/** Grab constraints: free translation, yaw-only rotation. */
const GRAB_OPTIONS = {
  rotate: true,
  rotateMin: [0, -Infinity, 0] as [number, number, number],
  rotateMax: [0, Infinity, 0] as [number, number, number],
};

export class PlacementSystem extends createSystem({
  placeables: { required: [Placeable] },
  held: { required: [Placeable, Grabbed] },
}) {
  private board!: Object3D;
  private highlight!: Mesh;
  private highlightMat!: MeshBasicMaterial;
  private blockedMark!: Mesh;
  private entitiesById = new Map<string, Entity>();
  private rotors: Object3D[] = [];
  /** Carried tray model waiting to be adopted by the next `add`. */
  private adopting: Entity | null = null;
  /** Grabs refused because the plan is read-only (future year / not playing). */
  private blocked = new Set<Entity>();
  private occupiedScratch = new Set<number>();
  private local = new Vector3();
  private world3 = new Vector3();

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
    this.highlight = new Mesh(new PlaneGeometry(TILE_SIZE, TILE_SIZE), this.highlightMat);
    this.highlight.rotation.x = -Math.PI / 2;
    this.highlight.name = 'placement-highlight';
    this.hideHighlight();
    this.highlight.raycast = () => {};
    this.board.add(this.highlight);
    // Colour-independent cue for blocked tiles: a dark X over the red square.
    this.blockedMark = new Mesh(
      new BoxGeometry(TILE_SIZE * 0.7, 0.002, TILE_SIZE * 0.12),
      new MeshBasicMaterial({ color: '#3a0d0a' }),
    );
    const bar2 = this.blockedMark.clone();
    bar2.rotation.y = Math.PI / 2;
    this.blockedMark.add(bar2);
    this.blockedMark.rotation.y = Math.PI / 4;
    this.blockedMark.name = 'blocked-mark';
    this.blockedMark.visible = false;
    this.blockedMark.raycast = () => {};
    bar2.raycast = () => {};
    this.board.add(this.blockedMark);

    this.buildTray();
    for (const type of STRUCTURE_ORDER) this.spawnToken(type);

    const onBoardClick = (e: { point: Vector3 }) => this.onBoardTap(e.point);
    const onBoardMove = (e: { point: Vector3 }) => this.onBoardHover(e.point);
    const onBoardLeave = () => {
      if (this.queries.held.entities.size === 0) this.hideHighlight();
    };
    this.board.addEventListener('click' as never, onBoardClick as never);
    this.board.addEventListener('pointermove' as never, onBoardMove as never);
    this.board.addEventListener('pointerleave' as never, onBoardLeave as never);

    this.cleanupFuncs.push(
      () => this.board.removeEventListener('click' as never, onBoardClick as never),
      () => this.board.removeEventListener('pointermove' as never, onBoardMove as never),
      () => this.board.removeEventListener('pointerleave' as never, onBoardLeave as never),
      this.queries.held.subscribe('qualify', (e) => this.onGrab(e)),
      this.queries.held.subscribe('disqualify', (e) => this.onRelease(e)),
      game.on((ev) => {
        if (ev.kind === 'changed') {
          statusText.value = ev.message;
          planVersion.value++;
        } else {
          statusText.value = `Can't ${ev.action}: ${ev.reason}.`;
        }
        this.reconcile();
      }),
      selectedId.subscribe((id) => {
        this.reconcile();
        if (id) {
          const p = game.get(id);
          if (p) statusText.value = `${STRUCTURES[p.type].label} selected. Tap a tile to move, R rotate, Delete remove.`;
        }
      }),
      armedType.subscribe((type) => {
        this.reconcileTokens();
        if (type) statusText.value = cmd.describeArmed(type);
      }),
    );

    this.exposeTestHooks();
  }

  update(delta: number): void {
    for (const rotor of this.rotors) rotor.rotation.z -= delta * 2.2;

    // Live hover feedback while a structure is carried by a hand/controller.
    for (const entity of this.queries.held.entities) {
      if (this.blocked.has(entity)) continue;
      this.showHighlight(this.tileUnder(entity.object3D!), this.typeOf(entity), this.idOf(entity));
    }

    const kb = this.input.keyboard;
    DIGITS.forEach((code, i) => {
      if (kb.getKeyDown(code)) cmd.arm(STRUCTURE_ORDER[i]);
    });
    if (kb.getKeyDown('KeyZ')) cmd.undo();
    if (kb.getKeyDown('KeyY')) cmd.redo();
    if (kb.getKeyDown('Escape')) {
      cmd.clearSelection();
      this.hideHighlight();
    }
    const sel = selectedId.peek();
    if (!sel || !game.get(sel)) return;
    for (const key in ARROWS) {
      if (kb.getKeyDown(key) && cmd.canEdit()) {
        const p = game.get(sel)!;
        const [dc, dr] = ARROWS[key];
        game.move(sel, p.col + dc, p.row + dr);
      }
    }
    if (kb.getKeyDown('KeyR')) cmd.rotateSelected();
    if (kb.getKeyDown('Delete') || kb.getKeyDown('Backspace')) cmd.removeSelected();
  }

  // ---------------------------------------------------------------- tray --

  private buildTray(): void {
    const width = SLOT_SPACING * STRUCTURE_ORDER.length + 0.02;
    const tray = new Mesh(
      new BoxGeometry(width, 0.012, 0.075),
      new MeshStandardMaterial({ color: '#6f5338', roughness: 0.8 }),
    );
    tray.name = 'supply-tray';
    tray.position.set(BOARD_CENTER[0], BOARD_CENTER[1] - 0.006, BOARD_CENTER[2] + TRAY_Z);
    const trayEntity = this.world.createTransformEntity(tray);
    trayEntity.addComponent(SupplyTray);
    trayEntity.addComponent(RayInteractable);
    const onTrayClick = (e: { point: Vector3 }) => {
      const slot = Math.round((e.point.x - BOARD_CENTER[0]) / SLOT_SPACING) + 3;
      const type = STRUCTURE_ORDER[slot - 1];
      if (type) cmd.arm(type, true);
    };
    tray.addEventListener('click' as never, onTrayClick as never);
    this.cleanupFuncs.push(() => tray.removeEventListener('click' as never, onTrayClick as never));
  }

  private trayPosition(type: StructureType, out: Vector3): Vector3 {
    const lift = armedType.peek() === type ? SELECT_LIFT : 0;
    return out.set(
      BOARD_CENTER[0] + slotX(STRUCTURES[type].slot),
      BOARD_CENTER[1] + lift,
      BOARD_CENTER[2] + TRAY_Z,
    );
  }

  private spawnToken(type: StructureType): Entity {
    const model = createStructureModel(type, `tray-${type}`);
    // World-level entity (not parented to the board): the board's own pointer
    // listeners stop propagation, so a child would never see grab moves.
    const entity = this.world.createTransformEntity(model);
    entity.addComponent(Placeable, { structureId: '', structureType: type });
    entity.addComponent(TrayToken);
    // Near grab: hand pinch (useHandPinchForGrab) or controller squeeze.
    // OneHandGrabbable denies ray pointers, so ray/mouse taps fall through to
    // the board/tray underneath and use the tap paths.
    entity.addComponent(OneHandGrabbable, GRAB_OPTIONS);
    this.trayPosition(type, model.position);
    if (type === StructureType.Road) setRoadArms(model, [true, true, false, false]);
    this.trackRotor(model);
    return entity;
  }

  private reconcileTokens(): void {
    for (const entity of this.queries.placeables.entities) {
      if (!entity.hasComponent(TrayToken) || entity.hasComponent(Grabbed)) continue;
      this.trayPosition(this.typeOf(entity), entity.object3D!.position);
    }
  }

  // ------------------------------------------------------------ reconcile --

  /** Make the placed-structure entities exactly mirror `game.placements`. */
  private reconcile(): void {
    const plan = game.placements;
    const served = game.metrics.servedIds;
    const live = new Set<string>();
    for (const p of plan) {
      live.add(p.id);
      let entity = this.entitiesById.get(p.id);
      if (!entity) {
        if (this.adopting && this.typeOf(this.adopting) === p.type) {
          entity = this.adopting;
          entity.setValue(Placeable, 'structureId', p.id);
          entity.object3D!.name = p.id;
          this.applyLook(entity.object3D!, p.type, p.id);
          this.adopting = null;
        } else {
          entity = this.spawnPlaced(p.type, p.id);
        }
        this.entitiesById.set(p.id, entity);
      }
      const obj = entity.object3D!;
      if (!entity.hasComponent(Grabbed)) {
        const tile = tileAt(game.terrain, p.col, p.row)!;
        const { x, z } = tileCenter(p.col, p.row);
        const lift = selectedId.peek() === p.id ? SELECT_LIFT : 0;
        obj.position.set(
          x + BOARD_CENTER[0],
          structureBaseY(tile) + lift + BOARD_CENTER[1],
          z + BOARD_CENTER[2],
        );
        obj.rotation.set(0, p.type === StructureType.Road ? 0 : p.rotation * QUARTER, 0);
      }
      if (p.type === StructureType.Road) {
        setRoadArms(obj, [
          this.connects(p.col + 1, p.row),
          this.connects(p.col - 1, p.row),
          this.connects(p.col, p.row + 1),
          this.connects(p.col, p.row - 1),
        ]);
      }
      if (p.type === StructureType.Residential) {
        const pad = obj.getObjectByName('pad') as Mesh | undefined;
        (pad?.material as MeshStandardMaterial | undefined)?.color.set(
          served.has(p.id) ? HOMES_SERVED : HOMES_UNSERVED,
        );
      }
    }
    for (const [id, entity] of this.entitiesById) {
      if (live.has(id)) continue;
      this.untrackRotor(entity.object3D!);
      entity.dispose({ disposeResources: false });
      this.entitiesById.delete(id);
      if (selectedId.peek() === id) selectedId.value = null;
    }
    // Decoration (crops, tufts, shrubs) steps aside wherever something is built.
    const occupied = this.occupiedScratch;
    occupied.clear();
    for (const p of plan) occupied.add(p.row * GRID_COLS + p.col);
    boardDecor(this.board)?.setHidden(occupied);
    if (this.queries.held.entities.size === 0) this.hideHighlight();
  }

  /** Give a carried tray piece the deterministic look of its new placement id. */
  private applyLook(obj: Object3D, type: StructureType, id: string): void {
    const { variant, seed } = structureLook(id, idNumber(id));
    this.untrackRotor(obj);
    const fresh = createStructureModel(type, id, variant, seed);
    for (const c of [...obj.children]) obj.remove(c);
    for (const c of [...fresh.children]) obj.add(c);
    this.trackRotor(obj);
  }

  private connects(col: number, row: number): boolean {
    const other = game.at(col, row);
    if (other?.type === StructureType.Road) return true;
    return tileAt(game.terrain, col, row)?.type === TerrainType.Town;
  }

  private spawnPlaced(type: StructureType, id: string): Entity {
    const { variant, seed } = structureLook(id, idNumber(id));
    const model = createStructureModel(type, id, variant, seed);
    const entity = this.world.createTransformEntity(model);
    entity.addComponent(Placeable, { structureId: id, structureType: type });
    entity.addComponent(OneHandGrabbable, GRAB_OPTIONS);
    this.trackRotor(model);
    return entity;
  }

  private trackRotor(model: Object3D): void {
    const rotor = model.getObjectByName('rotor');
    if (rotor) this.rotors.push(rotor);
  }

  private untrackRotor(model: Object3D): void {
    const rotor = model.getObjectByName('rotor');
    if (rotor) this.rotors.splice(this.rotors.indexOf(rotor), 1);
  }

  // --------------------------------------------------------------- grab --

  private onGrab(entity: Entity): void {
    if (!cmd.canEdit()) {
      // Read-only view: refuse the grab and put the piece back on release.
      this.blocked.add(entity);
      this.world.getSystem(GrabSystem)?.forceRelease(entity);
      return;
    }
    selectedId.value = null;
    armedType.value = null;
    const type = this.typeOf(entity);
    if (entity.hasComponent(TrayToken)) {
      entity.removeComponent(TrayToken);
      this.spawnToken(type); // refill the tray slot
      statusText.value = `Carrying ${STRUCTURES[type].noun} (cost ${STRUCTURES[type].cost}). Release over a green tile.`;
    } else {
      statusText.value = `Moving ${STRUCTURES[type].noun}. Release off the board to remove.`;
    }
  }

  private onRelease(entity: Entity): void {
    if (this.blocked.delete(entity)) {
      this.reconcile();
      this.reconcileTokens();
      return;
    }
    const id = this.idOf(entity);
    const type = this.typeOf(entity);
    const obj = entity.object3D!;
    const tile = this.tileUnder(obj);
    const rotation = yawToQuarter(obj.rotation.y);
    this.hideHighlight();

    if (!id) {
      // Carried from the tray: build, or cancel when dropped off-board/invalid.
      if (tile) {
        this.adopting = entity;
        const verdict = game.add(type, tile.col, tile.row, rotation);
        if (verdict.ok) return;
        this.adopting = null;
        entity.dispose({ disposeResources: false });
        this.untrackRotor(obj);
        statusText.value = `Placement cancelled: ${verdict.reason}.`;
      } else {
        this.untrackRotor(obj);
        entity.dispose({ disposeResources: false });
        statusText.value = 'Placement cancelled.';
      }
      return;
    }
    if (tile) game.move(id, tile.col, tile.row, rotation);
    else game.remove(id);
  }

  private tileUnder(obj: Object3D): { col: number; row: number } | null {
    obj.getWorldPosition(this.world3);
    this.local.copy(this.world3);
    this.board.worldToLocal(this.local);
    return localToTile(this.local.x, this.local.z);
  }

  // ---------------------------------------------------------- highlight --

  private hideHighlight(): void {
    this.highlight.visible = false;
    if (this.blockedMark) this.blockedMark.visible = false;
  }

  private showHighlight(tile: { col: number; row: number } | null, type: StructureType, movingId?: string): void {
    if (!tile) {
      this.hideHighlight();
      statusText.value = movingId ? 'Release here to remove.' : 'Release here to cancel.';
      return;
    }
    const verdict = game.check(type, tile.col, tile.row, movingId || undefined);
    const t = tileAt(game.terrain, tile.col, tile.row)!;
    const { x, z } = tileCenter(tile.col, tile.row);
    this.highlight.position.set(x, structureBaseY(t) + 0.003, z);
    this.highlightMat.color.set(verdict.ok ? VALID_COLOR : INVALID_COLOR);
    this.highlight.visible = true;
    this.blockedMark.position.set(x, structureBaseY(t) + 0.004, z);
    this.blockedMark.visible = !verdict.ok;
    const noun = STRUCTURES[type].label;
    statusText.value = verdict.ok
      ? `${noun} here: cost ${verdict.cost}${verdict.warning ? ` - ${verdict.warning}` : ''}.`
      : `Blocked: ${verdict.reason}.`;
  }

  // ---------------------------------------------------------------- tap --

  /** Tap (ray, mouse): select a structure, build the armed type, or move the selection. */
  private onBoardTap(worldPoint: Vector3): void {
    const tile = this.pointToTile(worldPoint);
    if (!tile || !cmd.canEdit()) return;
    const here = game.at(tile.col, tile.row);
    const armed = armedType.peek();
    const sel = selectedId.peek();
    if (armed) {
      game.add(armed, tile.col, tile.row);
      return; // stay armed so several pieces can be laid quickly (e.g. roads)
    }
    if (here) {
      selectedId.value = sel === here.id ? null : here.id;
      return;
    }
    if (!sel) {
      statusText.value = 'Pick a structure from the tray first (or press 1-5).';
      return;
    }
    game.move(sel, tile.col, tile.row);
    selectedId.value = null;
  }

  private onBoardHover(worldPoint: Vector3): void {
    if (this.queries.held.entities.size > 0 || viewYear.peek() !== 2026) return;
    const armed = armedType.peek();
    const sel = selectedId.peek();
    const type = armed ?? (sel ? game.get(sel)?.type : undefined);
    if (!type) return;
    this.showHighlight(this.pointToTile(worldPoint), type, armed ? undefined : sel ?? undefined);
  }

  private pointToTile(worldPoint: Vector3): { col: number; row: number } | null {
    this.local.copy(worldPoint);
    this.board.worldToLocal(this.local);
    return localToTile(this.local.x, this.local.z);
  }

  private typeOf(entity: Entity): StructureType {
    return entity.getValue(Placeable, 'structureType') as StructureType;
  }

  private idOf(entity: Entity): string {
    return entity.getValue(Placeable, 'structureId') ?? '';
  }

  private exposeTestHooks(): void {
    const probe = new Vector3();
    const toScreen = (v: Vector3) => {
      v.project(this.world.camera);
      const r = this.world.renderer.domElement.getBoundingClientRect();
      return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
    };
    const hook = ((window as unknown as Record<string, unknown>).__terracity ??= {}) as Record<string, unknown>;
    Object.assign(hook, {
      game,
      selectedId,
      armedType,
      statusText,
      /** Page pixel position of a tile centre (for browser e2e tests). */
      tileToScreen: (col: number, row: number) => {
        const t = tileAt(game.terrain, col, row)!;
        const { x, z } = tileCenter(col, row);
        probe.set(x, tileTopY(t), z);
        return toScreen(this.board.localToWorld(probe));
      },
      /** Tile under the piece currently held by a hand/controller (or null). */
      heldTile: () => {
        for (const e of this.queries.held.entities) return this.tileUnder(e.object3D!);
        return null;
      },
      /** Held piece: tile under it and its offset (m) from that tile's centre. */
      heldOffset: () => {
        for (const e of this.queries.held.entities) {
          const t = this.tileUnder(e.object3D!);
          if (!t) return null;
          const c = tileCenter(t.col, t.row);
          return { ...t, dx: this.local.x - c.x, dz: this.local.z - c.z };
        }
        return null;
      },
      /** Structure type of the piece currently held (or null). */
      heldType: () => {
        for (const e of this.queries.held.entities) return this.typeOf(e);
        return null;
      },
      /** Page pixel position of a tray slot's front edge (clear of the token). */
      slotToScreen: (slot: number) =>
        toScreen(probe.set(BOARD_CENTER[0] + slotX(slot), BOARD_CENTER[1], BOARD_CENTER[2] + TRAY_Z + 0.03)),
    });
  }
}

/** Surface height for a structure: bridges sit at land height over water. */
function structureBaseY(tile: Tile): number {
  return tile.type === TerrainType.River || tile.type === TerrainType.Sea
    ? TILE_BASE_HEIGHT
    : tileTopY(tile);
}

function yawToQuarter(yaw: number): number {
  return ((Math.round(yaw / QUARTER) % 4) + 4) % 4;
}
