import { expect, test } from '@playwright/test';
import { buildPlan, key, open, snap } from './helpers';

type Split = { open: boolean; t: number; boardVisible: boolean | null; selected: 'A' | 'B' | null; built: string };
const split = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __terracity: { split(): Split } }).__terracity.split());
const settled = (page: import('@playwright/test').Page) =>
  page.waitForFunction(() => {
    const s = (window as unknown as { __terracity: { split(): Split } }).__terracity.split();
    return s.t === (s.open ? 1 : 0);
  });
const year = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __terracity: { futureVisuals(): { state: { year: number } } } }).__terracity.futureVisuals().state.year);

test('split reality: two futures from the same plan, editing blocked, merge restores the table and the plan', async ({ page }) => {
  await open(page);
  await buildPlan(page, [[1, 6, 4], [5, 6, 3], [3, 12, 8]]);
  const before = JSON.stringify((await snap(page)).placements ?? (await page.evaluate(() => (window as unknown as { __terracity: { game: { placements: unknown } } }).__terracity.game.placements)));

  // Fallback control: the Plan pad button.
  const btn = await page.evaluate(() => (window as unknown as { __terracity: { uiToScreen(a: string, b: string): { x: number; y: number } } }).__terracity.uiToScreen('actions-panel', 'btn-split'));
  await page.mouse.click(btn.x, btn.y);
  await settled(page);
  let s = await split(page);
  expect(s.open).toBe(true);
  expect(s.boardVisible).toBe(false);
  expect(s.built).toMatch(/^2050\|Your plan:.+\|If nobody plans:$/); // left: your plan, right: nobody plans
  expect(await year(page)).toBe(2050);

  // Editing is blocked while split; the clock does not run.
  const t0 = (await snap(page)).timeLeft;
  await key(page, 'Digit1');
  await page.waitForTimeout(1500);
  expect((await snap(page)).timeLeft).toBe(t0);

  // Merge with V: one world again, same plan, the year as before.
  await key(page, 'KeyV');
  await settled(page);
  s = await split(page);
  expect(s.open).toBe(false);
  expect(s.boardVisible).toBe(true);
  expect(await year(page)).toBe(2026);
  const after = JSON.stringify((await snap(page)).placements ?? (await page.evaluate(() => (window as unknown as { __terracity: { game: { placements: unknown } } }).__terracity.game.placements)));
  expect(after).toBe(before);

  // With a saved Plan A the futures are Plan A (left) and Plan B (right).
  await key(page, 'KeyS');
  await buildPlan(page, [[1, 8, 3]]);
  await key(page, 'KeyV');
  await settled(page);
  expect((await split(page)).built).toMatch(/\|Plan A:.+\|Plan B \(now\):.+/);
  await key(page, 'KeyV');
  await settled(page);
});
