# Hand interactions

TerraCity is designed for **seated, hands-only** play inside a ~60 cm radius
("airplane seat test"). Controllers are optional and mirror the hand actions.

| Player intent | Hands | Controller | IWSDK primitive |
|---|---|---|---|
| Pick up a piece | Pinch near it (the piece grows slightly when in reach) | Squeeze near it | `OneHandGrabbable`, `GrabSystem.useHandPinchForGrab = true` |
| Place | Release over a tile (green / red + X preview) | Release squeeze | Grab release → `GameState.add/move` |
| Rotate | Twist the wrist while holding (snaps to 90°) | Twist | Yaw-only grab rotation |
| Remove / cancel | Release off the board | same | — |
| Press UI | Point + pinch at arm's length, or fingertip touch | Ray + trigger | `RayInteractable`, `PokeInteractable` on UIKitML panels |
| Change year, save/compare plans, undo, pause, finish | UI buttons | same | UIKitML panels |

Layout (seated eye ≈ 1.2 m): board at 0.78 m, 0.5 m ahead; tray along the near
edge; HUD and Plan pad ±30° from the gaze centre; year buttons centred beyond the
board; intro/result card centred — all inside a comfortable field of view.

Design choices that came out of emulator testing:

- The terrain board has **no** poke target: a fingertip near the surface would win
  the hand's pointer arbitration and starve an active pinch-grab of movement.
- Near grabs and ray grabs cannot share one entity in IWSDK 1.0.1, so pieces use
  near grabs only; rays and mouse use **tap the tile to select, tap a tile to move**.
- A hand closer than ~25 cm to a panel uses the fingertip poke pointer instead of
  the ray.

**Verification status:** hand pinch-grab, carry, wrist rotation, drop-off removal,
hand-ray button presses, hover feedback and read-only future views are verified in
the IWER emulator by `scripts/xr-phase{1,2,3}-test.sh`. **Fingertip poke and real
hand-tracking quality are not verified** (no headset).
