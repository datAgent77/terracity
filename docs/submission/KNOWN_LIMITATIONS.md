# Known limitations (honest list)

1. **No physical headset testing.** The developer had no Meta Quest. All XR
   behaviour was verified in Meta's IWER emulator (Meta Quest 3 profile). Real
   hand-tracking reliability, comfort and legibility are untested.
2. **Frame rate on Quest is unmeasured.** Desktop render cost is ~95 draw calls
   and ~12k triangles for a full plan, with one 1024² shadow map. The 60 fps
   requirement could not be confirmed.
3. **Fingertip poke on panels is unverified**; point-and-pinch rays are verified.
4. **Passthrough is not room-aware.** The board appears at a fixed seated
   position; no scene understanding or anchoring to a detected table.
5. **Simulation is a stylized game model**, not a planning or engineering tool
   (see SIMULATION_ASSUMPTIONS.md).
6. **Desktop fallback**: panels overlay the 3D view; "Larger text" makes the HUD
   cover the left edge of the board.
7. **Third-party license question**: `@drawcall/uikitml` (a dependency of the
   IWSDK) declares no license; see ATTRIBUTION.md.

## Visual overhaul (branch `feature/premium-visual-overhaul`, V1–V2)

8. Richer world geometry roughly triples triangle count (~35k per eye for our
   content); draw calls rose ~10 %. Measured only in desktop/IWER software
   rendering — **not** on a Quest.
9. The comparison view roughly doubles triangles while open (two full-detail dioramas); unmeasured on Quest.
10. Sea-level rise on beaches is illustrative (stylised creep), not a flood depth.
11. The first-transition shader compile was removed (0 programs compiled on the
    switch), but worst-frame times in software-rendered IWER stay noisy
    (150–933 ms); no frame-time improvement is claimed and Quest is unmeasured.

## Horizontal urbanism (illustrative)

- Tile scale (2.25 km²), villa parcel (1,250 m²) and household size (2.8) are
  illustrative assumptions; the land budget on the HUD does not affect scoring.
- Villa eras (2026 / 2035 / 2050) show illustrative technology adoption; rooftop
  solar, batteries and EV charging are not simulated.
- Homes are banned on steep hills (elevation 2+); there is no finer slope or
  wildfire model.
