import { describe, expect, it } from 'vitest';
import { StructureType as S } from '../../src/config/scenario';
import { GameState } from '../../src/core/game-state';
import { Challenge, evaluate, formatClock, SESSION_SECONDS } from '../../src/gameplay/challenge';

const buildReference = (g: GameState) => {
  for (const [t, c, r] of [
    [S.Road, 6, 3], [S.Road, 7, 3],
    [S.Residential, 6, 2], [S.Residential, 6, 4], [S.Residential, 2, 4], [S.Residential, 8, 3],
    [S.Wind, 10, 8], [S.Wind, 11, 8], [S.Wind, 12, 8],
    [S.Park, 9, 3], [S.Park, 1, 4], [S.Solar, 9, 4],
  ] as const) expect(g.add(t, c, r).ok).toBe(true);
};

describe('challenge flow', () => {
  it('intro -> building -> finished -> replay', () => {
    const g = new GameState();
    const c = new Challenge(g.terrain, () => g.placements);
    expect(c.phase).toBe('intro');
    c.start();
    expect(c.phase).toBe('building');
    buildReference(g);
    const r = c.finish();
    expect(c.phase).toBe('finished');
    expect(r.success).toBe(true);
    expect(r.hints).toEqual([]);
    c.replay();
    expect(c.phase).toBe('intro');
    expect(c.result).toBeNull();
  });

  it('the timer auto-finishes the session', () => {
    const g = new GameState();
    const c = new Challenge(g.terrain, () => g.placements);
    c.tick(10);
    expect(c.timeLeft).toBe(SESSION_SECONDS); // clock only runs while building
    c.start();
    expect(c.tick(SESSION_SECONDS - 1)).toBe(false);
    expect(c.tick(5)).toBe(true);
    expect(c.phase).toBe('finished');
    expect(c.result!.timedOut).toBe(true);
    expect(c.result!.success).toBe(false);
  });

  it('failure lists one hint per missed target', () => {
    const g = new GameState();
    const r = evaluate(g.terrain, []);
    expect(r.success).toBe(false);
    expect(r.hints).toHaveLength(3); // population, environment, renewables (budget is fine)
    expect(r.hints.join(' ')).toMatch(/Population.*Environment.*Renewables/s);
  });

  it('formats the clock', () => {
    expect(formatClock(420)).toBe('7:00');
    expect(formatClock(61.2)).toBe('1:02');
    expect(formatClock(0)).toBe('0:00');
  });
});
