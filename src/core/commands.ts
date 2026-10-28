/**
 * Player commands shared by every input path (keyboard, spatial panel buttons,
 * tray taps). Each one ends in a GameState action or a selection change.
 */
import type { StructureType } from '../config/scenario.js';
import { STRUCTURES } from '../config/structures.js';
import { armedType, game, selectedId, statusText } from './session.js';

export function arm(type: StructureType): void {
  selectedId.value = null;
  armedType.value = armedType.peek() === type ? null : type;
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
  const sel = requireSelection();
  if (sel) game.rotate(sel);
}

export function removeSelected(): void {
  const sel = requireSelection();
  if (!sel) return;
  selectedId.value = null;
  game.remove(sel);
}

export function undo(): void {
  clearSelection();
  game.undo();
}

export function redo(): void {
  clearSelection();
  game.redo();
}

export function restart(): void {
  clearSelection();
  game.reset();
  statusText.value = 'Fresh start. Pinch a structure from the tray.';
}

export function describeArmed(type: StructureType): string {
  const s = STRUCTURES[type];
  return `${s.label} ready (cost ${s.cost}). Tap a tile to build.`;
}
