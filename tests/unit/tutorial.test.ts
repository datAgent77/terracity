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

describe('the first five minutes', () => {
  it('walks: one choice -> split -> why -> enter -> talk to Mira -> the other future -> done', () => {
    const g = new GameState();
    const t = new Tutorial();
    expect(t.step).toBe('homes');
    expect(t.text).toMatch(/^Step 1\/6: Make one choice/);
    g.add(S.Residential, 9, 3); // not connected to the town: not yet a home for anyone
    expect(t.update(ctx(g))).toBe(false);
    g.add(S.Residential, 6, 4);
    t.update(ctx(g));
    expect(t.step).toBe('split');
    t.update(ctx(g, { futuresOpen: true }));
    expect(t.step).toBe('why');
    t.update(ctx(g, { futuresOpen: true, causalityOn: true }));
    expect(t.step).toBe('enter');
    t.update(ctx(g, { futuresOpen: true, inStreet: true, streetPlan: 'B', viewYear: 2050 }));
    expect(t.step).toBe('talk');
    expect(t.firstPlan).toBe('B');
    t.update(ctx(g, { futuresOpen: true, inStreet: true, streetPlan: 'B', talked: true, viewYear: 2050 }));
    expect(t.step).toBe('other');
    // Back in the same future: not yet.
    t.update(ctx(g, { futuresOpen: true, inStreet: true, streetPlan: 'B', viewYear: 2050 }));
    expect(t.step).toBe('other');
    t.update(ctx(g, { futuresOpen: true, inStreet: true, streetPlan: 'none', viewYear: 2050 }));
    expect(t.step).toBe('done');
    expect(t.completed).toBe(true);
    expect(t.text).toBe('');
  });

  it('every step waits for its own action (a built plan does not skip ahead)', () => {
    const g = new GameState();
    g.add(S.Residential, 6, 4);
    const t = new Tutorial();
    t.update(ctx(g, { futuresOpen: true, inStreet: true, streetPlan: 'B', talked: true }));
    expect(t.step).toBe('split'); // the choice counts, nothing after it
    t.update(ctx(g, { futuresOpen: true, inStreet: true, streetPlan: 'B', talked: true }));
    expect(t.step).toBe('why');
  });

  it('Causality Vision already on when splitting counts for the why step', () => {
    const g = new GameState();
    g.add(S.Residential, 6, 4);
    const t = new Tutorial();
    t.update(ctx(g));
    t.update(ctx(g, { futuresOpen: true, causalityOn: true }));
    expect(t.step).toBe('enter');
  });

  it('replay on an existing plan asks for a new choice; skip is not completion', () => {
    const g = new GameState();
    g.add(S.Residential, 6, 4);
    const t = new Tutorial();
    t.reset(5);
    t.update(ctx(g, { planVersion: 5 }));
    expect(t.step).toBe('homes');
    t.update(ctx(g, { planVersion: 6 }));
    expect(t.step).toBe('split');
    t.skip();
    expect(t.active).toBe(false);
    expect(t.completed).toBe(false);
  });

  it('hint tiles: free tiles beside the town on step 1 only', () => {
    const g = new GameState();
    const t = new Tutorial();
    expect(t.hintTiles(g.terrain, g.placements)).toHaveLength(3);
    g.add(S.Residential, 6, 4);
    expect(t.hintTiles(g.terrain, g.placements)).toHaveLength(2);
    t.update(ctx(g));
    expect(t.hintTiles(g.terrain, g.placements)).toHaveLength(0);
  });
});
