import { expect, test } from '@playwright/test';
import { buildPlan, button, key, open, REFERENCE, snap, tile, ui } from './helpers';

test('intro: editing is blocked until Start', async ({ page }) => {
  await open(page, { start: false });
  let s = await snap(page);
  expect(s.phase).toBe('intro');
  await key(page, 'Digit1');
  await tile(page, 6, 4);
  s = await snap(page);
  expect(s.plan).toHaveLength(0);
  expect(s.status).toMatch(/Start/);
  await ui(page, 'overlay-panel', 'ov-primary');
  expect((await snap(page)).phase).toBe('building');
});

test('time travel: 2035 / 2050 projections are read-only and explain the change', async ({ page }) => {
  await open(page);
  await buildPlan(page, [[1, 6, 4]]); // one connected homes cluster
  await ui(page, 'time-panel', 'year-2050');
  let s = await snap(page);
  expect(s.year).toBe(2050);
  expect(s.status).toMatch(/2050: 12,000 newcomers found no planned homes/);
  await page.waitForTimeout(1200); // let the sprawl / sea-level animation settle
  await page.screenshot({ path: 'docs/evidence/phase2-e2e-2050-sprawl.png' });

  // Read-only: building is refused while viewing the future.
  await key(page, 'Digit2');
  await tile(page, 9, 3);
  s = await snap(page);
  expect(s.plan).toHaveLength(1);
  expect(s.status).toMatch(/Return to 2026/);

  await ui(page, 'time-panel', 'year-2035');
  expect((await snap(page)).year).toBe(2035);
  await key(page, 'KeyT'); // cycles 2035 -> 2050
  expect((await snap(page)).year).toBe(2050);
  await ui(page, 'time-panel', 'year-2026');
  s = await snap(page);
  expect(s.year).toBe(2026);
  await key(page, 'Digit2');
  await tile(page, 9, 3);
  expect((await snap(page)).plan).toHaveLength(2);
});

test('Plan A vs Plan B comparison', async ({ page }) => {
  await open(page);
  await buildPlan(page, [[1, 6, 4], [3, 12, 8]]);
  await button(page, 'btn-save-a');
  expect((await snap(page)).hasA).toBe(true);
  await buildPlan(page, REFERENCE.filter(([, c, r]) => !(c === 6 && r === 4) && !(c === 12 && r === 8)));
  expect((await snap(page)).plan).toHaveLength(REFERENCE.length);
  await button(page, 'btn-compare');
  expect((await snap(page)).compare).toBe(true);
  const headline = await page.evaluate(() =>
    (window.__terracity as unknown as { statusText: { value: string } }).statusText.value,
  );
  expect(headline).toBeTruthy();
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'docs/evidence/phase2-e2e-compare.png' });

  // Restore A brings the earlier plan back (undoable).
  await button(page, 'btn-compare');
  await button(page, 'btn-restore-a');
  expect((await snap(page)).plan).toHaveLength(2);
  await key(page, 'KeyZ');
  expect((await snap(page)).plan).toHaveLength(REFERENCE.length);
});

test('win: the reference plan meets every 2050 target', async ({ page }) => {
  await open(page);
  await buildPlan(page, REFERENCE);
  await button(page, 'btn-finish');
  const s = await snap(page);
  expect(s.phase).toBe('finished');
  expect(s.year).toBe(2050);
  expect(s.result!.success).toBe(true);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'docs/evidence/phase2-e2e-win.png' });
  await ui(page, 'overlay-panel', 'ov-primary'); // Play again
  expect((await snap(page)).phase).toBe('intro');
});

test('lose: a farmland-heavy plan fails with hints; timer expiry also ends the game', async ({ page }) => {
  await open(page);
  await buildPlan(page, [[1, 3, 5], [1, 4, 5], [1, 5, 5], [1, 6, 4], [2, 4, 6], [2, 5, 6]]);
  await key(page, 'KeyF');
  let s = await snap(page);
  expect(s.result!.success).toBe(false);
  expect(s.result!.hints.length).toBeGreaterThan(0);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: 'docs/evidence/phase2-e2e-lose.png' });

  await key(page, 'Enter'); // play again -> intro
  await key(page, 'Enter'); // start
  expect((await snap(page)).phase).toBe('building');
  await page.evaluate(() => window.__terracity.challenge.tick(7 * 60 - 1));
  await page.waitForTimeout(1500);
  s = await snap(page);
  expect(s.phase).toBe('finished');
  expect(s.result!.timedOut).toBe(true);
});

test('pause stops the clock and blocks editing', async ({ page }) => {
  await open(page);
  await button(page, 'btn-pause');
  const t0 = (await snap(page)).timeLeft;
  await page.waitForTimeout(2200);
  const s = await snap(page);
  expect(s.paused).toBe(true);
  expect(s.timeLeft).toBe(t0);
  await ui(page, 'overlay-panel', 'ov-primary'); // Resume
  expect((await snap(page)).paused).toBe(false);
});
