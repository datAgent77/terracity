import { describe, expect, it } from 'vitest';
import { StructureType as S, TerrainType } from '../../src/config/scenario';
import type { Placement } from '../../src/simulation/metrics';
import { checkTargets, projectYear } from '../../src/simulation/projection';
import { outcomeVisual } from '../../src/world/outcome-visual';
import { generateTerrain, tileAt } from '../../src/world/terrain-map';

const terrain = generateTerrain();
let n = 0;
const p = (type: Placement['type'], col: number, row: number): Placement => ({ id: `${type}-${++n}`, type, col, row, rotation: 0 });
const outcome = (plan: Placement[]) => {
  const y = projectYear(terrain, plan, 2050);
  const c = checkTargets(y);
  return { o: outcomeVisual(terrain, plan, y, c), c, y };
};
const reference = () => [
  p(S.Road, 6, 3), p(S.Road, 7, 3),
  p(S.Residential, 6, 2), p(S.Residential, 6, 4), p(S.Residential, 2, 4), p(S.Residential, 8, 3),
  p(S.Wind, 10, 8), p(S.Wind, 11, 8), p(S.Wind, 12, 8),
  p(S.Park, 9, 3), p(S.Park, 1, 4), p(S.Solar, 9, 4),
];

describe('result -> map highlights', () => {
  it('a winning plan celebrates and marks only its own homes, parks and renewables', () => {
    const plan = reference();
    const { o, c } = outcome(plan);
    expect(Object.values(c).every(Boolean)).toBe(true);
    expect(o.celebrate).toBe(true);
    expect(o.highlights.every((h) => h.kind === 'success')).toBe(true);
    expect(o.highlights).toHaveLength(plan.filter((x) => x.type !== S.Road).length);
  });

  it('a failing plan never celebrates and never shows success marks', () => {
    for (const plan of [[], reference().filter((x) => x.type !== S.Solar && x.type !== S.Park)]) {
      const { o } = outcome(plan);
      expect(o.celebrate).toBe(false);
      expect(o.highlights.some((h) => h.kind === 'success')).toBe(false);
    }
  });

  it('marks explain only the targets that were missed', () => {
    for (const plan of [[], reference().filter((x) => x.type !== S.Solar && x.type !== S.Park), [p(S.Residential, 9, 3)]]) {
      const { o, c } = outcome(plan);
      for (const h of o.highlights) expect(c[h.target as keyof typeof c]).toBe(false);
    }
  });

  it('unconnected homes and sprawl are flagged when population is missed', () => {
    const lonely = p(S.Residential, 9, 3);
    const { o, y } = outcome([lonely]);
    expect(o.highlights).toContainEqual(expect.objectContaining({ col: 9, row: 3, kind: 'problem', target: 'population' }));
    for (const t of y.sprawlTiles) expect(o.highlights).toContainEqual(expect.objectContaining({ ...t, target: 'population' }));
  });

  it('renewable shortfall points to free windy-ridge tiles (opportunities)', () => {
    const plan = reference().filter((x) => x.type !== S.Solar && x.type !== S.Park);
    const { o, c } = outcome(plan);
    expect(c.renewableCoverage).toBe(false);
    const opp = o.highlights.filter((h) => h.kind === 'opportunity');
    expect(opp.length).toBeGreaterThan(0);
    for (const h of opp) {
      const t = tileAt(terrain, h.col, h.row)!;
      expect(t.type).toBe(TerrainType.Hill);
      expect(t.elevation).toBeGreaterThanOrEqual(2);
      expect(plan.some((x) => x.col === h.col && x.row === h.row)).toBe(false);
    }
  });

  it('farmland building is flagged when environment is missed', () => {
    const plan = [p(S.Residential, 3, 5), p(S.Residential, 4, 5), p(S.Residential, 5, 5), p(S.Residential, 6, 4), p(S.Solar, 4, 6), p(S.Solar, 5, 6)];
    const { o, c } = outcome(plan);
    expect(c.environment).toBe(false);
    expect(o.highlights.filter((h) => h.target === 'environment' && h.reason.includes('farmland')).length).toBeGreaterThanOrEqual(4);
  });
});
