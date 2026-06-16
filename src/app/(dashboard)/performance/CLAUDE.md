# Performance Page — CLAUDE.md

## Route

`/performance` — role-branched view.

- `agent` → agent self-view (Phase 8)
- `manager` → team view: agent roster + detail panel (Phase 10)
- `founder` / `admin` → all-domains team view; domain filter on agent roster only (Phase 10)
- `guest` → redirect `/dashboard`

## Architecture

### Agent view — single RPC round trip (perf audit D-2, 2026-06-11)

```text
performance/page.tsx              ← Server component (thin orchestrator)
  │  role = agent → derives the range from date_from/date_to URL params via
  │  resolvePerformanceDateParams (default This Month), then fetches initialData
  │  server-side via ONE getAgentPerformanceSummary(period, from?, to?) call →
  │  get_agent_performance RPC (core four + previous period + effort + outcomes
  │  + team benchmarks)
  │
  ├── <PerformanceFilters showSearch={false} />   ← the SAME shared bar as manager/founder
  │
  ├── <AgentPerformanceShell key={period:from:to} agentId agentDomain period customFrom customTo initialData />
  │     'use client' — period/range arrive as PROPS (URL-driven, no in-shell
  │     period state). The shell KEY-REMOUNTS per range with the server-fetched
  │     data — there is NO client metrics refetch (one-RPC-per-view, D-2). Only
  │     the Today pulse stays a client action (the ONE-pulse-fetch invariant).
  │     Renders: CoreFourGrid + EffortGrid + CallOutcomeBar
  │
  └── <PerformanceMotivationalFooter leadsWon inDiscussionCount period />
        Server component — Elaya's quiet sentence. Playfair italic. No glyph.
```

**Date model (2026-06-16):** all three role branches read pure `date_from`/`date_to`
URL params (the shared `PerformanceFilters` → `<FilterBar>` Range presets + custom
Dates, same contract as `/leads`). `resolvePerformanceDateParams(date_from, date_to)`
(`performance-service.ts`) is THE single boundary that derives the `PerformancePeriod`
+ IST range the RPC layer keys on: no params → `this_month`; a preset-matched range →
that enum (so previous-period benchmarks survive for `this_week`/`this_month`/
`last_month`=`prev_month`/`today`); any other range → `custom` + explicit from/to
(benchmarks null). `date_to` is widened to IST end-of-day (the RPCs filter
`created_at <= p_date_to` inclusive). **`all_time` and the old `?period=`/`?from=`/`?to=`
params + the bespoke "Period" dropdown are gone** — `period` is internal/derived, never
URL-reachable.

The RPC is **self-scoped**: the agent is always `auth.uid()` and the benchmark
domain is always `get_user_domain()` inside the function — no identity params
exist, so an agent can never read another agent's metrics through it. Never
reintroduce per-metric service functions that ship cohort rows to Node — the
old 5-function fan-out was ~17 queries per load (migration 0101).

**Benchmarks correctness note:** the pre-RPC implementation queried under the
agent's session client, so leads RLS silently reduced the "team benchmark" to
the agent's own rows. The SECURITY DEFINER RPC computes true domain-wide
averages — only the four aggregate numbers are exposed, never per-agent rows.

`PerformanceAsync.tsx` is deleted (it was mounted nowhere — the shell above is
the real agent view). `PerformanceSkeleton` remains: `loading.tsx` uses it.

### Manager view

```text
performance/page.tsx              ← role = manager
  │  domain ALWAYS from profile (server-verified) — never from URL params
  │
  ├── <PerformanceFilters showSearch />
  │
  └── <Suspense fallback={<ManagerPerformanceSkeleton />}>
        <ManagerPerformanceAsync domain={profile.domain} period={period} />
              1. Fetches getAgentRosterPerformance(domain, from, to)
              Renders: <ManagerPerformancePanel key={period}>
                  Left: agent roster list (AgentCard with conversion rate pill), sorted by totalWon DESC
                  Right: <AgentDetailPanel> — always fetches via getAgentDetailMetricsAction on mount
```

### Founder / Admin view

```text
performance/page.tsx              ← role = founder | admin
  │  filter bar: Range presets + custom Dates (date_from/date_to) + search; no domain selector in bar
  │  fetches initialDomainHealth server-side via getDomainHealthMetrics(GIA_DOMAINS, from, to)
  │
  ├── <PerformanceFilters showSearch />
  │
  └── <FounderPerformanceShell period customFrom customTo initialDomainHealth agentsSlot />
        'use client' — owns activeTab: 'agents' | 'domains' (useState, never URL)
        │
        ├── Agents tab: agentsSlot = <Suspense><ManagerPerformanceAsync allDomains={true} /></Suspense>
        │     Roster: all agents across Gia domains, sorted A-Z within domain groups
        │     Domain filter: client-side FilterDropdown in ManagerPerformancePanel roster header
        │     Detail metrics: per-agent (no domain restriction on fetch)
        │
        └── Domains tab: <DomainOverviewPanel initialData period customFrom customTo />
              Four domain cards (2×2 grid): Total Leads, Total Calls, Total Revenue per GIA domain
              Comparative BarChart with a metric toggle (Leads | Calls | Revenue) — the shared
              TabSelector (variant "accent", indicatorLayoutId "domain-metric-toggle" so its pill
              never collides with the founder shell's "founder-perf-tabs" pill)
              Refetches via getManagerRosterAction on period/date change
```

## Domain filter placement — 2026-05-31 (component updated 2026-06-16)

Founder/admin **do not** use `?domain=` or a page-level filter-bar domain control. Domain scoping is **client-side only** via a shared `<FilterDropdown>` ("Domains", single-select, `menuPortal`, synthetic `__all__` = "All domains") in the `ManagerPerformancePanel` roster header (`domainFilter` state). The page filter bar holds the date range (`date_from`/`date_to`) + agent search (`?search=`). *(The bespoke `DomainFilterPopover` was replaced by `FilterDropdown` on 2026-06-16 — `menuPortal` fixes the mobile clipping; the placement decision itself stands.)*

---

## Domain-source rule — critical

| Role            | Domain source                                                               |
| --------------- | --------------------------------------------------------------------------- |
| manager         | `profile.domain` (server profile, not URL)                                  |
| founder / admin | `allDomains={true}` on `ManagerPerformanceAsync`; roster filter client-side |

**Never read `?domain=` from URL params.** Manager path uses `profile.domain` only.
Founder/admin path fetches the full cross-domain roster server-side; domain narrowing is the roster `FilterDropdown` only.

## Page shell layout (2026-06-04)

All role branches use the canonical list-page shell: `<main className="flex-1 min-w-0 p-8">` inside the dashboard paper scroll container (`layout.tsx` → `overflowY: auto`). **Never** add nested scroll regions with fixed `maxHeight` on the manager roster or a page-level `maxWidth` cap — content scrolls in the paper like `/leads` and `/tasks`.

## Agent self-view layout (2026-06-01)
- **CoreFourGrid:** single row of 4 KPI cards (Leads Won, Conversion Rate, Avg Response Time, In Discussion) with Lucide header icons, inline period delta, Recharts sparkline (`AreaChart` + `useChartTokens`), team benchmark line when `benchmarks` non-null.
- **CallOutcomeBar:** donut chart (Recharts `PieChart`) replacing the legacy horizontal bar for agent view.
- **EffortGrid:** unchanged 4-col compact cards below KPI row.

Do not revert agent view to 2×2 KPI grid without an explicit spec change.

## Recharts splitting (perf audit G-3, 2026-06-11)

The three Recharts importers load via `next/dynamic` at their call sites so the
chart library never sits in the `/performance` initial chunk: `CoreFourGrid` +
`CallOutcomeBar` in `AgentPerformanceShell` (same-shape `.skeleton` placeholders
mirroring `MetricsSkeleton` rows), `CallOutcomeBar` in `AgentDetailPanel` (chunk
loads in parallel with the panel's own metrics fetch), `DomainOverviewPanel` in
`FounderPerformanceShell` (fetched on first Domains-tab click). Never reintroduce
a static import of a Recharts-consuming component into a shell on this route.

## Service File

`src/lib/services/performance-service.ts` — single responsibility.
Never add performance queries to `leads-service.ts` or `dashboard-service.ts`.

Exported functions (post D-2 — the per-metric query functions
`getCoreFourMetrics` / `getEffortMetrics` / `getCallOutcomeBreakdown` /
`getPreviousPeriodCoreMetrics` / `_getCoreFourMetricsForRange` /
`getTeamBenchmarks` are deleted; their types remain):

| Function | Returns | Backing |
| --- | --- | --- |
| `getAgentPerformanceSummary(period, from?, to?)` | `AgentPerformanceSummary` | `get_agent_performance` RPC (0101); React `cache()`-wrapped |
| `getAgentRosterPerformance(domain, dateFrom, dateTo)` | `AgentRosterRow[]` | `get_agent_roster_performance` RPC (0101) |
| `getAgentDetailMetrics(agentId, domain, dateFrom, dateTo)` | `AgentDetailMetrics` | 3 parallel queries (unchanged) |
| `getAgentFirstTouchScorecard(agentId, dateFrom, dateTo)` | `FirstTouchScorecard` | `get_agent_first_touch_pairs` RPC (0123, admin client); React `cache()`; business-minute bucketing in the mapper |
| `getDomainHealthMetrics(domains, dateFrom, dateTo)` | `DomainHealthCard[]` | `get_domain_health_metrics` RPC (0066) |
| `getDomainsWithLeads(dateFrom, dateTo)` | `AppDomain[]` | plain query |
| `getPeriodDateRange(period)` | `DateRange` | pure (IST math via `lib/utils/ist`) |
| `getPreviousPeriodDateRange(period)` | `DateRange \| null` | pure; null for `all_time`/`custom` |

Rate math (touched/total, won/closed → percentages, null-vs-zero) lives in the
service mappers, NOT in SQL — the RPCs return raw counts. Keep it that way so
the null contract stays in one visible place.

## Roster sort order

`getAgentRosterPerformance` returns agents sorted by performance (`leadsWon DESC`, then `conversionRate DESC`) for metric aggregation only. **Sidebar display and default selection do not use this order.**

`src/lib/utils/performance-roster-display.ts` — `buildPerformanceRosterGroups` / `getFirstAgentInPerformanceRosterList`:

- **Founder/admin (`allDomains`):** `PERFORMANCE_ROSTER_DOMAIN_ORDER` (Gia domains first), A–Z by name within each domain
- **Manager (single domain):** A–Z by name

## ManagerPerformancePanel — default agent selection (null = overview)

`ManagerPerformancePanel` initialises `selectedId` to `null`. No agent is pre-selected.

- `selectedId === null` → right panel shows `<PerformanceRosterEmptyState>` (select-an-agent prompt).
- `selectedId !== null` → right panel shows `<AgentDetailPanel>` for that agent.
- Clicking an agent row sets `selectedId`; `AnimatePresence mode="wait"` cross-fades the panels.
- When domain/search filters narrow the visible roster and the selected agent is no longer visible, `selectedId` resets to `null` (back to overview).

`getFirstAgentInPerformanceRosterList` is no longer called from `ManagerPerformancePanel`. It remains in `performance-roster-display.ts` as a utility.

`key={period}` is NOT set on `ManagerPerformancePanel` — period flows through props. Do not add `key={period}` here (invariant 8 from the task spec).

## PerformanceRosterEmptyState

`src/components/performance/PerformanceRosterEmptyState.tsx` — `'use client'`; right panel when `selectedId === null` on the Agents tab (manager + founder). Accent radial wash on `paper-subtle`, Playfair italic heading, sans secondary line. `minHeight: min(320px, 40vh)` — no fixed 600px column lock.

`DomainHealthGrid` (`src/components/performance/DomainHealthGrid.tsx`) is retained but not mounted on the Agents tab — domain aggregates live on the founder **Domains** tab via `DomainOverviewPanel`.

## getDomainHealthMetrics

`src/lib/services/performance-service.ts`

```typescript
getDomainHealthMetrics(domains: AppDomain[], dateFrom: string, dateTo: string): Promise<DomainHealthCard[]>
```

Calls `get_domain_health_metrics` RPC (migration 0066). One round-trip regardless of domain count.
`conversionRate` computed in service layer: `won + lost > 0 ? (won / (won + lost)) * 100 : null`.
All bigint fields pass through `Number()` before return.

`healthDomains` in `ManagerPerformanceAsync`:
- `allDomains=true` (founder/admin): `[...GIA_DOMAINS]` — all 4 Gia domains
- `allDomains=false` (manager): `[domain]` — single domain, renders 1-col grid

## No Redis on the performance service (corrected 2026-06-11)

The performance service has **no Redis cache-aside** — a previous version of
this file documented a `perf:*` key namespace that does not exist in
`redis-keys.ts` or the service (stale doc). With D-2 the cold path is one RPC
round trip per view, so there is nothing slow enough to justify cache-aside's
2×RTT-on-miss cost. Do not add Redis here without measuring first, and do not
re-document keys that have no code.

## First-touch speed scorecard (2026-06-15)

Below the `CallOutcomeBar` donut in `AgentDetailPanel`, a `FirstTouchScorecard`
buckets the period cohort by how fast each lead's **first call note** arrived,
in **business minutes per that agent's shift**: `< 15m / 15–30m / ≤ 1h / 1–3h /
3h+` (`FIRST_TOUCH_BUCKETS` in `lib/constants/performance.ts`).

**The bucketing is NOT pure SQL — the calendar/shift math is TS-only.** The RPC
`get_agent_first_touch_pairs` (0123) returns raw `(lead_id, created_at,
first_call_at)` pairs per cohort lead (`first_call_at = MIN(lead_notes.created_at)
WHERE call_outcome IS NOT NULL` — the same "a call" definition as
`get_agent_performance.calls_logged`). The service mapper
(`getAgentFirstTouchScorecard`) resolves the agent's shift **once** (a
`Map<agentId, shift>` via `getAgentRoutingConfigAdmin` + `buildAgentShiftOverride`
— NULL shift → global `BUSINESS_HOURS`), runs `businessMinutesBetween(created_at,
first_call_at, shift)` per row, and tallies. **Never replicate the SLA ruler in
SQL — reuse `lib/utils/sla` (R-01).**

**Invariants:**

- **Buckets sum to leads-with-a-first-call.** Cohort leads with no qualifying call
  note yet are a **separate `untouched` count** (rendered as a footnote) — never a
  speed bucket, never silently dropped (`leadsWithFirstCall + untouched =
  totalCohort`).
- **A 2am-arrival / 9:15am-call lead lands in `< 15m`** (business-adjusted, not
  3h+) — `businessMinutesBetween` snaps the pre-09:00 creation to the shift open.
- **NULL-shift agents fall back to the global `BUSINESS_HOURS`** ruler cleanly —
  never an error, never skewed.
- **Cached, never recomputed per render.** `getAgentFirstTouchScorecard` is React
  `cache()`-memoised per request; it is a period aggregate, never a hot path. The
  per-row TS loop runs once per (agent, period), not per card open.
- **Scope (Q-13):** `get_agent_first_touch_pairs` is a scope-param RPC (takes
  `p_agent`) → **EXECUTE revoked from `authenticated`, admin client only.** The
  gated action `getAgentFirstTouchScorecardAction` (shared `assertDrillAccess`:
  manager own-domain, admin/founder unrestricted) is the trust boundary — the
  `get_agent_roster_performance` posture.
- **Mount point:** `AgentDetailPanel` only. The `FounderDrillDownDeck` card stays
  zero-per-swipe-fetch (its hard invariant) — the scorecard needs a per-agent
  fetch, so it rides the detail panel's existing agent/period fetch effect, not
  the deck.

## AgentDetailPanel — fetch contract

`AgentDetailPanel` always fetches via `getAgentDetailMetricsAction` on mount. There is no seed
prefetch from the server — `ManagerPerformanceAsync` fetches only the roster. The panel shows
a skeleton on first paint (`isLoading` initialises to `true`) and populates when the action
resolves. On agent change or period change the component remounts and fetches fresh data.

## Types

`AgentRosterRow` and `AgentDetailMetrics` defined in `src/lib/types/index.ts`.

### AgentRosterRow

```typescript
export type AgentRosterRow = {
  id: string;
  full_name: string;
  avatar_url: string | null;
  domain: AppDomain;             // used for founder/admin roster domain grouping
  totalLeads: number;
  leadsWon: number;
  conversionRate: number | null; // null when no won+lost leads closed in period
  totalDealAmount: number;
  avgResponseTimeMinutes: number | null;
};
```

### AgentDetailMetrics

```typescript
export type AgentDetailMetrics = {
  callsToday: number;      // IST midnight boundary; only notes with call_outcome IS NOT NULL
  totalLeads: number;      // all-time assigned leads, no period filter, live snapshot
  totalCallsMade: number;  // SUM(call_count) on cohort leads (created_at in period); COALESCE 0
  leadsWon: number;
  totalDealAmount: number;
  dealTypeBreakdown: { dealType: string; count: number; totalAmount: number }[];
  pipelineBreakdown: { status: string; count: number }[];
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

| Action                              | Auth                                      |
| ----------------------------------- | ----------------------------------------- |
| `getAgentDetailMetricsAction`       | manager (own domain only), admin, founder |
| `getAgentFirstTouchScorecardAction` | manager (own domain only), admin, founder (shared `assertDrillAccess`) |

Manager role: `caller.domain !== domain` → 403. Domain never trusted from client payload.

## Component Map

| Component                    | Location                                                                |
| ---------------------------- | ----------------------------------------------------------------------- |
| `PerformanceFilters`         | `src/components/performance/` — the shared filter bar (all roles); composes `<FilterBar dateRange>` (Range presets + custom Dates) + `useUrlFilters` |
| `CoreFourGrid`               | `src/components/performance/`                                           |
| `EffortGrid`                 | `src/components/performance/`                                           |
| `CallOutcomeBar`             | `src/components/performance/` (reused in detail panel)                  |
| `ManagerPerformancePanel`    | `src/components/performance/` — roster domain `FilterDropdown` + URL `search` |
| `AgentDetailPanel`           | `src/components/performance/`                                           |
| `PerformanceRosterEmptyState`| `src/components/performance/` — null-selection prompt on Agents tab       |
| `DomainHealthGrid`           | `src/components/performance/` — legacy card grid (not on Agents tab)      |
| `DomainOverviewPanel`        | `src/components/performance/` — founder Domains tab (cards + bar chart) |
| `AgentPerformanceShell`      | `src/components/performance/` — `'use client'`; agent self-view shell   |
| `ManagerPerformanceAsync`    | `src/app/(dashboard)/performance/`                                      |
| `FounderPerformanceShell`    | `src/app/(dashboard)/performance/` — `'use client'`; tab state          |
| `PerformanceSkeleton`        | `src/app/(dashboard)/performance/`                                      |
| `ManagerPerformanceSkeleton` | `src/app/(dashboard)/performance/`                                      |

## Phase 10 Hardening — DRY Audit (2026-05-30)

7 violations fixed across 4 files. No console.\* calls found; TD-005 not created.

### Violations fixed

| File                          | Violation                                    | Fix                                           |
| ----------------------------- | -------------------------------------------- | --------------------------------------------- |
| `CoreFourGrid.tsx`            | Inline `[0.16, 1, 0.3, 1]` easing array (×1) | → `EASE_OUT_EXPO` from `lib/constants/motion` |
| `CoreFourGrid.tsx`            | Inline `duration: 0.25` (×1)                 | → `EXIT_DURATION` from `lib/constants/motion` |
| `CoreFourGrid.tsx`            | `fontSize: "10px"` (×2)                      | → `var(--text-2xs)`                           |
| `EffortGrid.tsx`              | Inline `[0.16, 1, 0.3, 1]` easing array (×1) | → `EASE_OUT_EXPO`                             |
| `EffortGrid.tsx`              | Inline `duration: 0.25` (×1)                 | → `EXIT_DURATION`                             |
| `EffortGrid.tsx`              | `fontSize: "10px"` (×1)                      | → `var(--text-2xs)`                           |
| `CallOutcomeBar.tsx`          | Inline `[0.16, 1, 0.3, 1]` easing array (×1) | → `EASE_OUT_EXPO`                             |
| `CallOutcomeBar.tsx`          | Inline `duration: 0.25` (×1)                 | → `EXIT_DURATION`                             |
| `CallOutcomeBar.tsx`          | `fontSize: "10px"` (×1)                      | → `var(--text-2xs)`                           |
| `ManagerPerformancePanel.tsx` | Inline `[0.16, 1, 0.3, 1]` + `duration: 0.2` | → `EASE_OUT_EXPO` + `BASE_DURATION`           |

### Confirmed correct (not violations)

- `import type { PerformancePeriod/... }` from `lib/services/performance-service` in `'use client'` components — **safe**: type-only imports are compile-time erased; only value imports violate PN-001.
- `TeamBenchmarks` defined in `performance-service.ts` — **by design**: performance CLAUDE.md explicitly documents this.
- `height: "10px"` in skeleton files — **correct**: pixel height on skeleton shimmer bars, not a text size.
- No `console.*` calls found anywhere in the performance surface.

### Canonical import paths

| Symbol               | Import from                                               |
| -------------------- | --------------------------------------------------------- |
| `EASE_OUT_EXPO`      | `@/lib/constants/motion`                                  |
| `EXIT_DURATION`      | `@/lib/constants/motion`                                  |
| `BASE_DURATION`      | `@/lib/constants/motion`                                  |
| `ENTER_DURATION`     | `@/lib/constants/motion`                                  |
| `AgentRosterRow`     | `@/lib/types/index`                                       |
| `AgentDetailMetrics` | `@/lib/types/index`                                       |
| `TeamBenchmarks`     | `@/lib/services/performance-service` (not in types/index) |

---

## TeamBenchmarks Type

Defined in: `src/lib/services/performance-service.ts`

```typescript
export type TeamBenchmarks = {
  avgTouchRate: number | null;
  avgConversionRate: number | null;
  avgResponseTimeMinutes: number | null;
  agentCount: number;
};
```

**agentCount < 2 guard:** When fewer than 2 active agents exist in the domain, all three avg
fields are `null` and `agentCount` reflects the true count (0 or 1). The caller (`CoreFourGrid`)
receives these nulls and omits all benchmark lines — renders nothing, not `"—"`.

## PerformancePeriod Type

```typescript
export type PerformancePeriod =
  | "today"
  | "this_week"
  | "this_month"
  | "last_month"
  | "all_time"
  | "custom";
```

**The enum is still the service-layer key, but it is now DERIVED, not URL-reachable
(2026-06-16).** The UI carries pure `date_from`/`date_to`; `resolvePerformanceDateParams`
maps them to this enum (`matchDateRangePreset` for the four preset-mapped periods, else
`custom`). `all_time` is no longer selectable from the UI (Last 3 Months is the widest
preset); `getPeriodDateRange('all_time')` + the `case "all_time"` branches stay for the
type's completeness and any internal caller. Never re-add `?period=` parsing.

## Period Date Range — IST Offset

IST = UTC+05:30.

- `today`: 00:00 IST today → now
- `this_week`: Monday 00:00 IST → now
- `this_month`: 1st of month 00:00 IST → now
- `last_month`: 1st of previous month 00:00 IST → last day 23:59:59 IST
- `all_time`: 2024-01-01T00:00:00Z → now
- `custom`: caller-supplied from/to; falls back to `this_month` when params missing

## Null Handling Contract

Two service fields can legitimately return `null`:

| Field                    | When null                             | Renders as |
| ------------------------ | ------------------------------------- | ---------- |
| `avgResponseTimeMinutes` | No leads were touched in the period   | `"—"`      |
| `conversionRate`         | No won+lost leads exist in the period | `"—"`      |

**Never render null as `"0m"` or `"0%"`.** Null means absence, not zero.
