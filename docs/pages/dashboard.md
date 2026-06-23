# Dashboard — Page Spec

> **Purpose:** spec for `/dashboard` — the personalised spatial-grid home surface.
> **Audience:** engineers. · **Source-of-truth scope:** this route's behaviour, data flow, components, invariants. Widget queries live in `dashboard-service.ts` (home: this doc); shell/theming live in `../architecture/overview.md`.
> **Last verified:** 2026-06-24 — full regeneration against code. Covers the v4 spatial grid + react-grid-layout + drag-to-resize + density tiers (2026-06-24), the Recent Leads rollup + Mine/Team toggle (migration 0132), the Elaya widget going live (2026-06-16), the gia_followup category collapse (migration 0138), the cold-lead cutoff DRY (migration 0140), the manager full-roster pipeline (migration 0129), and the global founder domain selector replacing per-widget tabs (2026-06-17).

## 1. Purpose

Serene's home surface: a personalised **spatial grid** of Gia widgets. Each widget is an
independently code-split client component placed as an `{x,y,w,h}` rectangle on a 12-column grid,
freely moved/resized/auto-packed (react-grid-layout). Summary data arrives on first paint via one
server-side `get_dashboard_summary` RPC (React `cache()`) plus a dedicated Recent-Leads rollup RPC;
a global URL-param date filter (`DashboardDateFilter`) scopes pipeline/campaign/volume/budget to a
cohort window (by `leads.created_at`, IST — Decision Log 2026-06-04). Widgets share no mutable state.
Each widget's **content adapts to its cell size** (a count card shows just the number when tiny, the
full card when large — `useWidgetDensity`).

## 2. Who sees it

| Role | Widgets in default layout | Data scope |
| ---- | ------------------------- | ---------- |
| `agent` | `agent-tasks`, `elaya-presence`, `agent-pending-calls`, `agent-new-leads`, `agent-activity` | own tasks/counts/leads; date filter does not apply to any of them; no date filter rendered |
| `manager` | the manager seven (see §3 `DEFAULT_GRID_BY_ROLE`) | domain-pinned leads/status/campaigns/volume/cold-leads/budget (pinned server-side); tasks/activity own |
| `admin` / `founder` | identical manager seven | cross-domain, narrowed by the **global `serene-domain` selector** in the canvas header (additive WHERE, not RLS); budget all-domain or scoped |
| `guest` | none (`DEFAULT_GRID_BY_ROLE.guest = []`) | — |

The `DashboardDateFilter` is rendered **only** for `manager`/`admin`/`founder` (role gate in
`DashboardCanvas`); agents never see it. There are **no per-widget domain tabs** — the global
selector (rendered via `PageControls`, gated by `TOP_BAR_ENABLED`) is the single source, threaded
page → canvas → widget as `scopeDomain`.

Route guards: dashboard layout session gate; `/dashboard` is in `ALWAYS_ALLOWED_PREFIXES`.
Per-widget enforcement table: Deep dive §12.

## 3. Data sources

| Layer | File | Notes |
| ----- | ---- | ----- |
| RPC (summary) | `get_dashboard_summary` (0029→…→**0140**, canonical) | single jsonb, summary widgets + `cold_leads_count` + agent snapshot counts |
| RPC (recent leads) | `get_recent_lead_activity` (migration 0132) | lead rollup over `leads ORDER BY last_activity_at DESC LIMIT 25` — the `agent-activity` widget seed |
| Service | `src/lib/services/dashboard-service.ts` | `getDashboardSummary` (React `cache()`), `getAgentRecentActivity`, `getLeadVolumeByRange`/`getLeadVolumeByDomains`/`getLeadVolumeForDomain`; Redis cache-aside per `../architecture/caching.md` |
| Service (budget) | `src/lib/services/ad-spend-service.ts` | `getBudgetSummary` (the /budget RPC, reused as the widget seed) + `filterBudgetRowsByDomain` (campaign-prefix → domain) |
| Actions | `src/lib/actions/dashboard.ts` | 7 widget-refresh actions, all via `requireProfile()`; manager pinned via `effectiveWidgetDomain()` |
| Hooks | `useDashboardLayout`, `useWidgetData`, `useWidgetDensity`, `useDashboardCohortSync`, `useMediaQuery` | layout persistence (v4 grid), fetch lifecycle, cell-density measurement, cohort URL sync |

## 4. Components

`page.tsx` (RSC orchestrator) · `DashboardCanvas` (react-grid-layout) · `DashboardWidgetSlot`
(static `React.lazy` map + density measurement) · `WidgetSkeleton` · `DashboardDateFilter` ·
`PageControls` (notification bell + global domain selector) · widgets: `AgentTasksWidget`,
`AgentActivityWidget` (Recent Leads), `AgentPendingCallsWidget`, `AgentNewLeadsWidget`,
`ElayaPresenceCard` (the live embedded `/elaya` chat), `ManagerLeadStatusWidget`,
`ManagerLeadVolumeWidget`, `ManagerCampaignWidget`, `ManagerColdLeadsWidget`, `ManagerBudgetWidget`
(+ the shared `SnapshotCountWidget` base — THE big-count/label/hint/Link card; cold-leads,
pending-calls, and new-leads all compose it). Registry: `src/lib/constants/dashboard-widgets.ts` (pure data).

## 5. States

- **Loading:** `loading.tsx` composes `PageSkeletons` + a bespoke skeleton; per-widget `WidgetSkeleton fill` behind `MinSkeletonBoundary` (≥150 ms, V-08) inside `DashboardWidgetSlot`. The slot also withholds a widget until its cell has a real measured box (density gate) — until then the skeleton holds the seat.
- **Empty:** each widget renders its own `<EmptyState>`-style copy (Playfair italic, V-09) on zero data.
- **Error:** page never throws/redirects on RPC failure — renders zeroed `initialData` with a `[dashboard/page]` log; widget refresh errors surface via toast.

## 6. Invariants

The must-never-be-violated rules are maintained in Deep dive §13 (RSC no-POST-on-load rule,
React `cache()` not `unstable_cache`, stable widget ids, v4 storage-version bump rule, GRANT after
`CREATE OR REPLACE`, cohort-date semantics, …). Read them before touching any widget.

## 7. Open items

None recorded.

---

## 8. Deep dive

### 2. Data Model

#### 2a. `get_dashboard_summary` RPC

**Canonical definition (latest):** `supabase/migrations/20260623000140_cold_lead_cutoff_dry.sql`
**Signature lineage (each migration drops the prior overload and replaces it):**

| Migration | Change |
| --------- | ------ |
| `20260529000029_get_dashboard_summary.sql` | Initial 3-param `(p_role text, p_domain app_domain, p_user_id uuid)`; 4 keys |
| `20260530000043_fix_dashboard_summary_domain_type.sql` | `p_domain` → `app_domain` (post migration 0041 enum change) |
| `20260531000047_dashboard_agent_tasks_all_categories.sql` | Tasks CTE rewrite (`newLeadsCount` removed) |
| `20260531000048_dashboard_activity_limit_25.sql` | Activity LIMIT 10 → 25 |
| `20260531000050_dashboard_activity_role_scoped.sql` | Activity role CTE (admin/founder all, manager domain, agent self) |
| `20260603000062_get_dashboard_summary_role_branch.sql` | Adds `p_initial_domain app_domain DEFAULT NULL` (4-param); **agent role early-returns** after tasks + activity (empty stubs for lead_status/campaigns) |
| `20260604000069_dashboard_date_filter.sql` | Adds `p_date_from`, `p_date_to` (6-param); date filter on `lead_status` + `campaigns` CTEs only |
| `20260604000070_fix_pipeline_agent_total.sql` | `agent_counts`/`campaign_agg` totals: `COUNT(*)` → `SUM(cnt)` (true lead counts) |
| `20260606000081_dashboard_cold_leads.sql` | Adds 5th return key `cold_leads_count` (scalar int); silently regressed the 0070 `SUM(cnt)` totals back to `COUNT(*)` (fixed in 0115) |
| `20260612000115_dashboard_agent_snapshot_counts.sql` | Adds `pending_calls_count` + `new_leads_count` (agent branch only, zero date inputs); restores 0070 `SUM(cnt)` totals |
| `20260617000129_manager_pipeline_full_roster.sql` | `lead_status.byAgent` for **managers** = FULL active domain roster LEFT JOINed to the per-(agent,status) cohort (agents with zero cohort leads now appear as zero rows); admin/founder `byAgent` stays cohort-only GROUP BY |
| `20260617000138_collapse_gia_category_module_enum.sql` | `task_category` collapsed to `personal` \| `group_subtask`; `pending_calls_count` recomputed via `task_gia_meta` presence (not a `gia_followup` category) |
| `20260623000140_cold_lead_cutoff_dry.sql` | The cold predicate now calls `cold_lead_cutoff()` (the single SQL cutoff anchor) instead of the bare `interval '5 days'` literal; recreated from the live body (reconciles file ⇆ DB). **Canonical current definition.** |

**Signature (exact, current):**

```sql
CREATE OR REPLACE FUNCTION public.get_dashboard_summary(
  p_role           text,
  p_domain         app_domain,
  p_user_id        uuid,
  p_initial_domain app_domain  DEFAULT NULL,
  p_date_from      timestamptz DEFAULT NULL,
  p_date_to        timestamptz DEFAULT NULL
)
RETURNS jsonb
```

**GRANT:**

```sql
GRANT EXECUTE ON FUNCTION public.get_dashboard_summary(text, app_domain, uuid, app_domain, timestamptz, timestamptz) TO authenticated;
```

> **Invariant:** `CREATE OR REPLACE` silently drops the existing GRANT. The GRANT line **must** immediately follow the function body in every migration that touches this RPC. (This function is self/role-scoped, so it deliberately keeps its `authenticated` GRANT — it is NOT one of the 0102 revoked scope-param RPCs.)
>
> **Access note:** despite the `authenticated` GRANT, `getDashboardSummary` calls this RPC via `createAdminClient()` in the service (the four scope-param wrappers moved to the admin client in migration 0102 / audit F-1). Scope args must stay session-derived (Q-13) — the page/action is the trust boundary.

**SECURITY:** `SECURITY DEFINER SET search_path = public` — RLS does not fire; role/domain/user scoping is enforced inside the function body via `p_role`, `p_domain`, `p_initial_domain`, and `p_user_id`.

**Domain-scoping logic (manager / admin / founder):**

- `manager` → always `p_domain` (the manager's own domain).
- `admin`/`founder` + `p_initial_domain IS NOT NULL` → scoped to `p_initial_domain` (the **global `serene-domain` selection** — `resolveDomainParam`).
- `admin`/`founder` + `p_initial_domain IS NULL` → no domain filter (the all-org "All domains" aggregate — the default selection).

> **Removed — do not recreate:** the old hardcoded `'onboarding'` first-paint seed for admin/founder. The page now passes `p_initial_domain = scopeDomain ?? undefined` (the global selector). There are no per-widget "GIA_DOMAINS + All" tabs anymore (removed 2026-06-17).

**Date filter:** `p_date_from`/`p_date_to` apply `created_at >= p_date_from AND created_at < p_date_to` to the `lead_status` and `campaigns` CTEs **only**. `agent_tasks`, `agent_activity`, `cold_leads_count`, `pending_calls_count`, and `new_leads_count` ignore the range. Filtering is on `leads.created_at` (intake/cohort date), **never** `status_changed_at`. NULL params → all-time (backwards compatible).

**Top-level return:** single `jsonb` object with **seven keys**:

| Key | Type in RPC | Consumed by widget |
| --- | ----------- | ------------------ |
| `agent_tasks` | `jsonb` **array** of task objects | `AgentTasksWidget` → `initialData.agent_tasks` |
| `agent_activity` | `jsonb` array of legacy activity objects | **NOT consumed** — the page overwrites this key with the rollup RPC result (see §2c). Dead work in the RPC (kept to avoid disturbing the agent early-return branch). |
| `lead_status` | `jsonb` object `{ totals, byAgent }` | `ManagerLeadStatusWidget` → `initialData.lead_status` |
| `campaigns` | `jsonb` array of campaign objects | `ManagerCampaignWidget` → `initialData.campaigns` |
| `cold_leads_count` | `jsonb` **scalar int** | `ManagerColdLeadsWidget` → `initialData.cold_leads_count` |
| `pending_calls_count` | `jsonb` **scalar int** | `AgentPendingCallsWidget` → `initialData.pending_calls_count` |
| `new_leads_count` | `jsonb` **scalar int** | `AgentNewLeadsWidget` → `initialData.new_leads_count` |

(Volume — `lead_volume` / `lead_volume_multi` — and `budget_summary` are intentionally **excluded** from the RPC; see §2c and §9j.)

**Agent role branch:** when `p_role = 'agent'`, the RPC computes `agent_tasks` + `agent_activity` plus the two snapshot counts — `pending_calls_count` (open lead follow-up tasks: `assigned_to = p_user_id`, `EXISTS (SELECT 1 FROM task_gia_meta m WHERE m.task_id = t.id)`, status `to_do`/`in_progress`/`in_review`) and `new_leads_count` (`assigned_to = p_user_id`, `status = 'new'`, `archived_at IS NULL`) — then returns immediately with empty stubs for `lead_status` (`{ totals: [], byAgent: [] }`), `campaigns` (`[]`), and `cold_leads_count` (`0`). No pipeline/campaign/cold-leads DB work runs for agents. Manager+ get `0` stubs for both snapshot counts (the widgets are agent-only). **Both counts take zero date inputs — wiring them to the date filter is conceptually invalid (live snapshot, not cohort).**

##### `agent_tasks` element shape

```json
{
  "id": "uuid",
  "title": "string",
  "task_category": "personal" | "group_subtask",
  "task_type": "string",
  "priority": "urgent" | "high" | "normal",
  "status": "to_do" | "in_progress" | "in_review",
  "due_at": "timestamptz | null",
  "is_overdue": boolean,
  "context_label": "string | null",
  "lead_id": "string | null"
}
```

> **Two categories only (migration 0138):** `task_category` is `personal` | `group_subtask`. A **lead follow-up is a `personal` task that ALSO has a `task_gia_meta` row** — the meta row is the lead link, not the category. The RPC derives `context_label`/`lead_id` from the `task_gia_meta` LEFT JOIN (`tgm.lead_id IS NOT NULL` → lead name), not a category check.

**CTE behaviour:** `tasks` where `assigned_to = p_user_id` and `status IN ('to_do','in_progress','in_review')`. LEFT JOINs: `task_gia_meta` + `leads` for lead context; `task_groups` (gated on `task_category = 'group_subtask'`) for group context. ORDER: overdue first → priority (`urgent`→`high`→`normal`) → `due_at ASC NULLS LAST`. **LIMIT 30.** Always computed (every role has the Tasks widget); date filter does **not** apply.

##### `lead_status` shape

```json
{
  "totals": [{ "status": "<lead_status>", "count": <int> }, ...],
  "byAgent": [{
    "agent_id": "uuid",
    "agent_name": "string",
    "counts": { "<status>": <int>, ... },
    "total": <int>
  }, ...]
}
```

**CTE behaviour:** active leads (`archived_at IS NULL`), date-filtered on `created_at`. Domain scoping per the rules above. Status order in `totals`: new → touched → in_discussion → nurturing → won → lost → junk (zero-count statuses omitted). **Agent `total` is derived from `SUM(cnt)` of the status mix (migration 0070 fix) — not a row count.** **`byAgent` (migration 0129):** for **managers**, the full active domain roster is LEFT JOINed to the per-(agent,status) cohort so agents with zero cohort leads appear as zero rows; for admin/founder it remains cohort-only `GROUP BY assigned_to`, ordered by `total DESC`.

##### `campaigns` element shape

```json
{
  "campaign": "string",
  "total": <int>,
  "mix": { "<status>": <int>, ... }
}
```

**CTE behaviour:** `utm_campaign IS NOT NULL`, not archived, date-filtered on `created_at`. Domain scoping per the rules above. Top **12** campaigns by `total DESC` (where `total = SUM(cnt)`, migration 0070).

##### `cold_leads_count` (migration 0081, DRY'd in 0140)

Scalar int. `COUNT(*)` of leads where `archived_at IS NULL` AND `status NOT IN ('won','lost','junk')` AND `last_activity_at < cold_lead_cutoff()`. Scoping: admin/founder all, manager `domain = p_domain`. **NULL `last_activity_at` rows are excluded** (`NULL < x` is falsy — those leads are SLA-01A's job, not the going-cold bucket). **The date filter intentionally does NOT apply** — "going cold" is a live state, not a cohort metric.

> **`cold_lead_cutoff()` (migration 0140):** THE single SQL source of the cutoff — `now() - interval '5 days'`. The `5` here and `COLD_LEAD_THRESHOLD_DAYS` in `src/lib/constants/leads.ts` are the only two places the number lives; change them together. Replaced the bare `interval '5 days'` literal that 0081→0115→0129 each re-stamped.

##### Why React `cache()` instead of `unstable_cache`

`getDashboardSummary` in `src/lib/services/dashboard-service.ts` wraps the RPC with `cache()` from `'react'`, deduplicating within a single RSC render pass (per-request memoisation; a per-user result — `unstable_cache` would share it across users). The `cache()` wrap is retained for that dedup; it no longer guards the `cookies()` constraint, because the service moved to `createAdminClient()` in migration 0102 (P-09 still bars `unstable_cache` for any function that reads `cookies()`). On RPC error the service **throws** — the page catches it (see §5 / failure behaviour).

---

#### 2b. `DashboardSummary` type

**File:** `src/lib/types/index.ts`

**Assembled on the page:** RPC result spread + `agent_activity` (the rollup RPC) + `lead_volume` / `lead_volume_multi` (volume service) + `budget_summary` (ad-spend service).

```typescript
export type DashboardSummary = {
  agent_tasks:    DashboardAgentTask[];
  agent_activity: DashboardAgentActivity[];   // = DashboardRecentLead[] (alias)
  lead_status:    DashboardLeadStatusSummary;
  campaigns:      DashboardCampaignStatusMix[];
  /** Manager: single-domain line chart for profile.domain. Admin/founder scoped: same shape. */
  lead_volume:       DashboardLeadVolumeSummary | null;
  /** Admin/founder "All domains": multi-domain — seeded on first paint */
  lead_volume_multi: DashboardMultiDomainVolumeSummary | null;
  /** Non-terminal leads with no activity in 5+ days. Agent role: always 0. */
  cold_leads_count?: number;
  /** Agent snapshot counts (0115) — live, never date-scoped. Non-agent roles: always 0. */
  pending_calls_count?: number;
  new_leads_count?: number;
  /** Manager+: budget rows for the active range (page-assembled from getBudgetSummary; manager/scoped rows pre-filtered). Agent: null. */
  budget_summary?: BudgetCampaignRow[] | null;
};
```

`DashboardAgentTask.task_category` is `'personal' | 'group_subtask'` (two values, 0138). The
`agent_activity` key is now `DashboardRecentLead[]` — `DashboardAgentActivity` is a `@deprecated`
alias kept only as the seed-key name (see §2c). Element types (`DashboardAgentTask`,
`DashboardRecentLead`, `DashboardLeadStatusCount`, `DashboardAgentStatusBreakdown`,
`DashboardLeadStatusSummary`, `DashboardCampaignStatusMix`, `DashboardVolumeDataPoint`,
`DashboardLeadVolumeSummary`, `DashboardMultiDomainVolumeSummary`) are all in `src/lib/types/index.ts`.

##### `DashboardRecentLead` shape (migration 0132 — the `agent_activity` seed)

```typescript
export type DashboardRecentLead = {
  lead_id:           string;
  lead_slug:         string | null;   // → /leads/[slug]
  lead_name:         string | null;
  lead_domain:       string | null;   // founder/manager domain tag
  status:            string;          // current lead status
  last_call_outcome: string | null;   // latest call outcome
  last_activity_at:  string | null;   // card timestamp + sort key
  assigned_to:       string | null;
  assignee_name:     string | null;   // "by <agent>"
  note_body:         string | null;   // latest note body (trimmed)
};
```

---

#### 2c. Recent Leads rollup — `getAgentRecentActivity` / `get_recent_lead_activity`

> **Replaced the event stream (migration 0132, 2026-06-17):** the `agent-activity` widget is no longer a `lead_activities` event feed. It is a **LEAD rollup** — one card per lead, most-recently-worked first.

**RPC `get_recent_lead_activity(p_role, p_domain, p_user_id, p_scope text DEFAULT 'team')`** (migration 0132): a single descent on **`leads`** `ORDER BY last_activity_at DESC LIMIT 25` (one row per lead — `leads` denormalises status / outcome / assignee, with the latest note pulled via a correlated subquery). Returns the `DashboardRecentLead` rows. **Scope-param RPC, EXECUTE REVOKEd** → called via the admin client only (Q-13); scope args are session-derived by the dashboard page/action (the trust boundary).

`p_scope`:

- `'mine'` → leads assigned to `p_user_id`, **regardless of role**.
- `'team'` (default) → `agent`: own leads (`assigned_to = p_user_id`); `manager`: `domain = p_domain`; `admin`/`founder`: `p_domain` when set (the global selector), else all-org.

**Service `getAgentRecentActivity(agentId, role?, domain?, targetDomain?, scope='team')`:** computes `rpcDomain = role === 'manager' ? domain : targetDomain` and calls the RPC via `createAdminClient()`. Return type `AgentActivity` mirrors `DashboardRecentLead` exactly.

**Seeded on first paint:** `dashboard/page.tsx` **always** seeds `initialData.agent_activity` from this rollup RPC (`getAgentRecentActivity(profile.id, role, domain, scopeDomain ?? undefined, 'team')`) — never from `get_dashboard_summary`'s `agent_activity` CTE (still the old event shape, now dead work). The Mine/Team flip re-fetches client-side via `getAgentRecentActivityAction`.

---

#### 2d. Volume data — `getLeadVolumeByRange` / `getLeadVolumeByDomains` / `getLeadVolumeForDomain`

**Why excluded from RPC:** bucket granularity is derived from the selected range span (hourly / daily / weekly / monthly), computed in TypeScript (`inferBucketMs` in `dashboard-service.ts`). The RPC is a fixed snapshot. Comment in `src/lib/types/index.ts`: *"Volume is NOT in the RPC — bucket granularity is computed in the service layer."*

**Service functions (all `DateRange`-based, all Redis cache-aside):**

| Function | Returns | Scope |
| -------- | ------- | ----- |
| `getLeadVolumeByRange(role, domain, dateRange)` | `LeadVolumeSummary` `{ total, series }` | manager → `.eq('domain', domain)`; else no domain filter |
| `getLeadVolumeByDomains(domains[], dateRange)` | `MultiDomainVolumeSummary` `{ domains, totals, series }` | admin/founder multi-line "All domains" |
| `getLeadVolumeForDomain(domain, dateRange)` | `LeadVolumeSummary` | admin/founder single-domain (delegates to `getLeadVolumeByRange('manager', domain, range)` so the domain filter always applies) |

**Bucket inference (`inferBucketMs`):** ≤ 2 days → hourly · ≤ 60 days → daily · ≤ 1 year → weekly · else → ~monthly. Labels formatted IST. Lead rows are paginated past PostgREST's 1000-row cap (`LEAD_VOLUME_PAGE_SIZE = 1000`).

**Where seeded on first paint (global-domain aware, 2026-06-17):**

| Call site | Condition | Seeds |
| --------- | --------- | ----- |
| `getLeadVolumeByRange` | manager (always) | `initialData.lead_volume` (own domain) |
| `getLeadVolumeForDomain(scopeDomain, …)` | admin/founder **with** a picked global domain | `initialData.lead_volume` (single-line) |
| `getLeadVolumeByDomains([...GIA_DOMAINS], …)` | admin/founder with **no** pick ("All domains") | `initialData.lead_volume_multi` (multi-line) |

`VolumePeriod` (`'today' | 'week' | 'month' | 'quarter'`) still exists on the service type for backwards compat but is **no longer used** for the global filter — the date range is the unit now. The widget reads the matching seed by deriving `isMultiMode = !isManager && scopeDomain == null` and **no longer fires a mount fetch** — a domain pick round-trips the page and re-seeds.

---

### 3. Widget Registry — `dashboard-widgets.ts`

**File:** `src/lib/constants/dashboard-widgets.ts`

#### All ten widget entries

`WidgetDefinition` carries `id`, `label`, `description`, `roles`, `domains`, the legacy
`defaultSize`/`colSpan` (back-compat seed fields only), the v4 **`defaultGrid: WidgetGrid`**
(`{ w, h, minW?, minH? }`, in grid units), and `module`.

| `id` | `label` | `roles` | `defaultGrid {w,h,minW,minH}` | `module` |
| ---- | ------- | ------- | ----------------------------- | -------- |
| `agent-tasks` | My Tasks | `agent`, `manager`, `admin`, `founder` | `{6, 9, 4, 6}` | `gia` |
| `agent-activity` | Recent Activity (renders "Recent Leads") | `agent`, `manager`, `admin`, `founder` | `{6, 11, 4, 6}` | `gia` |
| `agent-pending-calls` | Pending Calls | `agent` | `{3, 5, 3, 4}` | `gia` |
| `agent-new-leads` | New Leads | `agent` | `{3, 5, 3, 4}` | `gia` |
| `elaya-presence` | Elaya | `agent` | `{6, 11, 4, 8}` | `gia` |
| `manager-lead-status` | Lead Pipeline | `manager`, `admin`, `founder` | `{6, 11, 4, 7}` | `gia` |
| `manager-lead-volume` | Lead Volume | `manager`, `admin`, `founder` | `{6, 11, 4, 7}` | `gia` |
| `manager-campaigns` | Campaign Performance | `manager`, `admin`, `founder` | `{12, 11, 6, 7}` | `gia` |
| `manager-cold-leads` | Going Cold | `manager`, `admin`, `founder` | `{3, 5, 3, 4}` | `gia` |
| `manager-budget` | Campaign Budget | `manager`, `admin`, `founder` | `{3, 5, 3, 4}` | `gia` |

`domains` is `'*'` for every entry.

#### Grid + density constants

```text
GRID_COLS = 12              // 12-column grid
GRID_ROW_HEIGHT = 38        // px height of one grid row
GRID_MARGIN = 16            // px gap between cells (== --space-4)
GRID_MIN_H = 4 / GRID_MIN_W = 3   // floor for a widget footprint
GRID_MOBILE_BREAKPOINT = 768      // below this → single stacked column

WidgetDensity = 'compact' | 'standard' | 'rich'
DENSITY_THRESHOLDS = { compactMaxHeight: 220, richMinHeight: 380, compactMaxWidth: 240 }
resolveWidgetDensity(width, height) → tier   // measured px box → tier
```

#### `WIDGET_HEIGHT_BY_SIZE` — seed/migration only

```text
sm → 200 · md → 300 · lg → 420 · xl → 540   (Record<WidgetSize, number>)
```

> **Do not read this in a widget body.** It survives ONLY as the migration / default-height seed source (`widgetDefaultHeight`, `clampWidgetHeight` with `WIDGET_MIN_HEIGHT = 160` / `WIDGET_MAX_HEIGHT = 720`). The slot owns the rendered height (`height: 100%` fills the RGL cell); `WidgetSkeleton` takes a `fill` prop. Widgets no longer have a size→px height read.

#### `DEFAULT_GRID_BY_ROLE` (the designed first-paint placements + reset targets)

Coordinates are grid units; `react-grid-layout` compacts vertically. **One shared `MANAGER_GRID`** is reused by `founder`, `admin`, and `manager` (managers are NOT a separate count — there is no separate "founder seven"):

```text
MANAGER_GRID:
  agent-tasks         x0 y0  w6 h9
  agent-activity      x6 y0  w6 h9
  manager-lead-status x0 y9  w6 h11
  manager-lead-volume x6 y9  w6 h11
  manager-campaigns   x0 y20 w12 h11   (full width)
  manager-cold-leads  x0 y31 w3 h5
  manager-budget      x3 y31 w3 h5

agent:
  agent-tasks         x0 y0  w6 h9
  elaya-presence      x6 y0  w6 h11
  agent-pending-calls x0 y9  w3 h5
  agent-new-leads     x3 y9  w3 h5
  agent-activity      x0 y14 w6 h11

guest: []
```

`DEFAULT_LAYOUT_BY_ROLE` (the ordered id list) still exists for back-compat, but the spatial first
paint reads `DEFAULT_GRID_BY_ROLE`.

> **Removed — do not recreate:** the `col = index % 2`, `row = floor(index / 2)` auto-flow formula. Placements are now explicit designed `{x,y,w,h}` rectangles.

#### `WIDGET_MAP` and `isValidWidgetId`

- `WIDGET_MAP`: `Record<string, WidgetDefinition>` built from `DASHBOARD_WIDGETS` — O(1) lookup for labels, `defaultGrid`, roles, and validation.
- `isValidWidgetId(id)`: returns `id in WIDGET_MAP`. Used when reading `localStorage` and when adding/reordering so **stale or renamed ids never enter the layout**.

---

### 4. `useDashboardLayout` Hook

**File:** `src/hooks/useDashboardLayout.ts`

#### localStorage key

```text
serene:dashboard:layout:${userId}:v4
```

(`STORAGE_KEY_PREFIX` + `:` + `userId` + `:` + `STORAGE_VERSION`. **`STORAGE_VERSION = 'v4'`** — the
2026-06-24 spatial grid. v2 (size enum) and v3 (free `heightPx`, still a 2-column flow) are
superseded: a flow layout can't map to arbitrary 2-D placement, so the key bump **resets** stale
layouts to the role default — the honest move (a flow→grid reconcile would be worse than the designed
default). Bump it again whenever the default grid changes shape.)

#### Stored shape

```typescript
type StoredLayout = { placements: WidgetPlacement[] };
// WidgetPlacement = GridPlacement = { widgetId: string; x: number; y: number; w: number; h: number }
```

(`x`/`y`/`w`/`h` are **grid units**, not pixels.)

#### Hydration behaviour

1. **First render:** `useState(() => getDefaults(role))` — synchronous defaults from `DEFAULT_GRID_BY_ROLE` so widgets appear immediately (no empty canvas).
2. **After mount:** `useEffect` reads `localStorage` via `readFromStorage()` → `sanitizeStored()` → compares JSON to current state; **`setStored` only if different** — keeps the widget subtree alive when the stored layout matches defaults.
3. **`isHydrated`:** set `true` after the effect runs. Exposed for consumers; **`DashboardCanvas` does not gate rendering on it** (do not re-add a hydration gate). `DashboardCanvas.handleLayoutChange` does, however, ignore RGL's pre-hydration `onLayoutChange` echo (`if (!isHydrated) return`) so the synchronous default can't overwrite the saved localStorage layout before it loads.

#### Returned operations

| Name | Behaviour |
| ---- | --------- |
| `layout` | Current `WidgetPlacement[]` |
| `isHydrated` | `false` until post-mount localStorage reconciliation completes |
| `applyLayout(placements)` | RGL hands the **full** layout on every drag/resize/compaction; filters to valid+role-allowed ids and persists **only when geometry actually changed** (no-ops on RGL's mount fire) |
| `addWidget(widgetId)` | No-op if invalid id or already present; appends at `x:0, y:maxY` with the registry `defaultGrid` w/h; RGL compaction tucks it in |
| `removeWidget(widgetId)` | Filters the placement out; persists |
| `resetToDefaults()` | `persist(getDefaults(role))` |

> **Removed — do not recreate:** `moveWidget`, `resizeWidget`, `resizePlacement`, `reorderWidgets`. react-grid-layout owns the geometry and emits the whole layout to `applyLayout`; the manual `useWidgetResize` drag hook was also deleted.

#### Validation on load

`sanitizeStored()` inside `readFromStorage()`:

- Invalid root (not an object, or `placements` not an array) → role defaults.
- Each placement: `widgetId` must pass `isValidWidgetId()` **and** `WIDGET_MAP[widgetId].roles.includes(role)` (a demoted user loses manager-only widgets) or it is **silently dropped**.
- Geometry is coerced + clamped defensively against the registry `defaultGrid`: `w = clampInt(p.w, minW, GRID_COLS, def.w)`, `x = clampInt(p.x, 0, GRID_COLS - w, 0)`, `h = max(minH, toInt(p.h, def.h))`, `y = max(0, toInt(p.y, 0))`. Duplicate `widgetId`s are de-duped.
- An empty result from a non-empty default role → fall back to defaults.

> **Removed — do not recreate:** the `size ∈ sm|md|lg|xl` / `colSpan ∈ 1|2` enum validation. Geometry is now numeric x/y/w/h clamped against per-widget `defaultGrid` minimums.

---

### 5. Page Component — `dashboard/page.tsx`

#### Server flow

1. `getCurrentProfile()` — if null → `redirect('/login')`.
2. **Resolve date range from `searchParams`:** `dash_preset` (`today` | `week` | `month` | `last_month` | `quarter` | `custom`, default `week`); `dash_from` / `dash_to` (YYYY-MM-DD, only when `preset=custom`). `custom` with malformed params falls back to `week`.
3. **Resolve global domain scope:** `scopeDomain = resolveDomainParam(sp, await cookies(), role)` — the SAME `serene-domain` param/cookie the list pages read. Admin/founder → the chosen Gia domain or `null` (all-org); manager/agent → always `null`.
4. Agents skip the range for the RPC (`rpcDateRange = undefined`).
5. **`try/catch`-wrapped six-element `Promise.all`:**
   - `getDashboardSummary(role, domain, profile.id, isManager ? undefined : adminFounderScope, rpcDateRange)` where `adminFounderScope = scopeDomain ?? undefined`
   - `getAgentRecentActivity(profile.id, role, domain, scopeDomain ?? undefined, 'team')` — the Recent-Leads rollup seed (always)
   - manager → `getLeadVolumeByRange(role, domain, dateRange)`, else `null`
   - admin/founder **with** a picked domain → `getLeadVolumeForDomain(scopeDomain, dateRange)`, else `null`
   - admin/founder with **no** pick → `getLeadVolumeByDomains([...GIA_DOMAINS], dateRange)`, else `null`
   - manager+ → `getBudgetSummary(dateRange.from, dateRange.to)`, else `null`
6. `initialData = { ...rpcData, agent_tasks ?? [], agent_activity: recentLeads ?? [], campaigns ?? [], lead_volume: isManager ? managerVolume : adminSingleVolume, lead_volume_multi: adminMultiVolume, budget_summary }`. Budget is pre-filtered server-side: managers → own `domain`, admin/founder → `scopeDomain ?? null` (or full rows for the all-domains view) via `filterBudgetRowsByDomain` **before it reaches the client**.
7. `greeting = pickDashboardGreeting()`; `firstName` = first token of `profile.full_name`.
8. Render `<DashboardCanvas greeting firstName userId role domain scopeDomain initialData activePreset fromParam toParam dateRange notificationsPromise />` inside `<main className="flex-1 p-4 sm:p-6 lg:p-8">`. `notificationsPromise = TOP_BAR_ENABLED ? getNotifications(profile.id) : undefined` (streamed seed for the header bell).

#### `initialData` null-coercion (invariant)

`page.tsx` always coerces `rpcData.agent_tasks ?? []`, the rollup `recentLeads ?? []` (the `agent_activity` key), and `rpcData.campaigns ?? []` before spreading. PostgreSQL's `jsonb_agg()` returns NULL on zero rows; the RPC's `COALESCE(..., '[]')` guards this today, but the page-layer coercion is the authoritative defence — a widget's `seed !== null` guard would otherwise fail on `null` and fire a POST on first load. `lead_status` is exempt (its `jsonb_build_object` wrapper is always an object).

#### Failure behaviour

`getDashboardSummary` **throws** on Supabase RPC error. The page's `try/catch` logs with `[dashboard/page]` prefix and renders **zeroed `initialData`** (`agent_tasks: []`, `agent_activity: []`, `lead_status: { totals: [], byAgent: [] }`, `campaigns: []`, `lead_volume: null`, `lead_volume_multi: null`, `budget_summary: null`). **No redirect, no re-throw** — widgets handle empty states gracefully.

#### `initialData` + prop threading

```text
dashboard/page.tsx
  → DashboardCanvas (initialData, scopeDomain, activePreset, fromParam, toParam, dateRange, notificationsPromise)
    → ResponsiveGridLayout maps each placement →
      → DashboardWidgetSlot (initialData, dateRange, scopeDomain, editMode, dragHandle)
        → React.lazy widget (initialData, dateRange, scopeDomain, firstName)
```

Each widget receives the **full** `DashboardSummary`, the active `dateRange`, and the global
`scopeDomain`, and reads its own key.

---

### 6. `DashboardCanvas`

**File:** `src/components/dashboard/DashboardCanvas.tsx` — `'use client'`.

#### Header row

A single `flex flex-nowrap md:flex-wrap items-center justify-between` row (mobile-aware):

- `type-page-title` greeting: `{greeting},` + accent `firstName` + `page-title-dot` (the name drops to its own line within the `h1` below md).
- Control cluster (right, `shrink-0`):
  - **`DashboardDateFilter`** — rendered **only** for `manager`/`admin`/`founder`.
  - **`PageControls`** (notification bell + global `serene-domain` selector) — rendered when `TOP_BAR_ENABLED && notificationsPromise`. The dashboard has no standard server title row, so these ride the canvas header. A domain pick writes `?domain=` (+ cookie); the page RSC re-seeds every cohort widget for that scope (no per-widget tabs). `isPrivileged = admin || founder` gates the domain selector inside `PageControls`.
  - **Reset layout** (`RotateCcw`) — visible only in edit mode → `resetToDefaults()`.
  - **Edit toggle** — `LayoutDashboard` + "Edit layout" / "Done" on desktop; a square `Settings` gear (≈32px) below md. `aria-pressed` when active; accent fill when on.

> The `DashboardDateFilter` is **hidden on mobile** by its own internal logic and is only rendered for manager+ (the 2026-06-20 mobile-domain-selector fix).

#### Spatial grid — react-grid-layout

- **`ResponsiveGridLayout = WidthProvider(Responsive)`** (created once at module scope) measures the container and feeds `width` to `Responsive` — no manual ResizeObserver.
- **Library:** `react-grid-layout@1.5.3` (the classic line, NOT the 2.x rewrite; installed with **pnpm**). Its CSS is **not** imported — chrome is token-styled in `globals.css` "DASHBOARD SPATIAL GRID".
- **Breakpoints:** `RGL_BREAKPOINTS = { lg: 768, xs: 0 }`; `RGL_COLS = { lg: 12, xs: 1 }` — the full 12-col grid on tablet+, a single stacked column below 768px.
- **Geometry:** `layout.map` → RGL `Layout[]` (the `i` key carries the `widgetId`; per-widget `minW`/`minH` from `defaultGrid`). `rowHeight = GRID_ROW_HEIGHT (38)`, `margin = [16, 16]`, `containerPadding = [0, 0]`, `compactType = "vertical"`, `useCSSTransforms`.
- **`onLayoutChange`** → maps RGL's full `Layout[]` back to `WidgetPlacement[]` and calls `applyLayout` (ignored before hydration).
- **`measureBeforeMount={false}`** (deliberate — `WidthProvider` measures its own `offsetWidth` on mount; the chart `-1` problem is handled independently by the slot's `measured` density gate, not this flag).

#### Edit mode

- Read-only until edit mode (`isDraggable={editMode}`, `isResizable={editMode}`) — no accidental drags; clicking widget content still works.
- **Drag:** `draggableHandle=".serene-widget-drag"` — only the grip handle drags. The handle is a `GripVertical` button rendered into the slot (top-right) in edit mode.
- **Resize:** a single SE handle (`resizeHandles={['se']}`) — its glyph is drawn via `globals.css` `.react-resizable-handle::after`, visible only in `.is-editing`.
- **Remove:** a `×` button (`var(--color-danger)`) in the slot's top-right edit cluster → `removeWidget`.
- **Overlay:** the slot draws a `2px dashed var(--theme-accent)` border in edit mode.

> **Removed — do not recreate:** `@dnd-kit` (`DndContext`/`SortableContext`/`verticalListSortingStrategy`), the `.serene-bento-grid` 12-col CSS-grid + `colSpan→span6/span12` cell classes + the `@media 820px` stack rule, the `ResizePopover` (size/width menu), and `GripVertical`-as-reorder. react-grid-layout owns move/resize/pack/responsive now.

#### Grid chrome (`globals.css` "DASHBOARD SPATIAL GRID")

`.serene-dashboard-grid` (+ `.is-editing` in edit mode). Token-styled `.react-grid-item` transitions
(transform/width/height, killed via `.react-draggable-dragging`/`.resizing`), the
`.react-grid-placeholder` drop preview (`--theme-accent-surface` wash, dashed `--theme-accent-muted`
border), the `.react-resizable-handle` glyph (edit-mode only). All reduced-motion gated. Never add a
coloured one-edge accent here (Never-Do list).

#### Pre-hydration / skeleton

No full-canvas skeleton gate. `useDashboardLayout` seeds defaults synchronously; widgets mount immediately. Per-widget loading uses `WidgetSkeleton fill` inside `DashboardWidgetSlot`.

---

### 6b. `DashboardDateFilter`

**File:** `src/components/dashboard/DashboardDateFilter.tsx` — `'use client'`.

- **Trigger:** `Calendar` icon + active label + chevron. Always rendered "active" (a range is always selected). Active label = `${fromParam} → ${toParam}` for custom, else `DATE_PRESET_LABELS[activePreset]`.
- **Preset list:** `today`, `week`, `month`, `last_month`. Selecting one `router.push`es `dash_preset` set + `dash_from`/`dash_to` cleared.
- **Custom range:** two `DatePicker`s (From / To) + Apply (`dash_preset=custom` + `dash_from`/`dash_to`; disabled until both set and `from < to`).
- **Mechanism:** URL params drive the server render. Changing the range re-runs `dashboard/page.tsx` with a new `dateRange` → new `initialData` → widgets re-seed.

---

### 7. `DashboardWidgetSlot`

**File:** `src/components/dashboard/DashboardWidgetSlot.tsx`

#### Static `React.lazy` map

```typescript
const WIDGET_COMPONENTS: Record<string, React.LazyExoticComponent<...>> = {
  'agent-tasks':         lazy(() => import('./widgets/AgentTasksWidget').then(...)),
  'agent-activity':      lazy(() => import('./widgets/AgentActivityWidget').then(...)),
  'manager-lead-status': lazy(() => import('./widgets/ManagerLeadStatusWidget').then(...)),
  'manager-lead-volume': lazy(() => import('./widgets/ManagerLeadVolumeWidget').then(...)),
  'manager-campaigns':   lazy(() => import('./widgets/ManagerCampaignWidget').then(...)),
  'manager-cold-leads':  lazy(() => import('./widgets/ManagerColdLeadsWidget').then(...)),
  'agent-pending-calls': lazy(() => import('./widgets/AgentPendingCallsWidget').then(...)),
  'agent-new-leads':     lazy(() => import('./widgets/AgentNewLeadsWidget').then(...)),
  'elaya-presence':      lazy(() => import('./widgets/ElayaPresenceCard').then(...)),
  'manager-budget':      lazy(() => import('./widgets/ManagerBudgetWidget').then(...)),
};
```

**Never** dynamic import strings or `require(variable)`. Bundles split per widget; ids not in the map render `null`.

#### Density measurement

The slot calls `useWidgetDensity<HTMLDivElement>()` → `{ ref, tier, measured }`, measures its own cell live (ResizeObserver, rAF-throttled, setState only on a tier crossing) and provides the tier via `WidgetDensityProvider`. The slot fills its RGL cell (`height:100%; width:100%`). Widgets read the tier with `useWidgetDensityTier()`.

#### `measured` gate + `MinSkeletonBoundary` (V-08)

- The widget is **withheld** until `measured` is true — a chart's `ResponsiveContainer` measures synchronously and reads `-1` before RGL resolves the cell height; until then `<WidgetSkeleton fill />` holds the seat.
- `MinSkeletonBoundary`: `useEffect` → `setTimeout(..., 150)` before showing lazy children. Until ready: `<WidgetSkeleton fill />`. **Rule V-08:** never show a skeleton for less than 150ms.

#### `WidgetProps`

```typescript
{
  userId: string;
  role: UserRole;
  domain: AppDomain;
  firstName?: string;          // Elaya card greeting
  initialData?: DashboardSummary;
  size?: WidgetSize;           // back-compat only — the slot owns rendered height (100%)
  dateRange?: DateRange;       // pipeline/volume/campaigns/budget read this; tasks/activity ignore
  scopeDomain?: GiaDomain | null;  // global selector — cohort widgets seed from this; no per-widget tab
}
```

`DashboardWidgetSlotProps` extends this with `widgetId`, `size`, `editMode`, `onRemove`, `dragHandle`.

---

### 8. `WidgetSkeleton`

**File:** `src/components/dashboard/WidgetSkeleton.tsx`

- Props: `{ fill?: boolean }` — `fill` defaults to **`true`** → `height: 100%` to fill the RGL cell.
- Card chrome: `var(--theme-paper)`, `var(--theme-paper-border)`, `var(--shadow-1)`, `var(--radius-lg)`, `padding: var(--space-5)`, `overflow: hidden`.
- Shimmer lines (`animation: pulse 1.8s …` with staggered delays) — a header line, a title line, and four body filler lines inside a `flex: 1` block.

> **Removed — do not recreate:** the `size` prop and the `WIDGET_HEIGHT_BY_SIZE[size] → minHeight` read. The size→px lookup was removed in the continuous-resize rework.

---

### 9. Each Widget — detailed breakdown

#### 9a. `AgentTasksWidget`

| | |
| - | - |
| **File** | `src/components/dashboard/widgets/AgentTasksWidget.tsx` |
| **Registry roles** | `agent`, `manager`, `admin`, `founder` (not agent-only) |
| **`initialData` key** | `agent_tasks` (`DashboardAgentTask[]`) |
| **Lifecycle** | `useWidgetData({ seed, fetcher: () => getAgentTasksSummaryAction(userId) })` — RSC seed skips the mount fetch; a 30s `setInterval(refetch, 30_000)` keeps it fresh; the refresh button calls `refetch()` |

**Renders:** Playfair header "My Tasks."; scrollable list split **Overdue** / **Active** (`is_overdue`); empty copy *"Nothing on your plate. Enjoy the quiet."*; category legend footer.

**Density-adaptive:** `useWidgetDensityTier()`. In the **compact** tier the scrollable list and the category legend are replaced by an open/overdue summary line; **standard/rich** render the full list + legend.
**Task categories (legend):** the footer iterates **`['personal', 'group_subtask']`** only (two values, 0138) — `TASK_CATEGORY[cat].label` + a `CategoryDot` (the `serene-cat-dot-pulse` 7px dot; colours from `TASK_CATEGORY[cat].dotColor`).
**Active statuses:** `to_do`, `in_progress`, `in_review`. **Priority chip:** only `urgent`/`high`. **Context label:** italic tertiary after the title (lead name for a lead task, group title for a `group_subtask`).
**Sort order (server):** overdue → priority → `due_at`. **Row limit:** 30.
**Links:** `lead_id` → `/leads/{id}`; else `/tasks`.
**Refresh service:** `getAgentTasksSummary(profile.id)` — re-verifies `profile.id` server-side (ignores client `userId`). **Redis cache-aside** (`dashboard:agent-tasks:{userId}`, 30s TTL).
**Date filter:** does not apply (tasks are always live).

---

#### 9b. `AgentActivityWidget` — "Recent Leads" (lead rollup, NOT an event stream)

| | |
| - | - |
| **File** | `src/components/dashboard/widgets/AgentActivityWidget.tsx` |
| **Registry label** | "Recent Activity" — but the widget **renders "Recent Leads."** |
| **`initialData` key** | `agent_activity` (`DashboardRecentLead[]`) |

**Renders:** one card per lead, most-recently-worked first, three lines:

1. lead name · `by <agent>` (manager/founder only) · relative time.
2. status chip (`LEAD_STATUS_COLORS`/`LEAD_STATUS_LABELS`) + latest call outcome (`CALL_OUTCOME_LABELS`, `Phone` icon) + domain pill (`DOMAIN_LABELS`).
3. latest note body (≤2 lines, sans + secondary).

The whole card is a `Link` to `/leads/{lead.lead_slug}` (a slug-less lead renders a non-link card). Entrance: framer `opacity 0→1, y -6→0`. The feed runs a gentle CSS-transform marquee (off main thread, ResizeObserver-measured one-copy shift; only when the single copy overflows) — reduced-motion users get a static natively-scrollable list. Empty copy: *"No leads worked yet."* (mine) / *"Nothing logged yet."* (team).

**Mine / Team scope toggle:** a bespoke two-segment pill in the header, **rendered only for `manager`/`admin`/`founder`** (default **Team**). Agents see no toggle (always own leads) and get a "Live" pill instead.

**Lifecycle:** `useWidgetData({ seed: initialData.agent_activity, fetcher: getAgentRecentActivityAction(userId, scopeDomain ?? undefined, scope), deps: [userId] })`. The RSC seed lands as the `'team'` view; flipping to `'mine'` is a client fetch. A **global domain pick** round-trips the page and re-seeds — a `scopeDomain`-keyed `useEffect` re-applies the fresh scoped seed (so it never fights a Mine/Team refetch).

**Data scope (via the rollup RPC, §2c):**

| Role | `'team'` scope |
| ---- | -------------- |
| `admin`, `founder` | `scopeDomain` when picked, else all-org |
| `manager` | own domain |
| `agent` | own leads (`assigned_to`) |

> **Removed — do not recreate:** the `lead_activities` event feed (`call_logged`/`status_changed`/`note_added`/`lead_created`/`agent_assigned`/`duplicate_submission` action-type table), the paired-note rule, the auto-drift `scrollTop` ticker, and the **Realtime `INSERT` subscription on `lead_activities`** (the widget has no Realtime subscription now — it is a rollup seeded by the RSC + the Mine/Team / global-domain re-fetch). The old `get_agent_recent_activity` event RPC (0063) is superseded by `get_recent_lead_activity` (0132).

---

#### 9c. `ManagerLeadStatusWidget`

| | |
| - | - |
| **Roles** | `manager`, `admin`, `founder` |
| **`initialData` key** | `lead_status` |

**Renders:** status stat chips (the "Lost" chip was added 2026-06-20 → six cards, one row); up to 6 agents with per-status counts + a mini stacked bar. **No per-widget domain tabs** — the global `serene-domain` selector scopes it.

**Semantic colours (`LEAD_STATUS_COLORS`):** per-status `var(--status-*-text)` + `var(--status-*-light)` for new / touched / in_discussion / nurturing / won / lost / junk.

**Refresh:** `getLeadStatusSummaryAction(from?, to?, targetDomain?)` — `targetDomain` is the admin/founder global scope (managers are pinned to their own domain via `effectiveWidgetDomain()`). Lifecycle via `useWidgetData` (RSC seed skips the mount fetch; `refetch` serves the refresh button). Service `getLeadStatusSummary` calls the `get_lead_pipeline_refresh(p_role, p_domain, p_date_from, p_date_to)` RPC (migration 0064), **Redis cache-aside** (`dashboard:lead-status:{domain}:{from}:{to}`, 60s). Agent totals derived from the status mix via `normalizeLeadStatusSummary`.
**Date filter:** applies (cohort by `created_at`).

---

#### 9d. `ManagerLeadVolumeWidget`

| | |
| - | - |
| **File** | `src/components/dashboard/widgets/ManagerLeadVolumeWidget.tsx` |
| **Roles** | `manager`, `admin`, `founder` |
| **`initialData` keys** | `lead_volume` (manager, or admin/founder scoped) · `lead_volume_multi` (admin/founder all-domains) |
| **`dateRange` prop** | Read directly; falls back to `resolvePresetToRange('week')` if absent |

**Driven by the global date range** — no local period toggle. Bucket granularity is inferred from the range span in the service layer. **`isMultiMode = !isManager && scopeDomain == null`** picks the seed: `lead_volume_multi` (multi-line) when no domain is picked, else `lead_volume` (single line).

**No mount fetch:** the widget seeds entirely from `initialData` and a domain pick re-seeds via the page round-trip. The volume actions (`getLeadVolumeByDomainsAction` / `getLeadVolumeForDomainAction`) still exist for client refresh paths but are not fired on mount; `useDashboardCohortSync` keeps it aligned with the active cohort.

**Chart:** Recharts `LineChart` in `ResponsiveContainer` inside a `position:relative; flex:1; minHeight:0` region (the absolute-inset wrapper avoids the RGL `-1` measure). Colours via `useChartTokens()` / `DOMAIN_LINE_COLORS` resolved with `resolveColorMap` — no hex in chart props.
**Empty state:** Playfair italic *"No leads in this period."*

> **Removed — do not recreate:** the per-widget domain picker (`GIA_DOMAINS + All` tab) and the manual `chartHeight = WIDGET_HEIGHT_BY_SIZE[size] − chrome` math (the chart region is `flex:1` now).

---

#### 9e. `ManagerCampaignWidget`

| | |
| - | - |
| **Roles** | `manager`, `admin`, `founder` |
| **`initialData` key** | `campaigns` |
| **`defaultGrid`** | `{12, 11, …}` — full grid width |

**Renders:** stacked `BarChart` (`src/components/ui/charts/BarChart.tsx`, `colorMap={STATUS_COLORS}`). Stacked segments use `topRadiusBar(4)`. The chart region is `flex:1; minHeight:0` with `ResponsiveContainer height="100%"` (RGL-`-1`-safe via `ChartFrame`'s absolute-inset region) — no manual height math.

**Status fill tokens (`STATUS_COLORS`):** new → `--color-info` · touched → `--theme-accent` · in_discussion → `--color-warning` · nurturing → `--theme-accent-muted` · won → `--color-success` · lost → `--color-danger` · junk → `--theme-text-tertiary`.

**Empty state:** *"Leads with UTM campaign data will appear here."*
**Refresh:** `getLeadsByCampaignAction(from?, to?, targetDomain?)` — one action (no per-widget tabs; `targetDomain` from the global scope), lifecycle via `useWidgetData`. Service `getLeadsByCampaign` calls `get_campaign_pipeline_refresh(p_role, p_domain, p_date_from, p_date_to)` (migration 0064), **Redis cache-aside** (`dashboard:campaigns:{domain}:{from}:{to}`, 120s).
**Date filter:** applies (cohort by `created_at`).

---

#### 9f. `ManagerColdLeadsWidget`

| | |
| - | - |
| **File** | `src/components/dashboard/widgets/ManagerColdLeadsWidget.tsx` |
| **Roles** | `manager`, `admin`, `founder` |
| **`initialData` key** | `cold_leads_count` |
| **`defaultGrid`** | `{3, 5, …}` |

**Single data source:** `initialData.cold_leads_count ?? 0`. **No `useEffect` fetch, no server action, no refresh button** — the scalar comes from `get_dashboard_summary`.

**Renders:** composes **`SnapshotCountWidget`** — a `Link` to `/leads?going_cold=true`, big count + "Going Cold" label + **"leads with no activity in 5+ days"** hint. Count colour: `var(--color-warning)` when `> 0`, else `var(--theme-text-secondary)`.

**Agent role:** RPC returns `cold_leads_count: 0` via the early-return branch; the widget is not in the agent default layout. **Scoping:** the `/leads` link carries no `&domain=` param — the leads service enforces role/domain scoping server-side. **Date filter:** does not apply (going-cold is a live state).

---

#### 9g. `AgentPendingCallsWidget` / 9h. `AgentNewLeadsWidget`

| | `agent-pending-calls` | `agent-new-leads` |
| - | - | - |
| **`initialData` key** | `pending_calls_count` | `new_leads_count` |
| **Meaning** | open lead follow-up tasks assigned to the agent (`task_gia_meta` presence, non-terminal status) | own non-archived leads at `status='new'` |
| **Link** | `/tasks?tab=gia` | `/leads?status=new` |
| **Positive colour** | `--color-info-text` | `--color-success-text` |

Both compose `SnapshotCountWidget`. Roles: `agent` only. **No fetch, no refresh, no date wiring — by construction a date param cannot reach them** (the RPC counts take zero date inputs).

---

#### 9i. `ElayaPresenceCard` — the live embedded `/elaya` chat (2026-06-16)

| | |
| - | - |
| **File** | `src/components/dashboard/widgets/ElayaPresenceCard.tsx` |
| **Roles** | `agent` (default layout, right of tasks) |
| **Data** | resolves the user's single active Elaya conversation on mount (no AI call until the user speaks) |

> **Major change — it is no longer a shell/teaser.** The card is the **live `/elaya` chat shrunk into the widget**, not a placeholder. It is just the widget-card frame around **`<EmbeddedElayaChat />`** (`src/components/elaya/EmbeddedElayaChat.tsx` — THE shared embedded-Elaya body, also composed by the floating `ElayaWidget`, R-01). `EmbeddedElayaChat` resolves the active conversation via `getElayaChatSeedAction` (A-15) and renders `ElayaChatShell` in `embedded` mode (flush, chat-only — no card-in-a-card, no identity rail), with a breathing `LiaGlyph` holding the seat until the seed lands. The user says hi and gets a reply **inside the widget** — the SSE loop, transcript, cap, and voice all live in the one shell. The chat bundle is lazy (`next/dynamic`, kept out of the dashboard route chunk). No three.js / 3D (lazy-loads post-Elaya-ship).

**Mobile-only overlay:** a "Send feedback" trigger (`MessageSquarePlus`) floats top-right below md, opening the shared suggestion composer (`SuggestionFeedbackProvider`); on desktop the Sidebar item is the entry, so the overlay is hidden.

> **Removed — do not recreate:** the old static shell (IST time-of-day greeting via `getElayaTimeGreeting`, the curated daily line via `pickElayaDailyLine`, the disabled placeholder `MessageBar`). Never re-inline a composer or any seed→shell plumbing on the card — compose `EmbeddedElayaChat`.

---

#### 9j. `ManagerBudgetWidget`

| | |
| - | - |
| **File** | `src/components/dashboard/widgets/ManagerBudgetWidget.tsx` |
| **Roles** | `manager`, `admin`, `founder` |
| **`initialData` key** | `budget_summary` (page-assembled — NOT in the RPC; spend lives in `ad_spend_daily`) |
| **Refresh** | `getBudgetSummaryWidgetAction(from, to, targetDomain?)` — manager pinned via `effectiveWidgetDomain()` |

Reuses the `/budget` pipeline: `getBudgetSummary` (ad-spend-service) seeds via the page `Promise.all`; rows are filtered to the scope server-side via `filterBudgetRowsByDomain` (campaign-prefix → domain — `ad_spend_daily` has no domain column). Renders four `StatTile variant="cell"` aggregates — Spend, Leads, Cost/Lead, Deal Revenue (CPL renders "—" at zero leads, never ₹0) — plus a campaign-count footer. Lifecycle: `useWidgetData` + `useDashboardCohortSync`. **Date filter applies** (cohort data, like campaigns). Empty state: italic *"No ad spend recorded in this period."*

---

### 10. Server Actions — `dashboard.ts`

All return `{ data, error }`. All guard via `requireProfile()` first — **client-supplied `role` / `domain` / `userId` are never trusted** for authorization. Date params validated via Zod (`WidgetScopeSchema` / `VolumeScopeSchema` / `DomainsVolumeSchema` / `BudgetScopeSchema` — collapsed from six near-identical schemas in dry-audit H-5) — inverted ranges rejected; managers are locked to `profile.domain` regardless of the requested domain via the single `effectiveWidgetDomain()` helper.

| Action | Service / RPC | Role guard | Return shape |
| ------ | ------------- | ---------- | ------------ |
| `getAgentTasksSummaryAction(_agentId)` | `getAgentTasksSummary(profile.id)` | Authenticated | `{ data: DashboardAgentTask[] \| null, error }` |
| `getAgentRecentActivityAction(_agentId, targetDomain?, scope='team')` | `getAgentRecentActivity(profile.id, profile.role, profile.domain, effectiveWidgetDomain(...), scope)` | Authenticated (Zod validates `domain` + `scope ∈ mine\|team`) | `{ data: AgentActivity[] \| null, error }` |
| `getLeadStatusSummaryAction(from?, to?, targetDomain?)` | `getLeadStatusSummary(role, domain, effectiveDomain?, range?)` | manager+ | `{ data: LeadStatusSummary \| null, error }` |
| `getLeadsByCampaignAction(from?, to?, targetDomain?)` | `getLeadsByCampaign(role, domain, effectiveDomain?, range?)` | manager+ | `{ data: CampaignStatusMix[] \| null, error }` |
| `getLeadVolumeByDomainsAction(from, to, domains)` | `getLeadVolumeByDomains(domains, range)` | manager+ | `{ data: MultiDomainVolumeSummary \| null, error }` |
| `getLeadVolumeForDomainAction(from, to, targetDomain)` | `getLeadVolumeForDomain(effectiveDomain, range)` | manager+ | `{ data: LeadVolumeSummary \| null, error }` |
| `getBudgetSummaryWidgetAction(from, to, targetDomain?)` | `getBudgetSummary(from, to)` + `filterBudgetRowsByDomain` | manager+ (manager always pinned to own domain) | `{ data: BudgetCampaignRow[] \| null, error }` |

`targetDomain` omitted → role-scoped summary ("All" view). `targetDomain` set → single-domain drill-down (the global selector for admin/founder). The volume pair stays two actions deliberately — `MultiDomainVolumeSummary` vs `LeadVolumeSummary` are different shapes. The file also re-exports `resolvePresetToRange` for client components.

> **Removed — do not recreate:** the status/campaign `*ForDomainAction` twins and the dead `getLeadVolumeByRangeAction` (dry-audit H-5).

---

### 11. Realtime Integration

> **The dashboard has no widget Realtime subscription.** `AgentActivityWidget` is now a rollup seeded by the RSC (no `lead_activities` channel — removed with the event-stream rework). `ManagerColdLeadsWidget` and the snapshot counts are RPC-seeded and static until the next RSC render. The old `agent-activity:${userId}:${mountId}` channel no longer exists.

#### Sound notification (not on a dashboard widget)

Sound is owned by the **notifications** pipeline, not the dashboard:

| | |
| - | - |
| **Hook** | `src/hooks/useNotificationSound.ts` |
| **Triggered from** | `src/hooks/useNotifications.ts` on `notifications` **INSERT** only |
| **Implementation** | Web Audio API — oscillators 1047 Hz (C6) + 1318 Hz (E6), ~0.4s decay, master gain 0.12 |
| **Debounce** | 1500ms between plays |
| **Autoplay** | `context.resume()`; if state ≠ `'running'`, silent return |
| **localStorage** | `serene:notifications:sound:v1` — default `true` when absent |

**Rule:** only `useNotifications.ts` may call `sound.play()`.

---

### 12. Access Control Summary

| Widget | Roles (default layout) | Enforcement layer |
| ------ | ---------------------- | ----------------- |
| `agent-tasks` | `agent`, `manager`, `admin`, `founder` | `DEFAULT_GRID_BY_ROLE` + registry `roles`; tasks RPC filters `assigned_to = p_user_id` |
| `agent-activity` | same | Layout + registry; rollup RPC scope (`'mine'`/`'team'`) is session-derived (Q-13) |
| `manager-lead-status` | `manager`, `admin`, `founder` | Layout + registry; omitted for `agent`; actions require manager+ |
| `manager-lead-volume` | `manager`, `admin`, `founder` | Layout + registry; volume service filters manager domain |
| `manager-campaigns` | `manager`, `admin`, `founder` | Layout + registry; RPC domain gate |
| `manager-cold-leads` | `manager`, `admin`, `founder` | Layout + registry; RPC `cold_leads_count` scoped (manager domain / admin all); agent branch returns 0 |
| `agent-pending-calls` / `agent-new-leads` | `agent` | Layout + registry; RPC counts filter `assigned_to = p_user_id`; manager+ branch returns 0 |
| `elaya-presence` | `agent` | Layout + registry; conversation/cap enforced server-side by the Elaya layer |
| `manager-budget` | `manager`, `admin`, `founder` | Layout + registry; page/action filter rows to scope (`effectiveWidgetDomain` + `filterBudgetRowsByDomain`) |

**Guest:** empty default layout. **Login gate:** page redirects unauthenticated users to `/login`.

---

### 13. Known Invariants (must never be violated)

1. **RSC rule (perf-01):** Summary widgets must not POST on initial load. `AgentTasksWidget`, `AgentActivityWidget`, `ManagerLeadStatusWidget`, `ManagerCampaignWidget`, and `ManagerLeadVolumeWidget` all seed from `initialData` and skip the mount fetch. Refresh happens via the refresh button (Pipeline/Campaign), the 30s interval (Tasks), the Mine/Team flip + global-domain re-seed (Recent Leads), and the page round-trip (Volume). `ManagerColdLeadsWidget` + the two snapshot counts never fetch.
2. **Dashboard summary data is RSC + cached.** Do not split `getDashboardSummary` back into individual server-action calls for summary data.
3. **PRIMARY ENTRY POINTS:** `getDashboardSummary()` (single cached RPC) + `getAgentRecentActivity()` (the rollup seed) — both per request, both via the admin client with session-derived args.
4. **Uses React `cache()` (not `unstable_cache`)** for per-request dedup; any function reading `cookies()` still cannot be wrapped in `unstable_cache` (P-09).
5. **Individual service functions are NOT used for initial page load** except the volume seeders + the rollup seed — refresh buttons / client range changes only.
6. **All dashboard data goes through `src/lib/services/dashboard-service.ts` — never `leads-service.ts`.**
7. **All client-side fetches go through server actions in `src/lib/actions/dashboard.ts`.**
8. **Server actions always call `requireProfile()` and use the verified profile** — never trust client-supplied role/domain/userId; scope args to the revoked RPCs stay session-derived (Q-13).
9. **Widgets receive `userId`, `role`, `domain`, `dateRange`, `scopeDomain` as props** — but server actions re-verify via `requireProfile()`.
10. **`DashboardWidgetSlot` uses a static map of `React.lazy()` calls.** Never `require()` from a string. Never compute the import path dynamically.
11. **Widget registry `id` is a stable localStorage key — NEVER rename after shipping.**
12. **`sanitizeStored()` validates each stored `widgetId` against the registry AND the caller's role**, and clamps x/y/w/h against the registry `defaultGrid`. Unrecognised / role-disallowed / malformed placements are silently dropped.
13. **`DashboardCanvas` no longer gates on `isHydrated`. Do not add that gate back.** (But `handleLayoutChange` ignores RGL's pre-hydration echo via `if (!isHydrated) return` so the default never overwrites the saved layout.)
14. **The hook initialises `stored` synchronously with `DEFAULT_GRID_BY_ROLE[role]`** so widgets render immediately with the designed defaults.
15. **react-grid-layout owns geometry.** `applyLayout` receives the full layout on every change and no-ops when nothing changed. Do not re-add `moveWidget`/`resizeWidget`/`reorderWidgets` or `@dnd-kit`.
16. **Min skeleton:** never show a skeleton for less than **150ms** (V-08) — enforced by `MinSkeletonBoundary`; the slot also withholds a widget until its cell is `measured` (the chart `-1` guard).
17. **Initial data fetch in a widget (when no `initialData`) must live in `useEffect` / `useWidgetData`,** never as a render-phase guard.
18. **`initialData` null-coercion:** page always coerces `agent_tasks ?? []`, `agent_activity ?? []`, `campaigns ?? []` before spreading. A widget's `seed !== null` guard would otherwise fire a POST on first load.
19. **Page never throws/redirects on RPC failure** — `try/catch` renders zeroed `initialData` with a `[dashboard/page]` log.
20. **GRANT after every `CREATE OR REPLACE`** of `get_dashboard_summary` — `CREATE OR REPLACE` silently drops the GRANT (this function keeps its `authenticated` GRANT; it is self/role-scoped).
21. **Date filter scopes by `leads.created_at` (cohort/intake), never `status_changed_at`** — and applies only to `lead_status` + `campaigns` (+ the volume series and `budget_summary`). `agent_tasks`, `agent_activity` (rollup), `cold_leads_count`, `pending_calls_count`, `new_leads_count` are always live — **the snapshot counts take zero date inputs anywhere in the chain; wiring them to the URL date param is conceptually invalid.**
22. **`cold_leads_count` cutoff comes from `cold_lead_cutoff()` (SQL) mirroring `COLD_LEAD_THRESHOLD_DAYS` = 5** in `src/lib/constants/leads.ts` — change both in the same commit.
23. **Snapshot count cards compose `SnapshotCountWidget`** — never fork the big-count/label/hint/Link card.
24. **Layout storage version (`useDashboardLayout` `STORAGE_VERSION`, currently `v4`) must be bumped whenever the default grid changes shape** — stale persisted layouts must be orphaned (reset to the role default), never reconciled against a new grid.
25. **The `agent-activity` seed is the rollup RPC, not `get_dashboard_summary`'s `agent_activity` CTE.** The page always overwrites the RPC's `agent_activity` key with `getAgentRecentActivity`. Do not wire the widget back to the CTE.
26. **There are NO per-widget domain tabs.** The global `serene-domain` selector (`resolveDomainParam` → `scopeDomain`) is the single source, threaded page → canvas → widget. A domain pick re-seeds via the page round-trip.
27. **The Elaya card is the live embedded chat (`EmbeddedElayaChat`)** — never re-inline a composer or a static teaser, and never load 3D there.

---

### 14. Motion constants (`src/lib/constants/motion.ts`)

Dashboard widgets mostly use inline durations or Framer defaults; the spatial-grid chrome transitions live in `globals.css` (token durations, reduced-motion gated). `AgentActivityWidget` uses `EASE_OUT_EXPO` + `BASE_DURATION` for card entrance and a spring for the Mine/Team thumb. `DashboardDateFilter` uses `DROPDOWN_VARIANTS`. The framer import convention is `import { m as motion }` (A-17) — never the bare `{ motion }` namespace.

---

### 15. Related migrations (grep index)

| File | Relevance |
| ---- | --------- |
| `20260529000029_get_dashboard_summary.sql` | Initial RPC (3-param) |
| `20260530000043_fix_dashboard_summary_domain_type.sql` | `p_domain app_domain` |
| `20260531000047_dashboard_agent_tasks_all_categories.sql` | Tasks CTE rewrite |
| `20260531000048_dashboard_activity_limit_25.sql` | Activity LIMIT 25 |
| `20260531000050_dashboard_activity_role_scoped.sql` | Activity role CTE |
| `20260603000062_get_dashboard_summary_role_branch.sql` | 4-param; agent early-return + `p_initial_domain` |
| `20260603000063_get_agent_recent_activity.sql` | `get_agent_recent_activity` event RPC (superseded by 0132) |
| `20260603000064_dashboard_refresh_rpcs.sql` | `get_lead_pipeline_refresh` + `get_campaign_pipeline_refresh` |
| `20260604000069_dashboard_date_filter.sql` | 6-param; date filter on the CTEs |
| `20260604000070_fix_pipeline_agent_total.sql` | `COUNT(*)` → `SUM(cnt)` totals fix |
| `20260606000081_dashboard_cold_leads.sql` | `cold_leads_count` key (regressed the 0070 SUM totals — fixed in 0115) |
| `20260611000102_revoke_scope_param_rpcs.sql` | REVOKE EXECUTE from `authenticated` on the scope-param RPCs (incl. `get_recent_lead_activity`) → admin-client only |
| `20260612000115_dashboard_agent_snapshot_counts.sql` | `pending_calls_count` + `new_leads_count` keys; SUM(cnt) totals restored |
| `20260617000129_manager_pipeline_full_roster.sql` | `lead_status.byAgent` for managers = full domain roster LEFT JOINed to the cohort |
| `20260617000132_recent_lead_activity_rollup.sql` | `get_recent_lead_activity` lead-rollup RPC (Recent Leads); `p_scope` mine/team |
| `20260617000138_collapse_gia_category_module_enum.sql` | `task_category` → 2 values; `pending_calls_count` via `task_gia_meta` presence |
| `20260623000140_cold_lead_cutoff_dry.sql` | `cold_lead_cutoff()` anchor; cold predicate repointed — **canonical current `get_dashboard_summary`** |

---

*End of document.*
