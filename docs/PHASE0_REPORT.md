# TerraCity — Phase 0 Feasibility Report

Date: 2026-10-27 · Machine: macOS (Darwin 24.6, Apple Silicon) · No Meta Quest available.

## Result

**Phase 0 works in emulation.** A coastal tabletop diorama renders in IWSDK, and one
residential neighbourhood can be picked up with an **emulated hand pinch**, carried,
and released onto a tile, where it snaps to the grid or is rejected and returns.
The same `GameState.place()` action is reached from hand, ray/mouse tap and keyboard.

## Stack (verified versions)

| Package | Version | Note |
|---|---|---|
| `@iwsdk/create` | 1.0.1 | npm `latest` tag is `1.1.0-rc.2` (a release candidate); 1.0.1 is the newest **stable** |
| `@iwsdk/core` / `cli` / `vite-plugin-dev` | 1.0.1 | runtime logs `Immersive Web SDK v1.0.1, Three.js r181, EliCS v3.4.2` |
| `three` | `npm:super-three@0.181.0` | the scaffold's alias, unchanged; app imports Three only via `@iwsdk/core` |
| `vite` 7, `typescript` 5, `vitest` 3.2.7, `@playwright/test` 1.64.1 | | |
| Node | 20.19.0 / 22.23.0 | both inside IWSDK's engine range |

## Working features

- **Terrain:** deterministic 14×10 grid (6 cm tiles, 0.84 × 0.60 m board at seated
  height, `y = 0.78`, `z = −0.5`): sea, beach, river, fertile farmland, plain, low hills
  (elevation 1–3), protected pine forest, existing white-stone town. All procedural
  low-poly — no third-party or map assets.
- **Residential neighbourhood** (3 terracotta-roofed houses on a pad) with `OneHandGrabbable`.
- **Hand path (XR):** `features.grabbing.useHandPinchForGrab = true` → pinch near the
  homes grabs them; while held the target tile highlights green/red and the HUD
  explains the consequence; release snaps to the tile or, if blocked, back to the
  previous tile.
- **Ray / mouse path:** tap the homes' tile to select (homes lift), tap another tile to
  move. **Keyboard:** arrows move the selection one tile, `Esc` deselects.
- **Rules (pure, tested):** no building on sea/river, beach (coastal setback),
  protected forest, existing town, occupied tiles or elevation ≥ 3; farmland and
  hills allowed with warnings.
- **Spatial HUD** (UIKitML, Horizon kit): title, live status line, Enter/Exit
  Mixed Reality buttons. Screen-space overlay on desktop, world panel in XR.

## Commands executed

```sh
npx @iwsdk/create@1.0.1 terracity --yes --target ar --grabbing --no-physics \
  --no-scene-understanding --no-environment-raycast --language ts --git --install \
  --skip-reference-warmup
npm i -D vitest@^3.2.4 @playwright/test@1.64.1
npm run typecheck                      # tsc --noEmit → 0 errors
npm test                               # vitest run
npx @iwsdk/cli dev up                  # managed Chromium + IWER (Meta Quest 3, living_room)
npx @iwsdk/cli xr enter                # emulated immersive-ar session
./scripts/xr-hand-grab-test.sh         # hand pinch → carry → release, then sea rejection
npx playwright test                    # desktop mouse/keyboard e2e
npm run build                          # vite production build
```

## Test results

**Unit (Vitest): 18 / 18 passed** — terrain determinism, coverage, all terrain types
present, sea/land layout, out-of-grid lookups, tile↔board coordinate round-trip,
per-terrain placement rules, farmland/hill warnings, slope limit, occupancy,
`GameState.place` move/reject/keep-position and event order.

**Desktop e2e (Playwright, Chromium 1280×800): 4 / 4 passed**
1. initial state — homes on plain tile (11,3)
2. mouse — click homes tile to select, click farmland (6,7) → moved, HUD mentions farmland
3. mouse — click sea → rejected, homes stay, HUD mentions water
4. keyboard — ArrowDown moves to (11,4); ArrowUp ×2 → second move into beach rejected; Esc deselects

**Production build:** succeeds (`dist/` 7.5 MB). Warning: main chunk 6.58 MB
(1.68 MB gzip) — to be code-split in Phase 3.

## Emulator results (IWER via `@iwsdk/cli`, `xr status` → `sessionActive: true`, `immersive-ar`, `hand-tracking`, `runtimeKind: emulated`)

Output of `scripts/xr-hand-grab-test.sh` (world positions, metres):

```
before:   {"worldPosition":[0.27,0.8,-0.59],"grabbed":false}
pinched:  {"worldPosition":[0.27,0.8,-0.59],"grabbed":true}
carried:  {"worldPosition":[-0.09,0.8,-0.35],"grabbed":true}
released: {"worldPosition":[-0.09,0.8,-0.35],"grabbed":false}    → tile (5,7) farmland
over sea: {"worldPosition":[0,0.83,-0.76],"grabbed":true}         HUD: "Blocked: Cannot build on water."
rejected: {"worldPosition":[-0.09,0.8,-0.35],"grabbed":false}     → snapped back
```

Evidence (`docs/evidence/`): `phase0-desktop.png`, `phase0-e2e-initial.png`,
`phase0-e2e-mouse-moved.png`, `phase0-xr-hand-carry.png` (HUD: "Release to build -
Uses fertile farmland."), `phase0-xr-hand-placed.png`, `phase0-xr-hand-over-sea.png`,
`phase0-xr-hand-rejected.png`.

## Problems found and fixed during the spike

1. **One `Handle` per entity.** `OneHandGrabbable` + `DistanceGrabbable` on the same
   entity: the first wins and sets `pointerEventsType = { deny: 'ray' }`, so the
   distance grab was silently ignored. Fix: near-grab only; ray/mouse use
   tap-to-select on the board (rays pass through the homes to the tile below).
2. **Pinch grabbed but object did not move** when the hand stayed close to the board.
   Root cause: `PokeInteractable` on the board — the hand's touch pointer near the
   surface starved the active grab pointer of move events. Fix: no poke on the board.
3. Glyphs `—` / `…` are missing from the bundled UI font (rendered as ■); HUD text is ASCII.
4. The homes are a world-level entity, not a child of the board, so the board's
   pointer listeners (which `stopPropagation`) cannot interfere.

## Unverified / not tested

- **No physical Meta Quest testing.** Real hand-tracking jitter, pinch reliability,
  comfort, reach, legibility and frame rate on device are unknown.
- **Controller squeeze grab: not working in the emulator.** With
  `set-input-mode controller`, controller-right at the homes and gamepad button 1
  (squeeze) = 1, `Grabbed` never qualified (tested at y = 0.80/0.81/0.83). Not yet
  diagnosed (grip-space offset vs. emulator button mapping). Hands are the primary
  path, so this does not block Phase 1, but it must be fixed or documented.
- Hand **ray** pinch-tap on tiles is wired through the same pointer-event path as the
  mouse (verified), but was not separately driven in the emulator. IWSDK CLI 1.0.1
  has no `xr run-sequence` / `list-targets` (those appear in 1.1.0-rc).
- Rotate/cancel placement, undo, and the five-structure palette are Phase 1 scope.

## Known blockers / decisions for the owner

- **Production build has no IWER:** a deployed build on a desktop browser without
  WebXR offers only the mouse/keyboard path. Decide whether to ship an
  emulator-enabled demo build for judges.
- The scaffold adds `@meta-quest/metavr` (Quest CLI) as a dev dependency; per its
  notice it collects usage data under the Meta SDK license. It is unused so far and
  can be removed with `npm uninstall @meta-quest/metavr`.
- `npm audit` reports 3 high-severity advisories in dev dependencies (not yet reviewed).
