/**
 * IWER evidence for the Plan A / Plan B comparison from the seated eye.
 * Plan A = homes + roads + ridge wind; Plan B = plan A + parks + solar.
 *   TAG=v4 node scripts/visual/xr-compare.mjs
 */
import { chromium } from 'playwright';
import { appendFileSync } from 'node:fs';

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
await key('Enter');
await key('KeyH'); // tips off for clean shots
const A = [[5,6,3],[5,7,3],[1,6,2],[1,6,4],[1,2,4],[1,8,3],[3,10,8],[3,11,8],[3,12,8]];
const B = [[4,9,3],[4,1,4],[2,9,4]];
for (const [s, c, r] of A) { await key(`Digit${s}`); await tile(c, r); }
await key('Escape'); await key('KeyS');
for (const [s, c, r] of B) { await key(`Digit${s}`); await tile(c, r); }
await key('Escape'); await key('KeyC');
await page.waitForTimeout(1500);
const remote = (m, p) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
const btn = await page.evaluate(() => window.__terracity.uiToScreen('hud-panel', 'xr-button'));
await page.mouse.click(btn.x, btn.y);
for (let i = 0; i < 10 && !(await remote('get_session_status', {}))?.sessionActive; i++) await page.waitForTimeout(500);
if (!(await remote('get_session_status', {}))?.sessionActive) await remote('accept_session', {});
await page.waitForTimeout(1500);
await page.evaluate(() => { const d = window.IWER_DEVICE.devui; d.devUIContainer.style.display = 'none'; if (d.inputLayer?.style) d.inputLayer.style.display = 'none'; });
await remote('set_input_mode', { mode: 'hand' });
await remote('set_transform', { device: 'hand-right', position: { x: 0.3, y: 0.6, z: 0.1 } });
await remote('set_transform', { device: 'hand-left', position: { x: -0.3, y: 0.6, z: 0.1 } });
for (const [name, look] of [['seated', [0, 0.85, -0.5]], ['compare', [0, 0.98, -0.5]]]) {
  await remote('set_transform', { device: 'headset', position: { x: 0, y: 1.2, z: 0.08 } });
  await remote('look_at', { device: 'headset', target: { x: look[0], y: look[1], z: look[2] } });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${TAG}-xr-compare-${name}.png` });
}
appendFileSync(`${OUT}/${TAG}-stats.txt`, `xr compare open: ${JSON.stringify(await page.evaluate(() => window.__terracity.renderStats()))}\n`);
await browser.close();
console.log('done');
