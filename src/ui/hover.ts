/**
 * Hover feedback for custom UIKit buttons (divs). Hand rays, controller rays,
 * fingertips and the mouse all raise pointerenter / pointerleave on UIKit
 * elements, so one helper covers every input path.
 */
type HoverTarget = {
  addEventListener(type: string, fn: () => void): void;
  removeEventListener(type: string, fn: () => void): void;
};

/** Calls `onChange(true|false)` as a pointer enters / leaves; returns a disposer. */
export function onHover(el: unknown, onChange: (hovered: boolean) => void): () => void {
  const t = el as HoverTarget | null | undefined;
  if (!t?.addEventListener) return () => {};
  const enter = () => onChange(true);
  const leave = () => onChange(false);
  t.addEventListener('pointerenter', enter);
  t.addEventListener('pointerleave', leave);
  return () => {
    t.removeEventListener('pointerenter', enter);
    t.removeEventListener('pointerleave', leave);
  };
}

/** 0..1 pulse for gentle attention cues (period ~1.4 s). */
export const pulse = (t: number) => 0.5 + 0.5 * Math.sin(t * 4.5);
