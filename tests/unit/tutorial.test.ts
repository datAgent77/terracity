import { describe, expect, it } from 'vitest';
import { StructureType as S } from '../../src/config/scenario';
import { GameState } from '../../src/core/game-state';
import { Tutorial } from '../../src/gameplay/tutorial';

const ctx = (g: GameState, viewYear: 2026 | 2035 | 2050 = 2026, inStreet = false) => ({
  placements: g.placements,
  servedIds: g.metrics.servedIds,
  viewYear,
  inStreet,
});

describe('tutorial', () => {
  it('walks homes -> wind -> enter your city -> 2050 -> back to the tabletop in 2026 -> done', () => {
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
    expect(t.step).toBe('enter');
    t.update(ctx(g, 2026, true)); // entered the street
    expect(t.step).toBe('future');
    t.update(ctx(g, 2035, true));
    expect(t.step).toBe('future');
    t.update(ctx(g, 2050, true));
    expect(t.step).toBe('back');
    t.update(ctx(g, 2026, true));
    expect(t.step).toBe('back'); // still in the street
    t.update(ctx(g, 2050, false));
    expect(t.step).toBe('back'); // back at the table but still viewing the future
    t.update(ctx(g, 2026, false));
    expect(t.step).toBe('done');
    expect(t.active).toBe(false);
    expect(t.text).toBe('');
  });

  it('does not skip the time-travel steps even if the plan is already built', () => {
    const g = new GameState();
    g.add(S.Residential, 6, 4);
    g.add(S.Wind, 12, 8);
    const t = new Tutorial();
    t.update(ctx(g));
    expect(t.step).toBe('enter'); // a built plan does not skip entering
    t.update(ctx(g, 2026, true));
    expect(t.step).toBe('future'); // 2026 view must not complete "back" early
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
