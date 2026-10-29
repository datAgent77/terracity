/**
 * Shared materials and colours for the Mediterranean diorama.
 *
 * Most static geometry is drawn with ONE vertex-coloured material: each part is
 * "painted" by writing its colour into a `color` attribute, and `mergeStatic`
 * then bakes a whole model into a single mesh (one draw call per model).
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  Mesh,
  MeshStandardMaterial,
} from '@iwsdk/core';

export const COLORS = {
  plaster: ['#f8f3e6', '#f3ead8', '#fbf7ee', '#efe2c8', '#f6eadf'],
  terracotta: ['#c65f37', '#d4703f', '#b9532f', '#cf6a45'],
  shutter: ['#3f8f8b', '#3b6ea5', '#5b8f4e', '#9c6b3a'],
  window: '#2c3a40',
  door: '#6e4426',
  wood: '#8a5a35',
  stone: '#cbbfa8',
  stoneDark: '#9e927c',
  sand: '#ecd9a6',
  earth: '#9a7550',
  earthDark: '#6f5238',
  grass: ['#7fb85a', '#8cc063', '#74ad52'],
  leaf: ['#4f8f3f', '#5c9b44', '#3f7d3a', '#6ea94c'],
  olive: ['#8f9d63', '#7f8f58', '#9aa66d'],
  pine: ['#2f6a43', '#356f3f', '#2b5f3b'],
  cypress: '#2e5a3a',
  trunk: '#6b4a2f',
  asphalt: '#53575d',
  sidewalk: '#d9d0bf',
  marking: '#f4efe2',
  white: '#f4f6f8',
  steel: '#c5ccd3',
  pool: '#58c9d6',
  flowers: ['#e7708a', '#f2c94c', '#a98bd8', '#f08a4b'],
} as const;

/** The single painted material used by merged static models. */
export const PAINTED = new MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
/** Painted + flat shading: foliage and rocks read better faceted. */
export const PAINTED_FLAT = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });

const tmp = new Color();

/** Write a uniform colour into a geometry's `color` attribute (in place). */
export function paint<T extends BufferGeometry>(geo: T, color: string): T {
  tmp.set(color);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = tmp.r;
    arr[i * 3 + 1] = tmp.g;
    arr[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new BufferAttribute(arr, 3));
  return geo;
}

/** A painted box mesh positioned by its base centre (y = bottom). */
export function block(
  w: number,
  h: number,
  d: number,
  color: string,
  x = 0,
  y = 0,
  z = 0,
  rotY = 0,
  flat = false,
): Mesh {
  const m = new Mesh(paint(new BoxGeometry(w, h, d), color), flat ? PAINTED_FLAT : PAINTED);
  m.position.set(x, y + h / 2, z);
  m.rotation.y = rotY;
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** A painted mesh from any geometry. */
export function painted(geo: BufferGeometry, color: string, flat = false): Mesh {
  const m = new Mesh(paint(geo, color), flat ? PAINTED_FLAT : PAINTED);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export const pick = <T>(list: readonly T[], r: number): T => list[Math.floor(r * list.length) % list.length];
