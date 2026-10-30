/**
 * Player commands shared by every input path (keyboard, spatial panel buttons,
 * tray taps). Each one ends in a GameState action, a view change, or a
 * challenge transition.
 */
import { YEARS, type Year } from '../config/projection.js';
import { StructureType } from '../config/scenario.js';
import { STRUCTURES } from '../config/structures.js';
import { projectYear } from '../simulation/projection.js';
import { nextViewpoint } from '../world/street-view.js';
import {
  armedType,
  challenge,
  coachText,
  compareOpen,
  game,
  paused,
  phase,
  planA,
  result,
  selectedId,
  statusText,
  streetView,
  timeLeft,
  tutorial,
  viewYear,
} from './session.js';

const PLAN_A_KEY = 'terracity.planA.v1';

/** Editing is allowed only while building and viewing 2026. */
export function canEdit(): boolean {
  if (phase.peek() !== 'building') {
    statusText.value = phase.peek() === 'intro' ? 'Press Start to begin planning.' : 'Plan submitted. Play again to edit.';
    return false;
  }
  if (viewYear.peek() !== 2026) {
    statusText.value = `Viewing ${viewYear.peek()}. Return to 2026 to change the plan.`;
    return false;
  }
  if (streetView.peek()) {
    statusText.value = 'Return to the tabletop to change the plan.';
    return false;
  }
  return true;
}

/** Arm a type for tap placement. `toggle` (tray taps) disarms when re-tapped. */
export function arm(type: StructureType, toggle = false): void {
  if (!canEdit()) return;
  selectedId.value = null;
  armedType.value = toggle && armedType.peek() === type ? null : type;
}

export function clearSelection(): void {
  selectedId.value = null;
  armedType.value = null;
}

function requireSelection(): string | null {
  const sel = selectedId.peek();
  if (!sel || !game.get(sel)) {
    statusText.value = 'Select a structure first (tap its tile).';
    return null;
  }
  return sel;
}

export function rotateSelected(): void {
  if (!canEdit()) return;
  const sel = requireSelection();
  if (sel) game.rotate(sel);
}

export function removeSelected(): void {
  if (!canEdit()) return;
  const sel = requireSelection();
  if (!sel) return;
  selectedId.value = null;
  game.remove(sel);
}

export function undo(): void {
  if (!canEdit()) return;
  clearSelection();
  game.undo();
}

export function redo(): void {
  if (!canEdit()) return;
  clearSelection();
  game.redo();
}

export function restart(): void {
  if (!canEdit()) return;
  clearSelection();
  game.reset();
  statusText.value = 'Fresh start. Pinch a structure from the tray.';
}

export function describeArmed(type: StructureType): string {
  const s = STRUCTURES[type];
  return `${s.label} ready (cost ${s.cost}). Tap a tile to build.`;
}

// ------------------------------------------------------------ time travel --

export function setYear(year: Year): void {
  if (phase.peek() === 'intro') return;
  clearSelection();
  viewYear.value = year;
  if (year === 2026) {
    statusText.value = '2026: your plan today. Build and edit here.';
    return;
  }
  const y = projectYear(game.terrain, game.placements, year);
  statusText.value = `${year}: ${y.notes.join('; ')}.`;
}

export function nextYear(): void {
  const i = YEARS.indexOf(viewYear.peek());
  setYear(YEARS[(i + 1) % YEARS.length]);
}

// ---------------------------------------------------------- plan A and B --

export function savePlanA(): void {
  if (phase.peek() !== 'building') return;
  const snapshot = game.placements.map((p) => ({ ...p }));
  planA.value = snapshot;
  try {
    localStorage.setItem(PLAN_A_KEY, JSON.stringify(snapshot));
  } catch {
    /* storage unavailable: Plan A stays in memory for this session */
  }
  statusText.value = `Plan A saved (${snapshot.length} pieces). Change the map to make Plan B, then Compare.`;
}

export function restorePlanA(): void {
  const a = planA.peek();
  if (!a || !canEdit()) {
    if (!a) statusText.value = 'No Plan A saved yet.';
    return;
  }
  clearSelection();
  game.load(a, 'Plan A');
}

export function toggleCompare(): void {
  if (!planA.peek()) {
    statusText.value = 'Save Plan A first, then change the map to build Plan B.';
    return;
  }
  clearSelection();
  compareOpen.value = !compareOpen.peek();
}

/** Restore a Plan A saved in an earlier visit (per-browser convenience). */
export function loadStoredPlanA(): void {
  try {
    const raw = localStorage.getItem(PLAN_A_KEY);
    if (raw) planA.value = JSON.parse(raw);
  } catch {
    /* ignore corrupt or blocked storage */
  }
}

// -------------------------------------------------------------- challenge --

let tutorialFinished = false;

/** Re-evaluate the coach after any state change. */
export function updateTutorial(): void {
  if (!tutorial.active) return;
  tutorial.update({ placements: game.placements, servedIds: game.metrics.servedIds, viewYear: viewYear.peek() });
  if (!tutorial.active) tutorialFinished = true;
  coachText.value = phase.peek() === 'building' ? tutorial.text : '';
}

export function toggleTips(): void {
  if (tutorial.active) {
    tutorial.skip();
    tutorialFinished = true;
  } else {
    tutorial.reset();
    tutorialFinished = false;
  }
  updateTutorial();
  coachText.value = phase.peek() === 'building' ? tutorial.text : '';
}

export function startGame(): void {
  clearSelection();
  game.reset();
  // Tips run on the first session (and again if the player turns them back on).
  if (!tutorialFinished) tutorial.reset();
  challenge.start();
  phase.value = 'building';
  timeLeft.value = challenge.timeLeft;
  result.value = null;
  viewYear.value = 2026;
  compareOpen.value = false;
  paused.value = false;
  statusText.value = 'Plan Costa Verde for 2050. Pinch a structure from the tray.';
  updateTutorial();
}

export function finishGame(timedOut = false): void {
  if (phase.peek() !== 'building') return;
  clearSelection();
  const r = timedOut ? challenge.result! : challenge.finish(false);
  result.value = r;
  phase.value = 'finished';
  compareOpen.value = false;
  viewYear.value = 2050;
  statusText.value = r.success ? 'Your plan meets every 2050 target!' : 'Your 2050 projection misses some targets.';
}

export function playAgain(): void {
  challenge.replay();
  phase.value = 'intro';
  result.value = null;
  viewYear.value = 2026;
  compareOpen.value = false;
  timeLeft.value = challenge.timeLeft;
  statusText.value = 'Press Start to begin planning.';
}

export function togglePause(): void {
  if (phase.peek() !== 'building') return;
  paused.value = !paused.peek();
  statusText.value = paused.peek() ? 'Paused. Press Resume to continue.' : 'Resumed.';
}

/** Called every frame by the flow system. The clock stops while visiting a street. */
export function tickClock(seconds: number): void {
  if (phase.peek() !== 'building' || paused.peek() || streetView.peek()) return;
  const ended = challenge.tick(seconds);
  const whole = Math.ceil(challenge.timeLeft);
  if (whole !== timeLeft.peek()) timeLeft.value = whole;
  if (ended) finishGame(true);
}

// ----------------------------------------------------- enter your city --

/** The district to visit: the selected homes, else the first one planned. */
export function streetTarget(): string | null {
  const sel = selectedId.peek();
  const plan = game.placements;
  if (sel && plan.some((p) => p.id === sel && p.type === StructureType.Residential)) return sel;
  return plan.find((p) => p.type === StructureType.Residential)?.id ?? null;
}

export function enterCity(): void {
  if (streetView.peek()) return;
  const id = streetTarget();
  if (!id) {
    statusText.value = 'Place a Homes neighbourhood first, then enter it.';
    return;
  }
  compareOpen.value = false;
  clearSelection();
  streetView.value = { id, viewpoint: 0, plan: 'B' };
  statusText.value = 'You are in your neighbourhood. Move between viewpoints, or return to the tabletop.';
}

export function exitCity(): void {
  if (!streetView.peek()) return;
  streetView.value = null;
  statusText.value = 'Back at the tabletop.';
}

export function stepViewpoint(step: number): void {
  const v = streetView.peek();
  if (!v) return;
  streetView.value = { ...v, viewpoint: nextViewpoint(v.viewpoint, step) };
}

export function gotoViewpoint(i: number): void {
  const v = streetView.peek();
  if (v && v.viewpoint !== i) streetView.value = { ...v, viewpoint: i };
}

/** Street comparison: show the same place under Plan A or Plan B (the current map). */
export function setStreetPlan(plan: 'A' | 'B'): void {
  const v = streetView.peek();
  if (!v || v.plan === plan) return;
  if (plan === 'A' && !planA.peek()) {
    statusText.value = 'Save Plan A on the tabletop first, then change the map to make Plan B.';
    return;
  }
  // Comparing futures: 2026 is the same for both plans, so show 2050.
  if (viewYear.peek() === 2026) viewYear.value = 2050;
  streetView.value = { ...v, plan };
  statusText.value = plan === 'A' ? 'Plan A in the same place.' : 'Plan B (your current map) in the same place.';
}
