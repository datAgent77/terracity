/** Shared singletons for the running app: game state plus UI-facing signals. */
import { signal } from '@iwsdk/core';
import type { Year } from '../config/projection.js';
import type { StructureType } from '../config/scenario.js';
import { Challenge, type ChallengeResult, type Phase } from '../gameplay/challenge.js';
import { Tutorial } from '../gameplay/tutorial.js';
import type { Placement } from '../simulation/metrics.js';
import { GameState } from './game-state.js';

export const game = new GameState();
export const challenge = new Challenge(game.terrain, () => game.placements);

/** Short cause → consequence line shown on the HUD. */
export const statusText = signal('Pinch a structure from the tray and drop it on the map.');
/** Id of the placed structure currently selected for tap/keyboard actions. */
export const selectedId = signal<string | null>(null);
/** Structure type armed for tap/click placement (desktop + ray path). */
export const armedType = signal<StructureType | null>(null);
/** Bumped on every plan change so UI can refresh (metrics, undo/redo state). */
export const planVersion = signal(0);

/** Year the diorama and HUD are showing. Editing is only allowed in 2026. */
export const viewYear = signal<Year>(2026);
/** Saved Plan A (snapshot of placements), or null. */
export const planA = signal<readonly Placement[] | null>(null);
/** Whether the A/B comparison is open. */
export const compareOpen = signal(false);
/** Challenge phase, remaining seconds (whole), and final result. */
export const phase = signal<Phase>('intro');
export const timeLeft = signal(challenge.timeLeft);
export const result = signal<ChallengeResult | null>(null);
/** Paused (e.g. headset removed / overlay open). */
export const paused = signal(false);
/** Causality Vision: show why outcomes changed (rings on affected tiles, explanation card). */
export const causalityOn = signal(false);
/** Information layer 3 (full metrics, all planning controls, settings, detailed street story) is open. */
export const detailsOpen = signal(false);
/** "Sculpt time": continuous time progress (0..1) while the dial is turned (null = not scrubbing). */
export const timeScrub = signal<number | null>(null);
/** "Split reality": two futures held side by side (null = one world on the table). */
export const futuresOpen = signal<{ selected: 'A' | 'B' | null } | null>(null);
/** "Enter your city": the garden district being visited at street level (null = tabletop). */
export const streetView = signal<{
  id: string;
  /** The visited tile. */
  col: number;
  row: number;
  viewpoint: number;
  /** Which plan the street is built from: Plan A, the current map (B), or nobody planning. */
  plan: 'A' | 'B' | 'none';
  /** Set when entered from Split reality ("Future A: Your plan"). */
  title?: string;
} | null>(null);

/** Guided tips for the first session. */
export const tutorial = new Tutorial();
/** Current coach line ('' when tips are finished or skipped). */
export const coachText = signal(tutorial.text);
/** A conversation with Mira was had (and ended) during the current street visit (first-five-minutes step 5). */
export const miraTalked = signal(false);
/** The closing card of the first five minutes ("The future isn't written. It's built."). */
export const outroOpen = signal(false);
