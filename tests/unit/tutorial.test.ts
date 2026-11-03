import { describe, expect, it } from 'vitest';
import { StructureType as S } from '../../src/config/scenario';
import { GameState } from '../../src/core/game-state';
import { Tutorial, type TutorialContext } from '../../src/gameplay/tutorial';

const ctx = (g: GameState, extra: Partial<TutorialContext> = {}): TutorialContext => ({
  placements: g.placements,
  servedIds: g.metrics.servedIds,
  viewYear: 2026,
  ...extra,
});

describe('the first five minutes (competition)', () => {
  it('walks: choice -> 2050 -> split -> move the seam -> enter -> talk to Mira -> the other future -> done', () => {
    const g = new GameState();
    const t = new Tutorial();
    expect(t.text).toMatch(/^Step 1\/7: Make one choice/);
    g.add(S.Residential, 9, 3); // not connected to the town
    expect(t.update(ctx(g))).toBe(false);
    g.add(S.Residential, 6, 4);
    t.update(ctx(g));
    expect(t.step).toBe('time');
    t.update(ctx(g, { viewYear: 2035 }));
    expect(t.step).toBe('time'); // 2050 is the horizon
    t.update(ctx(g, { viewYear: 2050 }));
    expect(t.step).toBe('split');
    t.update(ctx(g, { viewYear: 2050, futuresOpen: true }));
    expect(t.step).toBe('seam');
    t.update(ctx(g, { viewYear: 2050, futuresOpen: true, seam: 0.5 }));
    expect(t.step).toBe('seam'); // opened, not yet moved
    t.update(ctx(g, { viewYear: 2050, futuresOpen: true, seam: 0.36 }));
    expect(t.step).toBe('enter');
    t.update(ctx(g, { viewYear: 2050, futuresOpen: true, inStreet: true, streetPlan: 'B' }));
    expect(t.step).toBe('talk');
    t.update(ctx(g, { viewYear: 2050, futuresOpen: true, inStreet: true, streetPlan: 'B', talked: true }));
    expect(t.step).toBe('other');
    t.update(ctx(g, { viewYear: 2050, futuresOpen: true, inStreet: true, streetPlan: 'none' }));
    expect(t.step).toBe('done');
    expect(t.completed).toBe(true);
  });

  it('every step waits for its own action (state that is already true does not skip ahead)', () => {
    const g = new GameState();
    g.add(S.Residential, 6, 4);
    const t = new Tutorial();
    const all = ctx(g, { viewYear: 2050, futuresOpen: true, seam: 0.2, inStreet: true, streetPlan: 'B', talked: true });
    t.update(all);
    expect(t.step).toBe('time');
    t.update(all);
    expect(t.step).toBe('split');
  });

  it('replay on an existing plan asks for a new choice; skip is not completion', () => {
    const g = new GameState();
    g.add(S.Residential, 6, 4);
    const t = new Tutorial();
    t.reset(5);
    t.update(ctx(g, { planVersion: 5 }));
    expect(t.step).toBe('homes');
    t.update(ctx(g, { planVersion: 6 }));
    expect(t.step).toBe('time');
    t.skip();
    expect(t.active).toBe(false);
    expect(t.completed).toBe(false);
  });

  it('hint tiles: free tiles beside the town on step 1 only', () => {
    const g = new GameState();
    const t = new Tutorial();
    expect(t.hintTiles(g.terrain, g.placements)).toHaveLength(3);
    g.add(S.Residential, 6, 4);
    t.update(ctx(g));
    expect(t.hintTiles(g.terrain, g.placements)).toHaveLength(0);
  });
});
