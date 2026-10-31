/**
 * GODMODE phase 4 evidence: sculpt time with the dial.
 *   TAG=gm4 XR=1 node scripts/visual/sculpt-time.mjs
 */
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const TAG = process.env.TAG ?? 'gm4';
const URL = process.env.URL ?? 'https://localhost:8081/';
const out = (n) => `docs/visual/${TAG}-${n}.png`;
const PLAN = [[1, 6, 4], [5, 6, 3], [5, 7, 3], [3, 10, 8], [3, 11, 8], [3, 12, 8], [4, 9, 3], [2, 9, 4]];
const log = [];
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
await page.goto(URL);
await page.waitForFunction(() => window.__terracity?.tileToScreen && window.__terracity?.dial);
await page.waitForTimeout(2500);
const frames = (n = 4) => page.evaluate((n) => new Promise((r) => { const s = () => (--n ? requestAnimationFrame(s) : r()); requestAnimationFrame(s); }), n);
const key = async (k) => { await page.keyboard.press(k); await frames(); };
const dial = () => page.evaluate(() => window.__terracity.dial());
const fv = () => page.evaluate(() => window.__terracity.futureVisuals().shown);
const fmt = (s) => `haze ${s.haze.toFixed(2)} treeLoss ${s.treeLoss.toFixed(2)} dryness ${s.dryness.toFixed(2)} progress ${s.progress.toFixed(2)}`;
await key('Enter'); await key('KeyH');
for (const [s, c, r] of PLAN) { await key(`Digit${s}`); const p = await page.evaluate(([c, r]) => window.__terracity.tileToScreen(c, r), [c, r]); await page.mouse.click(p.x, p.y); await frames(); }
await key('Escape');
await page.waitForTimeout(1200);
await page.screenshot({ path: out('1-dial-2026') });

// Desktop: drag the knob with the mouse.
const at = (p) => page.evaluate((p) => window.__terracity.dialToScreen(p), p);
let p0 = await at(0);
await page.mouse.move(p0.x, p0.y); await frames(2);
await page.mouse.down(); await frames(2);
for (const [p, name] of [[0.25, '2-scrub-2031'], [0.625, '3-scrub-2039'], [0.9, null]]) {
  for (let k = 1; k <= 6; k++) { const q = await at((await dial()).p + (p - (await dial()).p) * (k / 6)); await page.mouse.move(q.x, q.y); await frames(2); }
  await page.waitForTimeout(500);
  const d = await dial();
  log.push(`mouse drag to ${p}: label="${d.label}" year=${d.year} | ${fmt(await fv())}`);
  if (name) await page.screenshot({ path: out(name) });
}
await page.mouse.up();
await page.waitForTimeout(1200);
let d = await dial();
log.push(`released: label="${d.label}" year=${d.year} dragging=${d.dragging} | ${fmt(await fv())}`);
await page.screenshot({ path: out('4-snapped-2050') });

if (process.env.XR) {
  // Back to 2026 with the conventional year panel, then hands.
  const y26 = await page.evaluate(() => window.__terracity.uiToScreen('time-panel', 'year-2026'));
  await page.mouse.click(y26.x, y26.y);
  await page.waitForTimeout(1500);
  const remote = (m, p) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
  const xrb = await page.evaluate(() => window.__terracity.uiToScreen('hud-panel', 'xr-button'));
  await page.mouse.click(xrb.x, xrb.y);
  for (let i = 0; i < 10 && !(await remote('get_session_status', {}))?.sessionActive; i++) await page.waitForTimeout(500);
  if (!(await remote('get_session_status', {}))?.sessionActive) await remote('accept_session', {});
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const d = window.IWER_DEVICE.devui; d.devUIContainer.style.display = 'none'; if (d.inputLayer?.style) d.inputLayer.style.display = 'none'; });
  await remote('set_input_mode', { mode: 'hand' });
  await remote('set_transform', { device: 'headset', position: { x: 0, y: 1.2, z: 0.08 } });
  await remote('look_at', { device: 'headset', target: { x: 0.12, y: 0.8, z: -0.45 } });
  await remote('set_transform', { device: 'hand-left', position: { x: -0.4, y: 0.6, z: 0.2 } });
  await page.waitForTimeout(800);
  log.push(`xr before: ${JSON.stringify(await dial())}`);
  const pt = (p) => page.evaluate((p) => window.__terracity.dialPoint(p), p);
  const hand = async (xyz) => { await remote('set_transform', { device: 'hand-right', position: { x: xyz[0], y: xyz[1], z: xyz[2] } }); await frames(2); };
  await hand(await pt(0)); await page.waitForTimeout(300);
  await remote('set_select_value', { device: 'hand-right', value: 1 }); await page.waitForTimeout(300);
  for (const p of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]) { await hand(await pt(p)); await page.waitForTimeout(120); }
  await page.waitForTimeout(400);
  d = await dial();
  log.push(`xr hand turning: label="${d.label}" dragging=${d.dragging} year=${d.year} | ${fmt(await fv())}`);
  await page.screenshot({ path: out('5-xr-turning-time') });
  for (const p of [0.8, 0.88]) { await hand(await pt(p)); await page.waitForTimeout(120); }
  await remote('set_select_value', { device: 'hand-right', value: 0 });
  await page.waitForTimeout(1200);
  d = await dial();
  log.push(`xr released: label="${d.label}" year=${d.year} | ${fmt(await fv())}`);
  await hand([0.4, 0.6, 0.2]);
  await page.waitForTimeout(400);
  await page.screenshot({ path: out('6-xr-2050') });
}
log.push(`page errors: ${errors.length} ${errors.slice(0, 3).join(' | ')}`);
writeFileSync(`docs/visual/${TAG}-log.txt`, log.join('\n') + '\n');
console.log(log.join('\n'));
await browser.close();
