/**
 * Runs the guided tips: re-evaluates the tutorial after every change and makes
 * the suggested tiles glow on the board.
 */
import { createSystem, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry } from '@iwsdk/core';
import { TILE_SIZE } from '../config/scenario.js';
import * as cmd from '../core/commands.js';
import { coachText, game, phase, planVersion, tutorial, viewYear } from '../core/session.js';
import { tileCenter } from '../world/board-coords.js';
import { tileTopY } from '../world/board-mesh.js';

const POOL = 16;

export class TutorialSystem extends createSystem({}) {
  private glows: Mesh[] = [];
  private mat = new MeshBasicMaterial({ color: '#ffd84d', transparent: true, opacity: 0.5, depthWrite: false });
  private t = 0;

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
    const refresh = () => {
      cmd.updateTutorial();
      if (phase.peek() !== 'building') coachText.value = '';
      this.placeGlows();
    };
    for (const s of [planVersion, viewYear, phase] as const) {
      this.cleanupFuncs.push((s as { subscribe(f: () => void): () => void }).subscribe(refresh));
    }
    this.cleanupFuncs.push(coachText.subscribe(() => this.placeGlows()));
  }

  private placeGlows(): void {
    const show = phase.peek() === 'building' && viewYear.peek() === 2026 && tutorial.active;
    const tiles = show ? tutorial.hintTiles(game.terrain, game.placements) : [];
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
  }
}
