# TerraCity — Shape Tomorrow

*Build a city with your hands. See its future before it happens.*

A seated, tabletop-scale mixed-reality game (WebXR, Meta Immersive Web SDK)
where players shape a sustainable coastal city with their hands.
Entry for the Meta VR Start Developer Competition 2026 (in development).

> Status: **Phase 1 (gameplay foundation) complete** — see
> [docs/PHASE1_REPORT.md](docs/PHASE1_REPORT.md) and [docs/PROGRESS.md](docs/PROGRESS.md).
> Not yet tested on a physical Meta Quest headset.

## Run locally

Requires Node `>=20.19 <21 || >=22.12 <23 || >=24`.

```sh
npm install
npm run dev          # IWSDK dev server + managed browser with the IWER XR emulator
npm test             # simulation/rules unit tests (Vitest)
npm run test:e2e     # desktop mouse/keyboard browser tests (Playwright)
./scripts/xr-phase1-test.sh      # emulated hand + controller checks (needs `npm run dev`)
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
| Restart | **Restart** on the Plan pad | same | same |

While carrying, the target tile glows green (valid) or red (blocked) and the HUD
shows the cost and consequences; after each change the HUD shows the effect,
e.g. `Homes built on farmland (Uses fertile farmland): +4,000 residents, -9 env, -4% renewable, -12 budget.`

Rules and numbers: [SIMULATION_ASSUMPTIONS.md](SIMULATION_ASSUMPTIONS.md).

## Layout

```
src/config/       scenario, structure table, balance constants
src/core/         GameState (undo/redo), shared commands and signals
src/simulation/   pure placement rules and metrics
src/world/        deterministic terrain map + procedural low-poly meshes
src/interactions/ ECS placement system (hand / controller / ray / mouse / keyboard)
src/panel.ts      spatial UI binding (HUD metrics, Plan pad, tray labels)
tests/unit/       Vitest      tests/e2e/   Playwright
```
