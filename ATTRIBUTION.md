# Third-party software and assets

TerraCity's 3D models, terrain, and sound effects are all **generated in code**
(procedural low-poly geometry and WebAudio synthesis). The project ships **no**
third-party 3D models, textures, map data, satellite imagery, or audio files.

Runtime libraries bundled into the build (versions from `package-lock.json`):

| Package | Version | License | Notes |
|---|---|---|---|
| `@iwsdk/core` (Meta Immersive Web SDK) | 1.0.1 | MIT | WebXR runtime, ECS, IWER emulator (dev only) |
| `three` (as `super-three`) | 0.181.0 | MIT | Rendering |
| `@pmndrs/uikit`, `@pmndrs/uikit-horizon` | 1.0.78 | MIT (Copyright 2024 Bela Bohlender) | Spatial UI |
| `@pmndrs/uikit-lucide` | 1.0.78 | MIT; icon artwork from [Lucide](https://lucide.dev), ISC license | 19 icons are used |
| `@pmndrs/handle`, `@pmndrs/pointer-events` | 6.6.32 | MIT | Grab / pointer input (via IWSDK) |
| `@pmndrs/msdfonts` | 1.0.78 | Fonts under SIL OFL 1.1 / Apache 2.0 (see its LICENSE) | Inter UI font (via IWSDK) |
| `@preact/signals-core` | 1.14.5 | MIT | Reactive state (via IWSDK) |
| `elics`, `three-mesh-bvh`, `yoga-layout`, `zod` | 3.4.2 / 0.9.16 / 3.2.1 / 4.6.7 | MIT | IWSDK internals |
| `@drawcall/uikitml` | 0.1.8 | **Not declared** in its package (no license field or file) | Transitive dependency of `@iwsdk/core` (UIKitML parser). Open question; to be confirmed before submission. |

Development-only tools (not shipped): TypeScript, Vite, Vitest, Playwright,
`@iwsdk/cli`, `@iwsdk/vite-plugin-dev`, `@iwsdk/reference`, `@meta-quest/metavr`.

## 3D assets

`public/models/villa-district.glb` (geometry, texture atlas, baked occlusion) is
generated in this repository by `scripts/assets/build_villa_district.py` and is
covered by the project's MIT license. No third-party models, textures or HDRIs
are used. Blender 5.2 (GPL) is a development tool only; its output is not GPL.
