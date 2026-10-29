import { test } from '@playwright/test';
import { appendFileSync } from 'node:fs';
import { buildPlan, open, ui } from './helpers';

// Measures the worst frame while switching 2026 -> 2050 for the first time on an
// under-housed plan (many sprawl meshes). Desktop software rendering — relative only.
test.skip(!process.env.HITCH_TAG, 'set HITCH_TAG to measure');
test('first time-travel frame cost', async ({ page }) => {
  await open(page);
  await ui(page, 'hud-panel', 'btn-skip-tips');
  await buildPlan(page, [[1, 6, 4]]);
  await page.waitForTimeout(3000); // idle time (lets any pre-building happen)
  await page.evaluate(() => {
    const w = window as unknown as { __frames: number[] };
    w.__frames = [];
    let last = performance.now();
    const step = (t: number) => {
      w.__frames.push(t - last);
      last = t;
      if (w.__frames.length < 90) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  const btn = await page.evaluate(() => window.__terracity.uiToScreen('time-panel', 'year-2050'));
  await page.mouse.click(btn!.x, btn!.y);
  await page.waitForFunction(() => (window as unknown as { __frames: number[] }).__frames.length >= 90, null, { timeout: 60000 });
  const f = await page.evaluate(() => (window as unknown as { __frames: number[] }).__frames.slice(1));
  const sorted = [...f].sort((a, b) => a - b);
  appendFileSync('docs/visual/hitch.txt', `${process.env.HITCH_TAG}: worst ${Math.max(...f).toFixed(0)} ms, median ${sorted[Math.floor(sorted.length / 2)].toFixed(0)} ms over ${f.length} frames\n`);
});
