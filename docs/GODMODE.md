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

## Phase 2 — Become Small

Branch `feature/godmode-become-small` (from phase 1).

**Interaction**: in the two-futures view, pinch / tap a future to select it (amber
ring); the selected future becomes *grabbable*. Pinch it, **pull it toward your
face** — within 35 cm the miniature grows around you (0.45 s dive, then a short
fade) and you stand in that future at street level. Release it earlier and it
floats back to its place. Fallbacks: **Enter future A/B** on the Plan pad, `E`.
**Return to tabletop** brings you back to the two futures (enter the other one,
or bring the hands together to merge).

**Same world, same place**: the street is built from the selected future's own
plan and projection (`streetView.plan` = Plan A, current map, or `none` =
nobody planning), from the same canonical plan state and the same kit models as
the tabletop. Both futures are entered at the SAME tile — the first
neighbourhood of the current map — so A vs B is the same street: with your plan,
your villas; if nobody planned, no street at all — sprawl, parched land and
smog where your neighbourhood would be ("No neighbourhood was planned here.").

**Daily life** (illustrative scenario, not a model): people on the sidewalks
and, from 2035 when the cycle lane exists, two cyclists riding it. Under heavy
smog (haze ≥ 0.2) fewer people are outdoors and nobody cycles.

**Comfort**: the only motion is the miniature growing toward you for 0.45 s,
followed by the existing fade-teleport; no camera movement, no continuous
locomotion; the four fixed viewpoints and the street panel are unchanged.

**Integrity fixes found during testing**: the dived miniature and its hit box
are hidden and made non-pickable while inside (a 3 m invisible hit box at the
head was swallowing hand rays aimed at *Return to tabletop*); the dived future
is reset to its place before the street opens.

**LOD**: tabletop = baked miniatures of the whole region; human scale = the kit
models at 1:1 for the 5 × 5 tiles around the visited tile only. A separate
higher-detail street asset set is not built yet (Phase 5).

### Evidence (`docs/visual/gm2-*`, `gm2-log.txt`)

- Desktop: `gm2-1-future-A-street.png` (your plan: villas, people, cyclist,
  green) vs `gm2-1b-future-B-street.png` (same place if nobody plans: no street,
  sprawl, smog); `gm2-2-back-at-futures.png`.
- IWER, hands only: split by gesture → ray-select A (`gm2-3-xr-selected-A.png`)
  → pinch and pull it toward the eyes (`gm2-4-xr-pulling-future.png`) → inside
  Future A (`gm2-5-xr-inside-future-A.png`) → *Return to tabletop* by hand ray →
  back at the futures (`gm2-6-xr-back-at-futures.png`) → merge by gesture; plan
  unchanged.

### Tests

New e2e *become small* (enter A, return to the futures, enter B at the same
place with no neighbourhood, merge, plan unchanged); unit test for the
no-neighbourhood story line. Results: unit 156 / 156; Playwright 28 passed, 3 skipped (env-gated); IWER hand scripts exit 0; IWER phase-2 hand flow and the M2 street hand flow pass; build OK.

## Phase 3 — The Last Child

Branch `feature/godmode-last-child` (from phase 2).

**Mira, 9**, lives in the visited neighbourhood in **2050** (there is no child
in 2026 or 2035). She always stands at the same place: the *little garden*, a
stone planter on the south sidewalk. Entering any neighbourhood in 2050 (from
the tabletop or from a future) arrives at the viewpoint beside her, ~2 m away;
from the other viewpoints she can be seen down the street.

**Deterministic narrative** (`src/world/child-narrative.ts`, pure, 7 unit
tests). Each sentence is used only when the simulated quantity supports it:

| Simulation state (2050) | Mira's state | Garden | First line |
|---|---|---|---|
| environment ≥ target (60) | thriving | in flower, young olive | "This is my favorite place. Did you help make it?" |
| environment < target and trees lost (`treeLoss` > 0) | parched | cracked soil, dead stump | "My grandmother told me there used to be trees here." |
| environment < target, no tree loss yet | parched | dry | "The garden is dry again this summer." |
| no planned neighbourhood on this tile | unplanned | dry | "We live in the houses out here. Nobody planned a street or a garden." |

At most one second line: unplanned sprawl residents > 0 → cousins in houses
built without a plan, no park there (housing pressure); else renewable coverage
< 80 % → only some of the power from wind and sun (energy); else, when
thriving, most of the power from wind and sun. Water, health and other
unmodelled outcomes are never mentioned (tested). Same inputs → same words.

**Presentation**: a stylised child (~1.25 m) with an idle breath, turning to
face you, and a wave as each line starts; subtitles in a speech bubble above
her (6 s per line) and the same words in the street panel; a soft chime panned
toward her when she starts speaking (procedural; no recorded voice yet — lines
are fixed, so a recorded voice can be added later). The street panel now sits
to the side (desktop: right; XR: turned to the right) so it never covers her.

**Rewrite reality** (the core loop): an under-housed plan → enter in 2050 → Mira
by a dry garden ("there used to be trees here … my cousins live in houses built
without a plan"). Back to the tabletop, add neighbourhoods and a park, enter the
same place again → the same child by a garden in flower ("This is my favorite
place. Did you help make it?"). Covered by an e2e test.

### Evidence (`docs/visual/gm3-*`, `gm3-log.txt`)

- `gm3-1-before-line1/2.png` — under-housed plan, 2050: Mira, dry garden, smog.
- `gm3-2-after-rewrite-line1/2.png` — same place after rewriting the plan.
- `gm3-3-xr-meet-mira.png` — IWER, hands only (hand ray on *Enter your city* in 2050).
- Phase 2 flow re-run on this branch: `gm3-split-*`.

Tests: unit 163 / 163 (7 new); Playwright 29 passed, 3 skipped (new e2e *the last child*: no child in 2026, parched then thriving after rewriting, same words for the same state); IWER hand scripts exit 0; IWER phase-2 and phase-3 hand flows pass; build OK.

### Limitations

- Subtitles and a chime only; no voice acting. Stylised procedural figure.
- One character, one location, three states (plus the second-line variants).

## Phase 4 — Sculpt Time

Branch `feature/godmode-sculpt-time` (from phase 3).

**The time dial**: a glowing 240° ring beside the table (XR: right-front, near a
seated player's right hand, facing them; desktop: lower right, facing the
camera) with 2026 / 2035 / 2050 notches and a golden knob.

- **Hands**: pinch the knob and move it along the ring. The world follows
  continuously — trees and crops disappear or woodland returns, land parches or
  greens, smog thickens, the sea creeps up, villas and the town change era,
  turbines speed up — with a soft clockwork tick per passing year. Let go and it
  settles on the nearest simulated year (chime).
- **Ray / mouse** (one-hand / desktop alternative): press anywhere on the ring
  to jump there and drag to scrub; tap a year label to go to that year.
- The year panel stays as the conventional control.

**Simulation integrity** (`src/interactions/time-dial.ts`, pure, 5 unit tests):
only 2026, 2035 and 2050 are simulated. In between, the visual parameters
(progress, dryness, haze, tree loss, greening, renewable activity, park growth)
are linearly interpolated between the two neighbouring simulated years, and the
label says so: `~2039 (between projections)`. The numbers on the HUD, sprawl
tiles and at-risk sites follow the nearest simulated year (discrete), because
interpolating them would be misleading. Releasing always ends on a simulated
year; the plan is never touched.

**Implementation**: a `timeScrub` signal (null when not scrubbing); `FutureSystem`
precomputes the mapped state of all three years on each recompute and, while
scrubbing, follows the interpolated target; the dial system
(`src/world/time-dial-system.ts`) handles the knob (OneHandGrabbable handle in
XR only), the ray/mouse face (pointer capture), snapping, labels and sounds. The
dial is hidden inside a street and while the futures are split (both rebuild per
year instead).

**Bugs found while testing (fixed)**: the dial's lower-left sat inside the
board's hill tiles (the board caught the pointer first) — moved out; the visual
knob, ring and notch spheres caught rays meant for the face — made
non-pickable; the action pad's ScreenSpace box was taller than its content and
covered part of the dial on desktop — reduced to 38 %.

### Evidence (`docs/visual/gm4-*`, `gm4-log.txt`)

- Desktop mouse: `gm4-1-dial-2026.png`, `gm4-2-scrub-2031.png`,
  `gm4-3-scrub-2039.png` (interpolated, labelled), `gm4-4-snapped-2050.png`.
- IWER hands: `gm4-5-xr-turning-time.png` (knob held, ~2041, world mid-way),
  `gm4-6-xr-2050.png` (released, snapped).

### Limitations

- Linear interpolation of visual parameters is a presentation device, not a
  simulation of the intermediate years.
- Inside a street or with the futures split, time changes are discrete (rebuild).

Tests: unit 168 / 168 (5 new); Playwright 30 passed, 3 skipped (new
`time-dial.spec.ts`: mouse drag, interpolated + labelled in between, snap on
release, tap-to-jump, plan unchanged); IWER hand scripts exit 0; Split Reality
gesture flow re-run on this branch passes; IWER hand turning (knob held, ~2041,
release snaps to 2050) passes; build OK.

## Phase 5 — Polish

Branch `feature/godmode-polish` (from phase 4).

- **Onboarding along GODMODE** (`gameplay/tutorial.ts`, pure, unit-tested): five
  tips — place homes → add wind → **split the world** → **pull a future toward you
  and step inside** ("someone lives there in 2050") → **come back, merge, change
  the plan and visit her again**. Each GODMODE step needs its own action. The
  next control glows amber (*Split into two futures*, then *Enter future*), and
  at the split step a floating card over the city shows the gesture — in XR
  "< Both open hands together here, > then pull them apart", on desktop "tap
  the button or press V". It fades as soon as the fracture appears.
- **Final reveal**: when Plan A and Plan B are held apart as two futures, after
  a second **THE FUTURE ISN'T WRITTEN. IT'S BUILT.** fades in between them.
- **Volume**: the Sound chip / `M` cycles *Sound high → low → off* (master gain
  100 % / 35 % / 0); all procedural sounds and the street ambience follow it.
  Audio still starts only after the first gesture (autoplay policy).
- Year-button cues from the old tips removed (the time dial and street year
  buttons remain).

### The 150-second demo path (reproducible)

`TAG=gm5 node scripts/visual/godmode-flow.mjs` drives it in the running app
(desktop; the XR equivalents are the gesture scripts of phases 1–4):

| Time | Beat | Step |
|---|---|---|
| 0:00–0:20 | The world awakens | start; tip 1 glows a tile |
| 0:20–0:40 | First decision | place a neighbourhood, energy, a park (the world reacts: ring, placement animation, numbers) |
| 0:40–1:00 | Split reality | hands together → fracture → pull apart: your plan vs nobody planning (or Plan A vs B) |
| 1:00–1:25 | Enter the future | pinch a future, pull it to your face → street, 2050 |
| 1:25–1:50 | Meet the last child | Mira by a dry garden: "there used to be trees here" |
| 1:50–2:15 | Rewrite tomorrow | return, merge, save Plan A, add homes and a park, split again, enter Plan B: "This is my favorite place. Did you help make it?" |
| 2:15–2:30 | Final reveal | Plan A and Plan B in your hands; the tagline |

Screens: `docs/visual/gm5-0..7-*.png`; render stats per step in `gm5-log.txt`.

### Performance observations (desktop Chromium + IWER, NOT a Quest)

From `gm5-log.txt`: tabletop ~104–122 draw calls / 62–76 k triangles; two
futures ~69 calls / 92 k; street (2050, Mira) ~75 calls / 13 k; scrubbing
time ~125 calls / 92 k; IWER stereo tabletop ~224 calls / 157 k. Frame rate in
this software-rendered environment is not meaningful; **Quest frame rate,
thermal behaviour and hand-tracking robustness are unverified** and are the
main risk for the competition build. Production build size in the log.

### Definition of done — status (emulator / desktop)

1–12 are all exercised in the running app: beautiful miniature, hands,
split, select, enter at human scale, Mira reflects the simulation, return,
change a decision, re-enter the same place, changed future, compare (Plan A vs
B as two futures / street toggle), back to the start state (merge restores the
table, year and plan). None of it is validated on a physical Quest.

Tests: unit 168 / 168; Playwright 30 passed, 3 skipped (updated polish spec
walks the five GODMODE tips through split, enter, return and merge; sound cycles
high/low/off); IWER hand scripts exit 0; Split Reality and Become Small hand
flows re-run on this branch pass; the full demo path runs with 0 page errors;
production build 8.0 MB.
