import { expect, test } from '@playwright/test';
import { key, open, tile, ui } from './helpers';

// XR capability fallback + desktop input (CAUSALITY G, QA items 11 and 12).
// Meaningful where the browser cannot start an immersive session: the
// production build (`vite preview`, no IWER emulator). On the dev server the
// IWER emulator provides WebXR, so the XR half is skipped there.
test('without WebXR support the desktop experience is complete and Enter Mixed Reality is not offered', async ({ page }) => {
  test.setTimeout(150_000);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await open(page);
  const t = () => page.evaluate(() => { const h = window.__terracity as unknown as Record<string, unknown>; return { xrSupported: h.xrSupported, xrButtonShown: h.xrButtonShown }; });
  await page.waitForFunction(() => 'xrSupported' in (window.__terracity as unknown as Record<string, unknown>));
  const emulated = await page.evaluate(() => 'IWER_DEVICE' in window);
  test.skip(emulated, 'IWER provides WebXR on the dev server: run against the production build (E2E_BASE_URL)');
  expect((await t()).xrSupported).toBe(false);
  expect((await t()).xrButtonShown).toBe(false); // nothing to press that cannot work
  // The core loop runs with mouse and keyboard alone.
  await key(page, 'Digit1');
  await tile(page, 6, 4);
  await key(page, 'Escape');
  await ui(page, 'actions-panel', 'btn-split');
  await page.waitForFunction(() => { const s = (window.__terracity as unknown as { split(): { t: number; open: boolean } }).split(); return s.open && s.t === 1; });
  await ui(page, 'actions-panel', 'btn-enter');
  await page.waitForFunction(() => { const s = (window.__terracity as unknown as { street(): { active: boolean; fading: boolean } }).street(); return s.active && !s.fading; });
  await ui(page, 'street-panel', 'st-return');
  await page.waitForFunction(() => !(window.__terracity as unknown as { street(): { active: boolean } }).street().active);
  expect(errors).toEqual([]);
});
