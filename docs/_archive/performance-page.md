# Performance Page — Full Intelligence Document

Last verified: 2026-06-09

---

## 1. Module Overview

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
5. Else (founder / admin) → fetches `initialDomainHealth` server-side via `getDomainHealthMetrics(GIA_DOMAINS, from, to)` (custom-range aware), then renders `FounderPerformanceShell` with `domain={DEFAULT_GIA_DOMAIN}` placeholder, `initialDomainHealth`, and `agentsSlot={<Suspense><ManagerPerformanceAsync allDomains /></Suspense>}`

**Service boundary:** Performance queries live only in `performance-service.ts`. Never extend `leads-service.ts` or `dashboard-service.ts` for this module.

---

## 2. Data Indexes — migration 0013

File: `supabase/migrations/20260528000013_performance_indexes.sql`

| Index name | Columns | Partial condition | Queries benefited |
| ------------ | --------- | ------------------- | ------------------- |
| `idx_lead_activities_actor_status` | `lead_activities(actor_id, action_type, created_at DESC)` | none | First-touch / response-time lookups |
| `idx_lead_notes_author_outcome` | `lead_notes(author_id, created_at DESC)` | none | `get_agent_performance` RPC (effort + outcomes), `getAgentDetailMetrics` |
| `idx_leads_assigned_status_created` | `leads(assigned_to, status, created_at DESC)` | `WHERE archived_at IS NULL` | Cohort queries by `assigned_to` + `created_at` |

---

## 3. Period System

### 3a. `PerformancePeriod` type

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

### 3b. IST period boundaries

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

### 3c. Custom date range

**Writer:** `AgentPerformanceShell` (agent) or `PerformanceFilters` (manager/founder) — `AnimatePresence` reveals two `DatePicker` fields. Custom params pushed as ISO strings.

**Readers:**

- `AgentPerformanceShell` — passes `customFrom?.toISOString()` / `customTo?.toISOString()` to `getAgentSelfMetricsAction`.
- `page.tsx` — reads `params.from`, `params.to`; passes to manager/founder shells.
- `ManagerPerformanceAsync` — overrides range when `period === 'custom' && customFrom`.
- `getAgentDetailMetricsAction` — same override before calling `getAgentDetailMetrics`.

---

## 4. The Critical Date-Field Rule

**Do not regress.**

1. **`leadsWon`:** Filter by `status_changed_at` where `status = 'won'`.
2. **`conversionRate`:** Denominator = leads with `status IN ('won','lost')`, filtered by `status_changed_at`.
3. **`touchRate`:** **Intentionally remains on `created_at`** — "of leads created in the period, what % moved past `new`?" This is not the same bug as (1–2). Do not change without an explicit product decision.
4. **`getAgentRosterPerformance`:** Cohort `totalLeads` from `created_at`; won/lost/deal from `status_changed_at`.
5. **`getAgentDetailMetrics`:** `leadsWon`/revenue from `public.deals.won_at`; pipeline/cohort from `leads.created_at`; `callsToday` = `totalCallsMade` (cohort `created_at`, NOT an IST-today window).
6. **Deal revenue** (roster `totalDealAmount` and detail `totalDealAmount`/`dealTypeBreakdown`): from `public.deals` filtered by `won_at` — never from a `leads` column.

**Rule for new metrics:** outcome/closure → `status_changed_at`. Cohort/intake → `created_at`. Activity (calls, notes) → `lead_notes.created_at` or `lead_activities.created_at`.

---

## 5. Service Functions — `performance-service.ts`

### `getPeriodDateRange(period)` / `getPreviousPeriodDateRange(period)`

Pure IST math — no DB call.

### `getAgentPerformanceSummary(period, customFrom?, customTo?)` — perf audit D-2, 2026-06-11

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

### `getAgentRosterPerformance(domain, dateFrom, dateTo)` — RPC-backed (D-2)

ONE `get_agent_roster_performance` call (migration 0101) — one pre-aggregated row
per active agent; LEFT JOINs keep zero-activity agents. Role-gated in SQL: manager
always pinned to `get_user_domain()`; admin/founder pass `domain === null` for all
agents; agents get zero rows. Cohort `created_at`; won/lost `status_changed_at`;
revenue from `public.deals.won_at`. Sort (in the service, unchanged): `leadsWon
DESC`, `conversionRate DESC` (null → `-Infinity` — never floats above real data).
Sidebar display order is separate (see `performance-roster-display.ts`).

### `getAgentDetailMetrics(agentId, domain, dateFrom, dateTo)`

**3** Supabase queries via `Promise.all` (not 6): (1) cohort leads `created_at` → `totalLeads` + `pipelineBreakdown`; (2) won deals from `public.deals` filtered by `won_at` → `leadsWon` + `totalDealAmount` + `dealTypeBreakdown`; (3) cohort leads with `call_count` / `last_call_outcome` → `totalCallsMade` + `callOutcomeBreakdown`.

**`callsToday` is NOT a separate IST-today query.** It is set equal to `totalCallsMade` (the period cohort call sum). There is no IST-midnight boundary computation in this function — all three queries are scoped to `dateFrom`/`dateTo`. The `callsToday` field name is retained for type/UI compatibility but no longer means "calls since IST midnight." `domain` is auth-only — it does not filter any query.

Revenue is sourced from `public.deals` (`deal_amount`, `won_at`), never from a `leads` deal column.

### `getDomainHealthMetrics(domains, dateFrom, dateTo)`

Calls `get_domain_health_metrics` RPC — one round-trip for all domains. `conversionRate` computed in service: `won + lost > 0 ? won / (won + lost) * 100 : null`. All bigint fields through `Number()`. Returns `DomainHealthCard[]`. Drives the founder **Domains** tab. `domains.length === 0` → `[]`.

### `getDomainsWithLeads(dateFrom, dateTo)`

Legacy helper — retained but not called from current shells.

---

## 6. Server Actions — `performance.ts`

### `getAgentSelfMetricsAction(period, customFrom?, customTo?)`

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

### `getAgentDetailMetricsAction(agentId, domain, period, customFrom?, customTo?)`

Manager/founder only. Manager must pass matching `domain`. Agent/guest denied. Returns `ActionResult<AgentDetailMetrics>`. Called by `AgentDetailPanel`.

### `getManagerRosterAction(period, allDomains, customFrom?, customTo?)`

Manager/founder/admin only (agent/guest denied). Resolves the range (custom override aware), then `rosterDomain = (allDomains || caller.role !== 'manager') ? null : caller.domain` — manager is always pinned to their own domain regardless of the `allDomains` flag. Calls `getAgentRosterPerformance`. Returns `ActionResult<AgentRosterRow[]>`. Called by `ManagerPerformancePanel` on client-side period/date change (roster refetch without remount).

### `getDomainHealthMetricsAction(period, customFrom?, customTo?)`

Manager/founder/admin only. Resolves range, calls `getDomainHealthMetrics([...GIA_DOMAINS], from, to)`. Returns `ActionResult<DomainHealthCard[]>`. Called by `DomainOverviewPanel` on the founder **Domains** tab on period/date change.

---

## 7. The `/performance` Page — Role Branching

### 7a. `page.tsx`

| Role | Title | Filter | Content |
| ------ | ------- | -------- | --------- |
| Agent | "Your Performance." | none (filter bar is inside `AgentPerformanceShell`) | `AgentPerformanceShell` with `initialData` + `PerformanceMotivationalFooter` |
| Manager | "Team Performance." | `PerformanceFilters showSearch` | `Suspense` → `ManagerPerformanceAsync domain={profile.domain}` |
| Founder/admin | "Performance." | `PerformanceFilters showSearch` | `FounderPerformanceShell` |

**Agent branch** (changed 2026-06-04): Page fetches `this_month` data via `Promise.all` of 5 service calls. Passes as `initialData` to `AgentPerformanceShell`. No `Suspense` boundary, no `PerformanceFilters`, no URL params for the agent view. `PerformanceMotivationalFooter` always uses `'this_month'` period label (footer is server-rendered with the initial fetch).

**Manager domain rule:** `domain={profile.domain}` is server-verified. **Never** read `searchParams.domain`.

**Default period (manager/founder):** `parsePeriod` → invalid/missing → `'this_month'`.

### 7b. `PerformanceFilters`

Used by manager and founder views only. Agent view no longer uses this component.

| Control | Behaviour |
| --------- | ---------- |
| Sliders icon + badge | `activeCount` = non-default period + search + custom dates |
| `SearchBar` | `showSearch` only; debounce **500ms**; URL `?search=`; filters roster client-side |
| Period `FilterDropdown` | Single select: week / month / last month / all time / custom |
| Custom dates | `AnimatePresence` slide-in `DatePicker` pair when `period === 'custom'` |
| Clear | Shown when `activeCount > 0`; `router.push(pathname)` |

---

## 8. Agent Self-View

### 8a. `AgentPerformanceShell` (new 2026-06-04)

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

### 8b. Overview tab

Always shows a **today snapshot strip** at the top regardless of the selected period: `callsLogged` / `notesWritten` / `core.leadsWon` since IST midnight. This gives the agent instant context even when browsing a historical period.

Below the strip: `CoreFourGrid` → `EffortGrid` → `CallOutcomeBar` — all scoped to the active period.

When `period === 'today'`, the today strip is hidden (the Today tab already shows this data).

### 8c. Today tab

- Hero 2-column grid: **Calls Today** + **Notes Today** (large Playfair serif values, `--text-5xl`).
- Call outcome donut (`CallOutcomeBar`) for today's range.
- Three live pipeline cards: Won / In Discussion / Nurturing (tinted `--color-*-light` backgrounds).

### 8d. `CoreFourGrid`

- **Layout:** Single flex row of 4 cards.
- **Per card:** Eyebrow; accent-surface icon chip; Playfair `--text-3xl` value; synthetic `AreaChart` sparkline; period delta with ↑/↓/−; optional benchmark strip; tertiary sub-label.
- **Sparkline colours** (`useChartTokens().series`): index 0 → accent (Won); 1 → info (Touch); 2 → warning (Response); 3 → success (Conversion).
- **Benchmarks:** `agentCount < 2` → all averages `null` → strip omitted entirely (not "—").
- **Response time benchmark:** Lower is better — accent pip when agent value **<** domain average.
- **Null contract:** `avgResponseTimeMinutes` and `conversionRate` render **"—"** — never `0m` / `0%`.

### 8e. `EffortGrid`

4 compact flex cards. Calls Logged (success), Notes Written (accent), In Discussion (info), Nurturing (warning). Fill bars on Calls + Notes only (`maxValue = max(callsLogged, notesWritten, 1)`). In Discussion / Nurturing: no bar (live pipeline counts, not period activity).

### 8f. `CallOutcomeBar`

Left legend (pill rows: dot, label, count, %) + right `PieChart` donut (innerRadius 56, outerRadius 82). Donut centre: top outcome label + %. Empty: Playfair italic "No calls logged this period." Uses `resolveVar()` for SVG fills.

### 8g. `PerformanceMotivationalFooter`

Server component in `page.tsx`. Playfair italic, no glyph. Always renders below agent content. Copy: if `leadsWon > 0` → closed count; else if `inDiscussionCount > 0` → "almost there"; else → "Every expert was once a beginner."

### 8h. `PerformanceSkeleton` (still exists, no longer used for agent view)

Used if the Suspense pattern is reintroduced. Tier 1: 4 KPI skeletons. Tier 2: 4 effort skeletons. Tier 3: outcome skeleton.

---

## 9. Manager View

### 9a. `ManagerPerformanceAsync`

1. Resolve `from`/`to` (custom override or `getPeriodDateRange(period)`).
2. `getAgentRosterPerformance(rosterDomain, from, to)`.
3. Render `ManagerPerformancePanel` — **no `key={period}`** (removed 2026-06-04).

**`key={period}` removal (2026-06-04):** The `key` was forcing a full remount on every period change, resetting `selectedId` back to its initial `null` value (now the empty-state prompt) and losing the user's selection. The period already flows through props to `AgentDetailPanel.useEffect`, which re-fetches correctly. The `key` was unnecessary and harmful.

**Invariant:** `ManagerPerformancePanel` must **never** carry `key={period}`. Period state flows through props, not remount.

### 9b. `ManagerPerformanceSkeleton`

Left: 280px column — "Agents" label + 4 agent card skeletons, stagger 0/80/160/240ms. Right: avatar + name lines, 5-column stat strip, two bar blocks.

### 9c. `ManagerPerformancePanel`

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

### 9d. `AgentDetailPanel` (updated 2026-06-04)

**`metricsAgentId` ref:** Tracks which agent the current `metrics` state belongs to. Distinguishes two loading modes:

- **Agent switch** (`metricsAgentId.current !== agent.id`): `setMetrics(null)` is called — full skeleton shown.
- **Period change** (same agent): `setMetrics(null)` is NOT called — existing data stays visible at 45% opacity. A 2px accent bar (`scaleX 0→1`) appears at the top of the panel. `pointer-events: none` during load.

**Fetch pattern:** Plain Promise `.then()/.catch()` with `cancelled` ref. Never `startTransition` (would defer `setMetrics(null)` and prevent skeleton).

**`isLoading` initialises to `true`** so skeleton renders on first paint without a micro-flash.

**`metricsAgentId` invariant:** Must be reset to `null` before the fetch on agent switch. Ensures the agent-switch skeleton path is always taken for a new agent regardless of any in-flight state.

**Identity zone:** `Avatar lg` + `selected` ring; success live pip; Playfair name; accent-surface domain badge; mono lead count; conversion % badge (success/warning/danger at 40%/20%).

**Stats:** Five `StatAtom` cards (pastel palettes — intentional non-token colours): Calls Today, Total Leads, Total Calls, Leads Won, Revenue. Note: the "Calls Today" card is fed by `metrics.callsToday`, which now equals `totalCallsMade` for the selected period — it is no longer a literal IST-today count (see §5).

**Pipeline:** Segmented bar + chip legend on `--theme-paper-subtle`.

**Error:** `--color-danger-light` background.

---

## 10. Founder / Admin View

### 10a. `FounderPerformanceShell` (`'use client'`)

Owns `activeTab: 'agents' | 'domains'` in `useState` — **never** a URL param. Props: `domain` (placeholder `DEFAULT_GIA_DOMAIN`), `period`, `customFrom`, `customTo`, `initialDomainHealth`, `agentsSlot`.

- **Agents tab:** renders the `agentsSlot` passed from `page.tsx` — a `<Suspense fallback={<ManagerPerformanceSkeleton />}><ManagerPerformanceAsync allDomains /></Suspense>`. The shell does not construct the roster itself; the page injects it so the server `Suspense` boundary lives at the page level.
- **Domains tab:** renders `<DomainOverviewPanel initialData={initialDomainHealth} period customFrom customTo />`.

### 10b. `DomainOverviewPanel` (founder Domains tab)

`src/components/performance/DomainOverviewPanel.tsx` — `'use client'`.

- Seeded with `initialDomainHealth` (fetched server-side in `page.tsx` for the active period/range) so first paint needs no client fetch.
- Refetches via `getDomainHealthMetricsAction(period, customFrom, customTo)` on period/date change.
- Renders four GIA-domain cards (2×2): Total Leads · Total Calls · Total Revenue (+ conversion) per domain, plus a comparative Recharts `BarChart` with a metric toggle (Leads | Calls | Revenue).
- `DomainHealthGrid.tsx` is a **separate, retained-but-unmounted** legacy grid — not used on either tab. Do not confuse it with `DomainOverviewPanel`.

### 10c. Differences from manager view

| Aspect | Manager | Founder / admin |
| -------- | --------- | ----------------- |
| Roster scope | `profile.domain` | All agents (`rosterDomain = null`) |
| Domain filter | N/A | Client popover on roster header |
| `getAgentDetailMetricsAction` | Domain must match caller | No domain guard; `domain: null` allowed |
| Page title | "Team Performance." | "Performance." |
| URL `?domain=` | **Never used** | **Never used** |

---

## 11. Access Control Summary

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

## 12. Known Invariants (must never be violated)

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

## Component inventory

### `src/components/performance/`

| File | Role |
| ------ | ------ |
| `AgentPerformanceShell.tsx` | Agent self-view: period selector, content tabs, client-driven fetch |
| `PerformanceFilters.tsx` | Filter bar for manager/founder views only |
| `CoreFourGrid.tsx` | Agent KPI row + sparklines |
| `EffortGrid.tsx` | Agent effort cards |
| `CallOutcomeBar.tsx` | Donut + legend (agent self-view + manager detail panel) |
| `ManagerPerformancePanel.tsx` | Two-column team shell; roster (left) + detail/empty-state (right); domain popover; client roster refetch via `getManagerRosterAction` |
| `AgentDetailPanel.tsx` | Manager/founder agent detail |
| `PerformanceRosterEmptyState.tsx` | Right-panel prompt when `selectedId === null` (Agents tab) |
| `DomainOverviewPanel.tsx` | Founder **Domains** tab — health cards + comparative bar chart; refetch via `getDomainHealthMetricsAction` |
| `DomainHealthGrid.tsx` | Legacy domain card grid — retained but **not mounted** on any tab |
| `StatAtom.tsx` | Single pastel stat card used by `AgentDetailPanel` stats row |

### `src/app/(dashboard)/performance/`

| File | Role |
| ------ | ------ |
| `page.tsx` | Role branch orchestrator; agent `this_month` initialData; founder `initialDomainHealth` + `agentsSlot` |
| `loading.tsx` | Route-level Suspense fallback (Next.js streaming) |
| `PerformanceSkeleton.tsx` | Agent-shaped skeleton — used by `loading.tsx` (`PerformanceAsync.tsx`, the legacy unmounted data shell, was deleted in perf Phase 4) |
| `ManagerPerformanceAsync.tsx` | Team data shell (roster + founder domain-health seed) |
| `ManagerPerformanceSkeleton.tsx` | Team loading |
| `FounderPerformanceShell.tsx` | Founder/admin `'use client'` two-tab shell (Agents / Domains); owns tab state |

### `src/lib/actions/performance.ts`

| Action | Caller | Auth |
| -------- | -------- | ------ |
| `getAgentSelfMetricsAction` | `AgentPerformanceShell` | agent only |
| `getAgentDetailMetricsAction` | `AgentDetailPanel` | manager (own domain), admin, founder |
| `getManagerRosterAction` | `ManagerPerformancePanel` | manager (own domain pinned), admin, founder |
| `getDomainHealthMetricsAction` | `DomainOverviewPanel` | manager, admin, founder |

---

## Shared utilities

### `buildFilterParams` — `src/lib/utils/filter-params.ts`

Used by `PerformanceFilters` (manager/founder). Not used by agent view.

### `formatDuration` — `src/lib/utils/dates.ts`

`null → "—"`, `< 60 → "48m"`, `≥ 60 → "2h 34m"`.

### `useChartTokens` / `resolveColorMap` — `src/components/ui/charts/useChartTokens.ts`

Resolves CSS tokens via `getComputedStyle`. Re-subscribes on `data-theme` MutationObserver. `resolveColorMap` for record-shaped colour maps.

### `resolveVar` (local in `CallOutcomeBar.tsx`)

```typescript
function resolveVar(name: string): string
// Resolves 'var(--token)' to computed hex/rgb for Recharts SVG fills.
```

---

## Roster display helpers — `src/lib/utils/performance-roster-display.ts`

- `PERFORMANCE_ROSTER_DOMAIN_ORDER` — Gia domains first, then remaining `APP_DOMAINS`.
- `buildPerformanceRosterGroups(agents, { allDomains, domain })` — sidebar structure.
- `getFirstAgentInPerformanceRosterList(...)` — first visible agent in display order (not `roster[0]` from API sort). **No longer called by `ManagerPerformancePanel`** (default selection is now `null` → empty state); retained as a utility for any future first-agent default.
