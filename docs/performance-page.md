# Performance Page — Full Intelligence Document

Last verified: 2026-06-01

---

## 1. Module Overview

**Route:** `/performance` — one URL, three role-specific layouts. All views share the same filter bar component (`PerformanceFilters`) for period (and optionally search / custom dates). Data never crosses feature folders; everything flows through `src/lib/services/performance-service.ts` and `src/lib/actions/performance.ts`.

| Role | View | Primary async shell | Redirect if unauthorized |
| ------ | ------ | --------------------- | ------------------------- |
| `agent` | Self-view: Core Four KPIs, effort cards, call-outcome donut, motivational footer | `PerformanceAsync` | — |
| `manager` | Team view: agent roster (left) + agent detail (right) | `ManagerPerformanceAsync` | — |
| `founder` / `admin` | Same team UI as manager, all domains; domain narrowing is client-side on roster only | `FounderPerformanceShell` → `ManagerPerformanceAsync` with `allDomains={true}` | — |
| `guest` | — | — | `redirect('/dashboard')` |

**Branching** (exact order in `src/app/(dashboard)/performance/page.tsx`):

1. `getCurrentProfile()` — no profile → `redirect('/login')`
2. `profile.role === 'guest'` → `redirect('/dashboard')`
3. `profile.role === 'agent'` → agent layout (`maxWidth: 1280px`, `showSearch={false}`)
4. `profile.role === 'manager'` → manager layout (`domain={profile.domain}`)
5. Else (founder / admin) → `FounderPerformanceShell` with `DEFAULT_GIA_DOMAIN` placeholder domain prop

**Service boundary:** Performance queries live only in `performance-service.ts`. Never extend `leads-service.ts` or `dashboard-service.ts` for this module.

---

## 2. Data Indexes — migration 0013

File: `supabase/migrations/20260528000013_performance_indexes.sql`

| Index name | Columns | Partial condition | Queries benefited |
| ------------ | --------- | ------------------- | ------------------- |
| `idx_lead_activities_actor_status` | `lead_activities(actor_id, action_type, created_at DESC)` | none (full table) | First-touch / response-time lookups: `lead_activities` filtered by `actor_id`, `action_type = 'status_changed'`, `details->>new_status = 'touched'`, date range on `created_at` (`_getCoreFourMetricsForRange`, `getTeamBenchmarks`, `getAgentRosterPerformance`, `getAgentDetailMetrics` response query) |
| `idx_lead_notes_author_outcome` | `lead_notes(author_id, created_at DESC)` | none | `getEffortMetrics` (calls + all notes), `getCallOutcomeBreakdown`, `getAgentDetailMetrics` (calls today, follow-ups, outcome breakdown) |
| `idx_leads_assigned_status_created` | `leads(assigned_to, status, created_at DESC)` | `WHERE archived_at IS NULL` | Cohort queries on `leads` by `assigned_to` + `created_at` (touch rate, pipeline breakdown, roster cohort totals) |

**Note:** Won/lost and conversion metrics filter on `status_changed_at`, not `created_at`. Those queries benefit from general `leads` indexes elsewhere; migration 0013 optimizes the cohort and activity shapes above.

---

## 3. Period System

### 3a. `PerformancePeriod` type

Defined in `src/lib/services/performance-service.ts`:

```typescript
export type PerformancePeriod =
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'all_time'
  | 'custom';
```

**`custom` fallback in `getPeriodDateRange`:** The `custom` case falls through to `return getPeriodDateRange('this_month')`. Any caller that invokes `getPeriodDateRange('custom')` without supplying explicit `from`/`to` strings gets **this month** (IST boundaries). That is intentional: custom bounds are always passed by the orchestrator (`ManagerPerformanceAsync`, `getAgentDetailMetricsAction`) as ISO datetimes; `getPeriodDateRange` is only a safe default for code paths that forget custom params.

**`getPreviousPeriodDateRange('custom')`:** Returns `null`. There is no well-defined “previous” window for an arbitrary user-selected range, so period-over-period deltas are omitted (agent view: `getPreviousPeriodCoreMetrics` returns `null`; Core Four delta lines absent).

**`TeamBenchmarks` in types:** `TeamBenchmarks` is exported from `performance-service.ts`, not `src/lib/types/index.ts`. `AgentRosterRow` and `AgentDetailMetrics` live in `src/lib/types/index.ts`.

### 3b. IST period boundaries

**Function:** `getPeriodDateRange(period)` and `getPreviousPeriodDateRange(period)` in `performance-service.ts`.

**Why IST:** Agents and lead operations are India-based. Day/week/month boundaries use **UTC+05:30** (`IST_OFFSET_MS = 5.5 * 60 * 60 * 1000`). Helpers: `toISTMidnight`, `toISTEndOfDay`, `getISTMondayStart`.

**Return shape:** `{ from: string; to: string }` — ISO 8601 UTC strings representing IST boundary instants.

| Period | `from` | `to` |
| -------- | -------- | ------ |
| `this_week` | IST Monday 00:00:00 of current week | `now` |
| `this_month` | IST 1st of current month 00:00:00 | `now` |
| `last_month` | IST 1st of previous month 00:00:00 | IST last moment of previous month |
| `all_time` | `2024-01-01T00:00:00Z` | `now` |
| `custom` | (fallback) same as `this_month` | `now` |

**Previous period** (`getPreviousPeriodDateRange`):

- `this_week` → prior Mon–Sun (IST)
- `this_month` → `getPeriodDateRange('last_month')`
- `last_month` → calendar month before last month (IST)
- `all_time` / `custom` → `null`

**`callsToday` boundary** (separate from period presets): IST midnight today via:

```typescript
const nowIst = new Date(new Date().getTime() + IST_OFFSET_MS);
nowIst.setUTCHours(0, 0, 0, 0);
const todayStart = new Date(nowIst.getTime() - IST_OFFSET_MS).toISOString();
```

Never use bare `new Date()` at UTC midnight for “today” — that is wrong for IST agents.

### 3c. Custom date range

**URL params:** `?period=custom&from=<ISO datetime>&to=<ISO datetime>`

**Writer:** `PerformanceFilters` — when period is `custom`, `AnimatePresence` reveals two `DatePicker` fields. `handleFromChange` / `handleToChange` push `period: 'custom'`, `from`, `to` via `buildFilterParams`. Leaving a preset period clears `from` and `to`.

**Readers:**

- `page.tsx` — reads `params.from`, `params.to` as strings; passes to `PerformanceFilters` and manager/founder shells.
- `ManagerPerformanceAsync` — `from = (period === 'custom' && customFrom) ? customFrom : range.from`; same for `to`.
- `getAgentDetailMetricsAction` — same override before calling `getAgentDetailMetrics`.

**Agent self-view gap (document as-is):** `PerformanceAsync` receives only `period`, not `customFrom`/`customTo`. If an agent selects Custom in the filter bar, service calls still use `getPeriodDateRange(period)` which falls back to **this month** until agent async is wired to pass explicit bounds. Manager/founder paths are correct.

---

## 4. The Critical Date-Field Rule

**Decision record — do not regress.**

### The production bug

All performance queries originally filtered won/lost (and conversion) by `leads.created_at`. Agents often close leads that were **created in an earlier period**. Example: lead created in March, marked won in May → **invisible** in “This Month” won count → showed **0** wins despite real activity.

### The fix — numbered invariants

1. **`leadsWon` (count of won leads in period):** Filter by `status_changed_at` where `status = 'won'`, plus `archived_at IS NULL` and assignee/actor scope as required.
2. **`conversionRate` (won ÷ closed):** Denominator = leads with `status IN ('won','lost')` closed in the period → filter by **`status_changed_at`**, not `created_at`.
3. **`touchRate`:** **Intentionally remains on `created_at`.** Cohort definition: “of leads **assigned/created in the period**, what % moved past `new`?” This measures responsiveness on **new-period intake**, not closure timing. **This is not the same bug as (1–2).** Do not “fix” touch rate to `status_changed_at` without an explicit product change.
4. **`getAgentRosterPerformance`:** **Two queries** — (a) cohort `totalLeads` from `created_at` in range; (b) won/lost counts and deal amount from **`status_changed_at`** in range on `won`/`lost` rows.
5. **`getAgentDetailMetrics`:** **`leadsWon` / revenue** from a dedicated query on won leads filtered by **`status_changed_at`**; **`pipelineBreakdown` / `newLeadsAttended`** from cohort query filtered by **`created_at`**.
6. **`callsToday`:** Filter `lead_notes` from **IST today start** (`todayStart`), not period `from`/`to`.

### Rule for new metrics

Before adding any performance query, answer explicitly:

- **Outcome / closure metric** → `status_changed_at`
- **Cohort / intake / pipeline snapshot metric** → `created_at` (or no date filter for live pipeline counts)
- **Activity metric** (calls, notes) → `lead_notes.created_at` or `lead_activities.created_at` as appropriate

---

## 5. Service Functions — `performance-service.ts`

### `getPeriodDateRange(period: PerformancePeriod): DateRange`

- **DB:** none (pure IST math).
- **Date columns:** N/A.
- **Called by:** Every function that needs preset bounds; `ManagerPerformanceAsync`; `getAgentDetailMetricsAction` (base range before custom override); `getTeamBenchmarks`; `getEffortMetrics`; `getCallOutcomeBreakdown`; `getCoreFourMetrics`.

### `getPreviousPeriodDateRange(period: PerformancePeriod): DateRange | null`

- **DB:** none.
- **Date columns:** N/A.
- **`custom` / `all_time`:** `null`.
- **Called by:** `getPreviousPeriodCoreMetrics`.

### `_getCoreFourMetricsForRange(agentId: string, range: DateRange): Promise<CoreFourMetrics>`

- **Leading underscore:** private helper; not exported for actions. Shared by current and previous period.
- **Tables / date columns:**
  - `leads` — `leadsWon`: `status_changed_at`; touch cohort: `created_at`; conversion closed set: `status_changed_at`
  - `lead_activities` — response time: `created_at` on activity; joined lead `created_at`
- **Returns:** `{ leadsWon, touchRate, avgResponseTimeMinutes, conversionRate }` — last three nullable per contract.
- **Called by:** `getCoreFourMetrics`, `getPreviousPeriodCoreMetrics`.

### `getCoreFourMetrics(agentId: string, period: PerformancePeriod): Promise<CoreFourMetrics>`

- Wraps `_getCoreFourMetricsForRange(agentId, getPeriodDateRange(period))`.
- **Called by:** `PerformanceAsync`; `page.tsx` (footer prefetch).

### `getPreviousPeriodCoreMetrics(agentId: string, period: PerformancePeriod): Promise<CoreFourMetrics | null>`

- Previous range via `getPreviousPeriodDateRange`; `null` if no previous period.
- **Called by:** `PerformanceAsync` → `CoreFourGrid` deltas.

### `getEffortMetrics(agentId: string, period: PerformancePeriod): Promise<EffortMetrics>`

- **Tables / date columns:**
  - `lead_notes` — `callsLogged`, `notesWritten`: `created_at` in period
  - `leads` — `inDiscussionCount`, `nurturingCount`: **no period filter** (live pipeline snapshot)
- **Called by:** `PerformanceAsync`; `page.tsx` (footer).

### `getCallOutcomeBreakdown(agentId: string, period: PerformancePeriod): Promise<OutcomeBreakdownItem[]>`

- **Table:** `lead_notes` — `call_outcome` not null, `created_at` in period.
- **Called by:** `PerformanceAsync`; `AgentDetailPanel` (via detail metrics).

### `getTeamBenchmarks(callerDomain: AppDomain, period: PerformancePeriod): Promise<TeamBenchmarks>`

- **Peer scope:** `profiles` where `domain = callerDomain`, `role = 'agent'`, `is_active = true`.
- **`agentCount < 2` guard:** Returns `{ avgTouchRate: null, avgConversionRate: null, avgResponseTimeMinutes: null, agentCount }` — **all null averages, not zero**. Benchmark UI omits lines entirely.
- **`leadsWon`:** Excluded by design (absolute count, not a rate).
- **Query strategy:** 3 flat queries (profiles + touch cohort + closed + activities) — **never N+1 per agent**.
- **Averaging:** Unweighted mean of per-agent means (documented in file header — not pool-wide weighted average).
- **Date columns:**
  - Touch: `leads.created_at` (cohort, same intent as agent touch rate)
  - Conversion: `leads.status_changed_at` on won/lost
  - Response: `lead_activities.created_at` with touched transition
- **Called by:** `PerformanceAsync` → `CoreFourGrid`.

### `getAgentRosterPerformance(domain: AppDomain | null, dateFrom: string, dateTo: string): Promise<AgentRosterRow[]>`

- **`domain === null`:** All active agents (founder/admin). Else filter `profiles.domain`.
- **Tables / date columns:**
  - Cohort leads: `created_at` between `dateFrom`/`dateTo`
  - Won/lost: `status_changed_at` between `dateFrom`/`dateTo`
  - Response times: `lead_activities.created_at` in range
- **Sort (API order):** Primary `leadsWon DESC` (`null` → `0`); secondary `conversionRate DESC` with **`null → -Infinity`** so agents with **no closed leads** never rank above agents with real conversion data.
- **Sidebar display order is separate** — see `performance-roster-display.ts` (A–Z within domain groups).
- **Called by:** `ManagerPerformanceAsync`.

### `getAgentDetailMetrics(agentId: string, domain: AppDomain | null, dateFrom: string, dateTo: string): Promise<AgentDetailMetrics>`

- **Internal `Promise.all` of 6 Supabase queries** (plus unused `responseData` fetch).
- **Date columns:** cohort `leads.created_at`; won `leads.status_changed_at`; notes/activities as above; `callsToday` IST boundary.
- **`domain` param:** Passed through for action auth; not used to filter queries inside service (agent scoped by `agentId`).
- **Called by:** `ManagerPerformanceAsync` (zero-flash seed); `getAgentDetailMetricsAction`.

### `getDomainsWithLeads(dateFrom: string, dateTo: string): Promise<AppDomain[]>`

- **Table:** `leads` — `created_at` in range, `archived_at IS NULL`.
- **Usage:** Legacy helper for domain tabs; **founder view no longer uses URL domain tabs** — roster popover uses domains present in roster rows instead.
- **Not called** from current performance page shell (retained in service).

---

## 6. Server Actions — `performance.ts`

### `getAgentDetailMetricsAction(agentId, domain, period, customFrom?, customTo?)`

| Step | Behavior |
| ------ | ---------- |
| Zod | `GetAgentDetailSchema`: `agentId` uuid; `domain` string min 1 **nullable optional**; `period` enum including `custom`; optional ISO `customFrom`/`customTo` |
| Auth | `getCurrentProfile()` — missing → `'Not authenticated.'` |
| Role | `agent` / `guest` → `'Access denied.'` |
| Manager guard | `caller.role === 'manager'` → requires `domain` truthy **and** `caller.domain === domain` — **403 if null or mismatch** |
| Founder/admin | May pass `domain: null` for all-domains detail fetch — guard skipped |
| Range | `getPeriodDateRange(period)` then override `from`/`to` when `period === 'custom'` and custom params present |
| Return | `ActionResult<AgentDetailMetrics>` — `{ data, error }`, never throws |

**Called by:** `AgentDetailPanel` on agent change (skips when seed guard matches); refresh path always callable from UI if added.

---

## 7. The `/performance` Page — Role Branching

### 7a. `page.tsx`

| Role | Title | `PerformanceFilters` | Content | Notes |
| ------ | ------- | ---------------------- | --------- | ------- |
| Agent | “Your Performance.” | `showSearch={false}` | `Suspense` → `PerformanceAsync` + `PerformanceMotivationalFooter` | `maxWidth: 1280px` for 4-card KPI row |
| Manager | “Team Performance.” | `showSearch` | `Suspense` → `ManagerPerformanceAsync domain={profile.domain}` | Domain **only** from `profile.domain` |
| Founder/admin | “Performance.” | `showSearch` | `FounderPerformanceShell` | No `?domain=` param |

**Manager domain rule:** `domain={profile.domain}` is server-verified from `getCurrentProfile()`. **Never** read `searchParams.domain`. Prevents cross-domain roster leakage via URL tampering.

**Default period:** `parsePeriod` → invalid/missing → `'this_month'`.

**Agent footer:** Page-level `Promise.all` of `getCoreFourMetrics` + `getEffortMetrics` for footer copy (separate from `PerformanceAsync` Suspense child).

### 7b. `PerformanceFilters`

**Location:** `src/components/performance/PerformanceFilters.tsx` (`'use client'`).

| Control | Behavior |
| --------- | ---------- |
| Sliders icon + badge | `activeCount` = non-default period + search + custom dates |
| `SearchBar` | Only if `showSearch` — manager/founder/admin; debounce **500ms**; URL param `search`; filters roster client-side in `ManagerPerformancePanel` |
| Period `FilterDropdown` | Single select: week / month / last month / all time / custom |
| Custom dates | `AnimatePresence` slide-in `DatePicker` pair when `period === 'custom'` |
| `buildFilterParams` | `src/lib/utils/filter-params.ts` — merges updates, deletes keys when `null` |
| Clear | Shown when `activeCount > 0`; `router.push(pathname)` strips all params; danger hover via tertiary → primary text |

**Clear visibility (actual code):** `period !== 'this_month'` OR `search` OR `customFrom` OR `customTo`. There is **no URL domain filter** (founder domain is roster popover state only).

---

## 8. Agent Self-View

### 8a. `PerformanceAsync`

**Props:** `agentId`, `domain` (for benchmarks), `period`.

**`Promise.all` (5 service calls):**

1. `getCoreFourMetrics(agentId, period)` → `CoreFourMetrics`
2. `getEffortMetrics(agentId, period)` → `EffortMetrics`
3. `getCallOutcomeBreakdown(agentId, period)` → `OutcomeBreakdownItem[]`
4. `getPreviousPeriodCoreMetrics(agentId, period)` → `CoreFourMetrics | null`
5. `getTeamBenchmarks(domain, period)` → `TeamBenchmarks`

**`domain` prop:** From `profile.domain` on page — **never URL**. Benchmarks are domain-scoped to the agent’s Gia domain.

**Renders:** Three sections with micro-labels — KPI row, effort row, call outcomes.

### 8b. `PerformanceSkeleton`

| Tier | Layout | Stagger |
| ------ | -------- | --------- |
| 1 | Section label + **4** KPI cards in one flex row (icon, value, sparkline, delta, benchmark strip placeholders) | 0 / 60 / 120 / 180 ms |
| 2 | Section label + **4** compact effort cards | same stagger |
| 3 | Outcome card: legend column + circular donut placeholder | inner legend rows 0/40/80 ms |

Suspense parent enforces ≥150ms visibility (V-08).

### 8c. `CoreFourGrid` (rebuilt 2026-06-01)

- **Layout:** Single **flex row** of 4 cards (not 2×2).
- **Per card:** Uppercase eyebrow; accent-surface icon chip (Lucide); Playfair `--text-3xl` value; synthetic **AreaChart** sparkline (`MiniSparkline`); period delta with ↑/↓/−; optional benchmark strip in bottom border area; tertiary sub-label.
- **Sparkline colours** (`useChartTokens().series`): index 0 Leads Won → accent; 1 Touch Rate → info; 2 Avg Response Time → warning; 3 Conversion Rate → success.
- **`useChartTokens` / `resolveVar`:** Recharts SVG `stroke`/`fill` need computed colours. Hook uses `getComputedStyle` + `MutationObserver` on `data-theme`. `CallOutcomeBar` uses local `resolveVar()` for `var(--color-*)` strings.
- **Benchmarks:** When `benchmarks.avg*` are `null` (`agentCount < 2`), **benchmark strip omitted** — not `"—"`.
- **Accent pip:** Shown when agent beats domain average; **inverse for response time** (`lowerIsBetter` → pip when value **<** benchmark).
- **Null contract:** `avgResponseTimeMinutes` and `conversionRate` render **"—"** via `formatDuration` / `formatPct` — never `0m` / `0%`.

### 8d. `EffortGrid` (rebuilt 2026-06-01)

- **Layout:** 4 compact cards in one flex row.
- **Cards:** Calls Logged (success), Notes Written (accent), In Discussion (info), Nurturing (warning) — semantic icon chip colours.
- **Values:** `--text-2xl`, light weight.
- **Fill bars:** Framer Motion width 0→% on mount; **only** Calls and Notes — `maxValue = max(callsLogged, notesWritten, 1)` so both bars normalize against the larger of the two.
- **In Discussion / Nurturing:** No fill bar (`maxValue: null`) — live pipeline counts, not period activity.

### 8e. `CallOutcomeBar` (rebuilt 2026-06-01)

- **Layout:** Left legend (pill rows: dot, label, count, %) + right **PieChart** donut (innerRadius 56, outerRadius 82).
- **Donut centre:** Top outcome label + % (first in `OUTCOME_ORDER` with count > 0).
- **Colours:** `resolveVar()` on semantic tokens — SVG cannot use raw `var(--*)` reliably.
- **Empty:** Playfair italic — “No calls logged this period.” (`--theme-text-tertiary`).

### 8f. `PerformanceMotivationalFooter`

- **Server component** in `page.tsx` — Playfair italic, Lia tone, **no glyph**.
- **When:** Always below agent `Suspense` content.
- **Copy:** If `leadsWon > 0` → closed count for period; else if `inDiscussionCount > 0` → “almost there”; else → “Every expert was once a beginner.”

---

## 9. Manager View

### 9a. `ManagerPerformanceAsync`

1. Resolve `from`/`to` (custom override or `getPeriodDateRange(period)`).
2. `getAgentRosterPerformance(rosterDomain, from, to)` where `rosterDomain = allDomains ? null : domain`.
3. `getFirstAgentInPerformanceRosterList(roster, { allDomains, domain })` — **display order**, not API sort order.
4. **Zero-flash:** If `firstAgentId` set → `getAgentDetailMetrics(firstAgentId, detailDomain, from, to)` where `detailDomain = allDomains ? null : domain`.
5. Render `ManagerPerformancePanel` with `key={period}`, `initialAgentId`, `initialDetailMetrics`.

**Empty roster:** Step 4 skipped — `initialDetailMetrics = null`.

**`key={period}`:** Forces full remount when period changes so `initialAgentId` / seed guard cannot pair new period with stale prefetched detail (same class of bug as dashboard **perf-01**).

**`allDomains`:** When `true`, roster query has no domain filter; detail metrics fetch passes `domain: null` to service/action.

### 9b. `ManagerPerformanceSkeleton`

- **Left:** 280px column — “Agents” label + **4** agent card skeletons, stagger **0 / 80 / 160 / 240 ms**.
- **Right:** Avatar + name lines, **5-column** stat strip skeleton, two bar blocks.

### 9c. `ManagerPerformancePanel`

**Props:** `agentRoster`, `domain`, `period`, `customFrom?`, `customTo?`, `initialAgentId?`, `initialDetailMetrics?`, `allDomains?`.

**Left — roster:**

- Header: “Agents” + **SlidersHorizontal** filter ( **`allDomains` only** ).
- **Domain popover:** Client-side `domainFilter` state — no refetch; domains with agents only; “All domains” reset; Check icon on active row.
- **Grouping:** `buildPerformanceRosterGroups` — founder: canonical `PERFORMANCE_ROSTER_DOMAIN_ORDER`, A–Z within group; manager: single domain group A–Z.
- **Section labels:** Shown when `allDomains && groups.length > 1`.
- **`AgentCard`:** `motion.button`, entrance `x: -8 → 0`; stagger `Math.min(index * 35, 280)` ms cap; active/hover: semibold name, accent mono **total leads** count, `Avatar` `selected` ring — **no background fill, no left border strip**.
- **Search:** `useSearchParams().search` — client filter on `full_name`.
- **Scroll:** `maxHeight: 600px`.
- **Empty roster:** Playfair “No agents in this domain yet.” Filtered empty: “Nothing matches these filters.”

**Right:** `AgentDetailPanel` inside `AnimatePresence mode="wait"` keyed by `selectedAgent.id`.

### 9d. `AgentDetailPanel`

**Zero-flash (perf-01 pattern):** Accepts `initialData`, `initialAgentId`. In `useEffect`, if `agent.id === initialAgentId && initialData` → **skip** `getAgentDetailMetricsAction`. Matches dashboard RSC consolidation: server data on first paint, no POST on mount for default agent.

Selecting another agent clears guard and fetches via action. Changing period remounts parent (`key={period}`) so seed realigns.

**Identity:** `Avatar` `lg` + `selected` ring; success **live pip**; Playfair name; accent-surface domain badge; mono lead count; conversion % badge (success / warning / danger thresholds 40% / 20%).

**Stats:** Five `StatAtom` cards in one flex row (pastel palettes — intentional non-token colours): Calls Today, New Leads, Follow-ups, Leads Won, Revenue (`formatCurrency`). Values use `--text-xl` in current implementation.

**Pipeline:** `SectionCard` — 10px `--radius-full` segmented bar; chip legend on `--theme-paper-subtle` + border.

**Loading:** `AnimatePresence mode="wait"` per block — skeletons mirror layout.

**Error:** `--color-danger-light` background + `--color-danger` border.

**`SectionCard`:** `--theme-paper`, `--shadow-1`, `--radius-lg`.

---

## 10. Founder / Admin View

### 10a. `FounderPerformanceShell`

- **Fetches:** Nothing itself — wraps `Suspense` + `ManagerPerformanceAsync`.
- **Passes:** `domain={DEFAULT_GIA_DOMAIN}` (placeholder when `allDomains`), `period`, `customFrom`, `customTo`, **`allDomains={true}`**.

### 10b. Differences from manager view

| Aspect | Manager | Founder / admin |
| -------- | --------- | ----------------- |
| Roster scope | `profile.domain` | All agents (`rosterDomain = null`) |
| Service `domain` arg | Caller domain | `null` on detail fetch |
| Domain filter | N/A (single domain) | Client popover on roster header |
| `getAgentDetailMetricsAction` | Manager guard: domain must match | No domain guard; `domain: null` allowed |
| Page title | “Team Performance.” | “Performance.” |
| URL `?domain=` | **Never used** | **Never used** |

---

## 11. Access Control Summary

| Role | Sees | Domain scope | View other agents’ detail |
| ------ | ------ | -------------- | --------------------------- |
| Agent | Own KPIs, effort, outcomes | `profile.domain` for benchmarks only | No (own id only) |
| Manager | Team roster + detail | **`profile.domain` only** — page + action | Yes, same domain only |
| Admin | All domains roster + detail | All (server); roster filter client-side | Yes, any agent |
| Founder | Same as admin | All | Yes, any agent |
| Guest | — | — | Redirect `/dashboard` |

**Enforcement layers:**

1. **Page:** Role branch; manager `domain={profile.domain}`; guest redirect.
2. **Action:** `getAgentDetailMetricsAction` — manager must pass matching domain; agents denied.
3. **Never** trust client-supplied domain for manager authorization.

---

## 12. Known Invariants (must never be violated)

1. **Date-field rule:** `leadsWon` and `conversionRate` (closed won/lost) use **`status_changed_at`**. **`touchRate`** uses **`created_at`** cohort — intentional, not a bug.
2. **Manager domain** always from **`profile.domain`**, never from URL `?domain=`.
3. **`agentCount < 2`** for team benchmarks → all average fields **`null`**, not `0`.
4. **`leadsWon`** is excluded from `TeamBenchmarks` by design.
5. **Response time benchmark:** Lower is better — accent pip when agent value **<** domain average.
6. **Roster API sort:** `conversionRate` null sorts as **`-Infinity`**, not `0`, so zero-closed agents do not float to the top on ties.
7. **Recharts colours:** Use **`useChartTokens()`** or **`resolveVar()`** for SVG fills — never raw `var(--*)` in Recharts `Cell`/`stroke` without resolution.
8. **Zero-flash:** `ManagerPerformancePanel` **`key={period}`** must stay — prevents stale `initialDetailMetrics` after period change (dashboard **perf-01** class).
9. **Seed skip:** `AgentDetailPanel` only skips fetch when `agent.id === initialAgentId && initialData`.
10. **IST boundaries** for period presets and `callsToday` — never UTC midnight for “today”.
11. **Null metrics:** `avgResponseTimeMinutes` and `conversionRate` display **"—"**, not zero.
12. **Performance queries** stay in **`performance-service.ts`** only.
13. **Sidebar order** uses **`performance-roster-display.ts`** (A–Z / domain groups), not `getAgentRosterPerformance` sort order.
14. **Founder domain filter** is **client-side popover only** — not filter bar tabs, not `?domain=`.

---

## Component inventory — `src/components/performance/`

| File | Role |
| ------ | ------ |
| `PerformanceFilters.tsx` | Unified filter bar |
| `CoreFourGrid.tsx` | Agent KPI row + sparklines |
| `EffortGrid.tsx` | Agent effort cards |
| `CallOutcomeBar.tsx` | Donut + legend (agent + detail) |
| `ManagerPerformancePanel.tsx` | Two-column team shell |
| `AgentDetailPanel.tsx` | Manager/founder detail |

## Route inventory — `src/app/(dashboard)/performance/`

| File | Role |
| ------ | ------ |
| `page.tsx` | Role branch orchestrator |
| `PerformanceAsync.tsx` | Agent data shell |
| `PerformanceSkeleton.tsx` | Agent loading |
| `ManagerPerformanceAsync.tsx` | Team data shell + zero-flash prefetch |
| `ManagerPerformanceSkeleton.tsx` | Team loading |
| `FounderPerformanceShell.tsx` | Founder/admin Suspense wrapper |

## Shared utilities

### `buildFilterParams` — `src/lib/utils/filter-params.ts`

```typescript
export function buildFilterParams(
  current: URLSearchParams,
  updates: Record<string, string | null>,
  options?: { resetKeys?: string[] },
): URLSearchParams
```

Clones `current`, applies updates (`null` or `''` deletes key). Optional `resetKeys` deletes additional keys (not used by `PerformanceFilters` today).

### `formatDuration` — `src/lib/utils/dates.ts`

```typescript
export function formatDuration(minutes: number | null): string
// null → "—"; < 60 → "48m"; else "2h 34m" style
```

### `useChartTokens` / `resolveColorMap` — `src/components/ui/charts/useChartTokens.ts`

Resolves `--theme-accent`, `--color-info`, etc. via `getComputedStyle`. Re-subscribes on `data-theme` `MutationObserver`. `resolveColorMap` generalizes the same pattern for status-colour maps.

---

## Roster display helpers — `src/lib/utils/performance-roster-display.ts`

- `PERFORMANCE_ROSTER_DOMAIN_ORDER` — Gia domains first, then remaining `APP_DOMAINS`.
- `buildPerformanceRosterGroups(agents, { allDomains, domain })` — sidebar structure.
- `getFirstAgentInPerformanceRosterList(...)` — first visible agent for zero-flash seed (not `roster[0]` from API sort).
