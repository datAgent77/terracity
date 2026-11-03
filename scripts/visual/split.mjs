/**
 * GODMODE phase 1 evidence: split reality.
 *   TAG=gm1 node scripts/visual/split.mjs        desktop (button), then IWER two-hand gesture with XR=1
 */
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const TAG = process.env.TAG ?? 'gm1';
const URL = process.env.URL ?? 'https://localhost:8081/';
const out = (n) => `docs/visual/${TAG}-${n}.png`;
// PLAN=balanced: the reference plan (every 2050 target met) vs nobody planning.
const PLAN = process.env.PLAN === 'balanced'
  ? [[5, 6, 3], [5, 7, 3], [1, 6, 2], [1, 6, 4], [1, 2, 4], [1, 8, 3], [3, 10, 8], [3, 11, 8], [3, 12, 8], [4, 9, 3], [4, 1, 4], [2, 9, 4]]
  : [[1, 6, 4], [5, 6, 3], [5, 7, 3], [1, 8, 3], [3, 11, 8], [3, 12, 8], [4, 9, 3], [2, 9, 4]];
const log = [];
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
await page.goto(URL);
await page.waitForFunction(() => window.__terracity?.tileToScreen && window.__terracity?.split);
await page.waitForTimeout(2500);
const frames = (n = 4) => page.evaluate((n) => new Promise((r) => { const s = () => (--n ? requestAnimationFrame(s) : r()); requestAnimationFrame(s); }), n);
const key = async (k) => { await page.keyboard.press(k); await frames(); };
const split = () => page.evaluate(() => window.__terracity.split());
const settle = async () => { await page.waitForFunction(() => { const s = window.__terracity.split(); return s.t === (s.open ? 1 : 0); }); await frames(6); await page.waitForTimeout(300); };
const ui = async (panel, id) => { const p = await page.evaluate(([a, b]) => window.__terracity.uiToScreen(a, b), [panel, id]); await page.mouse.click(p.x, p.y); await frames(); };
await key('Enter'); await key('KeyH');
for (const [s, c, r] of PLAN) { await key(`Digit${s}`); const p = await page.evaluate(([c, r]) => window.__terracity.tileToScreen(c, r), [c, r]); await page.mouse.click(p.x, p.y); await frames(); }
await key('Escape');
await page.waitForTimeout(1000);
const planBefore = await page.evaluate(() => JSON.stringify(window.__terracity.game.placements));
await page.screenshot({ path: out('1-one-world') });

// Desktop fallback: the Plan pad button.
await ui('actions-panel', 'btn-split');
// The transition is ~0.8 s; software rendering takes few frames, so freeze it for the evidence.
for (const [t, name] of [[0.05, '2a-seam'], [0.35, '2b-parting'], [0.65, '2c-apart']]) {
  await page.evaluate((t) => window.__terracity.splitFreeze(t), t);
  await frames(6);
  await page.screenshot({ path: out(name) });
}
await page.evaluate(() => window.__terracity.splitFreeze(null));
await frames(4);
await settle();
log.push(`desktop split: ${JSON.stringify(await split())}`);
await page.screenshot({ path: out('3-two-futures-2050') });
await key('KeyV'); // merge with the keyboard
await settle();
const planAfter = await page.evaluate(() => JSON.stringify(window.__terracity.game.placements));
log.push(`merged: open=${(await split()).open} board=${(await split()).boardVisible} planUnchanged=${planBefore === planAfter}`);

if (process.env.XR) {
  const remote = (m, p) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
  const xrb = await page.evaluate(() => window.__terracity.uiToScreen('hud-panel', 'xr-button'));
  await page.mouse.click(xrb.x, xrb.y);
  for (let i = 0; i < 10 && !(await remote('get_session_status', {}))?.sessionActive; i++) await page.waitForTimeout(500);
  if (!(await remote('get_session_status', {}))?.sessionActive) await remote('accept_session', {});
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const d = window.IWER_DEVICE.devui; d.devUIContainer.style.display = 'none'; if (d.inputLayer?.style) d.inputLayer.style.display = 'none'; });
  await remote('set_input_mode', { mode: 'hand' });
  await remote('set_transform', { device: 'headset', position: { x: 0, y: 1.2, z: 0.08 } });
  await remote('look_at', { device: 'headset', target: { x: 0, y: 0.8, z: -0.5 } });
  await page.waitForTimeout(800);
  const hands = async (xl, xr, y = 0.92, z = -0.45) => {
    await remote('set_transform', { device: 'hand-left', position: { x: xl, y, z } });
    await remote('set_transform', { device: 'hand-right', position: { x: xr, y, z } });
    await frames(2);
  };
  // Hands open, together over the city, held: the fracture appears.
  await hands(-0.05, 0.05);
  await page.waitForTimeout(600);
  log.push(`xr hands together: ${JSON.stringify(await split())}`);
  // Pull apart slowly.
  for (const h of [0.08, 0.11, 0.14]) { await hands(-h, h); await page.waitForTimeout(120); }
  log.push(`xr pulling apart: gesture=${(await split()).gesture} progress=${(await split()).progress.toFixed(2)}`);
  await page.screenshot({ path: out('4-xr-fracture') });
  for (const h of [0.17, 0.2, 0.23]) { await hands(-h, h); await page.waitForTimeout(80); }
  await settle();
  log.push(`xr split by gesture: open=${(await split()).open}`);
  await hands(-0.4, 0.4, 0.7, 0.1); // hands down, out of the way
  await page.waitForTimeout(600);
  await page.screenshot({ path: out('5-xr-two-futures') });
  // Pinch-select the right future with a hand ray.
  const centre = (await split()).centres[1];
  if (centre) {
    const [x, y, z] = centre;
    await remote('set_transform', { device: 'hand-right', position: { x: x * 0.6, y: y + 0.15, z: z + 0.3 } });
    await remote('look_at', { device: 'hand-right', target: { x, y: y + 0.02, z } });
    await page.waitForTimeout(400);
    await remote('set_select_value', { device: 'hand-right', value: 1 }); await page.waitForTimeout(250);
    await remote('set_select_value', { device: 'hand-right', value: 0 }); await page.waitForTimeout(700);
    log.push(`xr pinch-select right future: selected=${(await split()).selected}`);
    await page.screenshot({ path: out('6-xr-selected-B') });
  }
  // Merge: hands together and hold.
  await hands(-0.05, 0.05);
  await page.waitForTimeout(900);
  await settle();
  log.push(`xr merge by gesture: open=${(await split()).open} board=${(await split()).boardVisible}`);
  await hands(-0.4, 0.4, 0.7, 0.1);
  await page.waitForTimeout(600);
  await page.screenshot({ path: out('7-xr-merged') });
  const planXr = await page.evaluate(() => JSON.stringify(window.__terracity.game.placements));
  log.push(`xr plan unchanged: ${planXr === planBefore}`);
}
log.push(`page errors: ${errors.length} ${errors.slice(0, 3).join(' | ')}`);
writeFileSync(`docs/visual/${TAG}-log.txt`, log.join('\n') + '\n');
console.log(log.join('\n'));
await browser.close();
