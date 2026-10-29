import { expect, test, type Page } from '@playwright/test';
import { buildPlan, key, open, REFERENCE, snap, ui } from './helpers';

type OV = { marks: Array<{ kind: string; target: string; col: number; row: number }>; visible: number; celebrating: boolean };
const ov = (page: Page) => page.evaluate(() => (window.__terracity as unknown as { outcomeVisuals(): OV }).outcomeVisuals());
const shot = (page: Page, name: string) =>
  process.env.VISUAL_TAG ? page.screenshot({ path: `docs/visual/${process.env.VISUAL_TAG}-${name}.png` }) : Promise.resolve();

test('victory: celebration and gold marks on what made it work; replay clears them', async ({ page }) => {
  await open(page);
  await ui(page, 'hud-panel', 'btn-skip-tips');
  await buildPlan(page, REFERENCE);
  await ui(page, 'actions-panel', 'btn-finish');
  const s = await snap(page);
  expect(s.result!.success).toBe(true);
  const v = await ov(page);
  expect(v.celebrating).toBe(true);
  expect(v.marks.length).toBeGreaterThan(0);
  expect(v.marks.every((m) => m.kind === 'success')).toBe(true);
  expect(v.visible).toBe(v.marks.length);
  await page.waitForTimeout(1200); // mid-celebration
  await shot(page, 'outcome-victory');
  await ui(page, 'overlay-panel', 'ov-primary'); // Play again
  const after = await ov(page);
  expect(after.visible).toBe(0);
  expect(after.marks).toEqual([]);
});

test('failure: no celebration; amber/teal marks only for the missed targets', async ({ page }) => {
  await open(page);
  await ui(page, 'hud-panel', 'btn-skip-tips');
  await buildPlan(page, REFERENCE.slice(0, 9)); // misses renewables (and environment) in 2050
  await key(page, 'KeyF');
  const s = await snap(page);
  expect(s.result!.success).toBe(false);
  const v = await ov(page);
  expect(v.celebrating).toBe(false);
  expect(v.marks.some((m) => m.kind === 'success')).toBe(false);
  expect(v.marks.some((m) => m.kind === 'opportunity' && m.target === 'renewableCoverage')).toBe(true);
  const checks = await page.evaluate(() => (window.__terracity as unknown as { result: { value: { checks: Record<string, boolean> } } }).result.value.checks);
  for (const m of v.marks) expect(checks[m.target]).toBe(false);
  await page.waitForTimeout(600);
  await shot(page, 'outcome-failure');
});
