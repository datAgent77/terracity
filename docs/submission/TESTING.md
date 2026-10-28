# Testing TerraCity (for judges)

**Live build:** https://datagent77.github.io/terracity/ (no login, free).

## On a Meta Quest (intended experience)

1. Open the link in the **Meta Quest Browser**. Sit at a desk or table.
2. Tap **Enter Mixed Reality** on the TerraCity panel and allow hand tracking.
   The miniature coastal region appears at table height in front of you, with
   your room visible around it (passthrough).
3. Put the controllers down — everything works with hands:
   - **Pinch** a piece in the tray (Homes, Solar, Wind, Park, Road), carry it,
     and **release** over a tile. Green = allowed, red with an **X** = blocked.
   - Pinch a placed piece to move it; **twist your wrist** to rotate; release it
     off the board to remove it.
   - Point and **pinch** at panel buttons (or touch them with a fingertip): year
     buttons **2026 / 2035 / 2050**, the **Plan** pad (Undo, Redo, Save Plan A,
     Compare A/B, Pause, Finish plan), and the HUD chips (tips, larger text, sound).
4. A session is 7 minutes; the first minute is guided by four tips.

A complete moment: build homes next to the town → watch the numbers react →
tap **2050** and see sprawl and sea-level rise → back to **2026**, fix the plan →
**Finish plan**.

## Without a headset

The same link runs in a desktop browser with mouse and keyboard
(`1`–`5` pick a piece, click tiles, `T` years, `S` save A, `C` compare, `F` finish,
`Z`/`Y` undo/redo, `H`/`L`/`M` tips/larger text/sound). The desktop view is a
fallback for evaluation; the hands-first experience needs a Quest.

## Known limitations

See [KNOWN_LIMITATIONS.md](KNOWN_LIMITATIONS.md). Most importantly: **the
developer did not have a Quest headset**; all XR testing used Meta's IWER emulator.
