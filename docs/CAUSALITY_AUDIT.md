# TerraCity — Causality audit (Milestone A, part 1)

Date: 2026-11-02. Branch `feature/causality` from `main` at `3133821` (live:
https://datagent77.github.io/terracity/, bundle `index-B7guFTIF.js`). Working
tree clean except untracked screenshots from an earlier session (left as is).

## Stack (verified from `node_modules`)

Meta IWSDK `@iwsdk/core` 1.0.1 (WebXR runtime, ECS, UIKitML panels, IWER
emulator), three.js r181 (`super-three` 0.181.0), `@iwsdk/cli` 1.0.1, Vite 7,
Vitest, Playwright. Assets: Blender 5.2-generated GLBs (`city-kit.glb`,
`people.glb`), CC0 HDR sky (Poly Haven).

## Baseline (measured in this environment)

| Check | Result |
|---|---|
| `tsc --noEmit` | OK |
| Unit (Vitest) | 168 / 168 |
| E2E (Playwright, desktop Chromium, software GL) | 30 passed, 3 skipped (env-gated profiling / visual-evidence specs) |
| IWER hand scripts `scripts/xr-phase{1,2,3}-test.sh` | exit 0 (each after a page reload) |
| Production build | OK, `dist/` 10 MB |
| Render cost, desktop tabletop (reference plan) | ~102 draw calls / ~87 k triangles |
| Render cost, IWER stereo tabletop | 224 draw calls / ~219 k triangles |
| Frame rate | **not meaningful here** (software rendering); **no Quest measurement exists** |

Three kinds of evidence are kept apart in this document: *desktop* (Chromium,
mouse/keyboard), *IWER* (Meta's WebXR emulator in Chromium, emulated hands),
*Quest* (physical headset — **never tested**).

## Systems

| System | Where | Status |
|---|---|---|
| City simulation (metrics, placement rules, budget) | `simulation/metrics.ts`, `placement.ts`, `core/game-state.ts` | Working and tested (unit) |
| 2026 / 2035 / 2050 projection | `simulation/projection.ts`, `config/projection.ts` | Working and tested (unit, e2e) |
| Land budget | `simulation/land-budget.ts` | Working and tested (unit); informational only |
| Plan A / Plan B | `core/commands.ts` (`savePlanA`, `restorePlanA`, `toggleCompare`), `simulation/compare.ts` | Working and tested (unit, e2e) |
| Save / reload | `localStorage` key `terracity.planA.v1` | **Partial**: Plan A persists; the current map (Plan B), year and preferences do not survive a reload |
| Simulation → visuals mapping (sprawl, haze, tree loss, greening, sea rise, eras) | `world/future-visual-state.ts`, `future-system.ts` | Working and tested (unit, e2e) |
| Split Reality (two-hand gesture, two futures, merge) | `interactions/two-hand-gesture.ts`, `world/split-system.ts`, `world/futures.ts` | Working and tested (unit, e2e, IWER hands); **unverified on Quest hand tracking** |
| Merge | `commands.closeFutures` | Working; it only closes the comparison — it never combines plans (stated nowhere in the UI yet) |
| Enter Future / human scale | `world/street-system.ts`, `street-view.ts` | Working and tested (e2e, IWER); comfort **unverified on Quest** |
| Become Small (pull a future to the face) | `world/split-system.ts` | Working (IWER hands); unverified on Quest |
| Mira (character, mood, dialogue) | `world/child.ts`, `child-narrative.ts`, `people.glb` | Working and tested (unit, e2e); narrative is template-based and deterministic |
| Street story lines | `world/street-story.ts` | Working and tested (unit) |
| Sculpt Time dial | `interactions/time-dial.ts`, `world/time-dial-system.ts` | Working and tested (unit, e2e mouse, IWER hand) |
| Tutorial (5 tips) | `gameplay/tutorial.ts`, `tutorial-system.ts` | Working and tested (unit, e2e) |
| Input: hands / controllers / mouse / keyboard | IWSDK grab + ray components, `placement-system.ts`, `flow-system.ts` | Working (desktop, IWER); **unverified on Quest** |
| UI (HUD, Plan pad, year panel, overlay, compare, street panel) | `public/ui/*.uikitml`, `ui/panel-system.ts`, `ui/flow-panels.ts` | Working; **dashboard-heavy** (see below) |
| Audio (procedural, spatial panning) | `audio/sfx.ts` | Working (desktop); not checked on Quest speakers |
| Causality (cause → effect for a decision) | — | **Missing** as a model. Partial pieces exist: per-action metric deltas in `game-state.ts` (`MetricDelta`), status line text, feedback ring (`world/feedback-system.ts`) |
| Explanation of *why* two futures differ | `simulation/compare.ts` (headline), `world/street-compare.ts` (4 rows) | Partial: numbers only, no cause |
| Quest validation checklist | — | Missing |
| Quality presets | — | Missing |

## The dashboard problem (from the current screenshots)

Tabletop (desktop): three large panels (HUD 380 px with four metric rows, land
line, tip, status, three chips and a button; the 10-button Plan pad; the year
panel) plus the time dial frame the city on three sides. Everything is visible
all the time; nothing is contextual.

Street (Mira): a large street tree right in front of the garden viewpoint; Mira
2 m from the camera so she fills the lower third; a speech bubble 1.1 m wide;
the street panel (title, year buttons, five story lines, four comparison rows,
three buttons) covering the lower right. Four focal points compete.

## Plan for Milestone A

1. **Information layers.** Layer 1 (always): year, plan, mode, one instruction.
   Layer 2 (contextual): the latest decision's effect, Mira's line. Layer 3
   (on request): full metrics, all planning controls, settings, detailed street
   story and comparison. A *Details* / *More* toggle opens layer 3.
2. **Street composition.** A garden viewpoint with a clear line of sight,
   Mira at a conversational distance (~3 m), a smaller bubble beside her head,
   a compact street panel (year, plan, return) with the rest behind *Details*.
3. **Save / reload.** Persist the current map and year with Plan A, with a
   version tag and validation on load.

Milestone B (Causality Vision) builds on `MetricDelta` and the projection.
