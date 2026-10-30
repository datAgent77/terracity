/**
 * 2026 / 2035 / 2050 strips of two plans at the default desktop camera:
 *   decline  - no new homes: turbines, solar and a park (environment misses its target)
 *   balanced - the reference plan (every target met)
 *   TAG=tt node scripts/visual/time-travel.mjs   [URL=...]
 */
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const TAG = process.env.TAG ?? 'tt';
const URL = process.env.URL ?? 'https://localhost:8081/';
const PLANS = {
  decline: [[5, 6, 3], [5, 7, 3], [3, 10, 8], [3, 11, 8], [3, 12, 8], [4, 9, 3], [2, 9, 4]],
  balanced: [[5, 6, 3], [5, 7, 3], [1, 6, 2], [1, 6, 4], [1, 2, 4], [1, 8, 3], [3, 10, 8], [3, 11, 8], [3, 12, 8], [4, 9, 3], [4, 1, 4], [2, 9, 4]],
};
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist'] });
const log = [];
for (const [name, plan] of Object.entries(PLANS)) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true })).newPage();
  await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
  await page.goto(URL);
  await page.waitForFunction(() => window.__terracity?.tileToScreen);
  await page.waitForTimeout(2500);
  const frames = (n = 4) => page.evaluate((n) => new Promise((r) => { const s = () => (--n ? requestAnimationFrame(s) : r()); requestAnimationFrame(s); }), n);
  const key = async (k) => { await page.keyboard.press(k); await frames(); };
  await key('Enter'); await key('KeyH');
  for (const [s, c, r] of plan) {
    await key(`Digit${s}`);
    const p = await page.evaluate(([c, r]) => window.__terracity.tileToScreen(c, r), [c, r]);
    await page.mouse.click(p.x, p.y); await frames();
  }
  await key('Escape');
  for (const y of [2026, 2035, 2050]) {
    if (y !== 2026) await key('KeyT');
    if (y === 2050) {
      // Mid-transition frame: the time wave sweeping out from the town.
      await page.waitForTimeout(900);
      await page.screenshot({ path: `docs/visual/${TAG}-${name}-2050-transition.png` });
    }
    await page.waitForFunction(() => window.__terracity.futureVisuals().transitionDone);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `docs/visual/${TAG}-${name}-${y}.png` });
    const v = await page.evaluate(() => window.__terracity.futureVisuals());
    const st = v.state;
    log.push(`${name} ${y}: env ${await page.evaluate(() => window.__terracity.game.metrics?.environment ?? '-')} haze ${st.haze.toFixed(2)} treeLoss ${st.treeLoss.toFixed(2)} greening ${st.greening.toFixed(2)} dryness ${st.dryness.toFixed(2)} sprawl ${st.sprawl.length} scars ${v.scars} smog ${v.smogVisible} balanced ${st.balanced}`);
  }
  if (process.env.XR) {
    // Seated IWER view of the same 2050 (Quest 3 profile, emulator).
    const remote = (m, p) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
    const btn = await page.evaluate(() => window.__terracity.uiToScreen('hud-panel', 'xr-button'));
    await page.mouse.click(btn.x, btn.y);
    for (let i = 0; i < 10 && !(await remote('get_session_status', {}))?.sessionActive; i++) await page.waitForTimeout(500);
    if (!(await remote('get_session_status', {}))?.sessionActive) await remote('accept_session', {});
    await page.waitForTimeout(1500);
    await page.evaluate(() => { const d = window.IWER_DEVICE.devui; d.devUIContainer.style.display = 'none'; if (d.inputLayer?.style) d.inputLayer.style.display = 'none'; });
    await remote('set_input_mode', { mode: 'hand' });
    await remote('set_transform', { device: 'headset', position: { x: 0, y: 1.2, z: 0.08 } });
    await remote('look_at', { device: 'headset', target: { x: 0, y: 0.78, z: -0.5 } });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `docs/visual/${TAG}-${name}-2050-xr.png` });
  }
  await page.close();
}
writeFileSync(`docs/visual/${TAG}-states.txt`, log.join('\n') + '\n');
console.log(log.join('\n'));
await browser.close();
