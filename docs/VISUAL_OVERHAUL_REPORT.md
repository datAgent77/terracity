# TerraCity — Premium Visual Overhaul (branch `feature/premium-visual-overhaul`)

Status: **V1, V2 and V3 complete and verified. V4–V5 not started** (phase-gated). All screenshots below are real captures of
the running app — desktop Chromium, or Meta's IWER emulator (Quest 3 profile).
**No physical headset was used.**

## V1 — Visual baseline

- Rendering pipeline: IWSDK 1.0.1 / Three r181, one `PlacementSystem` builds the
  board (`src/world/board-mesh.ts`), structures come from
  `src/world/structure-models.ts`, time-travel visuals from `future-system.ts`,
  lighting from `src/index.ts` (+ IBL gradient in the scene JSON) and
  `ambient-system.ts` (shadows, sky, water shimmer, boats).
- Tests at start: 91 / 91 unit, 20 / 20 e2e (dev).
- Capture tools added (repeatable):
  `VISUAL_TAG=<tag> npx playwright test tests/e2e/visual.spec.ts` (desktop, same
  plan and steps every time) and `TAG=<tag> node scripts/visual/xr-shots.mjs`
  (IWER, seated eye at (0, 1.2, 0.08); close-up and detail poses).
- Baseline images: `docs/visual/before-*.png`, stats: `docs/visual/before-stats.txt`.

## V2 — World and assets (what changed)

| Area | Before | After |
|---|---|---|
| Base | flat brown slab | layered earth base in a wooden frame |
| Terrain | gapped colour blocks | seamless tiles: coloured caps over earth-cut sides (terraced look at elevation changes), deterministic patchwork tint |
| Sea | single flat turquoise sheet | depth-graded sea floor + vertex-coloured water (turquoise shallows → deep blue), foam line along beaches, shore rocks |
| Farmland | two alternating greens | cultivated rows (wheat, barley, vegetables, lavender) and olive orchards, per tile |
| Plains | flat green | grass tufts, wild flowers, shrubs |
| Hills | stepped olive blocks | dry-stone terrace walls on steeper tiles, shrubs, cypresses, rocks |
| Protected forest | 2 identical cone pines / tile | mixed pines, round trees and cypresses, varied height/rotation, clusters and clearings, undergrowth |
| Old town | 3-box clusters | Mediterranean homes + a paved square with a bell tower |
| Homes | 3 white boxes + cone roofs | **5 layouts** (courtyard, terrace row, villa with pool, hillside lane, L-house): plaster walls, terracotta hip roofs or flat roof terraces with pergolas, windows with shutters, doors, balconies, gardens, trees, flowers |
| Solar | 6 flat panels | two rows of tilted arrays on steel frames, reflective PV glass, gravel bed, inverter cabin |
| Wind | box blades | tapered tower, foundation, nacelle, hub, three tapered blades with red tips (slow rotation kept) |
| Park | pad + 4 spheres | lawns, curving gravel paths, round plaza with fountain, flower beds, bench, lamp, trees + cypress |
| Road | grey plates | asphalt with kerbs/sidewalks, dashed markings, flush joins (same connectivity) |
| Light | 0.9 neutral key | warm 1.15 key (#ffe6c4), adjusted sky/ground gradient |

**Determinism:** all variation comes from `src/world/rand.ts` seeded by tile
coordinates or placement id. A placement's look is a pure function of its id
(`structureLook`), so undo/redo and replays look identical; a piece carried from
the tray adopts the look of its new id on release.

**Simulation untouched:** tile centres and top heights (`tileCenter`, `tileTopY`)
are unchanged; decoration is visual only, never raycast, bounded to its own tile
(unit-tested), and hidden on tiles that hold a structure.

**Draw-call strategy:** static parts are painted into a vertex-colour attribute and
merged with one shared material (a whole home cluster = 1 mesh); repeated
decoration is instanced (one `InstancedMesh` per kind: crop, olive, pine, round,
cypress, shrub, tuft, flower, wall, rock, foam). Animated / per-instance parts stay
separate (rotor, park crowns, home pad tint, road arms, PV glass).

## Evidence

Side by side (left = before, right = after):

- `docs/visual/compare-xr-closeup.png` — IWER, leaning in
- `docs/visual/compare-xr-2026.png` — IWER, seated view
- `docs/visual/compare-desktop-3-plan-b-2026.png`, `compare-desktop-4-plan-b-2050.png`
- detail: `docs/visual/after-xr-detail.png` (homes, bridge, park, solar farm)

## Verification (V2)

```
npm run typecheck                         0 errors
npm test                                  98 / 98  (+7: determinism, decoration bounds, per-terrain decoration)
npx playwright test                       20 / 20  (dev server; gameplay unchanged)
scripts/xr-phase1-test.sh                 5 / 5   hands + controller: tray pinch, wrist rotate, drop-off remove, ray Undo, squeeze
scripts/xr-phase2-test.sh                 5 / 5   start, 2050 read-only (grab refused), save A, finish
scripts/xr-phase3-test.sh                 all     hover ×1.12, larger text, skip tips
npm run build                             succeeds; main chunk 2,449 kB (681 kB gzip), was 2,435 kB
```

The decoration-bounds test caught a real defect during V2 (shore rocks could
leak 8 mm into the neighbouring tile); fixed.

## Performance observations (measured; not Quest numbers)

| Scene (same reference plan) | Draw calls | Triangles | Geometries | Objects / meshes |
|---|---|---|---|---|
| Desktop, start — before / after | 77 / 88 | 11.0k / 28.5k | 86 / 102 | 425/372 → 437/381 |
| Desktop, full plan 2026 — before / after | 120 / 132 | 12.2k / 34.7k | 125 / 150 | 504/428 → 515/433 |
| Desktop, full plan 2050 — before / after | 100 / 111 | 11.8k / 32.7k | 129 / 154 | — |
| IWER stereo, 2026 — before / after | 252 / 276 | 43k / 88k | 133 / 158 | — |

(Desktop counts include the shadow pass; IWER counts include both eyes and the
emulator's synthetic room.) Draw calls rose ~10 %; triangles roughly tripled
but remain small for Quest-class GPUs (~35k per eye for our content).

Frame time in the IWER emulator rose from a median of 100 ms to 150 ms. This runs
in **headless Chromium with software rendering (no GPU)**, where cost scales with
rasterised triangles; it says nothing reliable about Quest frame rate. JS heap
~125–141 MB in both states. **Quest performance remains unmeasured.**

## V3 — Visually meaningful time travel

One pure mapping, `futureVisualState()` (`src/world/future-visual-state.ts`),
turns the projection of the current plan into every visual parameter; the
renderer (`future-system.ts`) only animates toward it. Full table and guarantees:
[`docs/VISUAL_STATE_MAPPING.md`](VISUAL_STATE_MAPPING.md).

| Effect | Driven by | Replaces |
|---|---|---|
| Unplanned settlement: informal grey-beige blocks with water tanks, no gardens, rising staggered from the town outward; crops under them give way | projected sprawl tiles + residents (density) | 10 identical grey boxes |
| Vegetation / fields / park trees fade toward dry ochre (max 0.7, restrained) | projected environment | a global tint of tile tops only |
| Shoreline creeps onto each beach from its seaward edge (½ in 2035, all in 2050, illustrative) | projection progress | cyan boxes covering every beach |
| Sea walls on the seaward edges of at-risk sites + calm pulsing orange outline | projected `floodRiskIds` | walls always on the north edge |
| PV glow and rotor speed | projected renewable coverage | constant |
| Park trees grow | park-maturity rule | (kept) |
| ~1.4 s eased transition, staggered reveals, instant with reduce-motion | — | ~0.8 s ease |

Evidence: `docs/visual/v3-sheet-underhoused.png` (2026 / 2035 / mid-transition /
2050), `v3-xr-sheet.png` (IWER: under-housed 2026 & 2050, plan A 2050, balanced
2050), `v3-plan-a-coast-zoom.png` (walls + orange outlines on at-risk homes),
`v3-tt-*.png` (desktop).

Verification:

```
npm test                    109 / 109 (+11 visual-state mapping tests)
npx playwright test         22 / 22  (+2: rendered scene matches the mapped state,
                                       mid-transition observed, walls/outlines only when at risk)
scripts/xr-phase2-test.sh   5 / 5   (2050 via hand ray, grab refused in the future view)
npm run build               succeeds
```

Stats with the V3 layer (IWER stereo, full plan): 2026 276 calls / 88k tris,
2050 242 calls / 84k tris — unchanged from V2. Frame time in software-rendered
IWER: median 167 ms, p95 400 ms; the p95 spike is likely the first build of
sprawl meshes on entering a year (built synchronously, then cached). Not a Quest
measurement; flagged for V5.

## Remaining (V4–V5, not started)

- V4: A/B mini dioramas still use simple coloured blocks; XR panel polish; tray.
- V5: victory/failure moments (`balanced` / `missed` from the mapping are ready
  for this), pre-building sprawl meshes to avoid the first-transition hitch, final
  validation, docs.
- Known visual issues: crop rows read slightly chunky at very close range; PV
  glass looks pale under the warm key light.
