import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/config/balance';
import { StructureType as S } from '../../src/config/scenario';
import { STRUCTURES } from '../../src/config/structures';
import { GameState } from '../../src/core/game-state';

describe('GameState actions', () => {
  it('adds, moves, rotates and removes, emitting events', () => {
    const g = new GameState();
    const kinds: string[] = [];
    g.on((e) => kinds.push(`${e.kind}:${e.action}`));
    const { id } = g.add(S.Residential, 6, 4);
    expect(id).toBe('residential-1');
    expect(g.move(id!, 0, 0).ok).toBe(false); // sea
    expect(g.get(id!)).toMatchObject({ col: 6, row: 4 });
    expect(g.move(id!, 5, 5).ok).toBe(true); // farmland
    g.rotate(id!);
    expect(g.get(id!)!.rotation).toBe(1);
    g.remove(id!);
    expect(g.placements).toHaveLength(0);
    expect(kinds).toEqual(['changed:add', 'rejected:move', 'changed:move', 'changed:move', 'changed:remove']);
  });

  it('prevents two structures on one tile', () => {
    const g = new GameState();
    const { id } = g.add(S.Residential, 6, 4);
    expect(g.add(S.Park, 6, 4).ok).toBe(false);
    expect(g.move(id!, 6, 4).ok).toBe(true); // re-placing itself is fine
  });

  it('change messages explain cause and consequence', () => {
    const g = new GameState();
    let msg = '';
    g.on((e) => { if (e.kind === 'changed') msg = e.message; });
    g.add(S.Residential, 5, 5);
    expect(msg).toMatch(/Homes built on farmland/);
    expect(msg).toMatch(/env/);
    expect(msg).toMatch(/-12 budget/);
    g.add(S.Residential, 9, 3);
    expect(msg).toMatch(/No road access/);
  });
});

describe('budget constraints', () => {
  it('stops adding when the budget runs out', () => {
    const g = new GameState();
    const cost = STRUCTURES.wind.cost;
    const tiles: Array<[number, number]> = [[10, 5], [11, 5], [12, 5], [13, 5], [10, 6], [11, 6], [12, 6], [13, 6], [10, 7], [11, 7]];
    let placed = 0;
    for (const [c, r] of tiles) if (g.add(S.Wind, c, r).ok) placed++;
    expect(placed).toBe(Math.floor(BALANCE.startBudget / cost));
    expect(g.metrics.budgetLeft).toBeGreaterThanOrEqual(0);
  });

  it('moving onto a costlier hill re-checks the budget with a refund of the old tile', () => {
    const g = new GameState();
    const { id } = g.add(S.Residential, 6, 4); // 12
    expect(g.move(id!, 10, 8).ok).toBe(false); // steep hill (2): no homes
    expect(g.move(id!, 10, 5).ok).toBe(true); // gentle hill (1): 12 + 6
    expect(g.metrics.budgetSpent).toBe(18);
    expect(g.move(id!, 6, 4).ok).toBe(true);
    expect(g.metrics.budgetSpent).toBe(12);
  });
});

describe('undo / redo consistency', () => {
  const script = (g: GameState) => {
    const a = g.add(S.Residential, 6, 4).id!;
    g.add(S.Road, 5, 5);
    const w = g.add(S.Wind, 13, 9).id!;
    g.move(a, 6, 3);
    g.rotate(w);
    g.remove(w);
    g.add(S.Park, 9, 3);
  };

  it('undo all returns to the empty plan; redo all returns to the final plan', () => {
    const g = new GameState();
    script(g);
    const final = g.placements;
    const finalMetrics = g.metrics;
    let undos = 0;
    while (g.canUndo) { g.undo(); undos++; }
    expect(undos).toBe(7);
    expect(g.placements).toEqual([]);
    expect(g.metrics.budgetLeft).toBe(BALANCE.startBudget);
    while (g.canRedo) g.redo();
    expect(g.placements).toEqual(final);
    expect(g.metrics).toEqual(finalMetrics);
  });

  it('every intermediate state matches a fresh replay', () => {
    const g = new GameState();
    const states: unknown[] = [g.placements];
    g.on((e) => { if (e.kind === 'changed' && e.action !== 'undo' && e.action !== 'redo') states.push(g.placements); });
    script(g);
    for (let i = states.length - 1; i > 0; i--) {
      expect(g.placements).toEqual(states[i]);
      g.undo();
    }
    expect(g.placements).toEqual(states[0]);
  });

  it('a new action after undo clears the redo stack', () => {
    const g = new GameState();
    g.add(S.Residential, 6, 4);
    g.add(S.Park, 9, 3);
    g.undo();
    expect(g.canRedo).toBe(true);
    g.add(S.Solar, 8, 3);
    expect(g.canRedo).toBe(false);
    expect(g.redo()).toBe(false);
  });

  it('reset clears plan and history', () => {
    const g = new GameState();
    g.add(S.Residential, 6, 4);
    g.reset();
    expect(g.placements).toEqual([]);
    expect(g.canUndo).toBe(false);
  });
});
