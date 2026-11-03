# TerraCity — Quest validation checklist

Everything in this repository so far was verified on **desktop Chromium** and
in Meta's **IWER emulator** (Quest 3 profile). **Nothing has been measured on a
physical Quest.** This checklist is for the person with the headset: fill in the
*Result* columns; until then, no frame-rate, comfort or hand-tracking claim is
made anywhere in the project.

## 0. Setup

| Item | How | Result |
|---|---|---|
| Device / OS build | Settings → About | |
| Browser | Meta Quest Browser version | |
| Build under test | live: https://datagent77.github.io/terracity/ (or a LAN dev server: `npm run dev`, open the https URL on the headset) — note the commit | |
| Performance overlay | OVR Metrics Tool (or `adb shell setprop debug.oculus.notifPerfHud`…): FPS, GPU %, CPU/GPU level, stale frames | |
| Quality preset | default (`high`); repeat any failing row with `?quality=low` (1024² shadow map, hard shadow filter, 85 % XR resolution, fixed foveation 1) | |
| Play position | seated, chair without armrests, ~60 cm reach | |

Target: the headset's display rate (72/90 Hz) with no sustained stale frames.
Write the **measured** numbers; "smooth" is not a result.

## 1. Performance (record FPS min / typical and GPU %)

Emulator reference counts for the same states (`docs/visual/cg-perf.json`,
desktop + IWER, stereo): these are the scene's cost, **not** frame times.

| # | State | IWER draw calls / triangles | Quest FPS (min / typ) | GPU % | Result |
|---|---|---|---|---|---|
| P1 | Intro card over the tabletop, 2026 | see cg-perf.json | | | |
| P2 | Reference plan, 2050 | | | | |
| P3 | Two futures apart (Split) | | | | |
| P4 | Two futures + Causality Vision (rings, card) | | | | |
| P4b | Reality Seam open, seam swept across the board | | | | |
| P5 | Street, your plan, Mira talking | | | | |
| P6 | Street, nobody plans (sprawl, haze) | | | | |
| P7 | Transitions: split, enter street, return, merge — hitches? (stale frames) | — | | | |
| P8 | 10 minutes of play: does FPS degrade? (leak / thermal) | — | | | |
| P9 | Repeat the worst row with `?quality=low` | — | | | |

## 2. Comfort

| # | Check | Pass when | Result |
|---|---|---|---|
| C1 | Enter a future (fade, ~0.2 s per half) | no vection, no sense of being moved | |
| C2 | Street placement | eyes at a natural standing/seated height; horizon level; you face the street | |
| C3 | Return to the tabletop | table where it was, same height | |
| C4 | Split: the table parts and turns | no discomfort; both futures within view without turning the head > 30° | |
| C5 | Reduced motion (headset/OS setting) | transitions become instant; no bobbing beacons | |
| C6 | Text legibility at arm's length: HUD, Plan pad, causality card, Mira's bubble, POI boards | readable without leaning in; try Larger text | |
| C7 | Panels never cover Mira or the futures | | |
| C8 | 15-minute session | no eye strain / nausea reported | |

## 3. Hands (hand tracking on, controllers down)

| # | Action | Pass when (10 tries) | Result |
|---|---|---|---|
| H1 | Pinch a piece in the tray, carry, release on a tile | ≥ 9/10 placed where intended | |
| H2 | Twist the wrist while holding (90° snap) | ≥ 9/10 | |
| H3 | Release off the board removes the piece | ≥ 9/10 | |
| H4 | Ray + pinch on panel buttons (Split, Why?, Enter, year) | ≥ 9/10 first try | |
| H5 | Fingertip poke on a panel button (hand < 25 cm) | ≥ 9/10 — **never verified, even in the emulator** | |
| H6 | Two hands together → pull apart (Split gesture) | ≥ 8/10, no accidental splits while placing | |
| H7 | Pinch a future → pull it toward you (enter) | ≥ 8/10 | |
| H8 | Pinch Mira / Talk to Mira, Next / Back / End | ≥ 9/10 | |
| H9 | Pinch a POI board ("why?") opens / closes it | ≥ 9/10 | |
| H10 | Hands near the board while placing do not trigger UI | no false presses | |
| H11 | Reality Seam: pinch the golden handle on the near edge and sweep left / right | seam follows the hand smoothly, ≥ 9/10 grabs | |
| H12 | Reality Seam: release, then grab again; no accidental grabs of the futures | seam stays where released | |

## 4. Controllers (hands off)

| # | Action | Pass when | Result |
|---|---|---|---|
| R1 | Squeeze near a piece, carry, release | works as H1 | |
| R2 | Ray + trigger on every button used in the first five minutes | works | |
| R3 | Enter / return from a future | works | |
| R4 | Switching hands ↔ controllers mid-session | no stuck grab, no lost ray | |

## 5. The first five minutes, on the headset

Script: [COMPETITION_DEMO_SCRIPT.md](COMPETITION_DEMO_SCRIPT.md).

| # | Beat | Pass when | Result |
|---|---|---|---|
| F1 | "Every city begins with a choice." → Begin | card readable, Begin reachable | |
| F2 | Step 1: Homes beside the town | glowing tiles visible; decision card readable ("Now (2026)" / "By 2050") | |
| F3 | Step 2: turn the dial to 2050 | the card re-explains the decision by 2050 | |
| F4 | Step 3: split (gesture or button) | both futures in view | |
| F5 | Step 4: Reality Seam, pinch the handle and sweep | seam follows the hand; label under the near edge readable | |
| F6 | Step 5–6: enter a future, talk to Mira | she faces you, points at the place she names; bubble readable; lines advance only when asked | |
| F7 | Step 7: the other future, back to the table | closing card "The future isn't written. Change it." | |
| F8 | Skip intro / Skip tips / Replay intro | all reachable and work | |
| F9 | Time taken by a first-time user | write minutes (target ≤ 5) | |

## 6. Audio

| # | Check | Result |
|---|---|---|
| A1 | Sounds on placement, split, enter, Mira's chime; street ambience | |
| A2 | Sound high / low / off chip works | |

## 7. Report back

For every failing row: screenshot or recording, the FPS overlay, the row id,
and whether `?quality=low` changes it. Add the results to
`docs/CAUSALITY_IMPLEMENTATION_REPORT.md` (Milestone G) under "Quest results".
