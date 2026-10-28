import { DirectionalLight, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { FlowSystem } from './gameplay/flow-system.js';
import { PlacementSystem } from './interactions/placement-system.js';
import { FlowPanelSystem } from './ui/flow-panels.js';
import { PanelSystem } from './ui/panel-system.js';
import { FeedbackSystem } from './world/feedback-system.js';
import { FutureSystem } from './world/future-system.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  // Soft key light for the diorama's miniature shadows.
  const sun = new DirectionalLight('#fff4e0', 0.9);
  sun.position.set(0.6, 2.2, 0.4);
  world.createTransformEntity(sun);

  // Order matters: PlacementSystem builds the board the others decorate.
  world.registerSystem(PlacementSystem);
  world.registerSystem(FutureSystem);
  world.registerSystem(FeedbackSystem);
  world.registerSystem(PanelSystem);
  world.registerSystem(FlowPanelSystem);
  world.registerSystem(FlowSystem);
});
