import { DirectionalLight, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { PlacementSystem } from './interactions/placement-system.js';
import { PanelSystem } from './panel.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  // Soft key light for the diorama's miniature shadows.
  const sun = new DirectionalLight('#fff4e0', 0.9);
  sun.position.set(0.6, 2.2, 0.4);
  world.createTransformEntity(sun);

  world.registerSystem(PlacementSystem);
  world.registerSystem(PanelSystem);
});
