/**
 * Drives the challenge clock and the global (non-editing) keyboard shortcuts:
 * T cycle year, S save Plan A, C compare, P pause, F finish, Enter start/replay,
 * H tips on/off, L larger text, M sound on/off.
 * Pauses automatically when the headset is taken off or the page loses focus.
 */
import { createSystem, VisibilityState } from '@iwsdk/core';
import * as cmd from '../core/commands.js';
import { game } from '../core/session.js';
import { projectYear } from '../simulation/projection.js';
import type { Year } from '../config/projection.js';
import { cycleSound, largeText, soundOn } from '../ui/accessibility.js';
import { challenge, coachText, outroOpen, seamPos, compareOpen, planVersion, causalityOn, detailsOpen, futuresOpen, paused, phase, planA, result, streetView, timeLeft, viewYear } from '../core/session.js';


export class FlowSystem extends createSystem({}) {
  init(): void {
    cmd.loadStoredPlanA();
    // Keep the save current: every plan change and every Plan A save.
    this.cleanupFuncs.push(planVersion.subscribe(() => cmd.persist()), planA.subscribe(() => cmd.persist()));
    // Test/debug hook: read-only view of the challenge state.
    const hook = ((window as unknown as Record<string, unknown>).__terracity ??= {}) as Record<string, unknown>;
    Object.assign(hook, {
      /** Projection of the current plan (read-only; used by tests and the video recorder). */
      project: (year: Year) => projectYear(game.terrain, game.placements, year, game.metrics),
      placements: () => game.placements,
      viewYear, phase, planA, compareOpen, result, timeLeft, paused, challenge, coachText, outroOpen, largeText, soundOn });
    // Dev only: state trace so CLI-driven XR tests (which cannot read JS) can assert on it.
    if (import.meta.env.DEV) {
      const trace = () =>
        console.info(
          `[terracity] state phase=${phase.peek()} year=${viewYear.peek()} paused=${paused.peek()} ` +
            `planA=${!!planA.peek()} compare=${compareOpen.peek()} success=${result.peek()?.success ?? '-'} ` +
            `tip=${coachText.peek().slice(0, 9) || 'none'} large=${largeText.peek()} sound=${soundOn.peek()}`,
        );
      for (const s of [phase, viewYear, paused, planA, compareOpen, result, coachText, largeText, soundOn] as const) {
        this.cleanupFuncs.push((s as { subscribe(f: () => void): () => void }).subscribe(trace));
      }
    }
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((v) => {
        if (v === VisibilityState.VisibleBlurred && phase.peek() === 'building' && !paused.peek()) {
          cmd.togglePause();
        }
      }),
    );
  }

  update(delta: number): void {
    cmd.tickClock(delta);
    const kb = this.input.keyboard;
    if (kb.getKeyDown('KeyD')) detailsOpen.value = !detailsOpen.peek();
    if (kb.getKeyDown('KeyW')) causalityOn.value = !causalityOn.peek();
    if (kb.getKeyDown('KeyE')) {
      if (streetView.peek()) cmd.exitCity();
      else if (futuresOpen.peek()) cmd.enterFuture(futuresOpen.peek()!.selected ?? 'A');
      else cmd.enterCity();
    }
    if (streetView.peek()) {
      if (kb.getKeyDown('ArrowRight')) cmd.stepViewpoint(1);
      if (kb.getKeyDown('ArrowLeft')) cmd.stepViewpoint(-1);
      if (kb.getKeyDown('Escape')) cmd.exitCity();
      const talk = (window as unknown as { __terracity?: { talk?(a: string): void } }).__terracity?.talk;
      if (kb.getKeyDown('KeyK')) talk?.('next');
      if (kb.getKeyDown('KeyB')) talk?.('back');
      if (kb.getKeyDown('KeyX')) talk?.('end');
      return; // tabletop shortcuts are off while visiting the street
    }
    if (kb.getKeyDown('KeyV')) cmd.toggleFutures();
    if (seamPos.peek() !== null) {
      if (kb.getKeyDown('ArrowRight')) cmd.nudgeSeam(1);
      if (kb.getKeyDown('ArrowLeft')) cmd.nudgeSeam(-1);
    }
    if (kb.getKeyDown('KeyT')) cmd.nextYear();
    if (kb.getKeyDown('KeyS')) cmd.savePlanA();
    if (kb.getKeyDown('KeyC')) cmd.toggleCompare();
    if (kb.getKeyDown('KeyP')) cmd.togglePause();
    if (kb.getKeyDown('KeyF')) cmd.finishGame();
    if (kb.getKeyDown('KeyH')) cmd.toggleTips();
    if (kb.getKeyDown('KeyI')) cmd.replayIntro();
    if (kb.getKeyDown('KeyG')) cmd.toggleSeam();
    if (kb.getKeyDown('KeyN')) (window as unknown as { __terracity?: { nextCause?(): void } }).__terracity?.nextCause?.();
    if (kb.getKeyDown('KeyL')) largeText.value = !largeText.peek();
    if (kb.getKeyDown('KeyM')) cycleSound();
    if (kb.getKeyDown('Enter')) {
      if (phase.peek() === 'intro') cmd.startGame();
      else if (phase.peek() === 'finished') cmd.playAgain();
    }
  }
}
