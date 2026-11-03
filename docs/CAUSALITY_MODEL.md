# Causality model

Source: `src/simulation/causality.ts` (pure); shown by
`src/world/causality-system.ts`. Tests: `tests/unit/causality.test.ts`,
`tests/unit/causality-integrity.test.ts`, `tests/e2e/causality.spec.ts`.

## No second source of truth

`ledger(terrain, plan, year)` re-attributes every term of `computeMetrics`,
`projectYear` and `landBudget` to the rule that produces it, with the
placement and tile it comes from. The ledger sums exactly to housed,
environment, budget, renewable supply and land used (tested for 42 plans ×
3 years and in `temporal-integrity`). A causal event is the difference of two
ledgers — nothing is computed twice.

## Types

```ts
RuleChange   { rule, delta, tiles, scope: 'local' | 'regional', sourceIds }
CausalEffect { metricId, previousValue, nextValue, delta, sourceRules,
               supportedExplanation, higherIsBetter, explanationKey,
               scope: 'local' | 'mixed' | 'regional' }
CausalEvent  { eventId, decisionType, scenarioId, sourceDecisionIds,
               affectedSpatialIds, affectedEntities, year, beforeState,
               afterState, affectedMetrics, explanation,
               evidenceSource: 'simulation', confidenceLevel: 'modelled',
               visualizationType }
DecisionTimeline { now (2026), byYear[2026|2035|2050], later(year) }
```

## Attribution rules

- **Local rules** (connected homes, structure footprint, farmland built over,
  wind noise, parks next to homes, construction, sea defence, renewable
  supply, windy ridge, built tiles): `sourceIds` are exactly the placements
  whose contribution changed.
- **Regional rules** (`REGIONAL_RULES`: housing demand / sprawl, sprawl
  pressure on nature, sprawl land, park maturity, food imports, the 0–100
  limit): computed from the whole plan. `sourceIds` list every placement that
  feeds the rule (e.g. all connected homes for the housing shortage). The UI
  marks such effects "Region-wide" (all rules regional) or "Partly
  region-wide" (mixed). For a single decision the delta is its marginal
  effect, all else equal; it is never presented as the rule's whole value.
- A rule whose contribution did not change is never named; a metric that did
  not change produces no effect.

## Time

Decisions are made in 2026. Every decision is evaluated in 2026, 2035 and
2050 (`decisionTimeline`). The card shows:

- viewing 2026: **Now (2026)** — the immediate effects — and **By 2050** —
  only effects that are new or different in 2050 (`later`). A sentence is
  never repeated across years; nothing appears under a year in which it is
  false.
- viewing 2035 or 2050: the decision as it stands in that year.
- two futures: why the other future differs from your plan in the shown year.

## Causality Vision (on the board)

Rings on the tiles named by the event (teal gain, amber cost). Pinch / click
the card or press N to inspect one cause at a time: the card shows the effect,
its rules with amounts and whether they are local or region-wide, and the
rings narrow to where that cause acts (for sprawl-driven causes: the sprawl
tiles that appear or disappear). A further pinch returns to the overview;
changing the year or opening the futures resets it.

## Not modelled (never claimed)

Household energy flows, health, water, traffic, which household benefits,
values between the simulated years.
