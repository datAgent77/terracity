# TerraCity — Phase 4 Report (submission)

Date: 2026-10-28 · Emulation only — **no physical headset testing.**

## Requirements from the official rules (read 2026-10-28)

| Rule | Status |
|---|---|
| IWSDK/WebXR: link for judges (GitHub Pages suggested) | ✅ https://datagent77.github.io/terracity/ (HTTPS enforced, no login) |
| Demo video < 3 min, Quest or XR emulator footage, public on YouTube/Vimeo | 🟡 Silent cut ready (2:01, IWER emulator footage); voice-over + upload by the team |
| Text description: inspiration, how built, future plans, target launch date | 🟡 `docs/submission/DEVPOST.md` — **launch date TBD by the team** |
| Track / Division | Gaming · New Experience (project started 2026-10-27) |
| English | ✅ app, docs and video |
| No logos / brands / identifiable people | ✅ fictional region; no third-party branding in the app |
| Third-party authorisation | ✅ ATTRIBUTION.md — one open question: `@drawcall/uikitml` declares no license |

## Done in this phase

- **FoV-aware layout** (judging criterion): HUD and Plan pad moved to ±30° of a seated
  gaze and turned toward the eye; year buttons centred beyond the board; A/B
  comparison cities float over the front of the table between the panels; the
  result card steps aside while comparing.
- **Public repo** `datAgent77/terracity` (MIT), history attributed to
  `datAgent77 <…@users.noreply.github.com>` (personal e-mail removed before publishing);
  machine-local `opencode.json` untracked.
- **GitHub Pages** deploy of the production build (`gh-pages` branch, `.nojekyll`
  so the `_virtual…` asset is served). Verified: live HTML references the same
  hashed bundle as the local build; `/ui/*.uikitml` and the `_` asset return 200.
- **Live-site e2e:** 17 / 17 browser tests pass against the deployed URL
  (navigation fixed to be sub-path safe).
- **Video:** `scripts/video/record.mjs` drives the real app in IWER through the
  emulator's own remote-control API (hand pinch, ray select, head pose).
  Every placement and button press is verified against app state, and captions are
  generated from live app data (the recorder refuses to caption a win unless
  the app reports one). `assemble.mjs` speeds up two build montages 2.5× (labelled
  on screen) and upscales to 1080p. Voice-over script: `docs/submission/VOICEOVER.md`.
- **Submission docs:** `docs/submission/` — TESTING, HAND_INTERACTIONS, ARCHITECTURE,
  TEST_RESULTS, KNOWN_LIMITATIONS, DEVPOST, VOICEOVER, screenshots (from the footage).

## Verification (final)

```
npm run typecheck        0 errors
npm test                 91 / 91
npx playwright test      20 / 20 (dev server)
E2E_BASE_URL=https://datagent77.github.io/terracity/ npx playwright test …   17 / 17 (live site)
scripts/xr-phase{1,2,3}-test.sh   all scenarios pass with the new layout (seated pose)
video: 121.4 s silent cut; final plan result success=true (28,000 · env 65 · 88% · budget 1)
```

## Issues found and fixed

- The Phase 2 report wrongly said `xr-phase1-test.sh` still passed; it had not been
  re-run and failed (intro card). Fixed and a correction note added.
- Emulated hand pinch point sits ~3 cm left/ahead of the wrist pose and shifts on
  release: the recorder centres pieces on the target using the app's own held-piece
  readout, like a player watching the highlight.
- `video/` in `.gitignore` also hid `scripts/video/`; anchored to `/video/`.

## Still open (team decisions / actions)

1. **Voice-over**: generate v1–v8 in ElevenLabs → `node scripts/video/mux-voice.mjs`.
2. **Upload** the final video to YouTube/Vimeo (public) and paste the link on Devpost.
3. **Target launch date** in DEVPOST.md.
4. **`@drawcall/uikitml` license**: confirm with Meta/IWSDK or the package author.
5. **Devpost form**: eligibility (Meta developer account, VR Start membership) and
   submission are done by the entrant.
6. Physical Quest testing (60 fps, hand-tracking comfort, poke) remains the main risk.
