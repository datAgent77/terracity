/** Materials shared by many models and restyled by time travel (glow, drying). */
import { MeshStandardMaterial } from '@iwsdk/core';

export const SOLAR_GLASS = new MeshStandardMaterial({
  color: '#132f63',
  roughness: 0.18,
  metalness: 0.4,
  emissive: '#1f56b8',
  emissiveIntensity: 0.12,
});
/** Park tree crowns (shared; time travel tints them with the environment). */
export const LEAF_CROWN = new MeshStandardMaterial({ color: '#5a9b45', flatShading: true, roughness: 0.9 });
