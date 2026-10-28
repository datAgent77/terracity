# TerraCity — Phase 3 Report (polish)

Date: 2026-10-28 · Emulation only (IWER, Meta Quest 3 profile) — **no physical headset testing.**
All numbers below were measured in this session; Quest frame times were **not** measured.

## Delivered

| Area | What changed | Where |
|---|---|---|
| Onboarding | 4-step guided tips (homes next to the town → ridge wind → 2050 → back to 2026) with glowing target tiles; Skip / Show tips chip, `H` | `src/gameplay/tutorial*.ts` |
| Sound | Synthesised WebAudio effects (place, reject, remove, undo, road-connect chime, time-travel whoosh, save, win, lose, UI click); no audio files; Sound on/off chip, `M` | `src/audio/` |
| Visuals | Soft shadows from the key light, sky gradient on desktop (transparent in MR for passthrough), water shimmer, two drifting sailboats, re-framed desktop camera, HUD raised above the time panel in XR | `src/world/ambient-system.ts`, scene/config |
| Usability | Hand-proximity hover: the piece a pinch would pick up grows ×1.12 | `src/interactions/hover-system.ts` |
| Accessibility | Larger-text mode ×1.3 (XR and desktop), `L`; blocked tiles show a dark **X** (not colour only); metric goals read "met (…)" in text; honours `prefers-reduced-motion` | `src/ui/accessibility.ts`, panels |
| Performance | Static meshes merged per material; shared house geometry; rotor merged; per-frame crown traversal cached; production icon subset | `src/world/merge.ts`, `src/ui/lucide-subset.ts` |

### Measurements (desktop Chromium, full reference plan, 2050 view)

| | Before | After |
|---|---|---|
| Draw calls | 224 | 94–100 (−55 %) |
| Geometries | 178 | 122–129 |
| Main JS chunk | 6,633 kB (1,701 kB gzip) | 2,435 kB (676 kB gzip) (−63 %) |

The bundle win comes from the UIKitML kit importing all ~1,600 Lucide icons; the
production build aliases `@pmndrs/uikit-lucide` to the 19 used icons (dev keeps
the full set). A unit test fails if a panel uses an icon not in the subset, and
the full e2e suite was run against `vite preview` of the production build.

## Verification

```sh
npm run typecheck                                   # 0 errors
npm test                                            # Vitest: 91 / 91
npx playwright test                                 # 19 / 19, twice in a row (dev server)
E2E_BASE_URL=https://localhost:4174/ npx playwright test …   # 17 / 17 against the production build
./scripts/xr-phase3-test.sh                          # IWER, hands only (below)
npm run build                                       # succeeds
```

New tests: tutorial state machine (4), icon-subset guard (1); e2e: guided tips
end to end, skip/show tips, larger text enlarges panels + sound toggle, blocked X,
render-cost probe, evidence shots.

IWER, hands only:

```
== 1. Start                         -> phase=building tip=Tip 1/4
== 2. hover   token scale far: 1,1,1   near (pinch position): 1.12,1.12,1.12
== 3. pinch Homes onto (6,4)        -> tip=Tip 2/4
== 4. Larger text via hand ray      HUD scale 0.09 -> 0.12 ; second tap restores
== 5. Skip tips via hand ray        -> tip=none
```

Evidence: `docs/evidence/phase3-*.png` (desktop start/plan/2050, tip-2 glow,
blocked X close-up, larger text, production-build icons, XR hover, XR larger text,
XR passthrough view).

## Issues found and fixed

- **XR layout bug:** after the coach line and preference chips were added, the HUD's
  lower edge sat behind the time panel, so hand rays to the chips hit the time panel.
  The HUD was raised (y 1.02 → 1.16).
- ScreenSpace panels only re-lay out on viewport changes — text-size changes now
  trigger a relayout.
- E2E flakiness traced to the test harness (input is processed in the render loop;
  parallel software-rendered workers starved each other of frames): helpers now wait
  for real frames and the suite runs on one worker. 19/19 twice in a row.

## Findings / remaining risks

- **Near-field rule:** in the emulator a hand ray closer than ~25 cm to a panel does
  not click (IWSDK hands over to the finger-poke pointer). Ray taps from arm's length
  work. **Finger poke itself could not be verified**: CLI 1.0.1 cannot place the
  emulated index tip precisely; a scripted attempt did not register. Must be checked on
  a Quest — if poke is unreliable, the panels stay usable by ray.
- Shadows add a render pass; cost on Quest is unmeasured (1024² map, tight bounds).
- `@drawcall/uikitml` declares no license (see ATTRIBUTION.md) — confirm before submission.
- Larger-text mode on desktop makes the HUD overlap the board's left edge (opt-in).
