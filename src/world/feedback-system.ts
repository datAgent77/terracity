/**
 * Step B of "Shape Tomorrow": after every change, highlight the affected area.
 * An expanding ring marks the changed tile, and homes whose road access just
 * changed pulse too (so connecting a road visibly "switches on" a neighbourhood).
 */
import { createSystem, Mesh, MeshBasicMaterial, Object3D, RingGeometry } from '@iwsdk/core';
import { TILE_SIZE } from '../config/scenario.js';
import { game } from '../core/session.js';
import { tileCenter } from './board-coords.js';
import { tileTopY } from './board-mesh.js';

const POOL = 8;
const DURATION = 0.9;

export class FeedbackSystem extends createSystem({}) {
  private rings: Array<{ mesh: Mesh; mat: MeshBasicMaterial; age: number }> = [];
  private lastServed = new Set<string>();

  init(): void {
    const board = this.world.scene.getObjectByName('terrain-board') as Object3D;
    const geo = new RingGeometry(TILE_SIZE * 0.42, TILE_SIZE * 0.5, 32).rotateX(-Math.PI / 2);
    for (let i = 0; i < POOL; i++) {
      const mat = new MeshBasicMaterial({ color: '#ffe27a', transparent: true, opacity: 0, depthWrite: false });
      const mesh = new Mesh(geo, mat);
      mesh.name = `feedback-ring-${i}`;
      mesh.visible = false;
      mesh.raycast = () => {};
      board.add(mesh);
      this.rings.push({ mesh, mat, age: DURATION });
    }
    this.cleanupFuncs.push(
      game.on((e) => {
        if (e.kind !== 'changed') return;
        const served = e.metrics.servedIds;
        const touched = new Set<string>();
        if (e.id && game.get(e.id)) touched.add(e.id);
        for (const id of served) if (!this.lastServed.has(id)) touched.add(id);
        for (const id of this.lastServed) if (!served.has(id) && game.get(id)) touched.add(id);
        this.lastServed = new Set(served);
        let colour = '#ffe27a';
        if (e.delta.environment < 0 && e.delta.population === 0) colour = '#ff9a6b';
        if (e.delta.environment > 0) colour = '#7be08f';
        for (const id of touched) this.pulse(id, id === e.id ? colour : '#7fd8ff');
      }),
    );
  }

  private pulse(id: string, colour: string): void {
    const p = game.get(id);
    if (!p) return;
    const ring = this.rings.reduce((a, b) => (a.age >= b.age ? a : b));
    const { x, z } = tileCenter(p.col, p.row);
    ring.mesh.position.set(x, tileTopY(game.terrain[p.row * 14 + p.col]) + 0.004, z);
    ring.mat.color.set(colour);
    ring.age = 0;
    ring.mesh.visible = true;
  }

  update(delta: number): void {
    for (const r of this.rings) {
      if (r.age >= DURATION) continue;
      r.age += delta;
      const k = Math.min(1, r.age / DURATION);
      r.mesh.scale.setScalar(1 + k * 1.6);
      r.mat.opacity = 0.9 * (1 - k);
      if (k >= 1) r.mesh.visible = false;
    }
  }
}
