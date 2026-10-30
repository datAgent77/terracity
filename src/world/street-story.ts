/**
 * What changed in the visited neighbourhood, in plain words (pure;
 * tests/unit/street-story.test.ts). Every sentence is derived from the
 * projection of the current plan for the viewed year and from the
 * simulation -> visuals mapping, so the words match what the street shows.
 * ASCII only: the UI font has no dashes or middle dots.
 */
import { TARGETS } from '../config/balance.js';
import type { YearMetrics } from '../simulation/projection.js';
import type { FutureVisualState } from './future-visual-state.js';

export interface StreetFacts {
  /** Unplanned sprawl tiles within the visited area (5 x 5 tiles). */
  sprawlNearby: number;
  /** Beach tiles within the visited area. */
  beachesNearby: number;
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');

export function streetStory(projected: YearMetrics, state: FutureVisualState, facts: StreetFacts): string[] {
  const lines: string[] = [];
  const era = state.homeEra;
  lines.push(
    era === 0
      ? 'Homes today: traditional villas, lawns and terracotta roofs.'
      : era === 1
        ? 'Homes modernise: solar panels on most roofs, shaded windows, a cycle lane.'
        : 'Homes modernise: solar roofs, home batteries, EV charging, dry-climate gardens.',
  );
  const env = Math.round(projected.environment);
  const target = TARGETS.environment;
  if (state.haze >= 0.2) {
    lines.push(`Nature ${env} (target ${target}): smog, parched land and lost trees around the street.`);
  } else if (state.haze > 0) {
    lines.push(`Nature ${env} (target ${target}): just below target, the first dry gardens and fields.`);
  } else if (state.greening > 0) {
    lines.push(`Nature ${env} (target ${target}): young woodland grows and birds return.`);
  } else {
    lines.push(`Nature ${env} (target ${target}).`);
  }
  if (projected.sprawlResidents > 0) {
    lines.push(
      facts.sprawlNearby > 0
        ? `${fmt(projected.sprawlResidents)} newcomers found no planned home: unplanned sprawl spreads nearby.`
        : `${fmt(projected.sprawlResidents)} newcomers found no planned home and live in unplanned sprawl.`,
    );
  }
  if (state.seaRise > 0 && facts.beachesNearby > 0) lines.push('The sea has risen onto the nearby beaches.');
  return lines;
}
