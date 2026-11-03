/**
 * Mira 2.0 — grounded dialogue (PURE; tests/unit/mira-dialogue.test.ts).
 *
 * `narrativeContext` gathers everything Mira may talk about from the
 * simulation: the year, which plan / future this is, the neighbourhood around
 * her (5 x 5 tiles), the decisions planned there, and — when a second plan
 * exists — the same place in the other future. `miraDialogue` turns that into a
 * short, user-paced conversation from validated templates. Every line carries
 * the facts that support it (`support`), and a line is only produced when those
 * facts hold. No family history, events or infrastructure the simulation does
 * not model; water, health and traffic are never mentioned.
 *
 * Tradeoffs are named both ways: more planned homes house people but use land;
 * fields and nature kept are good, but families may end up in unplanned sprawl.
 * ASCII only (the UI font has no dashes or dots).
 */
import { TARGETS } from '../config/balance.js';
import type { Year } from '../config/projection.js';
import { StructureType, TerrainType } from '../config/scenario.js';
import type { Placement } from '../simulation/metrics.js';
import { projectYear, type YearMetrics } from '../simulation/projection.js';
import { landBudget } from '../simulation/land-budget.js';
import { CHILD_NAME, childNarrative, type ChildNarrative } from './child-narrative.js';
import { futureVisualState } from './future-visual-state.js';
import { tileAt, type TerrainMap } from './terrain-map.js';

export type PlanId = 'A' | 'B' | 'none';

export interface LocalFacts {
  /** A planned neighbourhood stands on Mira's tile. */
  homesHere: boolean;
  /** Within the 5 x 5 tiles around her tile. */
  parks: number;
  wind: number;
  solar: number;
  homes: number;
  farmlandBuilt: number;
  sprawlTiles: number;
  /** Unplanned sprawl stands on her tile itself. */
  sprawlHere: boolean;
}

export interface SimulationSnapshot {
  housed: number;
  sprawl: number;
  environment: number;
  renewableCoverage: number;
  landUsed: number;
  treeLoss: number;
}

export interface NarrativeContext {
  year: Year;
  planId: PlanId;
  /** The visited tile ("col,row"): the same in every future. */
  neighborhoodId: string;
  simulationSnapshot: SimulationSnapshot;
  /** Structures planned within two tiles of her street (the decisions she can see). */
  relevantDecisions: Array<Pick<Placement, 'type' | 'col' | 'row'>>;
  local: LocalFacts;
  /** The same place in the other future, when there is one. */
  other: { planId: PlanId; snapshot: SimulationSnapshot; local: LocalFacts } | null;
  /** Her state, garden and mood (child-narrative.ts), when she lives here (2050). */
  child: ChildNarrative | null;
}

export interface DialogueLine {
  text: string;
  /** Facts that make this line true (checked by the tests). */
  support: string[];
}

const RADIUS = 2;

function snapshot(terrain: TerrainMap, plan: readonly Placement[], y: YearMetrics): SimulationSnapshot {
  const st = futureVisualState(terrain, plan, y);
  return {
    housed: y.population,
    sprawl: y.sprawlResidents,
    environment: y.environment,
    renewableCoverage: y.renewableCoverage,
    landUsed: landBudget(terrain, plan, y).landConsumedKm2,
    treeLoss: st.treeLoss,
  };
}

function localFacts(terrain: TerrainMap, plan: readonly Placement[], y: YearMetrics, col: number, row: number): LocalFacts {
  const near = (c: number, r: number) => Math.abs(c - col) <= RADIUS && Math.abs(r - row) <= RADIUS;
  const here = plan.filter((p) => near(p.col, p.row));
  const count = (t: StructureType) => here.filter((p) => p.type === t).length;
  return {
    homesHere: plan.some((p) => p.col === col && p.row === row && p.type === StructureType.Residential),
    parks: count(StructureType.Park),
    wind: count(StructureType.Wind),
    solar: count(StructureType.Solar),
    homes: count(StructureType.Residential),
    farmlandBuilt: here.filter((p) => tileAt(terrain, p.col, p.row)?.type === TerrainType.Farmland).length,
    sprawlTiles: y.sprawlTiles.filter((t) => near(t.col, t.row)).length,
    sprawlHere: y.sprawlTiles.some((t) => t.col === col && t.row === row),
  };
}

export function narrativeContext(
  terrain: TerrainMap,
  plan: readonly Placement[],
  planId: PlanId,
  year: Year,
  col: number,
  row: number,
  other: { planId: PlanId; plan: readonly Placement[] } | null = null,
): NarrativeContext {
  const y = projectYear(terrain, plan, year);
  const local = localFacts(terrain, plan, y, col, row);
  let o: NarrativeContext['other'] = null;
  if (other) {
    const oy = projectYear(terrain, other.plan, year);
    o = { planId: other.planId, snapshot: snapshot(terrain, other.plan, oy), local: localFacts(terrain, other.plan, oy, col, row) };
  }
  return {
    year,
    planId,
    neighborhoodId: `${col},${row}`,
    simulationSnapshot: snapshot(terrain, plan, y),
    relevantDecisions: plan.filter((p) => Math.abs(p.col - col) <= RADIUS && Math.abs(p.row - row) <= RADIUS).map(({ type, col: c, row: r }) => ({ type, col: c, row: r })),
    local,
    other: o,
    child: childNarrative(y, futureVisualState(terrain, plan, y), { homesHere: local.homesHere }),
  };
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** A short, user-paced conversation (3 to 5 lines). Empty before 2050 (she is not born yet). */
export function miraDialogue(ctx: NarrativeContext): DialogueLine[] {
  const c = ctx.child;
  if (!c) return [];
  const s = ctx.simulationSnapshot;
  const L = ctx.local;
  const lines: DialogueLine[] = [];

  // 1. Who she is, where we are.
  lines.push({
    text: L.homesHere ? `Hi, I'm ${CHILD_NAME}. I live on this street.` : `Hi, I'm ${CHILD_NAME}.`,
    support: [L.homesHere ? 'homesHere' : '!homesHere'],
  });

  // 2. Her place: the same verified line as her mood and garden.
  lines.push({ text: c.lines[0], support: [`state:${c.state}`] });

  // 3. One local consequence she can see from here.
  if (L.parks > 0 && s.environment >= TARGETS.environment) {
    lines.push({ text: `We play in the ${plural(L.parks, 'park', 'parks')} near here. The trees there are big now.`, support: ['local.parks>0', 'environment>=target'] });
  } else if (L.sprawlTiles > 0) {
    lines.push({ text: 'Houses keep going up out there, without streets or parks.', support: ['local.sprawlTiles>0'] });
  } else if (L.farmlandBuilt > 0) {
    lines.push({ text: 'Grandpa says there used to be fields where some of these buildings are.', support: ['local.farmlandBuilt>0'] });
  } else if (L.wind + L.solar > 0) {
    lines.push({ text: `From here I can see ${L.wind ? 'the wind turbines' : 'the solar farm'}. They make some of our power.`, support: [L.wind ? 'local.wind>0' : 'local.solar>0'] });
  }

  // 4. The same place in the other future: one verified difference, both sides of the tradeoff.
  const o = ctx.other;
  if (o) {
    const dHoused = s.housed - o.snapshot.housed;
    const dLand = s.landUsed - o.snapshot.landUsed;
    const dEnv = s.environment - o.snapshot.environment;
    if (L.homesHere && !o.local.homesHere && o.snapshot.sprawl > 0) {
      lines.push(
        o.local.sprawlHere
          ? { text: `In the other future this street was never built. Unplanned houses went up here instead, and ${fmt(o.snapshot.sprawl)} people had no planned home.`, support: ['homesHere', '!other.homesHere', 'other.sprawlHere', 'other.sprawl'] }
          : { text: `In the other future this street was never built. The land stayed open, but ${fmt(o.snapshot.sprawl)} people had no planned home.`, support: ['homesHere', '!other.homesHere', '!other.sprawlHere', 'other.sprawl'] },
      );
    } else if (!L.homesHere && o.local.homesHere) {
      lines.push({
        text: L.sprawlHere
          ? 'In the other future there is a planned street here, with gardens, where we have houses built without a plan.'
          : 'In the other future there is a planned street here, with gardens, where we have open land.',
        support: ['!homesHere', 'other.homesHere', L.sprawlHere ? 'sprawlHere' : '!sprawlHere'],
      });
    } else if (dHoused !== 0) {
      const more = dHoused > 0;
      lines.push({
        text: more
          ? `Here ${fmt(dHoused)} more people have a planned home than in the other future${dLand > 0 ? `, but it uses ${dLand.toFixed(0)} more sq km of land` : ''}.`
          : `The other future gives ${fmt(-dHoused)} more people a planned home${dLand < 0 ? `, but it uses ${(-dLand).toFixed(0)} more sq km of land` : ''}.`,
        support: ['housed!=other.housed', ...(Math.abs(dLand) > 0 ? ['landUsed!=other.landUsed'] : [])],
      });
    } else if (dEnv !== 0) {
      lines.push({ text: `Nature here scores ${dEnv > 0 ? 'higher' : 'lower'} than in the other future (${s.environment} vs ${o.snapshot.environment}).`, support: ['environment!=other.environment'] });
    } else {
      lines.push({ text: 'Grandpa says the other future looks almost the same as ours, here.', support: ['other.same'] });
    }
  }

  // 5. Her closing line (energy / housing / thanks), then a question to the planner.
  if (c.lines[1]) lines.push({ text: c.lines[1], support: [`second:${c.state}`] });
  // Closing: an invitation to look at the other future, or a question.
  if (o) lines.push({ text: 'Will you look at the other future too?', support: ['other'] });
  else lines.push({ text: c.state === 'thriving' ? 'Will you keep it like this?' : 'Could it have been different?', support: [`state:${c.state}`] });
  return lines;
}

/** Facts in a context, as strings matching `support` (used by the consistency tests). */
export function contextFacts(ctx: NarrativeContext): Set<string> {
  const s = ctx.simulationSnapshot;
  const L = ctx.local;
  const f = new Set<string>();
  f.add(L.homesHere ? 'homesHere' : '!homesHere');
  if (L.parks > 0) f.add('local.parks>0');
  if (L.sprawlTiles > 0) f.add('local.sprawlTiles>0');
  if (L.farmlandBuilt > 0) f.add('local.farmlandBuilt>0');
  f.add(L.sprawlHere ? 'sprawlHere' : '!sprawlHere');
  if (L.wind > 0) f.add('local.wind>0');
  if (L.solar > 0) f.add('local.solar>0');
  if (s.environment >= TARGETS.environment) f.add('environment>=target');
  if (ctx.child) {
    f.add(`state:${ctx.child.state}`);
    if (ctx.child.lines[1]) f.add(`second:${ctx.child.state}`);
  }
  const o = ctx.other;
  if (o) {
    f.add('other');
    f.add(o.local.sprawlHere ? 'other.sprawlHere' : '!other.sprawlHere');
    f.add(o.local.homesHere ? 'other.homesHere' : '!other.homesHere');
    if (o.snapshot.sprawl > 0) f.add('other.sprawl');
    if (s.housed !== o.snapshot.housed) f.add('housed!=other.housed');
    if (s.landUsed !== o.snapshot.landUsed) f.add('landUsed!=other.landUsed');
    if (s.environment !== o.snapshot.environment) f.add('environment!=other.environment');
    if (s.housed === o.snapshot.housed && s.environment === o.snapshot.environment && L.homesHere === o.local.homesHere) f.add('other.same');
  }
  return f;
}
