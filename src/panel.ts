import {
  createSystem,
  UIKit,
  UIKitMLAsset,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { BALANCE, TARGETS } from './config/balance.js';
import { STRUCTURE_ORDER, STRUCTURES } from './config/structures.js';
import * as cmd from './core/commands.js';
import { armedType, game, planVersion, statusText } from './core/session.js';

const MET = '#1f8a4c';
const UNMET = '#b5651d';
const ARMED_BG = '#ffd36b';
const IDLE_BG = 'rgba(0,0,0,0)';

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

/**
 * Binds the spatial panels to the game: live metrics + status on the HUD,
 * plan commands on the action pad, armed-slot highlight on the tray labels.
 */
export class PanelSystem extends createSystem({}) {
  init(): void {
    this.bindHud();
    this.bindActions();
    this.bindTrayLabels();
    this.exposeTestHooks();
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
    // Dev only: print action-pad button positions so CLI-driven XR tests can
    // aim at them. Re-logged on every visibility change because ScreenSpace
    // panels move between the desktop overlay and their world transform.
    if (import.meta.env.DEV) {
      const log = () =>
        setTimeout(() => {
          const mode = this.world.visibilityState.peek();
          for (const id of ['btn-undo', 'btn-redo', 'btn-rotate', 'btn-remove', 'btn-restart']) {
            const p = locate('actions-panel', id);
            if (p) console.info(`[terracity] ui ${mode} ${id} ${p.toArray().map((n) => n.toFixed(3)).join(',')}`);
          }
        }, 1500);
      this.cleanupFuncs.push(this.world.visibilityState.subscribe(log));
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
    const pop = text('m-population');
    const env = text('m-environment');
    const budget = text('m-budget');
    const renew = text('m-renewable');
    text('t-population')?.setProperties({ text: `goal ${fmt(TARGETS.population)}` });
    text('t-environment')?.setProperties({ text: `goal ${TARGETS.environment}+` });
    text('t-budget')?.setProperties({ text: `of ${BALANCE.startBudget}` });
    text('t-renewable')?.setProperties({ text: `goal ${TARGETS.renewableCoverage}%` });

    const refresh = () => {
      const m = game.metrics;
      const unserved = m.unservedHomes ? ` (+${m.unservedHomes} unconnected)` : '';
      pop?.setProperties({
        text: fmt(m.population) + unserved,
        color: m.population >= TARGETS.population ? MET : UNMET,
      });
      env?.setProperties({ text: String(m.environment), color: m.environment >= TARGETS.environment ? MET : UNMET });
      budget?.setProperties({ text: String(m.budgetLeft), color: m.budgetLeft >= TARGETS.minBudgetLeft ? MET : UNMET });
      renew?.setProperties({
        text: `${m.renewableCoverage}%`,
        color: m.renewableCoverage >= TARGETS.renewableCoverage ? MET : UNMET,
      });
    };
    this.cleanupFuncs.push(
      statusText.subscribe((t) => status?.setProperties({ text: t })),
      planVersion.subscribe(refresh),
    );

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
    const actions: Array<[string, () => void]> = [
      ['btn-undo', cmd.undo],
      ['btn-redo', cmd.redo],
      ['btn-rotate', cmd.rotateSelected],
      ['btn-remove', cmd.removeSelected],
      ['btn-restart', cmd.restart],
    ];
    const buttons = new Map<string, ReturnType<UIKitMLAsset["getElementById"]> & object>();
    for (const [id, fn] of actions) {
      const el = panel.getElementById(id);
      if (!el) continue;
      el.name = id;
      buttons.set(id, el);
      this.onClick(el, fn);
    }
    // Dim undo/redo when there is nothing to step through.
    this.cleanupFuncs.push(
      planVersion.subscribe(() => {
        buttons.get('btn-undo')?.setProperties({ opacity: game.canUndo ? 1 : 0.4 });
        buttons.get('btn-redo')?.setProperties({ opacity: game.canRedo ? 1 : 0.4 });
      }),
    );
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
    );
  }

  private onClick(el: { addEventListener(t: "click", f: () => void): void; removeEventListener(t: "click", f: () => void): void }, fn: () => void): void {
    el.addEventListener('click', fn);
    this.cleanupFuncs.push(() => el.removeEventListener('click', fn));
  }
}
