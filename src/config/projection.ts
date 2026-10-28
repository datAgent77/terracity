/**
 * Explicit, deliberately simple assumptions for the 2035 / 2050 projections.
 * `progress` is the share of the 2026 -> 2050 change applied in each year.
 * Documented in SIMULATION_ASSUMPTIONS.md; covered by tests/unit/projection.test.ts.
 */
export const YEARS = [2026, 2035, 2050] as const;
export type Year = (typeof YEARS)[number];

export const PROJECTION = {
  progress: { 2026: 0, 2035: 0.5, 2050: 1 } as Record<Year, number>,
  /** People who want to live in Costa Verde by 2050 (2026: the existing town). */
  housingDemand2050: 28000,
  /** Environment points lost per 1,000 residents in unplanned sprawl. */
  sprawlEnvPer1000: -1.5,
  /** Unplanned sprawl residents drawn per tile (visual + farmland pressure). */
  sprawlResidentsPerTile: 2000,
  /** Per-capita electricity growth by 2050 (heat pumps, EVs). */
  demandGrowth2050: 0.1,
  /** Extra environment points per park by 2050 as its trees mature. */
  parkMaturity2050: 2,
  /** Environment points per lost farmland tile by 2050 (imported food). */
  farmlandImport2050: -1,
  /** Sea-defence cost by 2050 per structure on a low tile next to beach/sea. */
  seaDefenceCost2050: 4,
} as const;
