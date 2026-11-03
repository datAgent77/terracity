/**
 * Player commands shared by every input path (keyboard, spatial panel buttons,
 * tray taps). Each one ends in a GameState action, a view change, or a
 * challenge transition.
 */
import { YEARS, type Year } from '../config/projection.js';
import { StructureType } from '../config/scenario.js';
import { STRUCTURES } from '../config/structures.js';
import { projectYear } from '../simulation/projection.js';
import { futurePair } from '../world/futures.js';
import { GARDEN_VIEWPOINT, nextViewpoint } from '../world/street-view.js';
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
  futuresOpen,
  causalityOn,
  miraTalked,
  outroOpen,
  planVersion,
  streetView,
  timeLeft,
  tutorial,
  viewYear,
} from './session.js';

import { LEGACY_PLAN_A_KEY, parseSaved, SAVE_KEY, serialize } from './persistence.js';
import type { Placement } from '../simulation/metrics.js';

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
  if (futuresOpen.peek()) {
    statusText.value = 'Merge the two futures to change the plan.';
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
  persist();
  statusText.value = `Plan saved (${snapshot.length} pieces). Keep changing your plan, then compare it with the saved one.`;
}

export function restorePlanA(): void {
  const a = planA.peek();
  if (!a || !canEdit()) {
    if (!a) statusText.value = 'No saved plan yet.';
    return;
  }
  clearSelection();
  game.load(a, 'The saved plan');
}

export function toggleCompare(): void {
  if (!planA.peek()) {
    statusText.value = 'Save your plan first, then change it and compare.';
    return;
  }
  clearSelection();
  compareOpen.value = !compareOpen.peek();
}

/** The current map saved in an earlier visit, restored when the first session starts. */
let savedCurrent: Placement[] | null = null;

/**
 * Load Plan A and the current map saved in an earlier visit (validated as a
 * whole; a corrupt save is ignored). Plan A is available at once, the map is
 * restored when the session starts.
 */
export function loadStoredPlanA(): void {
  let raw: string | null = null;
  let legacy: string | null = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
    legacy = localStorage.getItem(LEGACY_PLAN_A_KEY);
  } catch {
    return; // storage blocked
  }
  const s = parseSaved(game.terrain, raw, legacy);
  if (!s) return;
  if (s.planA) planA.value = s.planA;
  savedCurrent = s.current.length ? s.current : null;
}

/** Save Plan A and the current map (only while a session is running). */
export function persist(): void {
  if (phase.peek() === 'intro') return;
  try {
    localStorage.setItem(SAVE_KEY, serialize(planA.peek(), game.placements));
  } catch {
    /* storage unavailable: everything stays in memory for this session */
  }
}

// -------------------------------------------------------------- challenge --

let tutorialFinished = false;

/** Re-evaluate the coach after any state change. */
export function updateTutorial(): void {
  if (!tutorial.active) return;
  const v = streetView.peek();
  tutorial.update({
    placements: game.placements,
    servedIds: game.metrics.servedIds,
    viewYear: viewYear.peek(),
    inStreet: !!v,
    futuresOpen: !!futuresOpen.peek(),
    causalityOn: causalityOn.peek(),
    streetPlan: v?.plan ?? null,
    talked: miraTalked.peek(),
    planVersion: planVersion.peek(),
  });
  if (!tutorial.active) {
    tutorialFinished = true;
    // Completed by the player (not skipped): the closing card.
    if (tutorial.completed) {
      outroOpen.value = true;
      statusText.value = "The future isn't written. It's built. Return to the tabletop to keep planning.";
    }
  }
  coachText.value = phase.peek() === 'building' ? tutorial.text : '';
}

export function toggleTips(): void {
  if (tutorial.active) {
    tutorial.skip();
    tutorialFinished = true;
  } else {
    tutorial.reset(planVersion.peek());
    tutorialFinished = false;
  }
  updateTutorial();
  coachText.value = phase.peek() === 'building' ? tutorial.text : '';
}

/**
 * Replay the first five minutes on the current plan (nothing is cleared):
 * back to one world on the tabletop; step 1 waits for a new choice.
 */
export function replayIntro(): void {
  outroOpen.value = false;
  exitCity();
  closeFutures();
  causalityOn.value = false;
  tutorial.reset(planVersion.peek());
  tutorialFinished = false;
  updateTutorial();
  statusText.value = 'Every city begins with a choice.';
}

/** Close the closing card; planning continues. */
export function closeOutro(): void {
  outroOpen.value = false;
}

/** Start without the guided journey: straight to the full planning tools. */
export function startWithoutIntro(): void {
  startGame();
  if (tutorial.active) toggleTips();
}

export function startGame(): void {
  clearSelection();
  game.reset();
  // Tips run on the first session (and again if the player turns them back on).
  if (!tutorialFinished) tutorial.reset();
  challenge.start();
  phase.value = 'building';
  if (savedCurrent) {
    game.load(savedCurrent, 'Your saved plan');
    savedCurrent = null;
    statusText.value = 'Your saved plan was restored. Clear map to start over.';
  }
  timeLeft.value = challenge.timeLeft;
  result.value = null;
  viewYear.value = 2026;
  compareOpen.value = false;
  paused.value = false;
  if (!game.placements.length) statusText.value = 'Plan Costa Verde for 2050. Pinch a structure from the tray.';
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
  if (phase.peek() !== 'building' || paused.peek() || streetView.peek() || futuresOpen.peek()) return;
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

/** In 2050 you arrive beside the little garden, where Mira lives. */
function startViewpoint(): number {
  return viewYear.peek() === 2050 ? GARDEN_VIEWPOINT : 0;
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
  const p = game.get(id)!;
  streetView.value = { id, col: p.col, row: p.row, viewpoint: startViewpoint(), plan: 'B' };
  statusText.value = 'You are in your neighbourhood. Move between viewpoints, or return to the tabletop.';
}

export function exitCity(): void {
  if (!streetView.peek()) return;
  streetView.value = null;
  statusText.value = futuresOpen.peek()
    ? 'Back at your two futures. Enter the other one, or bring your hands together to merge.'
    : 'Back at the tabletop.';
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
  if (!v || v.plan === plan || v.plan === 'none') return;
  if (plan === 'A' && !planA.peek()) {
    statusText.value = 'Save your plan on the tabletop first, then change it to compare.';
    return;
  }
  // Comparing futures: 2026 is the same for both plans, so show 2050.
  if (viewYear.peek() === 2026) viewYear.value = 2050;
  streetView.value = { ...v, plan };
  statusText.value = plan === 'A' ? 'The saved plan, in the same place.' : 'Your plan, in the same place.';
}

// ---------------------------------------------------------- split reality --

/** Pull the world apart into two futures (two-hand gesture, button or V). */
export function openFutures(): void {
  if (futuresOpen.peek() || streetView.peek() || phase.peek() === 'intro') return;
  clearSelection();
  compareOpen.value = false;
  futuresOpen.value = { selected: null };
  statusText.value = planA.peek()
    ? 'Two futures: your plan on the left, the saved plan on the right. Bring your hands together to merge.'
    : 'Two futures: your plan on the left, the same coast if nobody plans on the right. Bring your hands together to merge.';
}

export function closeFutures(): void {
  if (!futuresOpen.peek()) return;
  futuresOpen.value = null;
  // Merging closes the comparison; it never combines two plans.
  statusText.value = planA.peek()
    ? 'One world again: you are back on your plan. Plans are compared, never combined; Restore saved brings the saved plan back.'
    : 'One world again: your plan, unchanged. The other future was only a comparison.';
}

export function toggleFutures(): void {
  (futuresOpen.peek() ? closeFutures : openFutures)();
}

export function selectFuture(side: 'A' | 'B'): void {
  const f = futuresOpen.peek();
  if (!f) return;
  futuresOpen.value = { selected: f.selected === side ? null : side };
}

/**
 * Become small: enter one of the two futures at human scale. Both futures are
 * entered at the SAME place — the first neighbourhood of the current map (else
 * of that future) — so A and B can be compared on the same street.
 */
export function enterFuture(side: 'A' | 'B'): void {
  if (!futuresOpen.peek() || streetView.peek()) return;
  const a = planA.peek();
  const pair = futurePair(a, game.placements, viewYear.peek());
  // Future A is always your (current) plan; B is the saved plan or nobody planning.
  const plan: 'A' | 'B' | 'none' = side === 'A' ? 'B' : a ? 'A' : 'none';
  const homes = (ps: readonly { type: StructureType; col: number; row: number; id: string }[]) => ps.find((p) => p.type === StructureType.Residential);
  const target = homes(game.placements) ?? homes(pair[side].plan) ?? (a ? homes(a) : undefined);
  futuresOpen.value = { selected: side };
  streetView.value = {
    id: target?.id ?? '',
    col: target?.col ?? 6,
    row: target?.row ?? 4,
    viewpoint: startViewpoint(),
    plan,
    title: `Future ${side}: ${pair[side].title}`,
  };
  statusText.value = `You are inside Future ${side} (${pair[side].title}), ${pair.year}.`;
}
