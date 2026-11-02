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
/** Sound level: high / low / off. Cycled from the HUD Sound chip or with `M`. */
export const soundLevel = signal<'high' | 'low' | 'off'>('high');
/** Sound on (any level above off); kept for systems that only need on/off. */
export const soundOn = signal(true);
/** Master volume for the current level. */
export const soundGain = () => (soundLevel.peek() === 'high' ? 1 : soundLevel.peek() === 'low' ? 0.35 : 0);

export function cycleSound(): void {
  soundLevel.value = soundLevel.peek() === 'high' ? 'low' : soundLevel.peek() === 'low' ? 'off' : 'high';
  soundOn.value = soundLevel.peek() !== 'off';
}
