# TerraCity — Simulation Assumptions

TerraCity is a **stylized game**, not a certified engineering, energy or urban
planning model. The numbers below are invented for clarity and balance. They are
deterministic (no randomness), and all of them live in
[`src/config/structures.ts`](src/config/structures.ts) and
[`src/config/balance.ts`](src/config/balance.ts). The rules are implemented in
[`src/simulation/`](src/simulation/) and covered by `tests/unit/`.

The region, *Costa Verde*, is fictional: a 14 × 10 tile coastal strip loosely
inspired by Mediterranean planning debates (coastal setbacks, farmland loss,
hillside sprawl, renewables siting).

## Starting conditions (2026)

| Quantity | Value | Meaning |
|---|---|---|
| Budget | 130 credits | Total infrastructure money for the whole plan ("M€", illustrative) |
| Population served | 12,000 | Residents of the existing town |
| Environmental health | 72 / 100 | Untouched region score |
| Renewable supply | 2 units | Existing small hydro plant on the river |
| Energy demand | 1 unit per 1,000 served residents | So the town starts at 12 units, 17 % renewable |

## Terrain

| Terrain | Buildable? |
|---|---|
| Sea, river | No (roads may **bridge** the river) |
| Beach | No — coastal setback |
| Protected pine forest | No |
| Existing town | No (already built) |
| Plain | Yes |
| Fertile farmland | Yes, with an environmental penalty |
| Hills (elevation 1–3) | Yes, with slope costs and limits |

## Structures

| | Cost | Slope cost / step | Max elevation | Residents | Energy | Environment | Extra on farmland |
|---|---|---|---|---|---|---|---|
| Homes | 12 | +6 | 2 | +4,000 (if connected) | — | −3 | −6 |
| Solar farm | 9 | +4 | 1 | — | +4 | −1 | −5 |
| Wind turbine | 14 | 0 | 3 | — | +5 (+2 on a ridge, elevation ≥ 2) | −2 | −1 |
| Park | 4 | 0 | 3 | — | — | +4 (+1 per adjacent homes) | −2 |
| Road | 2 | +2 | 2 | — | — | −1 | −1 |

Road on a river tile = bridge, **+6** cost.

## Rules

1. **Cost** = base cost + slope cost × hill elevation (+ bridge cost). Moving a
   structure re-prices it at the new tile; removing it refunds it (so undo is exact).
2. **Budget constraint:** a build or move is rejected if it would push the budget
   below zero.
3. **Road access:** homes only count toward population if they touch the town
   (orthogonally) or touch a road that is connected, road-to-road, to the town.
   Unconnected homes are shown with a red pad and listed as "unconnected".
4. **Energy:** demand = served residents ÷ 1,000. Renewable coverage =
   supply ÷ demand, rounded to a whole percent, capped at 100 %. Housing more
   people therefore *lowers* coverage unless renewables keep up.
5. **Environment:** 72 + every structure's effect + farmland penalties + park
   adjacency bonus − 1 for each wind turbine next to homes (noise); clamped to 0–100.
6. **Farmland lost:** count of farmland tiles built on (tracked for Phase 2 visuals).
7. Rotation is cosmetic (stored so a plan replays exactly).

## Future projections (2035, 2050)

The plan is treated as built in 2026. Switching the time control to 2035 or 2050
applies these explicit trends (`src/config/projection.ts`,
`src/simulation/projection.ts`). 2035 applies **half** of each 2026→2050 change,
2050 applies all of it.

| Trend | Rule | Why it matters |
|---|---|---|
| Housing demand | Grows linearly from 12,000 (2026) to **28,000** (2050) | People keep coming whether or not you planned homes |
| Unplanned sprawl | Demand − planned connected housing becomes sprawl; −1.5 env per 1,000; drawn on free land nearest the town, 2,000 people per tile | Under-housing shows up as grey sprawl and a worse environment |
| Electrification | Electricity per person +10 % by 2050 (sprawl residents count too) | A plan "just at 80 %" today drops below target |
| Park maturity | +2 env per park by 2050 (trees grow) | Green space pays off over time |
| Food imports | −1 env per built-over farmland tile by 2050 | Farmland loss has a delayed cost |
| Sea-level rise | Beaches flood visually; every structure on flat land next to beach/sea needs sea defences: −4 budget by 2050 | Coastal sites look cheap in 2026 |

Population (housed in planned, connected homes) and renewable *supply* do not
change over time; budget changes only through sea defences.

## 2050 targets — the challenge

The session lasts **7 minutes**. The plan is judged on its **2050 projection**:
population housed ≥ 28,000 · environment ≥ 60 · renewable coverage ≥ 80 % ·
budget left ≥ 0. Finishing early or running out of time both trigger the judgement.
Each missed target produces one concrete hint.

Reference plan that wins (tested in `tests/unit/projection.test.ts` and in the
browser e2e test): road (6,3) + bridge (7,3); homes at (6,2), (6,4), (2,4), (8,3);
wind turbines on the ridge at (10,8), (11,8), (12,8); parks at (9,3) and (1,4);
solar at (9,4) → 2050: 28,000 housed, environment 65, 88 % renewable, 1 credit left
(three coastal sites pay sea defences). Without the solar farm the same plan reaches
80 %+ in 2026 but falls below 80 % by 2050 — exactly the kind of insight the time
control is for. A do-nothing plan sprawls 16,000 people by 2050 and fails three targets.

## Plan comparison

"Save Plan A" snapshots the map; further edits form Plan B. "Compare A/B" projects
both to 2050 and shows, per metric, each plan's value, whether it meets the target,
and which plan is better, plus a headline ("Plan B meets 4 of 4 targets in 2050
(other: 1)"). Plan A is also kept in the browser's local storage when available.

## Not modelled (by design)

Traffic, water supply capacity, land prices, jobs, demographics, weather, grid
storage, real-world emissions factors, discounting, maintenance costs.
