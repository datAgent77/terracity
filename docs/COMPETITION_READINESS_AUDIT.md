# TerraCity — competition readiness audit

Branch `feature/competition` (from `feature/lookdev` → `feature/causality`; none
merged into `main` yet). Evidence labels: **code** (read in source), **unit**,
**desktop** (Chromium e2e), **IWER** (emulator), **Quest** (none — no headset).

## Architecture

| Layer | Files | Notes |
|---|---|---|
| Boot / renderer | `src/index.ts`, `iwsdk.config.json` (`xr.mode: "ar"`, hand tracking) | IWSDK 1.0.1 `World.create`; quality preset `src/config/quality.ts` |
| Planning state (authoritative) | `src/core/game-state.ts` (`GameState`: placements, undo/redo, budget checks) | One instance `game` in `src/core/session.ts` |
| Session / UI state | `src/core/session.ts` (signals: `viewYear`, `planA`, `futuresOpen`, `streetView`, `causalityOn`, `detailsOpen`, tutorial) | UI selection is separate from the plan |
| Commands | `src/core/commands.ts` | Every state change goes through here (desktop keys, panels, XR gestures) |
| Simulation (pure) | `src/simulation/metrics.ts` (2026), `projection.ts` (2035 / 2050), `land-budget.ts`, `causality.ts`, `compare.ts`, `placement.ts`; constants `src/config/balance.ts`, `src/config/projection.ts` | No randomness; no rendering imports |
| Visual state (pure) | `src/world/future-visual-state.ts` | Derives what to draw (sprawl, dryness, haze, tree loss…) from a projection only |
| Rendering systems | `src/world/*-system.ts` (`future-system`, `split-system`, `street-system`, `causality-system`, `time-dial-system`, `outcome-system`, `ambient-system`) | Read the plan + projection; never write the plan |
| Persistence | `src/core/persistence.ts` (`terracity.save.v2`, validated load) | |

## Findings by area

| Area | Implementation | Status |
|---|---|---|
| Simulation state ownership | `game.placements` is the only editable plan; `planA` is an immutable copy (`commands.savePlanA` copies each piece); projections are recomputed, never stored | OK (unit `game-state` isolation, new `temporal-integrity`) |
| Year projection | `projectYear(terrain, plan, year)` — linear `progress` 0 / 0.5 / 1; demand 12k→28k; shortfall = sprawl | OK, deterministic (unit). **Labels were misleading** — see below |
| Plan A / B | Internal tags: `'B'` = current map, `'A'` = saved snapshot, `'none'` = nobody plans | **Defect (UI)**: the editable map was shown as "Plan B (now)" whenever a plan had been saved (`panel-system.ts`, `futures.ts`, `compare.uikitml`, `street.uikitml`, status texts). Fixed in A |
| Causality | `src/simulation/causality.ts` ledger re-attributes every term of the model; sums exactly (unit, 42 plans × 3 years) | OK |
| XR input | `interactions/placement-system.ts` (pinch-grab pieces), `two-hand-gesture.ts` (split), `RayInteractable` panels / Mira / POI boards | IWER-verified only; **never on Quest** |
| Mira | `world/mira-dialogue.ts` (grounded lines), `child.ts`, `child-narrative.ts`, `street-system.ts` | OK (unit + desktop) |
| Desktop fallback | Mouse + keyboard on every action (`gameplay/flow-system.ts`); XR button only when `immersive-ar` is supported | OK (e2e `fallback` on the production build) |
| Performance | `scripts/visual/perf-audit.mjs` (IWER): tabletop ~250 draw calls / 270 k tris; two futures ~120 / 315 k; street ~150 / 40–90 k | Not measured on Quest. Look-dev added street shadows (unmeasured cost) |
| Tests | 26 unit files (204 tests), 16 e2e specs (38 tests), 3 IWER hand scripts | |

## The observed 2026 / 2035 / 2050 table — root causes

Reproduced with a plan of the same shape (one connected neighbourhood, much
clean power, budget almost spent): `tests/unit/temporal-integrity.test.ts`.

| Observation | Cause (code) | Verdict |
|---|---|---|
| Population 16,000 in every year | `YearMetrics.population` = people **housed in planned, connected homes** (`metrics.ts`); the plan is fixed after 2026, so capacity is fixed. Demand grows to 28,000 (`PROJECTION.housingDemand2050`); the rest become `sprawlResidents` (`projection.ts`) | Intended, **mislabelled** "Population". Now "Housed" + "28,000 want to live here: 16,000 in planned homes, 12,000 in unplanned sprawl" |
| Environment 36 → 28 → 14 | Explicit rules: −1.5 per 1,000 sprawl residents, −1 per lost farmland tile × progress, +2 per park × progress (`projection.ts`; ledger rules `sprawl-pressure`, `food-imports`, `park-maturity`) | Intended; fully attributed by the ledger |
| Budget 6 in every year | Construction is a one-time 2026 cost; only sea defences for coastal sites recur (`seaDefenceCost2050`) | Intended; now labelled "of 130, one-off" |
| Renewable 100 % in every year | Coverage = min(100, supply / demand); supply exceeded the growing demand every year | Intended, **hid the surplus**. Now "clean power X units for Y needed (surplus)" |
| Land 41 → 45 → 54 km², farmland 60 → 57 → 50 % | Each 2,000 sprawl residents take one free tile nearest the town (2.25 km²), often farmland (`sprawlTilesFor`, `land-budget.ts`) | Intended; tested that the change equals added sprawl tiles |
| Renderer year / scenario | HUD, futures and street all call `projectYear` with `viewYear` and the scenario's own plan | OK — no stale year found |

No arithmetic defect was found in the projection. The defects were in what the
UI said the numbers were.

**Rendering defect found while verifying**: the HUD line under the housing
figure (`m-sprawl`: homes not connected by road, people in unplanned sprawl)
was declared with empty text, so UIKit never created a text node and the
line never appeared — the one place that explained the flat "Population"
was invisible. Fixed (`public/ui/hud.uikitml`); evidence `docs/visual/ma-hud-2050.png`.

## Broken or incomplete (carried forward)

- Nothing verified on a physical Quest (input, comfort, frame rate).
- Year transitions animate the tabletop (GODMODE time travel) but sprawl
  appears per tile without a construction stage.
- The brief's "Reality Seam" (a movable boundary) does not exist: the split
  seam is fixed in the world and only used during the 0.8 s split animation.
- Two-futures view renders two full boards (~315 k triangles in IWER).
