/**
 * Shrinks a GLB in place with KHR_mesh_quantization (read natively by three.js,
 * no decoder needed): positions 14 bit, normals 8 bit, UVs 12 bit, colours 8 bit.
 *   node scripts/assets/quantize-glb.mjs public/models/city-kit.glb
 */
import { statSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize } from '@gltf-transform/functions';

const file = process.argv[2];
const before = statSync(file).size;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(file);
await doc.transform(
  dedup(),
  prune(),
  quantize({ quantizePosition: 14, quantizeNormal: 8, quantizeTexcoord: 12, quantizeColor: 8, quantizeGeneric: 12 }),
);
await io.write(file, doc);
console.log(`${file}: ${before} -> ${statSync(file).size} bytes`);
