/**
 * "Split reality" two-hand gesture (pure; tests/unit/two-hand-gesture.test.ts).
 *
 * Bring both open hands together over the miniature city (not pinching), hold
 * them there briefly — a luminous fracture appears — then pull them apart: the
 * world splits into two futures. While the futures are open, bring the hands
 * back together and hold to merge them.
 *
 * Open hands are required (a pinch or squeeze cancels), so the gesture never
 * competes with pinch-to-place. Thresholds have hysteresis, there is a hold
 * time before anything happens, leaving the zone or pinching cancels safely,
 * and after every split/merge the hands must separate again (latch) before the
 * next gesture can start.
 */

export type Vec3 = readonly [number, number, number];

export interface HandSample {
  /** Palm / grip position in world metres, or null when the hand is not tracked. */
  pos: Vec3 | null;
  /** Pinching or squeezing (grabbing): never part of this gesture. */
  busy: boolean;
}

export interface GestureZone {
  min: Vec3;
  max: Vec3;
}

export const GESTURE = {
  /** Hands this close (m) start the gesture... */
  together: 0.18,
  /** ...and must first be this far apart again after a split/merge (latch). */
  release: 0.26,
  /** Separation (m) that commits the split. */
  apart: 0.4,
  /** Hold time (s) with hands together before the fracture appears. */
  armHold: 0.35,
  /** Hold time (s) with hands together to merge two open futures. */
  mergeHold: 0.45,
  /** A hand may leave the zone this long (s) before the gesture is cancelled. */
  grace: 0.25,
};

/** Where the hands must be: above the miniature city (world metres). */
export const SPLIT_ZONE: GestureZone = { min: [-0.55, 0.76, -0.9], max: [0.55, 1.2, -0.08] };

export type GestureMode = 'idle' | 'arming' | 'armed' | 'merging';

export interface GestureState {
  mode: GestureMode;
  /** Seconds held in the current hold (arming / merging). */
  hold: number;
  /** Seconds a hand has been outside the zone while armed. */
  out: number;
  /** True until the hands separate after a split or merge. */
  latched: boolean;
}

export type GestureEvent = 'arm' | 'split' | 'merge' | 'cancel' | null;

export interface GestureStep {
  state: GestureState;
  event: GestureEvent;
  /** 0..1 feedback: split progress while armed, hold progress while arming / merging. */
  progress: number;
  /** Midpoint of the hands (for the fracture), when both are tracked. */
  mid: Vec3 | null;
}

export const initialGesture = (): GestureState => ({ mode: 'idle', hold: 0, out: 0, latched: false });

const inZone = (p: Vec3, z: GestureZone) =>
  p[0] >= z.min[0] && p[0] <= z.max[0] && p[1] >= z.min[1] && p[1] <= z.max[1] && p[2] >= z.min[2] && p[2] <= z.max[2];
const dist = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Advance the gesture by `dt` seconds. `dual` is whether the two futures are
 * currently open (merging is only possible then, splitting only when not).
 */
export function stepGesture(
  s: GestureState,
  left: HandSample,
  right: HandSample,
  dual: boolean,
  dt: number,
  zone: GestureZone = SPLIT_ZONE,
): GestureStep {
  const tracked = !!left.pos && !!right.pos;
  const mid: Vec3 | null = tracked
    ? [(left.pos![0] + right.pos![0]) / 2, (left.pos![1] + right.pos![1]) / 2, (left.pos![2] + right.pos![2]) / 2]
    : null;
  const d = tracked ? dist(left.pos!, right.pos!) : Infinity;
  const busy = left.busy || right.busy;
  const both = tracked && inZone(left.pos!, zone) && inZone(right.pos!, zone);
  const next: GestureState = { ...s };
  const idle = (event: GestureEvent): GestureStep => ({ state: { ...next, mode: 'idle', hold: 0, out: 0 }, event, progress: 0, mid });

  // Latch: after a split/merge, wait until the hands separate (or are lost).
  if (next.latched) {
    if (!tracked || d > GESTURE.release) next.latched = false;
    return idle(null);
  }

  switch (s.mode) {
    case 'idle': {
      if (!both || busy || d > GESTURE.together) return idle(null);
      next.mode = dual ? 'merging' : 'arming';
      next.hold = dt;
      return { state: next, event: null, progress: clamp01(next.hold / (dual ? GESTURE.mergeHold : GESTURE.armHold)), mid };
    }
    case 'arming': {
      if (dual || !both || busy || d > GESTURE.together * 1.25) return idle(null); // hysteresis
      next.hold = s.hold + dt;
      if (next.hold >= GESTURE.armHold) {
        next.mode = 'armed';
        next.out = 0;
        return { state: next, event: 'arm', progress: 0, mid };
      }
      return { state: next, event: null, progress: clamp01(next.hold / GESTURE.armHold), mid };
    }
    case 'armed': {
      if (busy || !tracked) return idle('cancel');
      next.out = both ? 0 : s.out + dt;
      if (next.out > GESTURE.grace) return idle('cancel');
      const progress = clamp01((d - GESTURE.together) / (GESTURE.apart - GESTURE.together));
      if (d >= GESTURE.apart && both) {
        next.latched = true;
        return { state: { ...next, mode: 'idle', hold: 0, out: 0 }, event: 'split', progress: 1, mid };
      }
      return { state: next, event: null, progress, mid };
    }
    case 'merging': {
      if (!dual || busy || !tracked || d > GESTURE.together * 1.25) return idle(null);
      next.hold = s.hold + dt;
      if (next.hold >= GESTURE.mergeHold) {
        next.latched = true;
        return { state: { ...next, mode: 'idle', hold: 0, out: 0 }, event: 'merge', progress: 1, mid };
      }
      return { state: next, event: null, progress: clamp01(next.hold / GESTURE.mergeHold), mid };
    }
  }
}
