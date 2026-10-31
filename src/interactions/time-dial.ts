/**
 * Sculpt time: the time dial (pure; tests/unit/time-dial.test.ts).
 *
 * A ring with 2026 / 2035 / 2050 notches over a 240 degree arc. The knob's
 * angle maps to time progress p in [0, 1] (the same scale as
 * PROJECTION.progress: 2026 = 0, 2035 = 0.5, 2050 = 1). Only the three years are
 * simulated; between them the visuals are interpolated (labelled "~2041,
 * between projections") and the numbers show the nearest simulated year.
 * Releasing the knob snaps to the nearest year.
 */
import { PROJECTION, YEARS, type Year } from '../config/projection.js';

/** Arc of the dial: 2026 at START, 2050 at START - SWEEP (clockwise, radians). */
export const DIAL = { start: (210 * Math.PI) / 180, sweep: (240 * Math.PI) / 180 };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Knob angle (radians, ring plane, 0 = +x, counter-clockwise) for progress p. */
export function angleFor(p: number): number {
  return DIAL.start - clamp01(p) * DIAL.sweep;
}

/**
 * Progress for a hand position in the ring plane (x, y relative to the centre).
 * Positions in the gap below the arc clamp to the nearer end, so the knob
 * never jumps from 2050 to 2026.
 */
export function progressFor(x: number, y: number, previous: number): number {
  let a = Math.atan2(y, x); // (-PI, PI]
  // Distance along the arc from the 2026 end, clockwise.
  let d = DIAL.start - a;
  d = ((d % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (d <= DIAL.sweep) return d / DIAL.sweep;
  // In the gap: stay at the end the knob came from.
  return previous >= 0.5 ? 1 : 0;
}

/** The simulated year nearest to progress p. */
export function nearestYear(p: number): Year {
  let best: Year = YEARS[0];
  for (const y of YEARS) if (Math.abs(PROJECTION.progress[y] - p) < Math.abs(PROJECTION.progress[best] - p)) best = y;
  return best;
}

/** Calendar year shown while scrubbing: piecewise linear through the simulated years. */
export function displayYear(p: number): number {
  return Math.round(interpolate({ 2026: { y: 2026 }, 2035: { y: 2035 }, 2050: { y: 2050 } }, p).y);
}

/** Text under the dial: a simulated year, or an interpolated one marked as such. */
export function dialLabel(p: number): string {
  const y = displayYear(p);
  return (YEARS as readonly number[]).includes(y) && Math.abs(PROJECTION.progress[nearestYear(p)] - p) < 0.01
    ? `${y}`
    : `~${y} (between projections)`;
}

/** Interpolate scalar visual parameters between the simulated years around p. */
export function interpolate<T extends Record<string, number>>(states: Record<Year, T>, p: number): T {
  const q = clamp01(p);
  const ys = [...YEARS].sort((a, b) => PROJECTION.progress[a] - PROJECTION.progress[b]);
  let i = 0;
  while (i < ys.length - 2 && q > PROJECTION.progress[ys[i + 1]]) i++;
  const a = ys[i];
  const b = ys[i + 1];
  const k = (q - PROJECTION.progress[a]) / (PROJECTION.progress[b] - PROJECTION.progress[a]);
  const out = {} as Record<string, number>;
  for (const key of Object.keys(states[a])) out[key] = states[a][key] + (states[b][key] - states[a][key]) * clamp01(k);
  return out as T;
}
