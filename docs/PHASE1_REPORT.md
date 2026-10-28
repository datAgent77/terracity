# TerraCity — Phase 1 Report (gameplay foundation)

Date: 2026-10-27 · Emulation only (IWER, Meta Quest 3 profile) — **no physical headset testing.**

## Scope delivered

| Requirement | Status | Where |
|---|---|---|
| Terrain (coast, farmland, hills, protected areas) | ✅ (+ river, beach, existing town) | `src/world/terrain-map.ts` |
| Five structures: homes, solar, wind, park, road | ✅ procedural low-poly, wind rotors animate, roads auto-connect | `src/world/structure-models.ts` |
| Rules engine: cost, land, population, energy, environment, terrain limits | ✅ pure + deterministic | `src/config/structures.ts`, `src/simulation/` |
| Budget | ✅ 120 credits, slope + bridge surcharges, hard constraint | `src/simulation/placement.ts` |
| Placement restrictions | ✅ water/beach/protected/town/occupied/steepness/budget | same |
| Road access | ✅ homes count only when connected to the town; roads may bridge the river | `servedHomes()` |
| Four metrics on the HUD vs. 2050 targets | ✅ green when met, amber otherwise | `src/panel.ts` |
| Undo / redo | ✅ immutable plan snapshots; restart | `src/core/game-state.ts` |
| Cause → consequence line after each action | ✅ metric deltas + rule notes | `describeDelta()` |
| `SIMULATION_ASSUMPTIONS.md` | ✅ | repo root |

Not in Phase 1 (Phase 2 scope): 2035/2050 projection, Plan A/B comparison, win/lose
flow, onboarding, animated consequences.

## Input paths (all end in the same GameState actions)

| Action | Hands | Controller | Mouse / keyboard |
|---|---|---|---|
| Build | pinch tray token → release on tile | squeeze → release | tray slot / `1`-`5`, then tile |
| Move | pinch placed → release | squeeze → release | select tile → target tile / arrows |
| Rotate | wrist twist while held (90° snap) | twist | `R` / Rotate button |
| Remove / cancel | release off the board | same | `Delete` / Remove button, `Esc` |
| Undo, redo, restart | Plan pad (ray or poke) | ray + trigger | `Z` `Y` / buttons |

## Verification

```sh
npm run typecheck          # 0 errors
npm test                   # Vitest: 69 / 69 passed
npx playwright test        # desktop e2e: 7 / 7 passed
./scripts/xr-phase1-test.sh  # IWER, see output below
npm run build              # succeeds
```

**Unit tests (69):** terrain restrictions for every structure × terrain, river
bridges, slope limits and surcharges, wind-ridge bonus, farmland penalties
(homes and solar), budget rejection and exhaustion, move re-pricing, road
connectivity incl. bridge gap, renewable supply/coverage/cap/dilution, park
adjacency, wind noise, determinism, cause→consequence text, undo-all/redo-all
equality, every intermediate state vs. replay, redo cleared by new action,
reset, and **balance**: a reference plan meets all 2050 targets; a naive plan does not.

**Desktop e2e (7):** baseline metrics; tray-click + tile builds homes
(population 16,000, budget 108); isolated homes become served after road + bridge
chain; water and steep-slope rejections cost nothing; wind ridge coverage;
keyboard select/rotate/move/delete; undo/redo by keyboard **and** by clicking the
Plan pad buttons, with exact plan/metric restoration; restart.

**IWER emulator** (`xr status`: `sessionActive: true`, `immersive-ar`, `hand-tracking`, `runtimeKind: emulated`):

```
== 1. tray Homes -> tile (6,4)
pinched: {"pos":[-0.17,0.78,-0.14],"yawDeg":0,"grabbed":true}
released: {"pos":[-0.03,0.8,-0.53],"yawDeg":0,"grabbed":false}
placeables now: 17 residential-1 ... 22 tray-residential        (tray refilled)
== 2. tray Wind -> twist 90deg -> ridge
carried+twisted: {"pos":[0.395,0.826,-0.303],"yawDeg":90,"grabbed":true}
released: {"pos":[0.39,0.836,-0.29],"yawDeg":90,"grabbed":false}   (tile 13,8)
== 3. grab placed homes, drop off the board -> remove
placeables after drop: ... (residential-1 gone)
== 4. controller ray -> Undo button
placeables after undo: 17 residential-1 ...                      (restored)
== 5. controller squeeze: Park token -> tile (9,3)
squeezed: {"pos":[0.085,0.78,-0.14],"yawDeg":0,"grabbed":true}
released: {"pos":[0.15,0.8,-0.59],"yawDeg":0,"grabbed":false}
placeables: ... 20 park-3 ...
```

Evidence: `docs/evidence/phase1-*.png` (desktop baseline, roads + bridge,
XR carry, wind placed, drop-off-board, after undo, controller park).

## Issues found and fixed

- **River split the map:** east-bank homes could never connect to the town. Roads
  may now bridge the river (+6 cost) — found while writing connectivity tests.
- **Debug UI positions were desktop-only:** ScreenSpace panels move to their world
  transform in XR; button positions are now re-logged per visibility state.
- **Controller squeeze "not working" (Phase 0)** was a test-positioning error:
  the emulated controller must be within ~1-2 cm of the object.

## Known limitations / open items

- Physical Quest hand tracking is untested (pinch reliability, wrist-twist rotation
  comfort, poke on the Plan pad, legibility of tray labels at arm's length).
- **Hand poke** on the Plan pad and **hand ray** taps are wired through the same
  pointer events as the verified controller ray and mouse, but not separately
  driven in the emulator (CLI 1.0.1 has no scripted poke).
- Balance numbers are first-pass; Phase 2 will tune them alongside the projections.
- Main JS chunk still 6.5 MB (Phase 3).
