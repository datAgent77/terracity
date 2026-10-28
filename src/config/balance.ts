/** Scenario-wide balancing constants (2026 starting conditions). */
export const BALANCE = {
  /** Infrastructure budget available for the whole plan, in credits (M€). */
  startBudget: 120,
  /** Residents of the existing town (always served). */
  basePopulation: 12000,
  /** Environmental health of the untouched region, 0-100. */
  baseEnvironment: 72,
  /** Existing small hydro plant on the river, energy units. */
  baseRenewable: 2,
  /** Energy units demanded per 1,000 residents served. */
  demandPer1000: 1,
  /** Wind turbines on hills with elevation >= this get the ridge bonus. */
  windRidgeElevation: 2,
  windRidgeBonus: 2,
  /** Park bonus per orthogonally adjacent homes tile (green space access). */
  parkAdjacencyBonus: 1,
  /** Homes next to a wind turbine lose this much environment (noise). */
  windNoisePenalty: -1,
} as const;

/** Balanced-plan target for 2050 (used by the challenge rules in Phase 2). */
export const TARGETS = {
  population: 28000,
  environment: 60,
  renewableCoverage: 80,
  minBudgetLeft: 0,
} as const;
