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

test('Mira 2.0: a user-paced conversation grounded in the simulation; the same place differs between futures', async ({ page }) => {
  test.setTimeout(180_000);
  type C = { talking: boolean; index: number; dialogue: string[]; groundY: number } | null;
  type P = { kind: string; title: string; lines: string[]; open: boolean };
  type S3 = Street & { plan: 'A' | 'B' | 'none'; child: C; poi: P[] };
  const st = () => page.evaluate(() => (window as unknown as { __terracity: { street(): S3 } }).__terracity.street());
  await open(page);
  // Your plan (balanced) vs nobody planning; enter Future A in 2050.
  await buildPlan(page, [[5, 6, 3], [5, 7, 3], [1, 6, 2], [1, 6, 4], [1, 2, 4], [1, 8, 3], [3, 10, 8], [3, 11, 8], [3, 12, 8], [4, 9, 3], [4, 1, 4], [2, 9, 4]]);
  await key(page, 'KeyV');
  await page.waitForFunction(() => { const s = (window as unknown as { __terracity: { split(): { open: boolean; t: number } } }).__terracity.split(); return s.open && s.t === 1; });
  await page.evaluate(() => (window as unknown as { __terracity: { selectFuture(f: string): void } }).__terracity.selectFuture('A'));
  await ui(page, 'actions-panel', 'btn-enter');
  await settled(page);

  const a = await st();
  expect(a.plan).toBe('B'); // the current plan (no Plan A saved)
  const lines = a.child!.dialogue;
  expect(a.child!.talking).toBe(false); // she invites; the user starts
  expect(lines.length).toBeGreaterThanOrEqual(3);
  expect(new Set(lines).size).toBe(lines.length);
  expect(lines[0]).toBe("Hi, I'm Mira. I live on this street.");
  expect(lines.join(' ')).toMatch(/In the other future this street was never built/);
  expect(lines.at(-1)).toBe('Will you look at the other future too?');

  // Points of interest near her come from this plan only (no sprawl in yours).
  expect(a.poi.length).toBeGreaterThan(0);
  expect(a.poi.map((q) => q.kind)).not.toContain('sprawl');
  const toggle = (i: number) => page.evaluate((k) => (window as unknown as { __terracity: { poi(i: number): void } }).__terracity.poi(k), i);
  await toggle(0);
  expect((await st()).poi.map((q) => q.open)[0]).toBe(true);
  await toggle(0);
  expect((await st()).poi.every((q) => !q.open)).toBe(true);

  // Talk -> next -> back -> end, at the user's pace.
  await ui(page, 'street-panel', 'st-talk');
  expect((await st()).child).toMatchObject({ talking: true, index: 0 });
  await ui(page, 'street-panel', 'st-talk');
  expect((await st()).child!.index).toBe(1);
  await ui(page, 'street-panel', 'st-talk-back');
  expect((await st()).child!.index).toBe(0);
  await ui(page, 'street-panel', 'st-talk-end');
  expect((await st()).child!.talking).toBe(false);

  // The same place in the future where nobody planned: different, still true, words.
  await ui(page, 'street-panel', 'st-return');
  await settled(page);
  await page.evaluate(() => (window as unknown as { __terracity: { selectFuture(f: string): void } }).__terracity.selectFuture('B'));
  await ui(page, 'actions-panel', 'btn-enter');
  await settled(page);
  const b = await st();
  expect(b.plan).toBe('none');
  expect(b.viewpoint).toBe(a.viewpoint);
  expect(b.child!.dialogue[0]).toBe("Hi, I'm Mira.");
  expect(b.child!.dialogue.join(' ')).toMatch(/In the other future there is a planned street here/);
  expect(b.child!.dialogue).not.toEqual(lines);
  expect(b.child!.groundY).toBeGreaterThan(0.5); // she stands on the sprawl slab, not inside it
  expect(b.poi.map((q) => q.kind)).toEqual(['sprawl']);
  expect(b.poi[0].lines.join(' ')).toMatch(/newcomers without a planned home/);
});
