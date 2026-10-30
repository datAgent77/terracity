import { expect, test } from '@playwright/test';
import { buildPlan, key, open, snap } from './helpers';

type Street = { active: boolean; viewpoint: number | null; boardVisible: boolean | null; fading: boolean; year: number; story: string[] };
const street = (page: import('@playwright/test').Page) =>
  page.evaluate(() => (window as unknown as { __terracity: { street(): Street } }).__terracity.street());
const settled = (page: import('@playwright/test').Page) =>
  page.waitForFunction(() => !(window as unknown as { __terracity: { street(): Street } }).__terracity.street().fading);

test('enter your city: street view from the plan, viewpoints, clock paused, return to the tabletop', async ({ page }) => {
  await open(page);
  // Nothing to enter yet.
  await key(page, 'KeyE');
  expect((await street(page)).active).toBe(false);

  await buildPlan(page, [[1, 6, 4], [5, 6, 3]]);
  await key(page, 'KeyE');
  await settled(page);
  let s = await street(page);
  expect(s.active).toBe(true);
  expect(s.viewpoint).toBe(0);
  expect(s.boardVisible).toBe(false);

  // The challenge clock does not run while visiting.
  const t0 = (await snap(page)).timeLeft;
  await page.waitForTimeout(2200);
  expect((await snap(page)).timeLeft).toBe(t0);

  // Teleport between fixed viewpoints (both directions wrap).
  await key(page, 'ArrowRight');
  await settled(page);
  expect((await street(page)).viewpoint).toBe(1);
  await key(page, 'ArrowLeft');
  await key(page, 'ArrowLeft');
  await settled(page);
  expect((await street(page)).viewpoint).toBe(3);

  // Time travel inside the street: same neighbourhood, 2050, with its consequences in words.
  const y2050 = await page.evaluate(() => (window as unknown as { __terracity: { uiToScreen(a: string, b: string): { x: number; y: number } } }).__terracity.uiToScreen('street-panel', 'st-2050'));
  await page.mouse.click(y2050.x, y2050.y);
  await settled(page);
  s = await street(page);
  expect(s.active).toBe(true);
  expect(s.year).toBe(2050);
  expect(s.story[0]).toMatch(/solar roofs/);
  expect(s.story.join(' ')).toMatch(/newcomers found no planned home/); // one homes tile: under-housed

  // Return with the panel button.
  const ret = await page.evaluate(() => (window as unknown as { __terracity: { uiToScreen(a: string, b: string): { x: number; y: number } } }).__terracity.uiToScreen('street-panel', 'st-return'));
  await page.mouse.click(ret.x, ret.y);
  await settled(page);
  s = await street(page);
  expect(s.active).toBe(false);
  expect(s.boardVisible).toBe(true);
  // Editing works again after returning.
  expect((await snap(page)).phase).toBe('building');
});

test('compare futures at street level: same place and camera, Plan A vs Plan B from their own projections', async ({ page }) => {
  type S2 = Street & { plan: 'A' | 'B'; haze: number; greening: number; districtHere: boolean };
  const st = () => page.evaluate(() => (window as unknown as { __terracity: { street(): S2 } }).__terracity.street());
  const click = async (id: string) => {
    const p = await page.evaluate((id) => (window as unknown as { __terracity: { uiToScreen(a: string, b: string): { x: number; y: number } } }).__terracity.uiToScreen('street-panel', id), id);
    await page.mouse.click(p.x, p.y);
    await settled(page);
  };
  await open(page);
  // Plan A: one neighbourhood, under-housed. Plan B: the balanced reference plan.
  await buildPlan(page, [[1, 6, 4], [5, 6, 3], [5, 7, 3], [3, 10, 8], [3, 11, 8], [3, 12, 8], [4, 9, 3], [2, 9, 4]]);
  await key(page, 'KeyS');
  await buildPlan(page, [[1, 6, 2], [1, 2, 4], [1, 8, 3], [4, 1, 4]]);
  await key(page, 'KeyE');
  await settled(page);
  const before = await st();
  expect(before.plan).toBe('B');

  await click('st-plan-a');
  const a = await st();
  expect(a.plan).toBe('A');
  expect(a.year).toBe(2050); // comparing futures jumps from 2026 to 2050
  expect(a.viewpoint).toBe(before.viewpoint); // same place
  expect(a.districtHere).toBe(true);
  expect(a.haze).toBeGreaterThan(0); // Plan A misses the environment target
  expect(a.story.join(' ')).toMatch(/newcomers found no planned home/);

  await click('st-plan-b');
  const b = await st();
  expect(b.plan).toBe('B');
  expect(b.haze).toBe(0);
  expect(b.greening).toBeGreaterThan(0);
});
