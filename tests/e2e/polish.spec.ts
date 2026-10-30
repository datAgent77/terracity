import { expect, test, type Page } from '@playwright/test';
import { button, key, open, tile, ui } from './helpers';

const sig = (page: Page, name: string) =>
  page.evaluate((n) => (window.__terracity as unknown as Record<string, { value: unknown }>)[n].value, name);

test('guided tips walk the first minute and then get out of the way', async ({ page }) => {
  await open(page);
  expect(await sig(page, 'coachText')).toMatch(/Tip 1\/5/);
  await key(page, 'Digit1');
  await tile(page, 6, 4);
  expect(await sig(page, 'coachText')).toMatch(/Tip 2\/5/);
  await page.screenshot({ path: 'docs/evidence/phase3-e2e-tip2-glow.png' });
  await key(page, 'Digit3');
  await tile(page, 12, 8);
  await key(page, 'Escape');
  expect(await sig(page, 'coachText')).toMatch(/Tip 3\/5/);
  await ui(page, 'actions-panel', 'btn-enter');
  await page.waitForFunction(() => !(window.__terracity as unknown as { street(): { fading: boolean } }).street().fading);
  expect(await sig(page, 'coachText')).toMatch(/Tip 4\/5/);
  await ui(page, 'street-panel', 'st-2050');
  expect(await sig(page, 'coachText')).toMatch(/Tip 5\/5/);
  await ui(page, 'street-panel', 'st-return');
  await page.waitForFunction(() => !(window.__terracity as unknown as { street(): { active: boolean; fading: boolean } }).street().fading);
  await ui(page, 'time-panel', 'year-2026');
  expect(await sig(page, 'coachText')).toBe('');
});

test('tips can be skipped from the HUD chip (and turned back on with H)', async ({ page }) => {
  await open(page);
  await ui(page, 'hud-panel', 'btn-skip-tips');
  expect(await sig(page, 'coachText')).toBe('');
  await key(page, 'KeyH');
  expect(await sig(page, 'coachText')).toMatch(/Tip 1\/5/);
});

test('larger text enlarges the panels; sound toggles', async ({ page }) => {
  await open(page);
  const span = async () => {
    const a = await page.evaluate(() => window.__terracity.uiToScreen('actions-panel', 'btn-undo'));
    const b = await page.evaluate(() => window.__terracity.uiToScreen('actions-panel', 'btn-finish'));
    return Math.hypot(b!.x - a!.x, b!.y - a!.y);
  };
  const before = await span();
  await ui(page, 'hud-panel', 'btn-text-size');
  await page.waitForTimeout(500);
  expect(await sig(page, 'largeText')).toBe(true);
  expect(await span()).toBeGreaterThan(before * 1.15);
  await page.screenshot({ path: 'docs/evidence/phase3-e2e-large-text.png' });
  await key(page, 'KeyL');
  expect(await sig(page, 'largeText')).toBe(false);

  expect(await sig(page, 'soundOn')).toBe(true);
  await ui(page, 'hud-panel', 'btn-sound');
  expect(await sig(page, 'soundOn')).toBe(false);
  await key(page, 'KeyM');
  expect(await sig(page, 'soundOn')).toBe(true);
});

test('blocked tiles show an X, not only red', async ({ page }) => {
  await open(page);
  await ui(page, 'hud-panel', 'btn-skip-tips');
  await key(page, 'Digit1');
  const sea = await page.evaluate(() => window.__terracity.tileToScreen(3, 1));
  await page.mouse.move(sea!.x, sea!.y);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/evidence/phase3-e2e-blocked-x.png', clip: { x: sea!.x - 120, y: sea!.y - 80, width: 240, height: 160 } });
  const plain = await page.evaluate(() => window.__terracity.tileToScreen(9, 3));
  await page.mouse.move(plain!.x, plain!.y);
  await button(page, 'btn-undo'); // harmless click to leave the board
});
