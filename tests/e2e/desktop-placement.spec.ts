import { expect, test, type Page } from '@playwright/test';

type Hook = {
  game: { get(id: string): { col: number; row: number } | undefined };
  selectedId: { value: string | null };
  statusText: { value: string };
  tileToScreen(col: number, row: number): { x: number; y: number };
};

const state = (page: Page) =>
  page.evaluate(() => {
    const t = (window as unknown as { __terracity: Hook }).__terracity;
    const p = t.game.get('residential-1')!;
    return { col: p.col, row: p.row, selected: t.selectedId.value, status: t.statusText.value };
  });

async function clickTile(page: Page, col: number, row: number) {
  const pt = await page.evaluate(
    ([c, r]) => (window as unknown as { __terracity: Hook }).__terracity.tileToScreen(c, r),
    [col, row] as const,
  );
  await page.mouse.click(pt.x, pt.y);
  await page.waitForTimeout(150);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => 'tileToScreen' in ((window as any).__terracity ?? {}));
  await page.waitForTimeout(1000); // let the first frames render
});

test('initial state: homes on plain tile (11,3)', async ({ page }) => {
  expect(await state(page)).toMatchObject({ col: 11, row: 3, selected: null });
  await page.screenshot({ path: 'docs/evidence/phase0-e2e-initial.png' });
});

test('mouse: click homes tile to select, click another tile to move', async ({ page }) => {
  await clickTile(page, 11, 3);
  expect((await state(page)).selected).toBe('residential-1');
  await clickTile(page, 6, 7); // farmland
  const s = await state(page);
  expect(s).toMatchObject({ col: 6, row: 7, selected: null });
  expect(s.status).toMatch(/farmland/i);
  await page.screenshot({ path: 'docs/evidence/phase0-e2e-mouse-moved.png' });
});

test('mouse: tapping water is rejected and homes stay put', async ({ page }) => {
  await clickTile(page, 11, 3);
  await clickTile(page, 3, 1); // sea
  const s = await state(page);
  expect(s).toMatchObject({ col: 11, row: 3 });
  expect(s.status).toMatch(/water/i);
});

test('keyboard: arrows move the selected homes, blocked moves are rejected', async ({ page }) => {
  await clickTile(page, 11, 3);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(100);
  expect(await state(page)).toMatchObject({ col: 11, row: 4 });
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowUp'); // (11,2) is beach -> rejected
  await page.waitForTimeout(100);
  const s = await state(page);
  expect(s).toMatchObject({ col: 11, row: 3 });
  expect(s.status).toMatch(/beach|setback/i);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(100);
  expect((await state(page)).selected).toBeNull();
});
