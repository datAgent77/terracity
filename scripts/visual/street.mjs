/**
 * "Enter your city" evidence: same plan on the tabletop and at street level.
 *   TAG=m2 node scripts/visual/street.mjs        (XR=1 also captures IWER)
 */
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const TAG = process.env.TAG ?? 'm2';
const URL = process.env.URL ?? 'https://localhost:8081/';
const PLAN = [[1, 6, 4], [5, 6, 3], [5, 7, 3], [1, 8, 3], [4, 9, 3], [2, 9, 4], [3, 11, 8], [1, 6, 5]];
const out = (n) => `docs/visual/${TAG}-${n}.png`;
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
const settle = async () => { await page.waitForFunction(() => !window.__terracity.street().fading); await frames(6); await page.waitForTimeout(400); };
await key('Enter'); await key('KeyH');
for (const [s, c, r] of PLAN) { await key(`Digit${s}`); const p = await page.evaluate(([c, r]) => window.__terracity.tileToScreen(c, r), [c, r]); await page.mouse.click(p.x, p.y); await frames(); }
await key('Escape');
await page.waitForTimeout(1200);
// Tabletop: zoom on the visited district (same villas as in the street).
const f = await page.evaluate(() => window.__terracity.tileWorld(6, 4));
await page.evaluate((f) => window.__terracity.setCamera([f[0] - 0.005, f[1] + 0.06, f[2] + 0.07], [f[0], f[1], f[2]]), f);
await frames(8);
await page.screenshot({ path: out('0-tabletop-district') });
await page.evaluate(() => window.__terracity.setCamera([0, 1.3, 0.34], [0, 0.7, -0.5]));
await frames(4);
// Enter with the Plan panel button (desktop: ScreenSpace overlay).
const btn = await page.evaluate(() => window.__terracity.uiToScreen('actions-panel', 'btn-enter'));
await page.mouse.click(btn.x, btn.y);
await page.waitForFunction(() => window.__terracity.street().active);
await settle();
log.push(`entered: ${JSON.stringify(await street())}`);
for (let i = 0; i < 4; i++) {
  await page.screenshot({ path: out(`${i + 1}-street-viewpoint-${i + 1}`) });
  log.push(`viewpoint ${i + 1}: ${JSON.stringify(await page.evaluate(() => window.__terracity.renderStats()))}`);
  if (i < 3) { await key('ArrowRight'); await settle(); }
}
// Return with the street panel button.
const ret = await page.evaluate(() => window.__terracity.uiToScreen('street-panel', 'st-return'));
await page.mouse.click(ret.x, ret.y);
await page.waitForFunction(() => !window.__terracity.street().active);
await settle();
log.push(`returned: ${JSON.stringify(await street())}`);
await page.screenshot({ path: out('5-returned-tabletop') });

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
  await remote('look_at', { device: 'headset', target: { x: 0, y: 0.78, z: -0.45 } });
  await page.waitForTimeout(800);
  // Hands only: enter with a hand ray on the Plan panel button.
  // Same ray-tap as scripts/xr-phase2-test.sh: hand between head and target, aim, pinch.
  const rayTap = async (target) => {
    const [x, y, z] = target;
    // Start from in front of the target (toward the player) so the ray is not grazing.
    await remote('set_transform', { device: 'hand-right', position: { x: x * 0.45, y: y + 0.1, z: z + 0.3 } });
    await remote('look_at', { device: 'hand-right', target: { x, y, z } });
    await page.waitForTimeout(400);
    // An explicit pinch (select value 1 -> 0); the one-shot `select` did not
    // register a click in this Playwright + IWER setup.
    await remote('set_select_value', { device: 'hand-right', value: 1 });
    await page.waitForTimeout(300);
    await remote('set_select_value', { device: 'hand-right', value: 0 });
    await page.waitForTimeout(800);
  };
  await rayTap(await page.evaluate(() => window.__terracity.uiWorldPosition('actions-panel', 'btn-enter')));
  await settle();
  log.push(`xr hand ray -> Enter your city: active=${(await street()).active}`);
  await remote('look_at', { device: 'headset', target: { x: 0, y: 1.15, z: -1 } });
  await frames(6);
  await page.screenshot({ path: out('6-xr-street') });
  await remote('look_at', { device: 'headset', target: { x: 0, y: 0.8, z: -0.6 } });
  await frames(6);
  await page.screenshot({ path: out('7-xr-panel') });
  log.push(`xr: ${JSON.stringify(await street())} ${JSON.stringify(await page.evaluate(() => window.__terracity.renderStats()))}`);
  await remote('look_at', { device: 'headset', target: { x: 0, y: 0.85, z: -0.5 } });
  await page.waitForTimeout(600);
  await rayTap(await page.evaluate(() => window.__terracity.uiWorldPosition('street-panel', 'st-next')));
  await settle();
  log.push(`xr hand ray -> Next: viewpoint=${(await street()).viewpoint}`);
  const m = (await street()).markers.find((p, i) => p && i === 3);
  if (m) {
    await remote('look_at', { device: 'headset', target: { x: m[0], y: m[1], z: m[2] } });
    await frames(4);
    await rayTap(m);
    await settle();
    log.push(`xr hand ray -> marker 4: viewpoint=${(await street()).viewpoint}`);
    await page.screenshot({ path: out('8-xr-after-marker') });
  }
  await remote('look_at', { device: 'headset', target: { x: 0, y: 0.8, z: -0.6 } });
  await rayTap(await page.evaluate(() => window.__terracity.uiWorldPosition('street-panel', 'st-return')));
  await settle();
  log.push(`xr hand ray -> Return: active=${(await street()).active} board=${(await street()).boardVisible}`);
}
log.push(`page errors: ${errors.length} ${errors.slice(0, 3).join(' | ')}`);
writeFileSync(`docs/visual/${TAG}-log.txt`, log.join('\n') + '\n');
console.log(log.join('\n'));
await browser.close();
