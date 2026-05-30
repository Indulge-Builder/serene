# Performance Page — CLAUDE.md

## Route

`/performance` — role-branched view.
- `agent`   → agent self-view (Phase 8)
- `manager` → team view: agent roster + detail panel (Phase 10)
- `founder` / `admin` → domain tabs + same team view per domain (Phase 10)
- `guest`   → redirect `/dashboard`

## Architecture

### Agent view (unchanged)

```
performance/page.tsx              ← Server component (thin orchestrator)
  │  reads searchParams.period, defaults to 'this_month'
  │  role = agent → renders agent layout below
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

### Manager view

```
performance/page.tsx              ← role = manager
  │  domain ALWAYS from profile (server-verified) — never from URL params
  │
  ├── <PerformancePeriodSelector current={period} />
  │
  └── <Suspense fallback={<ManagerPerformanceSkeleton />}>
        <ManagerPerformanceAsync domain={profile.domain} period={period} />
              Fetches getAgentRosterPerformance(domain, from, to)
              Renders: <ManagerPerformancePanel>
                  Left: agent roster list (AgentCard with conversion rate pill)
                  Right: <AgentDetailPanel> — fetches on agentId change
```

### Founder / Admin view

```
performance/page.tsx              ← role = founder | admin
  │  reads searchParams.domain (tab) — defaults to first active domain
  │
  ├── <PerformancePeriodSelector current={period} />
  │
  └── <FounderPerformanceShell period rawDomain />
        Fetches getDomainsWithLeads(from, to) — only domains with activity
        Renders:
          <FounderDomainTabs domains activeDomain period />
            'use client'; pushes ?domain=X to URL on tab change
          <Suspense fallback={<ManagerPerformanceSkeleton />}>
            <ManagerPerformanceAsync domain={selectedDomain} period={period} />
              (reused verbatim — zero layout duplication)
```

## Domain-source rule — critical

| Role    | Domain source |
|---------|--------------|
| manager | `profile.domain` (server profile, not URL) |
| founder / admin | URL param `?domain=X` via `FounderPerformanceShell` |

**Never read `?domain=` from URL params for a manager.** The page passes `profile.domain`
directly to `ManagerPerformanceAsync`. The URL param is only parsed in
`FounderPerformanceShell` and validated against `getDomainsWithLeads` before use.

## Service File

`src/lib/services/performance-service.ts` — single responsibility.
Never add performance queries to `leads-service.ts` or `dashboard-service.ts`.

Exported functions:

| Function                                                  | Returns               |
| --------------------------------------------------------- | --------------------- |
| `getCoreFourMetrics(id, period)`                          | `CoreFourMetrics`     |
| `getEffortMetrics(id, period)`                            | `EffortMetrics`       |
| `getCallOutcomeBreakdown(id, period)`                     | `OutcomeBreakdownItem[]` |
| `getPreviousPeriodCoreMetrics(id, period)`                | `CoreFourMetrics`     |
| `getPeriodDateRange(period)`                              | `DateRange`           |
| `getPreviousPeriodDateRange(period)`                      | `DateRange`           |
| `_getCoreFourMetricsForRange(id, range)`                  | `CoreFourMetrics`     |
| `getTeamBenchmarks(domain, period)`                       | `TeamBenchmarks`      |
| `getAgentRosterPerformance(domain, dateFrom, dateTo)`     | `AgentRosterRow[]`    |
| `getAgentDetailMetrics(agentId, domain, dateFrom, dateTo)`| `AgentDetailMetrics`  |
| `getDomainsWithLeads(dateFrom, dateTo)`                   | `AppDomain[]`         |

## Types

`AgentRosterRow` and `AgentDetailMetrics` defined in `src/lib/types/index.ts`.

### AgentRosterRow

```typescript
export type AgentRosterRow = {
  id:                     string;
  full_name:              string;
  avatar_url:             string | null;
  totalLeads:             number;
  leadsWon:               number;
  conversionRate:         number | null;   // null when totalLeads = 0
  totalDealAmount:        number;
  avgResponseTimeMinutes: number | null;
};
```

### AgentDetailMetrics

```typescript
export type AgentDetailMetrics = {
  callsToday:           number;            // IST midnight boundary
  newLeadsAttended:     number;            // leads that moved past 'new'
  followUpsCompleted:   number;            // calls on touched/nurturing leads
  leadsWon:             number;
  totalDealAmount:      number;
  dealTypeBreakdown:    { dealType: string; count: number; totalAmount: number }[];
  pipelineBreakdown:    { status: string; count: number }[];
  callOutcomeBreakdown: OutcomeBreakdownItem[];
};
```

## callsToday IST boundary contract

`callsToday` uses IST midnight (UTC+05:30) as the day boundary — same technique as
`getPeriodDateRange('this_month')` and `getISTMondayStart` in the service file.

```typescript
const nowIst = new Date(new Date().getTime() + IST_OFFSET_MS);
nowIst.setUTCHours(0, 0, 0, 0);
const todayStart = new Date(nowIst.getTime() - IST_OFFSET_MS).toISOString();
```

**Never use `new Date()` directly as a day boundary — it will be UTC midnight, not IST.**

## Server Action

`src/lib/actions/performance.ts`

| Action                           | Auth                                      |
|----------------------------------|-------------------------------------------|
| `getAgentDetailMetricsAction`    | manager (own domain only), admin, founder |

Manager role: `caller.domain !== domain` → 403. Domain never trusted from client payload.

## Component Map

| Component                        | Location                                          |
| -------------------------------- | ------------------------------------------------- |
| `PerformancePeriodSelector`      | `src/components/performance/`                     |
| `CoreFourGrid`                   | `src/components/performance/`                     |
| `EffortGrid`                     | `src/components/performance/`                     |
| `CallOutcomeBar`                 | `src/components/performance/` (reused in detail panel) |
| `ManagerPerformancePanel`        | `src/components/performance/`                     |
| `AgentDetailPanel`               | `src/components/performance/`                     |
| `FounderDomainTabs`              | `src/components/performance/`                     |
| `PerformanceAsync`               | `src/app/(dashboard)/performance/`                |
| `ManagerPerformanceAsync`        | `src/app/(dashboard)/performance/`                |
| `FounderPerformanceShell`        | `src/app/(dashboard)/performance/`                |
| `PerformanceSkeleton`            | `src/app/(dashboard)/performance/`                |
| `ManagerPerformanceSkeleton`     | `src/app/(dashboard)/performance/`                |

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

**agentCount < 2 guard:** When fewer than 2 active agents exist in the domain, all three avg
fields are `null` and `agentCount` reflects the true count (0 or 1). The caller (`CoreFourGrid`)
receives these nulls and omits all benchmark lines — renders nothing, not `"—"`.

## PerformancePeriod Type

```typescript
export type PerformancePeriod = 'this_week' | 'this_month' | 'last_month' | 'all_time';
```

## Period Date Range — IST Offset

IST = UTC+05:30.

- `this_week`: Monday 00:00 IST → now
- `this_month`: 1st of month 00:00 IST → now
- `last_month`: 1st of previous month 00:00 IST → last day 23:59:59 IST
- `all_time`: 2024-01-01T00:00:00Z → now

## Null Handling Contract

Two service fields can legitimately return `null`:

| Field                   | When null                                  | Renders as |
| ----------------------- | ------------------------------------------ | ---------- |
| `avgResponseTimeMinutes` | No leads were touched in the period       | `"—"`      |
| `conversionRate`         | No won+lost leads exist in the period     | `"—"`      |

**Never render null as `"0m"` or `"0%"`.** Null means absence, not zero.
