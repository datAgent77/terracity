/**
 * Points of interest near Mira (PURE; tests/unit/points-of-interest.test.ts).
 *
 * One or two places around the visited street, chosen only from what exists in
 * this plan / future, each explaining one consequence with the exact amounts
 * the causality ledger attributes to it (`src/simulation/causality.ts`). No
 * decorative hotspots: a point is produced only when its ledger entries exist,
 * and every number on it is one of those entries (`support`).
 * ASCII only (the UI font has no dashes or dots).
 */
import { BALANCE } from '../config/balance.js';
import type { Year } from '../config/projection.js';
import { StructureType } from '../config/scenario.js';
import { ledger, ledgerTotal, type LedgerEntry } from '../simulation/causality.js';
import type { Placement } from '../simulation/metrics.js';
import type { TerrainMap } from './terrain-map.js';

export type PoiKind = 'park' | 'energy' | 'homes' | 'sprawl';

export interface PointOfInterest {
  id: string;
  kind: PoiKind;
  /** The board tile it stands on. */
  tile: { col: number; row: number };
  title: string;
  /** Short lines, each backed by ledger entries. */
  lines: string[];
  /** The ledger entries that every number above comes from. */
  support: LedgerEntry[];
}

const RADIUS = 2;
const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
const signed = (n: number) => (n > 0 ? `+${fmt(n)}` : fmt(n));
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Up to `max` points of interest within two tiles of (col, row), of different
 * kinds, nearest first. `plan` is the plan of this future ([] = nobody planned).
 */
export function pointsOfInterest(
  terrain: TerrainMap,
  plan: readonly Placement[],
  year: Year,
  col: number,
  row: number,
  max = 2,
): PointOfInterest[] {
  const l = ledger(terrain, plan, year);
  const near = (t?: { col: number; row: number }) => !!t && Math.abs(t.col - col) <= RADIUS && Math.abs(t.row - row) <= RADIUS;
  const dist = (t: { col: number; row: number }) => Math.abs(t.col - col) + Math.abs(t.row - row);
  const of = (id: string) => l.entries.filter((e) => e.placementId === id);
  const out: PointOfInterest[] = [];

  for (const p of plan.filter((q) => near(q))) {
    const mine = of(p.id);
    const tile = { col: p.col, row: p.row };
    const farm = mine.find((e) => e.rule === 'farmland-converted');
    if (p.type === StructureType.Park) {
      const nb = mine.find((e) => e.rule === 'park-neighbours');
      if (!nb) continue; // a park next to no homes has no modelled local effect
      const homes = Math.round(nb.amount / BALANCE.parkAdjacencyBonus); // the ledger's amount is bonus x neighbours
      const support = [nb];
      const lines = [`Next to ${homes} ${plural(homes, 'neighbourhood', 'neighbourhoods')}: nature ${signed(nb.amount)}.`];
      const maturity = l.entries.find((e) => e.rule === 'park-maturity');
      if (maturity) {
        const parks = plan.filter((q) => q.type === StructureType.Park).length;
        lines.push(`Its trees grow every year: by ${year}, ${parks} ${plural(parks, 'park adds', 'parks add')} nature ${signed(maturity.amount)}.`);
        support.push(maturity);
      }
      out.push({ id: `poi-${p.id}`, kind: 'park', tile, title: 'Neighbourhood park', lines, support });
    } else if (p.type === StructureType.Solar || p.type === StructureType.Wind) {
      const energy = mine.filter((e) => e.rule === 'structure-energy' || e.rule === 'windy-ridge');
      if (!energy.length) continue;
      const units = energy.reduce((s, e) => s + e.amount, 0);
      const ridge = energy.some((e) => e.rule === 'windy-ridge');
      const name = p.type === StructureType.Solar ? 'Solar farm' : 'Wind turbines';
      const total = ledgerTotal(l, 'renewableSupply');
      const lines = [`Makes ${fmt(units)} of the ${fmt(total)} units of clean power the region has${ridge ? ' (more on this windy ridge)' : ''}.`];
      const support = [...energy];
      if (farm) {
        lines.push(`Built on farmland: nature ${signed(farm.amount)}.`);
        support.push(farm);
      }
      out.push({ id: `poi-${p.id}`, kind: 'energy', tile, title: name, lines, support });
    } else if (p.type === StructureType.Residential) {
      const housed = mine.find((e) => e.rule === 'homes-connected');
      if (!housed) continue;
      const lines = [`${fmt(housed.amount)} people have a planned home here, connected to town by road.`];
      const support = [housed];
      const noise = mine.find((e) => e.rule === 'wind-noise');
      if (noise) {
        lines.push(`Next to wind turbines: nature ${signed(noise.amount)} (noise).`);
        support.push(noise);
      }
      if (farm) {
        lines.push(`Built on farmland: nature ${signed(farm.amount)}.`);
        support.push(farm);
      }
      out.push({ id: `poi-${p.id}`, kind: 'homes', tile, title: 'Planned neighbourhood', lines, support });
    }
  }

  const sprawlTile = l.entries.filter((e) => e.rule === 'land-sprawl' && near(e.tile)).sort((a, b) => dist(a.tile!) - dist(b.tile!))[0];
  const demand = l.entries.find((e) => e.rule === 'housing-demand');
  if (sprawlTile && demand) {
    const n = l.projected.sprawlTiles.length;
    const lines = [`One of ${n} ${plural(n, 'place', 'places')} where ${fmt(demand.amount)} newcomers without a planned home built, without streets or parks.`];
    const support = [demand, sprawlTile];
    const pressure = l.entries.find((e) => e.rule === 'sprawl-pressure');
    if (pressure) {
      lines.push(`Unplanned building costs nature ${signed(pressure.amount)} across the region.`);
      support.push(pressure);
    }
    out.push({ id: `poi-sprawl-${sprawlTile.tile!.col}-${sprawlTile.tile!.row}`, kind: 'sprawl', tile: sprawlTile.tile!, title: 'Unplanned houses', lines, support });
  }

  // Different kinds, the most telling first (parks and energy are visible
  // decisions; homes are where she lives; sprawl where nobody planned), nearest first.
  const rank: Record<PoiKind, number> = { park: 0, energy: 1, sprawl: 2, homes: 3 };
  out.sort((a, b) => rank[a.kind] - rank[b.kind] || dist(a.tile) - dist(b.tile) || a.id.localeCompare(b.id));
  const seen = new Set<PoiKind>();
  return out.filter((p) => !seen.has(p.kind) && seen.add(p.kind)).slice(0, max);
}

