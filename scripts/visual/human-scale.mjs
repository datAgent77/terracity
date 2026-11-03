/**
 * CAUSALITY milestone E evidence: the street at human scale, every viewpoint, both futures (2050).
 *   TAG=ce node scripts/visual/human-scale.mjs
 */
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const TAG = process.env.TAG ?? 'ce';
const URL = process.env.URL ?? 'https://localhost:8081/';
const out = (n) => `docs/visual/${TAG}-${n}.png`;
const log = [];
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
await page.goto(URL);
await page.waitForFunction(() => window.__terracity?.tileToScreen && window.__terracity?.street && window.__terracity?.talk);
await page.waitForTimeout(2500);
const frames = (n = 4) => page.evaluate((n) => new Promise((r) => { const s = () => (--n ? requestAnimationFrame(s) : r()); requestAnimationFrame(s); }), n);
const key = async (k) => { await page.keyboard.press(k); await frames(); };
const street = () => page.evaluate(() => window.__terracity.street());
const settle = async () => { await page.waitForFunction(() => !window.__terracity.street().fading); await frames(6); await page.waitForTimeout(500); };
const ui = async (panel, id) => { await page.evaluate(([p, i]) => window.__terracity.reveal?.(p, i), [panel, id]); await frames(3); const p = await page.evaluate(([a, b]) => window.__terracity.uiToScreen(a, b), [panel, id]); await page.mouse.click(p.x, p.y); await frames(); };
const place = async (pieces) => { for (const [s, c, r] of pieces) { await key(`Digit${s}`); const p = await page.evaluate(([c, r]) => window.__terracity.tileToScreen(c, r), [c, r]); await page.mouse.click(p.x, p.y); await frames(); } await key('Escape'); };
await key('Enter'); await key('KeyH');
// Your plan (balanced) vs nobody planning; enter Future A (your plan) in 2050.
await place([[5, 6, 3], [5, 7, 3], [1, 6, 2], [1, 6, 4], [1, 2, 4], [1, 8, 3], [3, 10, 8], [3, 11, 8], [3, 12, 8], [4, 9, 3], [4, 8, 2], [2, 8, 4]]);
await key('KeyV');
await page.waitForFunction(() => { const s = window.__terracity.split(); return s.open && s.t === 1; });
for (const side of ['A', 'B']) {
  await page.evaluate((f) => window.__terracity.selectFuture(f), side); await frames(4);
  await ui('actions-panel', 'btn-enter'); await settle(); await page.waitForTimeout(1000);
  for (let i = 0; i < 4; i++) {
    const s = await street();
    log.push(`${side} tile=${s.tile} vp${s.viewpoint} plan=${s.plan} poi=${JSON.stringify(s.poi ?? null)}`);
    await page.screenshot({ path: out(`${side}-vp${s.viewpoint}`) });
    if (s.viewpoint === 0 && s.poi?.length) {
      await page.evaluate(() => window.__terracity.poi(0)); await frames(4);
      await page.screenshot({ path: out(`${side}-poi-open`) });
      log.push(`${side} poi open: ${JSON.stringify((await street()).poi.map((p) => p.open))}`);
      await page.evaluate(() => window.__terracity.poi(0)); await frames(2);
    }
    await ui('street-panel', 'st-next'); await settle(); await page.waitForTimeout(600);
  }
  await ui('street-panel', 'st-return'); await settle();
}
log.push(`page errors: ${errors.length} ${errors.slice(0, 3).join(' | ')}`);
writeFileSync(`docs/visual/${TAG}-log.txt`, log.join('\n') + '\n');
console.log(log.join('\n'));
await browser.close();
