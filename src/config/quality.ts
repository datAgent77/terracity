/**
 * Quality preset (CAUSALITY G). `high` is the default and what every test and
 * capture uses. `low` is a lever for on-headset validation (see
 * docs/QUEST_VALIDATION_CHECKLIST.md): if a Quest drops frames, compare the
 * same path with `?quality=low` before changing content. It halves the sun's
 * shadow map and uses a cheaper filter, renders XR at 85 % resolution and asks
 * for strong fixed foveation. Nothing gameplay-related changes.
 */
export type Quality = 'high' | 'low';

export function qualityFromUrl(search: string): Quality {
  return new URLSearchParams(search).get('quality') === 'low' ? 'low' : 'high';
}

export const QUALITY: Quality = typeof location === 'undefined' ? 'high' : qualityFromUrl(location.search);

export const QUALITY_SETTINGS: Record<Quality, { shadowMapSize: number; softShadows: boolean; xrFramebufferScale: number; foveation: number | null }> = {
  high: { shadowMapSize: 2048, softShadows: true, xrFramebufferScale: 1, foveation: null },
  low: { shadowMapSize: 1024, softShadows: false, xrFramebufferScale: 0.85, foveation: 1 },
};
