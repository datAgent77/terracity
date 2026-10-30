/**
 * GODMODE phase 2 evidence: become small — enter a future at human scale.
 *   TAG=gm2 XR=1 node scripts/visual/become-small.mjs
 */
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const TAG = process.env.TAG ?? 'gm2';
const URL = process.env.URL ?? 'https://localhost:8081/';
const out = (n) => `docs/visual/${TAG}-${n}.png`;
const PLAN = [[5, 6, 3], [5, 7, 3], [1, 6, 2], [1, 6, 4], [1, 2, 4], [1, 8, 3], [3, 10, 8], [3, 11, 8], [3, 12, 8], [4, 9, 3], [4, 1, 4], [2, 9, 4]];
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
const split = () => page.evaluate(() => window.__terracity.split());
const street = () => page.evaluate(() => window.__terracity.street());
const settleSplit = async () => { await page.waitForFunction(() => { const s = window.__terracity.split(); return s.t === (s.open ? 1 : 0) && !s.diving; }, null, { timeout: 8000 }).catch(async () => log.push(`settleSplit timeout: ${JSON.stringify(await split()).slice(0, 300)}`)); await frames(6); await page.waitForTimeout(300); };
const settleStreet = async () => { await page.waitForFunction(() => !window.__terracity.street().fading); await frames(6); await page.waitForTimeout(500); };
const ui = async (panel, id) => { const p = await page.evaluate(([a, b]) => window.__terracity.uiToScreen(a, b), [panel, id]); await page.mouse.click(p.x, p.y); await frames(); };
await key('Enter'); await key('KeyH');
for (const [s, c, r] of PLAN) { await key(`Digit${s}`); const p = await page.evaluate(([c, r]) => window.__terracity.tileToScreen(c, r), [c, r]); await page.mouse.click(p.x, p.y); await frames(); }
await key('Escape');
await page.waitForTimeout(800);
const planBefore = await page.evaluate(() => JSON.stringify(window.__terracity.game.placements));

// Desktop: split, enter Future A (your plan), then Future B (nobody plans) — the same place.
await key('KeyV'); await settleSplit();
await ui('actions-panel', 'btn-enter'); await settleStreet();
let s = await street();
log.push(`desktop enter A: active=${s.active} plan=${s.plan} districtHere=${s.districtHere} | ${s.story.join(' / ')}`);
await page.screenshot({ path: out('1-future-A-street') });
await ui('street-panel', 'st-return'); await settleStreet(); await settleSplit();
log.push(`returned: street=${(await street()).active} futuresOpen=${(await split()).open}`);
await page.screenshot({ path: out('2-back-at-futures') });
// The other future, at the same place: nobody planned this coast.
await page.evaluate(() => window.__terracity.selectFuture('B'));
await frames(4);
await ui('actions-panel', 'btn-enter'); await settleStreet();
s = await street();
log.push(`desktop enter B: active=${s.active} plan=${s.plan} districtHere=${s.districtHere} | ${s.story.join(' / ')}`);
await page.screenshot({ path: out('1b-future-B-street') });
await ui('street-panel', 'st-return'); await settleStreet(); await settleSplit();
await key('KeyV'); await settleSplit(); // merge
log.push(`plan unchanged after desktop visits: ${planBefore === (await page.evaluate(() => JSON.stringify(window.__terracity.game.placements)))} board=${(await split()).boardVisible}`);

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
  const pinch = async (v) => { await remote('set_select_value', { device: 'hand-right', value: v }); await page.waitForTimeout(250); };
  // Split by gesture.
  await hands(-0.05, 0.05); await page.waitForTimeout(600);
  for (const h of [0.1, 0.15, 0.2, 0.23]) { await hands(-h, h); await page.waitForTimeout(100); }
  await settleSplit();
  log.push(`xr split: open=${(await split()).open}`);
  await hands(-0.4, 0.4, 0.7, 0.1);
  // Ray-select Future A (left) with the right hand.
  const [ax, ay, az] = (await split()).centres[0];
  await remote('set_transform', { device: 'hand-right', position: { x: ax * 0.3, y: ay + 0.15, z: az + 0.3 } });
  await remote('look_at', { device: 'hand-right', target: { x: ax, y: ay + 0.02, z: az } });
  await page.waitForTimeout(400); await pinch(1); await pinch(0); await page.waitForTimeout(400);
  log.push(`xr ray-select: selected=${(await split()).selected} grabbable=${(await split()).grabbable}`);
  await page.screenshot({ path: out('3-xr-selected-A') });
  // Reach into Future A, pinch it, and pull it toward the eyes.
  await remote('set_transform', { device: 'hand-right', position: { x: ax, y: ay + 0.04, z: az } });
  await page.waitForTimeout(300);
  await pinch(1);
  for (const k of [0.25, 0.5, 0.7, 0.85, 0.95]) {
    await remote('set_transform', { device: 'hand-right', position: { x: ax * (1 - k), y: ay + 0.04 + (1.15 - ay) * k, z: az + (0.0 - az) * k } });
    await page.waitForTimeout(150);
    if (k === 0.5) await page.screenshot({ path: out('4-xr-pulling-future') });
  }
  await pinch(0);
  await page.waitForFunction(() => window.__terracity.street().active, null, { timeout: 8000 }).catch(() => {});
  await settleStreet();
  s = await street();
  log.push(`xr pulled into future: active=${s.active} plan=${s.plan} title-year=${s.year}`);
  await remote('look_at', { device: 'headset', target: { x: 0, y: 1.15, z: -1 } });
  await hands(-0.4, 0.4, 0.5, 0.3);
  await frames(6);
  await page.screenshot({ path: out('5-xr-inside-future-A') });
  // Return with the street panel (hand ray), back to the two futures.
  await remote('look_at', { device: 'headset', target: { x: 0, y: 0.82, z: -0.48 } });
  await page.waitForTimeout(600);
  const [rx, ry, rz] = await page.evaluate(() => window.__terracity.uiWorldPosition('street-panel', 'st-return'));
  await remote('set_transform', { device: 'hand-right', position: { x: rx * 0.45, y: ry + 0.1, z: rz + 0.3 } });
  await remote('look_at', { device: 'hand-right', target: { x: rx, y: ry, z: rz } });
  await page.waitForTimeout(400); await pinch(1); await pinch(0);
  await settleStreet(); await settleSplit();
  log.push(`xr return: street=${(await street()).active} futuresOpen=${(await split()).open}`);
  await remote('look_at', { device: 'headset', target: { x: 0, y: 0.8, z: -0.5 } });
  await hands(-0.4, 0.4, 0.7, 0.1);
  await frames(6);
  await page.screenshot({ path: out('6-xr-back-at-futures') });
  // Merge with both hands.
  await hands(-0.05, 0.05); await page.waitForTimeout(900); await settleSplit();
  log.push(`xr merge: open=${(await split()).open} board=${(await split()).boardVisible} planUnchanged=${planBefore === (await page.evaluate(() => JSON.stringify(window.__terracity.game.placements)))}`);
}
log.push(`page errors: ${errors.length} ${errors.slice(0, 3).join(' | ')}`);
writeFileSync(`docs/visual/${TAG}-log.txt`, log.join('\n') + '\n');
console.log(log.join('\n'));
await browser.close();
