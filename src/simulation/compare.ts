/** Plan A vs Plan B at a given year: per-metric winner + a one-line headline. */
import type { Year } from '../config/projection.js';
import type { TerrainMap } from '../world/terrain-map.js';
import type { Placement } from './metrics.js';
import { allMet, checkTargets, projectYear, type TargetCheck, type YearMetrics } from './projection.js';

export type MetricKey = 'population' | 'environment' | 'renewableCoverage' | 'budgetLeft';
export const METRIC_KEYS: readonly MetricKey[] = ['population', 'environment', 'renewableCoverage', 'budgetLeft'];

export interface PlanComparison {
  year: Year;
  a: YearMetrics;
  b: YearMetrics;
  aTargets: TargetCheck;
  bTargets: TargetCheck;
  /** 'A', 'B' or 'tie' for each metric (higher is better for all four). */
  better: Record<MetricKey, 'A' | 'B' | 'tie'>;
  headline: string;
}

const metCount = (c: TargetCheck) => [c.population, c.environment, c.renewableCoverage, c.budget].filter(Boolean).length;

export function comparePlans(
  terrain: TerrainMap,
  planA: readonly Placement[],
  planB: readonly Placement[],
  year: Year = 2050,
): PlanComparison {
  const a = projectYear(terrain, planA, year);
  const b = projectYear(terrain, planB, year);
  const aTargets = checkTargets(a);
  const bTargets = checkTargets(b);
  const better = {} as Record<MetricKey, 'A' | 'B' | 'tie'>;
  for (const k of METRIC_KEYS) better[k] = a[k] === b[k] ? 'tie' : a[k] > b[k] ? 'A' : 'B';

  const am = metCount(aTargets);
  const bm = metCount(bTargets);
  let headline: string;
  if (allMet(aTargets) && allMet(bTargets)) headline = `Both plans meet every ${year} target.`;
  else if (am === bm) headline = `Both plans meet ${am} of 4 targets in ${year}.`;
  else headline = `Plan ${am > bm ? 'A' : 'B'} meets ${Math.max(am, bm)} of 4 targets in ${year} (other: ${Math.min(am, bm)}).`;
  return { year, a, b, aTargets, bTargets, better, headline };
}
