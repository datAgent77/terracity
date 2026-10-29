import { DirectionalLight, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { AudioSystem } from './audio/audio-system.js';
import { FlowSystem } from './gameplay/flow-system.js';
import { TutorialSystem } from './gameplay/tutorial-system.js';
import { HoverSystem } from './interactions/hover-system.js';
import { PlacementSystem } from './interactions/placement-system.js';
import { FlowPanelSystem } from './ui/flow-panels.js';
import { PanelSystem } from './ui/panel-system.js';
import { AmbientSystem } from './world/ambient-system.js';
import { FeedbackSystem } from './world/feedback-system.js';
import { FutureSystem } from './world/future-system.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  // Soft key light for the diorama's miniature shadows.
  const sun = new DirectionalLight('#ffe6c4', 1.15); // warm, low Mediterranean sun
  sun.position.set(0.6, 2.2, 0.4);
  world.createTransformEntity(sun);

  // Order matters: PlacementSystem builds the board the others decorate.
  world.registerSystem(PlacementSystem);
  world.registerSystem(HoverSystem);
  world.registerSystem(FutureSystem);
  world.registerSystem(FeedbackSystem);
  world.registerSystem(AmbientSystem);
  world.registerSystem(PanelSystem);
  world.registerSystem(FlowPanelSystem);
  world.registerSystem(FlowSystem);
  world.registerSystem(AudioSystem);
  world.registerSystem(TutorialSystem);

  // Test/debug hook: renderer cost of the last frame (draw calls, triangles).
  const hook = ((window as unknown as Record<string, unknown>).__terracity ??= {}) as Record<string, unknown>;
  hook.renderStats = () => {
    const { calls, triangles } = world.renderer.info.render;
    const { geometries, textures } = world.renderer.info.memory;
    let objects = 0;
    let meshes = 0;
    world.scene.traverse((o) => {
      objects++;
      if ((o as { isMesh?: boolean }).isMesh) meshes++;
    });
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return { calls, triangles, geometries, textures, objects, meshes, jsHeapMB: mem ? Math.round(mem.usedJSHeapSize / 1048576) : null };
  };
});
