import { DirectionalLight, NeutralToneMapping, Vector3, World } from '@iwsdk/core';
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
import { SplitSystem } from './world/split-system.js';
import { CausalitySystem } from './world/causality-system.js';
import { TimeDialSystem } from './world/time-dial-system.js';
import { StreetSystem } from './world/street-system.js';
import { QUALITY, QUALITY_SETTINGS } from './config/quality.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  // Filmic tone mapping: the HDR image-based light (Poly Haven sky, CC0) and the
  // warm sun roll off into rich highlights instead of flat clipped colour.
  world.renderer.toneMapping = NeutralToneMapping;
  world.renderer.toneMappingExposure = 0.92;
  // Split Reality clips each future to its half of the table while they part.
  world.renderer.localClippingEnabled = true;
  // Quality preset (?quality=low on a headset that drops frames; see config/quality.ts).
  const q = QUALITY_SETTINGS[QUALITY];
  if (q.xrFramebufferScale !== 1) world.renderer.xr.setFramebufferScaleFactor(q.xrFramebufferScale);
  if (q.foveation !== null) world.renderer.xr.setFoveation(q.foveation);
  // Soft key light for the diorama's miniature shadows.
  const sun = new DirectionalLight('#ffe0b0', 1.7); // warm, low Mediterranean sun
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
  world.registerSystem(SplitSystem);
  world.registerSystem(CausalitySystem);
  world.registerSystem(TimeDialSystem);
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
  hook.rendererInfo = () => ({
    toneMapping: world.renderer.toneMapping,
    exposure: world.renderer.toneMappingExposure,
    env: !!world.scene.environment,
    shadows: world.renderer.shadowMap.enabled,
    pixelRatio: world.renderer.getPixelRatio(),
    quality: QUALITY,
    shadowMapSize: QUALITY_SETTINGS[QUALITY].shadowMapSize,
  });
  /**
   * Debug (Milestone G performance audit): what the visible scene asks of the
   * GPU — unique materials, transparent draws (overdraw risk), texture memory
   * (uncompressed RGBA + mips, an upper estimate), shadow setup, shader programs.
   */
  /** Debug: every texture the renderer holds (leak checks), by name / size / kind. */
  hook.liveTextures = () => {
    const out: string[] = [];
    world.scene.traverse((o) => {
      const m = (o as { material?: Record<string, unknown> | Array<Record<string, unknown>> }).material;
      for (const mat of m ? (Array.isArray(m) ? m : [m]) : []) {
        for (const v of Object.values(mat)) {
          const t = v as { isTexture?: boolean; isCanvasTexture?: boolean; uuid: string; image?: { width?: number } } | null;
          if (t?.isTexture) out.push(`${o.name || o.type}:${t.isCanvasTexture ? 'canvas' : 'img'}:${t.image?.width}:${t.uuid.slice(0, 6)}`);
        }
      }
    });
    return [...new Set(out)];
  };
  hook.gpuBudget = () => {
    const mats = new Set<object>();
    const texs = new Map<object, number>();
    let transparent = 0;
    const tnames = new Map<string, number>();
    let casters = 0;
    let visibleMeshes = 0;
    world.scene.traverseVisible((o) => {
      const m = o as unknown as { isMesh?: boolean; castShadow?: boolean; material?: Record<string, unknown> | Array<Record<string, unknown>> };
      if (!m.isMesh || !m.material) return;
      visibleMeshes++;
      if (m.castShadow) casters++;
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        mats.add(mat);
        if (mat.transparent) {
          transparent++;
          type Named = { name?: string; parent?: Named | null };
          let a: Named | null = o as unknown as Named;
          while (a && !a.name) a = a.parent ?? null;
          const k = a?.name || 'mesh';
          tnames.set(k, (tnames.get(k) ?? 0) + 1);
        }
        for (const v of Object.values(mat)) {
          const t = v as { isTexture?: boolean; image?: { width?: number; height?: number } } | null;
          if (t?.isTexture && t.image?.width && t.image.height) texs.set(t, t.image.width * t.image.height * 4 * 1.33);
        }
      }
    });
    const textureMB = [...texs.values()].reduce((a, b) => a + b, 0) / 1048576;
    const programs = ((world.renderer.info as unknown as { programs?: unknown[] }).programs ?? []).length;
    return {
      visibleMeshes,
      materials: mats.size,
      transparentDraws: transparent,
      textures: texs.size,
      textureMB: Math.round(textureMB * 10) / 10,
      shadows: world.renderer.shadowMap.enabled,
      shadowCasters: casters,
      programs,
      transparentTop: [...tnames.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8),
    };
  };
  /** Debug: visible triangles per top-level named object (instanced counts included). */
  hook.triBreakdown = () => {
    const out: Record<string, number> = {};
    world.scene.traverseVisible((o) => {
      const m = o as unknown as { isMesh?: boolean; geometry?: { index: { count: number } | null; attributes: { position: { count: number } } }; count?: number; isInstancedMesh?: boolean; name: string; parent: { name: string } | null };
      if (!m.isMesh || !m.geometry) return;
      const t = (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
      const n = m.isInstancedMesh ? (m.count ?? 1) : 1;
      const key = m.name || m.parent?.name || 'mesh';
      out[key] = (out[key] ?? 0) + Math.round(t * n);
    });
    return Object.entries(out).sort((a, b) => b[1] - a[1]).slice(0, 12);
  };
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
