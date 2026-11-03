import { expect, test, type Page } from '@playwright/test';
import { button, key, open, tile, ui } from './helpers';

const sig = (page: Page, name: string) =>
  page.evaluate((n) => (window.__terracity as unknown as Record<string, { value: unknown }>)[n].value, name);

test('the first five minutes: one choice, two futures, why, Mira, the other future; then the closing card and replay', async ({ page }) => {
  test.setTimeout(240_000);
  type Street = { active: boolean; fading: boolean; plan: string; child: { dialogue: string[] } | null };
  const st = () => page.evaluate(() => (window.__terracity as unknown as { street(): Street }).street());
  const streetSettled = (active: boolean) =>
    page.waitForFunction((a) => { const s = (window.__terracity as unknown as { street(): Street }).street(); return s.active === a && !s.fading; }, active);
  const splitOpen = () => page.waitForFunction(() => { const s = (window.__terracity as unknown as { split(): { t: number; open: boolean } }).split(); return s.open && s.t === 1; });
  await open(page);
  // Beat 2: one choice, and the simulation's own feedback.
  expect(await sig(page, 'coachText')).toMatch(/^Step 1\/6: Make one choice/);
  await key(page, 'Digit1');
  await tile(page, 6, 4);
  await key(page, 'Escape');
  expect(await sig(page, 'coachText')).toMatch(/^Step 2\/6/);
  const card = await page.evaluate(() => (window.__terracity as unknown as { causality(): { card: string[] | null; event: { explanation: string } | null } }).causality());
  expect(card.event?.explanation).toMatch(/housed \+4,000/); // truthful: the ledger's numbers
  await page.screenshot({ path: 'docs/evidence/phase3-e2e-tip2-glow.png' });
  // Beat 3: the split.
  await ui(page, 'actions-panel', 'btn-split');
  await splitOpen();
  expect(await sig(page, 'coachText')).toMatch(/^Step 3\/6/);
  // Beat 4: Causality Vision.
  await ui(page, 'actions-panel', 'btn-why');
  expect(await sig(page, 'coachText')).toMatch(/^Step 4\/6/);
  // Beat 5: enter one future and meet Mira; she talks about this decision.
  await ui(page, 'actions-panel', 'btn-enter');
  await streetSettled(true);
  expect(await sig(page, 'coachText')).toMatch(/^Step 5\/6/);
  const first = await st();
  expect(first.child!.dialogue.join(' ')).toMatch(/other future/);
  await ui(page, 'street-panel', 'st-talk');
  expect(await sig(page, 'coachText')).toMatch(/^Step 5\/6/); // listening: no push to leave yet
  await ui(page, 'street-panel', 'st-talk-end');
  expect(await sig(page, 'coachText')).toMatch(/^Step 6\/6/);
  // Beat 6: the other future.
  await ui(page, 'street-panel', 'st-return');
  await streetSettled(false);
  await page.evaluate((side) => (window.__terracity as unknown as { selectFuture(s: string): void }).selectFuture(side), first.plan === 'none' ? 'A' : 'B');
  await ui(page, 'actions-panel', 'btn-enter');
  await streetSettled(true);
  expect((await st()).plan).not.toBe(first.plan);
  expect(await sig(page, 'coachText')).toBe('');
  expect(await sig(page, 'outroOpen')).toBe(true);
  // The closing card waits for the tabletop.
  await ui(page, 'street-panel', 'st-return');
  await streetSettled(false);
  const overlay = () => page.evaluate(() => (window.__terracity as unknown as { overlay(): { visible: boolean; title: string } }).overlay());
  expect(await overlay()).toEqual({ visible: true, title: "The future isn't written. It's built." });
  await page.screenshot({ path: 'docs/evidence/causality-f-outro.png' });
  // Replay: walk again on the same plan; step 1 asks for a new choice, nothing is cleared.
  const pieces = await page.evaluate(() => (window.__terracity as unknown as { placements(): unknown[] }).placements().length);
  await ui(page, 'overlay-panel', 'ov-secondary');
  expect(await sig(page, 'outroOpen')).toBe(false);
  expect(await sig(page, 'coachText')).toMatch(/^Step 1\/6/);
  expect(await page.evaluate(() => (window.__terracity as unknown as { placements(): unknown[] }).placements().length)).toBe(pieces);
  expect((await overlay()).visible).toBe(false);
});

test('beat 1: the intro card says "Every city begins with a choice."; Skip intro goes straight to planning', async ({ page }) => {
  await open(page, { start: false });
  const overlay = () => page.evaluate(() => (window.__terracity as unknown as { overlay(): { visible: boolean; title: string } }).overlay());
  expect(await overlay()).toEqual({ visible: true, title: 'Every city begins with a choice.' });
  await ui(page, 'overlay-panel', 'ov-secondary'); // Skip intro
  expect(await sig(page, 'phase')).toBe('building');
  expect(await sig(page, 'coachText')).toBe('');
  expect((await overlay()).visible).toBe(false);
});

test('tips can be skipped from the HUD chip (and turned back on with H)', async ({ page }) => {
  await open(page);
  await ui(page, 'hud-panel', 'btn-skip-tips');
  expect(await sig(page, 'coachText')).toBe('');
  expect(await sig(page, 'outroOpen')).toBe(false); // skipping is not finishing
  await key(page, 'KeyH');
  expect(await sig(page, 'coachText')).toMatch(/Step 1\/6/);
});

test('larger text enlarges the panels; sound toggles', async ({ page }) => {
  await open(page);
  const span = async () => {
    const a = await page.evaluate(() => window.__terracity.uiToScreen('actions-panel', 'btn-undo'));
    const b = await page.evaluate(() => window.__terracity.uiToScreen('actions-panel', 'btn-finish'));
    return Math.hypot(b!.x - a!.x, b!.y - a!.y);
  };
  const before = await span();
  await ui(page, 'hud-panel', 'btn-text-size');
  await page.waitForTimeout(500);
  expect(await sig(page, 'largeText')).toBe(true);
  expect(await span()).toBeGreaterThan(before * 1.15);
  await page.screenshot({ path: 'docs/evidence/phase3-e2e-large-text.png' });
  await key(page, 'KeyL');
  expect(await sig(page, 'largeText')).toBe(false);

  // Sound cycles high -> low -> off -> high (chip or M).
  expect(await sig(page, 'soundOn')).toBe(true);
  await ui(page, 'hud-panel', 'btn-sound');
  expect(await sig(page, 'soundOn')).toBe(true); // low
  await ui(page, 'hud-panel', 'btn-sound');
  expect(await sig(page, 'soundOn')).toBe(false); // off
  await key(page, 'KeyM');
  expect(await sig(page, 'soundOn')).toBe(true); // high
});

test('blocked tiles show an X, not only red', async ({ page }) => {
  await open(page);
  await ui(page, 'hud-panel', 'btn-skip-tips');
  await key(page, 'Digit1');
  const sea = await page.evaluate(() => window.__terracity.tileToScreen(3, 1));
  await page.mouse.move(sea!.x, sea!.y);
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'docs/evidence/phase3-e2e-blocked-x.png', clip: { x: sea!.x - 120, y: sea!.y - 80, width: 240, height: 160 } });
  const plain = await page.evaluate(() => window.__terracity.tileToScreen(9, 3));
  await page.mouse.move(plain!.x, plain!.y);
  await button(page, 'btn-undo'); // harmless click to leave the board
});
