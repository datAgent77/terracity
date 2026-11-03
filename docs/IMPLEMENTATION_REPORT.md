# TerraCity — competition implementation report

Branch `feature/competition`. Status labels: PASS / FAIL / NOT TESTED / BLOCKED.
Evidence: *unit*, *desktop* (Chromium e2e), *IWER* (emulator), *Quest* (none).

## Milestone A — Audit and temporal integrity

**1. Implemented**

- Audit: [COMPETITION_READINESS_AUDIT.md](COMPETITION_READINESS_AUDIT.md);
  spec: [TEMPORAL_SIMULATION_SPEC.md](TEMPORAL_SIMULATION_SPEC.md).
- Root cause of the observed 2026 / 2035 / 2050 table: no arithmetic defect;
  every value follows an explicit rule. The UI misnamed or hid what the numbers
  meant (details in the audit).
- Honest metrics: "Population" → **Housed**; under it, from the same
  projection, "N want to live here: X in planned homes, Y in unplanned sprawl"
  and "clean power S units for D needed (surplus)" (`explainYear`); budget
  labelled "of 130, one-off".
- Plan A / B ownership: the editable map is **Your plan** and is always
  Future A; Future B is the **Saved plan** (when one exists) or the documented
  baseline **If nobody plans**. "Plan B (now)" is gone from every screen.
  Buttons: Save plan, Restore saved, Compare saved. Internal tags and the save
  format are unchanged (saves still load).
- The HUD mode line always states scenario, year, and editing / read only /
  projection (`ui/view-label.ts`), e.g. "Your plan - 2050 projection - read only".

**2. Files changed**: `src/simulation/projection.ts` (`explainYear`),
`src/simulation/compare.ts` (names), `src/simulation/causality.ts` (compare
headline), `src/world/futures.ts` (A = your plan), `src/core/commands.ts`
(future → plan mapping, messages), `src/ui/view-label.ts` (new),
`src/ui/panel-system.ts`, `src/ui/flow-panels.ts`, `public/ui/hud.uikitml`,
`public/ui/actions.uikitml`, `public/ui/compare.uikitml`,
`public/ui/street.uikitml`, `public/ui/overlay.uikitml`; tests below; docs above.

**3. Bugs and root causes**

| Bug | Root cause | Fix |
|---|---|---|
| Editable plan shown as "Plan B (now)" | Labels followed the internal A/B storage tags | Fixed names; your plan is always Future A |
| "Population" flat across years read as a defect | It is housed capacity; demand and sprawl were not shown | Renamed; demand / sprawl shown |
| Renewable "100 %" in every year hid the surplus | Share is capped at 100 % | Supply vs need shown |
| HUD explanation line never rendered | Empty initial text in UIKitML → no text node | Placeholder text |

**4. Tests added**: `tests/unit/temporal-integrity.test.ts` (12: determinism,
idempotent year order, no mutation, 2026 = present, sprawl continuity,
monotonicity, ranges, ledger sums per year, and the observed-pattern
explanations), `tests/unit/view-label.test.ts` (3); updated `futures.test.ts`,
`causality.test.ts`, `split.spec.ts` for the names. Already present and still
passing: scenario isolation, save / reload, undo / redo.

**5–6. Results**

| Check | Status |
|---|---|
| `tsc --noEmit` | PASS |
| Unit (204) | PASS |
| E2E desktop Chromium (34 passed, 4 skipped env-gated) | PASS |
| IWER hand scripts xr-phase1/2/3 | PASS (emulator) |
| Production build (10 MB) | PASS |

**7. Desktop validation**: PASS (e2e + `docs/visual/ma-hud-2050.png`).
**8. XR validation**: IWER PASS; Quest NOT TESTED.

**9. Limitations**: temporal visualisation was not extended in this milestone
(sprawl appears per tile, no construction stage); the brief's movable
"Reality Seam" does not exist yet (Milestone C).

**10. Risks**: renaming changes on-screen words that the user may have in
recorded material (video / screenshots); the look-dev street shadows are
unmeasured on Quest.

**11. Acceptance**: met for A — projections deterministic and tested, the
observed pattern explained, Plan A / B ownership explicit in every view,
all tests and the build pass.

## Milestone B — Causality integrity

**1. Implemented**

- Causal model ([CAUSALITY_MODEL.md](CAUSALITY_MODEL.md)): every rule change
  now carries `scope` (local / regional) and `sourceIds`; effects carry
  `explanationKey` and `scope` (local / mixed / regional); events carry
  `scenarioId`, `sourceDecisionIds` and `affectedSpatialIds`.
- Regional rules (housing shortage / sprawl, sprawl pressure, sprawl land,
  park maturity, food imports) list **all** placements that feed them and are
  marked "Region-wide" / "Partly region-wide" on the card — a regional change
  is never pinned on one decision.
- Year-specific explanations (`decisionTimeline`): the decision card in 2026
  shows **Now (2026)** and, separately, **By 2050** — only effects that are new
  or different later. Viewing 2035 / 2050 re-evaluates the decision in that
  year; the two-futures card names its year.
- Causal chain: pinch / click the card (or N) to inspect one cause at a time —
  its rules, amounts and local / region-wide origin — with the rings narrowed
  to where that cause acts; tradeoffs are listed both ways (gains and costs).

**2. Files changed**: `src/simulation/causality.ts`,
`src/world/causality-system.ts`, `src/gameplay/flow-system.ts` (N key);
`tests/unit/causality-integrity.test.ts` (new), `tests/e2e/causality.spec.ts`;
`scripts/visual/causality-chain.mjs`; `docs/CAUSALITY_MODEL.md`.

**3. Bugs and root causes**

| Bug | Root cause | Fix |
|---|---|---|
| The decision card showed 2050 consequences in every year, without saying which year | Events were always evaluated at 2050 | Evaluated per year; 2026 card splits now / by 2050 |
| Regional effects (e.g. sprawl avoided) read as caused by one placement | No scope / sources in the model | `scope` + all `sourceIds`; "Region-wide" on the card |
| The card showed at most 2 gains + 2 costs with no way to see the rest | Fixed-size card | Causal chain inspection; "(n more)" hint |

**4. Tests added**: `causality-integrity.test.ts` (5: year-specific effects,
no repeated sentence across years, regional sources, consistency of scope /
sources / tiles / numbers with the ledger for 20 plans × 3 years, compare
determinism); e2e "causality is year-specific and inspectable".

Evidence (desktop): `docs/visual/mb-1-now-and-by-2050.png`,
`mb-2-by-2035.png`, `mb-3-causal-chain.png`, `mb-4-two-futures.png`, `mb-log.txt`.

**5–6. Results (clean run)**

| Check | Status |
|---|---|
| `tsc --noEmit` | PASS |
| Unit (209) | PASS |
| E2E desktop Chromium (35 passed, 4 skipped env-gated) | PASS |
| IWER hand scripts xr-phase1/2/3 | PASS (emulator) |
| Causal-chain capture, 0 page errors | PASS |
| Production build | PASS |

**7. Desktop**: PASS. **8. XR**: card pinch is a `RayInteractable` like every
other button — IWER-compatible by construction but not exercised by a hand
script; Quest NOT TESTED.

**9–10. Limitations / risks**: the card is a fixed-size canvas, so long
causes are summarised (top gain + top cost per section, "(n more)"); rings on
the two miniature futures are static (no pulses there).

**11. Acceptance**: met for B — every shown claim comes from ledger
differences, regional changes carry all their sources, explanations are
year-specific, causes are inspectable one by one, regression tests pass.

## Milestone C — Reality Seam

**1. Implemented**: [XR_INTERACTION_SPEC.md](XR_INTERACTION_SPEC.md). Both
futures lie on the table aligned tile for tile; a movable boundary shows
Future A west of it and Future B east of it. Hand pinch on a golden handle,
ray / mouse drag over the table, ← / → keys, and a contextual Plan-pad button
(only while the futures are open); G toggles. Under the near edge, a two-line
label says what differs in the column under the seam, from the two
projections only. Causality Vision rings on the futures are cut by the same
seam. The HUD mode line names it ("Reality Seam: A Your plan | B … - 2050
projection").

**2. Files changed**: `src/interactions/reality-seam.ts` (new),
`src/world/split-system.ts`, `src/world/causality-system.ts`,
`src/core/session.ts`, `src/core/commands.ts`, `src/gameplay/flow-system.ts`,
`src/ui/panel-system.ts`, `src/ui/view-label.ts`, `public/ui/actions.uikitml`;
tests `tests/unit/reality-seam.test.ts`, `tests/e2e/split.spec.ts`;
`scripts/visual/reality-seam.mjs`; docs above + checklist rows H11–H12, P4b.

**3. Bugs found while building it**: seam labels were created invisible and
transparent (shared card factory) — given full opacity; the comparison strip
sat on the board in seam mode — hidden there (the seam label replaces it);
long seam lines were cut — text now shrinks to fit.

**4. Tests**: unit `reality-seam.test.ts` (4: mapping both ways and clamping,
one-column steps, report grounded in the plans and sprawl, identical plans →
no difference anywhere); e2e "reality seam" (open from the tabletop, mouse
drag, keys onto your neighbourhoods, report text, side by side, merge, plan
unchanged); IWER hand pass in `reality-seam.mjs` (pinch handle, sweep,
release).

Evidence: `docs/visual/mc-1-seam-middle.png`, `mc-2-seam-dragged-west.png`,
`mc-3-seam-causality.png`, `mc-4-xr-hand-drag.png`, `mc-log.txt`.

**5–6. Results (clean run)**

| Check | Status |
|---|---|
| `tsc --noEmit` | PASS |
| Unit (213) | PASS |
| E2E desktop (36 passed, 4 skipped env-gated) incl. "reality seam" | PASS |
| IWER hand scripts xr-phase1/2/3 | PASS (emulator) |
| IWER Reality Seam hand pinch-drag (pinch held, u 0.50 → 0.74, release keeps it) | PASS (emulator) |
| Production build | PASS |

**7. Desktop**: PASS. **8. XR**: IWER PASS (hand); controller and Quest NOT TESTED.

**Performance (IWER, not a Quest)**: seam mode 128 draw calls / 254 k
triangles (side by side ~116 / 314 k). No further optimisation without
device evidence (levers listed in the spec).

**9–10. Limitations / risks**: the seam is vertical (north–south) only; the
seam label summarises one column (not the whole half); controller grab and
real hand tracking unverified.

**11. Acceptance**: met for C — aligned dual-future comparison from the
scenario projections, working desktop interaction, hand interaction in the
emulator, performance measured, XR validation steps documented.

## Milestone D — Mira and the hero neighbourhood

**1. Implemented**

- **Character** (`scripts/assets/build_people.py` → `public/models/people.glb`,
  quantized 467 KB): Mira now has a head with its pivot at the neck, eyelids,
  a calm neutral mouth besides the smile and the frown, and a left arm with
  its own shoulder pivot. In the street (`street-system.ts`): her head follows
  your eyes (pitch / yaw limited), she nods as each line starts, blinks on a
  steady rhythm, and **points at the place a line is about** (the park, the
  unplanned houses) — the real tile, converted to street coordinates.
  Reduced motion: no nod / blink / sway.
- **Expressions** (`expressionFor`): happy where her neighbourhood thrives,
  calm and thoughtful otherwise — never staged misery.
- **Grounded lines** (`mira-dialogue.ts`), each only when its facts hold:
  "The trees in our park have grown so much." (park nearby, nature on target),
  "I can walk to the park with my friends." (her homes, road-connected, park
  nearby), "We have to walk farther to find somewhere shady." (no park nearby,
  ≥ 25 % trees lost), "My friends live in the houses around here." (no planned
  street here, unplanned houses nearby). At most six lines.
- **The unplanned future is credible, not propaganda**: residents stand
  outside the unplanned houses (the model puts its sprawl residents there),
  dry grass on worn yards instead of sand, a grey smog haze instead of a
  desert tint (`street-dressing.ts` `createDryGrass`, yard material, haze colours).
- **Occlusion**: `miraOccluded()` casts rays from your eyes to her head and
  chest against everything solid in the street.

**2. Files changed**: `scripts/assets/build_people.py`,
`public/models/people.glb`, `src/world/child.ts`, `src/world/mira-dialogue.ts`,
`src/world/street-system.ts`, `src/world/street-dressing.ts`,
`scripts/visual/mira2.mjs`; tests `tests/unit/mira-dialogue.test.ts`,
`tests/e2e/street.spec.ts`.

**3. Found and fixed**: the unplanned future read as a desert (sand-coloured
yard texture + brown haze) although the model computes poor air and dry land,
not desertification; Mira frowned in every non-thriving future; nobody else
lived in the unplanned street although the projection houses thousands there.

**4. Tests**: unit (+3): what she points at is a real park / sprawl tile
within two tiles and matches the line; the brief's lines appear only with
their facts; expressions. E2E "Mira 2.0" now also checks: no occlusion in both
futures, happy vs neutral, residents present where nobody planned, pointing
during a line about a place.

Evidence (desktop): `docs/visual/md1-3-talk-other-future.png` (pointing at the
park), `md1-5-future-B-other.png`, `md-*` (clean run).

**5–6. Results (clean run)**

| Check | Status |
|---|---|
| `tsc --noEmit` | PASS |
| Unit (216) | PASS |
| E2E desktop (36 passed, 4 skipped env-gated) incl. extended "Mira 2.0" | PASS |
| IWER hand scripts xr-phase1/2/3 | PASS (emulator) |
| Mira capture, perf audit: 0 page errors; no leak over 8 visits | PASS |
| Production build (11 MB) | PASS |

**Performance (IWER, not a Quest)**: street with Mira 172 draw calls / 108 k
triangles (was ~168 / 89 k before look-dev + D: shadows, dressing, Mira's
extra parts); unplanned street 150 / 55 k. **7. Desktop** PASS; **8. XR**
IWER PASS, Quest NOT TESTED.

**9–10. Limitations / risks**: conversational distance stays ~3 m (the
composition of the garden viewpoint), closer than that she would fill the
view on desktop; pointing uses a simple shoulder rotation (no elbow);
gestures are not tested on a headset.

**11. Acceptance**: met for D.

## Milestone E — Competition polish

**1. Implemented**

- **The five-minute slice** ([COMPETITION_DEMO_SCRIPT.md](COMPETITION_DEMO_SCRIPT.md)),
  seven interactive steps, each waiting for the user's own action: one
  choice → **travel to 2050** (the decision card re-explains the choice in
  that year; the 2050 year button pulses) → split → **move the Reality Seam**
  → enter a future → talk to Mira (she points at what she names) → the other
  future; closing card **"The future isn't written. Change it."** (Keep
  planning / Replay intro). Skip intro, Skip tips (H), Replay intro (I).
- **Contextual controls**: while the futures are compared, Undo / Save plan /
  Finish step aside and Reality Seam appears (one primary action per stage);
  the HUD shows one instruction at a time (the status line hides while a
  step is shown — the decision card still reports each action); the street
  panel's two "Next" buttons are now "Next line" (Mira) and "Prev spot /
  Next spot" (viewpoints).
- **Time travel explains itself**: changing the year re-shows the decision
  card for that year (~7 s), not only the first time.
- Accessibility kept: reduced motion, larger text, sound levels, desktop
  keys for every step.

**2. Files changed**: `src/gameplay/tutorial.ts`, `src/gameplay/tutorial-system.ts`,
`src/core/commands.ts`, `src/core/session.ts`, `src/ui/panel-system.ts`
(contextual controls, `uiDisplay` hook), `src/ui/flow-panels.ts`,
`src/world/causality-system.ts`, `src/world/split-system.ts` (tagline),
`src/world/street-system.ts`, `public/ui/street.uikitml`; tests
`tests/unit/tutorial.test.ts`, `tests/e2e/polish.spec.ts`;
`scripts/visual/first-five.mjs`; docs (demo script, checklist section 5).

**3. Found and fixed**: the step for the seam never completed from the
keyboard (the tutorial did not listen to the seam); after the first few
seconds, travelling to 2050 showed no explanation at all.

**4. Tests**: unit `tutorial.test.ts` (4: the seven steps in order, one
action per step, replay / skip, hint tiles); e2e "the first five minutes"
(all seven steps end to end incl. 2050 card year and seam move, closing
card, replay keeps the plan) and "contextual controls".

Evidence: `docs/visual/me-1-every-city.png` … `me-8-the-future-is-built.png`
(incl. `me-4-in-2050.png`, `me-5b-seam.png`, `me-6-mira-points.png`), `me-log.txt`.

**5–6. Results (clean run)**

| Check | Status |
|---|---|
| `tsc --noEmit` | PASS |
| Unit (215; the tutorial suite was rewritten: 5 → 4 tests) | PASS |
| E2E desktop (37 passed, 4 skipped env-gated) | PASS |
| IWER hand scripts xr-phase1/2/3; IWER seam pinch-drag | PASS (emulator) |
| First-five capture, 0 page errors | PASS |
| Production build (11 MB) | PASS |

**7. Desktop**: PASS. **8. XR**: IWER PASS; Quest NOT TESTED (checklist
section 5 is the on-device run of this slice).

**9–10. Limitations / risks**: the slice is text-guided (no voice-over);
time to complete for a first-time user is unmeasured; desktop panels are
still floating panels projected in screen space (not a separate HTML
layout).

**11. Acceptance**: met for E in code, desktop and emulator. The final
standard — a first-time user understanding the loop without explanation —
needs real users on a Quest.
