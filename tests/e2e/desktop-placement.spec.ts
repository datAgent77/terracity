import { expect, test } from '@playwright/test';
import { button, key, open, slot, snap, tile } from './helpers';

test.beforeEach(async ({ page }) => {
  await open(page);
});

test('baseline: empty plan with starting metrics', async ({ page }) => {
  const s = await snap(page);
  expect(s.plan).toEqual([]);
  expect(s.metrics).toMatchObject({ population: 12000, environment: 72, budgetLeft: 130, renewableCoverage: 17 });
});

test('mouse: tap tray slot then tile builds homes next to the town', async ({ page }) => {
  await slot(page, 1);
  expect((await snap(page)).armed).toBe('residential');
  await tile(page, 6, 4);
  const s = await snap(page);
  expect(s.plan).toHaveLength(1);
  expect(s.plan[0]).toMatchObject({ type: 'residential', col: 6, row: 4 });
  expect(s.metrics).toMatchObject({ population: 16000, budgetLeft: 118 });
  expect(s.status).toMatch(/Homes built on plain.*\+4,000 residents/);
});

test('roads connect isolated homes; bridge crosses the river', async ({ page }) => {
  await key(page, 'Digit1');
  await tile(page, 9, 3);
  expect((await snap(page)).metrics.unservedHomes).toBe(1);
  await key(page, 'Digit5');
  for (const [c, r] of [[6, 3], [7, 3], [8, 3]]) await tile(page, c, r);
  const s = await snap(page);
  expect(s.metrics.unservedHomes).toBe(0);
  expect(s.metrics.population).toBe(16000);
  expect(s.metrics.budgetLeft).toBe(130 - 12 - 2 - 8 - 2);
  await key(page, 'Escape');
});

test('blocked placements are rejected without cost', async ({ page }) => {
  await key(page, 'Digit2');
  await tile(page, 3, 1); // sea
  let s = await snap(page);
  expect(s.plan).toHaveLength(0);
  expect(s.status).toMatch(/water/i);
  await tile(page, 12, 8); // hill elevation 2: too steep for solar
  s = await snap(page);
  expect(s.plan).toHaveLength(0);
  expect(s.status).toMatch(/steep/i);
  expect(s.metrics.budgetLeft).toBe(130);
});

test('renewables raise coverage; wind ridge bonus', async ({ page }) => {
  await key(page, 'Digit3');
  await tile(page, 12, 8); // ridge
  const s = await snap(page);
  expect(s.plan[0]).toMatchObject({ type: 'wind' });
  expect(s.metrics.renewableCoverage).toBe(Math.round((9 / 12) * 100));
});

test('select, rotate, move and remove with keyboard', async ({ page }) => {
  await key(page, 'Digit4');
  await tile(page, 9, 3);
  await key(page, 'Escape');
  await tile(page, 9, 3); // select
  expect((await snap(page)).selected).toBe('park-1');
  await key(page, 'KeyR');
  expect((await snap(page)).plan[0].rotation).toBe(1);
  await key(page, 'ArrowRight');
  expect((await snap(page)).plan[0]).toMatchObject({ col: 10, row: 3 });
  await key(page, 'Delete');
  expect((await snap(page)).plan).toHaveLength(0);
});

test('undo / redo via keyboard and via the action pad buttons', async ({ page }) => {
  await key(page, 'Digit1');
  await tile(page, 6, 4);
  await key(page, 'Digit2');
  await tile(page, 8, 3);
  await key(page, 'Escape');
  const full = await snap(page);
  expect(full.plan).toHaveLength(2);

  await key(page, 'KeyZ');
  expect((await snap(page)).plan).toHaveLength(1);
  await button(page, 'btn-undo');
  const empty = await snap(page);
  expect(empty.plan).toHaveLength(0);
  expect(empty.metrics.budgetLeft).toBe(130);

  await button(page, 'btn-redo');
  await key(page, 'KeyY');
  const again = await snap(page);
  expect(again.plan).toEqual(full.plan);
  expect(again.metrics).toEqual(full.metrics);

  await button(page, 'btn-restart');
  expect((await snap(page)).plan).toHaveLength(0);
});
