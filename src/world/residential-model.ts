/** Placeable residential neighbourhood: a terracotta-roofed cluster on a pad. */
import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from '@iwsdk/core';
import { TILE_SIZE } from '../config/scenario.js';
import { createHouseCluster } from './board-mesh.js';

export function createResidentialModel(name: string): Group {
  const root = new Group();
  root.name = name;

  // The pad doubles as a generous grab/ray target for hands and pointers.
  const pad = new Mesh(
    new BoxGeometry(TILE_SIZE * 0.9, 0.004, TILE_SIZE * 0.9),
    new MeshStandardMaterial({ color: '#d9c7a3', roughness: 0.9 }),
  );
  pad.position.y = 0.002;
  pad.name = `${name}-pad`;
  root.add(pad);

  const cluster = createHouseCluster(
    new MeshStandardMaterial({ color: '#fbf6ea', roughness: 0.8 }),
    new MeshStandardMaterial({ color: '#d4703f', flatShading: true }),
    0,
  );
  cluster.position.y = 0.004;
  root.add(cluster);
  return root;
}
