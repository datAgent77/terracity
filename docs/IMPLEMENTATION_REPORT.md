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
