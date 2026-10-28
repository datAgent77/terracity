import { test } from '@playwright/test';
import { open } from './helpers';
// Evidence: icons render in whatever build the suite points at.
test('icon rendering shot (live/prod)', async ({ page }) => {
  await open(page);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `docs/evidence/${process.env.E2E_SHOT ?? 'phase3-dev-build-icons'}.png` });
});
