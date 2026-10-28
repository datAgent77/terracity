/** Accessibility preferences shared by systems (pure DOM checks, safe in tests). */
import { signal } from '@iwsdk/core';

let reduced: boolean | null = null;
/** Honour the OS "reduce motion" setting: skip ambient and transition animation. */
export function prefersReducedMotion(): boolean {
  if (reduced === null) {
    try {
      reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      reduced = false;
    }
  }
  return reduced;
}

/** Larger spatial text (panels scaled up). Toggled from the HUD or with `L`. */
export const largeText = signal(false);
/** Sound on/off. Toggled from the HUD or with `M`. */
export const soundOn = signal(true);
