import { describe, expect, it } from 'vitest';
import { StructureType as S } from '../../src/config/scenario';
import type { Placement } from '../../src/simulation/metrics';
import { districtOrientation } from '../../src/world/district-links';
import { generateTerrain } from '../../src/world/terrain-map';

const terrain = generateTerrain();
const p = (type: Placement['type'], col: number, row: number, rotation = 0): Placement => ({ id: `${type}-${col}-${row}`, type, col, row, rotation });

describe('garden district street connections', () => {
  it('keeps the chosen orientation when its street already meets a road (east)', () => {
    const home = p(S.Residential, 8, 3);
    const o = districtOrientation(terrain, [p(S.Road, 7, 3), home], home);
    expect(o.quarter).toBe(0);
    expect(o.linkWest).toBe(true); // road is west of (8,3)
    expect(o.linkEast).toBe(false);
  });

  it('turns a quarter so the street meets a road to the north', () => {
    const home = p(S.Residential, 10, 6); // away from the town: only the road connects
    const o = districtOrientation(terrain, [p(S.Road, 10, 5), home], home);
    expect(o.quarter).toBe(1);
    expect(o.linkEast).toBe(true); // local +x faces north after one quarter turn
  });

  it('a street end facing the town gets a junction too', () => {
    const home = p(S.Residential, 6, 4); // (5,4) is town
    const o = districtOrientation(terrain, [home], home);
    expect(o.quarter).toBe(0);
    expect(o.linkWest).toBe(true);
  });

  it('no road or town around: user rotation unchanged, no junctions', () => {
    const home = p(S.Residential, 10, 6, 2);
    const o = districtOrientation(terrain, [home], home);
    expect(o).toEqual({ quarter: 2, linkEast: false, linkWest: false });
  });

  it('is deterministic and does not depend on placement order', () => {
    const home = p(S.Residential, 10, 6);
    const a = districtOrientation(terrain, [p(S.Road, 10, 5), home], home);
    const b = districtOrientation(terrain, [home, p(S.Road, 10, 5)], home);
    expect(a).toEqual(b);
  });
});
