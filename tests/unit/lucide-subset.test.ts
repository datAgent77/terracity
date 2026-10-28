import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Guards the production icon subset: every icon tag used in public/ui/*.uikitml
// must be re-exported by src/ui/lucide-subset.ts, or it would vanish in builds.
describe('lucide icon subset', () => {
  it('covers every icon used by the UIKitML panels', () => {
    const subset = readFileSync('src/ui/lucide-subset.ts', 'utf8');
    const exported = new Set([...subset.matchAll(/dist\/(\w+)\.js/g)].map((m) => m[1]));
    const lucide = new Set(
      readdirSync('node_modules/@pmndrs/uikit-lucide/dist')
        .filter((f) => f.endsWith('.js') && f !== 'index.js')
        .map((f) => f.replace(/\.js$/, '')),
    );
    const used = new Set<string>();
    for (const f of readdirSync('public/ui').filter((f) => f.endsWith('.uikitml'))) {
      for (const m of readFileSync(`public/ui/${f}`, 'utf8').matchAll(/<([A-Z]\w*)/g)) {
        if (lucide.has(m[1])) used.add(m[1]);
      }
    }
    expect(used.size).toBeGreaterThan(10);
    for (const icon of used) expect(exported, `missing icon ${icon}`).toContain(icon);
  });
});
