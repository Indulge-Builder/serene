# Performance — Page Spec

> **Purpose:** spec for `/performance` — one URL, three role-specific layouts (agent self-view, manager team view, founder/admin Agents+Domains tabs).
> **Audience:** engineers. · **Source-of-truth scope:** the performance route, `performance-service.ts`, `performance.ts` actions, the date model, and the date-field rule.
> **Last verified:** 2026-07-02 (full pass - covers the 2026-06-25 agent self-scorecard
> redesign: the lean single-page shell, the `agent_performance_trend` RPC (migration 0146),
> `ManagerPerformanceShell`, the Domains-tab global-domain scoping + domain-card drill modals,
> and the 2026-07-02 dead-code purge that deleted `DomainHealthGrid`, `EffortGrid`, and
> `AgentCallTrendChart`; the 2026-06-16 date model and the 2026-06-24 lead-drill stack still
> verify as documented).

## 1. Purpose

Role-adaptive KPI surface. Agents see a lean single-page self-scorecard (redesigned 2026-06-25):
Today strip, core-four KPIs, a period activity trend, a live pipeline line, call outcomes, and
recent activity - all server-fetched (one `get_agent_performance` RPC + one
`get_agent_performance_trend` RPC, both self-scoped, no identity params).
Managers see a domain roster + per-agent detail. Founders/admins get an Agents tab (all-domain
roster) and a Domains tab (per-domain health cards + comparative chart, revenue from
`public.deals`, plus a month-pinned deals-vs-target radial meter founders/admins can edit inline
via `upsertDomainTargetAction`). The Domains tab follows the global `serene-domain` selector
(2026-06-25), and every domain-card tile drills into the leads or deals behind it.

Every metric/chart on the agent-detail and founder-deck surfaces is now drillable: tapping a stat
tile, a pipeline segment, a call-outcome slice, or a first-touch-speed bar opens a fetch-on-open
modal of the leads behind that number, each row a link into the lead dossier.

## 2. Who sees it

agent (self only) · manager (own domain team) · admin/founder (all domains + Domains tab) ·
guest → `redirect('/dashboard')`. Branch order and enforcement layers: Deep dive §7/§11.
The roster RPC pins managers to `get_user_domain()` in SQL — a forged `allDomains` cannot
widen scope.

## 3. Data sources

| Layer | Key items |
| ----- | --------- |
| Service | `performance-service.ts` only (never extend leads/dashboard services) - `getAgentPerformanceSummary` (React `cache()`, D-2), `getAgentPerformanceTrend` (React `cache()`, migration 0146 - the `AgentTrendPoint[]` daily series), `getAgentRosterPerformance` (RPC-backed), `getAgentDetailMetrics`, `getDomainHealthMetrics`, `getAgentTodayPulse` (0108), `getAgentLeadActivityPage` (keyset), `getAgentCallsPageForManager` (keyset), `getAgentFirstTouchScorecard` / `getAgentFirstTouchBucketLeadIds` (0123, shared `classifyFirstTouchPairs`), `resolvePerformanceDateParams` (the date-model boundary), period helpers; targets in `domain-targets-service.ts`. No Redis (see §"caching") |
| RPCs | `get_agent_performance` + `get_agent_roster_performance` (0101, self-/role-scoped in SQL), `get_agent_performance_trend` (0146, self-scoped - per-IST-day leads_won/calls/notes, zero-filled, oldest first), domain-health RPCs (0066/0068/0076/0107 - `total_deals` added), `get_agent_today_pulse` (0108, self-scoped) + `notes_today` (0122), `get_agent_first_touch_pairs` (0123, scope-param, EXECUTE revoked → admin client) |
| Tables | `domain_targets` (0105) — founder-set monthly deals-closed target per domain; UNIQUE(domain, metric, period); RLS all-read / admin+founder write. `public.deals` is the revenue source for both roster and detail (never a `leads` column) |
| Actions | `performance.ts` - 14 actions: `getAgentDetailMetricsAction`, `getAgentFirstTouchScorecardAction`, `getManagerRosterAction`, `getDomainHealthMetricsAction` (optional 4th `domain` arg since 2026-06-25), `getAgentPulseAction` (agent-only), `getAgentRecentLeadActivityAction` (agent-only), `upsertDomainTargetAction` (admin/founder), + the seven drill-downs (`getAgentCallsForManagerAction`, `getAgentLeadsScopedAction`, `getAgentDealsScopedAction`, `getFirstTouchBucketLeadsAction`, `getAgentLeadsByPredicateAction`, `getDomainLeadsDrillAction`, `getDomainDealsDrillAction`). `getAgentActivityForManagerAction` was deleted (zero call sites). There is **no** agent self-metrics action - the agent payload is server-fetched (§6). Full table: §6 + Component inventory |
| Date model | Pure `date_from`/`date_to` URL params for ALL THREE roles (the `/leads` FilterBar contract). `resolvePerformanceDateParams(dateFrom, dateTo)` derives the internal `PerformancePeriod` + IST range — Deep dive §3 |

## 4. Components

`AgentPerformanceShell` (the lean single-page self-scorecard, 2026-06-25 - no tabs: `TodayStrip`
4-cell StatTile bar → `CoreFourGrid` → one paper card with `AgentActivityTrendChart` +
`PipelineLine` → `CallOutcomeBar` → `AgentRecentActivityList`; period arrives as a prop, the shell
key-remounts per range, the pulse fires once per mount) ·
`PerformanceFilters` (the shared `<FilterBar>` Range/Dates bar, all roles; `tabSlot` + `trailing` slots) ·
`ManagerPerformanceShell` (manager-only client shell - owns the filter strip + hosts the "Deck view" trigger) ·
`ManagerPerformanceAsync` → `ManagerPerformancePanel` (roster + `AgentDetailPanel`; `?agent=` selection mirror) ·
`FounderPerformanceShell` (Agents/Domains tabs inside the filter strip; `agentsSlot` injection) ·
`DomainOverviewPanel` (4 stats incl. Deals Closed + `DomainTargetMeter` radial deals-vs-target meter,
founder/admin inline target edit, mobile CSS scroll-snap carousel, tile drills via
`DomainLeadsDrillModal` / `DomainDealsDrillModal` + `DealDrillRow`) ·
`CoreFourGrid`, `StatAtom`, `PipelineBar`, `FirstTouchScorecard` ·
`FounderDrillDownDeck` (swipeable per-agent deck) ·
the reusable lead-drill stack (`LeadDrillModal` + `LeadDrillRow` + `DrillModalShell`, with thin callers
`AgentFirstTouchDrillModal` / `AgentLeadsPredicateDrillModal`) + the three stat-tile modals
(`AgentCallsDrillModal` / `AgentLeadsDrillModal` / `AgentDealsDrillModal`) ·
roster display helpers in `lib/utils/performance-roster-display.ts`.
`EffortGrid`, `AgentCallTrendChart`, and `DomainHealthGrid` are DELETED (2026-06-25 redesign +
2026-07-02 dead-code purge) - never recreate them.

## 5. States

- **Loading:** `performance/loading.tsx` (manager-shaped chrome); `PerformanceSkeleton` (agent shape, behind the agent branch's own Suspense) / `ManagerPerformanceSkeleton`; refetch bars re-timed to `PAGE_DURATION` (0.5 s — design decision 2026-06-11).
- **Empty:** `PerformanceRosterEmptyState` (wraps `<EmptyState>`); per-card zero states render zeros, not empties (a 0% conversion is data). Drill modals show `<EmptyState>` when a slice has no leads.
- **Error:** actions return `{ data, error }`; panels degrade with logged warnings.

## 6. Invariants

Deep dive §12 — **the Critical Date-Field Rule** (`leadsWon`/`conversionRate` by
`status_changed_at`; `touchRate` by `created_at` cohort — intentional asymmetry), period
boundaries are IST, benchmarks compare within domain, never re-fan-out the agent view into
per-metric queries.

Added 2026-06-12:

- **Target meter is month-pinned.** `DomainTargetMeter` always compares THIS MONTH's
  `total_deals` against the monthly `domain_targets` value — it does not move with the
  date filter (page reuses the active fetch when the resolved period IS `this_month`, otherwise
  fetches the month range once). Target null/0 → "No target set." — never a division.
- **Pulse split is a partition.** `get_agent_today_pulse` computes total/new/old with
  `count(*)` + two complementary FILTERs over the same row set — new + old always equals
  total calls today. "Calls" = `lead_notes` with `call_outcome IS NOT NULL` (same
  definition as `calls_logged` in 0101).
- **The "Today" strip reads since-midnight numbers from the pulse only** (the
  pulse `notes_today` is ALL `lead_notes` the agent authored since `p_today_start`, a
  deliberate superset of `calls_today.total`, which filters `call_outcome IS NOT NULL`). The
  strip's Calls / Notes / Won / Revenue come from `pulse.callsToday.total` / `pulse.notesToday`
  / `pulse.deals.dealCount` / `pulse.deals.revenue` - never the period-scoped `effort`/`core`
  fields (the bug fixed by migration 0122). Since the 2026-06-25 redesign there are no tabs and
  no `needsPulse` gate: the ONE pulse fetch fires unconditionally once per mount (the shell
  key-remounts per range) and also feeds the `PipelineLine` revenue and the 14-day fallback trend.
- **Activity load-more uses a composite cursor** `(created_at, id)` — never a single-column
  cursor; page 15 via a button, never infinite scroll. Agent id from the verified profile.

Added 2026-06-15 (first-touch speed scorecard):

- **First-touch SPEED is bucketed in TS, never SQL.** Below the `CallOutcomeBar` in
  `AgentDetailPanel`, `FirstTouchScorecard` distributes the period cohort across `< 15m / 15–30m /
  ≤ 1h / 1–3h / 3h+`, where elapsed = **business minutes** from `leads.created_at` to the lead's
  EARLIEST `lead_notes` row with `call_outcome IS NOT NULL`, computed per the agent's shift
  (`lib/utils/sla.businessMinutesBetween` + `buildAgentShiftOverride`; NULL shift → global
  `BUSINESS_HOURS`). The calendar math is TS-only — the RPC `get_agent_first_touch_pairs` (0123,
  admin client, EXECUTE revoked per Q-13) returns raw `(lead_id, created_at, first_call_at)` pairs
  and the service (`classifyFirstTouchPairs`) buckets them. **Never fork the SLA ruler into SQL (R-01).**
- **Buckets sum to leads-with-a-first-call.** Cohort leads with no qualifying call note are a
  separate `untouched` count (footnote), never a speed bucket, never dropped
  (`leadsWithFirstCall + untouched = totalCohort`). A 2am-arrival / 9:15am-call lead lands in
  `< 15m` (business-adjusted), not 3h+.
- **Cached, not per-render.** The per-row business-minute loop runs once per (agent, period) — the
  React `cache()` aggregate, not a render-time computation. Mount points are `AgentDetailPanel`
  (below `CallOutcomeBar`) AND the `FounderDrillDownDeck` card. On the deck it rides the breakdown's
  per-agent lazy `Promise.all` — `getAgentFirstTouchScorecardAction` runs alongside
  `getAgentDetailMetricsAction`, folded into the cached `breakdowns[agentId]` ready state
  (best-effort: null → the card omits it). The tile zero-per-swipe-fetch invariant is unaffected —
  that governs the tiles, not the gated breakdown/scorecard reads.

Added 2026-06-16 (pure date-model rewrite):

- **The date model is pure `date_from`/`date_to` URL params for ALL THREE roles.** The bespoke
  `?period=`/`?from=`/`?to=` params, the `all_time` selectability, and the old "Period" dropdown
  are GONE. `period` is internal/derived, never URL-reachable. `resolvePerformanceDateParams` is
  THE single boundary; the service/action signatures (which still take `period` + `customFrom`/
  `customTo`) are untouched.
- **The agent shell key-remounts per range — no client metrics refetch.** `page.tsx` keys
  `AgentPerformanceAsync` by `period:customFrom:customTo`; the agent payload is server-fetched via
  a `Promise.all` of `getAgentPerformanceSummary` + `getAgentPerformanceTrend` (migration 0146)
  and passed as `initialData` + `trend` props (`data = initialData` in the shell).
  The ONLY client fetch left on the agent view is the Today pulse. There is **no**
  `getAgentSelfMetricsAction` — it does not exist.

Added 2026-06-24 (reusable lead-drill stack):

- **One reusable lead-drill path.** Every "click a metric/bar → see the leads → open the dossier"
  surface funnels through `LeadDrillModal` (generic fetch-on-open, flat, bounded, no load-more),
  `LeadDrillRow` (name + phone + status pill, a `Link` to `/leads/${slug ?? id}?from=/performance`),
  and `DrillModalShell` (nested-modal portal/z). Thin callers are `AgentFirstTouchDrillModal`
  (first-touch bar) and `AgentLeadsPredicateDrillModal` (pipeline segment OR outcome slice — one
  `{ kind: 'status' | 'outcome' }` discriminated union). Adding a drillable metric = a gated action
  returning `LeadListItemWithAssignee[]` + a `LeadDrillModal` mount — never a new modal/row/fetch
  lifecycle (R-01).
- **Charts emit clicks, never fetch.** `PipelineBar.onSegmentClick(status)`,
  `CallOutcomeBar.onSliceClick(outcome)`, `FirstTouchScorecard.onBucketClick(bucketId)` are all
  OPTIONAL — absent → display-only (A-06, backward-safe). The drill state lives in the consumer
  (`AgentDetailPanel`'s `predicateDrill`/`ftBucket`, the deck's `PredicateTarget`).
- **Selection survives back-nav.** `ManagerPerformancePanel` seeds `selectedId` from the
  `?agent=<id>` URL param (lazy `useState` init) and mirrors it back via
  `window.history.replaceState` — NOT `router.replace` (no RSC re-run). So drilling a lead → its
  dossier (the row link carries `from=/performance`) → browser back remounts the page and restores
  the selected agent + open detail panel.
- **`AgentDetailPanel` per-slice memory cache.** A module-level `detailSliceCache` Map keyed by
  `agent|domain|period|from|to` seeds the panel synchronously on a back-nav / re-click hit — no
  skeleton, no round-trip. A miss fetches and writes the slice. In-memory only; a period change is
  a new key, so it never serves the wrong window.

## 7. Open items

None recorded.

---

## 8. Deep dive

> Section numbering preserved from the original intelligence document.

### 1. Module Overview

**Route:** `/performance` — one URL, three role-specific layouts.

| Role | View | Primary shell | Redirect if unauthorized |
| ------ | ------ | --------------------- | ------------------------- |
| `agent` | Self-view: lean single-page scorecard (no tabs), motivational footer | `AgentPerformanceShell` (client) | - |
| `manager` | Team view: agent roster (left) + agent detail (right) | `ManagerPerformanceShell` (client, owns the filter strip) wrapping `ManagerPerformanceAsync` as `rosterSlot` | - |
| `founder` / `admin` | Two-tab shell: **Agents** (same team UI as manager, all domains; domain narrowing client-side on roster) + **Domains** (per-domain health cards + comparative bar chart) | `FounderPerformanceShell` (owns tab state) → Agents tab is `ManagerPerformanceAsync allDomains` injected as `agentsSlot`; Domains tab is `DomainOverviewPanel` | — |
| `guest` | — | — | `redirect('/dashboard')` |

**Branching** (exact order in `src/app/(dashboard)/performance/page.tsx`):

1. `getCurrentProfile()` — no profile → `redirect('/login')`
2. `profile.role === 'guest'` → `redirect('/dashboard')`
3. Read `params.date_from` / `params.date_to` (strings or null) → `resolvePerformanceDateParams(dateFrom, dateTo)` → `{ period, from, to, customFrom, customTo }`. This runs for ALL roles before the branch.
4. `profile.role === 'agent'` → agent layout - renders `<PerformanceFilters showSearch={false} />` then `AgentPerformanceAsync` (server-side `Promise.all` of `getAgentPerformanceSummary(period, customFrom?, customTo?)` + `getAgentPerformanceTrend(period, customFrom?, customTo?)` - the 0146 daily series, passed as `trend`) inside `<Suspense fallback={<PerformanceSkeleton />}>`.
5. `profile.role === 'manager'` → manager layout: `ManagerPerformanceShell` (a client component the page renders directly; it owns the `PerformanceFilters` strip and hosts the roster's "Deck view" trigger on the bar's trailing edge via the `FounderPerfActionsProvider` bridge) with `rosterSlot={<Suspense fallback={<ManagerPerformanceSkeleton />}><ManagerPerformanceAsync domain={profile.domain} … /></Suspense>}`.
6. Else (founder / admin) → resolve `scopeDomain = resolveDomainParam(params, await cookies(), role)` (the SAME global `serene-domain` selector the list pages read) and narrow `healthDomains = scopeDomain ? [scopeDomain] : GIA_DOMAINS` (2026-06-25). Then one server-side `Promise.all`: `getDomainHealthMetrics(healthDomains, from, to)` (active-period, custom-range aware) → `initialDomainHealth`; a **second month-pinned** `getDomainHealthMetrics(healthDomains, thisMonth)` call - **skipped (resolves `null`) when the active period already IS `this_month`** - folded into `monthDeals` (`{ [domain]: totalDeals }` for the month-pinned target meter); and `getDomainTargets()` → `domainTargets`. Then renders `FounderPerformanceShell` with `domain={DEFAULT_GIA_DOMAIN}` placeholder, `period`/`customFrom`/`customTo`, `initialDomainHealth`, `initialTargets`, `monthDeals`, `scopeDomain`, `canEditTargets={true}`, and `agentsSlot={<Suspense><ManagerPerformanceAsync allDomains /></Suspense>}`.

All three role `<main>` elements use `flex-1 min-w-0 p-4 sm:p-6 lg:p-8`. `PageControls` renders in the header when `TOP_BAR_ENABLED` (founder/admin pass `isPrivileged`).

**Service boundary:** Performance queries live only in `performance-service.ts`. Never extend `leads-service.ts` or `dashboard-service.ts` for this module.

---

### 2. Data Indexes — migration 0013

File: `supabase/migrations/20260528000013_performance_indexes.sql`

| Index name | Columns | Partial condition | Queries benefited |
| ------------ | --------- | ------------------- | ------------------- |
| `idx_lead_activities_actor_status` | `lead_activities(actor_id, action_type, created_at DESC)` | none | First-touch / response-time lookups |
| `idx_lead_notes_author_outcome` | `lead_notes(author_id, created_at DESC)` | none | `get_agent_performance` RPC (effort + outcomes), `getAgentDetailMetrics` |
| `idx_leads_assigned_status_created` | `leads(assigned_to, status, created_at DESC)` | `WHERE archived_at IS NULL` | Cohort queries by `assigned_to` + `created_at` |

---

### 3. Date model

#### 3a. `PerformancePeriod` type

Defined in `src/lib/services/performance-service.ts`:

```typescript
export type PerformancePeriod =
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'all_time'
  | 'custom';
```

The enum is still the service-layer key, but it is **DERIVED, not URL-reachable** (2026-06-16).
The UI carries pure `date_from`/`date_to`; `resolvePerformanceDateParams` maps them to this enum.
`all_time` is no longer selectable from the UI (Last 3 Months is the widest preset);
`getPeriodDateRange('all_time')` + the `case 'all_time'` branches stay for the type's completeness
and any internal caller. Never re-add `?period=` parsing.

#### 3b. `resolvePerformanceDateParams(dateFrom, dateTo)` — THE date-model boundary

Pure function (no `cookies()`/DB — safe in a server component). Both server pages
(`/performance`, `/budget`) call it. Returns `{ period, from, to, customFrom, customTo }`:

- **No (or partial) range** → `period: 'this_month'`, `from`/`to` from `getPeriodDateRange('this_month')`, `customFrom`/`customTo` null.
- **A preset-matched range** (`matchDateRangePreset` returns `today` / `this_week` / `this_month` / `prev_month`) → that period enum via `PRESET_TO_PERIOD` (so previous-period benchmarks survive), `customFrom`/`customTo` null.
- **Any other range** → `period: 'custom'`, `customFrom`/`customTo` set to the explicit bounds.

**IST boundary contract:** `from` is widened to IST midnight via `toISTMidnight`; `to` is widened
to IST end-of-day (`toISTEndOfDay`, 23:59:59.999) because the RPCs filter `created_at <= p_date_to`
inclusive — a bare `YYYY-MM-DD` would coerce to 00:00:00 and drop the final day.

#### 3c. `getPeriodDateRange(period)` / `getPreviousPeriodDateRange(period)`

Pure IST math — no DB call. IST boundary helpers (`toISTMidnight`, `toISTEndOfDay`,
`getISTMondayStart`, `getISTMonthStart`, `getISTPrevMonthRange`) live in `lib/utils/ist.ts` — never
re-forked in the service.

| Period | `from` | `to` |
| -------- | -------- | ------ |
| `today` | IST midnight today | `now` |
| `this_week` | IST Monday 00:00:00 of current week | `now` |
| `this_month` | IST 1st of current month 00:00:00 | `now` |
| `last_month` | IST 1st of previous month 00:00:00 | IST last moment of previous month |
| `all_time` | `2024-01-01T00:00:00Z` | `now` |
| `custom` | (fallback) same as `this_month` | `now` |

**`custom` fallback in `getPeriodDateRange`:** Falls through to `return getPeriodDateRange('this_month')`. Custom bounds are always passed by the orchestrator as ISO strings; this is a safe fallback only.

**Previous period** (`getPreviousPeriodDateRange`):

- `today` → yesterday IST (midnight to midnight)
- `this_week` → prior Mon–Sun (IST)
- `this_month` → `getPeriodDateRange('last_month')`
- `last_month` → calendar month before last (IST)
- `all_time` / `custom` → `null` (no well-defined previous window — the RPC then returns `previous: null`)

**Type export note:** `TeamBenchmarks`, `AgentPerformanceSummary`, `FirstTouchScorecard` are
exported from `performance-service.ts`. `AgentRosterRow` and `AgentDetailMetrics` live in
`src/lib/types/index.ts`.

---

### 4. The Critical Date-Field Rule

**Do not regress.**

1. **`leadsWon`:** Filter by `status_changed_at` where `status = 'won'` (self-view core, in SQL); detail/roster source `leadsWon` from `public.deals.won_at`.
2. **`conversionRate`:** Denominator = won + lost, where won/lost are counted by `status_changed_at`.
3. **`touchRate`:** **Intentionally remains on `created_at`** — "of leads created in the period, what % moved past `new`?" This is not the same bug as (1–2). Do not change without an explicit product decision.
4. **`getAgentRosterPerformance`:** Cohort `totalLeads` from `created_at`; won/lost `status_changed_at`; revenue from `public.deals.won_at` (all in SQL).
5. **`getAgentDetailMetrics`:** `totalLeads`/`pipelineBreakdown` from cohort `leads.created_at`; `leadsWon`/`totalDealAmount`/`dealTypeBreakdown` from `public.deals` by `won_at`; `totalCallsMade` = `SUM(call_count)` on cohort leads; `callOutcomeBreakdown` from `lead_notes WHERE call_outcome IS NOT NULL` filtered by the NOTE's `created_at` in the period (call EVENTS, not leads — see §5). `callsToday = totalCallsMade` (NOT a separate IST-today window — see §5).
6. **Deal revenue** (roster `totalDealAmount` and detail `totalDealAmount`/`dealTypeBreakdown`): from `public.deals` filtered by `won_at` — never from a `leads` column (those columns were dropped in 0097).

**Rule for new metrics:** outcome/closure → `status_changed_at` (or `public.deals.won_at`). Cohort/intake → `created_at`. Activity (calls, notes) → `lead_notes.created_at` or `lead_activities.created_at`.

---

### 5. Service Functions — `performance-service.ts`

#### `resolvePerformanceDateParams(dateFrom, dateTo)`

THE date-model boundary — see §3b. Pure; no DB.

#### `getPeriodDateRange(period)` / `getPreviousPeriodDateRange(period)`

Pure IST math — no DB call. See §3c.

#### `getAgentPerformanceSummary(period, customFrom?, customTo?)` — perf audit D-2, 2026-06-11

ONE `get_agent_performance` RPC round trip (migration 0101) returning
`{ core, previous, effort, outcomes, benchmarks }` — it replaced the deleted
per-metric functions (`getCoreFourMetrics`, `_getCoreFourMetricsForRange`,
`getPreviousPeriodCoreMetrics`, `getEffortMetrics`, `getCallOutcomeBreakdown`,
`getTeamBenchmarks`; their **types** remain exported). React `cache()`-wrapped
(session client inside `cache()` — the RPC reads `auth.uid()`, so the session client is mandatory;
this is the canonical P-09 reference).

- **Self-scoped:** the RPC reads `auth.uid()` + `get_user_domain()` — no identity
  params; an agent can never read another agent's metrics through it.
- Date-field rules preserved in SQL: `leadsWon`/`conversionRate` →
  `status_changed_at`; touch cohort → `created_at`; effort `callsLogged`/`notesWritten`
  → `lead_notes.created_at` in period; `inDiscussionCount`/`nurturingCount` — **no
  period filter** (live pipeline snapshot); outcomes → `lead_notes` with
  `call_outcome IS NOT NULL` in period.
- Rate math + null-vs-zero semantics live in the service mapper, not SQL.
- Previous period: `getPreviousPeriodDateRange` → null for `all_time`/`custom` →
  RPC returns `previous: null`.
- **Benchmarks** (inside the same payload): unweighted mean of per-agent means over
  the caller's domain roster; `agentCount < 2` → all averages `null` (guard in the
  service); `leadsWon` excluded by design. Computed SECURITY DEFINER = true
  domain-wide averages — the old session-client version was silently reduced by
  agent RLS to the caller's own rows.

#### `getAgentPerformanceTrend(period, customFrom?, customTo?)` - migration 0146, 2026-06-25

ONE self-scoped `get_agent_performance_trend(p_date_from, p_date_to)` call (session client inside
React `cache()` - the RPC reads `auth.uid()`, the `get_agent_today_pulse` pattern, client-callable
GRANT). Returns `AgentTrendPoint[]` - one zero-filled bucket per IST calendar day in the range,
oldest first: `{ day, leadsWon, calls, notes }`. Definitions match 0101/0108: `leadsWon` by
`status_changed_at`, `calls` = notes with `call_outcome IS NOT NULL`, `notes` = all authored notes.
Rate metrics are deliberately absent (a daily rate off 0-2 closes is noise). Feeds
`AgentActivityTrendChart` and the one honest `CoreFourGrid` sparkline (Leads Won). Fetched
server-side in `AgentPerformanceAsync` alongside the summary - no client refetch.

#### `getAgentRosterPerformance(domain, dateFrom, dateTo)` — RPC-backed (D-2)

ONE `get_agent_roster_performance` call (migration 0101) — one pre-aggregated row
per active agent; LEFT JOINs keep zero-activity agents. Role-gated in SQL: manager
always pinned to `get_user_domain()`; admin/founder pass `domain === null` for all
agents; agents get zero rows. Cohort `created_at`; won/lost `status_changed_at`;
revenue from `public.deals.won_at`. Sort (in the service): `leadsWon
DESC`, then `conversionRate DESC` (null → `-Infinity` — never floats above real data).
Sidebar display order is separate (see `performance-roster-display.ts`).

#### `getAgentDetailMetrics(agentId, domain, dateFrom, dateTo)`

**4** Supabase queries via one `Promise.all` (never sequential):

1. cohort leads (`id, status`, `created_at` in range) → `totalLeads` + `pipelineBreakdown`;
2. won deals from `public.deals` filtered by `won_at` → `leadsWon` + `totalDealAmount` + `dealTypeBreakdown`;
3. cohort leads (`call_count`, `created_at` in range) → `totalCallsMade` (`SUM(call_count)`);
4. call notes — `lead_notes WHERE call_outcome IS NOT NULL` on this agent's leads (via `lead:leads!inner(assigned_to)`), filtered by the NOTE's `created_at` in the period → `callOutcomeBreakdown`.

**`callsToday` is NOT a separate IST-today query.** It is set equal to `totalCallsMade`
(`callsToday: totalCallsMade` in the mapper). There is no IST-midnight boundary computation in this
function — all queries are scoped to `dateFrom`/`dateTo`. The `callsToday` field name is retained
for type/UI compatibility but no longer means "calls since IST midnight." `domain` is auth-only — it
does not filter any query.

> **Stale-comment warning:** the `AgentDetailMetrics` type comment in
> `src/app/(dashboard)/performance/CLAUDE.md` still annotates `callsToday` as "IST midnight
> boundary" with the `nowIst`/`setUTCHours` snippet. That comment is stale — the SOURCE
> (`getAgentDetailMetrics`) sets `callsToday = totalCallsMade`. The CODE is authoritative.

**`callOutcomeBreakdown` counts call EVENTS, not leads** (a lead called five times contributes five
outcomes), grouped by outcome — matching `get_agent_performance.outcomes` (the agent self-view) and
the Recent-calls drill modal, which read the same `lead_notes` source. This was the 2026-06-17 fix:
the old path counted `leads.last_call_outcome` (the LATEST outcome per lead over a `created_at`
cohort), which decoupled outcome from the period and diverged from every other call surface.

Revenue is sourced from `public.deals` (`deal_amount`, `won_at`), never from a `leads` deal column.

#### `getDomainHealthMetrics(domains, dateFrom, dateTo)`

Calls `get_domain_health_metrics` RPC (admin client — EXECUTE revoked per 0102/0107) — one
round-trip for all domains. `conversionRate` computed in service: `won + lost > 0 ? won / (won + lost) * 100 : null`.
All bigint fields through `Number()`. Returns `DomainHealthCard[]` (carries `totalDeals`, 0107).
Drives the founder **Domains** tab + the month-pinned meter. `domains.length === 0` → `[]`.

#### `getAgentTodayPulse(period, customFrom?, customTo?)` — migration 0108

ONE self-scoped `get_agent_today_pulse` call. The IST day boundary (`p_today_start`) is computed
HERE via `toISTMidnight` (never re-forked in SQL). Returns
`{ callsToday: { total, newLeads, oldLeads }, notesToday, callTrend: { day, count }[], deals: { dealCount, revenue } }`.
`callsToday` = since-IST-midnight calls (new/old split — a partition); `notesToday` = ALL notes
since midnight (superset, migration 0122); `callTrend` = oldest-first 14 entries; `deals` = period
deals from `public.deals`. Backs the agent scorecard's `TodayStrip`, the `PipelineLine` revenue,
and the fallback 14-day trend (the shell has no tabs since 2026-06-25).

#### `getAgentLeadActivityPage(agentId, cursor?, actionType?)`

Keyset load-more over `lead_activities` scoped to the agent's leads (via `lead:leads!inner`); page 15;
COMPOSITE cursor `(created_at, id)`. The typed `actionType` (`'all' | 'call_logged' | 'note_added' |
'status_changed'`) is a top-level `.eq` ANDed with the cursor `.or()` group (never folded into the
`.or()` string). The select carries `leads.phone`, the call outcome (from the row's own
`details->>'outcome'`), and the note body (correlated from a batched `lead_notes` query — exact
`lead_id|created_at` match first, falling back to most-recent-per-lead).

#### `getAgentCallsPageForManager(agentId, cursor?)` — Phase 5

THE "Recent calls" source. Queries `lead_notes WHERE call_outcome IS NOT NULL` directly (the call
record itself → one row per call, structurally no `note_added` duplicates), same composite
`(created_at, id)` keyset, page 15. The leads RLS is the manager/founder second layer; the
action-layer domain guard is the first.

#### `getAgentFirstTouchScorecard` / `getAgentFirstTouchBucketLeadIds` — migration 0123, 2026-06-15/24

`classifyFirstTouchPairs(agentId, from, to)` (private) is THE single first-touch classification
pass: fetch the raw `(lead_id, created_at, first_call_at)` pairs (admin client — RPC EXECUTE revoked
0123), resolve the agent's shift ONCE via `getAgentRoutingConfigAdmin` + `buildAgentShiftOverride`
(NULL → global `BUSINESS_HOURS`), then `businessMinutesBetween` → `firstTouchBucketForMinutes` per
row, tallying lead-ids per bucket (and `untouched` for `first_call_at IS NULL`). Both
`getAgentFirstTouchScorecard` (React `cache()`, returns counts `{ buckets, untouched,
leadsWithFirstCall, totalCohort }`) and `getAgentFirstTouchBucketLeadIds(…, bucketId)` (React
`cache()`, returns the lead-id list behind one bar) read it — so a bar's count and its drill list
can never diverge (R-01). Buckets (`FIRST_TOUCH_BUCKETS`, `lib/constants/performance.ts`): `lt15` /
`lt30` / `lte1h` / `lt3h` / `gte3h`, success→danger token colours.

#### `getDomainsWithLeads(dateFrom, dateTo)`

Legacy helper — retained but not called from current shells.

---

### 6. Server Actions — `performance.ts`

Every action is Zod-first and returns `ActionResult<T>` (`{ data, error }`). The drill-downs share
`assertDrillAccess(domain)` — a preamble that runs `requireProfile(['manager','admin','founder'])`
then, for a manager caller, requires `domain === caller.domain` (fails CLOSED on null/mismatch);
admin/founder pass `domain === null` and are unrestricted. It returns the verified `caller` for the
read.

#### `getAgentDetailMetricsAction(agentId, domain, period, customFrom?, customTo?)`

Manager/founder/admin (`GetAgentDetailSchema`). Manager must pass matching `domain`; agent/guest
denied. Resolves the range (custom override aware), calls `getAgentDetailMetrics`. Returns
`ActionResult<AgentDetailMetrics>`. Called by `AgentDetailPanel` + the founder deck breakdown.

#### `getAgentFirstTouchScorecardAction(agentId, domain, period, customFrom?, customTo?)`

Same `GetAgentDetailSchema`; gate is `assertDrillAccess`. Resolves the range, calls
`getAgentFirstTouchScorecard`. Returns `ActionResult<FirstTouchScorecard>`. Called by
`AgentDetailPanel` (alongside the metrics fetch) + the founder deck.

#### `getFirstTouchBucketLeadsAction(agentId, domain, bucketId, period, customFrom?, customTo?)` — 2026-06-24

The drill behind a clicked First-Touch Speed bar (`GetFirstTouchBucketSchema`, `bucketId` validated
against `FIRST_TOUCH_BUCKETS`; `assertDrillAccess` gate). Resolves the range → `getAgentFirstTouchBucketLeadIds`
(reuses the scorecard's classification, so the list length equals the bar's count) → `getLeadsByIds`
scoped by the caller's role/domain. Returns `ActionResult<LeadListItemWithAssignee[]>`. No new query,
no re-bucketing. Called by `AgentFirstTouchDrillModal`.

#### `getAgentLeadsByPredicateAction(agentId, domain, period, predicate, customFrom?, customTo?)` — 2026-06-24

The drill behind a clicked Lead-Pipeline segment OR Call-Outcome slice
(`GetAgentLeadsByPredicateSchema`; `assertDrillAccess` gate). `predicate` = `{ status? }` OR
`{ outcome? }` — exactly one, each validated against `LEAD_STATUSES` / `CALL_OUTCOMES` before the
query. Resolves the range, reuses `getLeadsByRole`'s indexed `status` / `last_call_outcome`
predicates + `agent_id` + period (page 1, `pageSize: 200` — one bounded slice), returns a flat
`ActionResult<LeadListItemWithAssignee[]>`. NO new query. The outcome drill filters
`leads.last_call_outcome` (the lead's LATEST outcome), so it is "distinct leads whose latest call was
X" — distinct leads, NOT call events; the modal subtitle says "leads", never donut parity. Called by
`AgentLeadsPredicateDrillModal`.

#### `getManagerRosterAction(period, allDomains, customFrom?, customTo?)`

Manager/founder/admin only. Resolves the range, then `rosterDomain = (allDomains || caller.role !== 'manager') ? null : caller.domain`
— manager is always pinned to their own domain regardless of the `allDomains` flag. Calls
`getAgentRosterPerformance`. Returns `ActionResult<AgentRosterRow[]>`. Called by
`ManagerPerformancePanel` on client-side period/date change (roster refetch without remount).

#### `getDomainHealthMetricsAction(period, customFrom?, customTo?, domain?)`

Manager/founder/admin only. The optional 4th `domain` arg (2026-06-25) is the Domains-tab
global-selector scope: when set, the action fetches just that domain's card
(`getDomainHealthMetrics([domain], from, to)`); omitted → all `GIA_DOMAINS`.
Returns `ActionResult<DomainHealthCard[]>`. Called by `DomainOverviewPanel` on the founder
**Domains** tab on period/date change (it passes `scopeDomain ?? undefined`).

#### `getAgentPulseAction(period, customFrom?, customTo?)`

Agent-only (`GetAgentSelfSchema`; `requireProfile(['agent'])`). Calls `getAgentTodayPulse`. Returns
`ActionResult<AgentTodayPulse>`. Called by `AgentPerformanceShell` (the ONE pulse fetch).

#### `getAgentRecentLeadActivityAction(cursor?)`

Agent-only. Cursor validated (`ActivityCursorSchema`); the agent id always comes from the verified
profile, never the client. Calls `getAgentLeadActivityPage`. Returns
`ActionResult<AgentLeadActivityPage>`. Called by `AgentRecentActivityList` (the scorecard's recent-activity load-more).

#### `upsertDomainTargetAction(domain, targetValue)`

Admin/founder only. Zod first (S-01): `domain ∈ GIA_DOMAIN_ENUM`, `targetValue` a non-negative
number ≤ 100,000. Then `requireProfile(['admin','founder'])` (RLS write policy is the second layer),
then `upsertDomainTarget(domain, value, callerId)` in `domain-targets-service.ts` (admin-client
upsert on `(domain, metric='deals_closed', period='month')`). Returns `ActionResult<DomainTarget>`
(the optimistic row). Called by `DomainOverviewPanel` / `DomainTargetMeter`.

#### Drill-downs (founder deck + detail-panel stat tiles + Domains tab)

- `getAgentCallsForManagerAction(agentId, domain, cursor?)` → `AgentCallsPage` ("Recent calls", `getAgentCallsPageForManager`).
- `getAgentLeadsScopedAction(agentId, domain, page?, period?, customFrom?, customTo?)` → `LeadsResult`. When `period` is supplied (2026-06-20) it resolves the range and passes `date_from`/`date_to` into `getLeadsByRole` so the drill list's total equals the period-scoped Leads tile; omitted → all-time (legacy).
- `getAgentDealsScopedAction(agentId, domain, page?)` → `DealsResult` (existing `getDealsByRole`, `filters.agent_id`; `getDealsByRole` needs a non-null AppDomain so the caller's own `caller.domain` is passed, never the nullable checked `domain`).
- `getDomainLeadsDrillAction(domain, kind, period, customFrom?, customTo?)` - the DOMAIN-scoped drill behind the Domains-card **Leads** and **Calls** tiles (2026-06-24/25). Reuses `getLeadsByRole` with `filters.domain`, NO `agent_id`, period range; `kind: 'all' | 'calls' | 'won'`. Called by `DomainLeadsDrillModal`.
- `getDomainDealsDrillAction(domain, period, customFrom?, customTo?)` - the Domains-card **Deals Closed** and **Revenue** tile drill (2026-06-25). Those tiles count `public.deals` by `won_at`, so this lists DEALS via `getDealsByRole` (`filters.domain` + `won_at` range, NO `agent_id`) - the drill total provably equals the card number. Called by `DomainDealsDrillModal`.

> **Deleted:** `getAgentActivityForManagerAction` (the full-feed drill reuse) no longer exists - zero references repo-wide.

All go through `assertDrillAccess`. Leads/deals reuse the EXISTING `getLeadsByRole` / `getDealsByRole`
paths with `filters.agent_id` (no new service query — those paths already honour `agent_id` on the
manager/founder branch; the agent-caller branch ignores it, but these actions are gated to manager+).
`getAgentCallsPageForManager` is the only new read fn (`lead_notes` for phone+outcome+note fidelity).

> **There is no `getAgentSelfMetricsAction`.** It was deleted in the 2026-06-16 rewrite — the agent
> payload is server-fetched in `page.tsx`. `AgentSelfMetrics` survives only as a re-exported type
> alias of `AgentPerformanceSummary` for the shell's prop import.

---

### 7. The `/performance` Page — Role Branching

#### 7a. `page.tsx`

| Role | Title | Filter | Content |
| ------ | ------- | -------- | --------- |
| Agent | "Your Performance." | `PerformanceFilters showSearch={false}` (rendered by the page) | `AgentPerformanceAsync` (key-remounted) + `PerformanceMotivationalFooter` |
| Manager | "Team Performance." | owned by `ManagerPerformanceShell` (`showSearch`, deck trigger in `trailing`) | `ManagerPerformanceShell rosterSlot={Suspense → ManagerPerformanceAsync domain={profile.domain}}` |
| Founder/admin | "Performance." | owned by `FounderPerformanceShell` (`showSearch`, Agents/Domains tabs in `tabSlot`, deck trigger in `trailing`) | `FounderPerformanceShell` |

**Agent branch:** `AgentPerformanceAsync` runs a server-side `Promise.all` of
`getAgentPerformanceSummary(period, customFrom?, customTo?)` (the self-scoped RPC; replaces the old
5-call / ~17-query fan-out) and `getAgentPerformanceTrend(…)` (the 0146 daily series), passing them
as `initialData` + `trend` to `AgentPerformanceShell`, key-remounted by `${period}:${customFrom ?? ''}:${customTo ?? ''}`.
`PerformanceMotivationalFooter` is server-rendered from the same fetch
(`initialData.core.leadsWon`, `initialData.effort.inDiscussionCount`, `period`). The Suspense
fallback is `PerformanceSkeleton` (the agent shape), so the agent's exposure to the manager/founder
`loading.tsx` chrome is bounded to the profile-fetch window.

**Manager domain rule:** `domain={profile.domain}` is server-verified. **Never** read `searchParams.domain`.

**Default range (all roles):** no `date_from`/`date_to` params → `resolvePerformanceDateParams` returns `period: 'this_month'`.

#### 7b. `PerformanceFilters`

Used by all three roles. Props: `{ showSearch, searchPlaceholder?, searchAriaLabel?, tabSlot?, trailing? }` -
`tabSlot` is the far-right tab cluster (the founder Agents/Domains `TabSelector`, and the `/budget`
Accounts/Campaigns tabs) and `trailing` is the right-edge action slot (the Agents-tab "Deck view"
trigger), so the tabs and the trigger share the one paper filter strip. Composes `<FilterBar>`
(`layout="scroll"`) with `useUrlFilters` - the SAME date contract as `/leads` and `/budget`:

| Control | Behaviour |
| --------- | ---------- |
| Sliders icon + badge | `activeCount` = (search ? 1 : 0) + (date_from ? 1 : 0) + (date_to ? 1 : 0) |
| `SearchBar` | `showSearch` only ("Search agents…"); debounced via `useUrlFilters`; URL `?search=`; filters roster client-side |
| Range trigger + panel | the FilterBar's built-in `<DateRangePresetList>` (Today…Last 3 Months) — `onPresetSelect` pushes `date_from`/`date_to` atomically |
| Dates trigger + panel | the FilterBar's `<DateRangeFields>` (From → To) — `onFromChange`/`onToChange` push `date_from`/`date_to` |
| Clear | `url.clearAll` |

There is no bespoke "Period" dropdown and no separate `DatePicker` pair — the FilterBar owns both
panels. Below md the bar auto-collapses to the single-row scroll layout.

---

### 8. Agent Self-View - the lean single-page scorecard (redesigned 2026-06-25)

#### 8a. `AgentPerformanceShell`

**Location:** `src/components/performance/AgentPerformanceShell.tsx` (`'use client'`)

**Props:**

```typescript
{
  agentId:     string;
  agentDomain: string;
  period:      PerformancePeriod;   // derived from URL params by the page
  customFrom:  string | null;       // ISO bound, non-null only for a 'custom' range
  customTo:    string | null;
  initialData: AgentSelfMetrics;    // server-fetched for the resolved range
  trend:       AgentTrendPoint[];   // real daily series (migration 0146)
}
```

`period`/`customFrom`/`customTo` arrive as PROPS (URL-driven, immutable for a mount) — the page
key-remounts the shell per range. There is **no in-shell period state, no period selector, no
tab state, no metrics-refetch effect**. `data = initialData` directly.

**Layout - one scrollable column, no tabs (the 2026-06-25 redesign removed Overview/Today):**

1. **`TodayStrip`** - the deals-strip-style stat bar: four `StatTile variant="cell"` cells
   (Calls / Notes / Won / Revenue), "since midnight IST", fed from the pulse
   (`pulse.callsToday.total` / `pulse.notesToday` / `pulse.deals.dealCount` /
   `pulse.deals.revenue`); the formatters' null contract renders their em-dash placeholder
   until the pulse resolves.
2. **`CoreFourGrid`** - the period KPIs, with `wonTrend={trend.map(p => p.leadsWon)}`.
3. One paper card holding **`AgentActivityTrendChart`** (the period series; label
   "Activity · This Period", or "Daily Calls · Last 14 Days" when `trend.length < 2` and the
   pulse 14-day fallback renders) and **`PipelineLine`** - one calm row of
   In Discussion (live, `data.effort.inDiscussionCount`) · Nurturing (live) · Revenue (period,
   from the pulse). `PipelineLine` replaces the retired `EffortGrid` live-pipeline cards.
4. **`CallOutcomeBar`** - display-only outcome mix for the range.
5. **`AgentRecentActivityList`** - keyset load-more.

`CoreFourGrid`, `CallOutcomeBar`, and `AgentActivityTrendChart` all load via `next/dynamic`
behind same-shape `.skeleton` fallbacks (Recharts stays out of the initial chunk, perf G-3).

**State owned:** `pulse: AgentTodayPulse | null` only.

**The ONE pulse fetch.** A single `getAgentPulseAction(period, customFrom?, customTo?)` plain
`.then()/.catch()` chain (cancelled ref; no `startTransition` — it would defer `setPulse(null)`)
fires **unconditionally once per mount** (the shell key-remounts per range, so a range change is
a fresh mount). There is no `needsPulse` gate anymore - no tabs means nothing to gate. The pulse
feeds the `TodayStrip`, the `PipelineLine` revenue, and the fallback 14-day trend.
**Never add a second `getAgentPulseAction` call** (invariant).

#### 8b. `CoreFourGrid`

- **Layout:** single row of 4 KPI cards (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`).
- **Per card:** Eyebrow; accent-surface icon chip; Playfair value; period delta with ↑/↓/−; optional benchmark strip; tertiary sub-label.
- **Sparkline - honest only (2026-06-25):** the synthetic per-card sparklines are GONE. Only **Leads Won** renders one, from the real daily `wonTrend` series (migration 0146); rate cards omit it (a daily rate off 0-2 closes is noise, not trend). Absent/empty series → no sparkline rendered.
- **Benchmarks:** `agentCount < 2` → all averages `null` → strip omitted entirely (not "—").
- **Response time benchmark:** Lower is better — accent pip when agent value **<** domain average.
- **Null contract:** `avgResponseTimeMinutes` and `conversionRate` render **"—"** — never `0m` / `0%`.

#### 8c. Retired agent-view components

`EffortGrid.tsx` (the 4 effort cards) and `AgentCallTrendChart.tsx` (the single-series 14-day
area chart) are DELETED. The live In Discussion / Nurturing counts now render in the in-shell
`PipelineLine` row; the trend surface is `AgentActivityTrendChart` (multi-series Calls · Notes ·
Won over the period, falling back to the pulse 14-day call series when the range plots fewer
than 2 buckets - no extra fetch). Never recreate the deleted files.

#### 8d. `CallOutcomeBar`

Left legend (pill rows: dot, label, count, %) + right `PieChart` donut (`DONUT_SIZE` 180px explicit,
not "100%"). Outcome config (`OUTCOME_CONFIG`) maps the five `CallOutcome` values to token colours;
fills resolved via `resolveColorMap`. Optional `onSliceClick(outcome)` turns each legend row + slice
into a tap target (opens `AgentLeadsPredicateDrillModal`); absent → display-only. Empty: Playfair
italic "No calls logged this period." Loaded via `next/dynamic` from each Recharts call site (perf G-3).

#### 8e. `PerformanceMotivationalFooter`

Server component in `page.tsx`. Playfair italic, no glyph. Renders below agent content. Copy: if
`leadsWon > 0` → closed count (`PERIOD_PHRASE` maps `this_week`/`this_month`/`last_month` to a phrase,
else "in this period"); else if `inDiscussionCount > 0` → "almost there"; else → "Every expert was
once a beginner."

#### 8f. `PerformanceSkeleton`

Agent-shaped skeleton: Tier 1 — 4 KPI card skeletons; Tier 2 — 4 effort skeletons; Tier 3 — outcome
card skeleton (legend rows + donut). Used by the agent branch's Suspense fallback.

---

### 9. Manager View

#### 9a-0. `ManagerPerformanceShell` (new, 2026-06-25)

`src/app/(dashboard)/performance/ManagerPerformanceShell.tsx` - `'use client'`, manager role only.
Mirrors `FounderPerformanceShell`'s single-paper-strip layout minus the Agents/Domains tabs (one
domain, one roster - no tabs). It owns the shared `PerformanceFilters` strip (`showSearch`) and
hosts the roster panel's **"Deck view" trigger** on the filter bar's `trailing` edge, reusing the
SAME `FounderPerfActionsProvider` registration bridge the founder shell uses (R-01 - no second
trigger-hoist mechanism). On mobile the trailing slot stays null (the deck IS the view there).
`rosterSlot` is the server-rendered `ManagerPerformanceAsync` subtree passed as a prop (RSC
composition). The page renders this shell directly in the manager branch.

#### 9a. `ManagerPerformanceAsync`

1. Resolve `from`/`to` (custom override or `getPeriodDateRange(period)`).
2. `rosterDomain = allDomains ? null : domain`; `getAgentRosterPerformance(rosterDomain, from, to)`.
3. Render `ManagerPerformancePanel` — **no `key={period}`** (removed 2026-06-04; period flows through props).

**Invariant:** `ManagerPerformancePanel` must **never** carry `key={period}`. Period state flows
through props, not remount — a remount would reset `selectedId`.

#### 9b. `ManagerPerformanceSkeleton`

Roster column skeleton + detail-panel skeleton (avatar + name lines, stat strip, bar blocks). Used by
`loading.tsx` and the in-page manager/founder Suspense fallback.

#### 9c. `ManagerPerformancePanel`

**Props:** `agentRoster`, `domain`, `period`, `customFrom?`, `customTo?`, `allDomains?`.

**Selection — URL-backed (2026-06-24).** `selectedId` seeds from `?agent=<id>` (lazy `useState` init,
default `null` when absent — no agent pre-selected on a fresh load). An effect mirrors `selectedId`
into `?agent=` via `window.history.replaceState` (NOT `router.replace` — no navigation, no RSC
re-run, no history spam). So clicking a drill lead → its dossier (the lead links carry
`from=/performance`) → browser back remounts the page and the lazy init re-reads the param,
restoring the selected agent + open detail panel. A stale `?agent=` self-heals via the
"hide-selected-when-filtered-out" effect.

**Left — roster:**

- Header: "Agents" + count badge + a domain `FilterDropdown` (`allDomains` only — single-select, `menuPortal`, synthetic `__all__` = "All domains").
- The roster domain filter re-syncs to the global `serene-domain` selector (`?domain=` param reactive, cookie fallback post-mount) — picking Shop in the header narrows the founder roster to Shop too. Gated to a domain present in the roster.
- Grouping: `buildPerformanceRosterGroups` — founder: `PERFORMANCE_ROSTER_DOMAIN_ORDER`, A–Z within group; manager: single domain A–Z.
- `AgentCard`: `motion.button`, entrance `x: -8 → 0`; stagger `Math.min(index * 35, 280)` ms.
- Search: `useSearchParams().search` — client filter.
- Roster refetches client-side on period/date change via `getManagerRosterAction` (a 2px accent bar shows; `selectedId` preserved — no Suspense re-suspend).

**Right panel:**

- `selectedId === null` → `<PerformanceRosterEmptyState>` (accent radial wash, Playfair italic prompt; `minHeight: min(320px, 40vh)`).
- `selectedId !== null` → `AgentDetailPanel` inside `AnimatePresence mode="wait"` keyed by `selectedAgent.id`.

**Mobile founder deck (founder all-domains only).** On a phone (`isMobileDeck = useMediaQuery(MQ.mobile) && allDomains`)
the panel takes an **early-return branch that renders the deck ONLY** — the two-column list is never
in the tree. The deck auto-opens once per mount via an `autoOpenedDeck` ref latch (a manual close is
respected); a closed deck shows a calm inline "Open agent deck" prompt, never the list. On desktop/
tablet the deck stays a trigger-driven overlay: the "Deck view" button is hoisted onto the hosting
shell's filter strip (`trailing` slot) via `useFounderPerfActions` - the founder shell AND
`ManagerPerformanceShell` both host it, so **managers get the deck too** (2026-06-25;
`showDeckTrigger = visibleAgents.length > 0`, no role gate). Managers and desktop/tablet never auto-open.

#### 9d. `AgentDetailPanel`

**Props:** `agent`, `domain` (null on the all-domains founder path), `period`, `customFrom?`, `customTo?`.

**Per-slice memory cache (2026-06-24).** A module-level `detailSliceCache: Map<key, { metrics, scorecard }>`
keyed by `agent|domain|period|from|to` holds each fetched slice for the session (the founder-deck
`breakdowns` pattern, R-01). The component seeds `metrics`/`scorecard`/`isLoading` synchronously from
the cache (lazy `useState` init), and the mount effect **returns early on a cache hit** — so a
back-nav from a drilled lead's dossier (which restores `?agent=<id>`, remounting the panel) paints
**instantly, no skeleton, no round-trip**. A miss fetches both reads in one `Promise.all`
(`getAgentDetailMetricsAction` + `getAgentFirstTouchScorecardAction`) and writes the whole slice
(both settle together so one remount seeds in one shot). In-memory only; a period/range change is a
new key, so it never serves the wrong window. The founder mobile deck keeps its own component-local
`breakdowns` cache (different surface).

**Fetch pattern:** plain Promise `.then()/.catch()` with a `cancelled` ref. **Never `startTransition`**
(it defers `setMetrics(null)` inside React's transition batch → the skeleton never appears on
re-fetch). `isLoading` seeds `true` only on a cache miss (lazy init reads the cache; a hit seeds
`false` + the data). The container dims to 0.45 opacity + `pointer-events: none` only when
`isLoading && metrics !== null` (re-loading over existing data on a period change); a fresh agent
shows the full skeleton at full opacity.

**`metricsAgentId` ref:** tracks which agent the current `metrics` belong to. On agent switch
(`metricsAgentId.current !== agent.id`): `setMetrics(null)`/`setScorecard(null)`, drill state reset,
skeleton. On period change (same agent): data stays visible, dimmed, with the accent bar.

**Identity zone:** `Avatar lg` + `selected` ring + success live pip; Playfair name; accent-surface
domain badge (uses the checked `domain` else `agent.domain`); mono lead count.

**Stats:** four `StatAtom` tiles (pastel palettes — intentional non-token colours): Total Calls,
Leads, Won, Revenue.

**Tappable tiles → shared drill modals.** Each `StatAtom` passes an `onClick` so the tile renders a
pressable `motion.button` (`.serene-pressable` + cursor + focus ring); Total Calls → `'calls'`, Leads
→ `'leads'`, Won AND Revenue → `'deals'` (deck parity). The panel mounts the **same three drill
modals the founder deck uses** (`AgentCallsDrillModal` / `AgentLeadsDrillModal` /
`AgentDealsDrillModal`, identical `{ open, agentId, agentName, domain, onClose }` props, fetch-on-open,
`assertDrillAccess` authz). The Leads modal is passed `period`/`customFrom`/`customTo` so its total
matches the period-scoped tile. The modals portal to `document.body`, so they stay interactive
through the period-refetch dim; `drill` resets on agent switch.

**Deal type breakdown:** conditional `SectionCard` of pills (type · count · revenue), from `dealTypeBreakdown`.

**Lead Pipeline:** `PipelineBar` (segmented bar + chip legend on `--theme-paper-subtle`). `onSegmentClick`
opens `AgentLeadsPredicateDrillModal` with `{ kind: 'status' }`.

**Call outcome breakdown:** `CallOutcomeBar` with `onSliceClick` → `AgentLeadsPredicateDrillModal`
with `{ kind: 'outcome' }`.

**First-Touch Speed:** `FirstTouchScorecard` below the outcome donut, fed by the cached `scorecard`
(renders only once both `metrics` and `scorecard` resolve). `onBucketClick` sets `ftBucket` → opens
`AgentFirstTouchDrillModal`.

**Error:** `--color-danger-light` background.

---

### 10. Founder / Admin View

#### 10a. `FounderPerformanceShell` (`'use client'`)

Owns `activeTab: 'agents' | 'domains'` in `useState` (initial `'agents'`) — **never** a URL param.
Props: `domain` (placeholder `DEFAULT_GIA_DOMAIN`), `period`, `customFrom?`,
`customTo?`, `initialDomainHealth`, `initialTargets` (`DomainTarget[]`), `monthDeals`
(`Partial<Record<AppDomain, number>>` — deals closed THIS MONTH per domain, the month-pinned meter
input), `scopeDomain` (`AppDomain | null` - the global-selector pick, 2026-06-25),
`canEditTargets`, `agentsSlot`.

- **Single-strip layout (2026-06-25):** the Agents/Domains `TabSelector` renders INSIDE the shared `PerformanceFilters` strip via its `tabSlot`, and the hoisted "Deck view" trigger sits in the strip's `trailing` slot (desktop only, Agents tab only - the Agents-tab roster panel registers it via `FounderPerfActionsProvider` / `useFounderPerfActions`). There is no separate tab row. `ManagerPerformanceShell` mirrors this layout for the manager view.
- **Agents tab:** renders the `agentsSlot` (a server `<Suspense fallback={<ManagerPerformanceSkeleton />}><ManagerPerformanceAsync allDomains /></Suspense>` passed from `page.tsx`). The slot stays mounted (`display:none` when inactive) so the roster + selection survive a tab round-trip.
- **Domains tab:** renders `<DomainOverviewPanel initialData={initialDomainHealth} period customFrom customTo initialTargets monthDeals scopeDomain canEditTargets />`. `DomainOverviewPanel` is `next/dynamic` (perf audit G-3) - its Recharts chunk loads on first Domains-tab click, behind a same-shape `.skeleton` fallback.

#### 10b. `DomainOverviewPanel` (founder Domains tab)

`src/components/performance/DomainOverviewPanel.tsx` — `'use client'`.

- Seeded with `initialDomainHealth` (fetched server-side in `page.tsx` for the active range) so first paint needs no client fetch.
- **Global-domain scoping (2026-06-25):** takes a `scopeDomain` prop; `visibleDomains = scopeDomain ? [scopeDomain] : GIA_DOMAINS` - picking a domain in the global `serene-domain` selector renders just that one card. Not a security boundary (admin/founder only here).
- Refetches via `getDomainHealthMetricsAction(period, customFrom, customTo, scopeDomain ?? undefined)` on period/date/scope change.
- Renders the GIA-domain cards (2×2 when unscoped): Total Leads · Total Calls · Total Revenue (+ conversion) + Deals Closed per domain, plus the month-pinned `DomainTargetMeter` and a comparative Recharts `BarChart` with a metric toggle (`TabSelector variant="accent"`, `indicatorLayoutId="domain-metric-toggle"`). Mobile = CSS scroll-snap carousel (no library).
- **Domain-card tile drills (2026-06-24/25):** every card tile is a tap target. The **Leads** and **Calls** tiles open `DomainLeadsDrillModal` (a thin `LeadDrillModal` caller supplying `getDomainLeadsDrillAction`; `kind: 'all' | 'calls' | 'won'` maps the tile to the lead slice and the per-row meta line). The **Deals Closed** and **Revenue** tiles open `DomainDealsDrillModal` (`DrillModalShell` + `DealDrillRow`, fed by `getDomainDealsDrillAction`) - those tiles count `public.deals` by `won_at`, so the drill lists DEALS, not leads, and its total ties out to the card number. One `DomainTileTarget` drill state at the panel level; both modals portal via `DrillModalShell`.
- `DomainTargetMeter`: radial deals-vs-target meter (Recharts `RadialBarChart`, 2 colours via `useChartTokens`); month-pinned (`monthDeals` vs `domain_targets`, never the period filter); target null/0 → `<EmptyState>` inline "No target set." — never a division; founder/admin inline edit via `upsertDomainTargetAction`.
- `DomainHealthGrid.tsx` was DELETED in the 2026-07-02 dead-code purge - it no longer exists.

#### 10b-2. Founder drill-down deck (`FounderDrillDownDeck`)

On the founder/admin **Agents** tab, `FounderDrillDownDeck` (`src/app/(dashboard)/performance/`,
`next/dynamic`, `ssr:false` — Heavy-modal rule) is a `Dialog size="full"` (opts OUT of the `<md`
bottom-sheet) wrapping the generic `<Carousel>` (`src/components/ui/Carousel.tsx` — a content-agnostic
swipe primitive with touch axis-lock; `AdCreativeCarousel` is deliberately separate, R-01).

- **Mobile = the genuine view.** On a phone with a non-empty `allDomains` roster, `ManagerPerformancePanel` renders the deck ONLY (the list is never in the tree) and auto-opens it once per mount (see §9c). Desktop/tablet: trigger-driven overlay over the list.
- **Card layout — avatar + 2×2 scorecards (2026-06-20).** The active agent's name + domain live in the Dialog title bar. `DeckAgentCard` leads with the avatar (vertically centered) on the left + a `grid grid-cols-2` of four tap targets: **Recent calls · Leads · Won · Revenue**. Below: the breakdown toggle (full-width tray), then the First-Touch graph.
- **Zero per-swipe fetch of tiles (invariant).** One slide per agent; the tiles render ONLY in-memory `AgentRosterRow` fields (`agent.totalLeads`, `agent.leadsWon`, `formatCurrencyCompact(totalDealAmount)`). Swiping changes the controlled `index` and fires NO tile fetch.
- **`AgentRosterRow` has no `totalCallsMade`** — so the "Recent calls" tile is **label-only** ("View"); the call COUNT lives only inside the Recent-calls modal (`items.length`). Tap behaviour: Recent calls → `calls`, Leads → `leads`, Won → `deals`, Revenue → `deals`.
- **Leads tile ⇄ drill-modal consistency (2026-06-20).** The Leads tile shows `agent.totalLeads` (period-scoped). The `AgentLeadsDrillModal` it opens is passed the deck's `period`/`customFrom`/`customTo` so `getAgentLeadsScopedAction` filters `created_at` on the SAME window — the front number and the opened total agree. Never drop the period props.
- **Toggleable breakdown — lazy, once per card.** Below the tiles each card carries a breakdown with a deck-level mode toggle: **Call outcome** (reuses `CallOutcomeBar`, lazy Recharts) ↔ **Lead status** (reuses `PipelineBar`). Both are fed by ONE `getAgentDetailMetricsAction` call (`callOutcomeBreakdown` + `pipelineBreakdown` — no new RPC), fetched the first time a card becomes active and cached per agent (`breakdowns` state map keyed by agent id; a `requested` ref-Set fires the action exactly once per agent across swipes/re-renders). A period/date/domain change clears the cache + guard. The breakdown's `CallOutcomeBar.onSliceClick` / `PipelineBar.onSegmentClick` open `AgentLeadsPredicateDrillModal` (the deck holds `PredicateTarget` state).
- **First-Touch Speed on the deck.** `FirstTouchScorecard` renders below the breakdown, riding the SAME per-agent lazy `Promise.all` (`getAgentFirstTouchScorecardAction` alongside the breakdown fetch; folded into `breakdowns[agentId]` ready state — best-effort, null → omitted). `onBucketClick` opens `AgentFirstTouchDrillModal`.
- **Count contract (sign-off).** `AgentCallsDrillModal` is titled the literal **"Recent calls"**; its subtitle is `items.length` / "showing N most recent" — **never** the card's `totalCallsMade`. One row per call (`lead_notes WHERE call_outcome IS NOT NULL`).

**Authz (all drill actions).** A shared `assertDrillAccess` in `performance.ts` mirrors
`getAgentDetailMetricsAction` exactly: `requireProfile(['manager','admin','founder'])` → a manager
must pass `domain === caller.domain` (fails CLOSED). Leads/deals reuse `getLeadsByRole` /
`getDealsByRole` / `getLeadsByIds` with `filters.agent_id` or the bucket id-set (no new service
query). Calls use `getAgentCallsPageForManager` (the only new read fn). The `domain` passed to the
modals is the deck's active domain filter (null for all-domains); the action's manager-domain guard
re-validates it.

#### 10c. Differences from manager view

| Aspect | Manager | Founder / admin |
| -------- | --------- | ----------------- |
| Roster scope | `profile.domain` | All agents (`rosterDomain = null`) |
| Domain filter | N/A | Client `FilterDropdown` on roster header (syncs to the global selector) |
| `getAgentDetailMetricsAction` | Domain must match caller | No domain guard; `domain: null` allowed |
| Page title | "Team Performance." | "Performance." |
| URL `?domain=` | **Never used for scope** | The global selector seeds the roster filter only (not an RLS boundary) |
| Deck view | Trigger-opened via `ManagerPerformanceShell` (2026-06-25) | Trigger-opened (desktop) / auto-opened (mobile) |

---

### 11. Access Control Summary

| Role | Sees | Domain scope | View other agents' detail |
| ------ | ------ | -------------- | --------------------------- |
| Agent | Own KPIs, effort, outcomes | `profile.domain` for benchmarks only | No |
| Manager | Team roster + detail | `profile.domain` only | Yes, same domain only |
| Admin | All domains roster + detail | All | Yes, any agent |
| Founder | Same as admin | All | Yes, any agent |
| Guest | — | — | Redirect `/dashboard` |

**Enforcement layers:**

1. **Page:** Role branch; manager `domain={profile.domain}`; guest redirect.
2. **Self-view RPC:** `get_agent_performance` / `get_agent_today_pulse` are self-scoped (`auth.uid()`) — an agent can only ever read their own metrics; there is no agent self-metrics action to spoof.
3. **`getAgentDetailMetricsAction` / `getAgentFirstTouchScorecardAction`:** `requireProfile(['manager','admin','founder'])`; manager must pass matching domain.
4. **All drill-downs:** the shared `assertDrillAccess` (same posture as 3). The deck trigger shows for any manager+ view with a non-empty roster (`showDeckTrigger = visibleAgents.length > 0` - managers included since 2026-06-25); the action-layer manager-domain guard is the real boundary.
5. Never trust a client-supplied domain for manager authorization.

---

### 12. Known Invariants (must never be violated)

1. **Date-field rule:** `leadsWon` / `conversionRate` use `status_changed_at` (or `public.deals.won_at`). `touchRate` uses `created_at` cohort — intentional.
2. **Manager domain** always from `profile.domain`, never from URL.
3. **`agentCount < 2`** → all benchmark averages `null`, not `0`.
4. **`leadsWon`** excluded from `TeamBenchmarks` by design.
5. **Response time benchmark:** Lower is better — accent pip when agent < domain average.
6. **Roster API sort:** `leadsWon DESC` then `conversionRate DESC`; `conversionRate` null → `-Infinity`, not `0`.
7. **Recharts colours:** `useChartTokens()` / `resolveColorMap()` for SVG fills — never raw `var(--)` in Recharts.
8. **`ManagerPerformancePanel` must never carry `key={period}`** — period flows through props. Remount loses selected agent.
9. **`AgentDetailPanel` never uses `startTransition`** for its fetch — it defers `setMetrics(null)` and kills the skeleton. Plain `.then()/.catch()` + `cancelled` ref. `metricsAgentId` reset on agent switch before fetch.
10. **IST boundaries** for all period presets — never UTC midnight. `callsToday` in `getAgentDetailMetrics` is NOT an IST-today window — it mirrors `totalCallsMade` by design (see §5; the feature CLAUDE.md type comment is stale).
11. **Null metrics:** `avgResponseTimeMinutes` / `conversionRate` display `"—"`, not zero.
12. **Performance queries** stay in `performance-service.ts` only.
13. **Sidebar order** uses `performance-roster-display.ts` (A–Z / domain groups), not API sort order.
14. **Founder domain filter** is the roster `FilterDropdown` (synced to the global selector) — never a page filter-bar control, never an RLS boundary.
15. **The date model is pure `date_from`/`date_to` URL params for all three roles** — `period` is internal/derived via `resolvePerformanceDateParams`. Never re-add `?period=`/`?from=`/`?to=` parsing or an `all_time` selector.
16. **The agent shell key-remounts per range** (`key={period:customFrom:customTo}`) with server-fetched `initialData` + `trend` (the 0146 daily series, fetched in the same server `Promise.all`). There is no client metrics refetch and no `getAgentSelfMetricsAction`. The only agent-view client fetch is the ONE Today pulse, fired unconditionally once per mount (no tabs, no `needsPulse` gate) - never add a second pulse call.
17. **`getAgentDetailMetrics` runs exactly 4 queries** (cohort leads, won deals, cohort call-count, call notes for outcomes). Do not reintroduce a separate IST-today `callsToday` query — `callsToday` mirrors `totalCallsMade`. There is **no** health `useEffect` in `AgentDetailPanel`; its only fetch is the `Promise.all` of `getAgentDetailMetricsAction` + `getAgentFirstTouchScorecardAction`, on a cache miss (§9d).
18. **One first-touch classification pass.** A bar's count (`getAgentFirstTouchScorecard`) and its drill list (`getAgentFirstTouchBucketLeadIds`) both read `classifyFirstTouchPairs` — never re-fork the bucketing, never move the business-minute ruler into SQL (R-01).
19. **Charts emit clicks, never fetch.** `PipelineBar`/`CallOutcomeBar`/`FirstTouchScorecard` `on*Click` props are optional and display-only when absent; the drill state lives in the consumer (A-06).
20. **`?agent=` selection mirror uses `window.history.replaceState`, never `router.replace`/`push`** — otherwise every agent click refetches the whole page.

---

### Component inventory

#### `src/components/performance/`

| File | Role |
| ------ | ------ |
| `PerformanceFilters.tsx` | THE shared filter bar (ALL roles + `/budget`). Composes `<FilterBar dateRange>` (Range presets + custom Dates, `date_from`/`date_to`) + `useUrlFilters`; props `{ showSearch, searchPlaceholder?, searchAriaLabel?, tabSlot?, trailing? }`. No bespoke Period dropdown |
| `AgentPerformanceShell.tsx` | Agent self-view: the lean single-page scorecard (no tabs) - TodayStrip → CoreFourGrid → trend card (`AgentActivityTrendChart` + `PipelineLine`) → `CallOutcomeBar` → `AgentRecentActivityList`; period + `trend` arrive as props (key-remounted); the ONE unconditional pulse fetch |
| `CoreFourGrid.tsx` | Agent KPI row; only Leads Won carries a sparkline (the real `wonTrend` daily series, 0146) |
| `CallOutcomeBar.tsx` | Donut + legend (agent self-view + detail panel + the deck card's "Call outcome" mode). Optional `onSliceClick(outcome)` → `AgentLeadsPredicateDrillModal`. Loaded via `next/dynamic` from each Recharts call site |
| `PipelineBar.tsx` | Segmented lead-status bar + legend chips — extracted from `AgentDetailPanel`'s former `PipelineSection` (R-01); reused by the detail panel "Lead Pipeline" AND the deck "Lead status" mode. Optional `onSegmentClick(status)` → `AgentLeadsPredicateDrillModal`. Pure divs (no Recharts) |
| `ManagerPerformancePanel.tsx` | Two-column team shell; roster (left) + detail/empty-state (right); domain `FilterDropdown` (synced to global selector); URL `search`; `?agent=` selection mirror; client roster refetch via `getManagerRosterAction`. Mobile `allDomains`: renders the deck only (auto-opens) |
| `AgentDetailPanel.tsx` | Manager/founder agent detail: 4 `StatAtom` tiles (tap → calls/leads/deals modals), Deal Breakdown, Pipeline (`PipelineBar`), Call Outcome (`CallOutcomeBar`), `FirstTouchScorecard`. Per-slice `detailSliceCache` (back-nav instant). Fetches metrics + scorecard in one `Promise.all`; never `startTransition` |
| `StatAtom.tsx` | Single pastel stat tile. Optional `onClick` → pressable `motion.button`; absent → static `motion.div` (`DomainOverviewPanel` passes none) |
| `FirstTouchScorecard.tsx` | First-touch SPEED card (5 labeled horizontal-bar rows scaled to peak bucket + untouched footnote). Data from `getAgentFirstTouchScorecard`. Optional `onBucketClick(bucketId)` → `AgentFirstTouchDrillModal`; absent → display-only. TWO mount sites (detail panel + deck) |
| `PerformanceRosterEmptyState.tsx` | Right-panel prompt when `selectedId === null` (wraps `<EmptyState>`) |
| `DomainOverviewPanel.tsx` | Founder Domains tab - health cards (scoped by `scopeDomain`; incl. Deals Closed) + month-pinned `DomainTargetMeter` + inline target edit + comparative bar chart + the domain-card tile drills; refetch via `getDomainHealthMetricsAction(…, scopeDomain?)`; mobile = CSS scroll-snap carousel |
| `DomainTargetMeter.tsx` | Radial deals-vs-target meter (Recharts `RadialBarChart`, 2 colours); month-pinned; target null/0 → inline `<EmptyState>` |
| `DomainLeadsDrillModal.tsx` | The leads behind a clicked Domains-card **Leads / Calls** tile - thin `LeadDrillModal` caller supplying `getDomainLeadsDrillAction` (`kind: 'all' \| 'calls' \| 'won'` drives the slice + per-row meta) |
| `DomainDealsDrillModal.tsx` | The DEALS behind a clicked Domains-card **Deals Closed / Revenue** tile - `DrillModalShell` + `DealDrillRow`, fed by `getDomainDealsDrillAction` (`won_at` range, so the list ties out to the card) |
| `DealDrillRow.tsx` | Single deal row for the deals drills (shared with `AgentDealsDrillModal`); links to the lead dossier when the deal has a lead |
| `AgentActivityTrendChart.tsx` | Agent scorecard trend - multi-series Calls · Notes · Won over the period (0146), falling back to the pulse 14-day call series when < 2 buckets; composes `ChartFrame` + `cartesianDefaults`; `next/dynamic` from the shell |
| `AgentRecentActivityList.tsx` | Agent scorecard's recent-activity section - keyset "load more" (composite cursor `(created_at, id)`, page 15, button) via `getAgentRecentLeadActivityAction` |
| `DrillModalShell.tsx` | THE nested-modal shell for the deck/detail drill-downs — `document.body` portal + `--z-modal-overlay`/`--z-modal-nested` (stacks ABOVE the deck's full `Dialog`). Display-only chrome; caller owns body + fetch |
| `LeadDrillRow.tsx` | THE single lead row (name + phone + status pill) for the drill modals — a `Link` to `/leads/${slug ?? id}?from=/performance`. Extracted from `AgentLeadsDrillModal` (R-01) |
| `LeadDrillModal.tsx` | THE generic fetch-on-open lead-list drill (flat, bounded, no load-more). Caller supplies `title` + `fetcher` + `fetchKey`; renders `Spinner → LeadDrillRow → EmptyState` inside `DrillModalShell`. Every chart/metric flat-list drill is a different fetcher (R-01) |
| `AgentFirstTouchDrillModal.tsx` | Thin caller of `LeadDrillModal` supplying `getFirstTouchBucketLeadsAction` (list length = bar count). TWO mount sites (detail panel + deck) |
| `AgentLeadsPredicateDrillModal.tsx` | Thin caller of `LeadDrillModal` supplying `getAgentLeadsByPredicateAction`. `predicate` = `{ kind: 'status' \| 'outcome' }` — one modal serves BOTH chart drills (R-01). TWO mount sites |
| `AgentCallsDrillModal.tsx` | "Recent calls" — fetch-on-open keyset load-more via `getAgentCallsForManagerAction`. Count contract: title literal "Recent calls", subtitle `items.length`, never `totalCallsMade`. One row per call |
| `AgentLeadsDrillModal.tsx` | Agent's assigned leads — fetch-on-open page load-more via `getAgentLeadsScopedAction` (period-scoped) |
| `AgentDealsDrillModal.tsx` | Agent's won deals — fetch-on-open page load-more via `getAgentDealsScopedAction` |

**Three stat-tile drill modals have TWO mount sites:** `FounderDrillDownDeck` and `AgentDetailPanel`,
identical `{ open, agentId, agentName, domain, onClose }` props — keep the contract stable (R-01).

#### `src/app/(dashboard)/performance/`

| File | Role |
| ------ | ------ |
| `page.tsx` | Role branch orchestrator; runs `resolvePerformanceDateParams` for all roles; agent server `Promise.all` (summary + 0146 trend) + key-remount; founder branch resolves `scopeDomain` (`resolveDomainParam`) → narrowed `healthDomains` + `Promise.all` (`initialDomainHealth` + month-pinned `monthHealth` + `getDomainTargets`) + `agentsSlot` |
| `loading.tsx` | Route-level Suspense fallback — manager-shaped chrome (`PageHeaderSkeleton` + `FilterBarSkeleton` + `ManagerPerformanceSkeleton`) |
| `PerformanceSkeleton.tsx` | Agent-shaped skeleton — used by the agent branch's Suspense (`PerformanceAsync.tsx`, the legacy unmounted shell, is DELETED) |
| `ManagerPerformanceShell.tsx` | Manager `'use client'` shell (2026-06-25) - owns the `PerformanceFilters` strip; hosts the roster's "Deck view" trigger on the strip's trailing edge via `FounderPerfActionsProvider`; takes the server `rosterSlot` |
| `ManagerPerformanceAsync.tsx` | Team data shell — fetches the roster only (domain health lives on the Domains tab) |
| `ManagerPerformanceSkeleton.tsx` | Team loading |
| `FounderPerformanceShell.tsx` | Founder/admin `'use client'` two-tab shell (Agents / Domains); owns tab state; the tabs live in the filter strip's `tabSlot` and the deck trigger in its `trailing` slot (via `FounderPerfActionsProvider`); threads `scopeDomain` into `DomainOverviewPanel` |
| `FounderDrillDownDeck.tsx` | Founder/admin swipeable per-agent deck (`Dialog size="full"` + `<Carousel>`); trigger-opened on desktop/tablet, the genuine view on mobile; 4 tap tiles (Recent calls / Leads / Won / Revenue) + a lazy, per-agent-cached breakdown toggle (outcome ↔ status) + First-Touch graph, all fed by one `getAgentDetailMetricsAction` + `getAgentFirstTouchScorecardAction` per agent |
| `founder-perf-actions.tsx` | `FounderPerfActionsContext` / `Provider` / `useFounderPerfActions` - the bridge that lets the roster panel register its "Deck view" trigger on the hosting shell's filter strip (founder AND manager shells) without lifting roster state |

#### `src/lib/actions/performance.ts`

| Action | Caller | Auth |
| -------- | -------- | ------ |
| `getAgentPulseAction` | `AgentPerformanceShell` | agent only |
| `getAgentRecentLeadActivityAction` | `AgentRecentActivityList` | agent only (id from profile) |
| `getAgentDetailMetricsAction` | `AgentDetailPanel`, deck breakdown | manager (own domain), admin, founder |
| `getAgentFirstTouchScorecardAction` | `AgentDetailPanel`, deck | `assertDrillAccess` |
| `getManagerRosterAction` | `ManagerPerformancePanel` | manager (own domain pinned), admin, founder |
| `getDomainHealthMetricsAction` (optional `domain` 4th arg) | `DomainOverviewPanel` | manager, admin, founder |
| `upsertDomainTargetAction` | `DomainOverviewPanel` / `DomainTargetMeter` | admin, founder |
| `getAgentCallsForManagerAction` | `AgentCallsDrillModal` | `assertDrillAccess` |
| `getAgentLeadsScopedAction` | `AgentLeadsDrillModal` | `assertDrillAccess` |
| `getAgentDealsScopedAction` | `AgentDealsDrillModal` | `assertDrillAccess` |
| `getFirstTouchBucketLeadsAction` | `AgentFirstTouchDrillModal` | `assertDrillAccess` |
| `getAgentLeadsByPredicateAction` | `AgentLeadsPredicateDrillModal` | `assertDrillAccess` |
| `getDomainLeadsDrillAction` | `DomainLeadsDrillModal` | `assertDrillAccess` |
| `getDomainDealsDrillAction` | `DomainDealsDrillModal` | `assertDrillAccess` |

`assertDrillAccess` mirrors `getAgentDetailMetricsAction` authz: `requireProfile(['manager','admin','founder'])`
→ manager `domain === caller.domain` guard (fails CLOSED). **`getAgentSelfMetricsAction` and
`getAgentActivityForManagerAction` do not exist** - the agent payload (summary + trend) is
server-fetched in `page.tsx`, and the manager activity-feed drill was deleted (zero call sites).

---

### Shared utilities

#### `resolvePerformanceDateParams` — `src/lib/services/performance-service.ts`

THE URL-params → `(period, from, to, customFrom, customTo)` boundary. See §3b. Pure; called by the
`/performance` and `/budget` server pages.

#### `formatDuration` — `src/lib/utils/dates.ts`

`null → "—"`, `< 60 → "48m"`, `≥ 60 → "2h 34m"`.

#### `useChartTokens` / `resolveColorMap` — `src/components/ui/charts/useChartTokens.ts`

Resolves CSS tokens via `getComputedStyle`. Re-subscribes on `data-theme` MutationObserver.
`resolveColorMap` for record-shaped colour maps (the `CallOutcomeBar` / `DomainTargetMeter` /
`FirstTouchScorecard` fills).

---

### Roster display helpers — `src/lib/utils/performance-roster-display.ts`

- `PERFORMANCE_ROSTER_DOMAIN_ORDER` — Gia domains first, then remaining `APP_DOMAINS`.
- `buildPerformanceRosterGroups(agents, { allDomains, domain })` — sidebar structure.
- `getFirstAgentInPerformanceRosterList(...)` — first visible agent in display order (not `roster[0]` from API sort). **No longer called by `ManagerPerformancePanel`** (default selection is `null` → empty state, or the `?agent=` seed); retained as a utility.

### First-touch buckets — `src/lib/constants/performance.ts`

`FIRST_TOUCH_BUCKETS` (`lt15` `< 15m` / `lt30` `15–30m` / `lte1h` `≤ 1h` / `lt3h` `1–3h` / `gte3h`
`3h+`), each with a `maxMinutes` ceiling (last = `Infinity`) and a success→danger token colour;
`firstTouchBucketForMinutes(minutes)` maps an elapsed business-minute value to its bucket id. Bucket
ids are stable keys — never rename after shipping.
