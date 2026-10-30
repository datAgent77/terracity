import { describe, expect, it } from 'vitest';
import { GRID_COLS, TILE_SIZE, TerrainType } from '../../src/config/scenario';
import { tileCenter, tileTopY } from '../../src/world/board-coords';
import { idNumber, hashInts, rng } from '../../src/world/rand';
import { decorHash, decorPlan, regrowPlan } from '../../src/world/terrain-decor';
import { generateTerrain } from '../../src/world/terrain-map';

// Pure parts of the visual overhaul. (Rendering itself is checked in the browser.)
const terrain = generateTerrain();

describe('deterministic randomness', () => {
  it('hash and rng are stable', () => {
    expect(hashInts(3, 4)).toBe(hashInts(3, 4));
    expect(hashInts(3, 4)).not.toBe(hashInts(4, 3));
    const a = rng(42);
    const b = rng(42);
    for (let i = 0; i < 5; i++) expect(a()).toBe(b());
  });
  it('reads placement id numbers', () => {
    expect(idNumber('residential-7')).toBe(7);
    expect(idNumber('road-12')).toBe(12);
  });
});

describe('decoration plan', () => {
  const plan = decorPlan(terrain);

  it('is deterministic', () => {
    expect(decorPlan(terrain)).toEqual(plan);
  });

  it('stays inside its own tile and on its surface (never leaks into neighbours)', () => {
    for (const it of plan) {
      const t = terrain[it.tile];
      const c = tileCenter(t.col, t.row);
      expect(Math.abs(it.x - c.x)).toBeLessThanOrEqual(TILE_SIZE / 2 + 1e-9);
      expect(Math.abs(it.z - c.z)).toBeLessThanOrEqual(TILE_SIZE / 2 + 1e-9);
      if (it.kind !== 'foam') expect(it.y).toBeCloseTo(tileTopY(t));
    }
  });

  it('decorates by terrain: crops/orchards on farmland, forest on protected land, nothing on water or town', () => {
    const kindsOn = (type: string) => new Set(plan.filter((i) => terrain[i.tile].type === type).map((i) => i.kind));
    expect([...kindsOn(TerrainType.Farmland)].every((k) => k === 'crop' || k === 'olive')).toBe(true);
    expect(kindsOn(TerrainType.Protected).has('pine')).toBe(true);
    expect(kindsOn(TerrainType.Sea).size).toBe(0);
    expect(kindsOn(TerrainType.River).size).toBe(0);
    expect(kindsOn(TerrainType.Town).size).toBe(0);
    expect(kindsOn(TerrainType.Beach).has('foam')).toBe(true);
  });

  it('every farmland and protected tile is decorated', () => {
    for (const t of terrain) {
      if (t.type !== TerrainType.Farmland && t.type !== TerrainType.Protected) continue;
      expect(plan.some((i) => i.tile === t.row * GRID_COLS + t.col)).toBe(true);
    }
  });

  it('terrace walls only on steeper hills (elevation >= 2)', () => {
    for (const it of plan.filter((i) => i.kind === 'wall')) expect(terrain[it.tile].elevation).toBeGreaterThanOrEqual(2);
  });
});

describe('time-travel decoration layers', () => {
  it('regrowth is deterministic, only on plains and hills, inside its tile', () => {
    const regrow = regrowPlan(terrain);
    expect(regrowPlan(terrain)).toEqual(regrow);
    expect(regrow.length).toBeGreaterThan(0);
    for (const it of regrow) {
      const t = terrain[it.tile];
      expect([TerrainType.Plain, TerrainType.Hill]).toContain(t.type);
      const c = tileCenter(t.col, t.row);
      expect(Math.abs(it.x - c.x)).toBeLessThanOrEqual(TILE_SIZE / 2);
      expect(Math.abs(it.z - c.z)).toBeLessThanOrEqual(TILE_SIZE / 2);
    }
  });

  it('loss is stable per item and roughly proportional to the share', () => {
    const plan = decorPlan(terrain);
    const h = plan.map(decorHash);
    expect(plan.map(decorHash)).toEqual(h);
    const lost = (share: number) => h.filter((v) => v < share).length / h.length;
    expect(lost(0)).toBe(0);
    expect(lost(0.5)).toBeGreaterThan(0.35);
    expect(lost(0.5)).toBeLessThan(0.65);
    expect(lost(0.75)).toBeGreaterThan(lost(0.5));
  });
});
