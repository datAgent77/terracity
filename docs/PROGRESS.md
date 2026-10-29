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

- **Phase 3 — polish** (2026-10-28). See [PHASE3_REPORT.md](PHASE3_REPORT.md).
  - Guided tips, synthesised sound, shadows/sky/water/boats, hand hover, larger
    text, colour-independent cues, reduced motion.
  - Draw calls 224 → ~95; main bundle 6.6 MB → 2.4 MB (0.68 MB gzip).
  - 91 unit, 19 e2e (dev) + 17 e2e on the production build, IWER hand script.

- **Phase 4 — submission** (2026-10-28). See [PHASE4_REPORT.md](PHASE4_REPORT.md).
  - Live: https://datagent77.github.io/terracity/ · repo github.com/datAgent77/terracity (MIT).
  - FoV-aware layout, judge docs, 2:01 silent emulator video + voice-over script,
    screenshots. Remaining: voice-over, video upload, launch date, Devpost form.

- **Visual overhaul V1–V5** (2026-10-29, merged to main). See
  [VISUAL_OVERHAUL_REPORT.md](VISUAL_OVERHAUL_REPORT.md): Mediterranean world and
  assets, simulation-driven time-travel visuals, two-futures comparison, XR UX
  polish, success/failure moments. 115 unit, 24 e2e, IWER hand scripts pass.
  The demo video in `video/` predates the overhaul and needs re-recording.

## Open blockers / risks
- No physical Quest: all XR evidence is IWER emulation only. Finger poke on
  panels and real-hand ray accuracy remain unverified.
- Production build ships without IWER, so desktop judges get the mouse/keyboard
  path; an emulator-enabled public build is an open decision.

## 2026-10-29 — Horizontal urbanism (branch `feature/horizontal-urbanism`)

Garden districts of detached 1–2 storey villas with three eras, compact 3–4 storey
town centre, tree-lined streets, low-rise sprawl, informational land budget (HUD),
zoning change: no homes on steep hills. Unit 122/122, e2e 25 passed / 2 skipped,
XR hand scripts pass, build OK. See docs/HORIZONTAL_URBANISM_DESIGN.md.
Not yet merged or deployed; demo video predates this change.
