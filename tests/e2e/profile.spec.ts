import { test } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { buildPlan, open, ui } from './helpers';

test.skip(!process.env.PROFILE, 'set PROFILE=1');
test('profile first 2050 switch', async ({ page }) => {
  await open(page);
  await ui(page, 'hud-panel', 'btn-skip-tips');
  await buildPlan(page, [[1, 6, 4]]);
  await page.waitForTimeout(3000);
  const before: string[] = await page.evaluate(() => (window.__terracity as unknown as { programs(): string[] }).programs());
  const unc: string[] = await page.evaluate(() => (window.__terracity as unknown as { uncompiled(): string[] }).uncompiled());
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
  await cdp.send('Profiler.start');
  const btn = await page.evaluate(() => window.__terracity.uiToScreen('time-panel', 'year-2050'));
  await page.mouse.click(btn!.x, btn!.y);
  await page.waitForTimeout(2500);
  const { profile } = await cdp.send('Profiler.stop');
  const after: string[] = await page.evaluate(() => (window.__terracity as unknown as { programs(): string[] }).programs());
  const unc2: string[] = await page.evaluate(() => (window.__terracity as unknown as { uncompiled(): string[] }).uncompiled());
  writeFileSync('test-results/uncompiled.txt', `before switch (${unc.length}):\n${[...new Set(unc)].join('\n')}\n\ncompiled by the switch:\n${[...new Set(unc.filter((x) => !unc2.includes(x)))].join('\n')}\n`);
  writeFileSync('test-results/programs.txt', `before ${before.length}, after ${after.length}\nnew: ${after.filter((x) => !before.includes(x)).join('\n     ')}\n`);
  const self = new Map<string, number>();
  const dt = profile.timeDeltas ?? [];
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  (profile.samples ?? []).forEach((id, i) => {
    const n = byId.get(id)!;
    const f = n.callFrame;
    const k = `${f.functionName || '(anon)'} ${f.url.split('/').slice(-2).join('/')}:${f.lineNumber}`;
    self.set(k, (self.get(k) ?? 0) + (dt[i] ?? 0) / 1000);
  });
  const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25);
  writeFileSync('test-results/profile.txt', top.map(([k, v]) => `${v.toFixed(0).padStart(6)} ms  ${k}`).join('\n'));
});
