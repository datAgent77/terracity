/**
 * Causality (PURE; tests/unit/causality.test.ts).
 *
 * The simulation is decomposed into a LEDGER: every contribution a rule makes to
 * a metric, with the placement / tile it comes from. The ledger sums exactly to
 * the simulated metrics (tested), so explanations built from ledger differences
 * can only name relationships the simulation actually computes. A causal event
 * (one decision, or Plan A vs Plan B) is the difference of two ledgers.
 *
 * Nothing here is a second simulation: it calls `computeMetrics`,
 * `projectYear` and `landBudget` and only re-attributes their terms.
 */
import { BALANCE } from '../config/balance.js';
import { PROJECTION, type Year } from '../config/projection.js';
import { StructureType, TerrainType } from '../config/scenario.js';
import { STRUCTURES } from '../config/structures.js';
import { tileAt, type TerrainMap } from '../world/terrain-map.js';
import { landBudget } from './land-budget.js';
import { computeMetrics, type Placement } from './metrics.js';
import { constructionCost } from './placement.js';
import { projectYear, type YearMetrics } from './projection.js';

/** Metrics a causal effect can be about (all from the simulation). */
export type CausalMetric = 'housed' | 'sprawl' | 'environment' | 'renewableCoverage' | 'budgetLeft' | 'landUsed';

/** Rules of the simulation that contribute to a metric (one id per rule in metrics.ts / projection.ts / land-budget.ts). */
export type RuleId =
  | 'town-base'
  | 'homes-connected'
  | 'housing-demand'
  | 'env-base'
  | 'structure-footprint'
  | 'farmland-converted'
  | 'wind-noise'
  | 'park-neighbours'
  | 'sprawl-pressure'
  | 'park-maturity'
  | 'food-imports'
  | 'env-limits'
  | 'budget-start'
  | 'construction'
  | 'sea-defence'
  | 'renewable-base'
  | 'structure-energy'
  | 'windy-ridge'
  | 'land-structures'
  | 'land-sprawl';

export interface LedgerEntry {
  rule: RuleId;
  metric: 'housed' | 'sprawl' | 'environment' | 'budgetLeft' | 'renewableSupply' | 'landUsed';
  amount: number;
  /** The placement or tile the contribution comes from, when there is one. */
  placementId?: string;
  tile?: { col: number; row: number };
}

export interface Ledger {
  year: Year;
  entries: LedgerEntry[];
  projected: YearMetrics;
  /** Land consumed (km²) as computed by `landBudget`. */
  landUsed: number;
}

const sum = (es: LedgerEntry[], metric: LedgerEntry['metric']) => es.filter((e) => e.metric === metric).reduce((s, e) => s + e.amount, 0);

const NEIGH: ReadonlyArray<[number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const adjacent = (plan: readonly Placement[], p: Placement, type: StructureType) =>
  plan.filter((o) => o.type === type && NEIGH.some(([dc, dr]) => o.col === p.col + dc && o.row === p.row + dr));

export function ledger(terrain: TerrainMap, plan: readonly Placement[], year: Year): Ledger {
  const base = computeMetrics(terrain, plan);
  const y = projectYear(terrain, plan, year, base);
  const t = PROJECTION.progress[year];
  const E: LedgerEntry[] = [];
  const at = (p: Placement) => ({ placementId: p.id, tile: { col: p.col, row: p.row } });

  // Housed residents.
  E.push({ rule: 'town-base', metric: 'housed', amount: BALANCE.basePopulation });
  for (const p of plan) {
    if (p.type === StructureType.Residential && base.servedIds.has(p.id)) {
      E.push({ rule: 'homes-connected', metric: 'housed', amount: STRUCTURES[p.type].population, ...at(p) });
    }
  }
  // Newcomers without a planned home (sprawl), per the projection.
  if (y.sprawlResidents) {
    E.push({ rule: 'housing-demand', metric: 'sprawl', amount: y.sprawlResidents });
  }

  // Environment.
  E.push({ rule: 'env-base', metric: 'environment', amount: BALANCE.baseEnvironment });
  for (const p of plan) {
    const spec = STRUCTURES[p.type];
    const tile = tileAt(terrain, p.col, p.row)!;
    if (spec.environment) E.push({ rule: 'structure-footprint', metric: 'environment', amount: spec.environment, ...at(p) });
    if (tile.type === TerrainType.Farmland && spec.farmlandPenalty) {
      E.push({ rule: 'farmland-converted', metric: 'environment', amount: spec.farmlandPenalty, ...at(p) });
    }
    if (p.type === StructureType.Residential) {
      const n = adjacent(plan, p, StructureType.Wind).length;
      if (n) E.push({ rule: 'wind-noise', metric: 'environment', amount: BALANCE.windNoisePenalty * n, ...at(p) });
    }
    if (p.type === StructureType.Park) {
      const n = adjacent(plan, p, StructureType.Residential).length;
      if (n) E.push({ rule: 'park-neighbours', metric: 'environment', amount: BALANCE.parkAdjacencyBonus * n, ...at(p) });
    }
  }
  const sprawlEnv = Math.round((PROJECTION.sprawlEnvPer1000 * y.sprawlResidents) / 1000);
  if (sprawlEnv) E.push({ rule: 'sprawl-pressure', metric: 'environment', amount: sprawlEnv });
  const parks = plan.filter((p) => p.type === StructureType.Park).length;
  const parkEnv = Math.round(PROJECTION.parkMaturity2050 * t * parks);
  if (parkEnv) E.push({ rule: 'park-maturity', metric: 'environment', amount: parkEnv });
  const farmEnv = Math.round(PROJECTION.farmlandImport2050 * t * base.farmlandLost);
  if (farmEnv) E.push({ rule: 'food-imports', metric: 'environment', amount: farmEnv });
  // The score is kept within 0..100: the remainder is attributed to that limit.
  const rest = y.environment - sum(E, 'environment');
  if (rest) E.push({ rule: 'env-limits', metric: 'environment', amount: rest });

  // Budget.
  E.push({ rule: 'budget-start', metric: 'budgetLeft', amount: BALANCE.startBudget });
  for (const p of plan) {
    E.push({ rule: 'construction', metric: 'budgetLeft', amount: -constructionCost(p.type, tileAt(terrain, p.col, p.row)!), ...at(p) });
  }
  const defence = base.budgetLeft - y.budgetLeft;
  if (defence) {
    // Spread over the at-risk sites (the projection charges them equally).
    const ids = y.floodRiskIds;
    let left = defence;
    ids.forEach((id, i) => {
      const p = plan.find((q) => q.id === id)!;
      const share = i === ids.length - 1 ? left : Math.round(defence / ids.length);
      left -= share;
      E.push({ rule: 'sea-defence', metric: 'budgetLeft', amount: -share, ...at(p) });
    });
  }

  // Renewable supply (coverage is supply / demand, see `effects`).
  E.push({ rule: 'renewable-base', metric: 'renewableSupply', amount: BALANCE.baseRenewable });
  for (const p of plan) {
    const tile = tileAt(terrain, p.col, p.row)!;
    if (STRUCTURES[p.type].energy) E.push({ rule: 'structure-energy', metric: 'renewableSupply', amount: STRUCTURES[p.type].energy, ...at(p) });
    if (p.type === StructureType.Wind && tile.elevation >= BALANCE.windRidgeElevation) {
      E.push({ rule: 'windy-ridge', metric: 'renewableSupply', amount: BALANCE.windRidgeBonus, ...at(p) });
    }
  }

  // Land used (km²), as land-budget computes it: built tiles + sprawl tiles.
  const lb = landBudget(terrain, plan, y);
  const perTile = lb.landConsumedKm2 / Math.max(1, plan.length + y.sprawlTiles.length);
  for (const p of plan) E.push({ rule: 'land-structures', metric: 'landUsed', amount: perTile, ...at(p) });
  for (const s of y.sprawlTiles) E.push({ rule: 'land-sprawl', metric: 'landUsed', amount: perTile, tile: s });

  return { year, entries: E, projected: y, landUsed: lb.landConsumedKm2 };
}

/** Total of a ledger for one metric (equals the simulated value; tested). */
export function ledgerTotal(l: Ledger, metric: LedgerEntry['metric']): number {
  return sum(l.entries, metric);
}

// ------------------------------------------------------------- effects --

export interface RuleChange {
  rule: RuleId;
  delta: number;
  /** Tiles whose contribution changed (anchors for the 3D visualisation). */
  tiles: Array<{ col: number; row: number }>;
}

export interface CausalEffect {
  metricId: CausalMetric;
  previousValue: number;
  nextValue: number;
  delta: number;
  /** Rules whose contribution changed, largest first. */
  sourceRules: RuleChange[];
  /** One sentence, generated only from the numbers above. */
  supportedExplanation: string;
  /** Is a higher value better for this metric? (land used and sprawl: lower is better). */
  higherIsBetter: boolean;
}

export type DecisionType = 'add' | 'remove' | 'move' | 'rotate' | 'plan-change' | 'compare';

export interface CausalEvent {
  eventId: string;
  decisionType: DecisionType;
  /** Placements added / removed / moved by the decision. */
  affectedEntities: Array<{ change: 'added' | 'removed' | 'moved'; placement: Placement }>;
  year: Year;
  beforeState: YearMetrics;
  afterState: YearMetrics;
  affectedMetrics: CausalEffect[];
  /** Short summary: what changed, what it cost. */
  explanation: string;
  evidenceSource: 'simulation';
  /** 'modelled': the simulation computes it; values between simulated years are never used here. */
  confidenceLevel: 'modelled';
  visualizationType: 'decision-pulse' | 'future-difference';
}

const RULE_TEXT: Record<RuleId, (d: number) => string> = {
  'town-base': () => 'the existing town',
  'homes-connected': (d) => (d > 0 ? 'connected homes' : 'fewer connected homes'),
  'housing-demand': (d) => (d > 0 ? 'more newcomers without a planned home' : 'fewer newcomers without a planned home'),
  'env-base': () => 'the region',
  'structure-footprint': () => 'the footprint of what was built',
  'farmland-converted': () => 'farmland built over',
  'wind-noise': () => 'homes next to wind turbines',
  'park-neighbours': () => 'parks next to homes',
  'sprawl-pressure': () => 'unplanned sprawl',
  'park-maturity': () => 'maturing park trees',
  'food-imports': () => 'food imports for lost farmland',
  'env-limits': () => 'the 0-100 score limit',
  'budget-start': () => 'the starting budget',
  construction: () => 'construction',
  'sea-defence': () => 'sea defences for coastal sites',
  'renewable-base': () => 'existing renewables',
  'structure-energy': () => 'solar and wind supply',
  'windy-ridge': () => 'turbines on windy ridges',
  'land-structures': () => 'built tiles',
  'land-sprawl': () => 'sprawl tiles',
};

const signed = (n: number, digits = 0) => `${n > 0 ? '+' : n < 0 ? '-' : ''}${Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: digits })}`;

function ruleChanges(a: Ledger, b: Ledger, metric: LedgerEntry['metric']): RuleChange[] {
  const group = (l: Ledger) => {
    const m = new Map<RuleId, { total: number; tiles: Map<string, number> }>();
    for (const e of l.entries) {
      if (e.metric !== metric) continue;
      const g = m.get(e.rule) ?? { total: 0, tiles: new Map() };
      g.total += e.amount;
      if (e.tile) {
        const k = `${e.tile.col},${e.tile.row}`;
        g.tiles.set(k, (g.tiles.get(k) ?? 0) + e.amount);
      }
      m.set(e.rule, g);
    }
    return m;
  };
  const ga = group(a);
  const gb = group(b);
  const out: RuleChange[] = [];
  for (const rule of new Set([...ga.keys(), ...gb.keys()])) {
    const x = ga.get(rule);
    const y = gb.get(rule);
    const delta = (y?.total ?? 0) - (x?.total ?? 0);
    if (Math.abs(delta) < 1e-9) continue;
    const tiles: Array<{ col: number; row: number }> = [];
    for (const k of new Set([...(x?.tiles.keys() ?? []), ...(y?.tiles.keys() ?? [])])) {
      if (Math.abs((y?.tiles.get(k) ?? 0) - (x?.tiles.get(k) ?? 0)) > 1e-9) {
        const [col, row] = k.split(',').map(Number);
        tiles.push({ col, row });
      }
    }
    out.push({ rule, delta, tiles });
  }
  return out.sort((p, q) => Math.abs(q.delta) - Math.abs(p.delta));
}

function because(changes: RuleChange[], unit: (d: number) => string): string {
  const top = changes.filter((c) => c.rule !== 'env-limits').slice(0, 2);
  if (!top.length) return '';
  return ` (${top.map((c) => `${RULE_TEXT[c.rule](c.delta)} ${unit(c.delta)}`).join(', ')})`;
}

/** The effects of going from ledger `a` to ledger `b`, one per metric that changed. */
export function effects(a: Ledger, b: Ledger): CausalEffect[] {
  const out: CausalEffect[] = [];
  const push = (metricId: CausalMetric, prev: number, next: number, rules: RuleChange[], text: string, higherIsBetter = true) => {
    if (Math.abs(next - prev) < 1e-9) return;
    out.push({ metricId, previousValue: prev, nextValue: next, delta: next - prev, sourceRules: rules, supportedExplanation: text, higherIsBetter });
  };
  const A = a.projected;
  const B = b.projected;

  const housed = ruleChanges(a, b, 'housed');
  push('housed', A.population, B.population, housed, `Housed residents ${signed(B.population - A.population)}${because(housed, (d) => signed(d))}.`);

  const sprawl = ruleChanges(a, b, 'sprawl');
  if (B.sprawlResidents !== A.sprawlResidents) {
    const why = B.population !== A.population ? ' because planned housing changed' : '';
    push('sprawl', A.sprawlResidents, B.sprawlResidents, sprawl, `Newcomers in unplanned sprawl ${signed(B.sprawlResidents - A.sprawlResidents)}${why}.`, false);
  }

  const env = ruleChanges(a, b, 'environment');
  push('environment', A.environment, B.environment, env, `Nature ${signed(B.environment - A.environment)}${because(env, (d) => signed(d))}.`);

  const supply = ruleChanges(a, b, 'renewableSupply');
  if (B.renewableCoverage !== A.renewableCoverage) {
    const parts: string[] = [];
    if (B.renewableSupply !== A.renewableSupply) parts.push(`renewable supply ${signed(B.renewableSupply - A.renewableSupply)} units`);
    if (Math.abs(B.energyDemand - A.energyDemand) > 1e-9) parts.push(`demand ${signed(B.energyDemand - A.energyDemand, 1)} units from ${B.energyDemand > A.energyDemand ? 'more' : 'fewer'} residents`);
    push('renewableCoverage', A.renewableCoverage, B.renewableCoverage, supply, `Renewable share ${signed(B.renewableCoverage - A.renewableCoverage)} points (${parts.join(', ')}).`);
  }

  const budget = ruleChanges(a, b, 'budgetLeft');
  push('budgetLeft', A.budgetLeft, B.budgetLeft, budget, `Budget left ${signed(B.budgetLeft - A.budgetLeft)}${because(budget, (d) => signed(d))}.`);

  const land = ruleChanges(a, b, 'landUsed');
  push('landUsed', a.landUsed, b.landUsed, land, `Land used ${signed(b.landUsed - a.landUsed, 1)} sq km (${landWhy(a, b)}).`, false);
  return out;
}

function landWhy(a: Ledger, b: Ledger): string {
  const built = b.entries.filter((e) => e.rule === 'land-structures').length - a.entries.filter((e) => e.rule === 'land-structures').length;
  const sprawl = b.projected.sprawlTiles.length - a.projected.sprawlTiles.length;
  const parts: string[] = [];
  if (built) parts.push(`${signed(built)} built tiles`);
  if (sprawl) parts.push(`${signed(sprawl)} sprawl tiles`);
  return parts.join(', ') || 'no tile change';
}

function placementKey(p: Placement): string {
  return `${p.type}@${p.col},${p.row}`;
}

/** What a decision (plan `before` -> plan `after`) changes by `year`. */
export function causalEvent(
  terrain: TerrainMap,
  before: readonly Placement[],
  after: readonly Placement[],
  year: Year,
  decisionType: DecisionType,
  eventId: string,
): CausalEvent {
  const la = ledger(terrain, before, year);
  const lb = ledger(terrain, after, year);
  const byIdA = new Map(before.map((p) => [p.id, p]));
  const byIdB = new Map(after.map((p) => [p.id, p]));
  const affected: CausalEvent['affectedEntities'] = [];
  for (const p of after) {
    const o = byIdA.get(p.id);
    if (!o) affected.push({ change: 'added', placement: p });
    else if (o.col !== p.col || o.row !== p.row) affected.push({ change: 'moved', placement: p });
  }
  for (const p of before) if (!byIdB.has(p.id)) affected.push({ change: 'removed', placement: p });
  // Plans compared side by side have unrelated ids: compare by type and tile.
  if (decisionType === 'compare') {
    affected.length = 0;
    const ka = new Set(before.map(placementKey));
    const kb = new Set(after.map(placementKey));
    for (const p of after) if (!ka.has(placementKey(p))) affected.push({ change: 'added', placement: p });
    for (const p of before) if (!kb.has(placementKey(p))) affected.push({ change: 'removed', placement: p });
  }
  const fx = effects(la, lb);
  return {
    eventId,
    decisionType,
    affectedEntities: affected,
    year,
    beforeState: la.projected,
    afterState: lb.projected,
    affectedMetrics: fx,
    explanation: summary(fx, year, decisionType),
    evidenceSource: 'simulation',
    confidenceLevel: 'modelled',
    visualizationType: decisionType === 'compare' ? 'future-difference' : 'decision-pulse',
  };
}

/** "By 2050: +4,000 housed, nature -3. Cost: budget -12." — benefits and costs, from the numbers only. */
export function summary(fx: CausalEffect[], year: Year, decisionType: DecisionType): string {
  const label: Record<CausalMetric, string> = {
    housed: 'housed',
    sprawl: 'in sprawl',
    environment: 'nature',
    renewableCoverage: 'renewable share',
    budgetLeft: 'budget',
    landUsed: 'land used (sq km)',
  };
  const good = (e: CausalEffect) => (e.delta > 0) === e.higherIsBetter;
  const show = (e: CausalEffect) => `${label[e.metricId]} ${signed(e.delta, e.metricId === 'landUsed' ? 1 : 0)}`;
  const gains = fx.filter(good).map(show);
  const costs = fx.filter((e) => !good(e)).map(show);
  if (!gains.length && !costs.length) return decisionType === 'compare' ? `In ${year} both plans give the same results.` : `No change by ${year}.`;
  const head = decisionType === 'compare' ? `${year}, the other future vs your plan` : `By ${year}`;
  return `${head}: ${gains.length ? `gains ${gains.join(', ')}` : 'no gains'}${costs.length ? `. Costs: ${costs.join(', ')}` : ''}.`;
}
