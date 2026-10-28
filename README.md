# TerraCity — Shape Tomorrow

*Build a city with your hands. See its future before it happens.*

A seated, tabletop-scale mixed-reality game (WebXR, Meta Immersive Web SDK)
where players shape a sustainable coastal city with their hands.
Entry for the Meta VR Start Developer Competition 2026 (in development).

> Status: **Phase 0 (feasibility spike) complete** — see
> [docs/PHASE0_REPORT.md](docs/PHASE0_REPORT.md) and [docs/PROGRESS.md](docs/PROGRESS.md).
> Not yet tested on a physical Meta Quest headset.

## Run locally

Requires Node `>=20.19 <21 || >=22.12 <23 || >=24`.

```sh
npm install
npm run dev          # IWSDK dev server + managed browser with the IWER XR emulator
npm test             # simulation/rules unit tests (Vitest)
npm run test:e2e     # desktop mouse/keyboard browser tests (Playwright)
./scripts/xr-hand-grab-test.sh   # emulated hand pinch-grab check (needs `npm run dev`)
npm run build        # production build into dist/
```

## Controls (Phase 0)

| Action | Hands (XR) | Controller (XR) | Desktop |
|---|---|---|---|
| Move the homes | Pinch the homes, carry, release over a tile | Squeeze near the homes, carry, release | Click the homes' tile, then click a target tile |
| Fine move | — | — | Arrow keys while selected |
| Deselect | — | — | `Esc` |

Valid tiles glow green while carrying, blocked tiles red; the HUD explains why.

## Layout

```
src/config/       scenario + board constants
src/core/         input-agnostic GameState and shared signals
src/simulation/   pure placement rules
src/world/        deterministic terrain map + procedural low-poly meshes
src/interactions/ ECS placement system (hand / controller / ray / mouse / keyboard)
src/panel.ts      spatial HUD binding
tests/unit/       Vitest      tests/e2e/   Playwright
```
