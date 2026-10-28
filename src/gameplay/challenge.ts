/**
 * The TerraCity challenge: a timed planning session judged on the 2050
 * projection. Pure (no IWSDK imports) so the rules are unit-testable.
 */
import { TARGETS } from '../config/balance.js';
import type { Placement } from '../simulation/metrics.js';
import { allMet, checkTargets, projectYear, type TargetCheck, type YearMetrics } from '../simulation/projection.js';
import type { TerrainMap } from '../world/terrain-map.js';

/** Planning time in seconds (the brief asks for a ~7 minute session). */
export const SESSION_SECONDS = 7 * 60;

export type Phase = 'intro' | 'building' | 'finished';

export interface ChallengeResult {
  success: boolean;
  metrics2050: YearMetrics;
  checks: TargetCheck;
  /** One concrete hint per missed target. */
  hints: string[];
  /** True when the timer ran out rather than the player finishing. */
  timedOut: boolean;
}

const HINTS: Record<keyof TargetCheck, string> = {
  population: `Population: house ${TARGETS.population.toLocaleString('en-US')} people - connected homes hold 4,000 each.`,
  environment: 'Environment: keep homes off farmland, put parks next to homes, and house newcomers to stop sprawl.',
  renewableCoverage: 'Renewables: demand grows 10% by 2050 - add ridge wind (+7) or solar (+4) with a margin.',
  budget: 'Budget: hillsides cost extra and coastal lowland needs sea defences by 2050.',
};

export function evaluate(terrain: TerrainMap, plan: readonly Placement[], timedOut = false): ChallengeResult {
  const metrics2050 = projectYear(terrain, plan, 2050);
  const checks = checkTargets(metrics2050);
  const hints = (Object.keys(checks) as Array<keyof TargetCheck>).filter((k) => !checks[k]).map((k) => HINTS[k]);
  return { success: allMet(checks), metrics2050, checks, hints, timedOut };
}

export class Challenge {
  phase: Phase = 'intro';
  timeLeft = SESSION_SECONDS;
  result: ChallengeResult | null = null;

  constructor(
    private terrain: TerrainMap,
    private currentPlan: () => readonly Placement[],
  ) {}

  start(): void {
    this.phase = 'building';
    this.timeLeft = SESSION_SECONDS;
    this.result = null;
  }

  /** Advance the clock; returns true when this tick ended the session. */
  tick(seconds: number): boolean {
    if (this.phase !== 'building') return false;
    this.timeLeft = Math.max(0, this.timeLeft - seconds);
    if (this.timeLeft === 0) {
      this.finish(true);
      return true;
    }
    return false;
  }

  finish(timedOut = false): ChallengeResult {
    this.result = evaluate(this.terrain, this.currentPlan(), timedOut);
    this.phase = 'finished';
    return this.result;
  }

  replay(): void {
    this.phase = 'intro';
    this.timeLeft = SESSION_SECONDS;
    this.result = null;
  }
}

export function formatClock(seconds: number): string {
  const s = Math.ceil(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
