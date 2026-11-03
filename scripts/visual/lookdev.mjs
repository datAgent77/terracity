/**
 * Look-dev loop: a few street frames per future (desktop Chromium).
 *   TAG=lk node scripts/visual/lookdev.mjs
 */
import { chromium } from "playwright";
const TAG = process.env.TAG ?? 'lk';
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
await ui('overlay-panel', 'ov-secondary'); await page.waitForTimeout(500);
await place([[5, 6, 3], [5, 7, 3], [1, 6, 2], [1, 6, 4], [1, 2, 4], [1, 8, 3], [3, 10, 8], [3, 11, 8], [3, 12, 8], [4, 9, 3], [4, 8, 2], [2, 8, 4]]);
await key('KeyV');
await page.waitForFunction(() => { const s = window.__terracity.split(); return s.open && s.t === 1; }); await frames(6);
const VPS = (process.env.VPS ?? '0,2,3').split(',').map(Number);
for (const side of (process.env.SIDES ?? 'A,B').split(',')) {
  await page.evaluate((f) => window.__terracity.selectFuture(f), side); await frames(4);
  await ui('actions-panel', 'btn-enter'); await settle();
  for (const vp of VPS) {
    await page.evaluate((i) => window.__terracity.gotoViewpoint?.(i), vp); await settle();
    if (process.env.HIDE_UI) await page.evaluate(() => { window.__terracity.photoMode?.(true); const walk = (root) => { for (const e of root.querySelectorAll('*')) { if (e.tagName === 'BUTTON' && (e.textContent || '').includes('XR')) { e.style.display = 'none'; if (e.parentElement) e.parentElement.style.display = 'none'; } if (e.shadowRoot) walk(e.shadowRoot); } }; walk(document); });
    await frames(3);
    await page.screenshot({ path: out(`${side}-vp${vp}`) });
    if (process.env.HIDE_UI) await page.evaluate(() => window.__terracity.photoMode?.(false));
  }
  await ui('street-panel', 'st-return'); await settle();
}
console.log(`page errors: ${errors.length} ${errors.slice(0, 3).join(' | ')}`);
await browser.close();
