/** Shared singletons for the running app: game state plus UI-facing signals. */
import { signal } from '@iwsdk/core';
import type { StructureType } from '../config/scenario.js';
import { GameState } from './game-state.js';

export const game = new GameState();

/** Short cause → consequence line shown on the HUD. */
export const statusText = signal('Pinch a structure from the tray and drop it on the map.');
/** Id of the placed structure currently selected for tap/keyboard actions. */
export const selectedId = signal<string | null>(null);
/** Structure type armed for tap/click placement (desktop + ray path). */
export const armedType = signal<StructureType | null>(null);
/** Bumped on every plan change so UI can refresh (metrics, undo/redo state). */
export const planVersion = signal(0);
