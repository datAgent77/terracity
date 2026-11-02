import { describe, expect, it } from 'vitest';
import { StructureType as S } from '../../src/config/scenario';
import { GameState } from '../../src/core/game-state';
import { Tutorial } from '../../src/gameplay/tutorial';

const ctx = (g: GameState, viewYear: 2026 | 2035 | 2050 = 2026, inStreet = false, futuresOpen = false) => ({
  placements: g.placements,
  servedIds: g.metrics.servedIds,
  viewYear,
  inStreet,
  futuresOpen,
});

describe('tutorial', () => {
  it('walks homes -> wind -> split -> enter a future -> back to one world -> done', () => {
    const g = new GameState();
    const t = new Tutorial();
    expect(t.step).toBe('homes');
    expect(t.text).toMatch(/1\/5/);
    g.add(S.Residential, 9, 3); // not connected: does not count
    expect(t.update(ctx(g))).toBe(false);
    g.add(S.Residential, 6, 4); // next to the town
    expect(t.update(ctx(g))).toBe(true);
    expect(t.step).toBe('wind');
    g.add(S.Wind, 12, 8);
    t.update(ctx(g));
    expect(t.step).toBe('split');
    t.update(ctx(g, 2050, false, true)); // two futures held apart
    expect(t.step).toBe('enter');
    t.update(ctx(g, 2050, true, true)); // inside a future
    expect(t.step).toBe('back');
    t.update(ctx(g, 2050, false, true));
    expect(t.step).toBe('back'); // back at the futures, not merged yet
    t.update(ctx(g, 2026, false, false));
    expect(t.step).toBe('done');
    expect(t.active).toBe(false);
    expect(t.text).toBe('');
  });

  it('a built plan does not skip the GODMODE steps', () => {
    const g = new GameState();
    g.add(S.Residential, 6, 4);
    g.add(S.Wind, 12, 8);
    const t = new Tutorial();
    t.update(ctx(g));
    expect(t.step).toBe('split');
    t.update(ctx(g, 2050, false, true));
    expect(t.step).toBe('enter'); // splitting does not also count as entering
  });

  it('hint tiles: free town-adjacent tiles, then free ridge tiles', () => {
    const g = new GameState();
    const t = new Tutorial();
    expect(t.hintTiles(g.terrain, g.placements)).toHaveLength(3);
    g.add(S.Residential, 6, 4);
    expect(t.hintTiles(g.terrain, g.placements)).toHaveLength(2);
    t.update(ctx(g));
    const ridge = t.hintTiles(g.terrain, g.placements);
    expect(ridge.length).toBeGreaterThan(3);
    for (const r of ridge) expect(g.terrain[r.row * 14 + r.col].elevation).toBeGreaterThanOrEqual(2);
  });

  it('skip and reset', () => {
    const t = new Tutorial();
    t.skip();
    expect(t.active).toBe(false);
    t.reset();
    expect(t.step).toBe('homes');
  });
});
