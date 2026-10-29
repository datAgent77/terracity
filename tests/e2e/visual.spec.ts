import { test } from '@playwright/test';
import { appendFileSync } from 'node:fs';
import { buildPlan, button, open, REFERENCE, ui } from './helpers';

// Before/after evidence for the visual overhaul. Runs only with VISUAL_TAG set:
//   VISUAL_TAG=before npx playwright test tests/e2e/visual.spec.ts
const tag = process.env.VISUAL_TAG;
test.skip(!tag, 'set VISUAL_TAG to capture visual evidence');

test('desktop visual evidence', async ({ page }) => {
  const shot = (name: string) => page.screenshot({ path: `docs/visual/${tag}-desktop-${name}.png` });
  const stats = async (label: string) => {
    const s = await page.evaluate(() => (window.__terracity as unknown as { renderStats(): object }).renderStats());
    appendFileSync(`docs/visual/${tag}-stats.txt`, `desktop ${label}: ${JSON.stringify(s)}\n`);
  };
  await open(page);
  await page.waitForTimeout(1500);
  await shot('1-start');
  await stats('start');
  await buildPlan(page, REFERENCE.slice(0, 9)); // Plan A: homes, roads, ridge wind
  await page.waitForTimeout(1500);
  await shot('2-plan-2026');
  await button(page, 'btn-save-a');
  await buildPlan(page, REFERENCE.slice(9)); // Plan B: + parks + solar
  await page.waitForTimeout(1500);
  await shot('3-plan-b-2026');
  await stats('full plan 2026');
  await ui(page, 'time-panel', 'year-2050');
  await page.waitForTimeout(2500);
  await shot('4-plan-b-2050');
  await stats('full plan 2050');
  await ui(page, 'time-panel', 'year-2026');
  await button(page, 'btn-compare');
  await page.waitForTimeout(1500);
  await shot('5-compare');
  await button(page, 'btn-compare');
  await button(page, 'btn-finish');
  await page.waitForTimeout(2500);
  await shot('6-result');
});
