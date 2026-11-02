# Premium stylized look — iteration 1

Goal (user, 2026-11-02): a look that feels of its time and says "wow"; the
previous visuals still read as primitive. Direction chosen: **premium stylized**
(the "living diorama" family — soft volumes, warm light — rather than
photorealism, which is heavy and usually looks cheap on Quest).

## Why it looked primitive (diagnosis)

1. **No tone mapping** (`renderer.toneMapping = NoToneMapping`) and a flat
   gradient environment light: colours clipped, no light roll-off.
2. **The land was a grid of boxes** with brown cliff walls between tiles.
3. **Faceted foliage**: icosahedron crowns with flat shading; kit foliage had
   per-face baked occlusion, so even smooth normals looked faceted.
4. **Raised plank fields**, opaque turquoise water, a painted gradient sky.

## What changed

| Area | Change |
|---|---|
| Light | Image-based light from a CC0 HDR sky (Poly Haven, 1.4 MB), Neutral (Khronos PBR) tone mapping, warmer stronger sun, calmer palette |
| Land | One continuous surface (`world/terrain-surface.ts`): flat plateaus at every tile's exact height (grid, placement and simulation untouched), smooth banks between heights, rocky colour on steep banks, beaches sloping under the water, sea/river beds below the surface, soft colour blending and painterly noise; earth skirt around the edge |
| Trees | Lobed, smooth-shaded crowns with a dark-underside / sunlit-top gradient for every decor tree (olive, umbrella pine, round, cypress, shrub); the street uses the same shared geometry |
| Kit | Foliage faces smooth-shaded with per-position occlusion; rounder street trees |
| Water | Reflective (sky in the sea), translucent, drifting procedural ripple normal map |
| Fields | Thin painted furrows instead of raised planks |
| Street | The real HDR sky behind the street in clear air; the tinted smog dome when the environment collapses (`haze` ≥ 0.15) |

Evidence: `docs/visual/pv-compare-{board,close,street,mira}.png` (left before,
right after), `pv8-*`, `pv8m-*`.

## Cost (desktop Chromium + IWER, not a Quest)

The first version of the soft trees used 12×9 spheres with 4–5 lobes: IWER
stereo jumped from 157 k to **812 k triangles** and six e2e tests timed out on
the software renderer. Fixed: 6×4 spheres, 1–3 lobes, open trunks, no shadow
casting for ground cover, terrain at 6 quads per tile. Now: desktop tabletop
start 87 k (was 62 k), IWER stereo tabletop **209 k** (was 157 k, +33 %), draw
calls unchanged (224). Build 9.6 MB (HDR sky 1.4 MB). Quest frame rate is
unmeasured.

## Tests

Unit 168 / 168; Playwright 30 passed, 3 skipped; IWER hand scripts exit 0;
GODMODE demo path 0 page errors; build OK.

## Still to do (next iterations, in order of impact)

1. People and Mira: proper stylized characters (they are still primitives).
2. Structures sit on square pads/plates; blend them into the land.
3. Buildings: softer edges (bevels), richer roofs, window depth.
4. Ambient life on the tabletop (moving boats exist; add cars/people specks).
5. Quest performance budget for all of the above (unmeasured on device).

## Iteration 2 — Mira and the people

`scripts/assets/build_people.py` (Blender, reproducible, no third-party assets)
→ `public/models/people.glb` (457 KB quantized):

- **Mira, 9**: big friendly head with eyes and highlights, nose, rosy cheeks,
  fringe and two pigtails with yellow ties; one A-line dress (lathe profile:
  flared hem, fitted waist) with a white collar and a flower pocket; sandals.
  Her right arm is a separate node with its pivot at the shoulder (she waves).
  **Her expression follows the simulation**: two mouths (`mira-smile`,
  `mira-sad`); she smiles only in a thriving neighbourhood (environment target
  met) and looks sad in a parched or unplanned one — same deterministic state as
  her words (e2e-tested).
- **Four adults** (sun-hat and dress; short hair and white shirt; elder with cap
  and walking stick; ponytail) and a **seated rider** on the bicycles.
- Soft shading: smooth normals and a baked top-light gradient per vertex.
- Budget: Mira 4.6 k triangles (+0.3 k arm, +0.6 k mouth), adults 3.4–5.2 k,
  rider 3.7 k; only the street view shows them (~8 pedestrians + 2 riders).

Evidence: `docs/visual/pp3-1-before-line1.png` (sad, dry garden) vs
`pp3-2-after-rewrite-line1.png` (smiling, garden in flower); `pp3x-*` (IWER).

Tests (iteration 2): unit 168 / 168; Playwright 30 passed, 3 skipped after
giving *the last child* (three street visits, two plans) a 180 s budget — it
took 1.8 min under software rendering, beyond the 90 s default; the new mood
assertions pass (sad before the rewrite, smiling after). IWER hand scripts exit
0; IWER Mira and Become Small hand flows pass; build OK.
