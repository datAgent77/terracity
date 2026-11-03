/**
 * Five screenshots of the current app (desktop Chromium, 1600 x 1000).
 *   TAG=final node scripts/visual/final-shots.mjs
 */
import { chromium } from "playwright";
const TAG = process.env.TAG ?? 'final';
const URL = process.env.URL ?? 'https://localhost:8081/';
const out = (n) => `docs/visual/${TAG}-${n}.png`;
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 }, ignoreHTTPSErrors: true })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
await page.goto(URL);
await page.waitForFunction(() => window.__terracity?.tileToScreen && window.__terracity?.street && window.__terracity?.overlay);
await page.waitForTimeout(3000);
const frames = (n = 4) => page.evaluate((n) => new Promise((r) => { const s = () => (--n ? requestAnimationFrame(s) : r()); requestAnimationFrame(s); }), n);
const key = async (k) => { await page.keyboard.press(k); await frames(); };
const settle = async () => { await page.waitForFunction(() => !window.__terracity.street().fading); await frames(8); await page.waitForTimeout(900); };
const ui = async (panel, id) => { await page.evaluate(([p, i]) => window.__terracity.reveal?.(p, i), [panel, id]); await frames(3); const p = await page.evaluate(([a, b]) => window.__terracity.uiToScreen(a, b), [panel, id]); await page.mouse.click(p.x, p.y); await frames(); };
const place = async (pieces) => { for (const [s, c, r] of pieces) { await key(`Digit${s}`); const p = await page.evaluate(([c, r]) => window.__terracity.tileToScreen(c, r), [c, r]); await page.mouse.click(p.x, p.y); await frames(); } await key('Escape'); };

// 1. The intro card over the miniature coast.
await page.screenshot({ path: out('1-every-city-begins-with-a-choice') });
await ui('overlay-panel', 'ov-secondary'); // Skip intro: a clean planning view
await page.waitForTimeout(600);
// 2. A balanced plan, seen in 2050 (homes, roads, wind ridge, parks, solar).
await place([[5, 6, 3], [5, 7, 3], [1, 6, 2], [1, 6, 4], [1, 2, 4], [1, 8, 3], [3, 10, 8], [3, 11, 8], [3, 12, 8], [4, 9, 3], [4, 8, 2], [2, 8, 4]]);
await page.waitForTimeout(800);
await key('KeyT'); await key('KeyT'); await page.waitForTimeout(2500);
await page.screenshot({ path: out('2-balanced-city-2050') });
// 3. Two futures + Causality Vision.
await key('KeyV');
await page.waitForFunction(() => { const s = window.__terracity.split(); return s.open && s.t === 1; }); await frames(8);
await key('KeyW'); await page.waitForTimeout(1500);
await page.screenshot({ path: out('3-two-futures-causality-vision') });
await key('KeyW');
// 4. Your future at street level: Mira talks about the other future.
await page.evaluate(() => window.__terracity.selectFuture('A')); await frames(4);
await ui('actions-panel', 'btn-enter'); await settle();
for (let i = 0; i < 3; i++) await page.evaluate(() => window.__terracity.talk('next'));
await page.waitForTimeout(1200);
await page.screenshot({ path: out('4-meet-mira-your-plan') });
await page.evaluate(() => window.__terracity.talk('end'));
// 5. The same street where nobody planned, the point of interest open.
await ui('street-panel', 'st-return'); await settle();
await page.evaluate(() => window.__terracity.selectFuture('B')); await frames(4);
await ui('actions-panel', 'btn-enter'); await settle();
await ui('street-panel', 'st-next'); await settle(); // Street end: the sprawl, Mira in the distance
await page.evaluate(() => window.__terracity.poi(0)); await page.waitForTimeout(1000);
await page.screenshot({ path: out('5-same-street-nobody-plans') });
console.log(`page errors: ${errors.length} ${errors.slice(0, 3).join(' | ')}`);
await browser.close();
