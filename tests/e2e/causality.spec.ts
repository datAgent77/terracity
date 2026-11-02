import { expect, test } from '@playwright/test';
import { buildPlan, key, open } from './helpers';

type Fx = { metric: string; delta: number; rules: string[]; text: string };
type C = { on: boolean; event: { type: string; explanation: string; effects: Fx[]; entities: string[] } | null; anchors: number; ringsVisible: number; miniMarks: number; card: string };
const cz = (page: import('@playwright/test').Page) => page.evaluate(() => (window as unknown as { __terracity: { causality(): C } }).__terracity.causality());

test('causality vision: a decision is explained from the simulation, with gains and costs, on the board and between two futures', async ({ page }) => {
  await open(page);
  await buildPlan(page, [[1, 6, 4], [5, 6, 3], [1, 8, 3]]);
  // Connecting the second neighbourhood (a road) houses 4,000 more people by 2050.
  await buildPlan(page, [[5, 7, 3]]);
  let c = await cz(page);
  expect(c.event!.type).toBe('add');
  expect(c.event!.entities).toEqual(['added:road@7,3']);
  const housed = c.event!.effects.find((e) => e.metric === 'housed')!;
  expect(housed.delta).toBe(4000);
  expect(housed.rules).toEqual(['homes-connected']);
  expect(c.event!.effects.find((e) => e.metric === 'budgetLeft')!.delta).toBeLessThan(0); // the cost is shown too
  expect(c.card).toMatch(/^What your decision changed/); // the brief decision card

  // Vision on: rings on the tiles named by the simulation.
  await key(page, 'KeyW');
  c = await cz(page);
  expect(c.on).toBe(true);
  expect(c.ringsVisible).toBe(c.anchors);
  expect(c.anchors).toBeGreaterThan(0);

  // Solar on farmland: renewable share up through supply, nature down through the farmland rule.
  await buildPlan(page, [[2, 3, 5]]);
  c = await cz(page);
  const env = c.event!.effects.find((e) => e.metric === 'environment')!;
  expect(env.rules).toContain('farmland-converted');
  expect(c.event!.effects.find((e) => e.metric === 'housed')).toBeUndefined(); // never claims residents
  const cov = c.event!.effects.find((e) => e.metric === 'renewableCoverage');
  if (cov) expect(cov.text).toMatch(/renewable supply \+/);

  // Two futures: the card explains Plan B vs Plan A; both boards are marked where they differ.
  await key(page, 'KeyS');
  await buildPlan(page, [[1, 6, 2]]);
  await key(page, 'KeyV');
  await page.waitForFunction(() => { const s = (window as unknown as { __terracity: { split(): { open: boolean; t: number } } }).__terracity.split(); return s.open && s.t === 1; });
  c = await cz(page);
  expect(c.card).toMatch(/^Why the two futures differ/);
  expect(c.miniMarks).toBeGreaterThan(0);

  // Off again: nothing stays on screen.
  await key(page, 'KeyW');
  c = await cz(page);
  expect(c.ringsVisible).toBe(0);
  expect(c.miniMarks).toBe(0);
});
