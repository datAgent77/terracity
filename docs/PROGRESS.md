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

## Next (Phase 1 — not started; awaiting go-ahead)
- Five structures (residential, solar, wind, park, road), building palette.
- Budget, population, environment, renewable metrics; slope/farmland costs.
- Undo/redo; `SIMULATION_ASSUMPTIONS.md`.

## Open blockers / risks
- No physical Quest: all XR evidence is IWER emulation only.
- Controller-squeeze grab not verified in the emulator (see report).
- Main JS chunk is 6.5 MB (1.7 MB gzip); needs code-splitting in Phase 3.
- Production build ships without IWER, so desktop judges get the mouse/keyboard
  path; an emulator-enabled public build is an open decision.
