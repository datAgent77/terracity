/**
 * Street connections of a garden district (pure; tests/unit/district-links.test.ts).
 *
 * A district's internal street runs along its local x axis. `p.rotation` is
 * visual-only, so the district is turned a further quarter when that is the
 * only way its street can meet a road or the town; each street end that faces
 * a road or the town then shows a bell-mouth junction ("link").
 */
import { StructureType, TerrainType } from '../config/scenario.js';
import type { Placement } from '../simulation/metrics.js';
import { tileAt, type TerrainMap } from './terrain-map.js';

/** World direction of local +x after `q` quarter turns about +y (three.js). */
const DIRS: ReadonlyArray<[number, number]> = [
  [1, 0], // q = 0 -> east
  [0, -1], // q = 1 -> north
  [-1, 0], // q = 2 -> west
  [0, 1], // q = 3 -> south
];

export function connectsAt(terrain: TerrainMap, plan: readonly Placement[], col: number, row: number): boolean {
  if (plan.some((p) => p.type === StructureType.Road && p.col === col && p.row === row)) return true;
  return tileAt(terrain, col, row)?.type === TerrainType.Town;
}

export interface DistrictOrientation {
  /** Quarter turns to apply to the model (user rotation + any auto turn). */
  quarter: number;
  /** Junction at the local +x / -x street end. */
  linkEast: boolean;
  linkWest: boolean;
}

export function districtOrientation(terrain: TerrainMap, plan: readonly Placement[], p: Placement): DistrictOrientation {
  const ends = (q: number): [boolean, boolean] => {
    const [dc, dr] = DIRS[((q % 4) + 4) % 4];
    return [connectsAt(terrain, plan, p.col + dc, p.row + dr), connectsAt(terrain, plan, p.col - dc, p.row - dr)];
  };
  let quarter = p.rotation;
  let [e, w] = ends(quarter);
  if (!e && !w) {
    const [e2, w2] = ends(quarter + 1);
    if (e2 || w2) {
      quarter += 1;
      [e, w] = [e2, w2];
    }
  }
  return { quarter, linkEast: e, linkWest: w };
}
