import { describe, expect, it } from 'vitest';
import { EYE_HEIGHT, nextViewpoint, streetPose, VIEWPOINTS, viewYaw } from '../../src/world/street-view';

/** Apply the scene pose to a district-local point -> world. */
const toWorld = (pose: ReturnType<typeof streetPose>, x: number, y: number, z: number) => {
  const lx = x + pose.offsetX;
  const lz = z + pose.offsetZ;
  // three.js rotation about +y by `yaw`.
  const c = Math.cos(pose.yaw);
  const s = Math.sin(pose.yaw);
  return { x: c * lx + s * lz, y: y + pose.y, z: -s * lx + c * lz };
};

describe('street view', () => {
  it('puts every viewpoint under the eye, at eye height above its ground', () => {
    for (const v of VIEWPOINTS) {
      const pose = streetPose(v, 1.2);
      const feet = toWorld(pose, v.x, v.ground, v.z);
      expect(feet.x).toBeCloseTo(0);
      expect(feet.z).toBeCloseTo(0);
      expect(1.2 - feet.y).toBeCloseTo(EYE_HEIGHT);
    }
  });

  it('turns each viewpoint to face what it looks at (world -z)', () => {
    for (const v of VIEWPOINTS) {
      const pose = streetPose(v, 1.6);
      const target = toWorld(pose, v.lookX, 0, v.lookZ);
      expect(Math.abs(target.x)).toBeLessThan(1e-9);
      expect(target.z).toBeLessThan(0);
    }
    expect(viewYaw({ name: '', x: 0, z: 0, ground: 0, lookX: 0, lookZ: -5 })).toBeCloseTo(0);
  });

  it('cycles through the viewpoints both ways', () => {
    expect(nextViewpoint(0, -1)).toBe(VIEWPOINTS.length - 1);
    expect(nextViewpoint(VIEWPOINTS.length - 1, 1)).toBe(0);
  });
});
