/**
 * Close-up of one garden district in 2026 / 2035 / 2050 (IWER, leaning in).
 *   TAG=hu node scripts/visual/xr-district.mjs
 */
import { chromium } from 'playwright';

const TAG = process.env.TAG ?? 'snap';
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true })).newPage();
await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
await page.goto('https://localhost:8081/');
await page.waitForFunction(() => window.__terracity?.uiToScreen && window.IWER_DEVICE);
await page.waitForTimeout(2500);
const frames = () => page.evaluate(() => new Promise((r) => { let n = 4; const s = () => (--n ? requestAnimationFrame(s) : r()); requestAnimationFrame(s); }));
const key = async (k) => { await page.keyboard.press(k); await frames(); };
const tile = async (c, r) => { const p = await page.evaluate(([c, r]) => window.__terracity.tileToScreen(c, r), [c, r]); await page.mouse.click(p.x, p.y); await frames(); };
await key('Enter'); await key('KeyH');
for (const [s, c, r] of [[1,6,4],[5,6,3],[5,7,3],[1,8,3],[4,9,3],[2,9,4]]) { await key(`Digit${s}`); await tile(c, r); }
await key('Escape');
const remote = (m, p) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
const btn = await page.evaluate(() => window.__terracity.uiToScreen('hud-panel', 'xr-button'));
await page.mouse.click(btn.x, btn.y);
for (let i = 0; i < 10 && !(await remote('get_session_status', {}))?.sessionActive; i++) await page.waitForTimeout(500);
if (!(await remote('get_session_status', {}))?.sessionActive) await remote('accept_session', {});
await page.waitForTimeout(1500);
await page.evaluate(() => { const d = window.IWER_DEVICE.devui; d.devUIContainer.style.display = 'none'; if (d.inputLayer?.style) d.inputLayer.style.display = 'none'; });
await remote('set_input_mode', { mode: 'hand' });
await remote('set_transform', { device: 'hand-right', position: { x: 0.4, y: 0.5, z: 0.2 } });
await remote('set_transform', { device: 'hand-left', position: { x: -0.4, y: 0.5, z: 0.2 } });
await remote('set_transform', { device: 'headset', position: { x: 0.02, y: 0.9, z: -0.36 } });
await remote('look_at', { device: 'headset', target: { x: 0.0, y: 0.8, z: -0.58 } });
for (const y of [2026, 2035, 2050]) {
  await page.waitForTimeout(2600);
  await page.screenshot({ path: `docs/visual/${TAG}-district-${y}.png` });
  await key('KeyT');
}
await browser.close();
console.log('done');
