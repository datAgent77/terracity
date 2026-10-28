import { describe, expect, it } from 'vitest';
import { StructureType, TerrainType } from '../../src/config/scenario';
import { GameState } from '../../src/core/game-state';
import { canPlace, MAX_RESIDENTIAL_ELEVATION } from '../../src/simulation/placement';
import type { Tile } from '../../src/world/terrain-map';

const R = StructureType.Residential;
const tile = (type: Tile['type'], elevation = 0): Tile => ({ col: 0, row: 0, type, elevation });

describe('residential placement rules', () => {
  it.each([TerrainType.Sea, TerrainType.River, TerrainType.Beach, TerrainType.Protected, TerrainType.Town])(
    'rejects %s',
    (type) => {
      expect(canPlace(R, tile(type), false).ok).toBe(false);
    },
  );

  it('allows plain without warning', () => {
    expect(canPlace(R, tile(TerrainType.Plain), false)).toEqual({ ok: true });
  });

  it('allows farmland but warns about conversion', () => {
    const v = canPlace(R, tile(TerrainType.Farmland), false);
    expect(v.ok).toBe(true);
    expect(v.ok && v.warning).toMatch(/farmland/i);
  });

  it('allows gentle hills with a cost warning but rejects steep slopes', () => {
    const gentle = canPlace(R, tile(TerrainType.Hill, 1), false);
    expect(gentle.ok && gentle.warning).toMatch(/cost/i);
    expect(canPlace(R, tile(TerrainType.Hill, MAX_RESIDENTIAL_ELEVATION), false).ok).toBe(false);
  });

  it('rejects occupied tiles and missing tiles', () => {
    expect(canPlace(R, tile(TerrainType.Plain), true).ok).toBe(false);
    expect(canPlace(R, undefined, false).ok).toBe(false);
  });
});

describe('GameState.place', () => {
  it('places, moves, and keeps the old position when a move is rejected', () => {
    const g = new GameState();
    const events: string[] = [];
    g.on((e) => events.push(e.kind));
    expect(g.place('h1', R, 11, 3).ok).toBe(true); // plain
    expect(g.place('h1', R, 0, 0).ok).toBe(false); // sea
    expect(g.get('h1')).toMatchObject({ col: 11, row: 3 });
    expect(g.place('h1', R, 5, 7).ok).toBe(true); // farmland
    expect(g.get('h1')).toMatchObject({ col: 5, row: 7 });
    expect(events).toEqual(['placed', 'rejected', 'placed']);
  });

  it('prevents two structures on one tile', () => {
    const g = new GameState();
    g.place('a', R, 11, 3);
    expect(g.place('b', R, 11, 3).ok).toBe(false);
    expect(g.place('a', R, 11, 3).ok).toBe(true); // re-placing itself is fine
  });
});
