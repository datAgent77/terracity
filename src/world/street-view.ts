/**
 * "Enter your city": the human-scale street view of a garden district (pure;
 * tests/unit/street-view.test.ts).
 *
 * The street scene is the SAME authored district as on the tabletop
 * (city-kit `district-L{layout}-era-{era}`), scaled from the 1:1000 tabletop to
 * 1:1, so the board's millimetres become metres. Fixed, comfortable viewpoints
 * are given in district-local metres (x east, z south = toward the street's
 * south side, as on the board); the scene is moved under the viewer — the
 * viewer is never moved artificially (teleport only, no smooth locomotion).
 */

/** Tabletop board metres -> street metres. */
export const STREET_SCALE = 1000;
/** Eye height above the ground the viewer stands on (metres). */
export const EYE_HEIGHT = 1.65;

export interface Viewpoint {
  name: string;
  /** Standing point (district-local metres at street scale). */
  x: number;
  z: number;
  /** Ground height there (top of sidewalk / lawn, metres). */
  ground: number;
  /** Point to face. */
  lookX: number;
  lookZ: number;
}

/** Sidewalk top and garden level of the authored district (mm on the board -> m). */
const SIDEWALK = 0.62;
const CARRIAGEWAY = 0.32;

export const VIEWPOINTS: readonly Viewpoint[] = [
  { name: 'Your street', x: -25, z: 1.7, ground: CARRIAGEWAY, lookX: 12, lookZ: -0.5 },
  { name: 'At the gate', x: 1.5, z: 3.9, ground: SIDEWALK, lookX: 0, lookZ: -12 },
  { name: 'Across the road', x: -1.5, z: -3.9, ground: SIDEWALK, lookX: 0, lookZ: 12 },
  { name: 'Street end', x: 25, z: -1.7, ground: CARRIAGEWAY, lookX: -12, lookZ: 0.5 },
];

/** Heading (radians about +y) that turns the viewpoint's look direction to -z. */
export function viewYaw(v: Viewpoint): number {
  return Math.atan2(v.lookX - v.x, -(v.lookZ - v.z));
}

export interface StreetPose {
  /** Scene root position (world metres): ground of the viewpoint under the eye. */
  y: number;
  /** Scene root yaw so the viewpoint faces world -z. */
  yaw: number;
  /** Offset of the district inside the root (district-local metres). */
  offsetX: number;
  offsetZ: number;
}

/**
 * Where to put the street scene so that the viewer, whose eye is at world
 * (0, eyeY, 0) facing -z, stands at viewpoint `v` with `EYE_HEIGHT` above it.
 */
export function streetPose(v: Viewpoint, eyeY: number): StreetPose {
  return { y: eyeY - EYE_HEIGHT - v.ground, yaw: viewYaw(v), offsetX: -v.x, offsetZ: -v.z };
}

export function nextViewpoint(i: number, step: number): number {
  const n = VIEWPOINTS.length;
  return (((i + step) % n) + n) % n;
}
