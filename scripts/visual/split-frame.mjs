/**
 * Look-dev: the same place in both futures, one frame — left half your plan,
 * right half nobody planning — joined at a glowing seam. Both halves are real
 * renders from the same viewpoint and year (photo mode hides UI only).
 *   VP=3 TAG=lk node scripts/visual/split-frame.mjs    (after lookdev.mjs with HIDE_UI=1)
 */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const TAG = process.env.TAG ?? 'lk';
const VP = process.env.VP ?? '3';
const a = readFileSync(`docs/visual/${TAG}-A-vp${VP}.png`).toString('base64');
const b = readFileSync(`docs/visual/${TAG}-B-vp${VP}.png`).toString('base64');
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage();
await page.setContent(`<canvas id=c width=1600 height=1000></canvas>`);
await page.evaluate(async ([a, b]) => {
  const load = (s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = `data:image/png;base64,${s}`; });
  const [A, B] = await Promise.all([load(a), load(b)]);
  const c = document.getElementById('c').getContext('2d');
  const W = 1600, H = 1000, seam = W / 2, tilt = 60; // slight diagonal
  c.drawImage(A, 0, 0, W, H);
  c.save();
  c.beginPath(); c.moveTo(seam + tilt, 0); c.lineTo(W, 0); c.lineTo(W, H); c.lineTo(seam - tilt, H); c.closePath(); c.clip();
  c.drawImage(B, 0, 0, W, H);
  c.restore();
  // glowing seam
  for (const [w, a] of [[18, 0.12], [8, 0.3], [2.5, 0.95]]) {
    c.strokeStyle = `rgba(255,246,220,${a})`; c.lineWidth = w;
    c.beginPath(); c.moveTo(seam + tilt, 0); c.lineTo(seam - tilt, H); c.stroke();
  }
  // labels
  const tag = (x, y, title, sub, align) => {
    c.textAlign = align; c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 12;
    c.fillStyle = '#ffffff'; c.font = '700 44px system-ui, sans-serif'; c.fillText(title, x, y);
    c.font = '500 24px system-ui, sans-serif'; c.fillText(sub, x, y + 34); c.shadowBlur = 0;
  };
  tag(48, 80, '2050 · Your plan', 'the same street, planned', 'left');
  tag(W - 48, 80, '2050 · If nobody plans', 'the same place, unplanned', 'right');
}, [a, b]);
await page.locator('#c').screenshot({ path: `docs/visual/${TAG}-split-vp${VP}.png` });
await browser.close();
console.log(`docs/visual/${TAG}-split-vp${VP}.png`);
