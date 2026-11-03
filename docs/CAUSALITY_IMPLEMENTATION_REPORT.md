# TerraCity — Causality implementation report

Branch `feature/causality` (from `main` at `3133821`). Audit:
[CAUSALITY_AUDIT.md](CAUSALITY_AUDIT.md). Evidence is labelled *desktop*
(Chromium), *IWER* (emulator) or *Quest* (none yet).

## Milestone A — Audit and UX cleanup

**Files**: `docs/CAUSALITY_AUDIT.md`; `public/ui/hud.uikitml`,
`public/ui/actions.uikitml`, `public/ui/street.uikitml`,
`public/scenes/main.iwsdk.scene.json`; `src/core/session.ts` (`detailsOpen`),
`src/ui/panel-system.ts` (layers, mode line, `reveal` test hook),
`src/gameplay/flow-system.ts` (D key, persistence), `src/world/street-system.ts`,
`src/world/street-view.ts`, `src/world/child.ts`; `src/core/persistence.ts`
(new), `src/core/commands.ts`; tests `persistence.test.ts`, helpers, specs.

**Information layers**

| Layer | Content | Where |
|---|---|---|
| 1 — always | year + clock, plan and mode ("Your plan - building", "Two futures side by side", "Visiting the street - Future A…"), one instruction (tip), the latest decision's effect line | HUD (compact), Plan pad primary actions (Split, Why?, Enter, Undo, Save Plan A, Finish), year panel, street panel header |
| 2 — contextual | decision card (Causality, ~6 s), Mira's line, future labels | in the world |
| 3 — on request ("Details" / D) | the four metrics vs targets and land line; Redo, Rotate, Remove, Clear map, Restore A, Compare A/B, Pause; in the street: story lines and the Plan A/B comparison | HUD, Plan pad, street panel |

Screen-space boxes now follow the content (an oversized invisible box used to
block the city). Larger text still scales every panel.

**Street composition (Mira)**: the garden viewpoint moved between the 2050
street trees, off the line through their trunks; Mira stands ~3 m away (was 2 m)
with her garden beside her and open sky behind; the speech bubble is 22 %
smaller and sits above her; the street panel is compact (year, plan, previous /
next, return, Details) and placed at the side.

**Save / reload** (`src/core/persistence.ts`): Plan A and the current map are
saved together (versioned key `terracity.save.v2`; the v1 Plan A key is
migrated), on every plan change and Plan A save. On load every piece is
validated with the game's placement rules; any invalid piece rejects the whole
save (never partially applied). The saved map is restored when the session
starts.

## Milestone B — Causality Vision

**Files**: `src/simulation/causality.ts` (new, pure), `src/world/causality-system.ts`
(new), `src/core/session.ts` (`causalityOn`), Plan pad "Why? Causality Vision"
button and W key; tests `tests/unit/causality.test.ts`,
`tests/e2e/causality.spec.ts`; capture `scripts/visual/causality.mjs`.

**Data model** — no second simulation:

- `ledger(terrain, plan, year)` re-attributes every term of `computeMetrics`,
  `projectYear` and `landBudget` to the rule that produces it
  (`homes-connected`, `farmland-converted`, `wind-noise`, `park-neighbours`,
  `sprawl-pressure`, `park-maturity`, `food-imports`, `construction`,
  `sea-defence`, `structure-energy`, `windy-ridge`, `land-structures`,
  `land-sprawl`, …) with the placement / tile it comes from. **The ledger sums
  exactly to the simulated metrics** — tested for 42 plans (40 random legal
  plans + empty + reference) × 3 years.
- `CausalEffect { metricId, previousValue, nextValue, delta, sourceRules[],
  supportedExplanation, higherIsBetter }` — a metric's change and the rules whose
  contribution changed (their deltas sum to the metric delta; renewable share is
  a ratio and is explained by supply and demand changes instead).
- `CausalEvent { eventId, decisionType, affectedEntities, year, beforeState,
  afterState, affectedMetrics, explanation, evidenceSource: 'simulation',
  confidenceLevel: 'modelled', visualizationType }` — a decision (plan before →
  after) or a comparison (Plan A → Plan B), evaluated by 2050.
- Sentences are generated only from those numbers; gains and costs are both
  listed. A metric that did not change produces no effect; a rule whose
  contribution did not change is never named (tested).

**In the app**

- *Every decision*: a short pulse travels from the changed tile to each tile the
  simulation names (homes that became connected, farmland built over, sprawl
  tiles that appear or vanish…), and a card "What your decision changed" shows
  for ~6 s at the lower left (desktop) / front-left of the table (XR).
- *Causality Vision on* ("Why?" / W): calm breathing rings on those tiles —
  teal = gain, amber = cost — and the card stays.
- *Two futures*: the card explains Plan B vs Plan A (or your plan vs nobody
  planning); each miniature is ringed where the plans differ (structures only in
  that plan, sprawl only in that future).

Examples produced by the running app (`docs/visual/cb-log.txt`):

- Road connecting a neighbourhood: "Housed residents +4,000 (connected homes
  +4,000). Newcomers in unplanned sprawl -4,000 because planned housing changed.
  Budget left -8 (construction -8)."
- Solar on farmland: "Renewable share +13 points (renewable supply +4 units).
  Nature -7 (farmland built over -5, the footprint of what was built -1).
  Budget left -9 (construction -9)."

**Not claimed** (the model does not compute it): household energy flows,
health, water, traffic, which household benefits. Values between simulated
years are never used by causality.

## Tests and build (clean run, both milestones)

| Check | Result |
|---|---|
| `tsc --noEmit` | OK |
| Unit | **178 / 178** (new: `causality.test.ts` 6 incl. the 42-plan × 3-year ledger property test, `persistence.test.ts` 4) |
| E2E (desktop Chromium) | **32 passed**, 3 skipped (env-gated); new `causality.spec.ts`, save/reload in `split.spec.ts` |
| IWER hand scripts `xr-phase1/2/3` | exit 0 |
| GODMODE demo path (desktop) and Mira journey | 0 page errors |
| Production build | OK, 10 MB |
| IWER stereo tabletop | 190 draw calls / 211 k triangles (was 224 / 219 k: fewer panels drawn by default) |

An earlier full run had 7 failures: it overlapped with live code edits (dev
server reloads). Re-run on a stable tree, 6 passed; the 7th was a real test
issue — the street spec clicked the Plan A/B toggle directly, which now lives
under Details; it now opens Details first like a user. The final clean run
above has no failures.

Evidence: `docs/visual/cb-1-decision-pulse.png`, `cb-2-vision-road.png`,
`cb-3-vision-solar-farmland.png`, `cb-4-vision-two-futures.png`, `cb-log.txt`;
`ca-board.png` (compact tabletop), `ca-1-before-line1.png`,
`ca-2-after-rewrite-line1.png` (recomposed street with Mira).

## Remaining limitations

- Nothing verified on a physical Quest (comfort, frame rate, hand tracking,
  text legibility at headset resolution).
- The card lists at most two gains and two costs; the full list is in the
  event (test hook) but not yet browsable in the UI.
- Pulses travel in board space only; in the two-futures view the rings are
  static (no pulse between the boards).

## Milestone C — Split Reality polish

**Files**: `src/world/split-system.ts`, `src/index.ts` (local clipping),
`src/core/commands.ts` (merge message), `scripts/visual/split.mjs`,
`tests/e2e/split.spec.ts`.

- **The split moment** — the table really splits. At the start both futures lie
  exactly where the table is, each clipped to its half by a seam fixed in the
  world (per-future material copies with a clipping plane): the left half is
  Future A, the right half Future B, so the user sees one board whose two
  halves already belong to two different futures. The halves pull apart,
  shrink and turn toward the viewer; each slides out of the seam and becomes
  whole (they never overlap); the seam glows while they part; a ring of light
  runs over the table when they are apart. Clipping is switched off once
  separated. Reduced motion skips straight to the result.
- **Distinct identities** come only from each future's own projection (sprawl,
  parched land, smog, lost trees, reforestation, solar / wind, flooded
  beaches) — nothing is recoloured.
- **Compact comparison**: the two large metric plates are replaced by small
  title tags ("A  Your plan · 4 of 4 targets") that appear once apart, and one
  strip in front of the futures: Housed, Nature (goal 60), Renewable, Land used,
  A | B, the better value ticked (✓; lower land use counts as better). Details
  on request: Causality Vision (W) explains *why* they differ.
- **Merge, honestly**: merging closes the comparison and never combines plans —
  the status says so ("Plans are compared, never combined; Restore A brings
  Plan A back" / "The other future was only a comparison").

Evidence: `docs/visual/cc-2a-seam.png` (the table split at the seam: green
half = your plan, parched half = nobody planning), `cc-2b-parting.png`,
`cc-2c-apart.png`, `cc-3-two-futures-2050.png` (tags + comparison strip), IWER
`cc-4..7-*`. The transition lasts ~0.8 s; for the evidence it is frozen at
t = 0.05 / 0.35 / 0.65 with a debug hook (`splitFreeze`), because software
rendering produces too few frames to catch it live.

Tests (C, clean run): unit 178 / 178; Playwright 32 passed, 3 skipped (split
spec now also checks the comparison strip and the merge message); IWER hand
scripts exit 0; IWER split → pinch-select → merge and Become Small flows pass;
Causality Vision in the two-futures view passes; build OK.

## Milestone D — Mira 2.0

**Files**: `src/world/mira-dialogue.ts` (new, pure), `src/world/street-system.ts`
(conversation, talk target, grounding), `public/ui/street.uikitml` (talk row),
`src/ui/lucide-subset.ts`, `src/gameplay/flow-system.ts` (K / B / X keys in the
street); tests `tests/unit/mira-dialogue.test.ts`, `tests/e2e/street.spec.ts`
("Mira 2.0"); capture `scripts/visual/mira2.mjs`.

- **Grounded narrative context**: `narrativeContext()` gathers only what the
  simulation knows — year, plan / future, the visited tile (the same in every
  future), the decisions within two tiles, a snapshot (housed, sprawl, nature,
  renewable share, land used, tree loss), local facts (homes on her tile,
  parks / wind / solar / homes nearby, farmland built over, sprawl nearby and
  on her tile) and, when there is one, the same place in the other future.
- **Dialogue from validated templates**: every line carries the facts that make
  it true (`support`); a unit test checks, over many plans, that each line's
  support holds in its context, that no line repeats, that the output is
  deterministic, and that the same place gives different words in two futures.
  Tradeoffs are named both ways ("…the land stayed open, but 16,000 people had
  no planned home"). Never mentioned (not modelled): water, health, traffic,
  family history.
- **User-paced conversation**: Mira invites ("Hi! Pinch me or tap Talk to
  Mira."), a soft ring marks her; pinch / click her or "Talk to Mira" starts;
  Next / Back / End (also K / B / X); the bubble shows "Mira, 9 (i/n)". She
  turns to you, shifts her weight and waves at each line; nothing advances on
  its own.
- **The same place, two futures** (evidence `cd-*`): in your plan "Hi, I'm
  Mira. I live on this street. … In the other future this street was never
  built. Unplanned houses went up here instead, and 16,000 people had no
  planned home." Where nobody planned: "Hi, I'm Mira. … In the other future
  there is a planned street here, with gardens, where we have houses built
  without a plan."
- **Found and fixed while verifying**: a line claimed "more fields stayed" on a
  tile that had sprawl in that future (new `sprawlHere` fact); in the
  nobody-plans future Mira stood inside the 0.7 m sprawl slab — she is now
  placed on the surface under her spot (downward ray against the street).

Evidence: `docs/visual/cd-1-invitation.png`, `cd-2-talk-line1.png`,
`cd-3-talk-other-future.png`, `cd-4-future-B-line1.png`,
`cd-5-future-B-other.png`, `cd-log.txt` (desktop Chromium).

Limitations: the camera in a future without a district stays at ground level
even where a sprawl slab stands; voice is not included (text only); not tried
on a Quest.

Tests (D, clean run): `tsc` OK; unit **184 / 184** (new `mira-dialogue.test.ts`
6); Playwright **33 passed**, 3 skipped (new "Mira 2.0" street test: talk → next
→ back → end, grounded lines, same place differs between futures, Mira on the
slab); IWER hand scripts `xr-phase1/2/3` exit 0; Mira capture 0 page errors;
build OK, 10 MB.

## Milestone E — Human-scale world polish

**Files**: `src/world/points-of-interest.ts` (new, pure), `src/world/poi-markers.ts`
(new), `src/world/street-system.ts` (clear standing spot, POI boards, hooks);
tests `tests/unit/points-of-interest.test.ts`, `tests/e2e/street.spec.ts`;
capture `scripts/visual/human-scale.mjs` (every viewpoint, both futures).

**Audit first** (`human-scale.mjs`, all four viewpoints × both futures, 2050).
Your-plan views were sound. In the future where nobody planned, the
viewpoints stood at ground level *inside* the 0.7 m sprawl slab and, at "At
the gate", inside a house: the frame was a wall.

- **Composition — a clear place to stand**: without a planned district the
  viewer now stands on what is really there (open ground or the sprawl slab,
  never a roof), at the nearest spot within 12 m whose surroundings are level
  and whose view (±40°, 8 m) is not blocked by a wall — found by downward rays
  against the built street. Planned streets keep their authored viewpoints.
- **Meaningful points of interest** (6.3): one or two places near Mira, chosen
  only from what exists in this plan / future, each explaining one consequence
  with the exact amounts the causality ledger attributes to it:
  - *Neighbourhood park* — "Next to 1 neighbourhood: nature +1. Its trees grow
    every year: by 2050, 2 parks add nature +4." (`park-neighbours`,
    `park-maturity`)
  - *Solar farm / Wind turbines* — "Makes 4 of the 27 units of clean power the
    region has." (+ farmland converted, windy ridge when they apply)
  - *Planned neighbourhood* — people housed (`homes-connected`), wind noise and
    farmland when they apply.
  - *Unplanned houses* (nobody plans) — "One of 8 places where 16,000
    newcomers without a planned home built, without streets or parks.
    Unplanned building costs nature -24 across the region."
  They are info boards on her street (south sidewalk by the gate, north
  sidewalk toward the start), never in the garden viewpoint's view of Mira; an
  arrow on the post points at the real place. Collapsed they show the title
  ("why?"); pinch / click opens the explanation (one at a time). Signs face the
  viewer and keep a constant apparent size; they read over haze and roofs.
  Tested: every point's tile holds that structure / sprawl in that plan, every
  signed amount is a supporting ledger entry, at most two of different kinds,
  deterministic; the same place gives a park + solar farm in your plan and
  unplanned houses where nobody planned.
- **Transition** (6.1), reviewed, unchanged: teleport fade of ~0.2 s per half
  (instant with reduced motion), the street placed under the viewer's own head
  and yaw (no camera motion, no scale animation), Return always on the street
  panel. Street ambience was already present.

Evidence (desktop Chromium): `docs/visual/ce-A-vp0..3.png`,
`ce-B-vp0..3.png`, `ce-A-poi-open.png`, `ce-B-poi-open.png`, `ce-log.txt`.

Limitations: no new materials or assets in this milestone (the audit found
composition, not materials, to be the main problem); boards of far places are
on the street, so distance is shown only by the arrow; not tried on a Quest.

Tests (E, clean run): `tsc` OK; unit **187 / 187** (new
`points-of-interest.test.ts` 3); Playwright **33 passed**, 3 skipped (the
"Mira 2.0" street test now also checks the points of interest per future and
opening / closing them); IWER hand scripts `xr-phase1/2/3` exit 0; human-scale
and Mira captures 0 page errors; build OK, 10 MB. Performance: two boards add
6 small meshes and 2 canvas textures to the street; no headset measurement.

## Milestone F — The first five minutes

**Files**: `src/gameplay/tutorial.ts` (rewritten: six steps), `src/core/commands.ts`
(`updateTutorial` context, `replayIntro`, `closeOutro`, `startWithoutIntro`),
`src/core/session.ts` (`miraTalked`, `outroOpen`), `src/ui/flow-panels.ts`
(intro and closing cards, `overlay` test hook), `src/ui/panel-system.ts`
(Why? cue, Replay intro), `public/ui/actions.uikitml` (Replay intro under
More), `src/gameplay/tutorial-system.ts`, `src/gameplay/flow-system.ts`
(I key, hooks), `src/world/street-system.ts` (Talk cue, `miraTalked`),
`src/world/split-system.ts` (strip hidden under the closing card); tests
`tests/unit/tutorial.test.ts`, `tests/e2e/polish.spec.ts`; capture
`scripts/visual/first-five.mjs`.

The old five tips (homes → wind → split → enter → merge) became the brief's
six beats. Each step waits for the player's own action — nothing plays by
itself — and the full planning tools stay available the whole time.

| Beat | What the player does | What answers |
|---|---|---|
| 1 The city | sees the miniature coast; **"Every city begins with a choice."**; Begin / Skip intro | intro card |
| 2 The decision | Step 1/6: places one Homes beside the town (glowing tiles) | the simulation's own card, e.g. "By 2050: gains housed +4,000, in sprawl -4,000, nature +3 … Costs: budget -12" |
| 3 The split | Step 2/6: pulls the city apart (or Split) | your plan vs nobody planning, side by side |
| 4 The consequence | Step 3/6: Why? / W | rings on the differences; "Why the two futures differ" card |
| 5 The human story | Step 4/6 enter a future; Step 5/6 talk to Mira (step ends when the conversation ends — no push to leave while she talks) | her lines from Milestone D, incl. the other future at this place |
| 6 The question | Step 6/6: return and enter the other future | then, back on the tabletop: **"The future isn't written. It's built."** — Keep planning / Replay intro |

- **Skip and replay**: Skip intro on the first card, Skip tips / Show tips (H)
  any time, Replay intro under More on the Plan pad (or I) and on the closing
  card. Replay never clears the plan: it returns to one world on the tabletop
  and step 1 waits for a *new* choice. Skipping is not completing: no closing
  card.
- **Truthful feedback**: beat 2's card is the causality event of that very
  placement (tested: "housed +4,000" after one connected Homes).

Evidence (desktop Chromium): `docs/visual/cf-1-every-city.png` …
`cf-8-the-future-is-built.png`, `cf-log.txt`; `docs/evidence/causality-f-outro.png`.

Limitations: the steps are text cues plus amber highlights on the next
control (as before), no voice-over; beat timing on a headset is not measured.

Tests (F, clean run): `tsc` OK; unit **188 / 188** (`tutorial.test.ts` rewritten,
5 tests: order, one action per step, Causality already on, replay asks for a new
choice, skip is not completion); Playwright **34 passed**, 3 skipped (new: the
six beats end to end with the closing card and replay; the intro card and Skip
intro); IWER hand scripts `xr-phase1/2/3` exit 0 (Start → Begin by id, Skip
tips by hand ray still pass); first-five capture 0 page errors; build OK, 10 MB.

## Milestone G — Quest validation (emulator audit + hardware checklist)

**No physical Quest was available.** Everything below is desktop Chromium and
the IWER emulator (Quest 3 profile, stereo). Frame times measured here reflect
this machine's software rendering only and are **not** Quest frame rates. The
headset half is a checklist for the person with the device:
[QUEST_VALIDATION_CHECKLIST.md](QUEST_VALIDATION_CHECKLIST.md).

**Files**: `scripts/visual/perf-audit.mjs` (new), `src/index.ts`
(`gpuBudget`, `liveTextures` debug hooks; quality preset applied),
`src/config/quality.ts` (new), `src/world/ambient-system.ts` (shadow pass
skipped at street level; preset), `src/world/street-system.ts` (drought texture
cache, no per-frame allocation), `src/world/poi-markers.ts`,
`src/ui/panel-system.ts` (XR capability fallback); tests
`tests/e2e/fallback.spec.ts` (new), `tests/unit/game-state.test.ts` (Plan A/B
isolation); `docs/QUEST_VALIDATION_CHECKLIST.md` (new).

**Profile** (`docs/visual/cg-perf.json`, IWER stereo, reference plan):

| State | Draw calls | Triangles | Materials | Transparent draws | Textures (MB, upper est.) | Shader programs |
|---|---|---|---|---|---|---|
| Tabletop 2026 | 254 | 274 k | 128 | 49 | 11.6 | 38 |
| Tabletop 2050 | 236 | 269 k | 124 | 50 | 11.6 | 40 |
| Two futures | 116 | 314 k | 97 | 44 | 14.1 | 50 |
| + Causality Vision | 158 | 317 k | 118 | 65 | 16.3 | 50 |
| Street, your plan, Mira talking | 168 | 89 k | 124 | 42 | 14.6 | 64 |
| Street, nobody plans | 142 | 40 k | 116 | 39 | 14.6 | 80 |

Readings: the tabletop is the most draw-call-heavy state, the two futures the
most triangle-heavy (two full boards). Transparent draws are mostly UIKit
panels and buttons (HUD 5, Plan pad 4+, time control 4, time dial 7) and the
Causality rings — inherent to the UI, kept for legibility. Shader programs grow
as new states are first seen (cached, not per frame).

**Optimizations, each from a finding above**

- *Texture leak* (found by the enter / exit cycle check): the parched-garden
  atlas copy was rebuilt on every visit to a dry future and never freed when
  returning to a green one (textures +4 after 4 cycles). Now built once per
  dryness step and reused: +2 after 6 cycles **and** +2 after 14 (a bounded,
  one-time cache), heap flat (190 → 190 MB); it also removes a per-pixel CPU
  loop from every visit.
- *Shadow pass in the street*: the 2048² sun shadow map was still rendered
  every frame at street level (13 casters) although nothing there receives it.
  The sun stops casting while a street is visited.
- *Garbage in the frame loop*: the street's per-frame code (birds, Mira's
  facing, POI boards) allocated vectors / matrices every frame; it now reuses
  scratch objects.
- *Quality preset* `?quality=low` (1024² shadow map, hard filter, 85 % XR
  resolution, fixed foveation 1) as the first lever for the headset test —
  default unchanged, because no device measurement justifies changing it.
- Not changed without device evidence: LOD, texture compression, instancing
  beyond what exists (trees, birds, people), particle density.

**XR capability fallback**: "Enter Mixed Reality" is offered only where the
browser can start an `immersive-ar` session (`navigator.xr.isSessionSupported`);
everywhere else it is hidden and the desktop loop is complete with mouse and
keyboard. Tested against the production build, which has no emulator.

**QA coverage (Part 12)**

| # | Area | Tests |
|---|---|---|
| 1 | Plan A/B state isolation | unit `game-state` (new: editing B never changes A or its projection), `futures`; e2e `split` |
| 2 | Split and merge | e2e `split` (merge restores table and plan), IWER `godmode-flow`/`xr-phase*` |
| 3 | Timeline changes | unit `projection`, `time-dial`; e2e `game-loop`, `time-travel-visuals`, `time-dial` |
| 4 | Simulation determinism | unit `projection`, `futures`, `game-state` replay, `mira-dialogue`, `points-of-interest` |
| 5 | Causality event generation | unit `causality` (ledger sums exactly, 42 plans × 3 years); e2e `causality` |
| 6 | Unsupported causal claims | unit `causality` (unchanged rules never named), `mira-dialogue` (every line's support holds), `points-of-interest` (every amount is a ledger entry) |
| 7 | Mira dialogue consistency | unit `mira-dialogue`; e2e `street` "Mira 2.0" |
| 8 | Same-location comparison | e2e `street` (same viewpoint, A vs B), `split` become small |
| 9 | UI mode transitions | e2e `polish` (first five minutes end to end), `street`, `split`, `game-loop` |
| 10 | Save / reload | unit `persistence`; e2e `split` save / reload |
| 11 | Desktop input fallback | every e2e (mouse + keyboard), `desktop-placement`, `fallback` |
| 12 | XR capability fallback | e2e `fallback` (production build) |

Cannot run here: anything on a physical Quest (frame rate, thermal, real
hand-tracking, fingertip poke, comfort, legibility at headset resolution,
Quest Browser audio) — see the checklist.

**Tests (G, clean run)**: `tsc` OK; unit **189 / 189**; Playwright on the dev
server **34 passed**, 4 skipped (3 env-gated + `fallback`, which needs a browser
without the emulator); Playwright on the **production build** (`vite preview`,
`E2E_BASE_URL`) **35 passed**, 3 skipped (includes `fallback`); IWER hand
scripts `xr-phase1/2/3` exit 0; perf audit 0 page errors; build OK, 10 MB.

**Quest results**: none yet (to be filled from the checklist).
