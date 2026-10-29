/**
 * Before/after XR evidence: the real app in Meta's IWER emulator (dev server),
 * seen from a seated eye position. The plan is built with keyboard/mouse before
 * entering XR (input path is irrelevant to visuals); year changes use the `T` key.
 *   TAG=before node scripts/visual/xr-shots.mjs
 */
import { chromium } from 'playwright';
import { appendFileSync, mkdirSync } from 'node:fs';

const TAG = process.env.TAG ?? 'snap';
const OUT = 'docs/visual';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true })).newPage();
await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
await page.goto(process.env.URL ?? 'https://localhost:8081/');
await page.waitForFunction(() => window.__terracity?.uiToScreen && window.IWER_DEVICE);
await page.waitForTimeout(2500);
const frames = () => page.evaluate(() => new Promise((r) => { let n = 4; const s = () => (--n ? requestAnimationFrame(s) : r()); requestAnimationFrame(s); }));
const key = async (k) => { await page.keyboard.press(k); await frames(); };
const tile = async (c, r) => {
  const p = await page.evaluate(([c, r]) => window.__terracity.tileToScreen(c, r), [c, r]);
  await page.mouse.click(p.x, p.y); await frames();
};
await key('Enter'); // Start
const PLAN = [[5,6,3],[5,7,3],[1,6,2],[1,6,4],[1,2,4],[1,8,3],[3,10,8],[3,11,8],[3,12,8],[4,9,3],[4,1,4],[2,9,4]];
for (const [s, c, r] of PLAN.slice(0, Number(process.env.PIECES ?? PLAN.length))) { await key(`Digit${s}`); await tile(c, r); }
await key('Escape');
const remote = (m, p) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
const btn = await page.evaluate(() => window.__terracity.uiToScreen('hud-panel', 'xr-button'));
await page.mouse.click(btn.x, btn.y);
for (let i = 0; i < 10 && !(await remote('get_session_status', {}))?.sessionActive; i++) await page.waitForTimeout(500);
if (!(await remote('get_session_status', {}))?.sessionActive) await remote('accept_session', {});
await page.waitForTimeout(1500);
await page.evaluate(() => { const d = window.IWER_DEVICE.devui; d.devUIContainer.style.display = 'none'; if (d.inputLayer?.style) d.inputLayer.style.display = 'none'; });
await remote('set_input_mode', { mode: 'hand' });
await remote('set_transform', { device: 'headset', position: { x: 0, y: 1.2, z: 0.08 } });
await remote('look_at', { device: 'headset', target: { x: 0, y: 0.8, z: -0.52 } });
await remote('set_transform', { device: 'hand-right', position: { x: 0.3, y: 0.6, z: 0.1 } });
await remote('set_transform', { device: 'hand-left', position: { x: -0.3, y: 0.6, z: 0.1 } });
await page.waitForTimeout(2000);
const stats = async (label) => appendFileSync(`${OUT}/${TAG}-stats.txt`, `xr ${label}: ${JSON.stringify(await page.evaluate(() => window.__terracity.renderStats()))}\n`);
await page.screenshot({ path: `${OUT}/${TAG}-xr-2026.png` }); await stats('2026');
// Close-up from a leaned-in seated pose.
await remote('set_transform', { device: 'headset', position: { x: 0.05, y: 1.05, z: -0.12 } });
await remote('look_at', { device: 'headset', target: { x: 0.05, y: 0.8, z: -0.5 } });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/${TAG}-xr-closeup.png` });
// Detail: homes, bridge, park and solar farm near the old town.
await remote('set_transform', { device: 'headset', position: { x: 0.02, y: 0.93, z: -0.33 } });
await remote('look_at', { device: 'headset', target: { x: 0.0, y: 0.8, z: -0.62 } });
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/${TAG}-xr-detail.png` });
await remote('set_transform', { device: 'headset', position: { x: 0, y: 1.2, z: 0.08 } });
await remote('look_at', { device: 'headset', target: { x: 0, y: 0.8, z: -0.52 } });
await key('KeyT'); await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/${TAG}-xr-2035.png` });
await key('KeyT'); await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/${TAG}-xr-2050.png` }); await stats('2050');
const t0 = await page.evaluate(() => new Promise((r) => { const ts = []; const s = (t) => { ts.push(t); ts.length < 121 ? requestAnimationFrame(s) : r(ts); }; requestAnimationFrame(s); }));
const d = t0.slice(1).map((t, i) => t - t0[i]).sort((a, b) => a - b);
appendFileSync(`${OUT}/${TAG}-stats.txt`, `xr frame time over 120 frames (desktop Chromium + IWER, NOT a Quest): median ${d[60].toFixed(1)} ms, p95 ${d[114].toFixed(1)} ms\n`);
await browser.close();
console.log('done');
