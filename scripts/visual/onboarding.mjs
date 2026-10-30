/**
 * Milestone 5 evidence: guided tips through the signature flow (tips ON), and
 * the street panel with Larger text.
 *   TAG=m5 node scripts/visual/onboarding.mjs
 */
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const TAG = process.env.TAG ?? 'm5';
const URL = process.env.URL ?? 'https://localhost:8081/';
const out = (n) => `docs/visual/${TAG}-${n}.png`;
const log = [];
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
await page.goto(URL);
await page.waitForFunction(() => window.__terracity?.tileToScreen && window.__terracity?.street);
await page.waitForTimeout(2500);
const frames = (n = 4) => page.evaluate((n) => new Promise((r) => { const s = () => (--n ? requestAnimationFrame(s) : r()); requestAnimationFrame(s); }), n);
const key = async (k) => { await page.keyboard.press(k); await frames(); };
const settle = async () => { await page.waitForFunction(() => !window.__terracity.street().fading); await frames(6); await page.waitForTimeout(500); };
const ui = async (panel, id) => { const p = await page.evaluate(([a, b]) => window.__terracity.uiToScreen(a, b), [panel, id]); await page.mouse.click(p.x, p.y); await frames(); };
const tip = () => page.evaluate(() => window.__terracity.coachText.value);
await key('Enter'); // start, tips on
for (const [s, c, r] of [[1, 6, 4], [3, 12, 8]]) { await key(`Digit${s}`); const p = await page.evaluate(([c, r]) => window.__terracity.tileToScreen(c, r), [c, r]); await page.mouse.click(p.x, p.y); await frames(); }
await key('Escape');
await page.waitForTimeout(800);
log.push(`tabletop: ${await tip()}`);
await page.screenshot({ path: out('1-tip3-enter') });
await ui('actions-panel', 'btn-enter'); await settle();
log.push(`street: ${await tip()}`);
await page.screenshot({ path: out('2-tip4-2050') });
await ui('street-panel', 'st-2050'); await settle();
log.push(`street 2050: ${await tip()}`);
await page.screenshot({ path: out('3-tip5-return') });
await ui('street-panel', 'st-return'); await settle();
await ui('time-panel', 'year-2026'); await page.waitForTimeout(1500);
log.push(`after 2026: "${await tip()}"`);
// Larger text, then the street panel again.
await key('KeyL');
await key('KeyE'); await settle();
await page.screenshot({ path: out('4-street-large-text') });
log.push(`page errors: ${errors.length} ${errors.slice(0, 2).join(' | ')}`);
writeFileSync(`docs/visual/${TAG}-log.txt`, log.join('\n') + '\n');
console.log(log.join('\n'));
await browser.close();
