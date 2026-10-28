# TerraCity — Shape Tomorrow

*Build a city with your hands. See its future before it happens.*

**Track:** Gaming · **Division:** New Experience (started 2026-10-27, after the
competition opened) · **Platform:** WebXR / Immersive Web SDK, Meta Quest browser

## Inspiration

City-planning arguments are about the future, but we only ever see the present.
Build homes on farmland and nothing looks wrong today; the cost shows up years
later as imported food, sprawl and a lost coastline. We wanted a tabletop game
where you can hold the city in your hands, make a choice, and *jump forward in
time* to see what that choice does — then change your mind.

## What it does

TerraCity is a seated, hands-only mixed-reality strategy game. A miniature
Mediterranean coastal region sits on your real table. In seven minutes you plan
it for 2050:

1. **Build** — pinch homes, solar farms, wind turbines, parks and roads from a tray
   and drop them on the map. Steep hills cost more, beaches and protected forest
   are off-limits, and homes only count once a road connects them to the town.
2. **See consequences** — every placement pulses on the board and the four metrics
   (people housed, environment, budget, renewable share) animate with a one-line
   cause → effect explanation.
3. **Travel through time** — tap **2035** or **2050**. Newcomers you didn't plan
   for spread as grey sprawl, the sea floods the beaches, coastal sites need sea
   walls, parks grow, and the land dries as the environment declines.
4. **Compare futures** — save Plan A, try a Plan B, and see both 2050 cities side
   by side with a one-line verdict.
5. **Win** by reaching a balanced 2050: 28,000 people housed, environment 60+,
   80% renewable, budget not overspent. A plan that looks fine today can fail in
   2050 — that is the point.

## How we built it

- Meta **Immersive Web SDK** 1.0.1 (WebXR, ECS, UIKitML spatial UI) with
  TypeScript and Vite; hand pinch-to-grab, wrist rotation, ray and poke UI.
- A pure, deterministic rules engine (placement, metrics, projections, plan
  comparison) shared by every input path, with immutable plan snapshots for exact
  undo/redo. Every rule is documented in `SIMULATION_ASSUMPTIONS.md`.
- All 3D content is procedural low-poly geometry; all sound is synthesised with
  WebAudio. No third-party models, textures, maps or audio.
- Tested with 91 unit tests, 20 browser end-to-end tests and scripted hand
  sessions in Meta's **IWER** XR emulator.

## Challenges

We had no Quest headset, so every hand interaction was developed and verified in
the IWER emulator. That surfaced real issues: a poke target under the board
starved pinch-grabs of movement, near and ray grabs can't share one object, and a
panel layout that pushed buttons behind another panel. We fixed each one and
wrote scripts that replay the hand sessions.

## What we learned

Time travel makes trade-offs legible: players stop asking "is this allowed?" and
start asking "what will this do in 2050?".

## What's next

- Test and tune on Meta Quest 3/3S (60+ fps, hand-tracking comfort, poke targets).
- Anchor the board to a detected real table (scene understanding).
- More regions and challenges; a shareable plan code.

**Target launch date:** _TBD by the team_ (to be filled in before submission).

## Honest notes

Developed without a physical headset (emulator only). The simulation is a
stylized game model, not a planning tool.
