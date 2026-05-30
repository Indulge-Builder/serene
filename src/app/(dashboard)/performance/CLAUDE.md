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
              1. Fetches getAgentRosterPerformance(domain, from, to) — sorted top performer first
              2. Pre-fetches getAgentDetailMetrics(roster[0].id, domain, from, to) server-side
              Renders: <ManagerPerformancePanel key={period} initialAgentId initialDetailMetrics>
                  Left: agent roster list (AgentCard with conversion rate pill), sorted by totalWon DESC
                  Right: <AgentDetailPanel> — seeded from initialDetailMetrics for first agent,
                         client-fetches via getAgentDetailMetricsAction for subsequent agent selections
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

## ?domain= param audit — 2026-05-30

Finding: **B — `?domain=` is written AND consumed by the founder/admin domain tab selector (intentional).**

`FounderDomainTabs` (client component) writes `?domain=X` to the URL when the user switches domain tabs.
`FounderPerformanceShell` (server component) reads `rawDomain` from `searchParams.domain` and validates it against `getDomainsWithLeads()` before use.

Security is correct at both layers:
- `performance/page.tsx` only passes `rawDomain` to `FounderPerformanceShell` when `profile.role === 'founder' || profile.role === 'admin'`. The manager branch receives `profile.domain` (server-verified) and never reads `?domain=` at all.
- `FounderPerformanceShell` validates `rawDomain` against the live domain list from the DB — an unrecognised value falls back to the default domain; it is never passed raw to the query.

**No code change required.** The `?domain=` param is intentional state for the founder/admin multi-domain tab view and is not accessible to manager-role users.

---

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

## Roster sort order

`getAgentRosterPerformance` returns agents sorted before returning:
- **Primary:** `leadsWon DESC` — null treated as 0
- **Secondary:** `conversionRate DESC` — null treated as `-Infinity` (agents with no closed leads sort to the bottom, never to the top)

This is a pure in-memory JS sort after the 3-query DB fetch. No ORDER BY added to SQL — the sort is intentional JS.

## initialAgentId + initialDetailMetrics — ManagerPerformancePanel props

`ManagerPerformanceAsync` passes two extra props to `ManagerPerformancePanel`:

| Prop | Type | Purpose |
|------|------|---------|
| `initialAgentId` | `string \| null` | The id of `roster[0]` (or null if roster is empty) |
| `initialDetailMetrics` | `AgentDetailMetrics \| null` | Server-pre-fetched detail for the first agent |

`ManagerPerformancePanel` seeds `useState(selectedId)` from `initialAgentId` and threads both props to `AgentDetailPanel`.

`key={period}` is set on `ManagerPerformancePanel` so a period change forces a clean remount — preventing the seed guard from firing against stale data.

## AgentDetailPanel — seed-skip guard (perf-01 pattern)

`AgentDetailPanel` accepts optional `initialData?: AgentDetailMetrics` and `initialAgentId?: string` props.

When `agent.id === initialAgentId && initialData` is true inside the `useEffect`, the post-mount server action fetch is skipped entirely — the component renders with server-pre-fetched data. This is identical to the Dashboard RSC consolidation (perf-01).

The refresh button remains and calls `getAgentDetailMetricsAction` unconditionally (bypasses the seed).
Selecting a different agent runs the full client fetch path — the guard only fires when `agent.id` matches `initialAgentId`.

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

## Phase 10 Hardening — DRY Audit (2026-05-30)

7 violations fixed across 4 files. No console.* calls found; TD-005 not created.

### Violations fixed

| File | Violation | Fix |
|------|-----------|-----|
| `CoreFourGrid.tsx` | Inline `[0.16, 1, 0.3, 1]` easing array (×1) | → `EASE_OUT_EXPO` from `lib/constants/motion` |
| `CoreFourGrid.tsx` | Inline `duration: 0.25` (×1) | → `EXIT_DURATION` from `lib/constants/motion` |
| `CoreFourGrid.tsx` | `fontSize: "10px"` (×2) | → `var(--text-2xs)` |
| `EffortGrid.tsx` | Inline `[0.16, 1, 0.3, 1]` easing array (×1) | → `EASE_OUT_EXPO` |
| `EffortGrid.tsx` | Inline `duration: 0.25` (×1) | → `EXIT_DURATION` |
| `EffortGrid.tsx` | `fontSize: "10px"` (×1) | → `var(--text-2xs)` |
| `CallOutcomeBar.tsx` | Inline `[0.16, 1, 0.3, 1]` easing array (×1) | → `EASE_OUT_EXPO` |
| `CallOutcomeBar.tsx` | Inline `duration: 0.25` (×1) | → `EXIT_DURATION` |
| `CallOutcomeBar.tsx` | `fontSize: "10px"` (×1) | → `var(--text-2xs)` |
| `ManagerPerformancePanel.tsx` | Inline `[0.16, 1, 0.3, 1]` + `duration: 0.2` | → `EASE_OUT_EXPO` + `BASE_DURATION` |

### Confirmed correct (not violations)

- `import type { PerformancePeriod/... }` from `lib/services/performance-service` in `'use client'` components — **safe**: type-only imports are compile-time erased; only value imports violate PN-001.
- `TeamBenchmarks` defined in `performance-service.ts` — **by design**: performance CLAUDE.md explicitly documents this.
- `height: "10px"` in skeleton files — **correct**: pixel height on skeleton shimmer bars, not a text size.
- No `console.*` calls found anywhere in the performance surface.

### Canonical import paths

| Symbol | Import from |
|--------|-------------|
| `EASE_OUT_EXPO` | `@/lib/constants/motion` |
| `EXIT_DURATION` | `@/lib/constants/motion` |
| `BASE_DURATION` | `@/lib/constants/motion` |
| `ENTER_DURATION` | `@/lib/constants/motion` |
| `AgentRosterRow` | `@/lib/types/index` |
| `AgentDetailMetrics` | `@/lib/types/index` |
| `TeamBenchmarks` | `@/lib/services/performance-service` (not in types/index) |

---

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
