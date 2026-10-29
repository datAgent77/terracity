import { expect, test, type Page } from '@playwright/test';
import { buildPlan, key, open, REFERENCE, ui } from './helpers';

type FV = {
  state: { year: number; sprawl: unknown[]; floodRisk: unknown[]; vigor: number; dryness: number; balanced: boolean; seaRise: number };
  shown: { progress: number; dryness: number; activity: number };
  sprawlVisible: number;
  wallsVisible: number;
  ringsVisible: number;
  transitionDone: boolean;
};
const fv = (page: Page) => page.evaluate(() => (window.__terracity as unknown as { futureVisuals(): FV }).futureVisuals());
const settle = async (page: Page) => {
  await expect.poll(async () => (await fv(page)).transitionDone, { timeout: 8000 }).toBe(true);
  await page.waitForTimeout(150);
};
const shot = (page: Page, name: string) =>
  process.env.VISUAL_TAG ? page.screenshot({ path: `docs/visual/${process.env.VISUAL_TAG}-${name}.png` }) : Promise.resolve();

test('under-housed plan: sprawl, drying land and sea rise grow 2026 -> 2035 -> 2050', async ({ page }) => {
  await open(page);
  await ui(page, 'hud-panel', 'btn-skip-tips');
  await buildPlan(page, [[1, 6, 4], [3, 12, 8]]);
  await settle(page);
  let v = await fv(page);
  expect(v.state.year).toBe(2026);
  expect(v.sprawlVisible).toBe(0);
  expect(v.shown.progress).toBe(0);
  await shot(page, 'tt-2026');

  // Click without the helper's frame wait, then sample until mid-transition.
  const btn = await page.evaluate(() => window.__terracity.uiToScreen('time-panel', 'year-2035'));
  await page.mouse.click(btn!.x, btn!.y);
  await expect.poll(async () => (await fv(page)).shown.progress, { timeout: 4000, intervals: [30] }).toBeGreaterThan(0);
  const mid = await fv(page);
  expect(mid.transitionDone).toBe(false);
  expect(mid.shown.progress).toBeGreaterThan(0);
  expect(mid.shown.progress).toBeLessThan(0.5);
  await shot(page, 'tt-2035-mid-transition');
  await settle(page);
  const y35 = await fv(page);
  expect(y35.sprawlVisible).toBe(y35.state.sprawl.length);
  expect(y35.sprawlVisible).toBeGreaterThan(0);
  expect(y35.shown.progress).toBe(0.5);
  await shot(page, 'tt-2035');

  await ui(page, 'time-panel', 'year-2050');
  await settle(page);
  v = await fv(page);
  expect(v.sprawlVisible).toBe(v.state.sprawl.length);
  expect(v.sprawlVisible).toBeGreaterThan(y35.sprawlVisible);
  expect(v.state.dryness).toBeGreaterThan(y35.state.dryness);
  expect(v.shown.dryness).toBeCloseTo(v.state.dryness, 5);
  expect(v.state.balanced).toBe(false);
  await shot(page, 'tt-2050-underhoused');

  await ui(page, 'time-panel', 'year-2026');
  await settle(page);
  v = await fv(page);
  expect(v.sprawlVisible).toBe(0);
  expect(v.shown.progress).toBe(0);
});

test('coastal risk and balance follow the simulation (plan A vs reference plan)', async ({ page }) => {
  await open(page);
  await ui(page, 'hud-panel', 'btn-skip-tips');
  await buildPlan(page, REFERENCE.slice(0, 9)); // plan A: coastal homes, no solar/parks
  await ui(page, 'time-panel', 'year-2050');
  await settle(page);
  let v = await fv(page);
  expect(v.state.floodRisk.length).toBeGreaterThan(0);
  expect(v.wallsVisible).toBeGreaterThan(0);
  expect(v.ringsVisible).toBe(v.state.floodRisk.length);
  expect(v.sprawlVisible).toBe(0); // fully housed
  expect(v.state.balanced).toBe(false); // renewables miss the 2050 target
  await shot(page, 'tt-2050-plan-a');

  await ui(page, 'time-panel', 'year-2026');
  await settle(page);
  v = await fv(page);
  expect(v.ringsVisible).toBe(0);
  expect(v.wallsVisible).toBe(0);
  await buildPlan(page, REFERENCE.slice(9)); // + parks + solar
  await ui(page, 'time-panel', 'year-2050');
  await settle(page);
  v = await fv(page);
  expect(v.state.balanced).toBe(true);
  expect(v.state.vigor).toBeGreaterThan(0.7);
  await shot(page, 'tt-2050-balanced');
  await key(page, 'KeyT'); // cycles back to 2026
});
