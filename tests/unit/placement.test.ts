import { describe, expect, it } from 'vitest';
import { StructureType, TerrainType } from '../../src/config/scenario';
import { STRUCTURES } from '../../src/config/structures';
import { canPlace, constructionCost, MAX_RESIDENTIAL_ELEVATION } from '../../src/simulation/placement';
import type { Tile } from '../../src/world/terrain-map';

const R = StructureType.Residential;
const tile = (type: Tile['type'], elevation = 0): Tile => ({ col: 0, row: 0, type, elevation });

describe('terrain restrictions (all structures)', () => {
  const blocked = [TerrainType.Sea, TerrainType.River, TerrainType.Beach, TerrainType.Protected, TerrainType.Town];
  for (const s of Object.values(StructureType)) {
    it.each(blocked.filter((t) => !(s === StructureType.Road && t === TerrainType.River)))(`${s} rejected on %s`, (type) => {
      expect(canPlace(s, tile(type), false).ok).toBe(false);
    });
    it(`${s} allowed on plain`, () => {
      expect(canPlace(s, tile(TerrainType.Plain), false).ok).toBe(true);
    });
  }

  it('roads may bridge the river at extra cost', () => {
    const v = canPlace(StructureType.Road, tile(TerrainType.River), false);
    expect(v.ok && v.cost).toBe(STRUCTURES.road.cost + STRUCTURES.road.bridgeCost!);
    expect(v.ok && v.warning).toMatch(/bridge/i);
  });

  it('rejects occupied tiles and missing tiles', () => {
    expect(canPlace(R, tile(TerrainType.Plain), true).ok).toBe(false);
    expect(canPlace(R, undefined, false).ok).toBe(false);
  });
});

describe('slope restrictions and costs', () => {
  it('homes allowed on gentle slopes (elevation 1), rejected on steep hills (2+)', () => {
    expect(MAX_RESIDENTIAL_ELEVATION).toBe(2);
    expect(canPlace(R, tile(TerrainType.Hill, 1), false).ok).toBe(true);
    for (const e of [2, 3]) {
      const steep = canPlace(R, tile(TerrainType.Hill, e), false);
      expect(steep.ok).toBe(false);
      expect(!steep.ok && steep.reason).toMatch(/erosion and wildfire/i);
    }
  });

  it('solar only on gentle slopes, wind and parks on any hill', () => {
    expect(canPlace(StructureType.Solar, tile(TerrainType.Hill, 1), false).ok).toBe(true);
    expect(canPlace(StructureType.Solar, tile(TerrainType.Hill, 2), false).ok).toBe(false);
    expect(canPlace(StructureType.Wind, tile(TerrainType.Hill, 3), false).ok).toBe(true);
    expect(canPlace(StructureType.Park, tile(TerrainType.Hill, 3), false).ok).toBe(true);
  });

  it('hillside surcharge scales with elevation', () => {
    const base = STRUCTURES.residential.cost;
    const step = STRUCTURES.residential.slopeCostPerStep;
    expect(constructionCost(R, tile(TerrainType.Plain))).toBe(base);
    expect(constructionCost(R, tile(TerrainType.Hill, 1))).toBe(base + step);
    expect(constructionCost(R, tile(TerrainType.Hill, 2))).toBe(base + 2 * step);
    const v = canPlace(R, tile(TerrainType.Hill, 1), false);
    expect(v.ok && v.warning).toMatch(/hillside/i);
  });

  it('wind on a ridge announces the energy bonus', () => {
    const v = canPlace(StructureType.Wind, tile(TerrainType.Hill, 2), false);
    expect(v.ok && v.warning).toMatch(/ridge/i);
  });
});

describe('farmland and budget checks', () => {
  it('warns when converting farmland', () => {
    const v = canPlace(R, tile(TerrainType.Farmland), false);
    expect(v.ok && v.warning).toMatch(/farmland/i);
  });

  it('rejects when the budget is insufficient', () => {
    const cost = STRUCTURES.residential.cost;
    expect(canPlace(R, tile(TerrainType.Plain), false, cost).ok).toBe(true);
    const v = canPlace(R, tile(TerrainType.Plain), false, cost - 1);
    expect(v.ok).toBe(false);
    expect(!v.ok && v.reason).toMatch(/budget/i);
  });
});
