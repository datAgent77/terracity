/**
 * IWER evidence for V4 UX: first-placement cues (tip 1), hover on a year button,
 * and the result card layout after finishing. Seated eye (0, 1.2, 0.08).
 *   TAG=v4 node scripts/visual/xr-ux.mjs
 */
import { chromium } from 'playwright';

const TAG = process.env.TAG ?? 'snap';
const OUT = 'docs/visual';
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true })).newPage();
await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
await page.goto('https://localhost:8081/');
await page.waitForFunction(() => window.__terracity?.uiToScreen && window.IWER_DEVICE);
await page.waitForTimeout(2500);
const frames = () => page.evaluate(() => new Promise((r) => { let n = 4; const s = () => (--n ? requestAnimationFrame(s) : r()); requestAnimationFrame(s); }));
const key = async (k) => { await page.keyboard.press(k); await frames(); };
const tile = async (c, r) => { const p = await page.evaluate(([c, r]) => window.__terracity.tileToScreen(c, r), [c, r]); await page.mouse.click(p.x, p.y); await frames(); };
const remote = (m, p) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
const btn = await page.evaluate(() => window.__terracity.uiToScreen('hud-panel', 'xr-button'));
await page.mouse.click(btn.x, btn.y);
for (let i = 0; i < 10 && !(await remote('get_session_status', {}))?.sessionActive; i++) await page.waitForTimeout(500);
if (!(await remote('get_session_status', {}))?.sessionActive) await remote('accept_session', {});
await page.waitForTimeout(1500);
await page.evaluate(() => { const d = window.IWER_DEVICE.devui; d.devUIContainer.style.display = 'none'; if (d.inputLayer?.style) d.inputLayer.style.display = 'none'; });
await remote('set_input_mode', { mode: 'hand' });
await remote('set_transform', { device: 'hand-left', position: { x: -0.3, y: 0.6, z: 0.1 } });
await remote('set_transform', { device: 'hand-right', position: { x: 0.3, y: 0.6, z: 0.1 } });
const seat = async (look = [0, 0.85, -0.5]) => {
  await remote('set_transform', { device: 'headset', position: { x: 0, y: 1.2, z: 0.08 } });
  await remote('look_at', { device: 'headset', target: { x: look[0], y: look[1], z: look[2] } });
  await page.waitForTimeout(1200);
};
await seat();
await page.screenshot({ path: `${OUT}/${TAG}-xr-intro.png` });
await key('Enter'); // Start
await seat([0, 0.8, -0.42]);
await page.screenshot({ path: `${OUT}/${TAG}-xr-tip1-cues.png` });
// Hover: point the right hand's ray at 2035 (no pinch).
const p35 = await page.evaluate(() => window.__terracity.uiWorldPosition('time-panel', 'year-2035'));
await remote('set_transform', { device: 'hand-right', position: { x: 0.12, y: 1.0, z: -0.2 } });
await remote('look_at', { device: 'hand-right', target: { x: p35[0], y: p35[1], z: p35[2] } });
await seat([0, 0.9, -0.6]);
await page.screenshot({ path: `${OUT}/${TAG}-xr-hover-2035.png` });
await remote('set_transform', { device: 'hand-right', position: { x: 0.3, y: 0.6, z: 0.1 } });
// Leave XR, build the reference plan with the mouse, come back, finish.
await remote('end_session', {});
await page.waitForTimeout(1500);
const PLAN = [[1,6,4],[3,12,8],[5,6,3],[5,7,3],[1,6,2],[1,2,4],[1,8,3],[3,10,8],[3,11,8],[4,9,3],[4,1,4],[2,9,4]];
for (const [s, c, r] of PLAN) { await key(`Digit${s}`); await tile(c, r); }
await key('Escape'); await key('KeyF');
await page.waitForTimeout(800);
await remote('accept_session', {}).catch(() => {});
for (let i = 0; i < 10 && !(await remote('get_session_status', {}))?.sessionActive; i++) await page.waitForTimeout(500);
await page.evaluate(() => { const d = window.IWER_DEVICE.devui; d.devUIContainer.style.display = 'none'; if (d.inputLayer?.style) d.inputLayer.style.display = 'none'; });
await remote('set_input_mode', { mode: 'hand' });
await remote('set_transform', { device: 'hand-right', position: { x: 0.3, y: 0.6, z: 0.1 } });
await remote('set_transform', { device: 'hand-left', position: { x: -0.3, y: 0.6, z: 0.1 } });
await seat([0, 0.95, -0.55]);
await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/${TAG}-xr-result.png` });
console.log('result', JSON.stringify(await page.evaluate(() => window.__terracity.result.value?.success)));
await browser.close();
