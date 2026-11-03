# Temporal simulation — specification

Source of truth: `src/simulation/projection.ts` with constants in
`src/config/projection.ts` and `src/config/balance.ts`. Tests:
`tests/unit/temporal-integrity.test.ts`, `projection.test.ts`, `causality.test.ts`.

## State

| Concept | Where | Editable |
|---|---|---|
| Planning decisions (the plan) | `game.placements` (`core/game-state.ts`) | yes, in 2026 only |
| Saved plan (snapshot for comparison) | `planA` signal (`core/session.ts`), a deep copy | no (restore copies it back) |
| Baseline "if nobody plans" | the empty plan `[]` | no |
| Projection of a year | `projectYear(terrain, plan, year)` → `YearMetrics` | derived, never stored |
| What is drawn | `futureVisualState(terrain, plan, projection)` | derived |
| UI selection | `viewYear`, `futuresOpen`, `streetView` | UI only |

The terrain is generated deterministically (`generateTerrain`); there is no
random seed in the simulation. Rendering variation uses seeded `rng` keyed on
tile coordinates, so the same tile looks the same in every year and scenario.

## Rules (progress p = 0 / 0.5 / 1 for 2026 / 2035 / 2050)

| Quantity | Rule |
|---|---|
| Housed | 12,000 (town) + 4,000 per Homes tile connected by road. Fixed by the plan. |
| Demand | 12,000 + p × (28,000 − 12,000) |
| Unplanned sprawl | max(0, demand − housed), rounded to 100; one tile per 2,000 people, on free flat land nearest the town (same order every year, so 2035 tiles are kept in 2050) |
| Environment | 2026 value (structures, farmland, parks, wind noise) − 1.5 per 1,000 sprawl residents − p × 1 per farmland tile built on + p × 2 per park; clamped 0..100 |
| Budget left | 130 − one-time construction − p × 4 per structure on low coastal land (sea defences) |
| Renewable share | min(100, supply ÷ demand); demand = (housed + sprawl) / 1,000 × (1 + 0.1 p) |
| Land used / farmland kept | tiles under structures or sprawl × 2.25 km²; farmland tiles not covered |

## Invariants (tested)

- Same plan + year → identical projection, land budget and visual state;
  visiting years in any order does not change the result.
- Viewing never mutates the plan.
- 2026 projection = the plan's own metrics; no sprawl in 2026.
- Sprawl present in 2035 is at the same tiles in 2050; sprawl never covers a
  planned structure.
- Sprawl, land used and tree loss never decrease over time; farmland kept never
  increases; housed is constant.
- All metrics are finite and within range.
- The causality ledger sums exactly to housed, environment and budget in every year.

## How the UI states it

- HUD: "Housed" (not "Population"), and below it "N want to live here: X in
  planned homes, Y in unplanned sprawl" and "clean power S units for D needed
  (surplus)" (`explainYear`).
- Mode line (`ui/view-label.ts`): scenario, year, "editing" / "read only" /
  "projection", e.g. "Your plan - 2050 projection - read only".
- Scenario names: "Your plan" (editable, always Future A), "Saved plan",
  "If nobody plans". The editable plan is never called "Plan B".
