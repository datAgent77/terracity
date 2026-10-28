/**
 * Hover feedback for near (pinch / squeeze) interaction: the piece closest to
 * a hand's index tip or grip, within reach, grows slightly so the player knows
 * what a pinch will pick up. Only runs in an immersive session.
 */
import { createSystem, Entity, Grabbed, Object3D, Vector3, VisibilityState } from '@iwsdk/core';
import { Placeable } from './placeable-component.js';

const REACH = 0.065; // metres: matches where a pinch starts a near grab
const GROW = 1.12;

export class HoverSystem extends createSystem({
  pieces: { required: [Placeable], excluded: [Grabbed] },
}) {
  private probes: Object3D[] = [];
  private hand = new Vector3();
  private piece = new Vector3();
  private current: Entity | null = null;

  init(): void {
    const s = this.world.playerSpaceEntities;
    this.probes = [s.indexTipSpaces.left, s.indexTipSpaces.right, s.gripSpaces.left, s.gripSpaces.right]
      .map((e) => e.object3D!)
      .filter(Boolean);
  }

  update(): void {
    let best: Entity | null = null;
    if (this.world.visibilityState.peek() !== VisibilityState.NonImmersive) {
      let bestD = REACH;
      for (const probe of this.probes) {
        probe.getWorldPosition(this.hand);
        if (this.hand.lengthSq() === 0) continue; // untracked
        for (const e of this.queries.pieces.entities) {
          const obj = e.object3D!;
          if (!obj.visible) continue;
          obj.getWorldPosition(this.piece);
          this.piece.y += 0.01; // aim at the piece body, not its base
          const d = this.piece.distanceTo(this.hand);
          if (d < bestD) {
            bestD = d;
            best = e;
          }
        }
      }
    }
    if (best === this.current) return;
    this.setScale(this.current, 1);
    this.setScale(best, GROW);
    this.current = best;
  }

  private setScale(e: Entity | null, k: number): void {
    const obj = e?.object3D;
    if (!obj) return;
    obj.scale.setScalar(k);
  }
}
