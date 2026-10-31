/**
 * The GODMODE demo path, end to end, in the running app (desktop), with tips on:
 * build -> split -> enter a future (Mira, 2050) -> return, merge -> rewrite
 * (Plan A saved, more homes) -> split: Plan A vs Plan B + tagline -> enter B ->
 * Mira again -> merge. Screenshots and render stats at each step.
 *   TAG=gm5 node scripts/visual/godmode-flow.mjs        (XR=1 adds the in-XR split hint)
 */
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const TAG = process.env.TAG ?? 'gm5';
const URL = process.env.URL ?? 'https://localhost:8081/';
const out = (n) => `docs/visual/${TAG}-${n}.png`;
const log = [];
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
await page.goto(URL);
await page.waitForFunction(() => window.__terracity?.tileToScreen && window.__terracity?.split && window.__terracity?.street);
await page.waitForTimeout(2500);
const frames = (n = 4) => page.evaluate((n) => new Promise((r) => { const s = () => (--n ? requestAnimationFrame(s) : r()); requestAnimationFrame(s); }), n);
const key = async (k) => { await page.keyboard.press(k); await frames(); };
const tip = () => page.evaluate(() => window.__terracity.coachText.value);
const stats = async (label) => log.push(`${label}: ${JSON.stringify(await page.evaluate(() => window.__terracity.renderStats()))}`);
const splitSettled = () => page.waitForFunction(() => { const s = window.__terracity.split(); return s.t === (s.open ? 1 : 0) && !s.diving; });
const streetSettled = async () => { await page.waitForFunction(() => !window.__terracity.street().fading); await frames(6); await page.waitForTimeout(500); };
const ui = async (panel, id) => { const p = await page.evaluate(([a, b]) => window.__terracity.uiToScreen(a, b), [panel, id]); await page.mouse.click(p.x, p.y); await frames(); };
const place = async (pieces) => { for (const [s, c, r] of pieces) { await key(`Digit${s}`); const p = await page.evaluate(([c, r]) => window.__terracity.tileToScreen(c, r), [c, r]); await page.mouse.click(p.x, p.y); await frames(); } await key('Escape'); };

await key('Enter'); // start, tips ON
await page.waitForTimeout(800);
log.push(`0 start: ${await tip()}`);
await page.screenshot({ path: out('0-start') }); await stats('tabletop start');
await place([[1, 6, 4]]);
await place([[5, 6, 3], [5, 7, 3], [3, 11, 8], [3, 12, 8], [4, 9, 3], [2, 9, 4]]);
await page.waitForTimeout(800);
log.push(`1 built: ${await tip()} | hint=${(await page.evaluate(() => window.__terracity.split())).hint}`);
await page.screenshot({ path: out('1-split-hint') }); await stats('tabletop built');
await ui('actions-panel', 'btn-split'); await splitSettled(); await page.waitForTimeout(500);
log.push(`2 split: ${await tip()}`);
await page.screenshot({ path: out('2-two-futures') }); await stats('two futures');
await ui('actions-panel', 'btn-enter'); await streetSettled(); await page.waitForTimeout(1500);
let s = await page.evaluate(() => window.__terracity.street());
log.push(`3 inside future A: ${await tip()} | Mira ${s.child?.state}: ${s.child?.lines?.[0]}`);
await page.screenshot({ path: out('3-mira-before') }); await stats('street 2050');
await ui('street-panel', 'st-return'); await streetSettled(); await splitSettled();
await key('KeyV'); await splitSettled(); await page.waitForTimeout(800);
log.push(`4 merged: tip="${await tip()}" year=${await page.evaluate(() => window.__terracity.futureVisuals().state.year)}`);
// Rewrite tomorrow: keep this as Plan A, then add homes and a park (Plan B).
await key('KeyS');
await place([[1, 6, 2], [1, 2, 4], [1, 8, 3], [4, 1, 4]]);
await page.waitForTimeout(800);
await key('KeyV'); await splitSettled(); await page.waitForTimeout(2200);
log.push(`5 Plan A vs Plan B: tagline=${(await page.evaluate(() => window.__terracity.split())).tagline}`);
await page.screenshot({ path: out('5-final-reveal') });
await page.evaluate(() => window.__terracity.selectFuture('B'));
await frames(4);
await ui('actions-panel', 'btn-enter'); await streetSettled(); await page.waitForTimeout(1500);
s = await page.evaluate(() => window.__terracity.street());
log.push(`6 inside Plan B: Mira ${s.child?.state}: ${s.child?.lines?.[0]}`);
await page.screenshot({ path: out('6-mira-after') });
await ui('street-panel', 'st-return'); await streetSettled(); await splitSettled();
await key('KeyV'); await splitSettled();
// Sculpt time once, mid-way, for the stats.
const a = await page.evaluate(() => window.__terracity.dialToScreen(0));
await page.mouse.move(a.x, a.y); await page.mouse.down();
for (let i = 1; i <= 8; i++) { const q = await page.evaluate((p) => window.__terracity.dialToScreen(p), 0.08 * i); await page.mouse.move(q.x, q.y); }
await page.waitForTimeout(500);
await stats('scrubbing ~2039');
await page.mouse.up();
await page.waitForTimeout(900);

if (process.env.XR) {
  // A fresh page in XR with tips on, at the split step: the floating hint over the city.
  const p2 = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true })).newPage();
  await p2.addInitScript(() => { try { localStorage.clear(); } catch {} });
  await p2.goto(URL);
  await p2.waitForFunction(() => window.__terracity?.tileToScreen && window.IWER_DEVICE);
  await p2.waitForTimeout(2500);
  await p2.keyboard.press('Enter'); await p2.waitForTimeout(300);
  for (const [sl, c, r] of [[1, 6, 4], [3, 12, 8]]) { await p2.keyboard.press(`Digit${sl}`); await p2.waitForTimeout(100); const q = await p2.evaluate(([c, r]) => window.__terracity.tileToScreen(c, r), [c, r]); await p2.mouse.click(q.x, q.y); await p2.waitForTimeout(200); }
  await p2.keyboard.press('Escape');
  const remote = (m, p) => p2.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
  const xrb = await p2.evaluate(() => window.__terracity.uiToScreen('hud-panel', 'xr-button'));
  await p2.mouse.click(xrb.x, xrb.y);
  for (let i = 0; i < 10 && !(await remote('get_session_status', {}))?.sessionActive; i++) await p2.waitForTimeout(500);
  if (!(await remote('get_session_status', {}))?.sessionActive) await remote('accept_session', {});
  await p2.waitForTimeout(1500);
  await p2.evaluate(() => { const d = window.IWER_DEVICE.devui; d.devUIContainer.style.display = 'none'; if (d.inputLayer?.style) d.inputLayer.style.display = 'none'; });
  await remote('set_input_mode', { mode: 'hand' });
  await remote('set_transform', { device: 'headset', position: { x: 0, y: 1.2, z: 0.08 } });
  await remote('look_at', { device: 'headset', target: { x: 0, y: 0.85, z: -0.5 } });
  await remote('set_transform', { device: 'hand-left', position: { x: -0.25, y: 0.95, z: -0.25 } });
  await remote('set_transform', { device: 'hand-right', position: { x: 0.25, y: 0.95, z: -0.25 } });
  await p2.waitForTimeout(1200);
  log.push(`xr split hint: ${JSON.stringify(await p2.evaluate(() => ({ tip: window.__terracity.coachText.value.slice(0, 40), hint: window.__terracity.split().hint })))}`);
  await p2.screenshot({ path: out('7-xr-split-hint') });
  log.push(`xr stats: ${JSON.stringify(await p2.evaluate(() => window.__terracity.renderStats()))}`);
}
log.push(`page errors: ${errors.length} ${errors.slice(0, 3).join(' | ')}`);
writeFileSync(`docs/visual/${TAG}-log.txt`, log.join('\n') + '\n');
console.log(log.join('\n'));
await browser.close();
