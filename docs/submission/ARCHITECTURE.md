# Architecture

TypeScript + Meta Immersive Web SDK 1.0.1 (Three.js r181 via `super-three`,
ECS via EliCS), built with Vite. Everything is procedural: no 3D model, texture or
audio files.

```
input (hand pinch / controller / ray / mouse / keyboard)
      │
      ▼
src/interactions/   ECS systems: placement, hover        src/ui/   UIKitML panel bindings
      │                                                     │
      ▼                                                     ▼
src/core/commands.ts ──► src/core/game-state.ts (immutable plan snapshots, undo/redo)
                              │
                              ▼
            src/simulation/  pure, deterministic rules
              placement.ts   terrain limits, slope/bridge costs, budget
              metrics.ts     population (road access), environment, budget, renewables
              projection.ts  2035/2050 trends (sprawl, electrification, sea level…)
              compare.ts     Plan A vs Plan B
                              │
                              ▼
src/world/   terrain + procedural models, reconciled from state; future visuals,
             feedback pulses, ambient, A/B mini dioramas
src/gameplay/ challenge (7-min timer, 2050 judgement, hints), tutorial, flow
src/audio/   WebAudio-synthesised effects
```

Key properties

- **One rules engine for every input path.** Hands, controllers, rays, mouse and
  keyboard all end in the same `GameState` actions.
- **Visuals never own state.** After each change the scene is reconciled from the
  current plan, which keeps undo/redo exact.
- **Pure simulation.** `src/simulation` and `src/gameplay` have no IWSDK imports
  and are unit-tested in Node. Assumptions: [SIMULATION_ASSUMPTIONS.md](../../SIMULATION_ASSUMPTIONS.md).
- **Performance.** Static meshes merged per material (≈95 draw calls for a full
  plan); production build ships 19 of ~1,600 Lucide icons (2.4 MB JS, 0.68 MB gzip).
