/**
 * Milestone 4 evidence: two futures of the same neighbourhood at street level.
 *   Plan A = one neighbourhood + energy + a park (under-housed)
 *   Plan B = Plan A + three more neighbourhoods and a park (the reference plan)
 *   TAG=m4 node scripts/visual/street-compare.mjs   (XR=1 adds a hands-only IWER pass)
 */
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const TAG = process.env.TAG ?? 'm4';
const URL = process.env.URL ?? 'https://localhost:8081/';
const A = [[1, 6, 4], [5, 6, 3], [5, 7, 3], [3, 10, 8], [3, 11, 8], [3, 12, 8], [4, 9, 3], [2, 9, 4]];
const B_EXTRA = [[1, 6, 2], [1, 2, 4], [1, 8, 3], [4, 1, 4]];
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
const settle = async () => { await page.waitForFunction(() => !window.__terracity.street().fading); await frames(6); await page.waitForTimeout(500); };
const ui = async (panel, id) => { const p = await page.evaluate(([a, b]) => window.__terracity.uiToScreen(a, b), [panel, id]); await page.mouse.click(p.x, p.y); await frames(); };
const place = async (pieces) => { for (const [s, c, r] of pieces) { await key(`Digit${s}`); const p = await page.evaluate(([c, r]) => window.__terracity.tileToScreen(c, r), [c, r]); await page.mouse.click(p.x, p.y); await frames(); } await key('Escape'); };
await key('Enter'); await key('KeyH');
await place(A);
await key('KeyS'); // save Plan A
await place(B_EXTRA);
await page.waitForTimeout(800);
// Select the shared neighbourhood (6,4) and enter it.
const t = await page.evaluate(() => window.__terracity.tileToScreen(6, 4));
await page.mouse.click(t.x, t.y); await frames();
await key('KeyE');
await settle();
for (const vp of [0, 2]) {
  while ((await street()).viewpoint !== vp) { await key('ArrowRight'); await settle(); }
  for (const plan of ['A', 'B']) {
    await ui('street-panel', `st-plan-${plan.toLowerCase()}`);
    await settle();
    const s = await street();
    await page.screenshot({ path: `docs/visual/${TAG}-vp${vp + 1}-plan-${plan.toLowerCase()}-${s.year}.png` });
    log.push(`vp${vp + 1} plan ${s.plan} ${s.year}: districtHere ${s.districtHere} haze ${s.haze.toFixed(2)} greening ${s.greening.toFixed(2)} birds ${s.birds} | ${s.story.join(' / ')}`);
  }
}
if (process.env.XR) {
  await ui('street-panel', 'st-return'); await settle();
  const remote = (m, p) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
  const xrb = await page.evaluate(() => window.__terracity.uiToScreen('hud-panel', 'xr-button'));
  await page.mouse.click(xrb.x, xrb.y);
  for (let i = 0; i < 10 && !(await remote('get_session_status', {}))?.sessionActive; i++) await page.waitForTimeout(500);
  if (!(await remote('get_session_status', {}))?.sessionActive) await remote('accept_session', {});
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const d = window.IWER_DEVICE.devui; d.devUIContainer.style.display = 'none'; if (d.inputLayer?.style) d.inputLayer.style.display = 'none'; });
  await remote('set_input_mode', { mode: 'hand' });
  await remote('set_transform', { device: 'headset', position: { x: 0, y: 1.2, z: 0.08 } });
  const rayTap = async (target) => {
    const [x, y, z] = target;
    await remote('set_transform', { device: 'hand-right', position: { x: x * 0.45, y: y + 0.1, z: z + 0.3 } });
    await remote('look_at', { device: 'hand-right', target: { x, y, z } });
    await page.waitForTimeout(400);
    await remote('set_select_value', { device: 'hand-right', value: 1 });
    await page.waitForTimeout(300);
    await remote('set_select_value', { device: 'hand-right', value: 0 });
    await page.waitForTimeout(800);
  };
  await remote('look_at', { device: 'headset', target: { x: 0, y: 0.78, z: -0.45 } });
  await page.waitForTimeout(800);
  await rayTap(await page.evaluate(() => window.__terracity.uiWorldPosition('actions-panel', 'btn-enter')));
  await settle();
  await remote('look_at', { device: 'headset', target: { x: 0, y: 0.82, z: -0.48 } });
  await page.waitForTimeout(600);
  await rayTap(await page.evaluate(() => window.__terracity.uiWorldPosition('street-panel', 'st-plan-a')));
  await settle();
  let s = await street();
  log.push(`xr hands: entered=${s.active} plan=${s.plan} year=${s.year}`);
  await page.screenshot({ path: `docs/visual/${TAG}-xr-panel-plan-a.png` });
  await remote('look_at', { device: 'headset', target: { x: 0, y: 1.15, z: -1 } });
  await frames(6);
  await page.screenshot({ path: `docs/visual/${TAG}-xr-street-plan-a.png` });
  await remote('look_at', { device: 'headset', target: { x: 0, y: 0.82, z: -0.48 } });
  await page.waitForTimeout(600);
  await rayTap(await page.evaluate(() => window.__terracity.uiWorldPosition('street-panel', 'st-plan-b')));
  await settle();
  s = await street();
  log.push(`xr hands: plan=${s.plan}`);
  await remote('look_at', { device: 'headset', target: { x: 0, y: 1.15, z: -1 } });
  await frames(6);
  await page.screenshot({ path: `docs/visual/${TAG}-xr-street-plan-b.png` });
}
log.push(`page errors: ${errors.length} ${errors.slice(0, 2).join(' | ')}`);
writeFileSync(`docs/visual/${TAG}-log.txt`, log.join('\n') + '\n');
console.log(log.join('\n'));
await browser.close();
