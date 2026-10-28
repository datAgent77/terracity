/** Shared singletons for the running app: game state plus UI-facing signals. */
import { signal } from '@iwsdk/core';
import { GameState } from './game-state.js';

export const game = new GameState();

/** Short cause → consequence line shown on the HUD. */
export const statusText = signal('Pinch the houses and drop them on the map.');
/** Id of the structure currently selected for tap/keyboard placement. */
export const selectedId = signal<string | null>(null);
