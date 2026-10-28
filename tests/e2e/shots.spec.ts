import { test } from '@playwright/test';
import { buildPlan, open, REFERENCE, ui } from './helpers';

// Evidence screenshots for docs (not assertions).
test('desktop shots', async ({ page }) => {
  await open(page);
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'docs/evidence/phase3-desktop-start.png' });
  await buildPlan(page, REFERENCE);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'docs/evidence/phase3-desktop-plan.png' });
  await ui(page, 'time-panel', 'year-2050');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'docs/evidence/phase3-desktop-2050.png' });
});
