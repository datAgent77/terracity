// Prints the structure and size breakdown of a GLB (nodes, attributes, images).
import { readFileSync } from 'node:fs';
const buf = readFileSync(process.argv[2]);
const jsonLen = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString());
const acc = gltf.accessors;
const view = (i) => gltf.bufferViews[i].byteLength;
console.log('file', buf.length, 'bytes');
for (const n of gltf.nodes) {
  const m = gltf.meshes[n.mesh];
  for (const p of m.primitives) {
    const attrs = Object.entries(p.attributes).map(([k, a]) => `${k}:${acc[a].componentType}x${acc[a].type}(${view(acc[a].bufferView)}B)`);
    console.log(n.name, 'verts', acc[p.attributes.POSITION].count, 'tris', acc[p.indices].count / 3, attrs.join(' '), 'idx', view(acc[p.indices].bufferView) + 'B');
  }
}
for (const im of gltf.images ?? []) console.log('image', im.name, im.mimeType, view(im.bufferView), 'B');
console.log('materials', JSON.stringify(gltf.materials));
