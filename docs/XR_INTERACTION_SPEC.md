# XR interaction spec — Reality Seam (and the inputs it shares)

Sources: `src/world/split-system.ts` (seam visuals and input),
`src/interactions/reality-seam.ts` (pure mapping and report),
`src/core/commands.ts` (`toggleSeam`, `setSeam`, `nudgeSeam`),
`src/core/session.ts` (`seamPos`). Tests: `tests/unit/reality-seam.test.ts`,
`tests/e2e/split.spec.ts` ("reality seam"), IWER pass in
`scripts/visual/reality-seam.mjs`.

## What it is

With the two futures open, **Reality Seam** lays both on the table at the
same place and scale as the table itself — tile for tile aligned — and a
boundary across the board shows Future A (your plan) west of it and Future B
(saved plan or "if nobody plans") east of it. Moving the boundary reveals how
the same location differs. Both halves are the scenarios' own projections
(`createMiniBoard` of each plan for the shown year); clipping only chooses
which one is visible where.

State: `seamPos` = u in [0.03, 0.97] west → east, or null (side by side).
The plan is never edited in this mode (tested: identical before / after).

## Inputs

| Input | Action | Status |
|---|---|---|
| Hand (pinch) | Pinch the golden handle on the near edge of the table (an invisible `OneHandGrabbable` sphere, r = 3.5 cm, riding on the knob) and move the hand sideways; only x is used; on release the handle snaps back to the knob | IWER: PASS (pinch held, u 0.5 → 0.74, release keeps u). Quest: NOT TESTED |
| Controller | Same handle with squeeze (IWSDK grab) | NOT TESTED |
| Ray / mouse | Press anywhere over the table (invisible `RayInteractable` plane 4.5 cm above the board) to bring the seam there; drag to move; pointer capture keeps the drag | Desktop: PASS (e2e). XR ray: implemented, not scripted |
| Keyboard | ← / → one column; G toggles the seam | Desktop: PASS |
| Button | Plan pad "Reality Seam" / "Side by side" — shown only while the futures are open (contextual) | Desktop: PASS |

Affordances: a thin wall of light along the seam, a glowing golden knob with
a halo, side labels "< A Your plan" / "B … >" at the far edge, and under the
near edge a two-line label of what differs in the column under the seam,
e.g. "A Your plan: homes x2, road, open land / B If nobody plans: unplanned
houses x4" (or "the same in both futures").

## Comfort

The seam moves the world's content, never the viewer: no camera motion, no
teleport, no scale change of the user. Entering seam mode animates the
futures back onto the table over 0.8 s (instant with reduced motion). No
flashing; the wall is a steady low-opacity glow.

## Performance (IWER, desktop GPU — not a Quest)

Seam mode renders both miniature boards with per-future clipping planes:
124 draw calls / 254 k triangles in the measured state, versus ~116 / 314 k
side by side (`cg-perf.json`). Clipping discards fragments but not vertices,
so vertex cost is that of two boards. Not optimised further without device
evidence; candidates if a Quest drops frames: hide per-tile objects fully on
the wrong side of the seam, or merge each mini board per column so whole
columns can be culled.

## Quest test (to do on the device)

Added to [QUEST_VALIDATION_CHECKLIST.md](QUEST_VALIDATION_CHECKLIST.md),
section 3 (H11–H12) and 5.
