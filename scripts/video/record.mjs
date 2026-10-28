/**
 * Records the silent gameplay video from the REAL app running in Meta's IWER
 * emulator (dev server, Meta Quest 3 profile). Hands are driven through
 * window.IWER_DEVICE with smooth in-page tweens; captions are DOM overlays.
 * Output: video/raw/*.webm + video/raw/manifest.json (segment marks in ms).
 *
 *   npm run dev            # in another terminal
 *   node scripts/video/record.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';

const OUT = 'video/raw';
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  deviceScaleFactor: 1,
  ignoreHTTPSErrors: true,
  recordVideo: { dir: OUT, size: { width: 1280, height: 720 } },
});
const t0 = Date.now();
const marks = [];
const mark = (name, extra = {}) => {
  marks.push({ name, ms: Date.now() - t0, ...extra });
  console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${name}`);
};
const page = await context.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.addInitScript(() => {
  try { localStorage.clear(); } catch {}
});
await page.goto('https://localhost:8081/');
await page.waitForFunction(() => window.__terracity?.uiToScreen && window.IWER_DEVICE);
await page.waitForTimeout(2500);

// ---------------------------------------------------------------- in-page rig
await page.evaluate(() => {
  const dev = window.IWER_DEVICE;
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
  const slerp = (a, b, t) => {
    let [ax, ay, az, aw] = a; let [bx, by, bz, bw] = b;
    let cos = ax * bx + ay * by + az * bz + aw * bw;
    if (cos < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; cos = -cos; }
    if (cos > 0.9995) {
      const r = [lerp(ax, bx, t), lerp(ay, by, t), lerp(az, bz, t), lerp(aw, bw, t)];
      const n = Math.hypot(...r); return r.map((v) => v / n);
    }
    const th = Math.acos(cos), s = Math.sin(th);
    const wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
    return [ax * wa + bx * wb, ay * wa + by * wb, az * wa + bz * wb, aw * wa + bw * wb];
  };
  // Quaternion whose -Z axis points from `from` to `to` (world up +Y).
  const lookQuat = (from, to) => {
    let zx = from[0] - to[0], zy = from[1] - to[1], zz = from[2] - to[2];
    const zl = Math.hypot(zx, zy, zz); zx /= zl; zy /= zl; zz /= zl;
    let xx = 1 * zz - 0 * zy, xy = 0 * zx - 0 * zz, xz = 0 * zy - 1 * zx; // up × z
    const xl = Math.hypot(xx, xy, xz) || 1; xx /= xl; xy /= xl; xz /= xl;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    const m00 = xx, m01 = yx, m02 = zx, m10 = xy, m11 = yy, m12 = zy, m20 = xz, m21 = yz, m22 = zz;
    const tr = m00 + m11 + m22; let x, y, z, w;
    if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); w = 0.25 / s; x = (m21 - m12) * s; y = (m02 - m20) * s; z = (m10 - m01) * s; }
    else if (m00 > m11 && m00 > m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); w = (m21 - m12) / s; x = 0.25 * s; y = (m01 + m10) / s; z = (m02 + m20) / s; }
    else if (m11 > m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); w = (m02 - m20) / s; x = (m01 + m10) / s; y = 0.25 * s; z = (m12 + m21) / s; }
    else { const s = 2 * Math.sqrt(1 + m22 - m00 - m11); w = (m10 - m01) / s; x = (m02 + m20) / s; y = (m12 + m21) / s; z = 0.25 * s; }
    return [x, y, z, w];
  };
  const target = (name) => (name === 'head' ? dev : dev.hands[name]);
  const rig = {
    lookQuat,
    pose(name, pos, quat) {
      const t = target(name);
      t.position.set(...pos);
      if (quat) t.quaternion.set(...quat);
    },
    move(name, pos, quat, ms) {
      const t = target(name);
      const p0 = [t.position.x, t.position.y, t.position.z];
      const q0 = [t.quaternion.x, t.quaternion.y, t.quaternion.z, t.quaternion.w];
      const start = performance.now();
      return new Promise((res) => {
        const step = () => {
          const k = Math.min(1, (performance.now() - start) / ms), e = ease(k);
          t.position.set(lerp(p0[0], pos[0], e), lerp(p0[1], pos[1], e), lerp(p0[2], pos[2], e));
          if (quat) t.quaternion.set(...slerp(q0, quat, e));
          k < 1 ? requestAnimationFrame(step) : res();
        };
        step();
      });
    },
    pinch(name, v) { dev.hands[name].updatePinchValue(v); },
    caption(text, sub = '') {
      let el = document.getElementById('__cap');
      if (!el) {
        el = document.createElement('div'); el.id = '__cap';
        el.style.cssText = 'position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:2147483647;pointer-events:none;' +
          'background:rgba(16,40,46,.82);color:#fff;font:600 22px/1.3 system-ui,sans-serif;padding:12px 22px;border-radius:14px;' +
          'max-width:980px;text-align:center;transition:opacity .35s;box-shadow:0 6px 24px rgba(0,0,0,.25)';
        document.body.appendChild(el);
      }
      el.innerHTML = text ? `${text}${sub ? `<div style="font:500 16px system-ui;opacity:.85;margin-top:4px">${sub}</div>` : ''}` : '';
      el.style.opacity = text ? '1' : '0';
    },
    badge(text) {
      let el = document.getElementById('__badge');
      if (!el) {
        el = document.createElement('div'); el.id = '__badge';
        el.style.cssText = 'position:fixed;right:16px;top:14px;z-index:2147483647;pointer-events:none;background:rgba(255,255,255,.88);' +
          'color:#1d3f46;font:600 13px system-ui;padding:6px 12px;border-radius:999px;border:1px solid #c7d6da';
        document.body.appendChild(el);
      }
      el.textContent = text;
      el.style.display = text ? 'block' : 'none';
    },
  };
  window.__rig = rig;
});

const rig = (fn, ...args) => page.evaluate(([f, a]) => window.__rig[f](...a), [fn, args]);
// Device control goes through IWER's own remote-control API (the same methods
// the IWSDK CLI uses), so selects and grabs follow the emulator's real paths.
const remote = (method, params) =>
  page.evaluate(([m, p]) => window.IWER_DEVICE.remote.dispatch(m, p), [method, params]);
const v3 = ([x, y, z]) => ({ x, y, z });
const q4 = ([x, y, z, w]) => ({ x, y, z, w });
const wait = (ms) => page.waitForTimeout(ms);
const caption = (t, s = '') => rig('caption', t, s);
const EYE = [0, 1.2, 0.08];
const tile = (c, r, y = 0.83) => [(c - 6.5) * 0.06, y, -0.5 + (r - 4.5) * 0.06];
// The emulated hand's pinch point sits ~3 cm left of and ahead of the wrist pose,
// so aim the wrist that much right/back of the token centre.
const slot = (s) => [(s - 3) * 0.085 + 0.03, 0.81, -0.14 + 0.025];
const REST = [0.2, 0.86, -0.2];
const UP = [0, 0, 0, 1];
const move = async (pos, quat, ms) => {
  await remote('animate_to', { device: 'hand-right', position: v3(pos), ...(quat ? { orientation: q4(quat) } : {}), duration: ms / 1000 });
  await wait(ms + 60);
};
const pinch = (v) => remote('set_select_value', { device: 'hand-right', value: v });

const SLOT_TYPES = { 1: 'residential', 2: 'solar', 3: 'wind', 4: 'park', 5: 'road' };
const NOUNS = { 1: 'homes', 2: 'solar farm', 3: 'wind turbine', 4: 'park', 5: 'road' };
const planIds = () => page.evaluate(() => window.__terracity.game.placements.map((p) => `${p.id}@${p.col},${p.row}`));

/** Real hand placement; verified against the plan, with one honest retry. */
async function grabAndPlace(slotIdx, col, row, opts = {}) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const before = new Set(await planIds());
    await handPlace(slotIdx, col, row, opts);
    const added = (await planIds()).filter((x) => !before.has(x) && x.startsWith(SLOT_TYPES[slotIdx]));
    const status = await page.evaluate(() => window.__terracity.statusText.value);
    console.log(`  place ${SLOT_TYPES[slotIdx]} aim (${col},${row}) attempt ${attempt}: ${added[0] ?? 'MISSING'} | ${status}`);
    if (added.length) return added[0];
  }
  throw new Error(`placement failed near (${col},${row})`);
}

async function handPlace(slotIdx, col, row, { twist = false, fast = 1 } = {}) {
  const f = (ms) => Math.round(ms / fast);
  await move(slot(slotIdx), UP, f(700));
  await wait(f(150));
  await pinch(1);
  await wait(f(250));
  const carrying = await page.evaluate(() => window.__terracity.heldType());
  if (carrying !== SLOT_TYPES[slotIdx]) {
    console.log(`  holding ${carrying ?? 'nothing'} instead of ${SLOT_TYPES[slotIdx]}; letting go`);
    await pinch(0);
    await move(REST, UP, f(400));
    return;
  }
  const mid = tile(col, row, 0.97);
  const twistQ = twist ? [0, 0.7071, 0, 0.7071] : UP;
  await move([(slot(slotIdx)[0] + mid[0]) / 2, 0.97, (slot(slotIdx)[2] + mid[2]) / 2], twistQ, f(600));
  const aim = tile(col, row);
  await move(aim, twistQ, f(650));
  // Like a player watching the green highlight: centre the piece on the target
  // tile (release shifts the hand pose slightly, so aim for the middle).
  for (let i = 0; i < 4; i++) {
    await wait(f(150));
    const h = await page.evaluate(() => window.__terracity.heldOffset());
    if (!h) break;
    const ex = (col - h.col) * 0.06 - h.dx;
    const ez = (row - h.row) * 0.06 - h.dz;
    if (Math.hypot(ex, ez) < 0.01) break;
    aim[0] += ex;
    aim[2] += ez;
    await move(aim, twistQ, f(300));
  }
  await wait(f(200));
  await pinch(0);
  await wait(f(300));
  await move(REST, UP, f(500));
}

/** Point-and-pinch at a UI element; `done` checks the app state and allows one retry. */
async function rayTap(panel, id, holdMs = 900, done = null) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const p = await page.evaluate(([pn, e]) => window.__terracity.uiWorldPosition(pn, e), [panel, id]);
    // Arm's length: ~55% of the way from the button toward the eyes (closer than
    // ~25 cm IWSDK switches to the fingertip poke pointer).
    const origin = p.map((v, i) => v + (EYE[i] - v) * 0.55);
    await move(origin, null, 650);
    await remote('look_at', { device: 'hand-right', target: v3(p) });
    await wait(holdMs);
    await remote('select', { device: 'hand-right', duration: 0.2 });
    await wait(700);
    if (!done || (await done())) return;
    console.log(`  tap ${id} did not register (attempt ${attempt}); retrying`);
    holdMs = 400;
  }
  throw new Error(`tap failed: ${id}`);
}
const is = (name, value) => async () => (await page.evaluate((n) => window.__terracity[n].value, name)) === value;

const sig = (name) => page.evaluate((n) => window.__terracity[n].value, name);

// ---------------------------------------------------------------- enter XR
const xrBtn = await page.evaluate(() => window.__terracity.uiToScreen('hud-panel', 'xr-button'));
await page.mouse.click(xrBtn.x, xrBtn.y);
const active = async () => (await remote('get_session_status', {}))?.sessionActive === true;
for (let i = 0; i < 10 && !(await active()); i++) await wait(500);
if (!(await active())) await remote('accept_session', {}); // same path as `iwsdk xr enter`
for (let i = 0; i < 10 && !(await active()); i++) await wait(500);
if (!(await active())) throw new Error('XR session did not start');
await page.waitForFunction(() => !!window.IWER_DEVICE?.devui?.devUIContainer);
await wait(2000);
await page.evaluate(() => {
  const d = window.IWER_DEVICE;
  // Hide the emulator's developer UI (toolbar, input panels, gizmos): the
  // recording shows only the app's own XR view. The badge states it is emulated.
  d.devui.devUIContainer.style.display = 'none';
  if (d.devui.inputLayer?.style) d.devui.inputLayer.style.display = 'none';
});
await remote('set_input_mode', { mode: 'hand' });
await remote('set_transform', { device: 'headset', position: v3(EYE) });
await remote('look_at', { device: 'headset', target: v3([0, 0.82, -0.52]) });
await remote('set_transform', { device: 'hand-left', position: v3([-0.3, 0.66, -0.08]), orientation: q4(UP) });
await remote('set_transform', { device: 'hand-right', position: v3(REST), orientation: q4(UP) });
await rig('badge', 'Real app · Meta IWER emulator (Quest 3 profile) · hands only · no headset used');
await wait(1500);
console.log('phase', await sig('phase'));
if (process.env.PREVIEW_ONLY) {
  await page.screenshot({ path: `${OUT}/preview.png` });
  await context.close(); await browser.close(); process.exit(0);
}

// ---------------------------------------------------------------- S1 intro
mark('s1-intro');
await caption('TerraCity — Shape Tomorrow', 'Build a city with your hands. See its future before it happens.');
await wait(4500);
await caption('A seated mixed-reality planning game on your table', 'Plan a fictional Mediterranean-style coast for 2050 in 7 minutes');
await rayTap('overlay-panel', 'ov-primary', 1600, is('phase', 'building'));
console.log('phase', await sig('phase'));
await caption('');
await wait(800);

// ---------------------------------------------------------------- S2 build homes
mark('s2-homes');
await caption('Pinch a piece from the tray…', 'Tip 1: homes next to the town');
await grabAndPlace(1, 6, 4);
await caption('…and every choice has a consequence', await page.evaluate(() => window.__terracity.statusText.value.replace(/^.*?: /, '').replace(/\.$/, '')));
await wait(3200);

// ---------------------------------------------------------------- S3 wind with twist
mark('s3-wind');
await caption('Clean power: a wind turbine on the windy ridge', 'Twist your wrist to rotate · higher hills give more energy');
await grabAndPlace(3, 12, 8, { twist: true });
await wait(2600);

// ---------------------------------------------------------------- S4 time travel
mark('s4-2050');
await caption('Now jump to 2050', 'Same plan — 24 years later');
await rayTap('time-panel', 'year-2050', 700, is('viewYear', 2050));
const y50 = await page.evaluate(() => window.__terracity.project(2050));
await caption(
  `${y50.sprawlResidents.toLocaleString('en-US')} newcomers found no planned homes`,
  'grey sprawl spreads · the sea floods the beaches · the land dries',
);
await wait(5500);
await rayTap('time-panel', 'year-2026', 600, is('viewYear', 2026));
await caption('Back to 2026 to plan better');
await wait(1800);

// ---------------------------------------------------------------- S5 build plan A (sped up later)
mark('s5-build-fast-start');
await caption('Building Plan A by hand', 'roads, a bridge, homes and ridge turbines · ⏩ shown at 2.5× speed');
for (const [s, c, r] of [[5, 6, 3], [5, 7, 3], [1, 6, 2], [1, 2, 4], [1, 8, 3], [3, 10, 8], [3, 11, 8]]) {
  await grabAndPlace(s, c, r, { fast: 1.4 });
}
mark('s5-build-fast-end');
const mA = await page.evaluate(() => ({ ...window.__terracity.game.metrics, servedIds: undefined }));
const aOk = mA.population >= 28000 && mA.environment >= 60 && mA.renewableCoverage >= 80 && mA.budgetLeft >= 0;
await caption(
  `Plan A today: ${mA.population.toLocaleString('en-US')} housed · ${mA.renewableCoverage}% renewable`,
  aOk ? 'every target met in 2026' : 'not all targets met yet',
);
await wait(2500);
await rayTap('actions-panel', 'btn-save-a', 600, async () => !!(await page.evaluate(() => window.__terracity.planA.value?.length >= 9)));
await caption('Saved as Plan A');
await wait(1500);

// ---------------------------------------------------------------- S6 A fails in 2050
mark('s6-a-2050');
await rayTap('time-panel', 'year-2050', 600, is('viewYear', 2050));
const a50 = await page.evaluate(() => window.__terracity.project(2050));
console.log('plan A 2050', JSON.stringify({ r: a50.renewableCoverage, b: a50.budgetLeft, e: a50.environment, p: a50.population }));
await caption(
  `Looks fine today — in 2050 renewables drop to ${a50.renewableCoverage}%`,
  `electricity use per person grows 10% · ${a50.floodRiskIds.length} coastal sites need sea walls`,
);
await wait(5500);
await rayTap('time-panel', 'year-2026', 600, is('viewYear', 2026));

// ---------------------------------------------------------------- S7 plan B
mark('s7-plan-b-start');
await caption('Plan B: parks next to homes and a solar farm', '⏩ shown at 2.5× speed');
for (const [s, c, r] of [[4, 9, 3], [4, 1, 4], [2, 9, 4]]) await grabAndPlace(s, c, r, { fast: 1.4 });
mark('s7-plan-b-end');
await rayTap('actions-panel', 'btn-compare', 600, is('compareOpen', true));
const cmp = await page.evaluate(() => window.__terracity.statusText.value);
// Look up at the two miniature 2050 cities, as a seated player would.
const lookAt = async (target, ms) => {
  const q = await page.evaluate(([e, t]) => window.__rig.lookQuat(e, t), [EYE, target]);
  await remote('animate_to', { device: 'headset', position: v3(EYE), orientation: q4(q), duration: ms / 1000 });
  await wait(ms + 60);
};
await lookAt([0, 1.0, -0.62], 1000);
await caption('Compare both futures side by side', 'Plan A vs Plan B in 2050 — understood in seconds');
await wait(6000);
await lookAt([0, 0.82, -0.52], 900);
await rayTap('actions-panel', 'btn-compare', 500, is('compareOpen', false));

// ---------------------------------------------------------------- S8 finish
mark('s8-finish');
await caption('Finish the plan');
await rayTap('actions-panel', 'btn-finish', 600, is('phase', 'finished'));
const res = await page.evaluate(() => window.__terracity.result.value);
console.log('result', JSON.stringify({ success: res?.success, m: res && { ...res.metrics2050, notes: undefined, sprawlTiles: undefined } }));
if (!res?.success) throw new Error('final plan did not win; refusing to caption a win');
const m = res.metrics2050;
await caption(
  'A balanced 2050 — every target met',
  `${m.population.toLocaleString('en-US')} housed · environment ${m.environment} · ${m.renewableCoverage}% renewable · budget ${m.budgetLeft} left`,
);
await wait(5000);
await caption('TerraCity — Shape Tomorrow', 'Hands-first · seated · WebXR built with Meta Immersive Web SDK');
await wait(3500);
mark('end');

const video = page.video();
await context.close();
await browser.close();
const path = await video.path();
renameSync(path, `${OUT}/terracity-raw.webm`);
writeFileSync(`${OUT}/manifest.json`, JSON.stringify({ marks }, null, 2));
console.log('saved', `${OUT}/terracity-raw.webm`);
