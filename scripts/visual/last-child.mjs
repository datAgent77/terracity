/**
 * GODMODE phase 3 evidence: the last child — and rewriting her future.
 *   1. An under-housed plan; enter the neighbourhood in 2050: Mira by a dry garden.
 *   2. Return, rewrite the plan (more homes, parks), enter the same place again:
 *      the same child by a green garden, new words.
 *   TAG=gm3 XR=1 node scripts/visual/last-child.mjs
 */
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const TAG = process.env.TAG ?? 'gm3';
const URL = process.env.URL ?? 'https://localhost:8081/';
const out = (n) => `docs/visual/${TAG}-${n}.png`;
const BEFORE = [[1, 6, 4], [5, 6, 3], [5, 7, 3], [3, 10, 8], [3, 11, 8], [3, 12, 8], [4, 9, 3], [2, 9, 4]];
const REWRITE = [[1, 6, 2], [1, 2, 4], [1, 8, 3], [4, 1, 4]];
const log = [];
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
await page.goto(URL);
await page.waitForFunction(() => window.__terracity?.tileToScreen && window.__terracity?.street);
await page.waitForTimeout(2500);
const frames = (n = 4) => page.evaluate((n) => new Promise((r) => { const s = () => (--n ? requestAnimationFrame(s) : r()); requestAnimationFrame(s); }), n);
const key = async (k) => { await page.keyboard.press(k); await frames(); };
const street = () => page.evaluate(() => window.__terracity.street());
const settle = async () => { await page.waitForFunction(() => !window.__terracity.street().fading); await frames(6); await page.waitForTimeout(600); };
const ui = async (panel, id) => { const p = await page.evaluate(([a, b]) => window.__terracity.uiToScreen(a, b), [panel, id]); await page.mouse.click(p.x, p.y); await frames(); };
const place = async (pieces) => { for (const [s, c, r] of pieces) { await key(`Digit${s}`); const p = await page.evaluate(([c, r]) => window.__terracity.tileToScreen(c, r), [c, r]); await page.mouse.click(p.x, p.y); await frames(); } await key('Escape'); };
const visit = async (name) => {
  await ui('time-panel', 'year-2050'); await page.waitForTimeout(500);
  await key('KeyE'); await settle();
  await page.waitForTimeout(1200); // she notices you and speaks
  let s = await street();
  log.push(`${name}: vp=${s.name} child=${JSON.stringify(s.child)}`);
  await page.screenshot({ path: out(`${name}-line1`) });
  await page.waitForTimeout(6200);
  await page.screenshot({ path: out(`${name}-line2`) });
  s = await street();
  log.push(`${name} story: ${s.story.join(' / ')}`);
  await key('KeyE'); await settle();
  await ui('time-panel', 'year-2026'); await page.waitForTimeout(500);
};
await key('Enter'); await key('KeyH');
await place(BEFORE);
await visit('1-before');
await place(REWRITE);
await visit('2-after-rewrite');

if (process.env.XR) {
  const remote = (m, p) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
  await ui('time-panel', 'year-2050');
  const xrb = await page.evaluate(() => window.__terracity.uiToScreen('hud-panel', 'xr-button'));
  await page.mouse.click(xrb.x, xrb.y);
  for (let i = 0; i < 10 && !(await remote('get_session_status', {}))?.sessionActive; i++) await page.waitForTimeout(500);
  if (!(await remote('get_session_status', {}))?.sessionActive) await remote('accept_session', {});
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const d = window.IWER_DEVICE.devui; d.devUIContainer.style.display = 'none'; if (d.inputLayer?.style) d.inputLayer.style.display = 'none'; });
  await remote('set_input_mode', { mode: 'hand' });
  await remote('set_transform', { device: 'headset', position: { x: 0, y: 1.2, z: 0.08 } });
  await remote('look_at', { device: 'headset', target: { x: 0, y: 0.78, z: -0.45 } });
  await page.waitForTimeout(800);
  const [x, y, z] = await page.evaluate(() => window.__terracity.uiWorldPosition('actions-panel', 'btn-enter'));
  await remote('set_transform', { device: 'hand-right', position: { x: x * 0.45, y: y + 0.1, z: z + 0.3 } });
  await remote('look_at', { device: 'hand-right', target: { x, y, z } });
  await page.waitForTimeout(400);
  await remote('set_select_value', { device: 'hand-right', value: 1 }); await page.waitForTimeout(250);
  await remote('set_select_value', { device: 'hand-right', value: 0 });
  await settle();
  await remote('set_transform', { device: 'hand-right', position: { x: 0.4, y: 0.5, z: 0.3 } });
  await remote('set_transform', { device: 'hand-left', position: { x: -0.4, y: 0.5, z: 0.3 } });
  // Look at Mira (she stands ~4 m ahead, a little to the right, at child height).
  await remote('look_at', { device: 'headset', target: { x: 0.25, y: 0.8, z: -2 } });
  await page.waitForTimeout(2500);
  const s = await street();
  log.push(`xr hands -> 2050 street: active=${s.active} vp=${s.name} child=${s.child?.state} speaking=${s.child?.speaking}`);
  await page.screenshot({ path: out('3-xr-meet-mira') });
}
log.push(`page errors: ${errors.length} ${errors.slice(0, 3).join(' | ')}`);
writeFileSync(`docs/visual/${TAG}-log.txt`, log.join('\n') + '\n');
console.log(log.join('\n'));
await browser.close();
