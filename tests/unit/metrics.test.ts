import { describe, expect, it } from 'vitest';
import { BALANCE } from '../../src/config/balance';
import { StructureType as S } from '../../src/config/scenario';
import { STRUCTURES } from '../../src/config/structures';
import { computeMetrics, describeDelta, servedHomes, type Placement } from '../../src/simulation/metrics';
import { generateTerrain } from '../../src/world/terrain-map';

const terrain = generateTerrain();
let n = 0;
const p = (type: Placement['type'], col: number, row: number): Placement => ({
  id: `${type}-${++n}`, type, col, row, rotation: 0,
});

describe('baseline', () => {
  it('empty plan equals the starting conditions', () => {
    const m = computeMetrics(terrain, []);
    expect(m.population).toBe(BALANCE.basePopulation);
    expect(m.environment).toBe(BALANCE.baseEnvironment);
    expect(m.budgetLeft).toBe(BALANCE.startBudget);
    expect(m.renewableSupply).toBe(BALANCE.baseRenewable);
    expect(m.renewableCoverage).toBe(Math.round((BALANCE.baseRenewable / 12) * 100));
    expect(m.farmlandLost).toBe(0);
  });

  it('is deterministic', () => {
    const plan = [p(S.Residential, 6, 4), p(S.Wind, 12, 8), p(S.Solar, 9, 3)];
    expect(computeMetrics(terrain, plan)).toEqual(computeMetrics(terrain, plan));
  });
});

describe('road access', () => {
  it('homes next to the town are served', () => {
    const h = p(S.Residential, 6, 4); // town at (5,4)
    expect(servedHomes(terrain, [h]).has(h.id)).toBe(true);
    expect(computeMetrics(terrain, [h]).population).toBe(BALANCE.basePopulation + 4000);
  });

  it('isolated homes are not served until a road chain reaches the town', () => {
    const h = p(S.Residential, 9, 3);
    expect(computeMetrics(terrain, [h]).unservedHomes).toBe(1);
    expect(computeMetrics(terrain, [h]).population).toBe(BALANCE.basePopulation);
    // Town (5,3) -> road (6,3) -> bridge (7,3) -> road (8,3) -> homes (9,3).
    const r1 = p(S.Road, 6, 3);
    const r3 = p(S.Road, 8, 3);
    expect(computeMetrics(terrain, [h, r1, r3]).unservedHomes).toBe(1); // gap at the river
    const bridge = p(S.Road, 7, 3);
    expect(computeMetrics(terrain, [h, r1, bridge, r3]).unservedHomes).toBe(0);
  });

  it('a connected chain through farmland serves homes', () => {
    // Town (5,4) -> road (5,5) -> (6,5) -> homes (6,6)
    const h = p(S.Residential, 6, 6);
    const plan = [h, p(S.Road, 5, 5), p(S.Road, 6, 5)];
    expect(servedHomes(terrain, plan).has(h.id)).toBe(true);
  });
});

describe('farmland conversion penalties', () => {
  it('homes on farmland cost extra environment and count as farmland lost', () => {
    const plain = computeMetrics(terrain, [p(S.Residential, 6, 4)]);
    const farm = computeMetrics(terrain, [p(S.Residential, 5, 5)]);
    expect(farm.farmlandLost).toBe(1);
    expect(plain.farmlandLost).toBe(0);
    expect(plain.environment - farm.environment).toBe(-STRUCTURES.residential.farmlandPenalty);
  });

  it('solar on farmland is penalised more than solar on plain', () => {
    const plain = computeMetrics(terrain, [p(S.Solar, 6, 4)]);
    const farm = computeMetrics(terrain, [p(S.Solar, 5, 6)]);
    expect(plain.environment).toBeGreaterThan(farm.environment);
  });
});

describe('renewable energy', () => {
  it('adds supply and recomputes coverage against served demand', () => {
    const m = computeMetrics(terrain, [p(S.Solar, 6, 4), p(S.Wind, 9, 3)]);
    expect(m.renewableSupply).toBe(BALANCE.baseRenewable + 4 + 5);
    expect(m.energyDemand).toBe(12);
    expect(m.renewableCoverage).toBe(Math.round((11 / 12) * 100));
  });

  it('wind on a ridge (elevation >= 2) gets the bonus', () => {
    const low = computeMetrics(terrain, [p(S.Wind, 10, 5)]); // h1
    const high = computeMetrics(terrain, [p(S.Wind, 13, 9)]); // h3
    expect(high.renewableSupply - low.renewableSupply).toBe(BALANCE.windRidgeBonus);
  });

  it('coverage is capped at 100%', () => {
    const plan = [p(S.Wind, 10, 5), p(S.Wind, 11, 5), p(S.Wind, 12, 5)];
    expect(computeMetrics(terrain, plan).renewableCoverage).toBe(100);
  });

  it('more served residents dilute coverage', () => {
    const a = computeMetrics(terrain, [p(S.Wind, 10, 5)]);
    const b = computeMetrics(terrain, [p(S.Wind, 10, 5), p(S.Residential, 6, 4)]);
    expect(b.renewableCoverage).toBeLessThan(a.renewableCoverage);
  });
});

describe('parks and neighbours', () => {
  it('parks gain a bonus per adjacent homes tile', () => {
    const alone = computeMetrics(terrain, [p(S.Park, 9, 3)]);
    const near = computeMetrics(terrain, [p(S.Park, 9, 3), p(S.Residential, 8, 3)]);
    const homesOnly = computeMetrics(terrain, [p(S.Residential, 8, 3)]);
    expect(near.environment - homesOnly.environment).toBe(
      alone.environment - BALANCE.baseEnvironment + BALANCE.parkAdjacencyBonus,
    );
  });

  it('wind turbines next to homes cost environment (noise)', () => {
    const apart = computeMetrics(terrain, [p(S.Residential, 8, 3), p(S.Wind, 11, 3)]);
    const close = computeMetrics(terrain, [p(S.Residential, 8, 3), p(S.Wind, 9, 3)]);
    expect(apart.environment - close.environment).toBe(-BALANCE.windNoisePenalty);
  });
});

describe('describeDelta', () => {
  it('formats signed changes', () => {
    expect(describeDelta({ population: 4000, environment: -3, budgetLeft: -12, renewableCoverage: 0 })).toBe(
      '+4,000 residents, -3 env, -12 budget',
    );
  });
});

describe('balance (2026 snapshot; the 2050 judgement is in projection.test.ts)', () => {
  // Hand-designed reference plan (also documented in SIMULATION_ASSUMPTIONS.md).
  const reference = (): Placement[] => [
    p(S.Road, 6, 3), p(S.Road, 7, 3), // town -> bridge east
    p(S.Residential, 6, 2), p(S.Residential, 6, 4), p(S.Residential, 2, 4), p(S.Residential, 8, 3),
    p(S.Wind, 10, 8), p(S.Wind, 11, 8), p(S.Wind, 12, 8), // ridge turbines
    p(S.Park, 9, 3), p(S.Park, 1, 4),
  ];

  it('the Phase 1 reference plan meets every target in 2026', async () => {
    const { TARGETS } = await import('../../src/config/balance');
    const m = computeMetrics(terrain, reference());
    expect(m.unservedHomes).toBe(0);
    expect(m.population).toBeGreaterThanOrEqual(TARGETS.population);
    expect(m.environment).toBeGreaterThanOrEqual(TARGETS.environment);
    expect(m.renewableCoverage).toBeGreaterThanOrEqual(TARGETS.renewableCoverage);
    expect(m.budgetLeft).toBeGreaterThanOrEqual(TARGETS.minBudgetLeft);
  });

  it('the naive plan (homes on farmland, solar only) misses targets', async () => {
    const { TARGETS } = await import('../../src/config/balance');
    const naive = [
      p(S.Residential, 3, 5), p(S.Residential, 4, 5), p(S.Residential, 5, 5), p(S.Residential, 6, 4),
      p(S.Solar, 4, 6), p(S.Solar, 5, 6), p(S.Solar, 6, 6),
    ];
    const m = computeMetrics(terrain, naive);
    expect(m.population).toBeGreaterThanOrEqual(TARGETS.population);
    expect(m.environment).toBeLessThan(TARGETS.environment);
    expect(m.renewableCoverage).toBeLessThan(TARGETS.renewableCoverage);
  });
});
