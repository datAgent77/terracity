import { expect, type Page } from '@playwright/test';

type Sig<T> = { value: T };
export type Hook = {
  game: {
    placements: Array<{ id: string; type: string; col: number; row: number; rotation: number }>;
    metrics: Record<string, number>;
  };
  selectedId: Sig<string | null>;
  armedType: Sig<string | null>;
  statusText: Sig<string>;
  viewYear: Sig<number>;
  phase: Sig<string>;
  planA: Sig<unknown[] | null>;
  compareOpen: Sig<boolean>;
  paused: Sig<boolean>;
  timeLeft: Sig<number>;
  result: Sig<{ success: boolean; hints: string[]; timedOut: boolean; metrics2050: Record<string, number> } | null>;
  challenge: { timeLeft: number; tick(s: number): boolean };
};
declare global {
  interface Window {
    __terracity: Hook & Record<string, (...a: unknown[]) => { x: number; y: number } | null>;
  }
}

export const snap = (page: Page) =>
  page.evaluate(() => {
    const t = window.__terracity;
    return {
      plan: t.game.placements.map((p) => ({ ...p })),
      metrics: { ...t.game.metrics, servedIds: undefined },
      selected: t.selectedId.value,
      armed: t.armedType.value,
      status: t.statusText.value,
      year: t.viewYear.value,
      phase: t.phase.value,
      hasA: !!t.planA.value,
      compare: t.compareOpen.value,
      paused: t.paused.value,
      timeLeft: t.timeLeft.value,
      result: t.result.value ? { ...t.result.value } : null,
    };
  });

/** Pointer and key input is processed inside the render loop: wait for real frames. */
export const frames = (page: Page, n = 4) =>
  page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        let left = count;
        const step = () => (--left <= 0 ? resolve() : requestAnimationFrame(step));
        requestAnimationFrame(step);
      }),
    n,
  );

export async function clickAt(page: Page, fn: string, ...args: (string | number)[]) {
  const pt = await page.evaluate(([f, a]) => window.__terracity[f as string](...(a as unknown[])), [fn, args] as const);
  expect(pt, `${fn}(${args.join(',')}) on screen`).toBeTruthy();
  await page.mouse.click(pt!.x, pt!.y);
  await frames(page);
  await page.waitForTimeout(60);
}
export const tile = (page: Page, c: number, r: number) => clickAt(page, 'tileToScreen', c, r);
export const slot = (page: Page, s: number) => clickAt(page, 'slotToScreen', s);
export const ui = (page: Page, panel: string, id: string) => clickAt(page, 'uiToScreen', panel, id);
export const button = (page: Page, id: string) => ui(page, 'actions-panel', id);
export const key = async (page: Page, k: string) => {
  await page.keyboard.press(k);
  await frames(page);
};

export async function open(page: Page, { start = true } = {}) {
  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });
  await page.goto('./'); // relative: works under a sub-path such as GitHub Pages
  await page.waitForFunction(() => {
    const t = window.__terracity as unknown as Record<string, unknown> | undefined;
    return !!t && 'uiToScreen' in t && 'slotToScreen' in t && 'phase' in t;
  });
  await page.waitForTimeout(1500); // let panels lay out
  if (start) {
    await ui(page, 'overlay-panel', 'ov-primary'); // the Start button
    expect((await snap(page)).phase).toBe('building');
    await page.waitForTimeout(300);
  }
}

/** The documented reference plan that meets every 2050 target. */
export const REFERENCE: Array<[number, number, number]> = [
  [5, 6, 3], [5, 7, 3],
  [1, 6, 2], [1, 6, 4], [1, 2, 4], [1, 8, 3],
  [3, 10, 8], [3, 11, 8], [3, 12, 8],
  [4, 9, 3], [4, 1, 4], [2, 9, 4],
];
export async function buildPlan(page: Page, plan: Array<[number, number, number]>) {
  for (const [s, c, r] of plan) {
    await key(page, `Digit${s}`);
    await tile(page, c, r);
  }
  await key(page, 'Escape');
}
