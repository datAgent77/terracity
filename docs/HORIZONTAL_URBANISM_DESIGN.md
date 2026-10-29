# TerraCity — Horizontal urbanism design (2026–2050)

TerraCity's future is a **low-rise, garden-oriented Mediterranean community**:
detached homes with private gardens, preserved farmland, green corridors and one
compact, walkable centre. There are no towers and no scattered high-rise
development. This document records the architectural rules, parcel and scale
assumptions, zoning, visual assets and — separately — the simulation changes.

## 1. What changed, and where (visual vs simulation)

| Change | Kind | Files | Tests |
|---|---|---|---|
| Homes tile = garden district of detached villas (3 eras) | visual | `src/world/villas.ts`, `structure-models.ts` | browser shots; era mapping unit tests |
| Compact town centre (plaza, 3–4 storey mixed-use, civic) | visual | `villas.ts`, `board-mesh.ts` | browser shots |
| Tree-lined streets (district streets, road tiles) | visual | `villas.ts`, `structure-models.ts` | browser shots |
| Unplanned sprawl drawn as scattered 1–2 storey houses | visual | `houses.ts` | visual-state tests (unchanged rules) |
| 2026 → 2035 → 2050 villa evolution | visual (mapping) | `future-visual-state.ts` (`eraForProgress`), `future-system.ts` | `visual-state.test.ts` |
| **Homes not allowed on steep hills (elevation 2)** | **simulation (zoning)** | `config/structures.ts`, `simulation/placement.ts` | `placement.test.ts`, `game-state.test.ts` updated |
| Land budget (land, farmland kept, access, services, parcels) | informational, no scoring | `simulation/land-budget.ts`, HUD line | `land-budget.test.ts` |

Unchanged: housing capacity per homes tile (4,000), sprawl rules, costs (other
than the zoning above), targets and the win condition.

## 2. Scale and parcel assumptions (illustrative)

| Assumption | Value | Note |
|---|---|---|
| One board tile | 1.5 km × 1.5 km = **2.25 km²** | the 14 × 10 board ≈ a 21 × 15 km coastal region |
| Household size | 2.8 persons | Mediterranean average order of magnitude |
| Preferred villa parcel | **1,250 m²** | within the 1,000–1,500 m² garden-district target |
| Streets, paths, parks, services | +20 % of parcel land | |
| Homes tile capacity (unchanged) | 4,000 residents ≈ 1,430 villas | needs 1,430 × 1,250 m² × 1.2 ≈ **2.14 km² ≤ 2.25 km²** — the preferred parcels fit |
| Unplanned sprawl (unchanged) | 2,000 residents per tile | half the efficiency of a planned district |

A villa model on the board stands for a few hundred real homes: the diorama is
symbolic, the parcel arithmetic above is what the land budget uses.

**Can the 2050 goal be met with villas?** 28,000 − 12,000 = 16,000 new residents →
**4 garden districts**. Tiles suitable for homes outside farmland, protected land
and steep hills: **25** (19 plain + 6 gentle slopes) → feasible without touching
farmland (`goalLandCheck`, unit-tested). Smaller lots or compact low-rise housing
are therefore **not** needed for the goal; they remain documented alternatives,
not implemented tools.

## 3. Zoning

| Zone | Height | Uses | In the game |
|---|---|---|---|
| Garden districts | 1–2 storeys | detached villas, private gardens, local street, cycle lane (2035+) | the Homes tool |
| Neighbourhood amenities | 1–2 storeys | parks, playgrounds, paths | the Park tool |
| Main centre | 3–4 storeys | plaza, bell tower, market, mixed-use blocks with arcades, school/clinic | the existing town (fixed) |
| Farmland | — | crops, orchards; building allowed but penalised and flagged | fields |
| Protected forest, beaches, river | — | not buildable | forest, coast, river |
| Steep hills (elevation 2–3) | — | **no homes** (erosion, wildfire, drainage, emergency access); wind and parks allowed | ridge |
| Gentle hills (elevation 1) | 1–2 storeys | homes with a slope surcharge | hills |

No scattered high-rise anywhere; the town centre is the only place with more than
two storeys. Unplanned sprawl is drawn as scattered 1–2 storey houses — low-rise but
land-hungry, without streets, gardens or trees.

## 4. Architecture by era (illustrative technology adoption)

| Era | Look | Systems shown |
|---|---|---|
| 2026 | traditional Mediterranean houses: stucco, terracotta hip roofs, small windows with shutters, lawns | — |
| 2035 | eco-villas: flat roofs with parapets, rooftop PV on most homes, large glazing with timber brise-soleil, pergolas, cycle lane | rooftop solar, passive shading |
| 2050 | solar-roofed family homes: integrated PV roofs, stone/stucco walls, xeric gardens with olive and lavender | home battery, EV charger, rain cistern, drought-tolerant planting |

The era follows the viewed year (`eraForProgress`: switches mid-transition).
**Rooftop solar is not counted in renewable coverage** — coverage still comes only
from solar farms and wind (a conservative, explicit choice), so the visuals never
make a plan look greener than its numbers.

## 5. Land budget shown to the player

The HUD shows, for the viewed year: land used (km² under structures and sprawl),
farmland kept (%), and the share of homes near services (within 3 tiles of the
town). `landBudget()` also reports villas represented, parcel fit, road access and
infrastructure spend. None of these change scoring; they expose the trade-offs:

- spacious villas use land — four districts take ~9 km²;
- building on farmland or leaving people to sprawl costs farmland;
- far-flung districts need roads (cost) and sit beyond the centre's services.

## 6. Zoning change: impact

Homes on steep hills (elevation 2) were allowed with a slope surcharge; they are now
rejected with "Steep hillside: erosion and wildfire risk".

- Homes-suitable land: 66 → **55** tiles in total; 36 → **25** outside farmland.
- The reference winning plan is unaffected (no homes on hills).
- The 28,000 goal stays feasible on non-farmland land (4 districts needed, 25 tiles).
- Tests updated: `placement.test.ts` (elevation rule and message),
  `game-state.test.ts` (moving homes now tested on a gentle hill).

## 7. Verification (this branch)

- Unit tests: 122 / 122 (incl. new `land-budget.test.ts`, era mapping, hillside rule).
- Playwright e2e: 25 passed, 2 skipped (profiling specs, env-gated).
- IWER hand scripts `scripts/xr-phase{1,2,3}-test.sh`: all exit 0.
- `npm run build`: OK.
- Evidence: `docs/visual/hu-*` (desktop, XR, time travel, outcome) and
  `hu-district-{2026,2035,2050}.png` / `hu-district-eras.png` (XR lean-in on one
  garden district, sprawl and the town centre); compare with `final-*` (before).

Render cost (desktop Chromium + IWER, **not a Quest measurement**), same reference plan:

| Scene | Before (V5) | Horizontal urbanism |
|---|---|---|
| Desktop full plan 2050 — calls / triangles | 115 / 32.9k | 118 / 39.9k |
| IWER stereo 2026 — calls / triangles | 276 / 88k | 286 / 96k |

Each district is still merged per era (one draw call per visible era); triangles
rose ~9 % for the villas, gardens and street trees. Quest frame rate is unverified.
