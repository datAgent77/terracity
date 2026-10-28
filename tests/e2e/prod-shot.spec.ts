import { test } from '@playwright/test';
import { open } from './helpers';
// Evidence: icons render in whatever build the suite points at.
test('icon rendering shot', async ({ page }) => {
  await open(page);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `docs/evidence/phase3-${process.env.E2E_BASE_URL ? 'prod' : 'dev'}-build-icons.png` });
});
