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
