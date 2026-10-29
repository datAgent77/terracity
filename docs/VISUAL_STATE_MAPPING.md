# Simulation -> visuals mapping (time travel)

Every visual change shown for 2035 / 2050 is computed by one pure function,
`futureVisualState()` in [`src/world/future-visual-state.ts`](../src/world/future-visual-state.ts),
from the projection of the current plan (`projectYear`, see
[SIMULATION_ASSUMPTIONS.md](../SIMULATION_ASSUMPTIONS.md)). `FutureSystem` only
animates toward that state (≈1.4 s ease, instant with *reduce motion*). Nothing
on the board is decided anywhere else.

| Simulation output (viewed year) | Visual parameter | What the player sees |
|---|---|---|
| `progress` (2026 = 0, 2035 = 0.5, 2050 = 1) | transition target | everything below eases over ~1.4 s |
| `sprawlTiles`, `sprawlResidents` | `sprawl[]` = projected tiles, `fill` = residents / 2,000 per tile, `buildings` = 2 + 5·fill | grey-beige informal blocks rise (staggered, nearest the town first) exactly on those tiles; crops/meadow decoration on them gives way |
| `environment` | `vigor` = (env − 30) / (72 − 30), clamped; `dryness` = (1 − vigor) · 0.7 | fields, meadows, forest and park trees tint toward dry ochre; at env ≥ 72 nothing is tinted |
| `floodRiskIds` (structures on low coast) | `floodRisk[]` with seaward directions | sea walls rise on the seaward edges; a calm pulsing orange outline marks each at-risk site (projection years only) |
| `progress` (stylised sea-level trend) | `seaRise` = progress | a turquoise sheet creeps onto each beach from its seaward edge: half the beach in 2035, all of it in 2050 (illustrative — not a flood depth) |
| `renewableCoverage` | `renewableActivity` = coverage / 100 | PV glass glow (emissive 0.04 → 0.34) and rotor speed (0.6 → 3.2 rad/s) |
| park maturity rule | `parkGrowth` = 1 + 0.6 · progress | park tree crowns grow |
| all four targets met | `balanced` | no extra decoration in V3 — a balanced year *looks* balanced only through the mappings above (no sprawl, vibrant vegetation, active renewables); celebration effects come in V5 and must use this flag |
| targets missed | `missed[]` | reserved for V5 problem highlights |

## Guarantees (unit-tested, `tests/unit/visual-state.test.ts`)

- 2026 never shows sprawl, sea rise, flood warnings or grown trees.
- Sprawl tiles equal the projection's tiles, and drawn density sums to the
  projected sprawl residents; more sprawl in 2050 than 2035.
- Vigour is monotonic in environment; **below the environment target the
  vegetation never reaches the "healthy" vigour** (`VIGOR_AT_TARGET`).
- Dryness never exceeds the restrained maximum (0.7).
- Flood markers equal the projection's at-risk ids, and walls face beach or sea.
- `balanced` is true only when `checkTargets` passes all four targets.

Browser checks (`tests/e2e/time-travel-visuals.spec.ts`) confirm the rendered
scene matches the state: visible sprawl groups = `sprawl.length`, walls/outlines
visible only in projection years and only for at-risk sites, displayed dryness
converges to the mapped dryness, and the transition is observably in progress
mid-way.

## End of session (`src/world/outcome-visual.ts`)

The judged 2050 projection (`checkTargets`) drives the end-of-session marks:
success → gold outlines on connected homes, parks, wind and solar + a short light
burst; failure → amber problem marks and teal opportunity marks **only for missed
targets** (see VISUAL_OVERHAUL_REPORT.md, V5). Unit-tested in
`tests/unit/outcome-visual.test.ts`; browser-checked in `tests/e2e/outcome.spec.ts`.
