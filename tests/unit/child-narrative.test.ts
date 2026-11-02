import { describe, expect, it } from 'vitest';
import { TARGETS } from '../../src/config/balance';
import { StructureType as S } from '../../src/config/scenario';
import type { Placement } from '../../src/simulation/metrics';
import { projectYear } from '../../src/simulation/projection';
import { childNarrative } from '../../src/world/child-narrative';
import { futureVisualState } from '../../src/world/future-visual-state';
import { generateTerrain } from '../../src/world/terrain-map';

const terrain = generateTerrain();
let n = 0;
const p = (type: Placement['type'], col: number, row: number): Placement => ({ id: `${type}-${++n}`, type, col, row, rotation: 0 });
const reference = () => [
  p(S.Road, 6, 3), p(S.Road, 7, 3),
  p(S.Residential, 6, 2), p(S.Residential, 6, 4), p(S.Residential, 2, 4), p(S.Residential, 8, 3),
  p(S.Wind, 10, 8), p(S.Wind, 11, 8), p(S.Wind, 12, 8),
  p(S.Park, 9, 3), p(S.Park, 1, 4), p(S.Solar, 9, 4),
];
const underHoused = () => [p(S.Road, 6, 3), p(S.Residential, 6, 4), p(S.Wind, 11, 8), p(S.Park, 9, 3)];
const say = (plan: Placement[], year: 2026 | 2035 | 2050 = 2050, homesHere = true) => {
  const y = projectYear(terrain, plan, year);
  return { y, n: childNarrative(y, futureVisualState(terrain, plan, y), { homesHere }) };
};

describe('the last child', () => {
  it('lives in 2050 only', () => {
    expect(say(reference(), 2026).n).toBeNull();
    expect(say(reference(), 2035).n).toBeNull();
    expect(say(reference(), 2050).n).not.toBeNull();
  });

  it('a balanced plan: her favourite place, a green garden', () => {
    const { y, n: c } = say(reference());
    expect(y.environment).toBeGreaterThanOrEqual(TARGETS.environment);
    expect(c!.state).toBe('thriving');
    expect(c!.garden).toBe('lush');
    expect(c!.lines[0]).toMatch(/favorite place. Did you help make it/);
  });

  it('an under-housed plan: lost trees and cousins in sprawl, a dry garden', () => {
    const { y, n: c } = say(underHoused());
    expect(y.environment).toBeLessThan(TARGETS.environment);
    expect(c!.state).toBe('parched');
    expect(c!.garden).toBe('dry');
    expect(c!.lines.join(' ')).toMatch(/there used to be trees here/);
    expect(y.sprawlResidents).toBeGreaterThan(0);
    expect(c!.lines[1]).toMatch(/built without a plan/);
  });

  it('nobody planned here: she lives in the unplanned houses', () => {
    const c = say([], 2050, false).n!;
    expect(c.state).toBe('unplanned');
    expect(c.garden).toBe('dry');
    expect(c.lines[0]).toMatch(/Nobody planned a street or a garden/);
  });

  it('never claims what the simulation does not support', () => {
    for (const plan of [reference(), underHoused(), []]) {
      for (const homesHere of [true, false]) {
        const y = projectYear(terrain, plan, 2050);
        const st = futureVisualState(terrain, plan, y);
        const c = childNarrative(y, st, { homesHere })!;
        const text = c.lines.join(' ');
        if (/used to be trees/.test(text)) expect(st.treeLoss).toBeGreaterThan(0);
        if (/favorite place/.test(text)) expect(y.environment).toBeGreaterThanOrEqual(TARGETS.environment);
        if (/without a plan/.test(text)) expect(y.sprawlResidents).toBeGreaterThan(0);
        if (/only some of our power/.test(text)) expect(y.renewableCoverage).toBeLessThan(TARGETS.renewableCoverage);
        if (/most of our power/.test(text)) expect(y.renewableCoverage).toBeGreaterThanOrEqual(TARGETS.renewableCoverage);
        expect(text).not.toMatch(/water|thirst|sick|die/i); // not modelled
        expect(c.lines.length).toBeLessThanOrEqual(2);
        expect(text).toMatch(/^[\x20-\x7e]*$/);
      }
    }
  });

  it('is deterministic: the same state always gives the same words', () => {
    expect(say(underHoused()).n).toEqual(say(underHoused()).n);
  });

  it('rewriting the plan changes her words (under-housed -> balanced)', () => {
    expect(say(underHoused()).n!.state).not.toBe(say(reference()).n!.state);
  });
});
