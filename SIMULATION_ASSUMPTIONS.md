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
| Budget | 120 credits | Total infrastructure money for the whole plan ("M€", illustrative) |
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

## 2050 targets (challenge, wired up in Phase 2)

Population ≥ 28,000 · Environment ≥ 60 · Renewable ≥ 80 % · Budget ≥ 0.

A reference plan that meets all four (tested in `tests/unit/metrics.test.ts`):
roads (6,3) + bridge (7,3); homes at (6,2), (6,4), (2,4), (8,3); wind turbines on
the ridge at (10,8), (11,8), (12,8); parks at (9,3) and (1,4) → 28,000 residents,
environment 62, 82 % renewable, 12 credits left. A "naive" plan (homes on farmland,
solar only) reaches the population but fails environment and renewables.

## Not modelled (by design)

Traffic, water supply capacity, land prices, jobs, demographics, weather, grid
storage, real-world emissions factors. Future-year projections (2035/2050) arrive
in Phase 2 and will be documented here with their explicit growth assumptions.
