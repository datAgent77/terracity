import { expect, test } from '@playwright/test';
import { buildPlan, key, open, snap } from './helpers';

type Split = { open: boolean; t: number; boardVisible: boolean | null; selected: 'A' | 'B' | null; built: string; comparison: string };
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
  // One compact comparison between the futures, from the simulation (A | B per row).
  await page.waitForFunction(() => (window as unknown as { __terracity: { split(): Split } }).__terracity.split().comparison !== '');
  expect((await split(page)).comparison).toMatch(/^2050\|Housed:[\d,]+\/[\d,]+:(A|B|tie)\|Nature/);

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
  // Merging is explained: it closes the comparison, it never combines plans.
  expect(String((await snap(page)).statusText ?? (await page.evaluate(() => (window as unknown as { __terracity: { statusText: { value: string } } }).__terracity.statusText.value)))).toMatch(/only a comparison/);

  // With a saved plan: your plan on the left (A), the saved plan on the right (B).
  await key(page, 'KeyS');
  await buildPlan(page, [[1, 8, 3]]);
  await key(page, 'KeyV');
  await settled(page);
  expect((await split(page)).built).toMatch(/\|Your plan:.+\|Saved plan:.+/);
  await key(page, 'KeyV');
  await settled(page);
  expect(await page.evaluate(() => (window as unknown as { __terracity: { statusText: { value: string } } }).__terracity.statusText.value)).toMatch(/never combined/);
});

test('become small: enter each future at the same place, return to the futures, merge; plan unchanged', async ({ page }) => {
  type St = { active: boolean; plan: string; districtHere: boolean; story: string[]; fading: boolean };
  const T = () => page.evaluate(() => (window as unknown as { __terracity: { street(): St } }).__terracity.street());
  const streetSettled = () => page.waitForFunction(() => !(window as unknown as { __terracity: { street(): St } }).__terracity.street().fading);
  const click = async (panel: string, id: string) => {
    const p = await page.evaluate(([a, b]) => (window as unknown as { __terracity: { uiToScreen(a: string, b: string): { x: number; y: number } } }).__terracity.uiToScreen(a, b), [panel, id]);
    await page.mouse.click(p.x, p.y);
  };
  await open(page);
  await buildPlan(page, [[1, 6, 4], [5, 6, 3], [3, 12, 8]]);
  const plan = () => page.evaluate(() => JSON.stringify((window as unknown as { __terracity: { game: { placements: unknown } } }).__terracity.game.placements));
  const before = await plan();
  await key(page, 'KeyV');
  await settled(page);

  // Future A (your plan): your neighbourhood.
  await click('actions-panel', 'btn-enter');
  await streetSettled();
  let s = await T();
  expect(s.active).toBe(true);
  expect(s.plan).toBe('B'); // the current map
  expect(s.districtHere).toBe(true);
  await click('street-panel', 'st-return');
  await streetSettled();
  await settled(page);
  expect((await T()).active).toBe(false);
  expect((await split(page)).open).toBe(true); // back at the two futures

  // Future B (nobody plans): the same place, no neighbourhood.
  await page.evaluate(() => (window as unknown as { __terracity: { selectFuture(s: string): void } }).__terracity.selectFuture('B'));
  await key(page, 'KeyE');
  await streetSettled();
  s = await T();
  expect(s.plan).toBe('none');
  expect(s.districtHere).toBe(false);
  expect(s.story[0]).toBe('No neighbourhood was planned here.');
  await key(page, 'KeyE');
  await streetSettled();
  await key(page, 'KeyV');
  await settled(page);
  expect((await split(page)).boardVisible).toBe(true);
  expect(await plan()).toBe(before);
});

test('save / reload: Plan A and the current map survive a reload; the two futures are unchanged', async ({ page }) => {
  type W = { __terracity: { game: { placements: Array<{ id: string }> }; split(): { built: string; open: boolean; t: number } } };
  await open(page);
  await buildPlan(page, [[1, 6, 4], [5, 6, 3]]);
  await key(page, 'KeyS'); // Plan A
  await buildPlan(page, [[1, 8, 3], [3, 12, 8]]);
  await key(page, 'KeyV');
  await settled(page);
  const before = (await split(page)).built;
  const plan = await page.evaluate(() => JSON.stringify((window as unknown as W).__terracity.game.placements));
  await key(page, 'KeyV');
  await settled(page);

  await page.reload();
  await page.waitForFunction(() => (window as unknown as { __terracity?: { split?: unknown } }).__terracity?.split);
  await page.waitForTimeout(1500);
  await key(page, 'Enter'); // start: the saved map comes back
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => JSON.stringify((window as unknown as W).__terracity.game.placements))).toBe(plan);
  await key(page, 'KeyV');
  await settled(page);
  expect((await split(page)).built).toBe(before); // same Plan A, same Plan B, same futures
});

test('reality seam: both futures aligned on the table, a movable boundary (mouse, keys), what differs under it; plan unchanged', async ({ page }) => {
  test.setTimeout(150_000);
  type Sp = { open: boolean; t: number; seam: number | null; seamVisible: boolean; seamReport: string; boardVisible: boolean };
  const sp = () => page.evaluate(() => (window as unknown as { __terracity: { split(): Sp } }).__terracity.split());
  await open(page);
  await buildPlan(page, [[5, 6, 3], [1, 6, 4], [1, 6, 2]]);
  const before = await page.evaluate(() => JSON.stringify((window as unknown as { __terracity: { placements(): unknown } }).__terracity.placements()));
  // From the tabletop, the seam opens the futures and lays them on the table.
  await key(page, 'KeyG');
  await page.waitForFunction(() => (window as unknown as { __terracity: { split(): Sp } }).__terracity.split().seamVisible);
  let s = await sp();
  expect(s).toMatchObject({ open: true, t: 0, seam: 0.5, boardVisible: false });
  expect(await page.evaluate(() => (window as unknown as { __terracity: { viewYear: { value: number } } }).__terracity.viewYear.value)).toBe(2050);

  // Mouse: drag it west.
  const at = (u: number) => page.evaluate((v) => (window as unknown as { __terracity: { seamToScreen(u: number): { x: number; y: number } } }).__terracity.seamToScreen(v), u);
  const a = await at(0.5);
  const b = await at(0.25);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let k = 1; k <= 5; k++) await page.mouse.move(a.x + ((b.x - a.x) * k) / 5, a.y + ((b.y - a.y) * k) / 5);
  await page.mouse.up();
  s = await sp();
  expect(s.seam!).toBeGreaterThan(0.2);
  expect(s.seam!).toBeLessThan(0.3);

  // Keys: onto column 6, where your neighbourhoods stand.
  while (Math.floor((await sp()).seam! * 14) < 6) await key(page, 'ArrowRight');
  s = await sp();
  expect(Math.floor(s.seam! * 14)).toBe(6);
  expect(s.seamReport).toMatch(/^A Your plan: .*homes.*\|B If nobody plans: /);

  // Side by side again, then merge: the plan never changed.
  await key(page, 'KeyG');
  await page.waitForFunction(() => (window as unknown as { __terracity: { split(): Sp } }).__terracity.split().t === 1);
  expect((await sp()).seam).toBeNull();
  await key(page, 'KeyV');
  await page.waitForFunction(() => { const x = (window as unknown as { __terracity: { split(): Sp } }).__terracity.split(); return !x.open && x.t === 0; });
  expect((await sp()).boardVisible).toBe(true);
  expect(await page.evaluate(() => JSON.stringify((window as unknown as { __terracity: { placements(): unknown } }).__terracity.placements()))).toBe(before);
});
