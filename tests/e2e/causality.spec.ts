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
  expect(c.card).toMatch(/^What your decision changes\|Now \(2026\)\|/); // the brief decision card, 2026 first

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

  // Two futures: the card explains the other future vs your plan; both boards are marked where they differ.
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

test('causality is year-specific and inspectable: now vs by 2050, the viewed year, and one cause at a time', async ({ page }) => {
  type S = C & { focus: number; shown: { year: number; sourceDecisionIds: string[]; affectedSpatialIds: string[]; effects: Array<{ metric: string; scope: string }> } | null };
  const s = () => page.evaluate(() => (window as unknown as { __terracity: { causality(): S } }).__terracity.causality());
  await open(page);
  await buildPlan(page, [[1, 6, 4]]); // one neighbourhood beside the town
  let c = await s();
  // 2026: housing now; the sprawl it avoids only appears under "By 2050".
  const [now, later] = c.card.split('|By 2050|');
  expect(now).toMatch(/Housed residents \+4,000/);
  expect(now).not.toMatch(/unplanned sprawl/);
  expect(later).toMatch(/Newcomers in unplanned sprawl -4,000.*Region-wide/);
  expect(c.shown!.year).toBe(2026);
  expect(c.shown!.sourceDecisionIds).toHaveLength(1);
  expect(c.shown!.affectedSpatialIds).toContain('6,4');

  // Viewing 2035 re-evaluates the same decision in 2035.
  await key(page, 'KeyW');
  await key(page, 'KeyT');
  c = await s();
  expect(c.shown!.year).toBe(2035);
  expect(c.card).toMatch(/^What your decision changed by 2035\|/);
  expect(c.shown!.effects.find((e) => e.metric === 'sprawl')!.scope).toBe('regional');

  // The causal chain: one cause at a time, rings only where that cause acts; then back to all.
  const n = c.shown!.effects.length;
  const all = c.ringsVisible;
  for (let i = 0; i < n; i++) {
    await key(page, 'KeyN');
    c = await s();
    expect(c.focus).toBe(i);
    expect(c.card).toMatch(new RegExp(`^Cause ${i + 1} of ${n} \\(2035\\)`));
    expect(c.ringsVisible).toBeLessThanOrEqual(all);
  }
  await key(page, 'KeyN');
  expect((await s()).focus).toBe(-1);
  // Changing year resets the chain to the overview of that year.
  await key(page, 'KeyN');
  await key(page, 'KeyT');
  c = await s();
  expect(c.focus).toBe(-1);
  expect(c.shown!.year).toBe(2050);
});
