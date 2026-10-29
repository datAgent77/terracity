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
| `environment` | `vigor` = (env − 30) / (72 − 30), clamped; `dryness` = (1 − vigor) · 0.92 | fields, meadows, forest and park trees tint toward parched ochre; at env ≥ 72 nothing is tinted |
| `environment` below the 60 target | `decline` = ((vigor@target − vigor) / vigor@target)^0.6; `haze` = progress · decline; `treeLoss` = progress · decline · 0.75 | brown smog clouds over the region, sun dimmed up to 45 % and warmer, sea and river murky; a stable share of trees, orchards, crops and shrubs disappears; burn scars (charred ground + snag) where woodland trees were lost on forest and hill tiles |
| `environment` at or above the target | `greening` = progress · (0.35 + 0.65 · (vigor − vigor@target) / (1 − vigor@target)) | young woodland and wildflowers return to free plains and hills (never on farmland, built or sprawl tiles), land a touch lusher, bird flocks circle (count ∝ greening) |
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
- Dryness never exceeds its maximum (0.92); tree loss never exceeds 0.75.
- Decline (haze, tree loss) appears only when the projected environment misses
  its target, recovery (greening) only when it meets it — never both, and
  neither in 2026.
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

## Garden-district architecture era (`homeEra`)

| Displayed progress | Era | Look |
|---|---|---|
| < 0.25 (2026) | 0 | traditional Mediterranean houses, terracotta roofs, lawns |
| 0.25 – 0.75 (2035) | 1 | eco-villas, flat roofs with rooftop PV, timber shading, cycle lane |
| ≥ 0.75 (2050) | 2 | integrated solar roofs, battery, EV charger, xeric gardens |

Source: `eraForProgress(progress)` in `future-visual-state.ts` (unit-tested). Purely
illustrative technology adoption: rooftop solar is not counted in renewable coverage.
See [HORIZONTAL_URBANISM_DESIGN.md](HORIZONTAL_URBANISM_DESIGN.md).

## Town era and the time wave

The existing town follows the same era switch as the garden districts
(`eraForProgress`): 2035 adds rooftop PV on part of the old town, a solar
pergola and bike-share on the plaza, PV on the school; 2050 adds solar tiles on
half the roofs, green roof terraces and school roof, and matured trees. Like the
villas this is illustrative technology adoption: it is not counted in renewable
coverage and it is the same in every plan.

Transitions take 2.2 s; while they unfold a faint ring ("time wave") sweeps out
from the town across the board. It is a presentation cue only and is skipped
with reduced motion.
