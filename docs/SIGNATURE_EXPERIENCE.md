# TerraCity — The Signature VR Experience

Promise: **From Your Hands to Your Future.** Vertical slice:
BUILD → PERSONALIZE → ENTER → TIME TRAVEL → COMPARE, hands only, seated.
Milestones are reviewed one at a time; this file records each one.

| Milestone | Status |
|---|---|
| 1 — Beautiful neighbourhood | approved (2026-10-30) |
| 2 — Enter Your City (tabletop → human scale) | **implemented, awaiting interaction review** |
| 3 — Time travel in the neighbourhood | not started (tabletop time travel already exists) |
| 4 — Compare futures in the neighbourhood | not started (tabletop Plan A/B exists) |
| 5 — Experience polish | not started |

## Milestone 1 — Beautiful neighbourhood

**Scene 1 (Build), as it works today:** the tutorial highlights a glowing
buildable tile next to the town; the Homes piece in the tray is the
neighbourhood; the player pinches it, carries it and releases it on the tile.
Placement validation and the simulation are unchanged.

What this milestone changed (branch `feature/signature-vr-m1`):

- **Hero neighbourhood assets** (`scripts/assets/build_villa_district.py`, built into
  `public/models/city-kit.glb`): six distinct detached villas (no attached
  houses, no apartments) on separate hedged / walled gardens, now with stone
  window surrounds and sills, shutters, ridge caps, chimneys on traditional
  homes, gate pillars, sun loungers and parasols by the pools, street lamps,
  twin-trunk olives and pointed cypresses; texture atlas doubled to 1024²
  (256 px per material) so close-ups and the later street-level scene stay crisp.
- **Real street connections** (`src/world/district-links.ts`, unit-tested): the
  district street is turned to meet an adjacent road or the town when that is the
  only way it can (rotation is visual-only), and each street end facing a road or
  the town gets a bell-mouth junction with a zebra crossing (kit part
  `district-link`), on the main board and in the Plan A/B dioramas.
- **Placement animation**: a newly placed structure grows up from its parcel with
  a soft overshoot (0.75 s); one dropped from a hand settles with a small squash
  (0.45 s). Skipped with reduced motion.

Not in this milestone (by the brief): the four architectural variants
(Personalize), the street-level scene, neighbourhood-level time travel and
comparison. The asset pipeline is ready for them: the same generator can emit
the variants and a street-level LOD of the same six villas.

### Evidence (running application, `docs/visual/m1-*`)

- `m1-villa-zoom.png` — close view of the neighbourhood (desktop, debug camera)
- `m1-1-desktop.png` / `m1-2-desktop-closeup.png` — normal desktop view and close-up
- `m1-3-xr-seated.png` / `m1-4-xr-closeup.png` — IWER Quest 3 profile, seated and leaning in
- `m1-5..7-district-{2026,2035,2050}.png` — the same neighbourhood across eras
- `m1-desktop-*.png` — full desktop flow (VISUAL_TAG=m1), incl. Plan A/B dioramas

### Tests

Typecheck OK; unit 132 / 132 (new `district-links.test.ts`); Playwright 24 passed,
3 skipped (env-gated); visual evidence run passed; IWER hand scripts
`xr-phase1/2/3` exit 0 (each after a page reload); `npm run build` OK.

### Cost (desktop Chromium + IWER — not a Quest)

| Measure | Before M1 | M1 |
|---|---|---|
| District triangles per era | 4.0 / 5.0 / 5.7 k | 5.8 / 6.7 / 7.2 k |
| `city-kit.glb` (quantized) | 3.57 MB | 4.49 MB (atlas 1024², richer villas, link part) |
| IWER stereo seated, showcase plan — calls / tris | 206 / 136 k | 220 / 173 k |
| Desktop normal view — calls / tris | 97 / 59 k | 104 / 77 k |
| Production build | 7.0 MB | 7.9 MB |
| Time to app ready, 10 Mbit/s + 40 ms, cache off | ≈ 3.4 s (city kit) | 4.8–5.1 s |

Load time and triangle count keep rising; before Milestone 2 adds a street-level
scene, the district variants not on the board could be loaded lazily (the kit
currently carries 3 layouts × 3 eras up front) and the far town LOD simplified.
Quest frame rate remains unmeasured.


## Milestone 2 — Enter Your City

Branch `feature/signature-vr-m2`. **ENTER YOUR CITY**: from the tabletop to a
human-scale street in the player's own garden district.

**How it works**

- *Select*: the Plan pad has a large **Enter your city** button (hand ray / poke,
  or `E` on desktop). It enters the selected Homes neighbourhood, else the first
  one placed; it is dimmed until a neighbourhood exists.
- *Real 3D scene from the plan* (`src/world/street-system.ts`): the same models as
  the board, scaled 1:1000 → 1:1 — the visited district in its layout and current
  era, plus the 5 × 5 tiles around it as placed: neighbouring districts, the town,
  roads (with junctions), parks, solar farms, wind turbines, and the terrain
  (fields, forest, hills, sea, river). Tabletop pads are dropped (1.6 mm would be
  a 1.6 m plinth). A sky dome, distant hills and fog close the horizon inside the
  200 m far plane, and also cover passthrough in mixed reality. No panorama, no
  video.
- *Same buildings at both scales*: the street shows exactly the six villas of the
  district on the board (`m2-0-tabletop-district.png` vs `m2-1..4`).
- *Comfort*: the viewer never moves smoothly. Four fixed viewpoints
  (`src/world/street-view.ts`, unit-tested): down the street, at a gate, across
  the road, from the street end. Changing viewpoint fades to dark for ~0.2 s and
  places the scene under the viewer at eye height 1.65 m above the ground
  (seated or standing). Fades are skipped with reduced motion.
- *Hands only*: a street panel (large buttons: Previous / Next / Return to
  tabletop) and glowing standing markers at the other viewpoints — point and
  pinch a marker to teleport there.
- *Return to Tabletop*: always on the street panel (also `Esc`/`E`); restores the
  board, pieces, tray, panels and the desktop camera. Leaving XR while visiting
  also returns. The challenge clock is stopped while visiting, and editing is
  blocked until the player is back.

**Verified in IWER (Quest 3 profile, emulator)** with hands only
(`TAG=m2 XR=1 node scripts/visual/street.mjs`, `docs/visual/m2-log.txt`): hand
ray + pinch on *Enter your city* → street; pinch *Next* → viewpoint 2; pinch a
standing marker → viewpoint 4; pinch *Return to tabletop* → board back. (In this
Playwright + IWER setup the one-shot `select` command did not register a click;
an explicit pinch, select value 1 → 0, does.) Not tested on a physical Quest.

**Known limitations (for review)**

- The street uses the tabletop assets at 1:1: proportions are right, but it is a
  low-poly, stylised look up close (faceted tree crowns, flat window glass,
  128–256 px per material).
- Only the 5 × 5 tiles around the district are built; beyond them, fog and hills.
- Viewpoints are the same for every district: they stand on the street and
  sidewalks, which are identical in the three parcel layouts, and were checked
  visually for the captured district only — a gate view may face a different
  villa in another layout.
- Year: the street shows the era of the year being viewed; changing year from
  inside the street is Milestone 3.

**Tests**: typecheck OK; unit 135 / 135 (new `street-view.test.ts`); Playwright
25 passed, 3 skipped (new `street.spec.ts`: enter, clock stopped, viewpoints
wrap, return restores the board and editing); IWER hand scripts `xr-phase1/2/3`
exit 0; build OK. No simulation change.

**Cost** (desktop Chromium + IWER, not a Quest): street view desktop 36–63
calls / 12–24 k triangles per viewpoint; IWER stereo 148 calls / 63 k triangles —
lighter than the tabletop (220 / 173 k). The street reuses the loaded kit; no new
download (the new street panel is a small UIKitML file).

Evidence: `docs/visual/m2-0-tabletop-district.png` (the district on the board),
`m2-1..4-street-viewpoint-*.png` (desktop, four viewpoints),
`m2-5-returned-tabletop.png`, `m2-6-xr-street.png`, `m2-7-xr-panel.png`,
`m2-8-xr-after-marker.png` (IWER), `m2-log.txt`.
