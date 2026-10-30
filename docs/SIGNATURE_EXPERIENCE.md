# TerraCity — The Signature VR Experience

Promise: **From Your Hands to Your Future.** Vertical slice:
BUILD → PERSONALIZE → ENTER → TIME TRAVEL → COMPARE, hands only, seated.
Milestones are reviewed one at a time; this file records each one.

| Milestone | Status |
|---|---|
| 1 — Beautiful neighbourhood | **implemented, awaiting visual review** |
| 2 — Enter Your City (tabletop → human scale) | not started |
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
