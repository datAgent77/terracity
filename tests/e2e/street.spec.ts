import { expect, test } from '@playwright/test';
import { buildPlan, key, open, snap, ui } from './helpers';

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
    await ui(page, 'street-panel', id); // opens Details first, as a user would
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

test('the last child: her garden and words follow the plan; rewriting the plan changes them', async ({ page }) => {
  // Three street visits and two plans: longer than the default budget under software rendering.
  test.setTimeout(180_000);
  type C = { happy: boolean; state: string; garden: string; lines: string[] } | null;
  const child = () => page.evaluate(() => (window as unknown as { __terracity: { street(): { child: C } } }).__terracity.street().child);
  const visit2050 = async () => {
    await key(page, 'KeyT');
    await key(page, 'KeyT'); // 2026 -> 2035 -> 2050
    await key(page, 'KeyE');
    await settled(page);
    const c = await child();
    expect((await street(page)).viewpoint).toBe(2); // you arrive beside the little garden
    await key(page, 'KeyE');
    await settled(page);
    await key(page, 'KeyT'); // back to 2026 to edit
    return c;
  };
  await open(page);
  // In 2026 there is no child yet.
  await buildPlan(page, [[1, 6, 4], [5, 6, 3], [5, 7, 3], [3, 10, 8], [3, 11, 8], [3, 12, 8], [4, 9, 3], [2, 9, 4]]);
  await key(page, 'KeyE');
  await settled(page);
  expect(await child()).toBeNull();
  await key(page, 'KeyE');
  await settled(page);

  const before = await visit2050();
  expect(before!.state).toBe('parched');
  expect(before!.garden).toBe('dry');
  expect(before!.happy).toBe(false); // her face follows the outcome
  expect(before!.lines[0]).toMatch(/there used to be trees here/);

  // Rewrite: more neighbourhoods and a park.
  await buildPlan(page, [[1, 6, 2], [1, 2, 4], [1, 8, 3], [4, 1, 4]]);
  const after = await visit2050();
  expect(after!.state).toBe('thriving');
  expect(after!.garden).toBe('lush');
  expect(after!.happy).toBe(true);
  expect(after!.lines[0]).toMatch(/favorite place. Did you help make it/);

  // Same inputs, same outcome and words (which line she is saying right now
  // depends on elapsed time, so it is not compared).
  const again = await visit2050();
  const outcome = (c: C) => c && { happy: c.happy, state: c.state, garden: c.garden, lines: c.lines };
  expect(outcome(again)).toEqual(outcome(after));
});
