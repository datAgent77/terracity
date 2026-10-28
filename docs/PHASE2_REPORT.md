# TerraCity — Phase 2 Report (signature experience)

Date: 2026-10-27 · Emulation only (IWER, Meta Quest 3 profile) — **no physical headset testing.**

## Scope delivered

| Requirement | Status | Where |
|---|---|---|
| Step B — consequences after every placement | ✅ animated metrics, pulse on the changed tile, extra pulse on homes whose road access changed, cause → consequence line | `src/ui/panel-system.ts`, `src/world/feedback-system.ts` |
| Step C — hand-operated time control 2026 / 2035 / 2050 | ✅ three large buttons (ray / poke / click, `T` key); future views are read-only | `public/ui/time.uikitml`, `src/core/commands.ts` |
| Transparent projections | ✅ six explicit trends, per-year `notes` shown on the HUD | `src/simulation/projection.ts`, `SIMULATION_ASSUMPTIONS.md` |
| Visible future | ✅ grey sprawl clusters rise, beaches flood, sea walls on at-risk sites, park trees grow, land dries as environment falls; ~0.8 s animated transition | `src/world/future-system.ts` |
| Step D — Plan A / Plan B | ✅ Save A, Restore A (undoable), Compare: two labelled 2050 miniature dioramas + a 4-row table with a one-line verdict | `src/simulation/compare.ts`, `src/world/mini-board.ts`, `public/ui/compare.uikitml` |
| Step E — win / lose, summary, replay | ✅ 7-minute timer, Finish plan, judged on the 2050 projection, one hint per missed target, Play again | `src/gameplay/challenge.ts`, `public/ui/overlay.uikitml` |
| Pause / resume | ✅ button, `P`, automatic when the headset is taken off (`VisibleBlurred`) | `src/gameplay/flow-system.ts` |

Balance change: budget 120 → **130** so that a plan which also survives the 2050
trends (electrification, sea defences) is affordable. Documented in the assumptions.

## Verification

```sh
npm run typecheck            # 0 errors
npm test                     # Vitest: 86 / 86 passed
npx playwright test          # desktop e2e: 13 / 13 passed (7 Phase 1 + 6 Phase 2)
./scripts/xr-phase1-test.sh  # see correction below
./scripts/xr-phase2-test.sh  # IWER, hands only, output below
npm run build                # succeeds
```

**New unit tests (17):** 2026 projection equals current metrics; determinism; sprawl
half/full shortfall and tile count; housing prevents sprawl; sprawl tiles never on
water/forest/occupied; electrification lowers coverage (28 × 1.1 demand); park
maturity and delayed farmland cost; sea-defence cost 2 / 4 and at-risk ids; the
reference plan wins in 2050; do-nothing fails three targets; **a plan at target in
2026 fails in 2050**; comparison winner per metric and headline; ties; challenge
flow intro → building → finished → replay; timer auto-finish only while building;
one hint per missed target; clock formatting.

**New desktop e2e (6):** editing blocked before Start; 2050 view explains sprawl and
refuses edits, `T` cycles, 2026 re-enables editing; Save A → build B → Compare →
Restore A → undo; reference plan wins and Play again returns to intro; farmland-heavy
plan loses with hints, and timer expiry ends the session; Pause freezes the clock.

**IWER, hands only** (`scripts/xr-phase2-test.sh`):

```
start state: phase=intro year=2026
== 1. Start via hand ray            -> phase=building
== 2. pinch Homes -> (6,4)          -> residential-1 placed, tray refilled
== 3. 2050 via hand ray             -> year=2050
== 4. pinch the placed homes in 2050
  before:          {"pos":[-0.03,0.8,-0.53],"grabbed":false}
  while pinching:  {"pos":[-0.03,0.8,-0.53],"grabbed":false}   (grab refused)
  after:           {"pos":[-0.03,0.8,-0.53],"grabbed":false}
== 5. ray-tap 2026, Save Plan A, Finish plan
  -> year=2026 ; planA=true ; phase=finished year=2050 success=false
```

This also closes a Phase 1 gap: **hand-ray taps on spatial UI** are now verified in
the emulator (Start, year buttons, Save Plan A, Finish).

Evidence (`docs/evidence/`): `phase2-intro.png`, `phase2-e2e-2050-sprawl.png`,
`phase2-e2e-compare.png`, `phase2-e2e-win.png`, `phase2-e2e-lose.png`,
`phase2-xr-intro.png`, `phase2-xr-2050.png`, `phase2-xr-result.png`.

> **Correction (2026-10-28, Phase 4):** this report originally said
> `xr-phase1-test.sh` "still passes". It had **not** been re-run in Phase 2, and it
> did not pass: the new intro card blocks editing until Start, and the script never
> pressed Start. The script now presses Start with a hand ray and passes all five
> scenarios again (verified 2026-10-28).

## Issues found and fixed

- **Pressing the same number key twice disarmed the structure** (toggle), so a second
  homes placement silently did nothing. Keyboard now always arms; only tray taps toggle.
- Empty UIKitML `div`s cannot receive text later — overlay lines got placeholder text.
- Mini boards were unlabeled and hidden behind the desktop time panel — labelled
  ("Plan A - 2050" / "Plan B - 2050") and spread apart.
- A grazing hand ray missed the leftmost year button in the test; the script now
  aims from in front of the target. (Real-hand aiming comfort remains untested.)

## Known limitations / open items

- No physical Quest testing: hand-ray accuracy on the small time panel, readability of
  mini boards at ~0.9 m, poke on panels, and comfort over a 7-minute session are unknown.
- Hand **poke** on panels is still not scripted (CLI 1.0.1 has no poke sequence).
- Desktop layout: ScreenSpace panels overlap parts of the board edges at 1280×800;
  Phase 3 should tune the desktop camera and panel sizes.
- Onboarding is a single card; guided first-placement tutorial, sound, and visual
  polish are Phase 3.
- Main JS chunk still ~6.5 MB.
