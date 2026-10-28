import { describe, expect, it } from 'vitest';
import { GRID_COLS, GRID_ROWS, TerrainType } from '../../src/config/scenario';
import { localToTile, tileCenter } from '../../src/world/board-coords';
import { generateTerrain, tileAt } from '../../src/world/terrain-map';

describe('terrain map', () => {
  it('is deterministic', () => {
    expect(generateTerrain()).toEqual(generateTerrain());
  });

  it('covers the full grid', () => {
    expect(generateTerrain()).toHaveLength(GRID_COLS * GRID_ROWS);
  });

  it('contains every scenario terrain type', () => {
    const types = new Set(generateTerrain().map((t) => t.type));
    for (const t of Object.values(TerrainType)) expect(types).toContain(t);
  });

  it('has sea along the north edge and land in the south', () => {
    const map = generateTerrain();
    for (let c = 0; c < GRID_COLS; c++) {
      expect(tileAt(map, c, 0)!.type).toBe(TerrainType.Sea);
      expect(tileAt(map, c, GRID_ROWS - 1)!.type).not.toBe(TerrainType.Sea);
    }
  });

  it('returns undefined outside the grid', () => {
    expect(tileAt(generateTerrain(), -1, 0)).toBeUndefined();
    expect(tileAt(generateTerrain(), GRID_COLS, 0)).toBeUndefined();
  });
});

describe('board coordinates', () => {
  it('round-trips every tile centre', () => {
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        const { x, z } = tileCenter(c, r);
        expect(localToTile(x, z)).toEqual({ col: c, row: r });
      }
    }
  });

  it('rejects points off the board', () => {
    expect(localToTile(10, 0)).toBeNull();
    expect(localToTile(0, -10)).toBeNull();
  });
});
