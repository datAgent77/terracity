/**
 * Runs the guided tips: re-evaluates the tutorial after every change and makes
 * the suggested tiles glow on the board.
 */
import { ConeGeometry, createSystem, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry, TorusGeometry } from '@iwsdk/core';
import { prefersReducedMotion } from '../ui/accessibility.js';
import { TILE_SIZE } from '../config/scenario.js';
import * as cmd from '../core/commands.js';
import { coachText, game, phase, planVersion, streetView, tutorial, viewYear } from '../core/session.js';
import { tileCenter } from '../world/board-coords.js';
import { tileTopY } from '../world/board-mesh.js';

const POOL = 16;

export class TutorialSystem extends createSystem({}) {
  private glows: Mesh[] = [];
  private mat = new MeshBasicMaterial({ color: '#ffd84d', transparent: true, opacity: 0.5, depthWrite: false });
  private t = 0;
  /** Bobbing marker over the first suggested tile: "put it here". */
  private beacon = new Object3D();
  private beaconY = 0;

  init(): void {
    const board = this.world.scene.getObjectByName('terrain-board') as Object3D;
    const geo = new PlaneGeometry(TILE_SIZE * 0.9, TILE_SIZE * 0.9).rotateX(-Math.PI / 2);
    for (let i = 0; i < POOL; i++) {
      const m = new Mesh(geo, this.mat);
      m.name = `tutorial-glow-${i}`;
      m.visible = false;
      m.raycast = () => {};
      board.add(m);
      this.glows.push(m);
    }
    const beaconMat = new MeshStandardMaterial({ color: '#ffb63d', emissive: '#ff9f1a', emissiveIntensity: 0.55, roughness: 0.5 });
    const arrow = new Mesh(new ConeGeometry(0.007, 0.014, 4).rotateX(Math.PI), beaconMat);
    arrow.position.y = 0.007;
    const halo = new Mesh(new TorusGeometry(0.009, 0.0012, 6, 20).rotateX(Math.PI / 2), beaconMat);
    halo.position.y = -0.016;
    this.beacon.add(arrow, halo);
    this.beacon.name = 'tutorial-beacon';
    this.beacon.visible = false;
    this.beacon.traverse((o) => (o.raycast = () => {}));
    board.add(this.beacon);
    const refresh = () => {
      cmd.updateTutorial();
      if (phase.peek() !== 'building') coachText.value = '';
      this.placeGlows();
    };
    for (const s of [planVersion, viewYear, phase, streetView] as const) {
      this.cleanupFuncs.push((s as { subscribe(f: () => void): () => void }).subscribe(refresh));
    }
    this.cleanupFuncs.push(coachText.subscribe(() => this.placeGlows()));
  }

  private placeGlows(): void {
    const show = phase.peek() === 'building' && viewYear.peek() === 2026 && tutorial.active;
    const tiles = show ? tutorial.hintTiles(game.terrain, game.placements) : [];
    const first = tiles[0];
    this.beacon.visible = !!first;
    if (first) {
      const { x, z } = tileCenter(first.col, first.row);
      this.beaconY = tileTopY(game.terrain[first.row * 14 + first.col]) + 0.04;
      this.beacon.position.set(x, this.beaconY, z);
    }
    this.glows.forEach((g, i) => {
      const t = tiles[i];
      g.visible = !!t;
      if (!t) return;
      const { x, z } = tileCenter(t.col, t.row);
      g.position.set(x, tileTopY(game.terrain[t.row * 14 + t.col]) + 0.003, z);
    });
  }

  update(delta: number): void {
    this.t += delta;
    this.mat.opacity = 0.3 + 0.25 * (0.5 + 0.5 * Math.sin(this.t * 4));
    if (this.beacon.visible && !prefersReducedMotion()) {
      this.beacon.position.y = this.beaconY + 0.006 * Math.sin(this.t * 3);
      this.beacon.rotation.y = this.t * 0.8;
    }
  }
}
