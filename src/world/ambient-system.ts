/**
 * Ambient polish: soft shadows from the key light, a sky gradient behind the
 * diorama on desktop (transparent in mixed reality so passthrough shows), a
 * gentle shimmer on the water, and two sailboats drifting along the coast.
 */
import {
  BoxGeometry,
  CanvasTexture,
  ConeGeometry,
  createSystem,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PCFSoftShadowMap,
  SRGBColorSpace,
  VisibilityState,
} from '@iwsdk/core';
import { BOARD_CENTER, GRID_COLS, TILE_SIZE } from '../config/scenario.js';
import { prefersReducedMotion } from '../ui/accessibility.js';

const HALF_W = (GRID_COLS * TILE_SIZE) / 2;

export class AmbientSystem extends createSystem({}) {
  private water: MeshStandardMaterial | null = null;
  private boats: Object3D[] = [];
  private t = 0;

  init(): void {
    this.setupShadows();
    this.setupBackground();
    const board = this.world.scene.getObjectByName('terrain-board');
    const water = board?.getObjectByName('water-surface') as Mesh | undefined;
    this.water = (water?.material as MeshStandardMaterial) ?? null;
    if (board) {
      for (let i = 0; i < 2; i++) {
        const boat = createBoat(i);
        boat.position.set(-HALF_W + 0.1 + i * 0.4, 0.012, -0.27 + i * 0.03);
        board.add(boat);
        this.boats.push(boat);
      }
    }
  }

  update(delta: number): void {
    if (prefersReducedMotion()) return;
    this.t += delta;
    if (this.water) {
      this.water.opacity = 0.52 + 0.05 * Math.sin(this.t * 0.9);
      this.water.emissiveIntensity = 0.12 + 0.06 * Math.sin(this.t * 1.3);
    }
    this.boats.forEach((b, i) => {
      const speed = 0.012 + i * 0.006;
      let x = b.position.x + speed * delta * (i % 2 ? -1 : 1);
      if (x > HALF_W - 0.04) x = -HALF_W + 0.04;
      if (x < -HALF_W + 0.04) x = HALF_W - 0.04;
      b.position.x = x;
      b.rotation.z = 0.06 * Math.sin(this.t * 1.7 + i);
    });
  }

  private setupShadows(): void {
    const renderer = this.world.renderer;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    let sun: DirectionalLight | undefined;
    this.world.scene.traverse((o) => {
      if ((o as DirectionalLight).isDirectionalLight) sun = o as DirectionalLight;
    });
    if (!sun) return;
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.002;
    const cam = sun.shadow.camera;
    cam.left = -0.6;
    cam.right = 0.6;
    cam.top = 0.6;
    cam.bottom = -0.6;
    cam.near = 0.5;
    cam.far = 4;
    sun.target.position.set(...BOARD_CENTER);
    this.world.scene.add(sun.target);
    // Ground everything on the board in shadow.
    this.world.scene.getObjectByName('terrain-board')?.traverse((o) => {
      if ((o as Mesh).isMesh) o.receiveShadow = true;
    });
  }

  private setupBackground(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 2;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, '#bfe0ee');
    g.addColorStop(0.6, '#eaf2ef');
    g.addColorStop(1, '#f4ecdf');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 2, 256);
    const sky = new CanvasTexture(canvas);
    sky.colorSpace = SRGBColorSpace;
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((v) => {
        // Mixed reality: keep the background clear so passthrough shows.
        this.world.scene.background = v === VisibilityState.NonImmersive ? sky : null;
      }),
    );
  }
}

function createBoat(variant: number): Group {
  const boat = new Group();
  boat.name = `sailboat-${variant}`;
  const hull = new Mesh(new BoxGeometry(0.022, 0.005, 0.008), new MeshStandardMaterial({ color: variant ? '#2f5d8a' : '#b8573a' }));
  const sail = new Mesh(new ConeGeometry(0.006, 0.022, 3), new MeshStandardMaterial({ color: '#fbf8f0', flatShading: true }));
  sail.position.set(0.002, 0.014, 0);
  hull.castShadow = sail.castShadow = true;
  boat.add(hull, sail);
  boat.traverse((o) => {
    o.raycast = () => {};
  });
  return boat;
}
