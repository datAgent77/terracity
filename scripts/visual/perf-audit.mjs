/**
 * CAUSALITY milestone G: performance audit in Meta's IWER emulator (stereo,
 * Quest 3 profile) on desktop Chromium. Renderer cost per state of the core
 * loop, frame-time distribution AS MEASURED HERE (software / desktop GPU —
 * NOT a Quest number), and a leak check over repeated enter / exit cycles.
 *   TAG=cg node scripts/visual/perf-audit.mjs
 */
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const TAG = process.env.TAG ?? 'cg';
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
await page.goto(process.env.URL ?? 'https://localhost:8081/');
await page.waitForFunction(() => window.__terracity?.uiToScreen && window.IWER_DEVICE && window.__terracity?.gpuBudget);
await page.waitForTimeout(2500);
const frames = (n = 4) => page.evaluate((n) => new Promise((r) => { const s = () => (--n ? requestAnimationFrame(s) : r()); requestAnimationFrame(s); }), n);
const key = async (k) => { await page.keyboard.press(k); await frames(); };
const tile = async (c, r) => { const p = await page.evaluate(([c, r]) => window.__terracity.tileToScreen(c, r), [c, r]); await page.mouse.click(p.x, p.y); await frames(); };
const settle = async () => { await page.waitForFunction(() => !window.__terracity.street().fading); await frames(8); await page.waitForTimeout(800); };
await key('Enter'); // Begin
await key('KeyH'); // tips off (the audit is about cost, not the journey)
const PLAN = [[5,6,3],[5,7,3],[1,6,2],[1,6,4],[1,2,4],[1,8,3],[3,10,8],[3,11,8],[3,12,8],[4,9,3],[4,1,4],[2,9,4]];
for (const [s, c, r] of PLAN) { await key(`Digit${s}`); await tile(c, r); }
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
await page.waitForTimeout(2000);

const rows = [];
const frameTimes = () => page.evaluate(() => new Promise((r) => { const ts = []; const s = (t) => { ts.push(t); ts.length < 91 ? requestAnimationFrame(s) : r(ts); }; requestAnimationFrame(s); }));
const measure = async (label) => {
  await frames(10);
  const t = await frameTimes();
  const d = t.slice(1).map((x, i) => x - t[i]).sort((a, b) => a - b);
  const r = await page.evaluate(() => ({ ...window.__terracity.renderStats(), ...window.__terracity.gpuBudget() }));
  rows.push({ label, ...r, frameMedianMs: +d[45].toFixed(1), frameP95Ms: +d[85].toFixed(1) });
  console.log(label, JSON.stringify(rows.at(-1)));
};
await measure('tabletop 2026');
await key('KeyT'); await key('KeyT'); await page.waitForTimeout(1500);
await measure('tabletop 2050');
await key('KeyV'); await page.waitForFunction(() => { const s = window.__terracity.split(); return s.open && s.t === 1; }); await frames(10);
await measure('two futures');
await key('KeyW'); await page.waitForTimeout(800);
await measure('two futures + Causality Vision');
await key('KeyW');
await page.evaluate(() => window.__terracity.selectFuture('A')); await key('KeyE'); await settle();
await page.evaluate(() => window.__terracity.talk('next')); await page.waitForTimeout(600);
await measure('street, your plan (Mira talking)');
await page.evaluate(() => window.__terracity.talk('end'));
await key('KeyE'); await settle();
await page.evaluate(() => window.__terracity.selectFuture('B')); await key('KeyE'); await settle();
await measure('street, nobody plans');
await key('KeyE'); await settle();
// Leak check: 6 more enter / exit cycles, alternating futures.
const before = await page.evaluate(() => window.__terracity.renderStats());
for (let i = 0; i < Number(process.env.CYCLES ?? 6); i++) {
  await page.evaluate((s) => window.__terracity.selectFuture(s), i % 2 ? 'B' : 'A'); await key('KeyE'); await settle();
  await key('KeyE'); await settle();
}
const after = await page.evaluate(() => window.__terracity.renderStats());
await measure('two futures after 8 street visits');
const leak = { geometriesBefore: before.geometries, geometriesAfter: after.geometries, texturesBefore: before.textures, texturesAfter: after.textures, heapBeforeMB: before.jsHeapMB, heapAfterMB: after.jsHeapMB };
console.log('leak', JSON.stringify(leak));
writeFileSync(`docs/visual/${TAG}-perf.json`, JSON.stringify({ note: 'Desktop Chromium + IWER (Quest 3 profile, stereo). NOT a Quest measurement; frame times reflect this machine only.', rows, leak, pageErrors: errors }, null, 2) + '\n');
console.log(`page errors: ${errors.length} ${errors.slice(0, 3).join(' | ')}`);
await browser.close();
