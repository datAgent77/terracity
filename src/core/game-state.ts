/**
 * Input-agnostic game state with undo/redo. Every input path (XR hand,
 * controller, ray, mouse, keyboard) ends in one of these actions, so rules
 * live in exactly one place. Plans are immutable snapshots, which makes
 * undo/redo trivially consistent.
 */
import type { StructureType } from '../config/scenario.js';
import { STRUCTURES } from '../config/structures.js';
import {
  computeMetrics,
  describeDelta,
  diffMetrics,
  type MetricDelta,
  type Metrics,
  type Placement,
} from '../simulation/metrics.js';
import { canPlace, constructionCost, type PlacementVerdict } from '../simulation/placement.js';
import { generateTerrain, tileAt, type TerrainMap } from '../world/terrain-map.js';

export type { Placement } from '../simulation/metrics.js';

export type ActionKind = 'add' | 'move' | 'remove' | 'rotate' | 'undo' | 'redo' | 'reset' | 'load';

export type GameEvent =
  | {
      kind: 'changed';
      action: ActionKind;
      id: string | null;
      metrics: Metrics;
      delta: MetricDelta;
      /** Human-readable cause → consequence line. */
      message: string;
    }
  | { kind: 'rejected'; action: ActionKind; id: string | null; reason: string };

type Plan = readonly Placement[];

export class GameState {
  readonly terrain: TerrainMap = generateTerrain();
  private plan: Plan = [];
  private past: Plan[] = [];
  private future: Plan[] = [];
  private nextId = 1;
  private cachedMetrics: Metrics = computeMetrics(this.terrain, []);
  private listeners = new Set<(e: GameEvent) => void>();

  on(listener: (e: GameEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get metrics(): Metrics {
    return this.cachedMetrics;
  }

  get placements(): Plan {
    return this.plan;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  get(id: string): Placement | undefined {
    return this.plan.find((p) => p.id === id);
  }

  at(col: number, row: number): Placement | undefined {
    return this.plan.find((p) => p.col === col && p.row === row);
  }

  /**
   * Validate without mutating — used for live hover feedback. When `movingId`
   * is given, that structure's own tile and its already-paid cost are ignored.
   */
  check(type: StructureType, col: number, row: number, movingId?: string): PlacementVerdict {
    const moving = movingId ? this.get(movingId) : undefined;
    const tile = tileAt(this.terrain, col, row);
    const other = this.at(col, row);
    const occupied = !!other && other.id !== movingId;
    let budget = this.cachedMetrics.budgetLeft;
    if (moving) budget += constructionCost(moving.type, tileAt(this.terrain, moving.col, moving.row)!);
    return canPlace(type, tile, occupied, budget);
  }

  add(type: StructureType, col: number, row: number, rotation = 0): PlacementVerdict & { id?: string } {
    const verdict = this.check(type, col, row);
    if (!verdict.ok) return this.reject('add', null, verdict.reason, verdict);
    const id = `${type}-${this.nextId++}`;
    const placement: Placement = { id, type, col, row, rotation: rotation & 3 };
    this.commit('add', id, [...this.plan, placement], this.noun(type, 'built', col, row, verdict));
    return { ...verdict, id };
  }

  move(id: string, col: number, row: number, rotation?: number): PlacementVerdict {
    const p = this.get(id);
    if (!p) return this.reject('move', id, 'Unknown structure', { ok: false, reason: 'Unknown structure' });
    const verdict = this.check(p.type, col, row, id);
    if (!verdict.ok) return this.reject('move', id, verdict.reason, verdict);
    const rot = rotation === undefined ? p.rotation : rotation & 3;
    if (p.col === col && p.row === row && p.rotation === rot) {
      this.emit({ kind: 'changed', action: 'move', id, metrics: this.metrics, delta: zero(), message: 'No change.' });
      return verdict;
    }
    const next = this.plan.map((o) => (o.id === id ? { ...o, col, row, rotation: rot } : o));
    this.commit('move', id, next, this.noun(p.type, 'moved', col, row, verdict));
    return verdict;
  }

  rotate(id: string): PlacementVerdict {
    const p = this.get(id);
    if (!p) return this.reject('rotate', id, 'Unknown structure', { ok: false, reason: 'Unknown structure' });
    return this.move(id, p.col, p.row, p.rotation + 1);
  }

  remove(id: string): boolean {
    const p = this.get(id);
    if (!p) return false;
    this.commit(
      'remove',
      id,
      this.plan.filter((o) => o.id !== id),
      `${cap(STRUCTURES[p.type].noun)} removed`,
    );
    return true;
  }

  undo(): boolean {
    const prev = this.past.pop();
    if (!prev) {
      this.reject('undo', null, 'Nothing to undo', null);
      return false;
    }
    this.future.push(this.plan);
    this.apply('undo', null, prev, 'Undone');
    return true;
  }

  redo(): boolean {
    const next = this.future.pop();
    if (!next) {
      this.reject('redo', null, 'Nothing to redo', null);
      return false;
    }
    this.past.push(this.plan);
    this.apply('redo', null, next, 'Redone');
    return true;
  }

  /** Replace the plan with a saved one (undoable), e.g. restoring Plan A. */
  load(plan: readonly Placement[], label: string): void {
    const ids = plan.map((p) => Number(p.id.split('-').pop()) || 0);
    this.nextId = Math.max(this.nextId, ...ids, 0) + 1;
    this.commit('load', null, plan.map((p) => ({ ...p })), `${label} restored`);
  }

  /** Clear the plan and history (restart). */
  reset(): void {
    this.past = [];
    this.future = [];
    this.nextId = 1;
    this.apply('reset', null, [], 'Fresh start');
  }

  private commit(action: ActionKind, id: string | null, next: Plan, message: string): void {
    this.past.push(this.plan);
    this.future = [];
    this.apply(action, id, next, message);
  }

  private apply(action: ActionKind, id: string | null, next: Plan, message: string): void {
    const before = this.cachedMetrics;
    this.plan = next;
    this.cachedMetrics = computeMetrics(this.terrain, next);
    const delta = diffMetrics(before, this.cachedMetrics);
    let line = `${message}: ${describeDelta(delta)}.`;
    if (id && this.get(id)?.type === 'residential' && !this.cachedMetrics.servedIds.has(id)) {
      line += ' No road access yet - residents not served.';
    }
    this.emit({ kind: 'changed', action, id, metrics: this.cachedMetrics, delta, message: line });
  }

  private noun(type: StructureType, verb: string, col: number, row: number, v: PlacementVerdict): string {
    const tile = tileAt(this.terrain, col, row)!;
    const warn = v.ok && v.warning ? ` (${v.warning})` : '';
    return `${cap(STRUCTURES[type].noun)} ${verb} on ${tile.type}${warn}`;
  }

  private reject<T>(action: ActionKind, id: string | null, reason: string, ret: T): T {
    this.emit({ kind: 'rejected', action, id, reason });
    return ret;
  }

  private emit(e: GameEvent): void {
    for (const l of this.listeners) l(e);
  }
}

const zero = (): MetricDelta => ({ population: 0, environment: 0, budgetLeft: 0, renewableCoverage: 0 });
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
