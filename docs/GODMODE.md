# TerraCity: GODMODE — The Two Futures Experiment

Tagline: *The Future Isn't Written. It's Built.*
Branch: `feature/godmode-split-reality` (from `main` at `d9bff09`).

## Phase 0 — Repository audit (short)

State on `main`: IWSDK 1.0.1 (WebXR, hands-first, seated MR), deterministic pure
simulation, Plan A/B, time travel 2026/2035/2050, Blender city-kit GLB, the
signature street experience (M1–M5). Unit 144, e2e 26 (+3 env-gated), IWER hand
scripts pass; deployed to GitHub Pages. Not validated on a physical Quest.

**Mapping of the brief's suggested modules to what exists**

| Brief module | Existing code (reused) | Added in GODMODE |
|---|---|---|
| WorldStateController | `core/game-state.ts`, `core/session.ts` signals, `core/commands.ts` | `futuresOpen` signal, `openFutures/closeFutures/selectFuture` |
| TimelineController | `viewYear`, `simulation/projection.ts` (`projectYear`) | — (Phase 4: spatial time control) |
| ParallelFutureController | Plan A/B (`planA`), `world/mini-board.ts` (`createMiniBoard`), `future-visual-state.ts` | `world/futures.ts` (pure pair), `world/split-system.ts` |
| HandGestureInterpreter | IWSDK grab components (pinch-to-place) | `interactions/two-hand-gesture.ts` (pure, tested) |
| WorldScaleTransition / NeighborhoodDetailRenderer | `world/street-system.ts`, `street-view.ts` | Phase 2: enter from a selected future |
| ConsequenceNarrativeEngine | `world/street-story.ts` (graded, tested) | Phase 3: the child |
| ExperienceDirector | tutorial + commands | explicit state below |
| SpatialAudioController | `audio/sfx.ts` (procedural, panned) | fracture / split / merge sounds |

**Experience state** (derived from signals; transitions are explicit and
cancellable): `TABLETOP` → (gesture `arming` → `armed`) `SPLITTING` →
`DUAL_FUTURE` (`futuresOpen`) → [Phase 2: `ENTERING` → `HUMAN_SCALE`
(`streetView`) → `RETURNING`] → `TABLETOP`. A cancelled gesture returns to
`TABLETOP` without side effects; merge restores the table, the plan and the year.

## Phase 1 — Split Reality

**Interaction** (XR, hands): bring both open hands together over the miniature
city and hold (0.35 s) → a luminous fracture appears through the world, with a
rising tone. Pull the hands apart → the fracture brightens with the separation
→ at 40 cm the world splits: the table disappears and two miniature futures fly
apart, **left hand = Future A, right hand = Future B**, turned toward the seated
viewer. Pinch / tap a future to select it (amber ring). Bring the hands back
together and hold (0.45 s) → the futures merge into one world.

Robustness (`two-hand-gesture.ts`, 11 unit tests): open hands only — any pinch
or squeeze (and any held piece) cancels, so it never competes with
pinch-to-place; hold times before anything happens; hysteresis (start ≤ 18 cm,
keep ≤ 22.5 cm); both hands must be over the table (a hand may leave for
0.25 s); after a split or merge the hands must separate again before the next
gesture (latch); deterministic. Fallbacks: **Split into two futures / Merge the
futures** button on the Plan pad, and `V` on desktop.

**What the two futures are** (`futures.ts`, unit-tested): with a saved Plan A —
Plan A vs Plan B (the current map), i.e. the existing Plan A/B; without one —
*your plan* vs *the same coast if nobody plans* (no structures: newcomers end up
in sprawl). Each future is a miniature of the same terrain built from its own
plan and its own deterministic projection, shown in 2050 (or the year being
viewed, 2035/2050; time travel while split rebuilds them). Same plans → same
futures. Labels: title, targets met, and the four numbers (housed, nature,
renewable, land used; the better one marked).

**Differences that show**: sprawl tiles, parched land, lost trees and crops,
smog layer (new on the miniatures, from the same `haze`), reforestation,
solar/wind, flooded beaches — all from `futureVisualState`.

**Integrity**: the plan is never modified (checked in e2e and IWER), editing and
the clock are paused while split, merge restores the table, panels and year.
No second simulation or renderer: two baked miniatures (a handful of draw
calls each).

### Evidence (running app, `docs/visual/gm1-*`)

- `gm1-1-one-world.png` → `gm1-2-splitting.png` → `gm1-3-two-futures-2050.png`
  (desktop, button) — under-housed plan vs nobody planning.
- IWER Quest 3 profile, **hands only**: `gm1-4-xr-fracture.png` (hands together,
  fracture), `gm1-5-xr-two-futures.png`, `gm1-6-xr-selected-B.png` (pinch-select),
  `gm1-7-xr-merged.png`; `gm1-log.txt` records each state (armed → split by
  gesture → select B → merge by gesture → plan unchanged).
- `gm1-balanced-*`: the balanced reference plan vs nobody planning (strongest
  contrast).

### Tests

New: `two-hand-gesture.test.ts` (8), `futures.test.ts` (3), e2e
`split.spec.ts` (button / V, editing blocked, clock stopped, merge restores
table, year and plan, Plan A/B pairing). Results: unit 155 / 155; Playwright 27 passed, 3 skipped (env-gated); IWER hand scripts `xr-phase1/2/3` exit 0; build OK; IWER two-hand gesture flow (arm → split → pinch-select B → merge, plan unchanged) passes for both captured plans.

### Known limitations

- Gesture verified with IWER's emulated hands only; real hand-tracking noise,
  thresholds and comfort on a Quest are untested.
- The "fracture" is a light sheet and seam; the table itself does not crack
  into halves (the futures appear as it vanishes).
- The futures are baked miniatures: time can be changed while split (rebuild),
  not scrubbed continuously (Phase 4).
- Labels are canvas plates; very small text at seated distance.
