# TerraCity — Progress

Deadline: 2026-11-18 12:00 PT.

## Done
- **Phase 0 — feasibility spike** (2026-10-27). See [PHASE0_REPORT.md](PHASE0_REPORT.md).
  - IWSDK 1.0.1 project (mixed-reality target, grabbing on, hand pinch-to-grab on).
  - Deterministic 14×10 coastal terrain (sea, beach, river, farmland, plain, hills,
    protected forest, existing town) rendered as a procedural diorama.
  - One residential neighbourhood movable by hand pinch, controller squeeze (code
    path; not emulator-verified), ray/mouse tap-to-select + tap-to-place, and
    keyboard arrows — all routed through one `GameState.place()`.
  - Live green/red tile feedback and cause→consequence HUD line.
  - 18 Vitest unit tests, 4 Playwright desktop e2e tests, scripted IWER hand test.

- **Phase 1 — gameplay foundation** (2026-10-27). See [PHASE1_REPORT.md](PHASE1_REPORT.md).
  - Five structures, supply tray, rules engine, budget, road access + bridges,
    four live metrics vs. 2050 targets, undo/redo/restart, cause→consequence HUD.
  - 69 unit tests, 7 desktop e2e tests, 5-scenario IWER script (hands + controller).
  - `SIMULATION_ASSUMPTIONS.md`.

- **Phase 2 — signature experience** (2026-10-27). See [PHASE2_REPORT.md](PHASE2_REPORT.md).
  - 2026/2035/2050 time control, transparent projections, animated future visuals.
  - Plan A/B save, restore, side-by-side 2050 comparison; timed challenge with
    win/lose summary, hints, replay, pause.
  - 86 unit tests, 13 desktop e2e tests, hands-only IWER script for the full loop.

## Next (Phase 3 — not started; awaiting go-ahead)
- Guided onboarding (first placement walkthrough), sound effects.
- Visual polish (lighting, water shader, sprawl/flood look), desktop camera/layout.
- Accessibility (text size, colour-blind safe markers), performance (code-split).

## Open blockers / risks
- No physical Quest: all XR evidence is IWER emulation only.
- Main JS chunk is 6.5 MB (1.7 MB gzip); needs code-splitting in Phase 3.
- Production build ships without IWER, so desktop judges get the mouse/keyboard
  path; an emulator-enabled public build is an open decision.
