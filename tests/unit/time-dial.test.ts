import { describe, expect, it } from 'vitest';
import { angleFor, dialLabel, displayYear, interpolate, nearestYear, progressFor } from '../../src/interactions/time-dial';

const at = (p: number) => [Math.cos(angleFor(p)), Math.sin(angleFor(p))] as const;

describe('time dial', () => {
  it('angle and progress round-trip along the arc', () => {
    for (const p of [0, 0.1, 0.5, 0.73, 1]) {
      const [x, y] = at(p);
      expect(progressFor(x, y, 0.5)).toBeCloseTo(p, 6);
    }
  });

  it('the gap below the arc clamps to the end the knob came from (no 2050 -> 2026 jump)', () => {
    const [x, y] = [0, -1]; // straight down: in the 120 degree gap
    expect(progressFor(x, y, 0.95)).toBe(1);
    expect(progressFor(x, y, 0.05)).toBe(0);
  });

  it('snaps to the nearest simulated year', () => {
    expect(nearestYear(0.2)).toBe(2026);
    expect(nearestYear(0.3)).toBe(2035);
    expect(nearestYear(0.74)).toBe(2035);
    expect(nearestYear(0.8)).toBe(2050);
  });

  it('labels in-between times as interpolated, simulated years plainly', () => {
    expect(dialLabel(0)).toBe('2026');
    expect(dialLabel(0.5)).toBe('2035');
    expect(dialLabel(1)).toBe('2050');
    expect(dialLabel(0.625)).toBe('~2039 (between projections)');
    expect(displayYear(0.25)).toBe(2031);
    expect(displayYear(0.75)).toBe(2043);
  });

  it('interpolates between the simulated years only (exact at the years)', () => {
    const states = { 2026: { haze: 0, trees: 1 }, 2035: { haze: 0.2, trees: 0.8 }, 2050: { haze: 0.6, trees: 0.5 } };
    expect(interpolate(states, 0)).toEqual(states[2026]);
    expect(interpolate(states, 0.5)).toEqual(states[2035]);
    expect(interpolate(states, 1)).toEqual(states[2050]);
    expect(interpolate(states, 0.75).haze).toBeCloseTo(0.4);
    expect(interpolate(states, 0.25).trees).toBeCloseTo(0.9);
  });
});
