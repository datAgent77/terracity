/**
 * COMPETITION milestone C evidence: Reality Seam — desktop drag / keys, then IWER hand pinch-drag.
 *   TAG=mc node scripts/visual/reality-seam.mjs   (XR=0 skips the IWER pass)
 */
import { writeFileSync } from "node:fs";
import { chromium } from "playwright";
const TAG = process.env.TAG ?? 'mc';
const URL = process.env.URL ?? 'https://localhost:8081/';
const out = (n) => `docs/visual/${TAG}-${n}.png`;
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
await page.goto(URL);
await page.waitForFunction(() => window.__terracity?.tileToScreen && window.__terracity?.street && window.__terracity?.overlay);
await page.waitForTimeout(3000);
const frames = (n = 4) => page.evaluate((n) => new Promise((r) => { const s = () => (--n ? requestAnimationFrame(s) : r()); requestAnimationFrame(s); }), n);
const key = async (k) => { await page.keyboard.press(k); await frames(); };
const settle = async () => { await page.waitForFunction(() => !window.__terracity.street().fading); await frames(8); await page.waitForTimeout(900); };
const ui = async (panel, id) => { await page.evaluate(([p, i]) => window.__terracity.reveal?.(p, i), [panel, id]); await frames(3); const p = await page.evaluate(([a, b]) => window.__terracity.uiToScreen(a, b), [panel, id]); await page.mouse.click(p.x, p.y); await frames(); };
const place = async (pieces) => { for (const [s, c, r] of pieces) { await key(`Digit${s}`); const p = await page.evaluate(([c, r]) => window.__terracity.tileToScreen(c, r), [c, r]); await page.mouse.click(p.x, p.y); await frames(); } await key('Escape'); };

// 1. The intro card over the miniature coast.
await page.screenshot({ path: out('1-every-city-begins-with-a-choice') });
const log = [];
const split = () => page.evaluate(() => window.__terracity.split());
await ui('overlay-panel', 'ov-secondary'); await page.waitForTimeout(500);
// Your plan: two neighbourhoods, a park, wind on the ridge.
await place([[5, 6, 3], [1, 6, 4], [1, 6, 2], [4, 8, 2], [3, 11, 8], [3, 12, 8]]);
await key('KeyV');
await page.waitForFunction(() => { const s = window.__terracity.split(); return s.open && s.t === 1; }); await frames(6);
await ui('actions-panel', 'btn-seam');
await page.waitForFunction(() => { const s = window.__terracity.split(); return s.seamVisible; }); await frames(8);
let s = await split();
log.push(`seam open: u=${s.seam} t=${s.t} report=${s.seamReport.split('|')[0]}`);
log.push(`mode: ${await page.evaluate(() => document.title && window.__terracity.split().seam)}`);
await page.screenshot({ path: out('1-seam-middle') });
// Mouse: drag the seam west.
const a = await page.evaluate(() => window.__terracity.seamToScreen(0.5));
const b = await page.evaluate(() => window.__terracity.seamToScreen(0.3));
await page.mouse.move(a.x, a.y); await page.mouse.down(); await frames(2);
for (let k = 1; k <= 6; k++) { await page.mouse.move(a.x + ((b.x - a.x) * k) / 6, a.y + ((b.y - a.y) * k) / 6); await frames(2); }
await page.mouse.up(); await frames(4);
s = await split();
log.push(`mouse drag -> u=${s.seam.toFixed(3)} report=${s.seamReport.split('|')[0]}`);
await page.screenshot({ path: out('2-seam-dragged-west') });
// Keys: three tiles east.
for (let i = 0; i < 2; i++) await key("ArrowRight"); // column 6: your neighbourhoods
s = await split();
log.push(`arrows -> u=${s.seam.toFixed(3)} report=${s.seamReport.split('|')[0]}`);
// Causality Vision on: rings cut by the same seam.
await key('KeyW'); await page.waitForTimeout(600);
const cz = await page.evaluate(() => window.__terracity.causality());
log.push(`vision: miniMarks=${cz.miniMarks} card=${cz.card.split('|')[0]}`);
await page.screenshot({ path: out('3-seam-causality') });
await key('KeyW');
// Back to side by side, then merge; the plan is unchanged.
const before = await page.evaluate(() => JSON.stringify(window.__terracity.placements()));
await ui('actions-panel', 'btn-seam'); await page.waitForFunction(() => window.__terracity.split().t === 1);
log.push(`side by side: seam=${(await split()).seam} t=${(await split()).t}`);
await key('KeyV'); await page.waitForFunction(() => { const s = window.__terracity.split(); return !s.open && s.t === 0; });
log.push(`merged: board=${(await split()).boardVisible} planUnchanged=${before === (await page.evaluate(() => JSON.stringify(window.__terracity.placements())))}`);

if (process.env.XR !== '0') {
  const remote = (m, p) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
  await key('KeyG'); // seam straight from the tabletop (opens the futures)
  await page.waitForFunction(() => window.__terracity.split().seamVisible); await frames(6);
  const xrb = await page.evaluate(() => window.__terracity.uiToScreen('hud-panel', 'xr-button'));
  await page.mouse.click(xrb.x, xrb.y);
  for (let i = 0; i < 10 && !(await remote('get_session_status', {}))?.sessionActive; i++) await page.waitForTimeout(500);
  if (!(await remote('get_session_status', {}))?.sessionActive) await remote('accept_session', {});
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const d = window.IWER_DEVICE.devui; d.devUIContainer.style.display = 'none'; if (d.inputLayer?.style) d.inputLayer.style.display = 'none'; });
  await remote('set_input_mode', { mode: 'hand' });
  await remote('set_transform', { device: 'headset', position: { x: 0, y: 1.2, z: 0.08 } });
  await remote('look_at', { device: 'headset', target: { x: 0, y: 0.8, z: -0.5 } });
  await remote('set_transform', { device: 'hand-left', position: { x: -0.4, y: 0.6, z: 0.1 } });
  await page.waitForTimeout(800);
  const pinch = async (v) => { await remote('set_select_value', { device: 'hand-right', value: v }); await page.waitForTimeout(250); };
  const [hx, hy, hz] = await page.evaluate(() => window.__terracity.seamHandleAt(window.__terracity.split().seam));
  await remote('set_transform', { device: 'hand-right', position: { x: hx, y: hy, z: hz } });
  await page.waitForTimeout(400);
  await pinch(1);
  log.push(`xr pinch on handle: held=${(await split()).seamHeld}`);
  for (const dx of [0.03, 0.08, 0.14, 0.2]) {
    await remote('set_transform', { device: 'hand-right', position: { x: hx + dx, y: hy + 0.01, z: hz } });
    await page.waitForTimeout(200);
  }
  await page.screenshot({ path: out('4-xr-hand-drag') });
  s = await split();
  log.push(`xr hand drag -> u=${s.seam.toFixed(3)} held=${s.seamHeld}`);
  await pinch(0);
  await page.waitForTimeout(300);
  s = await split();
  log.push(`xr released: u=${s.seam.toFixed(3)} held=${s.seamHeld}`);
  log.push(`xr stats: ${JSON.stringify(await page.evaluate(() => ({ ...window.__terracity.renderStats(), transparent: window.__terracity.gpuBudget().transparentDraws })))}`);
}
log.push(`page errors: ${errors.length} ${errors.slice(0, 3).join(' | ')}`);
writeFileSync(`docs/visual/${TAG}-log.txt`, log.join('\n') + '\n');
console.log(log.join('\n'));
await browser.close();
