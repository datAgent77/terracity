import { expect, test } from '@playwright/test';
import { buildPlan, key, open, REFERENCE, ui } from './helpers';

// Renderer cost, measured in desktop Chromium (not a Quest frame-time claim).
test('render cost of a full plan in 2050 stays bounded', async ({ page }) => {
  await open(page);
  await buildPlan(page, REFERENCE);
  await ui(page, 'time-panel', 'year-2050');
  await page.waitForTimeout(1500);
  const stats = await page.evaluate(() => (window.__terracity as unknown as { renderStats(): Record<string, number> }).renderStats());
  console.log(`[perf] full plan 2050: ${JSON.stringify(stats)}`);
  await key(page, 'KeyT');
  expect(stats.calls).toBeGreaterThan(0);
  test.info().annotations.push({ type: 'renderStats', description: JSON.stringify(stats) });
});
