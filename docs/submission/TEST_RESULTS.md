# Test results (as of 2026-10-28)

| Suite | Command | Result |
|---|---|---|
| Type check | `npm run typecheck` | 0 errors |
| Unit (simulation, rules, undo/redo, projections, comparison, challenge, tutorial, icon subset) | `npm test` | **91 / 91 passed** |
| Desktop browser e2e (dev server) | `npx playwright test` | **20 / 20 passed** (run twice in a row) |
| Desktop browser e2e on the production build | `E2E_BASE_URL=… npx playwright test` (vite preview) | **17 / 17 passed** |
| IWER emulator, hands + controller building | `scripts/xr-phase1-test.sh` | 5 / 5 scenarios |
| IWER emulator, hands only: start, time travel, read-only future, save, finish | `scripts/xr-phase2-test.sh` | 5 / 5 steps |
| IWER emulator, hands only: tips, hover, larger text, skip tips | `scripts/xr-phase3-test.sh` | 5 / 5 steps |
| Production build | `npm run build` | succeeds |

Required simulation tests from the brief — all present in `tests/unit/`:
farmland conversion penalties, slope restrictions, budget constraints, renewable
energy calculation, undo/redo consistency, deterministic time projection, save and
compare scenarios.

Not tested: physical Meta Quest hardware (none available), fingertip poke on
panels, frame rate on device. Per-phase details: `docs/PHASE0_REPORT.md` …
`docs/PHASE3_REPORT.md`.
