import {
  createSystem,
  ScreenSpace,
  UIKit,
  UIKitMLAsset,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { BALANCE, TARGETS } from '../config/balance.js';
import { STRUCTURE_ORDER, STRUCTURES } from '../config/structures.js';
import * as cmd from '../core/commands.js';
import {
  armedType,
  game,
  paused,
  phase,
  planA,
  planVersion,
  statusText,
  timeLeft,
  viewYear,
} from '../core/session.js';
import { formatClock } from '../gameplay/challenge.js';
import { coachText, tutorial } from '../core/session.js';
import { largeText, prefersReducedMotion, soundOn } from './accessibility.js';
import { projectYear, type YearMetrics } from '../simulation/projection.js';
import { sfx } from '../audio/sfx.js';

const MET = '#1f8a4c';
const UNMET = '#b5651d';
const ARMED_BG = '#ffd36b';
const IDLE_BG = 'rgba(0,0,0,0)';
const ACTION_IDS = [
  'btn-undo', 'btn-redo', 'btn-rotate', 'btn-remove', 'btn-restart',
  'btn-save-a', 'btn-restore-a', 'btn-compare', 'btn-pause', 'btn-finish',
];

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

/** Panels enlarged by the "Larger text" preference. */
const SCALABLE_PANELS = ['hud-panel', 'actions-panel', 'time-panel', 'overlay-panel', 'compare-panel'];
const LARGE = 1.3;

type Settable = { setProperties(p: Record<string, unknown>): void };
type Clickable = {
  addEventListener(t: 'click', f: () => void): void;
  removeEventListener(t: 'click', f: () => void): void;
};

/** One animated HUD number: eases toward its target so changes are visible. */
interface Tween {
  el: Settable | undefined;
  shown: number;
  target: number;
  format: (n: number) => string;
  met: (n: number) => boolean;
  last: string;
}

/**
 * Binds the spatial panels to the game: animated metrics for the viewed year,
 * clock and status on the HUD; plan commands on the action pad; armed-slot
 * highlight on the tray labels.
 */
export class PanelSystem extends createSystem({}) {
  private tweens: Tween[] = [];

  init(): void {
    this.bindHud();
    this.bindActions();
    this.bindTrayLabels();
    this.exposeTestHooks();
  }

  update(delta: number): void {
    const k = Math.min(1, delta * 6);
    for (const t of this.tweens) {
      if (t.shown === t.target) continue;
      t.shown += (t.target - t.shown) * k;
      if (Math.abs(t.target - t.shown) < 0.5) t.shown = t.target;
      const text = t.format(t.shown);
      if (text !== t.last) {
        t.last = text;
        t.el?.setProperties({ text, color: t.met(t.target) ? MET : UNMET });
      }
    }
  }

  private bindHud(): void {
    const panel = this.world.getSceneObject<UIKitMLAsset>('hud-panel');
    if (!panel) return;
    const text = (id: string) => {
      const el = panel.getElementById<UIKit.Text>(id);
      if (el) el.name = id;
      return el;
    };
    const status = text('status-text');
    const yearLabel = text('m-year');
    const clock = text('m-clock');
    const sprawl = text('m-sprawl');
    text('t-population')?.setProperties({ text: `goal ${fmt(TARGETS.population)}` });
    text('t-environment')?.setProperties({ text: `goal ${TARGETS.environment}+` });
    text('t-budget')?.setProperties({ text: `of ${BALANCE.startBudget}` });
    text('t-renewable')?.setProperties({ text: `goal ${TARGETS.renewableCoverage}%` });

    // Colour-independent status: the goal label reads "met" once a target is reached.
    const goalText: Record<string, string> = {
      'm-population': `goal ${fmt(TARGETS.population)}`,
      'm-environment': `goal ${TARGETS.environment}+`,
      'm-renewable': `goal ${TARGETS.renewableCoverage}%`,
    };
    const goalEl: Record<string, Settable | undefined> = {
      'm-population': text('t-population') ?? undefined,
      'm-environment': text('t-environment') ?? undefined,
      'm-renewable': text('t-renewable') ?? undefined,
    };
    const tween = (id: string, format: (n: number) => string, met: (n: number) => boolean): Tween => {
      const t: Tween = { el: text(id) ?? undefined, shown: NaN, target: 0, format, met, last: '' };
      this.tweens.push(t);
      return t;
    };
    const pop = tween('m-population', fmt, (n) => n >= TARGETS.population);
    const env = tween('m-environment', (n) => String(Math.round(n)), (n) => n >= TARGETS.environment);
    const budget = tween('m-budget', (n) => String(Math.round(n)), (n) => n >= TARGETS.minBudgetLeft);
    const renew = tween('m-renewable', (n) => `${Math.round(n)}%`, (n) => n >= TARGETS.renewableCoverage);

    const refresh = () => {
      const year = viewYear.value;
      const y: YearMetrics = projectYear(game.terrain, game.placements, year, game.metrics);
      const set = (t: Tween, v: number) => {
        if (Number.isNaN(t.shown) || prefersReducedMotion()) t.shown = v; // no animation
        t.target = v;
        const id = (t.el as { name?: string } | undefined)?.name ?? '';
        goalEl[id]?.setProperties({
          text: t.met(v) ? `met (${goalText[id].replace('goal ', '')})` : goalText[id],
          color: t.met(v) ? MET : '#777777',
          fontWeight: t.met(v) ? 700 : 400,
        });
        if (t.shown === v) {
          t.last = t.format(v);
          t.el?.setProperties({ text: t.last, color: t.met(v) ? MET : UNMET });
        }
      };
      set(pop, y.population);
      set(env, y.environment);
      set(budget, y.budgetLeft);
      set(renew, y.renewableCoverage);
      const unserved = game.metrics.unservedHomes;
      const extra = [
        unserved ? `${unserved} homes not connected by road` : '',
        y.sprawlResidents ? `+${fmt(y.sprawlResidents)} in unplanned sprawl` : '',
      ].filter(Boolean);
      sprawl?.setProperties({ text: extra.join(' / ') });
      yearLabel?.setProperties({ text: year === 2026 ? '2026 - today' : `${year} - projection` });
    };
    this.cleanupFuncs.push(
      statusText.subscribe((t) => status?.setProperties({ text: t })),
      viewYear.subscribe(refresh),
      planVersion.subscribe(refresh),
      timeLeft.subscribe((s) => clock?.setProperties({ text: formatClock(s) })),
      paused.subscribe((p) => clock?.setProperties({ text: p ? 'paused' : formatClock(timeLeft.peek()) })),
    );

    // Guided tips line + preference chips (tips, text size, sound).
    const coach = text('coach');
    const skipLabel = text('skip-tips-label');
    const sizeLabel = text('text-size-label');
    const soundLabel = text('sound-label');
    this.cleanupFuncs.push(
      coachText.subscribe((t) => {
        coach?.setProperties({ text: t || '-', display: t ? 'flex' : 'none' });
        skipLabel?.setProperties({ text: tutorial.active ? 'Skip tips' : 'Show tips' });
      }),
      largeText.subscribe((on) => {
        sizeLabel?.setProperties({ text: on ? 'Normal text' : 'Larger text' });
        this.applyTextSize(on);
      }),
      soundOn.subscribe((on) => soundLabel?.setProperties({ text: on ? 'Sound on' : 'Sound off' })),
    );
    this.onClick(panel.getElementById('btn-skip-tips') as unknown as Clickable, cmd.toggleTips);
    this.onClick(panel.getElementById('btn-text-size') as unknown as Clickable, () => (largeText.value = !largeText.peek()));
    this.onClick(panel.getElementById('btn-sound') as unknown as Clickable, () => (soundOn.value = !soundOn.peek()));
    for (const id of ['btn-skip-tips', 'btn-text-size', 'btn-sound']) {
      const el = panel.getElementById(id);
      if (el) el.name = id;
    }

    const xrButton = panel.getElementById('xr-button');
    const exitButton = panel.getElementById('exit-button');
    if (xrButton == null || exitButton == null) return;
    xrButton.name = 'xr-button';
    exitButton.name = 'exit-button';
    if (!this.world.xrEnabled) {
      xrButton.setProperties({ display: 'none' });
      exitButton.setProperties({ display: 'none' });
      return;
    }
    this.onClick(xrButton, () => this.world.launchXR());
    this.onClick(exitButton, () => this.world.exitXR());
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((visibilityState) => {
        const is2D = visibilityState === VisibilityState.NonImmersive;
        xrButton.setProperties({ display: is2D ? 'flex' : 'none' });
        exitButton.setProperties({ display: is2D ? 'none' : 'flex' });
      }),
    );
  }

  private bindActions(): void {
    const panel = this.world.getSceneObject<UIKitMLAsset>('actions-panel');
    if (!panel) return;
    const fns: Record<string, () => void> = {
      'btn-undo': cmd.undo,
      'btn-redo': cmd.redo,
      'btn-rotate': cmd.rotateSelected,
      'btn-remove': cmd.removeSelected,
      'btn-restart': cmd.restart,
      'btn-save-a': cmd.savePlanA,
      'btn-restore-a': cmd.restorePlanA,
      'btn-compare': cmd.toggleCompare,
      'btn-pause': cmd.togglePause,
      'btn-finish': () => cmd.finishGame(),
    };
    const buttons = new Map<string, Settable>();
    for (const id of ACTION_IDS) {
      const el = panel.getElementById(id);
      if (!el) continue;
      el.name = id;
      buttons.set(id, el);
      this.onClick(el, fns[id]);
    }
    const pauseLabel = panel.getElementById<UIKit.Text>('pause-label');
    const dim = (id: string, on: boolean) => buttons.get(id)?.setProperties({ opacity: on ? 1 : 0.4 });
    const refresh = () => {
      const editing = phase.value === 'building' && viewYear.value === 2026 && !paused.value;
      for (const id of ['btn-rotate', 'btn-remove', 'btn-restart']) dim(id, editing);
      dim('btn-undo', editing && game.canUndo);
      dim('btn-redo', editing && game.canRedo);
      dim('btn-save-a', phase.value === 'building');
      dim('btn-restore-a', editing && !!planA.value);
      dim('btn-compare', !!planA.value);
      dim('btn-pause', phase.value === 'building');
      dim('btn-finish', phase.value === 'building');
      pauseLabel?.setProperties({ text: paused.value ? 'Resume' : 'Pause' });
    };
    for (const s of [planVersion, phase, viewYear, paused, planA] as const) {
      this.cleanupFuncs.push((s as { subscribe(f: () => void): () => void }).subscribe(refresh));
    }
  }

  private bindTrayLabels(): void {
    const panel = this.world.getSceneObject<UIKitMLAsset>('tray-labels');
    if (!panel) return;
    for (const type of STRUCTURE_ORDER) {
      const s = STRUCTURES[type];
      panel.getElementById<UIKit.Text>(`cost-${s.slot}`)?.setProperties({ text: `cost ${s.cost}` });
    }
    this.cleanupFuncs.push(
      armedType.subscribe((armed) => {
        for (const type of STRUCTURE_ORDER) {
          const slot = STRUCTURES[type].slot;
          panel
            .getElementById(`slot-${slot}`)
            ?.setProperties({ backgroundColor: armed === type ? ARMED_BG : IDLE_BG });
        }
      }),
      viewYear.subscribe((y) => {
        panel.visible = y === 2026;
      }),
    );
  }

  /** Test/debug hooks: locate a UIKit element on screen and in the world. */
  private exposeTestHooks(): void {
    const v = new Vector3();
    const locate = (panelId: string, elementId: string) => {
      const el = this.world.getSceneObject<UIKitMLAsset>(panelId)?.getElementById(elementId);
      if (!el) return null;
      el.updateWorldMatrix(true, false);
      return el.getWorldPosition(v);
    };
    const hook = ((window as unknown as Record<string, unknown>).__terracity ??= {}) as Record<string, unknown>;
    hook.uiToScreen = (panelId: string, elementId: string) => {
      const p = locate(panelId, elementId);
      if (!p) return null;
      p.project(this.world.camera);
      const r = this.world.renderer.domElement.getBoundingClientRect();
      return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
    };
    hook.uiWorldPosition = (panelId: string, elementId: string) => locate(panelId, elementId)?.toArray();
    // Dev only: print button positions so CLI-driven XR tests can aim at them.
    // Re-logged on every visibility change because ScreenSpace panels move
    // between the desktop overlay and their world transform.
    if (import.meta.env.DEV) {
      const targets: Array<[string, string]> = [
        ...ACTION_IDS.map((id) => ['actions-panel', id] as [string, string]),
        ['time-panel', 'year-2026'], ['time-panel', 'year-2035'], ['time-panel', 'year-2050'],
        ['overlay-panel', 'ov-primary'], ['overlay-panel', 'ov-secondary'],
        ['hud-panel', 'btn-skip-tips'], ['hud-panel', 'btn-text-size'], ['hud-panel', 'btn-sound'],
      ];
      const log = () =>
        setTimeout(() => {
          const mode = this.world.visibilityState.peek();
          for (const [panelId, id] of targets) {
            const p = locate(panelId, id);
            if (p) console.info(`[terracity] ui ${mode} ${id} ${p.toArray().map((n) => n.toFixed(3)).join(',')}`);
          }
        }, 900);
      // Re-log when layouts shift (coach line, larger text, phase changes).
      for (const sig of [this.world.visibilityState, coachText, largeText, phase] as const) {
        this.cleanupFuncs.push((sig as { subscribe(f: () => void): () => void }).subscribe(log));
      }
    }
  }

  /** Scale spatial panels (XR) and their desktop overlay size together. */
  private applyTextSize(on: boolean): void {
    const k = on ? LARGE : 1;
    for (const id of SCALABLE_PANELS) {
      const entity = this.world.getSceneEntity(id);
      const obj = entity?.object3D;
      if (!entity || !obj) continue;
      obj.userData.baseScale ??= obj.scale.x;
      obj.scale.setScalar((obj.userData.baseScale as number) * k);
      if (!entity.hasComponent(ScreenSpace)) continue;
      for (const field of ['width', 'height'] as const) {
        const key = `base_${field}`;
        obj.userData[key] ??= entity.getValue(ScreenSpace, field);
        const base = String(obj.userData[key]);
        const m = /^([\d.]+)(.*)$/.exec(base);
        if (m) entity.setValue(ScreenSpace, field, `${(parseFloat(m[1]) * k).toFixed(1)}${m[2]}`);
      }
    }
    // ScreenSpace only re-lays out on viewport changes; nudge it.
    window.dispatchEvent(new Event('resize'));
  }

  private onClick(el: Clickable, action: () => void): void {
    const fn = () => {
      sfx.click();
      action();
    };
    el.addEventListener('click', fn);
    this.cleanupFuncs.push(() => el.removeEventListener('click', fn));
  }
}
