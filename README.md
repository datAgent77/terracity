# TerraCity — Shape Tomorrow

*Build a city with your hands. See its future before it happens.*

A seated, tabletop-scale mixed-reality game (WebXR, Meta Immersive Web SDK)
where players shape a sustainable coastal city with their hands.
Entry for the Meta VR Start Developer Competition 2026 (Gaming · New Experience).

**Play:** https://datagent77.github.io/terracity/ — open in the Meta Quest Browser
and tap *Enter Mixed Reality* (desktop browsers get a mouse/keyboard fallback).
Judges: see [docs/submission/TESTING.md](docs/submission/TESTING.md).

> **Not tested on a physical Meta Quest headset** — all XR testing used Meta's
> IWER emulator. See [known limitations](docs/submission/KNOWN_LIMITATIONS.md).

> Status: **submission build** — see [docs/PROGRESS.md](docs/PROGRESS.md)
> and the per-phase reports in `docs/`.
> Third-party notices: [ATTRIBUTION.md](ATTRIBUTION.md) · License: [MIT](LICENSE)
>
> Submission docs: [testing](docs/submission/TESTING.md) ·
> [hand interactions](docs/submission/HAND_INTERACTIONS.md) ·
> [architecture](docs/submission/ARCHITECTURE.md) ·
> [test results](docs/submission/TEST_RESULTS.md) ·
> [known limitations](docs/submission/KNOWN_LIMITATIONS.md)

## How it plays

1. **Start** — a 7-minute session to plan Costa Verde for 2050.
2. **Build** — pinch homes, solar, wind, parks and roads from the tray onto the map.
   Every change pulses the affected tiles and the four metrics animate.
3. **Travel through time** — tap **2035** or **2050**: unplanned sprawl spreads,
   the sea floods the beaches, parks grow, the land dries as the environment
   declines, and the HUD explains why.
4. **Compare futures** — **Save Plan A**, change the map (Plan B), **Compare A/B**:
   two 2050 miniatures side by side plus a one-line verdict.
5. **Finish** — the 2050 projection is judged against the targets; replay any time.

## Run locally

Requires Node `>=20.19 <21 || >=22.12 <23 || >=24`.

```sh
npm install
npm run dev          # IWSDK dev server + managed browser with the IWER XR emulator
npm test             # simulation/rules unit tests (Vitest)
npm run test:e2e     # desktop mouse/keyboard browser tests (Playwright)
./scripts/xr-phase1-test.sh      # emulated hand + controller building checks (needs `npm run dev`)
./scripts/xr-phase2-test.sh      # emulated hands: start, time travel, read-only future, finish
./scripts/xr-phase3-test.sh      # emulated hands: tips, hover, larger text, skip tips
node scripts/video/record.mjs    # records the demo in the IWER emulator (needs `npm run dev`)
node scripts/video/assemble.mjs  # -> video/terracity-silent.mp4
npm run build        # production build into dist/
```

## Controls

| Action | Hands (XR, primary) | Controller (XR) | Desktop |
|---|---|---|---|
| Build | Pinch a structure in the tray, carry, release over a tile | Squeeze near the tray token, carry, release | Click a tray slot (or press `1`-`5`), click a tile |
| Move | Pinch a placed structure, carry, release | Squeeze, carry, release | Click its tile, then click an empty tile (or arrow keys) |
| Rotate | Twist the wrist while holding (snaps to 90°) | Twist while holding | Select, then `R` or **Rotate** |
| Remove | Release it off the board | Release off the board | Select, then `Delete` or **Remove** |
| Cancel a build | Release the carried token off the board | same | `Esc` |
| Undo / Redo | Ray or poke **Undo** / **Redo** on the Plan pad | Ray + trigger | `Z` / `Y` or the buttons |
| Clear the map | **Clear map** on the Plan pad | same | same |
| Change year | Ray/poke **2026 / 2035 / 2050** | ray + trigger | `T` cycles |
| Save / restore Plan A | **Save Plan A** / **Restore A** | same | `S` |
| Compare A/B | **Compare A/B** | same | `C` |
| Pause / finish | **Pause**, **Finish plan** | same | `P` / `F` |
| Start / play again | **Start** / **Play again** on the card | same | `Enter` |
| Tips on/off, larger text, sound | HUD chips | same | `H`, `L`, `M` |

While carrying, the target tile glows green (valid) or red (blocked) and the HUD
shows the cost and consequences; after each change the HUD shows the effect,
e.g. `Homes built on farmland (Uses fertile farmland): +4,000 residents, -9 env, -4% renewable, -12 budget.`

Rules and numbers: [SIMULATION_ASSUMPTIONS.md](SIMULATION_ASSUMPTIONS.md).

## Layout

```
src/config/       scenario, structure table, balance constants
src/core/         GameState (undo/redo), shared commands and signals
src/simulation/   pure placement rules, metrics, 2035/2050 projection, A/B comparison
src/world/        terrain, procedural meshes, future visuals, feedback, ambient, mini boards
src/audio/        synthesised sound effects
src/interactions/ ECS placement system (hand / controller / ray / mouse / keyboard)
src/gameplay/     challenge rules (timer, judgement, hints) + flow system
src/ui/           spatial UI binding (HUD, Plan pad, tray, time, card, comparison)
tests/unit/       Vitest      tests/e2e/   Playwright
```
