/**
 * Drives the challenge clock and the global (non-editing) keyboard shortcuts:
 * T cycle year, S save Plan A, C compare, P pause, F finish, Enter start/replay.
 * Pauses automatically when the headset is taken off or the page loses focus.
 */
import { createSystem, VisibilityState } from '@iwsdk/core';
import * as cmd from '../core/commands.js';
import { challenge, compareOpen, paused, phase, planA, result, timeLeft, viewYear } from '../core/session.js';


export class FlowSystem extends createSystem({}) {
  init(): void {
    cmd.loadStoredPlanA();
    // Test/debug hook: read-only view of the challenge state.
    const hook = ((window as unknown as Record<string, unknown>).__terracity ??= {}) as Record<string, unknown>;
    Object.assign(hook, { viewYear, phase, planA, compareOpen, result, timeLeft, paused, challenge });
    // Dev only: state trace so CLI-driven XR tests (which cannot read JS) can assert on it.
    if (import.meta.env.DEV) {
      const trace = () =>
        console.info(
          `[terracity] state phase=${phase.peek()} year=${viewYear.peek()} paused=${paused.peek()} ` +
            `planA=${!!planA.peek()} compare=${compareOpen.peek()} success=${result.peek()?.success ?? '-'}`,
        );
      for (const s of [phase, viewYear, paused, planA, compareOpen, result] as const) {
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
    if (kb.getKeyDown('KeyT')) cmd.nextYear();
    if (kb.getKeyDown('KeyS')) cmd.savePlanA();
    if (kb.getKeyDown('KeyC')) cmd.toggleCompare();
    if (kb.getKeyDown('KeyP')) cmd.togglePause();
    if (kb.getKeyDown('KeyF')) cmd.finishGame();
    if (kb.getKeyDown('Enter')) {
      if (phase.peek() === 'intro') cmd.startGame();
      else if (phase.peek() === 'finished') cmd.playAgain();
    }
  }
}
