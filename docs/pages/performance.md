# Performance — Page Spec

> **Purpose:** spec for `/performance` — one URL, three role-specific layouts (agent self-view, manager team view, founder/admin Agents+Domains tabs).
> **Audience:** engineers. · **Source-of-truth scope:** the performance route, `performance-service.ts`, `performance.ts` actions, the period system and date-field rule.
> **Last verified:** 2026-06-14 (D-2 RPC consolidation — migration 0101 — plus the founder
> domain-targets + month-pinned target-meter wiring, the agent-view Suspense subtree, and the
> responsive page padding now in code).

## 1. Purpose

Role-adaptive KPI surface. Agents see their own core-four metrics, effort, outcome breakdown
and benchmarks (ONE `get_agent_performance` RPC round trip — self-scoped, no identity params).
Managers see a domain roster + per-agent detail. Founders/admins get an Agents tab (all-domain
roster) and a Domains tab (per-domain health cards + comparative chart, revenue from
`public.deals`, plus a month-pinned deals-vs-target radial meter founders/admins can edit inline
via `upsertDomainTargetAction`).

## 2. Who sees it

agent (self only) · manager (own domain team) · admin/founder (all domains + Domains tab) ·
guest → `redirect('/dashboard')`. Branch order and enforcement layers: Deep dive §7/§11.
The roster RPC pins managers to `get_user_domain()` in SQL — a forged `allDomains` cannot
widen scope.

## 3. Data sources

| Layer | Key items |
| ----- | --------- |
| Service | `performance-service.ts` only (never extend leads/dashboard services) — `getAgentPerformanceSummary` (React `cache()`, D-2), `getAgentRosterPerformance` (RPC-backed), `getAgentDetailMetrics`, `getDomainHealthMetrics`, `getAgentTodayPulse` (0108), `getAgentLeadActivityPage` (keyset, composite cursor), period helpers; targets in `domain-targets-service.ts`. No Redis (see §"caching") |
| RPCs | `get_agent_performance` + `get_agent_roster_performance` (0101, self-/role-scoped in SQL), domain-health RPCs (0066b/0068/0076/0107 — `total_deals` added), `get_agent_today_pulse` (0108, self-scoped) |
| Tables | `domain_targets` (0105) — founder-set monthly deals-closed target per domain; UNIQUE(domain, metric, period); RLS all-read / admin+founder write |
| Actions | `performance.ts` — `getAgentSelfMetricsAction` (agent-only), `getAgentDetailMetricsAction` (manager domain-checked), `getManagerRosterAction`, `getDomainHealthMetricsAction`, `getAgentPulseAction` (agent-only), `getAgentRecentLeadActivityAction` (agent-only, cursor from client / id from profile), `upsertDomainTargetAction` (admin/founder; Zod `domain` ∈ `GIA_DOMAIN_ENUM` + `targetValue` 0–100,000 → `domain-targets-service`) |
| Period system | IST presets (`today`, `this_week`, `this_month`, `prev_month`, custom range) via `lib/utils/ist.ts` — Deep dive §3 |

## 4. Components

`AgentPerformanceShell` (period tabs, Overview/Today tabs, `MetricCard` — deliberately bespoke,
sparklines, `CallOutcomeBar` donut; Today tab adds the pulse: calls new/old split chips,
`AgentCallTrendChart` 14-day trend, Revenue card, `AgentRecentActivityList` keyset load-more) ·
`ManagerPerformanceAsync` (roster + `AgentDetailPanel`) ·
`FounderPerformanceShell` (Agents/Domains tabs; `agentsSlot` injection) · `DomainOverviewPanel`
(4 stats incl. Deals Closed + `DomainTargetMeter` radial deals-vs-target meter, founder/admin
inline target edit, mobile CSS scroll-snap carousel) + `DomainHealthGrid` (legacy, unmounted) ·
`CoreFourGrid`, `EffortGrid`, `StatAtom` · `PerformanceFilters` ·
roster display helpers in `lib/utils/performance-roster-display.ts`.

## 5. States

- **Loading:** `performance/loading.tsx`; `PerformanceSkeleton` / `ManagerPerformanceSkeleton`; refetch bars re-timed to `PAGE_DURATION` (0.5 s — design decision 2026-06-11).
- **Empty:** `PerformanceRosterEmptyState` (wraps `<EmptyState>`); per-card zero states render zeros, not empties (a 0% conversion is data).
- **Error:** actions return `{ error }`; panels degrade with logged warnings.

## 6. Invariants

Deep dive §12 — **the Critical Date-Field Rule** (`leadsWon`/`conversionRate` by
`status_changed_at`; `touchRate` by `created_at` cohort — intentional asymmetry), period
boundaries are IST, benchmarks compare within domain, never re-fan-out the agent view into
per-metric queries.

Added 2026-06-12:

- **Target meter is month-pinned.** `DomainTargetMeter` always compares THIS MONTH's
  `total_deals` against the monthly `domain_targets` value — it does not move with the
  period filter (page reuses the period fetch when the period IS `this_month`, otherwise
  fetches the month range once). Target null/0 → "No target set." — never a division.
- **Pulse split is a partition.** `get_agent_today_pulse` computes total/new/old with
  `count(*)` + two complementary FILTERs over the same row set — new + old always equals
  total calls today. "Calls" = `lead_notes` with `call_outcome IS NOT NULL` (same
  definition as `calls_logged` in 0101).
- **The "Today" strip + Today tab read since-midnight numbers from the pulse only** (added
  2026-06-15, migration 0122). The pulse `notes_today` is ALL `lead_notes` the agent authored
  since `p_today_start` (a deliberate superset of `calls_today.total`, which filters
  `call_outcome IS NOT NULL`). The Overview strip's Calls / Notes / Won come from
  `callsToday.total` / `notesToday` / `deals.dealCount` — never the period-scoped
  `effort`/`core` fields (the bug fixed here). The single pulse fetch serves BOTH the Today
  tab and the Overview strip; the fetch gate covers either being visible, so a tab switch
  fires no new request.
- **Activity load-more uses a composite cursor** `(created_at, id)` — never a single-column
  cursor; page ~15 via a button, never infinite scroll. Agent id from the verified profile.

Added 2026-06-14 (Phase 5 deck):

- **`getAgentLeadActivityPage(agentId, cursor?, actionType?)`** — the typed `actionType`
  (`'all' | 'call_logged' | 'note_added' | 'status_changed'`) ANDs with the cursor `.or()` group
  (a top-level `.eq`, never folded into the `.or()` string). The select now also carries
  `leads.phone`, the call outcome (read from the row's own `details->>'outcome'`), and the note body
  (correlated from a batched `lead_notes` query — exact `lead_id|created_at` match first, falling
  back to most-recent-per-lead; the note + activity rows share a transaction, so created_at matches).
- **`getAgentCallsPageForManager(agentId, cursor?)`** — THE "Recent calls" source. Queries
  `lead_notes WHERE call_outcome IS NOT NULL` directly (the call record itself → one row per call,
  structurally no `note_added` duplicates), same composite `(created_at, id)` keyset, page 15. The
  leads RLS is the manager/founder second layer; the action-layer domain guard is the first.

Added 2026-06-15 (first-touch speed scorecard):

- **First-touch SPEED is bucketed in TS, never SQL.** Below the `CallOutcomeBar` in
  `AgentDetailPanel`, `FirstTouchScorecard` distributes the period cohort across `< 15m / 15–30m /
  ≤ 1h / 1–3h / 3h+`, where elapsed = **business minutes** from `leads.created_at` to the lead's
  EARLIEST `lead_notes` row with `call_outcome IS NOT NULL`, computed per the agent's shift
  (`lib/utils/sla.businessMinutesBetween` + `buildAgentShiftOverride`; NULL shift → global
  `BUSINESS_HOURS`). The calendar math is TS-only — the RPC `get_agent_first_touch_pairs` (0123,
  admin client, EXECUTE revoked per Q-13) returns raw `(lead_id, created_at, first_call_at)` pairs
  and the service mapper (`getAgentFirstTouchScorecard`, React `cache()`) buckets them. **Never fork
  the SLA ruler into SQL (R-01).**
- **Buckets sum to leads-with-a-first-call.** Cohort leads with no qualifying call note are a
  separate `untouched` count (footnote), never a speed bucket, never dropped
  (`leadsWithFirstCall + untouched = totalCohort`). A 2am-arrival / 9:15am-call lead lands in
  `< 15m` (business-adjusted), not 3h+.
- **Cached, not per-render.** The per-row business-minute loop runs once per (agent, period) — the
  React `cache()` aggregate, not a render-time computation. Mount point is `AgentDetailPanel` only;
  the `FounderDrillDownDeck` card keeps its zero-per-swipe-fetch invariant.

## 7. Open items

None recorded.

---

## 8. Deep dive

> Section numbering preserved from the original intelligence document.

### 1. Module Overview

**Route:** `/performance` — one URL, three role-specific layouts.

| Role | View | Primary shell | Redirect if unauthorized |
| ------ | ------ | --------------------- | ------------------------- |
| `agent` | Self-view: period tabs, Overview + Today content tabs, motivational footer | `AgentPerformanceShell` (client) | — |
| `manager` | Team view: agent roster (left) + agent detail (right) | `ManagerPerformanceAsync` | — |
| `founder` / `admin` | Two-tab shell: **Agents** (same team UI as manager, all domains; domain narrowing client-side on roster) + **Domains** (per-domain health cards + comparative bar chart) | `FounderPerformanceShell` (owns tab state) → Agents tab is `ManagerPerformanceAsync allDomains={true}` injected as `agentsSlot`; Domains tab is `DomainOverviewPanel` | — |
| `guest` | — | — | `redirect('/dashboard')` |

**Branching** (exact order in `src/app/(dashboard)/performance/page.tsx`):

1. `getCurrentProfile()` — no profile → `redirect('/login')`
2. `profile.role === 'guest'` → `redirect('/dashboard')`
3. `profile.role === 'agent'` → agent layout — fetches `this_month` initialData server-side, renders `AgentPerformanceShell`
4. `profile.role === 'manager'` → manager layout (`domain={profile.domain}`)
5. Else (founder / admin) → one server-side `Promise.all`: `getDomainHealthMetrics(GIA_DOMAINS, from, to)` (active-period, custom-range aware) → `initialDomainHealth`; a **second month-pinned** `getDomainHealthMetrics(GIA_DOMAINS, thisMonth)` call — **skipped (resolves `null`) when the active period already IS `this_month`** — folded into `monthDeals` (`{ [domain]: totalDeals }` for the month-pinned target meter); and `getDomainTargets()` → `initialTargets`. Then renders `FounderPerformanceShell` with `domain={DEFAULT_GIA_DOMAIN}` placeholder, `initialDomainHealth`, `initialTargets`, `monthDeals`, `canEditTargets={true}`, and `agentsSlot={<Suspense><ManagerPerformanceAsync allDomains /></Suspense>}`

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

### 3. Period System

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

**`'today'`** was added 2026-06-04. It returns IST midnight → now via `toISTMidnight(now)`. Previous period for `'today'` is yesterday IST (midnight–midnight).

**`custom` fallback in `getPeriodDateRange`:** Falls through to `return getPeriodDateRange('this_month')`. Custom bounds are always passed by the orchestrator as ISO strings; this is a safe fallback only.

**`getPreviousPeriodDateRange('custom')`:** Returns `null` — no well-defined previous window.

**`TeamBenchmarks`** is exported from `performance-service.ts`, not `src/lib/types/index.ts`. `AgentRosterRow` and `AgentDetailMetrics` live in `src/lib/types/index.ts`.

#### 3b. IST period boundaries

**IST offset:** `IST_OFFSET_MS = 5.5 * 60 * 60 * 1000`. Helpers: `toISTMidnight`, `toISTEndOfDay`, `getISTMondayStart`.

| Period | `from` | `to` |
| -------- | -------- | ------ |
| `today` | IST midnight today | `now` |
| `this_week` | IST Monday 00:00:00 of current week | `now` |
| `this_month` | IST 1st of current month 00:00:00 | `now` |
| `last_month` | IST 1st of previous month 00:00:00 | IST last moment of previous month |
| `all_time` | `2024-01-01T00:00:00Z` | `now` |
| `custom` | (fallback) same as `this_month` | `now` |

**Previous period** (`getPreviousPeriodDateRange`):

- `today` → yesterday IST (midnight to midnight)
- `this_week` → prior Mon–Sun (IST)
- `this_month` → `getPeriodDateRange('last_month')`
- `last_month` → calendar month before last (IST)
- `all_time` / `custom` → `null`

**`callsToday` in `getAgentDetailMetrics`:** No longer a separate IST-today query. As of the deals refactor, `getAgentDetailMetrics` sets `callsToday = totalCallsMade` (the period cohort's summed `call_count`). The IST-midnight boundary code below is **no longer present in `getAgentDetailMetrics`** — it survives only where a genuine "since IST midnight" window is still computed (period preset `'today'` via `toISTMidnight`). For any *new* "today" boundary you add, still use the IST helper, never bare UTC midnight:

```typescript
const nowIst = new Date(new Date().getTime() + IST_OFFSET_MS);
nowIst.setUTCHours(0, 0, 0, 0);
const todayStart = new Date(nowIst.getTime() - IST_OFFSET_MS).toISOString();
```

Never use bare `new Date()` at UTC midnight for "today" — wrong for IST agents.

#### 3c. Custom date range

**Writer:** `AgentPerformanceShell` (agent) or `PerformanceFilters` (manager/founder) — `AnimatePresence` reveals two `DatePicker` fields. Custom params pushed as ISO strings.

**Readers:**

- `AgentPerformanceShell` — passes `customFrom?.toISOString()` / `customTo?.toISOString()` to `getAgentSelfMetricsAction`.
- `page.tsx` — reads `params.from`, `params.to`; passes to manager/founder shells.
- `ManagerPerformanceAsync` — overrides range when `period === 'custom' && customFrom`.
- `getAgentDetailMetricsAction` — same override before calling `getAgentDetailMetrics`.

---

### 4. The Critical Date-Field Rule

**Do not regress.**

1. **`leadsWon`:** Filter by `status_changed_at` where `status = 'won'`.
2. **`conversionRate`:** Denominator = leads with `status IN ('won','lost')`, filtered by `status_changed_at`.
3. **`touchRate`:** **Intentionally remains on `created_at`** — "of leads created in the period, what % moved past `new`?" This is not the same bug as (1–2). Do not change without an explicit product decision.
4. **`getAgentRosterPerformance`:** Cohort `totalLeads` from `created_at`; won/lost/deal from `status_changed_at`.
5. **`getAgentDetailMetrics`:** `leadsWon`/revenue from `public.deals.won_at`; pipeline/cohort from `leads.created_at`; `callsToday` = `totalCallsMade` (cohort `created_at`, NOT an IST-today window).
6. **Deal revenue** (roster `totalDealAmount` and detail `totalDealAmount`/`dealTypeBreakdown`): from `public.deals` filtered by `won_at` — never from a `leads` column.

**Rule for new metrics:** outcome/closure → `status_changed_at`. Cohort/intake → `created_at`. Activity (calls, notes) → `lead_notes.created_at` or `lead_activities.created_at`.

---

### 5. Service Functions — `performance-service.ts`

#### `getPeriodDateRange(period)` / `getPreviousPeriodDateRange(period)`

Pure IST math — no DB call.

#### `getAgentPerformanceSummary(period, customFrom?, customTo?)` — perf audit D-2, 2026-06-11

ONE `get_agent_performance` RPC round trip (migration 0101) returning
`{ core, previous, effort, outcomes, benchmarks }` — it replaced the deleted
per-metric functions (`getCoreFourMetrics`, `_getCoreFourMetricsForRange`,
`getPreviousPeriodCoreMetrics`, `getEffortMetrics`, `getCallOutcomeBreakdown`,
`getTeamBenchmarks`; their **types** remain exported). React `cache()`-wrapped.

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
  service); `leadsWon` excluded by design. Now computed SECURITY DEFINER = true
  domain-wide averages — the old session-client version was silently reduced by
  agent RLS to the caller's own rows.

#### `getAgentRosterPerformance(domain, dateFrom, dateTo)` — RPC-backed (D-2)

ONE `get_agent_roster_performance` call (migration 0101) — one pre-aggregated row
per active agent; LEFT JOINs keep zero-activity agents. Role-gated in SQL: manager
always pinned to `get_user_domain()`; admin/founder pass `domain === null` for all
agents; agents get zero rows. Cohort `created_at`; won/lost `status_changed_at`;
revenue from `public.deals.won_at`. Sort (in the service, unchanged): `leadsWon
DESC`, `conversionRate DESC` (null → `-Infinity` — never floats above real data).
Sidebar display order is separate (see `performance-roster-display.ts`).

#### `getAgentDetailMetrics(agentId, domain, dateFrom, dateTo)`

**3** Supabase queries via `Promise.all` (not 6): (1) cohort leads `created_at` → `totalLeads` + `pipelineBreakdown`; (2) won deals from `public.deals` filtered by `won_at` → `leadsWon` + `totalDealAmount` + `dealTypeBreakdown`; (3) cohort leads with `call_count` / `last_call_outcome` → `totalCallsMade` + `callOutcomeBreakdown`.

**`callsToday` is NOT a separate IST-today query.** It is set equal to `totalCallsMade` (the period cohort call sum). There is no IST-midnight boundary computation in this function — all three queries are scoped to `dateFrom`/`dateTo`. The `callsToday` field name is retained for type/UI compatibility but no longer means "calls since IST midnight." `domain` is auth-only — it does not filter any query.

Revenue is sourced from `public.deals` (`deal_amount`, `won_at`), never from a `leads` deal column.

#### `getDomainHealthMetrics(domains, dateFrom, dateTo)`

Calls `get_domain_health_metrics` RPC — one round-trip for all domains. `conversionRate` computed in service: `won + lost > 0 ? won / (won + lost) * 100 : null`. All bigint fields through `Number()`. Returns `DomainHealthCard[]`. Drives the founder **Domains** tab. `domains.length === 0` → `[]`.

#### `getDomainsWithLeads(dateFrom, dateTo)`

Legacy helper — retained but not called from current shells.

---

### 6. Server Actions — `performance.ts`

#### `getAgentSelfMetricsAction(period, customFrom?, customTo?)`

Added 2026-06-04. Agent self-view only.

| Step | Behaviour |
| ------ | ---------- |
| Zod | `GetAgentSelfSchema`: `period` enum (all 6 values including `today`); optional ISO `customFrom`/`customTo` |
| Auth + Role | `requireProfile(['agent'])` — non-agent → unauthorized |
| Data | ONE `getAgentPerformanceSummary(period, from?, to?)` call → `get_agent_performance` RPC (D-2; was a `Promise.all` of 5 service calls / ~17 queries) |
| Return | `ActionResult<AgentSelfMetrics>` |

**`AgentSelfMetrics`** is an alias of the service's `AgentPerformanceSummary`
(`{ core, previous, effort, outcomes, benchmarks }`) — re-exported from the
actions file so `AgentPerformanceShell`'s import is unchanged.

**Called by:** `AgentPerformanceShell` on period change.

#### `getAgentDetailMetricsAction(agentId, domain, period, customFrom?, customTo?)`

Manager/founder only. Manager must pass matching `domain`. Agent/guest denied. Returns `ActionResult<AgentDetailMetrics>`. Called by `AgentDetailPanel`.

#### `getManagerRosterAction(period, allDomains, customFrom?, customTo?)`

Manager/founder/admin only (agent/guest denied). Resolves the range (custom override aware), then `rosterDomain = (allDomains || caller.role !== 'manager') ? null : caller.domain` — manager is always pinned to their own domain regardless of the `allDomains` flag. Calls `getAgentRosterPerformance`. Returns `ActionResult<AgentRosterRow[]>`. Called by `ManagerPerformancePanel` on client-side period/date change (roster refetch without remount).

#### `getDomainHealthMetricsAction(period, customFrom?, customTo?)`

Manager/founder/admin only. Resolves range, calls `getDomainHealthMetrics([...GIA_DOMAINS], from, to)`. Returns `ActionResult<DomainHealthCard[]>`. Called by `DomainOverviewPanel` on the founder **Domains** tab on period/date change.

#### `upsertDomainTargetAction(domain, targetValue)`

Admin/founder only. Sets the monthly deals-closed target for a domain from the `DomainTargetMeter` inline edit affordance. Zod first (S-01): `domain ∈ GIA_DOMAIN_ENUM`, `targetValue` a non-negative number ≤ 100,000. Then `requireProfile(['admin','founder'])` (RLS write policy is the second layer), then `upsertDomainTarget(domain, value, callerId)` in `domain-targets-service.ts` (admin-client upsert on `(domain, metric='deals_closed', period='month')`). Returns `ActionResult<DomainTarget>` (the optimistic row — `{ domain, metric, target_value, period }`). Called by `DomainOverviewPanel` / `DomainTargetMeter`.

---

### 7. The `/performance` Page — Role Branching

#### 7a. `page.tsx`

| Role | Title | Filter | Content |
| ------ | ------- | -------- | --------- |
| Agent | "Your Performance." | none (filter bar is inside `AgentPerformanceShell`) | `AgentPerformanceShell` with `initialData` + `PerformanceMotivationalFooter` |
| Manager | "Team Performance." | `PerformanceFilters showSearch` | `Suspense` → `ManagerPerformanceAsync domain={profile.domain}` |
| Founder/admin | "Performance." | `PerformanceFilters showSearch` | `FounderPerformanceShell` |

**Agent branch** (D-2, 2026-06-11): The page renders an `AgentPerformanceAsync` subtree inside `<Suspense fallback={<PerformanceSkeleton />}>` so the header (`Your Performance.`) paints as soon as the role is known — the agent's exposure to the manager/founder `loading.tsx` chrome is bounded to the profile-fetch window. Inside, `AgentPerformanceAsync` does ONE `getAgentPerformanceSummary('this_month')` round trip (the self-scoped `get_agent_performance` RPC; replaces the old 5-call / ~17-query fan-out) and passes it as `initialData` to `AgentPerformanceShell`. No `PerformanceFilters`, no URL params for the agent view. `PerformanceMotivationalFooter` always uses `'this_month'` (server-rendered with the same initial fetch). The agent `<main>` uses the responsive `flex-1 min-w-0 p-4 sm:p-6 lg:p-8` padding (all three role branches do).

**Manager domain rule:** `domain={profile.domain}` is server-verified. **Never** read `searchParams.domain`.

**Default period (manager/founder):** `parsePeriod` → invalid/missing → `'this_month'`.

#### 7b. `PerformanceFilters`

Used by manager and founder views only. Agent view no longer uses this component.

| Control | Behaviour |
| --------- | ---------- |
| Sliders icon + badge | `activeCount` = non-default period + search + custom dates |
| `SearchBar` | `showSearch` only; debounce **500ms**; URL `?search=`; filters roster client-side |
| Period `FilterDropdown` | Single select: week / month / last month / all time / custom |
| Custom dates | `AnimatePresence` slide-in `DatePicker` pair when `period === 'custom'` |
| Clear | Shown when `activeCount > 0`; `router.push(pathname)` |

---

### 8. Agent Self-View

#### 8a. `AgentPerformanceShell` (new 2026-06-04)

**Location:** `src/components/performance/AgentPerformanceShell.tsx` (`'use client'`)

**Props:**

```typescript
{
  agentId:     string;
  agentDomain: string;
  initialData: AgentSelfMetrics;   // fetched server-side for 'this_month'
}
```

**State owned:**

- `period: PerformancePeriod` — initialised to `'this_month'`
- `activeTab: 'overview' | 'today'`
- `data: AgentSelfMetrics` — initialised from `initialData`
- `isLoading: boolean`
- `customFrom / customTo: Date | null`

**Period selector:** Flat inline pill row with `ChevronRight` separators:

```text
[ Today ] › [ This Week ] › [ This Month ] › [ Custom ]
```

Active button: `--theme-paper` bg + `--shadow-1`. Inactive: transparent + tertiary text. Custom reveals `DatePicker` fields inline via `AnimatePresence`. Entire selector dims + `pointer-events: none` while loading.

**Loading UX:** When period changes, a 2px accent bar (`scaleX 0→1`, 900ms) appears at the top of the content area and the panel dims to 50% opacity. No skeleton flash — the previous data stays visible during the refetch.

**`useEffect` skip rule:** On first mount, if `period === 'this_month'`, the effect skips the fetch (server-already provided `initialData`). Subsequent period changes always fetch.

**Content tabs:** Two tabs — "Overview" and "Today" — rendered as an underline tab bar. When `period === 'today'`, the tab bar hides and the view goes directly to the Today layout.

**Switching period to 'today'** also forces `activeTab` to `'today'` automatically.

#### 8b. Overview tab

Always shows a **today snapshot strip** at the top regardless of the selected period: Calls / Notes / Won since IST midnight. The three values are fed from the **pulse RPC** (`getAgentTodayPulse` → `callsToday.total` / `notesToday` / `deals.dealCount`), the genuine since-IST-midnight source — **never** the period-scoped `effort`/`core` fields, which are wrong under the "since midnight IST" label when period ≠ today. This gives the agent instant context even when browsing a historical period.

Below the strip: `CoreFourGrid` → `EffortGrid` → `CallOutcomeBar` — all scoped to the active period.

When `period === 'today'`, the today strip is hidden (the Today tab already shows this data).

#### 8c. Today tab

- Hero 2-column grid: **Calls Today** + **Notes Today** (large Playfair serif values, `--text-display`).
- Call outcome donut (`CallOutcomeBar`) for today's range.
- Four pipeline cards: Won / In Discussion / Nurturing / Revenue (tinted `--color-*-light` and `--theme-accent-surface` backgrounds). Won / In Discussion / Nurturing are live counts; Revenue + deal count come from `public.deals` (won_at in the active period, via the pulse).

#### 8d. `CoreFourGrid`

- **Layout:** Single flex row of 4 cards.
- **Per card:** Eyebrow; accent-surface icon chip; Playfair `--text-3xl` value; synthetic `AreaChart` sparkline; period delta with ↑/↓/−; optional benchmark strip; tertiary sub-label.
- **Sparkline colours** (`useChartTokens().series`): index 0 → accent (Won); 1 → info (Touch); 2 → warning (Response); 3 → success (Conversion).
- **Benchmarks:** `agentCount < 2` → all averages `null` → strip omitted entirely (not "—").
- **Response time benchmark:** Lower is better — accent pip when agent value **<** domain average.
- **Null contract:** `avgResponseTimeMinutes` and `conversionRate` render **"—"** — never `0m` / `0%`.

#### 8e. `EffortGrid`

4 compact flex cards. Calls Logged (success), Notes Written (accent), In Discussion (info), Nurturing (warning). Fill bars on Calls + Notes only (`maxValue = max(callsLogged, notesWritten, 1)`). In Discussion / Nurturing: no bar (live pipeline counts, not period activity).

#### 8f. `CallOutcomeBar`

Left legend (pill rows: dot, label, count, %) + right `PieChart` donut (innerRadius 56, outerRadius 82). Donut centre: top outcome label + %. Empty: Playfair italic "No calls logged this period." Uses `resolveVar()` for SVG fills.

#### 8g. `PerformanceMotivationalFooter`

Server component in `page.tsx`. Playfair italic, no glyph. Always renders below agent content. Copy: if `leadsWon > 0` → closed count; else if `inDiscussionCount > 0` → "almost there"; else → "Every expert was once a beginner."

#### 8h. `PerformanceSkeleton` (still exists, no longer used for agent view)

Used if the Suspense pattern is reintroduced. Tier 1: 4 KPI skeletons. Tier 2: 4 effort skeletons. Tier 3: outcome skeleton.

---

### 9. Manager View

#### 9a. `ManagerPerformanceAsync`

1. Resolve `from`/`to` (custom override or `getPeriodDateRange(period)`).
2. `getAgentRosterPerformance(rosterDomain, from, to)`.
3. Render `ManagerPerformancePanel` — **no `key={period}`** (removed 2026-06-04).

**`key={period}` removal (2026-06-04):** The `key` was forcing a full remount on every period change, resetting `selectedId` back to its initial `null` value (now the empty-state prompt) and losing the user's selection. The period already flows through props to `AgentDetailPanel.useEffect`, which re-fetches correctly. The `key` was unnecessary and harmful.

**Invariant:** `ManagerPerformancePanel` must **never** carry `key={period}`. Period state flows through props, not remount.

#### 9b. `ManagerPerformanceSkeleton`

Left: 280px column — "Agents" label + 4 agent card skeletons, stagger 0/80/160/240ms. Right: avatar + name lines, 5-column stat strip, two bar blocks.

#### 9c. `ManagerPerformancePanel`

**Props:** `agentRoster`, `domain`, `period`, `customFrom?`, `customTo?`, `allDomains?`.

**Left — roster:**

- Header: "Agents" + domain filter icon (`allDomains` only).
- Domain popover: client-side `domainFilter` state — no refetch.
- Grouping: `buildPerformanceRosterGroups` — founder: `PERFORMANCE_ROSTER_DOMAIN_ORDER`, A–Z within group; manager: single domain A–Z.
- `AgentCard`: `motion.button`, entrance `x: -8 → 0`; stagger `Math.min(index * 35, 280)` ms.
- Search: `useSearchParams().search` — client filter.

**Default selection — `selectedId` initialises to `null` (no pre-selected agent).** Clicking a row sets `selectedId`. When domain/search filters narrow the roster so the selected agent is no longer visible, `selectedId` resets to `null`. `getFirstAgentInPerformanceRosterList` is **not** called here (it remains a utility in `performance-roster-display.ts`).

**Right panel:**

- `selectedId === null` → `<PerformanceRosterEmptyState>` (accent radial wash, Playfair italic "select an agent" prompt; `minHeight: min(320px, 40vh)` — no fixed-height column lock).
- `selectedId !== null` → `AgentDetailPanel` inside `AnimatePresence mode="wait"` keyed by `selectedAgent.id`.

#### 9d. `AgentDetailPanel` (updated 2026-06-04)

**`metricsAgentId` ref:** Tracks which agent the current `metrics` state belongs to. Distinguishes two loading modes:

- **Agent switch** (`metricsAgentId.current !== agent.id`): `setMetrics(null)` is called — full skeleton shown.
- **Period change** (same agent): `setMetrics(null)` is NOT called — existing data stays visible at 45% opacity. A 2px accent bar (`scaleX 0→1`) appears at the top of the panel. `pointer-events: none` during load.

**Fetch pattern:** Plain Promise `.then()/.catch()` with `cancelled` ref. Never `startTransition` (would defer `setMetrics(null)` and prevent skeleton).

**`isLoading` initialises to `true`** so skeleton renders on first paint without a micro-flash.

**`metricsAgentId` invariant:** Must be reset to `null` before the fetch on agent switch. Ensures the agent-switch skeleton path is always taken for a new agent regardless of any in-flight state.

**Identity zone:** `Avatar lg` + `selected` ring; success live pip; Playfair name; accent-surface domain badge; mono lead count; conversion % badge (success/warning/danger at 40%/20%).

**Stats:** Four `StatAtom` tiles (pastel palettes — intentional non-token colours): Total Calls, Leads, Won, Revenue.

**Tappable tiles (2026-06-15).** The four `StatAtom` tiles are tap targets that open the **same three drill modals the founder deck uses** — `AgentCallsDrillModal` (Total Calls), `AgentLeadsDrillModal` (Leads), `AgentDealsDrillModal` (Won **and** Revenue → deals, deck parity). The detail panel and the deck now share one drill-modal layer (same `{ open, agentId, agentName, domain, onClose }` props, same fetch-on-open behaviour, same `assertDrillAccess` authz — no new modal/action/query). The tap affordance is opt-in via the new optional `StatAtom onClick?` prop: when passed, the tile renders a `motion.button` with `.serene-pressable` press-scale + cursor + focus ring (matching the deck's `DeckTile`); when absent, it renders the original static `motion.div` (so `DomainOverviewPanel`'s four `StatAtom` cards stay byte-identical — no tap affordance). The modals portal to `document.body`, so they remain interactive during the period-refetch dim (which sets `pointerEvents:'none'` on the panel body); `drill` state resets on agent switch so a stale modal can't carry the prior agent's data. The Conversion/Pipeline/Deal-Breakdown/Call-Outcome sections stay display-only.

**Pipeline:** Segmented bar + chip legend on `--theme-paper-subtle`.

**Error:** `--color-danger-light` background.

---

### 10. Founder / Admin View

#### 10a. `FounderPerformanceShell` (`'use client'`)

Owns `activeTab: 'agents' | 'domains'` in `useState` (initial `'agents'`) — **never** a URL param. The tab switcher is a hand-rolled two-button pill row (`--theme-accent-surface` active fill), **not** `TabSelector`. Props: `domain` (placeholder `DEFAULT_GIA_DOMAIN`), `period`, `customFrom`, `customTo`, `initialDomainHealth`, `initialTargets` (`DomainTarget[]` — founder-set monthly deals targets), `monthDeals` (`Partial<Record<AppDomain, number>>` — deals closed THIS MONTH per domain, the month-pinned meter input), `canEditTargets` (boolean), `agentsSlot`.

- **Agents tab:** renders the `agentsSlot` passed from `page.tsx` — a `<Suspense fallback={<ManagerPerformanceSkeleton />}><ManagerPerformanceAsync allDomains /></Suspense>`. The shell does not construct the roster itself; the page injects it so the server `Suspense` boundary lives at the page level. The slot stays mounted (`display:none` when inactive) so the roster + selection survive a tab round-trip.
- **Domains tab:** renders `<DomainOverviewPanel initialData={initialDomainHealth} period customFrom customTo initialTargets monthDeals canEditTargets />`. `DomainOverviewPanel` is `next/dynamic` (perf audit G-3) — its Recharts chunk loads on first Domains-tab click, behind a same-shape `.skeleton` fallback.

#### 10b. `DomainOverviewPanel` (founder Domains tab)

`src/components/performance/DomainOverviewPanel.tsx` — `'use client'`.

- Seeded with `initialDomainHealth` (fetched server-side in `page.tsx` for the active period/range) so first paint needs no client fetch.
- Refetches via `getDomainHealthMetricsAction(period, customFrom, customTo)` on period/date change.
- Renders four GIA-domain cards (2×2): Total Leads · Total Calls · Total Revenue (+ conversion) per domain, plus a comparative Recharts `BarChart` with a metric toggle (Leads | Calls | Revenue).
- `DomainHealthGrid.tsx` is a **separate, retained-but-unmounted** legacy grid — not used on either tab. Do not confuse it with `DomainOverviewPanel`.

#### 10b-2. Founder drill-down deck (Phase 5, 2026-06-14)

On the founder/admin **Agents** tab, `ManagerPerformancePanel` (allDomains path) shows a
**"Deck view"** trigger that opens `FounderDrillDownDeck` (`src/app/(dashboard)/performance/`,
`next/dynamic`, `ssr:false` — Heavy-modal rule). The deck is a `Dialog size="full"` (opts OUT of
the `<md` bottom-sheet) wrapping the generic `<Carousel>` (`src/components/ui/Carousel.tsx` — a
content-agnostic swipe primitive with touch axis-lock; `AdCreativeCarousel` is deliberately
untouched, R-01).

- **Mobile = default view (2026-06-15).** Desktop/tablet are unchanged — the deck stays a
  trigger-driven overlay. On a **phone** (`useMediaQuery(MQ.mobile)`) with a non-empty `allDomains`
  roster, the panel auto-opens the deck once per mount via an `autoOpenedDeck` ref latch (a manual
  close is respected). The latch is gated on `allDomains`, so managers and desktop/tablet never
  auto-open.
- **Zero per-swipe fetch of tiles (invariant).** One slide per agent; the tiles render ONLY
  in-memory `AgentRosterRow` fields (the deck is passed `visibleAgents`, respecting the active
  client-side domain filter). Swiping changes the controlled `index` and fires NO tile fetch. Never
  add a fetch keyed on a tile.
- **Three metric tiles, one row (2026-06-15).** Total Calls → `AgentCallsDrillModal`, Leads →
  `AgentLeadsDrillModal`, Revenue → `AgentDealsDrillModal`. ("Deals won" was dropped — the card is
  revenue + two others.) Each modal fetches ON OPEN only and portals ABOVE the full Dialog.
- **`AgentRosterRow` has no `totalCallsMade`**, so the "Total Calls" tile is **label-only** ("View")
  — a number would require a per-agent fetch and break the zero-swipe rule. The call COUNT lives
  only inside the Recent-calls modal.
- **Toggleable breakdown — lazy, once per card (2026-06-15).** Below the tiles each card carries a
  breakdown with a deck-level mode toggle: **Call outcome** (reuses `CallOutcomeBar`, lazy Recharts)
  ↔ **Lead status** (reuses the extracted `PipelineBar`). Both are fed by **one**
  `getAgentDetailMetricsAction` call (`callOutcomeBreakdown` + `pipelineBreakdown` — **no new RPC**),
  fetched the first time a card becomes active and cached per agent (`breakdowns` state map keyed by
  agent id; a `requested` ref-Set fires the action **exactly once per agent** across swipes and
  re-renders). A period/date/domain change clears the cache + guard so the active card refetches; an
  unseen card never fetches. This is the deck's only sanctioned fetch — the tile zero-fetch rule
  stands.
- **Count contract (sign-off).** `AgentCallsDrillModal` is titled the literal **"Recent calls"**;
  its subtitle is `items.length` / "showing N most recent" — **never** the card's `totalCallsMade`
  (a cohort aggregate that legitimately disagrees with the `lead_notes` event list). One row per
  call: the source query reads `lead_notes WHERE call_outcome IS NOT NULL`, so no `note_added`
  duplicates are possible (`'call_logged'` would also work but `lead_notes` IS the call record).

**Authz (all four drill actions).** A shared `assertDrillAccess` in `performance.ts` mirrors
`getAgentDetailMetricsAction` exactly: `requireProfile(['manager','admin','founder'])` → a manager
must pass `domain === caller.domain` (fails CLOSED otherwise). Leads/deals reuse the existing
`getLeadsByRole`/`getDealsByRole` paths with `filters.agent_id` (no new service query — those paths
already honour `agent_id` on the manager/founder branch, and the agent-caller branch ignores it).
Calls use `getAgentCallsPageForManager` — the only NEW read fn (`lead_notes` for phone+outcome+note
fidelity). The deck trigger is founder-only to avoid the manager domain-pass ambiguity.

#### 10c. Differences from manager view

| Aspect | Manager | Founder / admin |
| -------- | --------- | ----------------- |
| Roster scope | `profile.domain` | All agents (`rosterDomain = null`) |
| Domain filter | N/A | Client popover on roster header |
| `getAgentDetailMetricsAction` | Domain must match caller | No domain guard; `domain: null` allowed |
| Page title | "Team Performance." | "Performance." |
| URL `?domain=` | **Never used** | **Never used** |

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
2. **Action `getAgentDetailMetricsAction`:** Manager must pass matching domain; agents denied.
3. **Action `getAgentSelfMetricsAction`:** Agent-only; all other roles denied.
4. Never trust client-supplied domain for manager authorization.

---

### 12. Known Invariants (must never be violated)

1. **Date-field rule:** `leadsWon` / `conversionRate` use `status_changed_at`. `touchRate` uses `created_at` cohort — intentional.
2. **Manager domain** always from `profile.domain`, never from URL.
3. **`agentCount < 2`** → all benchmark averages `null`, not `0`.
4. **`leadsWon`** excluded from `TeamBenchmarks` by design.
5. **Response time benchmark:** Lower is better — accent pip when agent < domain average.
6. **Roster API sort:** `conversionRate` null → `-Infinity`, not `0`.
7. **Recharts colours:** `useChartTokens()` or `resolveVar()` for SVG fills — never raw `var(--)` in Recharts without resolution.
8. **`ManagerPerformancePanel` must never carry `key={period}`** — period flows through props. Remount loses selected agent.
9. **`AgentDetailPanel.metricsAgentId`** must be reset on agent switch before fetch. Ensures skeleton on new agent regardless of in-flight state.
10. **IST boundaries** for all period presets (`today`, `this_week`, `this_month`, `last_month`) — never UTC midnight. (`callsToday` in `getAgentDetailMetrics` is no longer an IST-today window — it mirrors the period cohort; see §5.)
11. **Null metrics:** `avgResponseTimeMinutes` / `conversionRate` display `"—"`, not zero.
12. **Performance queries** stay in `performance-service.ts` only.
13. **Sidebar order** uses `performance-roster-display.ts` (A–Z / domain groups), not API sort order.
14. **Founder domain filter** is client-side popover only — never URL param, never filter bar control.
15. **Agent period selector** is client state inside `AgentPerformanceShell` — never URL params, never `PerformanceFilters`.
16. **`AgentPerformanceShell` skip rule:** First mount with `period === 'this_month'` skips fetch — `initialData` is already the correct data.
17. **`getAgentDetailMetrics` runs exactly 3 queries** (cohort leads, won deals, cohort call data). Do not reintroduce a separate IST-today `callsToday` query or a `getLeadHealth`-style 4th–6th query — `callsToday` mirrors `totalCallsMade` by design (see §5). There is **no** health `useEffect` in `AgentDetailPanel`; the panel's only fetch is `getAgentDetailMetricsAction`, on agent switch or period change (§9d).

---

### Component inventory

#### `src/components/performance/`

| File | Role |
| ------ | ------ |
| `AgentPerformanceShell.tsx` | Agent self-view: period selector, content tabs, client-driven fetch |
| `PerformanceFilters.tsx` | Filter bar for manager/founder views only |
| `CoreFourGrid.tsx` | Agent KPI row + sparklines |
| `EffortGrid.tsx` | Agent effort cards |
| `CallOutcomeBar.tsx` | Donut + legend (agent self-view + manager detail panel + the deck card's "Call outcome" breakdown mode) |
| `PipelineBar.tsx` | Segmented lead-status bar + legend chips — extracted from `AgentDetailPanel`'s former private `PipelineSection` (2026-06-15); reused by the detail panel's "Lead Pipeline" section AND the deck card's "Lead status" breakdown mode (R-01, no copy-paste) |
| `ManagerPerformancePanel.tsx` | Two-column team shell; roster (left) + detail/empty-state (right); domain popover; client roster refetch via `getManagerRosterAction`. Mobile (`allDomains`): auto-opens the deck as the default view |
| `AgentDetailPanel.tsx` | Manager/founder agent detail; four `StatAtom` tiles open the deck's drill modals (calls/leads/deals) on tap; `FirstTouchScorecard` below the outcome donut |
| `FirstTouchScorecard.tsx` | First-touch SPEED card below `CallOutcomeBar` (`< 15m`…`3h+` business-minute buckets per agent shift; untouched footnote). Display-only; data from `getAgentFirstTouchScorecard` (`get_agent_first_touch_pairs` RPC 0123, React `cache()`) |
| `PerformanceRosterEmptyState.tsx` | Right-panel prompt when `selectedId === null` (Agents tab) |
| `DomainOverviewPanel.tsx` | Founder **Domains** tab — 4 health cards (2×2; incl. Deals Closed) + month-pinned `DomainTargetMeter` + founder/admin inline target edit + comparative bar chart; refetch via `getDomainHealthMetricsAction`; mobile = CSS scroll-snap carousel (no library) |
| `DomainTargetMeter.tsx` | Radial deals-vs-target meter (Recharts `RadialBarChart`, 2 colours via `useChartTokens`); month-pinned (`monthDeals` vs `domain_targets`, never the period filter); target null/0 → `<EmptyState>` inline "No target set." — never a division |
| `AgentCallTrendChart.tsx` | 14-day daily-calls area chart (Today tab); composes `ChartFrame` + `cartesianDefaults`; `next/dynamic` from the shell |
| `AgentRecentActivityList.tsx` | Agent Today view — keyset "load more" (composite cursor `(created_at, id)`, page 15, button not infinite scroll) via `getAgentRecentLeadActivityAction` |
| `DomainHealthGrid.tsx` | Legacy domain card grid — retained but **not mounted** on any tab |
| `StatAtom.tsx` | Single pastel stat tile — `AgentDetailPanel` stats row (4 tap-target tiles via optional `onClick`) + `DomainOverviewPanel` health cards (static, no `onClick`). With `onClick` → pressable `motion.button`; without → original static `motion.div` |

#### `src/app/(dashboard)/performance/`

| File | Role |
| ------ | ------ |
| `page.tsx` | Role branch orchestrator; agent `this_month` initialData; founder `initialDomainHealth` + `agentsSlot` |
| `loading.tsx` | Route-level Suspense fallback (Next.js streaming) |
| `PerformanceSkeleton.tsx` | Agent-shaped skeleton — used by `loading.tsx` (`PerformanceAsync.tsx`, the legacy unmounted data shell, was deleted in perf Phase 4) |
| `ManagerPerformanceAsync.tsx` | Team data shell (roster + founder domain-health seed) |
| `ManagerPerformanceSkeleton.tsx` | Team loading |
| `FounderPerformanceShell.tsx` | Founder/admin `'use client'` two-tab shell (Agents / Domains); owns tab state |
| `FounderDrillDownDeck.tsx` | Founder/admin swipeable per-agent deck (`Dialog size="full"` + `<Carousel>`); trigger-opened on desktop/tablet, auto-opened on mobile; 3 tap-target tiles (calls/leads/revenue) + a lazy, per-agent-cached toggleable breakdown (outcome ↔ status) fed by one `getAgentDetailMetricsAction` |

#### `src/lib/actions/performance.ts`

| Action | Caller | Auth |
| -------- | -------- | ------ |
| `getAgentSelfMetricsAction` | `AgentPerformanceShell` | agent only |
| `getAgentPulseAction` | `AgentPerformanceShell` (Today tab) | agent only |
| `getAgentRecentLeadActivityAction` | `AgentRecentActivityList` | agent only (id from profile) |
| `getAgentDetailMetricsAction` | `AgentDetailPanel` | manager (own domain), admin, founder |
| `getAgentFirstTouchScorecardAction` | `AgentDetailPanel` (`FirstTouchScorecard`) | manager (own domain), admin, founder (`assertDrillAccess`) |
| `getManagerRosterAction` | `ManagerPerformancePanel` | manager (own domain pinned), admin, founder |
| `getDomainHealthMetricsAction` | `DomainOverviewPanel` | manager, admin, founder |
| `upsertDomainTargetAction` | `DomainOverviewPanel` / `DomainTargetMeter` | admin, founder |
| `getAgentCallsForManagerAction` | `AgentCallsDrillModal` (deck) | manager (own domain), admin, founder |
| `getAgentActivityForManagerAction` | (drill-down reuse — full feed) | manager (own domain), admin, founder |
| `getAgentLeadsScopedAction` | `AgentLeadsDrillModal` (deck) | manager (own domain), admin, founder |
| `getAgentDealsScopedAction` | `AgentDealsDrillModal` (deck) | manager (own domain), admin, founder |

All four go through the shared `assertDrillAccess` (mirrors `getAgentDetailMetricsAction` authz:
`requireProfile(['manager','admin','founder'])` → manager `domain === caller.domain` guard).

---

### Shared utilities

#### `buildFilterParams` — `src/lib/utils/filter-params.ts`

Used by `PerformanceFilters` (manager/founder). Not used by agent view.

#### `formatDuration` — `src/lib/utils/dates.ts`

`null → "—"`, `< 60 → "48m"`, `≥ 60 → "2h 34m"`.

#### `useChartTokens` / `resolveColorMap` — `src/components/ui/charts/useChartTokens.ts`

Resolves CSS tokens via `getComputedStyle`. Re-subscribes on `data-theme` MutationObserver. `resolveColorMap` for record-shaped colour maps.

#### `resolveVar` (local in `CallOutcomeBar.tsx`)

```typescript
function resolveVar(name: string): string
// Resolves 'var(--token)' to computed hex/rgb for Recharts SVG fills.
```

---

### Roster display helpers — `src/lib/utils/performance-roster-display.ts`

- `PERFORMANCE_ROSTER_DOMAIN_ORDER` — Gia domains first, then remaining `APP_DOMAINS`.
- `buildPerformanceRosterGroups(agents, { allDomains, domain })` — sidebar structure.
- `getFirstAgentInPerformanceRosterList(...)` — first visible agent in display order (not `roster[0]` from API sort). **No longer called by `ManagerPerformancePanel`** (default selection is now `null` → empty state); retained as a utility for any future first-agent default.
