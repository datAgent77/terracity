/**
 * Visual review of the showcase garden district (asset pipeline milestone).
 *   TAG=ap node scripts/visual/showcase.mjs
 * Writes docs/visual/${TAG}-*.png and ${TAG}-stats.txt:
 *   1 desktop normal view, 2 desktop close-up, 3 IWER seated view,
 *   4 IWER close-up, 5-7 the same district in 2026 / 2035 / 2050.
 */
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const TAG = process.env.TAG ?? 'snap';
const URL = process.env.URL ?? 'https://localhost:8081/';
const out = (n) => `docs/visual/${TAG}-${n}.png`;
const stats = [];
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true })).newPage();
await page.addInitScript(() => { try { localStorage.clear(); } catch {} performance.setResourceTimingBufferSize(5000); });
const t0 = Date.now();
await page.goto(URL);
await page.waitForFunction(() => window.__terracity?.uiToScreen && window.IWER_DEVICE);
stats.push(`time to interactive hook: ${Date.now() - t0} ms (dev server, cold browser cache)`);
const glb = await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => /glb|models/.test(e.name)).map((e) => ({ name: e.name.split('/').pop(), ms: Math.round(e.duration), bytes: e.encodedBodySize })));
stats.push(`glb requests: ${JSON.stringify(glb)}`);
await page.waitForTimeout(2500);
const frames = (n = 4) => page.evaluate((n) => new Promise((r) => { const s = () => (--n ? requestAnimationFrame(s) : r()); requestAnimationFrame(s); }), n);
const key = async (k) => { await page.keyboard.press(k); await frames(); };
const tile = async (c, r) => { const p = await page.evaluate(([c, r]) => window.__terracity.tileToScreen(c, r), [c, r]); await page.mouse.click(p.x, p.y); await frames(); };
const st = () => page.evaluate(() => window.__terracity.renderStats());
await key('Enter'); await key('KeyH');
for (const [s, c, r] of [[1,6,4],[5,6,3],[5,7,3],[1,8,3],[4,9,3],[2,9,4]]) { await key(`Digit${s}`); await tile(c, r); }
await key('Escape');
// OLD_CAM=1: the pre-milestone desktop framing, for before/after pairs.
if (process.env.OLD_CAM) await page.evaluate(() => window.__terracity.setCamera([0, 1.46, 0.46], [0, 0.7, -0.52]));
await page.waitForTimeout(1200);
await page.screenshot({ path: out('1-desktop') });
stats.push(`desktop normal view: ${JSON.stringify(await st())}`);

// The showcase district at (6,4): board-local (-0.03, -0.03) -> world (-0.03, ~0.79, -0.53).
const focus = [-0.03, 0.79, -0.53];
await page.evaluate((f) => window.__terracity.setCamera([f[0] + 0.01, f[1] + 0.1, f[2] + 0.11], f), focus);
await frames(8);
await page.screenshot({ path: out('2-desktop-closeup') });
for (const [i, y] of [[5, 2026], [6, 2035], [7, 2050]]) {
  if (y !== 2026) await key('KeyT');
  await page.waitForTimeout(2600);
  await page.screenshot({ path: out(`${i}-district-${y}`) });
  stats.push(`desktop close-up ${y}: ${JSON.stringify(await st())}`);
}
await key('KeyT'); // back to 2026
await page.waitForTimeout(2600);

const remote = (m, p) => page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [m, p]);
await page.evaluate((old) => (old ? window.__terracity.setCamera([0, 1.46, 0.46], [0, 0.7, -0.52]) : window.__terracity.setCamera([0, 1.3, 0.34], [0, 0.7, -0.5])), !!process.env.OLD_CAM);
const btn = await page.evaluate(() => window.__terracity.uiToScreen('hud-panel', 'xr-button'));
await page.mouse.click(btn.x, btn.y);
for (let i = 0; i < 10 && !(await remote('get_session_status', {}))?.sessionActive; i++) await page.waitForTimeout(500);
if (!(await remote('get_session_status', {}))?.sessionActive) await remote('accept_session', {});
await page.waitForTimeout(1500);
await page.evaluate(() => { const d = window.IWER_DEVICE.devui; d.devUIContainer.style.display = 'none'; if (d.inputLayer?.style) d.inputLayer.style.display = 'none'; });
await remote('set_input_mode', { mode: 'hand' });
await remote('set_transform', { device: 'hand-right', position: { x: 0.22, y: 0.86, z: -0.18 } });
await remote('set_transform', { device: 'hand-left', position: { x: -0.22, y: 0.86, z: -0.18 } });
await remote('set_transform', { device: 'headset', position: { x: 0, y: 1.2, z: 0.08 } });
await remote('look_at', { device: 'headset', target: { x: 0, y: 0.78, z: -0.5 } });
await page.waitForTimeout(1500);
await page.screenshot({ path: out('3-xr-seated') });
stats.push(`IWER seated (stereo): ${JSON.stringify(await st())}`);
// Leaning in over the table toward the district (board pose differs in XR).
const [fx, fy, fz] = await page.evaluate(() => window.__terracity.tileWorld(6, 4));
stats.push(`IWER district tile centre (world): ${[fx, fy, fz].map((v) => v.toFixed(3)).join(', ')}`);
await remote('set_transform', { device: 'headset', position: { x: fx + 0.01, y: fy + 0.17, z: fz + 0.17 } });
await remote('look_at', { device: 'headset', target: { x: fx, y: fy, z: fz } });
await page.waitForTimeout(1500);
await page.screenshot({ path: out('4-xr-closeup') });
const ft = await page.evaluate(() => new Promise((r) => { const ts = []; const s = (t) => { ts.push(t); if (ts.length < 121) requestAnimationFrame(s); else { const d = ts.slice(1).map((x, i) => x - ts[i]).sort((a, b) => a - b); r({ median: d[60].toFixed(1), p95: d[114].toFixed(1) }); } }; requestAnimationFrame(s); }));
stats.push(`IWER frame time over 120 frames (desktop Chromium software/ANGLE + IWER, NOT a Quest): median ${ft.median} ms, p95 ${ft.p95} ms`);
writeFileSync(`docs/visual/${TAG}-stats.txt`, stats.join('\n') + '\n');
await browser.close();
console.log(stats.join('\n'));
