import { describe, expect, it } from 'vitest';
import { GESTURE, initialGesture, stepGesture, type GestureStep, type HandSample, type Vec3 } from '../../src/interactions/two-hand-gesture';

const at = (x: number, busy = false): HandSample => ({ pos: [x, 0.95, -0.5] as Vec3, busy });
const run = (frames: Array<[HandSample, HandSample]>, dual = false, dt = 0.05) => {
  let s = initialGesture();
  const steps: GestureStep[] = [];
  for (const [l, r] of frames) {
    const st = stepGesture(s, l, r, dual, dt);
    s = st.state;
    steps.push(st);
  }
  return steps;
};
const hold = (half: number, n: number, busy = false): Array<[HandSample, HandSample]> => Array.from({ length: n }, () => [at(-half, busy), at(half, busy)]);
const apart = (from: number, to: number, n: number): Array<[HandSample, HandSample]> =>
  Array.from({ length: n }, (_, i) => { const h = from + ((to - from) * (i + 1)) / n; return [at(-h), at(h)]; });
const events = (steps: GestureStep[]) => steps.map((s) => s.event).filter(Boolean);

describe('split reality gesture', () => {
  it('together, hold, pull apart -> arm then split', () => {
    const steps = run([...hold(0.05, 10), ...apart(0.05, 0.25, 8)]);
    expect(events(steps)).toEqual(['arm', 'split']);
  });

  it('nothing happens without the hold (quick pass) or with hands far apart', () => {
    expect(events(run([...hold(0.05, 3), ...apart(0.05, 0.25, 4)]))).toEqual([]);
    expect(events(run(hold(0.2, 30)))).toEqual([]);
  });

  it('pinching never arms (no conflict with pinch-to-place) and cancels an armed gesture', () => {
    expect(events(run(hold(0.05, 20, true)))).toEqual([]);
    const steps = run([...hold(0.05, 10), [at(-0.08, true), at(0.08)]]);
    expect(events(steps)).toEqual(['arm', 'cancel']);
  });

  it('leaving the zone cancels after a short grace, a brief exit does not', () => {
    const outside: [HandSample, HandSample] = [{ pos: [-0.1, 0.3, -0.5], busy: false }, at(0.1)];
    expect(events(run([...hold(0.05, 10), outside, outside, outside, outside, outside, outside]))).toEqual(['arm', 'cancel']);
    expect(events(run([...hold(0.05, 10), outside, outside, ...apart(0.1, 0.25, 6)]))).toEqual(['arm', 'split']);
  });

  it('progress grows with separation while armed', () => {
    const steps = run([...hold(0.05, 10), ...apart(0.05, 0.18, 6)]);
    const p = steps.slice(10).map((s) => s.progress);
    for (let i = 1; i < p.length; i++) expect(p[i]).toBeGreaterThanOrEqual(p[i - 1]);
    expect(p[p.length - 1]).toBeGreaterThan(0.5);
  });

  it('latch: after a split, hands must separate before a new gesture; merge only when dual', () => {
    let s = initialGesture();
    let latchedAtSplit = false;
    for (const [l, r] of [...hold(0.05, 10), ...apart(0.05, 0.25, 8)]) {
      const st = stepGesture(s, l, r, false, 0.05);
      s = st.state;
      if (st.event === 'split') latchedAtSplit = s.latched;
    }
    expect(latchedAtSplit).toBe(true);
    // Hands at a still-close distance right after a split would not re-arm while latched:
    let t = { ...initialGesture(), latched: true };
    for (const [l, r] of hold(0.1, 20)) t = stepGesture(t, l, r, false, 0.05).state;
    expect(t.mode).toBe('idle');
    // Once separated (above), bringing them together while dual merges.
    const merged: string[] = [];
    for (const [l, r] of hold(0.05, 14)) {
      const st = stepGesture(s, l, r, true, 0.05);
      s = st.state;
      if (st.event) merged.push(st.event);
    }
    expect(merged).toEqual(['merge']);
    expect(events(run(hold(0.05, 14), false))).not.toContain('merge');
  });

  it('hold times match the configuration', () => {
    const steps = run(hold(0.05, 60), false, 0.01);
    const armAt = steps.findIndex((s) => s.event === 'arm');
    expect(Math.abs((armAt + 1) * 0.01 - GESTURE.armHold)).toBeLessThanOrEqual(0.0101);
  });

  it('is deterministic', () => {
    const f = [...hold(0.05, 10), ...apart(0.05, 0.25, 8)];
    expect(run(f).map((s) => [s.event, s.progress])).toEqual(run(f).map((s) => [s.event, s.progress]));
  });
});
