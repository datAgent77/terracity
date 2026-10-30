/**
 * Plan A vs Plan B for the street view (pure; tests/unit/street-compare.test.ts):
 * only the four differences that matter for a neighbourhood — housing,
 * environment, renewable energy and land consumption — for the viewed year.
 */
import { TARGETS } from '../config/balance.js';
import type { Year } from '../config/projection.js';
import type { Placement } from '../simulation/metrics.js';
import { landBudget } from '../simulation/land-budget.js';
import { projectYear } from '../simulation/projection.js';
import type { TerrainMap } from './terrain-map.js';

export interface CompareRow {
  label: string;
  a: string;
  b: string;
  /** Which plan is better on this row ('tie' when equal). */
  better: 'A' | 'B' | 'tie';
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const winner = (a: number, b: number, higherIsBetter: boolean): CompareRow['better'] =>
  a === b ? 'tie' : (a > b) === higherIsBetter ? 'A' : 'B';

export function compareRows(terrain: TerrainMap, planA: readonly Placement[], planB: readonly Placement[], year: Year): CompareRow[] {
  const a = projectYear(terrain, planA, year);
  const b = projectYear(terrain, planB, year);
  const la = landBudget(terrain, planA, a).landConsumedKm2;
  const lb = landBudget(terrain, planB, b).landConsumedKm2;
  return [
    { label: 'Housed', a: fmt(a.population), b: fmt(b.population), better: winner(a.population, b.population, true) },
    { label: `Nature (target ${TARGETS.environment})`, a: fmt(a.environment), b: fmt(b.environment), better: winner(a.environment, b.environment, true) },
    { label: 'Renewable', a: `${fmt(a.renewableCoverage)}%`, b: `${fmt(b.renewableCoverage)}%`, better: winner(a.renewableCoverage, b.renewableCoverage, true) },
    // Less land built over is better (farmland and nature kept).
    { label: 'Land used', a: `${fmt(la)} sq km`, b: `${fmt(lb)} sq km`, better: winner(Math.round(la), Math.round(lb), false) },
  ];
}
