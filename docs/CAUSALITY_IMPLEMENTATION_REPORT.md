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
