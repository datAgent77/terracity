/** Maps game events to sound effects. No per-frame work. */
import { createSystem } from '@iwsdk/core';
import { YEARS } from '../config/projection.js';
import { game, planA, result, viewYear } from '../core/session.js';
import { sfx, unlockAudio } from './sfx.js';

export class AudioSystem extends createSystem({}) {
  init(): void {
    unlockAudio();
    let lastServed = 0;
    let lastYear = viewYear.peek();
    let first = true;
    this.cleanupFuncs.push(
      game.on((e) => {
        if (e.kind === 'rejected') return sfx.reject();
        if (e.action === 'add' || e.action === 'move' || e.action === 'rotate') sfx.place();
        else if (e.action === 'remove') sfx.remove();
        else if (e.action === 'undo' || e.action === 'redo' || e.action === 'load') sfx.undo();
        const served = e.metrics.servedIds.size;
        if (served > lastServed && e.action !== 'undo') sfx.connect();
        lastServed = served;
      }),
      viewYear.subscribe((y) => {
        if (y !== lastYear && !first) sfx.timeTravel(YEARS.indexOf(y) > YEARS.indexOf(lastYear));
        lastYear = y;
      }),
      planA.subscribe((a) => {
        if (a && !first) sfx.saved();
      }),
      result.subscribe((r) => {
        if (r) (r.success ? sfx.win : sfx.lose)();
      }),
    );
    first = false;
  }
}
