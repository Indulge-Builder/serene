# Performance Page — CLAUDE.md

## Route

`/performance` — agent self-view only (Phase 1).
Non-agent roles redirect to `/dashboard` at the page level.

## Architecture

```
performance/page.tsx              ← Server component (thin orchestrator)
  │  reads searchParams.period, defaults to 'this_month'
  │  access gate: profile.role !== 'agent' → redirect('/dashboard')
  │  pre-fetches getCoreFourMetrics + getEffortMetrics for motivational footer
  │
  ├── <PerformancePeriodSelector current={period} />
  │     'use client' — URL param only, no local state
  │     writes: /performance?period=this_week|this_month|last_month|all_time
  │
  ├── <Suspense fallback={<PerformanceSkeleton />}>
  │     <PerformanceAsync period={period} agentId={profile.id} />
  │           Async server component — calls all 5 service functions in Promise.all
  │           Renders: CoreFourGrid + EffortGrid + CallOutcomeBar
  │
  └── <PerformanceMotivationalFooter leadsWon inDiscussionCount period />
        Server component — Lia's quiet sentence. Playfair italic. No glyph.
```

## Service File

`src/lib/services/performance-service.ts` — single responsibility.
Never add performance queries to `leads-service.ts` or `dashboard-service.ts`.

Exported functions:

| Function                         | Returns               |
| -------------------------------- | --------------------- |
| `getCoreFourMetrics(id, period)` | `CoreFourMetrics`     |
| `getEffortMetrics(id, period)`   | `EffortMetrics`       |
| `getCallOutcomeBreakdown(id, period)` | `OutcomeBreakdownItem[]` |
| `getPreviousPeriodCoreMetrics(id, period)` | `CoreFourMetrics` |
| `getPeriodDateRange(period)`     | `DateRange`           |
| `getPreviousPeriodDateRange(period)` | `DateRange`       |
| `_getCoreFourMetricsForRange(id, range)` | `CoreFourMetrics` (shared inner impl) |
| `getTeamBenchmarks(domain, period)`      | `TeamBenchmarks`  |

## TeamBenchmarks Type

Defined in: `src/lib/services/performance-service.ts`

```typescript
export type TeamBenchmarks = {
  avgTouchRate:           number | null;
  avgConversionRate:      number | null;
  avgResponseTimeMinutes: number | null;
  agentCount:             number;
};
```

**agentCount < 2 guard:** When fewer than 2 active agents exist in the domain, all three avg fields are `null` and `agentCount` reflects the true count (0 or 1). The caller (`CoreFourGrid`) receives these nulls and omits all benchmark lines — renders nothing, not `"—"`.

**leadsWon excluded by design:** Absolute win count is not a rate metric. A senior agent with 3× the lead volume will always win more. Benchmarking it would discourage new agents. Only `avgTouchRate`, `avgResponseTimeMinutes`, and `avgConversionRate` are computed.

**Query strategy:** 3 flat queries scoped to `assigned_to IN (agentIds)`. Constant round trips regardless of domain size. The per-agent averages are computed in JS from the returned rows, then averaged across agents. Never loops over agents.

**Averaging method: unweighted mean of per-agent means.** Each agent contributes one value to the domain average regardless of lead volume. An agent with 2 leads at 100% touch rate counts the same as an agent with 50 leads. This is intentional — it prevents high-volume agents from dominating the benchmark. Do not change it to a weighted (pool-wide) average. If weighted averaging is ever needed, add a separate function; do not replace the existing behaviour.

**agentCount: roster count, not activity count.** `agentCount` is the number of `is_active = true` agents in the domain from `profiles` — it is NOT the number of agents who had leads in the period. An agent on leave the entire month still contributes to `agentCount`. This is intentional for the `< 2` guard (roster-based: the team size is what matters for determining whether a benchmark is meaningful), but it means the UI label "across N agents" reflects the domain roster, not period activity. The averages themselves exclude inactive agents via `.filter(d.total > 0)` guards — a zero-lead agent does not distort the averages. If the label should reflect only agents who were active in the period, derive `agentCount` from `Object.keys(touchByAgent).length` instead of `agentIds.length`. Do not make this change without also updating the `< 2` guard logic.

**Benchmark line null contract:** When a benchmark value is `null` (e.g. no closed leads in domain → `avgConversionRate` is null), the benchmark line for that card is **absent** — not shown as `"—"`. This is distinct from the delta line which always renders (showing `"—"` when null). The delta says "I have no comparison"; the absent benchmark line says "there is no domain reference for this metric yet."

**Accent pip:** Appears inline before "Domain avg." text only when the agent's value exceeds the benchmark (or for response time: is lower than benchmark). The pip is `w-1 h-1 rounded-full bg-[--theme-accent]`. No pip for below-average — no shame signalling.

## PerformancePeriod Type

Defined in: `src/lib/services/performance-service.ts`

```typescript
export type PerformancePeriod = 'this_week' | 'this_month' | 'last_month' | 'all_time';
```

## Period Date Range — IST Offset

IST = UTC+05:30.

- `this_week`: Monday 00:00 IST → now
- `this_month`: 1st of month 00:00 IST → now
- `last_month`: 1st of previous month 00:00 IST → last day 23:59:59 IST
- `all_time`: 2024-01-01T00:00:00Z → now

The IST offset is applied by computing dates in IST frame (add +330min) then
converting back to UTC (subtract 330min). Never use UTC midnight as month start.

## Null Handling Contract

Two service fields can legitimately return `null`:

| Field                   | When null                                  | Renders as |
| ----------------------- | ------------------------------------------ | ---------- |
| `avgResponseTimeMinutes` | No leads were touched in the period       | `"—"`      |
| `conversionRate`         | No won+lost leads exist in the period     | `"—"`      |

**Never render null as `"0m"` or `"0%"`.** Null means absence, not zero.
Both fields render `"—"` (em dash) when null — enforced in `CoreFourGrid.tsx`.

## Delta Calculation

`computeDelta(current, previous)` in `CoreFourGrid.tsx`:
- Returns `null` if either value is null
- Returns `{ sign: '=', value: '0%' }` if diff < 0.05
- Positive → `↑` in `var(--color-success-text)`
- Negative → `↓` in `var(--color-danger-text)`
- Unicode arrows (↑ ↓), not Lucide icons — per design-dna.md §8.2

**`all_time` period: all four delta arrows always render `"—"`.**
Chain: `getPreviousPeriodDateRange('all_time')` returns `null` → `getPreviousPeriodCoreMetrics` early-returns `null` without querying → `CoreFourGrid` receives `previous={null}` → all four `delta:` entries short-circuit to `null` before calling `computeDelta` → `MetricCard` renders `"—"` in `--theme-text-tertiary`. No comparison is computed. No DB query is issued for the previous period.

## Component Map

| Component                          | Location                                      |
| ---------------------------------- | --------------------------------------------- |
| `PerformancePeriodSelector`        | `src/components/performance/`                 |
| `CoreFourGrid`                     | `src/components/performance/`                 |
| `EffortGrid`                       | `src/components/performance/`                 |
| `CallOutcomeBar`                   | `src/components/performance/`                 |
| `PerformanceAsync`                 | `src/app/(dashboard)/performance/`            |
| `PerformanceSkeleton`              | `src/app/(dashboard)/performance/`            |
| `PerformanceMotivationalFooter`    | inline in `page.tsx` (server-only)            |
