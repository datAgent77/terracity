import { describe, expect, it } from 'vitest';
import { BALANCE, TARGETS } from '../../src/config/balance';
import { PROJECTION } from '../../src/config/projection';
import { StructureType as S } from '../../src/config/scenario';
import { comparePlans } from '../../src/simulation/compare';
import { computeMetrics, type Placement } from '../../src/simulation/metrics';
import {
  allMet,
  checkTargets,
  isCoastalLowland,
  projectYear,
  sprawlTilesFor,
} from '../../src/simulation/projection';
import { generateTerrain } from '../../src/world/terrain-map';

const terrain = generateTerrain();
let n = 0;
const p = (type: Placement['type'], col: number, row: number): Placement => ({
  id: `${type}-${++n}`, type, col, row, rotation: 0,
});

export const referencePlan = (): Placement[] => [
  p(S.Road, 6, 3), p(S.Road, 7, 3),
  p(S.Residential, 6, 2), p(S.Residential, 6, 4), p(S.Residential, 2, 4), p(S.Residential, 8, 3),
  p(S.Wind, 10, 8), p(S.Wind, 11, 8), p(S.Wind, 12, 8),
  p(S.Park, 9, 3), p(S.Park, 1, 4),
  p(S.Solar, 9, 4),
];

describe('time projection', () => {
  it('2026 projection equals the current metrics (no future effects yet)', () => {
    const plan = referencePlan();
    const base = computeMetrics(terrain, plan);
    const y = projectYear(terrain, plan, 2026);
    expect(y.population).toBe(base.population);
    expect(y.environment).toBe(base.environment);
    expect(y.budgetLeft).toBe(base.budgetLeft);
    expect(y.renewableCoverage).toBe(base.renewableCoverage);
    expect(y.sprawlResidents).toBe(0);
    expect(y.notes).toEqual([]);
  });

  it('is deterministic', () => {
    const plan = referencePlan();
    expect(projectYear(terrain, plan, 2050)).toEqual(projectYear(terrain, plan, 2050));
  });

  it('an empty plan sprawls: half the shortfall by 2035, all of it by 2050', () => {
    const y35 = projectYear(terrain, [], 2035);
    const y50 = projectYear(terrain, [], 2050);
    const shortfall = PROJECTION.housingDemand2050 - BALANCE.basePopulation;
    expect(y35.sprawlResidents).toBe(shortfall / 2);
    expect(y50.sprawlResidents).toBe(shortfall);
    expect(y50.sprawlTiles).toHaveLength(Math.ceil(shortfall / PROJECTION.sprawlResidentsPerTile));
    expect(y50.environment).toBeLessThan(y35.environment);
    expect(y35.environment).toBeLessThan(BALANCE.baseEnvironment);
    expect(y50.notes.join(' ')).toMatch(/no planned homes/);
  });

  it('planned housing prevents sprawl', () => {
    expect(projectYear(terrain, referencePlan(), 2050).sprawlResidents).toBe(0);
  });

  it('sprawl tiles are free buildable land nearest the town, never water or forest', () => {
    const plan = [p(S.Residential, 6, 4)];
    const tiles = sprawlTilesFor(terrain, plan, 6);
    expect(tiles).toHaveLength(6);
    expect(tiles).not.toContainEqual({ col: 6, row: 4 });
    for (const t of tiles) {
      const type = terrain[t.row * 14 + t.col].type;
      expect(['plain', 'farmland', 'hill']).toContain(type);
    }
  });

  it('electricity demand per person grows, lowering coverage over time', () => {
    const plan = referencePlan();
    const c = [2026, 2035, 2050].map((y) => projectYear(terrain, plan, y as 2026).renewableCoverage);
    expect(c[0]).toBeGreaterThan(c[2]);
    expect(projectYear(terrain, plan, 2050).energyDemand).toBeCloseTo(28 * 1.1);
  });

  it('parks mature and lost farmland costs environment by 2050', () => {
    const park = [p(S.Park, 9, 3)];
    expect(projectYear(terrain, park, 2050).environment - projectYear(terrain, park, 2026).environment)
      .toBe(PROJECTION.parkMaturity2050 - 0 + Math.round(PROJECTION.sprawlEnvPer1000 * 16));
    const farm = [p(S.Solar, 5, 6)];
    const farmDelta = projectYear(terrain, farm, 2050).environment - projectYear(terrain, [], 2050).environment;
    const plainDelta = projectYear(terrain, [p(S.Solar, 9, 4)], 2050).environment - projectYear(terrain, [], 2050).environment;
    expect(farmDelta).toBeLessThan(plainDelta);
  });

  it('coastal lowland sites need sea defences by 2050', () => {
    expect(isCoastalLowland(terrain, 6, 2)).toBe(true); // next to beach (6,1)
    expect(isCoastalLowland(terrain, 6, 4)).toBe(false);
    const coastal = [p(S.Park, 6, 2)];
    const base = computeMetrics(terrain, coastal).budgetLeft;
    expect(projectYear(terrain, coastal, 2035).budgetLeft).toBe(base - PROJECTION.seaDefenceCost2050 / 2);
    expect(projectYear(terrain, coastal, 2050).budgetLeft).toBe(base - PROJECTION.seaDefenceCost2050);
    expect(projectYear(terrain, coastal, 2050).floodRiskIds).toEqual([coastal[0].id]);
  });
});

describe('2050 win condition (balance)', () => {
  it('the reference plan meets every target in 2050', () => {
    const y = projectYear(terrain, referencePlan(), 2050);
    expect(checkTargets(y)).toEqual({ population: true, environment: true, renewableCoverage: true, budget: true });
    expect(y.population).toBeGreaterThanOrEqual(TARGETS.population);
  });

  it('a do-nothing plan fails population, environment and renewables', () => {
    const c = checkTargets(projectYear(terrain, [], 2050));
    expect(c.population).toBe(false);
    expect(c.environment).toBe(false);
    expect(c.renewableCoverage).toBe(false);
    expect(allMet(c)).toBe(false);
  });

  it('a plan that looks fine in 2026 can fail in 2050 (renewables just at target today)', () => {
    // 4 connected homes + exactly enough wind for ~80% today -> electrification pushes it under.
    const plan = [
      p(S.Road, 6, 3), p(S.Road, 7, 3),
      p(S.Residential, 6, 2), p(S.Residential, 6, 4), p(S.Residential, 2, 4), p(S.Residential, 8, 3),
      p(S.Wind, 10, 8), p(S.Wind, 11, 8), p(S.Wind, 12, 8),
    ];
    expect(projectYear(terrain, plan, 2026).renewableCoverage).toBeGreaterThanOrEqual(TARGETS.renewableCoverage);
    expect(projectYear(terrain, plan, 2050).renewableCoverage).toBeLessThan(TARGETS.renewableCoverage);
  });
});

describe('plan comparison', () => {
  it('identifies the better plan per metric and summarises targets', () => {
    const a: Placement[] = [];
    const b = referencePlan();
    const c = comparePlans(terrain, a, b);
    expect(c.better.population).toBe('B');
    expect(c.better.budgetLeft).toBe('A');
    expect(c.headline).toMatch(/Plan B meets 4 of 4/);
  });

  it('same plan ties everywhere', () => {
    const plan = referencePlan();
    const c = comparePlans(terrain, plan, plan);
    expect(Object.values(c.better)).toEqual(['tie', 'tie', 'tie', 'tie']);
    expect(c.headline).toMatch(/Both plans meet every/);
  });
});
