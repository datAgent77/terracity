import { DirectionalLight, Vector3, World } from '@iwsdk/core';
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
import { OutcomeSystem } from './world/outcome-system.js';
import { StreetSystem } from './world/street-system.js';

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
  world.registerSystem(OutcomeSystem);
  world.registerSystem(FeedbackSystem);
  world.registerSystem(AmbientSystem);
  world.registerSystem(PanelSystem);
  world.registerSystem(FlowPanelSystem);
  world.registerSystem(StreetSystem);
  world.registerSystem(FlowSystem);
  world.registerSystem(AudioSystem);
  world.registerSystem(TutorialSystem);

  // Test/debug hook: renderer cost of the last frame (draw calls, triangles).
  const hook = ((window as unknown as Record<string, unknown>).__terracity ??= {}) as Record<string, unknown>;
  hook.programs = () =>
    ((world.renderer.info as unknown as { programs?: Array<{ name: string; cacheKey: string }> }).programs ?? []).map(
      (p) => `${p.name}|${p.cacheKey}`,
    );
  /** Debug: materials in the scene that have not been compiled yet. */
  hook.uncompiled = () => {
    const props = (world.renderer as unknown as { properties: { get(m: object): { currentProgram?: unknown } } }).properties;
    const out: string[] = [];
    world.scene.traverse((o) => {
      const mat = (o as { material?: { type: string; name?: string } | Array<{ type: string }> }).material;
      if (!mat || Array.isArray(mat)) return;
      if (!props.get(mat).currentProgram) out.push(`${o.name || o.type}:${mat.type}`);
    });
    return out;
  };
  /** Debug (visual review): place the desktop camera (player-local coords). */
  hook.setCamera = (pos: [number, number, number], target: [number, number, number]) => {
    world.camera.position.set(...pos);
    world.camera.lookAt(...target);
  };
  hook.cameraWorld = () => world.camera.getWorldPosition(new Vector3()).toArray();
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
