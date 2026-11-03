/**
 * CAUSALITY milestone D evidence: Mira 2.0 — talk to her; the same place in two futures.
 *   TAG=cd node scripts/visual/mira2.mjs      (XR=1 adds a hands-only IWER pass)
 */
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const TAG = process.env.TAG ?? 'cd';
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
await place([[5, 6, 3], [5, 7, 3], [1, 6, 2], [1, 6, 4], [1, 2, 4], [1, 8, 3], [3, 10, 8], [3, 11, 8], [3, 12, 8], [4, 9, 3], [4, 8, 2], [2, 9, 4]]);
await key('KeyV');
await page.waitForFunction(() => { const s = window.__terracity.split(); return s.open && s.t === 1; });
await ui('actions-panel', 'btn-enter'); await settle();
await page.waitForTimeout(1200);
await page.screenshot({ path: out('1-invitation') });
let s = await street();
log.push(`A invitation: ${JSON.stringify({ talking: s.child?.talking, dialogue: s.child?.dialogue })}`);
await ui('street-panel', 'st-talk'); await page.waitForTimeout(800);
await page.screenshot({ path: out('2-talk-line1') });
for (let i = 1; i < (s.child?.dialogue?.length ?? 0); i++) {
  await ui('street-panel', 'st-talk'); await page.waitForTimeout(700);
  if (i === 3) await page.screenshot({ path: out('3-talk-other-future') });
}
s = await street();
log.push(`A after lines: talking=${s.child?.talking} index=${s.child?.index}`);
await ui('street-panel', 'st-talk-end'); await page.waitForTimeout(400);
log.push(`A ended: talking=${(await street()).child?.talking}`);
// The same place in Future B (nobody planned).
await ui('street-panel', 'st-return'); await settle();
await page.evaluate(() => window.__terracity.selectFuture('B')); await frames(4);
await ui('actions-panel', 'btn-enter'); await settle(); await page.waitForTimeout(1200);
s = await street();
log.push(`B groundY=${s.child?.groundY}`); log.push(`B: plan=${s.plan} dialogue=${JSON.stringify(s.child?.dialogue)}`);
await page.evaluate(() => window.__terracity.talk('next')); await page.waitForTimeout(800);
await page.screenshot({ path: out('4-future-B-line1') });
await page.evaluate(() => window.__terracity.talk('next')); await page.evaluate(() => window.__terracity.talk('next')); await page.waitForTimeout(800);
await page.screenshot({ path: out('5-future-B-other') });
log.push(`page errors: ${errors.length} ${errors.slice(0, 3).join(' | ')}`);
writeFileSync(`docs/visual/${TAG}-log.txt`, log.join('\n') + '\n');
console.log(log.join('\n'));
await browser.close();
