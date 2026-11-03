/**
 * COMPETITION milestone B evidence: year-specific causality and the causal chain.
 *   TAG=mb node scripts/visual/causality-chain.mjs
 */
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const TAG = process.env.TAG ?? 'mb';
const URL = process.env.URL ?? 'https://localhost:8081/';
const out = (n) => `docs/visual/${TAG}-${n}.png`;
const log = [];
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
await page.goto(URL);
await page.waitForFunction(() => window.__terracity?.tileToScreen && window.__terracity?.causality);
await page.waitForTimeout(2500);
const frames = (n = 4) => page.evaluate((n) => new Promise((r) => { const s = () => (--n ? requestAnimationFrame(s) : r()); requestAnimationFrame(s); }), n);
const key = async (k) => { await page.keyboard.press(k); await frames(); };
const cz = () => page.evaluate(() => window.__terracity.causality());
const place = async (pieces) => { for (const [s, c, r] of pieces) { await key(`Digit${s}`); const p = await page.evaluate(([c, r]) => window.__terracity.tileToScreen(c, r), [c, r]); await page.mouse.click(p.x, p.y); await frames(); } await key('Escape'); };
await key('Enter'); await key('KeyH');
const c = () => page.evaluate(() => window.__terracity.causality());
await key('Enter'); await key('KeyH');
// One choice: homes next to the town, on farmland-free land; then a road links a second neighbourhood.
await place([[1, 6, 4]]); await page.waitForTimeout(600);
let s = await c();
log.push(`2026 card: ${s.card}`);
log.push(`2026 shown: ${JSON.stringify(s.shown)}`);
await page.screenshot({ path: out('1-now-and-by-2050') });
await key('KeyW'); await page.waitForTimeout(400);
await key('KeyT'); await page.waitForTimeout(800); // 2035
s = await c();
log.push(`2035 card: ${s.card}`);
await page.screenshot({ path: out('2-by-2035') });
await key('KeyT'); await page.waitForTimeout(800); // 2050
s = await c();
log.push(`2050 card: ${s.card}`);
for (let i = 0; i < 3; i++) {
  await page.evaluate(() => window.__terracity.nextCause()); await page.waitForTimeout(500);
  s = await c();
  log.push(`focus ${s.focus}: rings=${s.ringsVisible} card=${s.card}`);
  if (i === 1) await page.screenshot({ path: out('3-causal-chain') });
}
await key('KeyT'); await page.waitForTimeout(500); // back to 2026
await key('KeyV'); await page.waitForFunction(() => { const s = window.__terracity.split(); return s.open && s.t === 1; }); await frames(8);
s = await c();
log.push(`split card: ${s.card}`);
await page.screenshot({ path: out('4-two-futures') });
log.push(`page errors: ${errors.length} ${errors.slice(0, 3).join(' | ')}`);
writeFileSync(`docs/visual/${TAG}-log.txt`, log.join('\n') + '\n');
console.log(log.join('\n'));
await browser.close();
