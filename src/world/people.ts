/**
 * Stylized people (public/models/people.glb, scripts/assets/build_people.py):
 * Mira and four adults plus a seated rider, soft and rounded, coloured per
 * vertex. Clones share geometry and material. Null when not loaded (callers
 * keep their procedural fallback).
 */
import { AssetManager, BufferAttribute, Group, type BufferGeometry, type Mesh, type Object3D } from '@iwsdk/core';

export const PEOPLE_ASSET = 'people';
export const ADULT_VARIANTS = 4;

let scene: Object3D | null | undefined;
const shared = new WeakSet<object>();

function dequantize(geo: BufferGeometry): void {
  for (const name of Object.keys(geo.attributes)) {
    const a = geo.attributes[name] as BufferAttribute;
    if (a.array instanceof Float32Array) continue;
    const out = new Float32Array(a.count * a.itemSize);
    for (let i = 0; i < a.count; i++) for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.getComponent(i, k);
    geo.setAttribute(name, new BufferAttribute(out, a.itemSize));
  }
}

function peopleScene(): Object3D | null {
  if (scene) return scene;
  let s: Object3D | null = null;
  try {
    s = AssetManager.getGLTF(PEOPLE_ASSET)?.scene ?? null;
  } catch {
    s = null;
  }
  if (!s) return null;
  s.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    dequantize(m.geometry);
    shared.add(m.geometry);
    shared.add(m.material as object);
  });
  return (scene = s);
}

/** True for people geometry / material, which callers must never dispose. */
export function isPeopleResource(r: object | null | undefined): boolean {
  return !!r && shared.has(r);
}

/** A fresh wrapper around a clone of the named figure ('mira', 'adult-0'..'adult-3', 'rider'). */
export function personModel(name: string): Group | null {
  const src = peopleScene()?.getObjectByName(name);
  if (!src) return null;
  const g = new Group();
  const c = src.clone();
  c.traverse((o) => {
    o.raycast = () => {};
    if ((o as Mesh).isMesh) o.castShadow = true;
  });
  g.add(c);
  return g;
}
