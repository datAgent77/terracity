/**
 * Panels for the signature loop: the year selector, the intro / pause / result
 * card, and the Plan A vs Plan B comparison table.
 */
import { createSystem, UIKit, UIKitMLAsset } from '@iwsdk/core';
import { TARGETS } from '../config/balance.js';
import { YEARS } from '../config/projection.js';
import * as cmd from '../core/commands.js';
import { compareOpen, game, paused, phase, planA, planVersion, result, viewYear } from '../core/session.js';
import { SESSION_SECONDS } from '../gameplay/challenge.js';
import { comparePlans, METRIC_KEYS, type MetricKey } from '../simulation/compare.js';
import type { TargetCheck } from '../simulation/projection.js';
import { setPanelVisible } from './panel-visibility.js';
import { sfx } from '../audio/sfx.js';

const MET = '#1f8a4c';
const UNMET = '#b5651d';
const YEAR_ON = { backgroundColor: '#1d5f6b', borderColor: '#1d5f6b' };
const YEAR_OFF = { backgroundColor: '#e8eef0', borderColor: '#c7d6da' };

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const FORMAT: Record<MetricKey, (n: number) => string> = {
  population: fmt,
  environment: (n) => String(n),
  renewableCoverage: (n) => `${n}%`,
  budgetLeft: (n) => String(n),
};
const TARGET_OF: Record<MetricKey, keyof TargetCheck> = {
  population: 'population',
  environment: 'environment',
  renewableCoverage: 'renewableCoverage',
  budgetLeft: 'budget',
};

type Clickable = {
  name: string;
  addEventListener(t: 'click', f: () => void): void;
  removeEventListener(t: 'click', f: () => void): void;
};

export class FlowPanelSystem extends createSystem({}) {
  init(): void {
    this.bindTime();
    this.bindOverlay();
    this.bindCompare();
  }

  private click(el: Clickable | null | undefined, id: string, action: () => void): void {
    if (!el) return;
    el.name = id;
    const fn = () => {
      sfx.click();
      action();
    };
    el.addEventListener('click', fn);
    this.cleanupFuncs.push(() => el.removeEventListener('click', fn));
  }

  private bindTime(): void {
    const panel = this.world.getSceneObject<UIKitMLAsset>('time-panel');
    if (!panel) return;
    const caption = panel.getElementById<UIKit.Text>('time-caption');
    for (const y of YEARS) {
      this.click(panel.getElementById(`year-${y}`), `year-${y}`, () => cmd.setYear(y));
    }
    const paint = () => {
      for (const y of YEARS) {
        const on = viewYear.value === y;
        panel.getElementById(`year-${y}`)?.setProperties(on ? YEAR_ON : YEAR_OFF);
        panel.getElementById<UIKit.Text>(`year-${y}-label`)?.setProperties({ color: on ? '#ffffff' : '#1d3f46' });
      }
      caption?.setProperties({
        text: viewYear.value === 2026 ? 'See the future of your plan' : `Viewing ${viewYear.value} - tap 2026 to edit`,
      });
    };
    this.cleanupFuncs.push(viewYear.subscribe(paint), phase.subscribe((p) => setPanelVisible(this.world, 'time-panel', p !== 'intro')));
  }

  private bindOverlay(): void {
    const panel = this.world.getSceneObject<UIKitMLAsset>('overlay-panel');
    if (!panel) return;
    const t = (id: string) => panel.getElementById<UIKit.Text>(id);
    const title = t('ov-title');
    const body = t('ov-body');
    const lines = [1, 2, 3, 4, 5].map((i) => t(`ov-line-${i}`));
    const primaryLabel = t('ov-primary-label');
    const secondary = panel.getElementById('ov-secondary');
    const secondaryLabel = t('ov-secondary-label');

    let primaryAction = cmd.startGame;
    let secondaryAction: (() => void) | null = null;
    this.click(panel.getElementById('ov-primary'), 'ov-primary', () => primaryAction());
    this.click(secondary, 'ov-secondary', () => secondaryAction?.());

    const setLines = (texts: string[]) =>
      lines.forEach((l, i) => l?.setProperties({ text: texts[i] ?? '', display: texts[i] ? 'flex' : 'none' }));

    const render = () => {
      const ph = phase.value;
      const isPaused = paused.value;
      const r = result.value;
      // While comparing after the game, the card steps aside for the two cities;
      // the Plan pad's Compare button brings it back.
      if ((ph === 'building' && !isPaused) || (ph === 'finished' && compareOpen.value)) {
        setPanelVisible(this.world, 'overlay-panel', false);
        return;
      }
      setPanelVisible(this.world, 'overlay-panel', true);
      if (ph === 'intro') {
        title?.setProperties({ text: 'TerraCity - Shape Tomorrow' });
        body?.setProperties({
          text: `Costa Verde will need homes for ${fmt(TARGETS.population)} people by 2050. You have ${SESSION_SECONDS / 60} minutes to plan.`,
        });
        setLines([
          '1. Pinch a piece from the tray and drop it on the map.',
          '2. Watch the numbers react, then tap 2035 or 2050 to see the future.',
          '3. Save Plan A, try a Plan B, and compare.',
          `Goal for 2050: ${fmt(TARGETS.population)} housed, environment ${TARGETS.environment}+, ${TARGETS.renewableCoverage}% renewable, budget not overspent.`,
        ]);
        primaryLabel?.setProperties({ text: 'Start' });
        primaryAction = cmd.startGame;
        secondary?.setProperties({ display: 'none' });
        secondaryAction = null;
      } else if (ph === 'building' && isPaused) {
        title?.setProperties({ text: 'Paused' });
        body?.setProperties({ text: 'The clock is stopped.' });
        setLines([]);
        primaryLabel?.setProperties({ text: 'Resume' });
        primaryAction = cmd.togglePause;
        secondary?.setProperties({ display: 'flex' });
        secondaryLabel?.setProperties({ text: 'Finish plan' });
        secondaryAction = () => {
          cmd.togglePause();
          cmd.finishGame();
        };
      } else if (ph === 'finished' && r) {
        const m = r.metrics2050;
        title?.setProperties({ text: r.success ? 'Balanced city - you did it!' : 'Not balanced yet' });
        body?.setProperties({
          text: `${r.timedOut ? "Time's up. " : ''}Your 2050 projection: ${fmt(m.population)} housed, environment ${m.environment}, ${m.renewableCoverage}% renewable, budget ${m.budgetLeft}.`,
        });
        setLines(r.success ? ['Every target met. Try a bolder Plan B, or replay to beat your margin.'] : r.hints);
        primaryLabel?.setProperties({ text: 'Play again' });
        primaryAction = cmd.playAgain;
        const hasA = !!planA.value;
        secondary?.setProperties({ display: hasA ? 'flex' : 'none' });
        secondaryLabel?.setProperties({ text: compareOpen.value ? 'Hide comparison' : 'Compare A/B' });
        secondaryAction = hasA ? cmd.toggleCompare : null;
      }
    };
    for (const s of [phase, paused, result, compareOpen, planA] as const) {
      this.cleanupFuncs.push((s as { subscribe(f: () => void): () => void }).subscribe(render));
    }
  }

  private bindCompare(): void {
    const panel = this.world.getSceneObject<UIKitMLAsset>('compare-panel');
    if (!panel) return;
    const headline = panel.getElementById<UIKit.Text>('cmp-headline');
    const render = () => {
      const a = planA.value;
      const open = compareOpen.value && !!a;
      setPanelVisible(this.world, 'compare-panel', open);
      if (!open || !a) return;
      const c = comparePlans(game.terrain, a, game.placements, 2050);
      headline?.setProperties({ text: c.headline });
      for (const k of METRIC_KEYS) {
        const tk = TARGET_OF[k];
        const cell = (side: 'a' | 'b') => {
          const ok = side === 'a' ? c.aTargets[tk] : c.bTargets[tk];
          const wins = c.better[k] === side.toUpperCase();
          panel.getElementById<UIKit.Text>(`${side}-${k}`)?.setProperties({
            text: `${FORMAT[k](c[side][k])}${ok ? ' ok' : ' x'}`,
            color: ok ? MET : UNMET,
            fontWeight: wins ? 700 : 400,
          });
        };
        cell('a');
        cell('b');
      }
    };
    for (const s of [compareOpen, planA, planVersion] as const) {
      this.cleanupFuncs.push((s as { subscribe(f: () => void): () => void }).subscribe(render));
    }
  }
}
