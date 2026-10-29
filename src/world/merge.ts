/**
 * Draw-call reduction for procedural models: bake every static mesh of a group
 * into one merged mesh per material. Meshes for which `keep` is true (and their
 * descendants) stay separate so they can still animate or be restyled.
 */
import { BufferAttribute, BufferGeometry, Group, Matrix4, Mesh, type Material, type Object3D } from '@iwsdk/core';
// Addon not re-exported by @iwsdk/core (imports the same `three` alias).
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function mergeStatic(root: Group, keep: (o: Object3D) => boolean = () => false): Group {
  root.updateMatrixWorld(true);
  const inverseRoot = new Matrix4().copy(root.matrixWorld).invert();
  const byMaterial = new Map<Material, { geos: BufferGeometry[]; shadow: boolean }>();
  const remove: Mesh[] = [];

  const visit = (o: Object3D) => {
    if (o !== root && keep(o)) return; // keep this subtree as-is
    const mesh = o as Mesh;
    if (mesh.isMesh && !Array.isArray(mesh.material)) {
      const m = new Matrix4().multiplyMatrices(inverseRoot, mesh.matrixWorld);
      const g = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(m);
      for (const name of Object.keys(g.attributes)) {
        if (name !== 'position' && name !== 'normal' && name !== 'uv' && name !== 'color') g.deleteAttribute(name);
      }
      const entry = byMaterial.get(mesh.material) ?? { geos: [], shadow: false };
      entry.geos.push(g);
      entry.shadow ||= mesh.castShadow;
      byMaterial.set(mesh.material, entry);
      remove.push(mesh);
    }
    for (const c of [...o.children]) visit(c);
  };
  visit(root);
  if (remove.length < 2) return root; // nothing worth merging

  for (const mesh of remove) mesh.parent?.remove(mesh);
  // Drop now-empty helper groups.
  const prune = (o: Object3D) => {
    for (const c of [...o.children]) {
      prune(c);
      if (!(c as Mesh).isMesh && c.children.length === 0 && !keep(c)) o.remove(c);
    }
  };
  prune(root);

  for (const [material, { geos, shadow }] of byMaterial) {
    // mergeGeometries needs identical attribute sets: give unpainted parts white.
    if (geos.some((g) => g.attributes.color) && geos.some((g) => !g.attributes.color)) {
      for (const g of geos) {
        if (!g.attributes.color) g.setAttribute('color', new BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
      }
    }
    for (const g of geos) if (!g.attributes.uv) g.setAttribute('uv', new BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new Mesh(merged, material);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    mesh.name = 'merged';
    root.add(mesh);
  }
  return root;
}
