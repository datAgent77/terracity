import { expect, test } from '@playwright/test';
import { buildPlan, open } from './helpers';

type Dial = { p: number; label: string; dragging: string | null; year: number };
type W = { __terracity: { dial(): Dial; dialToScreen(p: number): { x: number; y: number }; futureVisuals(): { shown: { haze: number; progress: number } }; game: { placements: unknown } } };

test('sculpt time: drag the dial; in-between times are interpolated and labelled; release snaps to a simulated year', async ({ page }) => {
  await open(page);
  await buildPlan(page, [[1, 6, 4], [5, 6, 3], [3, 12, 8]]);
  const plan = await page.evaluate(() => JSON.stringify((window as unknown as W).__terracity.game.placements));
  const at = (p: number) => page.evaluate((p) => (window as unknown as W).__terracity.dialToScreen(p), p);
  const dial = () => page.evaluate(() => (window as unknown as W).__terracity.dial());
  const shown = () => page.evaluate(() => (window as unknown as W).__terracity.futureVisuals().shown);

  const start = await at(0);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let i = 1; i <= 12; i++) {
    const q = await at((0.75 * i) / 12);
    await page.mouse.move(q.x, q.y);
  }
  await page.waitForTimeout(600);
  let d = await dial();
  expect(d.dragging).toBe('ray');
  expect(d.p).toBeGreaterThan(0.6);
  expect(d.p).toBeLessThan(0.9);
  expect(d.label).toMatch(/^~20\d\d \(between projections\)$/); // honest label in between
  const mid = await shown();
  expect(mid.progress).toBeGreaterThan(0.55); // the world follows continuously
  expect(mid.progress).toBeLessThan(0.95);

  const end = await at(0.95);
  await page.mouse.move(end.x, end.y);
  await page.mouse.up();
  await page.waitForTimeout(900);
  d = await dial();
  expect(d.dragging).toBeNull();
  expect(d.year).toBe(2050);
  expect(d.label).toBe('2050');
  expect((await shown()).progress).toBeCloseTo(1, 1);

  // A tap on the ring jumps there and snaps to the nearest year (here 2026).
  const near0 = await at(0.05);
  await page.mouse.click(near0.x, near0.y);
  await page.waitForTimeout(900);
  expect((await dial()).year).toBe(2026);

  expect(await page.evaluate(() => JSON.stringify((window as unknown as W).__terracity.game.placements))).toBe(plan);
});
