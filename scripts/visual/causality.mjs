/**
 * CAUSALITY milestone B evidence: Causality Vision in the running app.
 *   TAG=cb node scripts/visual/causality.mjs     (XR=1 adds IWER)
 */
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const TAG = process.env.TAG ?? 'cb';
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
await place([[1, 6, 4], [5, 6, 3], [1, 8, 3]]);
await page.waitForTimeout(600);
// The decision: connect the second neighbourhood with a road.
await place([[5, 7, 3]]);
await page.waitForTimeout(350);
await page.screenshot({ path: out('1-decision-pulse') });
let c = await cz();
log.push(`decision: ${JSON.stringify(c.event)}`);
await key('KeyW'); // Causality Vision on
await page.waitForTimeout(700);
c = await cz();
log.push(`vision on: rings=${c.ringsVisible} anchors=${c.anchors} card=${c.card}`);
await page.screenshot({ path: out('2-vision-road') });
// A second decision: a solar farm on farmland (benefit and cost).
await place([[2, 3, 5]]);
await page.waitForTimeout(700);
c = await cz();
log.push(`solar on farmland: ${c.event.explanation} | rings=${c.ringsVisible} | ${c.event.effects.map((e) => e.text).join(' / ')}`);
await page.screenshot({ path: out('3-vision-solar-farmland') });
// Two futures: Plan A (now) vs Plan B (more homes, a park).
await key('KeyS');
await place([[1, 6, 2], [1, 2, 4], [4, 1, 4]]);
await key('KeyV');
await page.waitForFunction(() => { const s = window.__terracity.split(); return s.open && s.t === 1; });
await page.waitForTimeout(800);
c = await cz();
log.push(`split: miniMarks=${c.miniMarks} card=${c.card}`);
await page.screenshot({ path: out('4-vision-two-futures') });
log.push(`page errors: ${errors.length} ${errors.slice(0, 3).join(' | ')}`);
writeFileSync(`docs/visual/${TAG}-log.txt`, log.join('\n') + '\n');
console.log(log.join('\n'));
await browser.close();
