/**
 * Panels for the signature loop: the year selector, the intro / pause / result
 * card, and the Plan A vs Plan B comparison table.
 */
import { createSystem, UIKit, UIKitMLAsset } from '@iwsdk/core';
import { TARGETS } from '../config/balance.js';
import { YEARS } from '../config/projection.js';
import * as cmd from '../core/commands.js';
import { coachText, compareOpen, game, outroOpen, paused, phase, planA, planVersion, result, streetView, tutorial, viewYear } from '../core/session.js';
import { onHover, pulse } from './hover.js';
import { SESSION_SECONDS } from '../gameplay/challenge.js';
import { comparePlans, METRIC_KEYS, type MetricKey } from '../simulation/compare.js';
import type { TargetCheck } from '../simulation/projection.js';
import { setPanelVisible } from './panel-visibility.js';
import { sfx } from '../audio/sfx.js';

const MET = '#1f8a4c';
const UNMET = '#b5651d';

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

  private yearHover = new Set<number>();
  private paintYears: (() => void) | null = null;
  private clock = 0;

  private bindTime(): void {
    const panel = this.world.getSceneObject<UIKitMLAsset>('time-panel');
    if (!panel) return;
    const caption = panel.getElementById<UIKit.Text>('time-caption');
    for (const y of YEARS) {
      const el = panel.getElementById(`year-${y}`);
      this.click(el, `year-${y}`, () => cmd.setYear(y));
      this.cleanupFuncs.push(
        onHover(el, (h) => {
          if (h) this.yearHover.add(y);
          else this.yearHover.delete(y);
          this.paintYears?.();
        }),
      );
    }
    this.paintYears = () => {
      // Tutorial cue: pulse the year the current tip asks for.
      // (The GODMODE tips use the split / enter controls; no year cue.)
      const cue: number | null = null;
      void tutorial;
      for (const y of YEARS) {
        const on = viewYear.peek() === y;
        const hover = this.yearHover.has(y);
        const glow = cue === y ? pulse(this.clock) : 0;
        panel.getElementById(`year-${y}`)?.setProperties({
          backgroundColor: on ? '#1d5f6b' : hover ? '#dcecef' : '#eef3f4',
          borderColor: on ? '#1d5f6b' : glow > 0 ? (glow > 0.5 ? '#f2b33d' : '#ffd36b') : hover ? '#3b9aa5' : '#c7d6da',
        });
        panel.getElementById<UIKit.Text>(`year-${y}-label`)?.setProperties({ color: on ? '#ffffff' : '#1d3f46' });
        panel.getElementById<UIKit.Text>(`year-${y}-sub`)?.setProperties({ color: on ? '#d6f2f4' : '#5d7a80' });
      }
      caption?.setProperties({
        text: viewYear.peek() === 2026 ? 'See the future of your plan' : `Viewing ${viewYear.peek()} - tap 2026 to edit`,
      });
    };
    this.cleanupFuncs.push(
      viewYear.subscribe(() => this.paintYears?.()),
      coachText.subscribe(() => this.paintYears?.()),
      phase.subscribe((p) => setPanelVisible(this.world, 'time-panel', p !== 'intro')),
    );
  }

  update(delta: number): void {
    this.clock += delta;
    // Only repaint while a tutorial cue is pulsing (a few properties, cheap).
    void this.paintYears;
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

    let shownTitle = '';
    const setTitle = (t: string) => {
      shownTitle = t;
      title?.setProperties({ text: t });
    };
    // Test hook: the overlay card's title and whether it is shown.
    const hook = ((window as unknown as Record<string, unknown>).__terracity ??= {}) as Record<string, unknown>;
    hook.overlay = () => ({ visible: this.world.getSceneObject('overlay-panel')?.visible ?? null, title: shownTitle });
    const render = () => {
      const ph = phase.value;
      const isPaused = paused.value;
      const r = result.value;
      // While comparing after the game, the card steps aside for the two cities;
      // the Plan pad's Compare button brings it back.
      // The closing card of the first five minutes waits for the tabletop.
      const outro = ph === 'building' && !isPaused && outroOpen.value && !streetView.value;
      if ((ph === 'building' && !isPaused && !outro) || (ph === 'finished' && compareOpen.value)) {
        setPanelVisible(this.world, 'overlay-panel', false);
        return;
      }
      setPanelVisible(this.world, 'overlay-panel', true);
      if (ph === 'intro') {
        // Beat 1 of the first five minutes: the miniature coast, and one line.
        setTitle('Every city begins with a choice.');
        body?.setProperties({
          text: `Costa Verde, 2026. By 2050 it needs homes for ${fmt(TARGETS.population)} people. Your plan decides how they will live.`,
        });
        setLines([
          'Make one choice, split the city into two futures, see why they differ, and meet someone who lives there.',
          `Then plan freely: ${SESSION_SECONDS / 60} minutes to balance homes, nature (${TARGETS.environment}+), ${TARGETS.renewableCoverage}% clean power and the budget.`,
        ]);
        primaryLabel?.setProperties({ text: 'Begin' });
        primaryAction = cmd.startGame;
        secondary?.setProperties({ display: 'flex' });
        secondaryLabel?.setProperties({ text: 'Skip intro' });
        secondaryAction = cmd.startWithoutIntro;
      } else if (outro) {
        // Beat 6: the question, then the planning tools are all yours.
        setTitle("The future isn't written. It's built.");
        body?.setProperties({ text: 'You made a choice, split the city, saw why the futures differ and met Mira in both of them.' });
        setLines([
          'Keep planning: more homes, clean power and parks. Tap Finish plan when Costa Verde is balanced.',
          'Replay intro (Plan pad, More) walks the six steps again on your current plan.',
        ]);
        primaryLabel?.setProperties({ text: 'Keep planning' });
        primaryAction = cmd.closeOutro;
        secondary?.setProperties({ display: 'flex' });
        secondaryLabel?.setProperties({ text: 'Replay intro' });
        secondaryAction = cmd.replayIntro;
      } else if (ph === 'building' && isPaused) {
        setTitle('Paused');
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
        setTitle(r.success ? 'Balanced city - you did it!' : 'Not balanced yet');
        body?.setProperties({
          text: `${r.timedOut ? "Time's up. " : ''}Your 2050 projection: ${fmt(m.population)} housed, environment ${m.environment}, ${m.renewableCoverage}% renewable, budget ${m.budgetLeft}.`,
        });
        if (r.success) {
          setLines([
            `Housed ${fmt(m.population)} - goal ${fmt(TARGETS.population)} met`,
            `Environment ${m.environment} - goal ${TARGETS.environment}+ met`,
            `Renewable ${m.renewableCoverage}% - goal ${TARGETS.renewableCoverage}% met`,
            `Budget left ${m.budgetLeft} - not overspent`,
            'Gold outlines on the map: the homes, parks and clean energy that made it work.',
          ]);
        } else {
          setLines([
            ...r.hints.slice(0, 4),
            'On the map: amber marks the problem areas, teal marks where a fix could go.',
          ]);
        }
        primaryLabel?.setProperties({ text: 'Play again' });
        primaryAction = cmd.playAgain;
        const hasA = !!planA.value;
        secondary?.setProperties({ display: hasA ? 'flex' : 'none' });
        secondaryLabel?.setProperties({ text: compareOpen.value ? 'Hide comparison' : 'Compare with saved' });
        secondaryAction = hasA ? cmd.toggleCompare : null;
      }
    };
    for (const s of [phase, paused, result, compareOpen, planA, outroOpen, streetView] as const) {
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
      const c = comparePlans(game.terrain, a, game.placements, 2050, { A: 'The saved plan', B: 'Your plan' });
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
