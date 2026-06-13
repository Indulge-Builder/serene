# Dashboard — Page Spec

> **Purpose:** spec for `/dashboard` — the personalised bento-grid home surface.
> **Audience:** engineers. · **Source-of-truth scope:** this route's behaviour, data flow, components, invariants. Widget queries live in `dashboard-service.ts` (home: this doc); shell/theming live in `../architecture/overview.md`.
> **Last verified:** 2026-06-09 full pass; 2026-06-11 restructure (H-5 action consolidation reflected); 2026-06-12 agent dashboard redesign (snapshot counts, Elaya card, budget widget, layout v2).

## 1. Purpose

Serene's home surface: a personalised bento grid of Gia widgets. Each widget is an independently
code-split client component. Summary data arrives on first paint via one server-side
`get_dashboard_summary` RPC (React `cache()`); a global URL-param date filter
(`DashboardDateFilter`) scopes pipeline/campaign/volume to a cohort window
(by `leads.created_at`, IST — Decision Log 2026-06-04). Widgets share no mutable state.

## 2. Who sees it

| Role | Widgets in default layout | Data scope |
| ---- | ------------------------- | ---------- |
| `agent` | `agent-tasks`, `elaya-presence`, `agent-pending-calls`, `agent-new-leads`, `agent-activity` | own tasks/counts/activity; date filter does not apply to any of them |
| `manager` | the founder seven (six + `manager-budget`) | domain-scoped leads/status/campaigns/volume/cold-leads/budget; tasks still own |
| `admin` / `founder` | all seven | cross-domain + domain picker tabs on manager widgets; budget all-domain |
| `guest` | none (`DEFAULT_LAYOUT_BY_ROLE.guest = []`) | — |

Route guards: dashboard layout session gate; `/dashboard` is in `ALWAYS_ALLOWED_PREFIXES`.
Per-widget enforcement table: Deep dive §12.

## 3. Data sources

| Layer | File | Notes |
| ----- | ---- | ----- |
| RPC | `get_dashboard_summary` (0029/0062/0069/0115) | single jsonb, all summary widgets + `cold_leads_count` + agent snapshot counts |
| Service | `src/lib/services/dashboard-service.ts` | `getDashboardSummary` (React `cache()`), `getLeadVolumeByPeriod`; Redis cache-aside per `../architecture/caching.md` |
| Service (budget) | `src/lib/services/ad-spend-service.ts` | `getBudgetSummary` (the /budget RPC, reused as the widget seed) + `filterBudgetRowsByDomain` (campaign-prefix → domain) |
| Actions | `src/lib/actions/dashboard.ts` | 7 widget-refresh actions, all via `requireProfile()`; manager pinned via `effectiveWidgetDomain()` |
| Hooks | `useDashboardLayout`, `useWidgetData`, `useDashboardCohortSync`, `resolveWidgetScope` | layout persistence, fetch lifecycle, cohort URL sync, scope decision |

## 4. Components

`page.tsx` (RSC orchestrator) · `DashboardCanvas` · `DashboardWidgetSlot` (static `React.lazy` map) ·
`WidgetSkeleton` · `DashboardDateFilter` · widgets: `AgentTasksWidget`, `AgentActivityWidget`,
`AgentPendingCallsWidget`, `AgentNewLeadsWidget`, `ElayaPresenceCard`, `ManagerLeadStatusWidget`,
`ManagerLeadVolumeWidget`, `ManagerCampaignWidget`, `ManagerColdLeadsWidget`, `ManagerBudgetWidget`
(+ the shared `SnapshotCountWidget` base — THE big-count/label/hint/Link card; cold-leads,
pending-calls, and new-leads all compose it). Registry: `src/lib/constants/dashboard-widgets.ts` (pure data).

## 5. States

- **Loading:** `loading.tsx` composes `PageSkeletons` + a bespoke bento skeleton; per-widget `WidgetSkeleton` behind `MinSkeletonBoundary` (≥150 ms, V-08).
- **Empty:** each widget renders its own `<EmptyState>` (Playfair italic, V-09) on zero data.
- **Error:** page never throws/redirects on RPC failure — renders zeroed `initialData` with a `[dashboard/page]` log; widget refresh errors surface via toast.

## 6. Invariants

The 25 must-never-be-violated rules are maintained in Deep dive §13 (RSC no-POST-on-load rule,
React `cache()` not `unstable_cache`, stable widget ids, GRANT after `CREATE OR REPLACE`,
cohort-date semantics, …). Read them before touching any widget.

## 7. Open items

None recorded.

---

## 8. Deep dive

### 2. Data Model

#### 2a. `get_dashboard_summary` RPC

**Canonical definition (latest):** `supabase/migrations/20260612000115_dashboard_agent_snapshot_counts.sql`
**Signature lineage (each migration drops the prior overload and replaces it):**

| Migration | Change |
| --------- | ------ |
| `20260529000029_get_dashboard_summary.sql` | Initial 3-param `(p_role text, p_domain app_domain, p_user_id uuid)`; 4 keys |
| `20260530000043_fix_dashboard_summary_domain_type.sql` | `p_domain` → `app_domain` (post migration 0041 enum change) |
| `20260531000047_dashboard_agent_tasks_all_categories.sql` | Tasks CTE rewrite (all 3 categories, `newLeadsCount` removed) |
| `20260531000048_dashboard_activity_limit_25.sql` | Activity LIMIT 10 → 25 |
| `20260531000050_dashboard_activity_role_scoped.sql` | Activity role CTE (admin/founder all, manager domain, agent self) |
| `20260603000062_get_dashboard_summary_role_branch.sql` | Adds `p_initial_domain app_domain DEFAULT NULL` (4-param); **agent role early-returns** after tasks + activity (empty stubs for lead_status/campaigns) |
| `20260604000069_dashboard_date_filter.sql` | Adds `p_date_from`, `p_date_to` (6-param); date filter on `lead_status` + `campaigns` CTEs only |
| `20260604000070_fix_pipeline_agent_total.sql` | `agent_counts`/`campaign_agg` totals: `COUNT(*)` → `SUM(cnt)` (true lead counts) |
| `20260606000081_dashboard_cold_leads.sql` | Adds 5th return key `cold_leads_count` (scalar int); **silently regressed the 0070 `SUM(cnt)` totals back to `COUNT(*)`** (fixed in 0115) |
| `20260612000115_dashboard_agent_snapshot_counts.sql` | Adds `pending_calls_count` + `new_leads_count` (agent branch only, zero date inputs); restores 0070 `SUM(cnt)` totals; **canonical current definition** |

**Signature (exact, current):**

```sql
CREATE OR REPLACE FUNCTION get_dashboard_summary(
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
GRANT EXECUTE ON FUNCTION get_dashboard_summary(text, app_domain, uuid, app_domain, timestamptz, timestamptz) TO authenticated;
```

> **Invariant:** `CREATE OR REPLACE` silently drops the existing GRANT. The GRANT line **must** immediately follow the function body in every migration that touches this RPC.

**SECURITY:** `SECURITY DEFINER SET search_path = public` — RLS does not fire; role/domain/user scoping is enforced inside the function body via `p_role`, `p_domain`, `p_initial_domain`, and `p_user_id`.

**Domain-scoping logic (manager / admin / founder):**

- `manager` → always `p_domain`.
- `admin`/`founder` + `p_initial_domain IS NOT NULL` → scoped to `p_initial_domain` (seeds the default tab on first paint; page always passes `'onboarding'`).
- `admin`/`founder` + `p_initial_domain IS NULL` → no domain filter (all-org "All" view — used by the domain tab).

**Date filter:** `p_date_from`/`p_date_to` apply `created_at >= p_date_from AND created_at < p_date_to` to the `lead_status` and `campaigns` CTEs **only**. `agent_tasks`, `agent_activity`, `cold_leads_count`, `pending_calls_count`, and `new_leads_count` ignore the range. Filtering is on `leads.created_at` (intake/cohort date), **never** `status_changed_at`. NULL params → all-time (backwards compatible).

**Top-level return:** single `jsonb` object with **seven keys**:

| Key | Type in RPC | Consumed by widget |
| --- | ----------- | ------------------ |
| `agent_tasks` | `jsonb` **array** of task objects | `AgentTasksWidget` → `initialData.agent_tasks` |
| `agent_activity` | `jsonb` array of activity objects | `AgentActivityWidget` → `initialData.agent_activity` |
| `lead_status` | `jsonb` object `{ totals, byAgent }` | `ManagerLeadStatusWidget` → `initialData.lead_status` |
| `campaigns` | `jsonb` array of campaign objects | `ManagerCampaignWidget` → `initialData.campaigns` |
| `cold_leads_count` | `jsonb` **scalar int** | `ManagerColdLeadsWidget` → `initialData.cold_leads_count` |
| `pending_calls_count` | `jsonb` **scalar int** (0115) | `AgentPendingCallsWidget` → `initialData.pending_calls_count` |
| `new_leads_count` | `jsonb` **scalar int** (0115) | `AgentNewLeadsWidget` → `initialData.new_leads_count` |

(Volume — `lead_volume` / `lead_volume_multi` — and `budget_summary` are intentionally **excluded** from the RPC; see §2c and §9j.)

**Agent role branch:** when `p_role = 'agent'`, the RPC computes `agent_tasks` + `agent_activity` plus the two snapshot counts — `pending_calls_count` (open `gia_followup` tasks: `assigned_to = p_user_id`, status `to_do`/`in_progress`/`in_review`) and `new_leads_count` (`assigned_to = p_user_id`, `status = 'new'`, not archived) — then returns immediately with empty stubs for `lead_status` (`{ totals: [], byAgent: [] }`), `campaigns` (`[]`), and `cold_leads_count` (`0`). No pipeline/campaign/cold-leads DB work runs for agents. Manager+ get `0` stubs for both snapshot counts (the widgets are agent-only). **Both counts take zero date inputs — wiring them to the date filter is conceptually invalid (live snapshot, not cohort).**

##### `agent_tasks` element shape

```json
{
  "id": "uuid",
  "title": "string",
  "task_category": "personal" | "group_subtask" | "gia_followup",
  "task_type": "string",
  "priority": "urgent" | "high" | "normal",
  "status": "to_do" | "in_progress" | "in_review",
  "due_at": "timestamptz | null",
  "is_overdue": boolean,
  "context_label": "string | null",
  "lead_id": "string | null"
}
```

**CTE behaviour:** `tasks` where `assigned_to = p_user_id` and `status IN ('to_do','in_progress','in_review')`. LEFT JOINs: `task_gia_meta` + `leads` for `gia_followup` context; `task_groups` for `group_subtask` context. ORDER: overdue first → priority (`urgent`→`high`→`normal`) → `due_at ASC NULLS LAST`. **LIMIT 30.** Always computed (every role has the Tasks widget); date filter does **not** apply.

##### `agent_activity` element shape

```json
{
  "id": "uuid",
  "action_type": "string",
  "details": "jsonb | null",
  "created_at": "timestamptz",
  "lead_id": "uuid | null",
  "actor_id": "uuid | null",
  "lead_name": "string | null"
}
```

**CTE behaviour (role-scoped):**

| `p_role` | WHERE clause |
| -------- | ------------ |
| `admin`, `founder` | `true` (all rows in `lead_activities`) |
| `manager` | `l.domain = p_domain` (join `leads l` on `la.lead_id`) |
| `agent` (else) | `la.actor_id = p_user_id` |

**LIMIT 25.** Always computed; date filter does **not** apply. (`note_added` is stripped in the client — see §9b.)

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

**CTE behaviour:** active leads (`archived_at IS NULL`), date-filtered on `created_at`. Domain scoping per the rules above. Status order in `totals`: new → touched → in_discussion → nurturing → won → lost → junk (zero-count statuses omitted). `byAgent` ordered by `total DESC`. **Agent `total` is derived from `SUM(cnt)` of the status mix (migration 0070 fix) — not a row count.**

##### `campaigns` element shape

```json
{
  "campaign": "string",
  "total": <int>,
  "mix": { "<status>": <int>, ... }
}
```

**CTE behaviour:** `utm_campaign IS NOT NULL`, not archived, date-filtered on `created_at`. Domain scoping per the rules above. Top **12** campaigns by `total DESC` (where `total = SUM(cnt)`, migration 0070).

##### `cold_leads_count` (migration 0081)

Scalar int. `COUNT(*)` of leads where `archived_at IS NULL` AND `status NOT IN ('won','lost','junk')` AND `last_activity_at < now() - interval '5 days'`. Scoping: admin/founder all, manager `domain = p_domain`. **NULL `last_activity_at` rows are excluded** (`NULL < x` is falsy — handled by the SLA engine, not the going-cold bucket). The 5-day threshold mirrors `COLD_LEAD_THRESHOLD_DAYS` in `src/lib/constants/leads.ts` — keep both in sync. **The date filter intentionally does NOT apply** — "going cold" is a live state, not a cohort metric.

##### Why React `cache()` instead of `unstable_cache`

`getDashboardSummary` in `src/lib/services/dashboard-service.ts` wraps the RPC with `cache()` from `'react'`. `unstable_cache` is not viable — `createClient()` calls `cookies()`, which Next.js forbids inside `unstable_cache` closures. React `cache()` deduplicates within a single RSC render pass (per-request memoisation). On RPC error the service **`throw error`** (not swallowed) — but the page catches it (see §5).

---

#### 2b. `DashboardSummary` type

**File:** `src/lib/types/index.ts`

**Assembled on the page:** RPC result spread + `lead_volume` (manager) / `lead_volume_multi` (admin/founder) from the volume service functions.

```typescript
export type DashboardSummary = {
  agent_tasks:    DashboardAgentTask[];
  agent_activity: DashboardAgentActivity[];
  lead_status:    DashboardLeadStatusSummary;
  campaigns:      DashboardCampaignStatusMix[];
  /** Manager: single-domain line chart for profile.domain */
  lead_volume:       DashboardLeadVolumeSummary | null;
  /** Admin/founder: multi-domain "All" tab — seeded on first paint */
  lead_volume_multi: DashboardMultiDomainVolumeSummary | null;
  /** Count of non-terminal leads with no activity in 5+ days. Agent role: always 0. */
  cold_leads_count?: number;
  /** Agent snapshot counts (0115) — live, never date-scoped. Non-agent roles: always 0. */
  pending_calls_count?: number;
  new_leads_count?: number;
  /** Manager+: budget rows for the active range (page-assembled from getBudgetSummary; manager rows pre-filtered to their domain). Agent: null. */
  budget_summary?: BudgetCampaignRow[] | null;
};
```

Element types (`DashboardAgentTask`, `DashboardAgentActivity`, `DashboardLeadStatusCount`, `DashboardAgentStatusBreakdown`, `DashboardLeadStatusSummary`, `DashboardCampaignStatusMix`, `DashboardVolumeDataPoint`, `DashboardLeadVolumeSummary`, `DashboardMultiDomainVolumeSummary`) are all defined in `src/lib/types/index.ts`. `LeadStatus` is imported from `src/lib/types/database.ts`.

---

#### 2c. Volume data — `getLeadVolumeByRange` / `getLeadVolumeByDomains`

**Why excluded from RPC:** bucket granularity is derived from the selected range span (hourly / daily / weekly / monthly), computed in TypeScript (`inferBucketMs` in `dashboard-service.ts`). The RPC is a fixed snapshot. Comment in `src/lib/types/index.ts`: *"Volume is NOT in the RPC — bucket granularity is computed in the service layer."*

**Service functions (all `DateRange`-based, all Redis cache-aside):**

| Function | Returns | Scope |
| -------- | ------- | ----- |
| `getLeadVolumeByRange(role, domain, dateRange)` | `LeadVolumeSummary` `{ total, series }` | manager → `.eq('domain', domain)`; else no domain filter |
| `getLeadVolumeByDomains(domains[], dateRange)` | `MultiDomainVolumeSummary` `{ domains, totals, series }` | admin/founder multi-line "All domains" |
| `getLeadVolumeForDomain(domain, dateRange)` | `LeadVolumeSummary` | admin/founder single-domain tab (delegates to `getLeadVolumeByRange('manager', domain, range)` so the domain filter always applies) |

**Bucket inference (`inferBucketMs`):** ≤ 2 days → hourly · ≤ 60 days → daily · ≤ 1 year → weekly · else → ~monthly. Labels formatted IST (`formatBucketLabel`). Lead rows are paginated past PostgREST's 1000-row cap (`fetchVolumeLeads`, `LEAD_VOLUME_PAGE_SIZE = 1000`).

**Where seeded on first paint:**

| Call site | Role | Seeds |
| --------- | ---- | ----- |
| `dashboard/page.tsx` → `getLeadVolumeByRange` | manager only | `initialData.lead_volume` |
| `dashboard/page.tsx` → `getLeadVolumeByDomains([...GIA_DOMAINS])` | admin/founder only | `initialData.lead_volume_multi` |

`VolumePeriod` (`'today' | 'week' | 'month' | 'quarter'`) still exists on the service type for backwards compat but is **no longer used** for the global filter — the date range is the unit now.

---

### 3. Widget Registry — `dashboard-widgets.ts`

**File:** `src/lib/constants/dashboard-widgets.ts`

#### All ten widget entries

| `id` | `label` | `roles` | `domains` | `defaultSize` | `colSpan` | `module` |
| ---- | ------- | ------- | --------- | ------------- | --------- | -------- |
| `agent-tasks` | My Tasks | `agent`, `manager`, `admin`, `founder` | `*` | `md` | `1` | `gia` |
| `agent-activity` | Recent Activity | `agent`, `manager`, `admin`, `founder` | `*` | `lg` | `1` | `gia` |
| `agent-pending-calls` | Pending Calls | `agent` | `*` | `sm` | `1` | `gia` |
| `agent-new-leads` | New Leads | `agent` | `*` | `sm` | `1` | `gia` |
| `elaya-presence` | Elaya | `agent` | `*` | `md` | `1` | `gia` |
| `manager-lead-status` | Lead Pipeline | `manager`, `admin`, `founder` | `*` | `lg` | `1` | `gia` |
| `manager-lead-volume` | Lead Volume | `manager`, `admin`, `founder` | `*` | `lg` | `1` | `gia` |
| `manager-campaigns` | Campaign Performance | `manager`, `admin`, `founder` | `*` | `xl` | `2` | `gia` |
| `manager-cold-leads` | Going Cold | `manager`, `admin`, `founder` | `*` | `sm` | `1` | `gia` |
| `manager-budget` | Campaign Budget | `manager`, `admin`, `founder` | `*` | `sm` | `1` | `gia` |

#### `WIDGET_HEIGHT_BY_SIZE` (shared by widgets + `WidgetSkeleton`)

| Size | Height | Label (`WIDGET_SIZE_LABELS`) |
| ---- | ------ | ---------------------------- |
| `sm` | `200px` | Compact |
| `md` | `300px` | Standard |
| `lg` | `420px` | Tall |
| `xl` | `540px` | Full |

#### `DEFAULT_LAYOUT_BY_ROLE`

| Role | Ordered widget ids |
| ---- | ------------------ |
| `founder` | `agent-tasks`, `agent-activity`, `manager-lead-status`, `manager-lead-volume`, `manager-campaigns`, `manager-cold-leads`, `manager-budget` |
| `admin` | Same as founder |
| `manager` | Same as founder (manager data is domain-pinned server-side) |
| `agent` | `agent-tasks`, `elaya-presence`, `agent-pending-calls`, `agent-new-leads`, `agent-activity` |
| `guest` | `[]` |

Initial grid positions are derived in `useDashboardLayout.getDefaults()`: `col = index % 2`, `row = floor(index / 2)`; `size` and `colSpan` from `WIDGET_MAP[id]`.

#### `WIDGET_MAP` and `isValidWidgetId`

- `WIDGET_MAP`: `Record<string, WidgetDefinition>` built from `DASHBOARD_WIDGETS` — O(1) lookup for labels, defaults, and validation.
- `isValidWidgetId(id)`: returns `id in WIDGET_MAP`. Used when reading `localStorage` and when adding/reordering widgets so **stale or renamed ids never enter the layout**.

---

### 4. `useDashboardLayout` Hook

**File:** `src/hooks/useDashboardLayout.ts`

#### localStorage key

```text
serene:dashboard:layout:${userId}:v2
```

(`STORAGE_KEY_PREFIX` + `:` + `userId` + `:` + `STORAGE_VERSION`. Bumped `v1` → `v2` in the 2026-06-12 redesign — versioning the key orphans stale layouts instead of letting them fight a new default grid. Bump it again whenever the default grid changes shape.)

#### Stored shape

```typescript
{ placements: WidgetPlacement[] }  // { widgetId, col, row, size, colSpan }[]
```

#### Hydration behaviour

1. **First render:** `useState(() => getDefaults(role))` — synchronous defaults from `DEFAULT_LAYOUT_BY_ROLE` so widgets appear immediately (no empty canvas).
2. **After mount:** `useEffect` reads `localStorage` via `readFromStorage()` → `sanitizeStored()` → compares JSON to current state; **`setStored` only if different** — avoids unmount/remount when stored layout matches defaults.
3. **`isHydrated`:** set `true` after the effect runs. Exposed for consumers; **`DashboardCanvas` does not gate rendering on it** (do not re-add a hydration gate).

#### Returned operations

| Name | Behaviour |
| ---- | --------- |
| `layout` | Current `WidgetPlacement[]` |
| `isHydrated` | `false` until post-mount localStorage reconciliation completes |
| `addWidget(widgetId)` | No-op if invalid id or already present; appends at `row = maxRow + 1`, `col = 0`, registry defaults for `size`/`colSpan` |
| `removeWidget(widgetId)` | Filters placement out; persists |
| `moveWidget(widgetId, col, row)` | Updates `col`/`row` on one placement |
| `resizeWidget(widgetId, size)` | Updates `size` only |
| `resizePlacement(widgetId, size, colSpan)` | Updates both `size` and `colSpan` (used by `ResizePopover`) |
| `reorderWidgets(newOrder)` | Rebuilds placements from id order; recalculates `col = i % 2`, `row = floor(i / 2)`; preserves per-widget `size`/`colSpan` where possible |
| `resetToDefaults()` | `persist(getDefaults(role))` |

#### Validation on load

`sanitizeStored()` inside `readFromStorage()`:

- Invalid root → role defaults.
- Each placement: `widgetId` must pass `isValidWidgetId()` **and** `WIDGET_MAP[widgetId].roles.includes(role)` (a demoted user loses manager-only widgets) or it is **silently dropped**.
- `size` must be `sm`|`md`|`lg`|`xl` else `'md'`.
- `colSpan` must be `1`|`2` else falls back to `WIDGET_MAP[widgetId].colSpan ?? 1`.

---

### 5. Page Component — `dashboard/page.tsx`

#### Server flow

1. `getCurrentProfile()` — if null → `redirect('/login')`.
2. **Resolve date range from `searchParams`:** `dash_preset` (`today` | `week` | `month` | `last_month` | `quarter` | `custom`, default `week`); `dash_from` / `dash_to` (YYYY-MM-DD, only when `preset=custom`). `custom` with malformed params falls back to `week` (`rangeFromUrlParams` → `resolvePresetToRange('week')`).
3. Agents skip the range for the RPC (`rpcDateRange = undefined`).
4. **`try/catch`-wrapped `Promise.all`:**
   - `getDashboardSummary(role, domain, profile.id, isManager ? undefined : 'onboarding', rpcDateRange)`
   - `isManager` → `getLeadVolumeByRange(role, domain, dateRange)`, else `Promise.resolve(null)`
   - `isManagerPlus && !isManager` → `getLeadVolumeByDomains([...GIA_DOMAINS], dateRange)`, else `Promise.resolve(null)`
   - `isManagerPlus` → `getBudgetSummary(dateRange.from, dateRange.to)`, else `Promise.resolve(null)` (budget widget seed)
5. `initialData = { ...rpcData, agent_tasks: rpcData.agent_tasks ?? [], agent_activity: rpcData.agent_activity ?? [], campaigns: rpcData.campaigns ?? [], lead_volume: managerVolume, lead_volume_multi: multiVolume, budget_summary }` — for managers, `budget_summary` is pre-filtered to their domain via `filterBudgetRowsByDomain` **before it reaches the client**.
6. `greeting = pickDashboardGreeting()`; `firstName` = first token of `profile.full_name` (also threaded into widgets via `WidgetProps.firstName` — the Elaya card greeting).
7. Render `<DashboardCanvas greeting firstName userId role domain initialData activePreset fromParam toParam dateRange />` inside `<main className="flex-1 p-8">`.

#### `initialData` null-coercion (invariant)

`page.tsx` always coerces `agent_tasks ?? []`, `agent_activity ?? []`, and `campaigns ?? []` before spreading. PostgreSQL's `jsonb_agg()` returns NULL on zero rows; the RPC's `COALESCE(..., '[]')` guards this today, but the page-layer coercion is the authoritative defence — a widget's `seed !== null` guard would otherwise fail on `null` and fire a POST on first load. `lead_status` is exempt (its `jsonb_build_object` wrapper is always an object).

#### Failure behaviour

`getDashboardSummary` **throws** on Supabase RPC error. The page's `try/catch` logs with `[dashboard/page]` prefix and renders **zeroed `initialData`** (`agent_tasks: []`, `agent_activity: []`, `lead_status: { totals: [], byAgent: [] }`, `campaigns: []`, `lead_volume: null`, `lead_volume_multi: null`). **No redirect, no re-throw** — widgets handle empty states gracefully.

#### `initialData` + `dateRange` prop threading

```text
dashboard/page.tsx
  → DashboardCanvas (initialData, activePreset, fromParam, toParam, dateRange)
    → SortableWidget (initialData + dateRange per widget)
      → DashboardWidgetSlot (initialData, dateRange)
        → React.lazy widget (initialData, dateRange)
```

Each widget receives the **full** `DashboardSummary` and the active `dateRange`, and reads its own key.

---

### 6. `DashboardCanvas`

**File:** `src/components/dashboard/DashboardCanvas.tsx`

#### Header row

- `type-page-title` greeting: `{greeting},` + accent `firstName` + `page-title-dot`.
- **`DashboardDateFilter`** sits in the header (top-right) — the dashboard's analogue of the list-page filter bar. Not a full filter strip; widget-only content below.

#### Bento grid

- **12 CSS grid columns** (`.serene-bento-grid`: `grid-template-columns: repeat(12, 1fr)`; `gap: var(--space-4)`).
- **`colSpan: 1`** → `.serene-bento-cell-1` → `grid-column: span 6` (half width on wide screens).
- **`colSpan: 2`** → `.serene-bento-cell-2` → `grid-column: span 12` (full width — used by `manager-campaigns`).
- **Breakpoint `@media (max-width: 820px)`:** both cell classes become `span 12` (full-width stack).

#### dnd-kit

- **`DndContext`** with `closestCenter` collision detection.
- **`SortableContext`** with **`verticalListSortingStrategy`** — reorder is a vertical list order mapped back to bento rows via `reorderWidgets(arrayMove(...))`.
- **Sensors:** `PointerSensor` + `KeyboardSensor` (`sortableKeyboardCoordinates`).
- **Drag enabled only in edit mode** (`useSortable({ disabled: !editMode })`).

#### Edit mode

- Toggle: **"Edit layout"** / **"Done"** (`aria-pressed` when active); accent fill when on.
- When on: dashed **`2px dashed var(--theme-accent)`** overlay per widget; top-right controls — **ResizePopover**, **drag handle** (`GripVertical`), **remove ×** (`var(--color-danger)`).
- **Reset layout** (`RotateCcw`) visible only in edit mode → `resetToDefaults()`.

#### `ResizePopover`

- **Trigger:** compact button showing `WIDGET_SIZE_LABELS[size]` + chevron.
- **Height options:** `sm` | `md` | `lg` | `xl` with pixel hints from `WIDGET_HEIGHT_BY_SIZE`.
- **Width options:** `Half width` (`colSpan: 1`) | `Full width` (`colSpan: 2`).
- **Close:** outside `mousedown`, **Escape**, or after selecting an option (`onResize` → `resizePlacement`).

#### Pre-hydration / skeleton

No full-canvas skeleton gate. `useDashboardLayout` seeds defaults synchronously; widgets mount immediately. Per-widget loading uses `WidgetSkeleton` inside `DashboardWidgetSlot` (`Suspense` + `MinSkeletonBoundary`).

---

### 6b. `DashboardDateFilter`

**File:** `src/components/dashboard/DashboardDateFilter.tsx` — `'use client'`.

- **Trigger:** `Calendar` icon + active label + chevron. Always rendered "active" (a range is always selected). Active label = `${fromParam} → ${toParam}` for custom, else `DATE_PRESET_LABELS[activePreset]`.
- **Preset list:** `today`, `week`, `month`, `last_month` (from `DATE_PRESET_LABELS`). Selecting one calls `router.push` with `dash_preset` set and `dash_from`/`dash_to` cleared (via `buildFilterParams`).
- **Custom range:** two `DatePicker`s (From / To) + Apply. Apply pushes `dash_preset=custom` + `dash_from`/`dash_to` (YYYY-MM-DD via `dateToUrlParam`). Apply disabled until both set and `from < to`.
- **Close:** outside `mousedown` (ignoring clicks inside the portaled `[data-datepicker-panel]`), Escape.
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

#### `MinSkeletonBoundary` (V-08)

- `useEffect` → `setTimeout(..., 150)` before showing lazy children.
- Until ready: `<WidgetSkeleton size={size} />`.
- **Rule V-08:** never show a skeleton for less than 150ms.

#### `size`, `colSpan`, `dateRange`

`size` (container height) and `dateRange` are passed into each lazy widget. `colSpan` is applied on the **sortable grid cell** in `DashboardCanvas`, not inside the slot.

#### `WidgetProps`

```typescript
{
  userId: string;
  role: UserRole;
  domain: AppDomain;
  initialData?: DashboardSummary;
  size?: WidgetSize;
  dateRange?: DateRange;
}
```

---

### 8. `WidgetSkeleton`

**File:** `src/components/dashboard/WidgetSkeleton.tsx`

- Reads `WIDGET_HEIGHT_BY_SIZE[size]` → sets **`minHeight`** on the card (default `size = 'md'`).
- Card chrome: `var(--theme-paper)`, `var(--theme-paper-border)`, `var(--shadow-1)`, `var(--radius-lg)`.
- Shimmer lines use `animation: pulse` with staggered delays on body rows.
- Inner body uses `flex: 1` so filler lines expand inside the min-height shell.

---

### 9. Each Widget — detailed breakdown

#### 9a. `AgentTasksWidget`

| | |
| - | - |
| **File** | `src/components/dashboard/widgets/AgentTasksWidget.tsx` |
| **Registry roles** | `agent`, `manager`, `admin`, `founder` (not agent-only) |
| **`initialData` key** | `agent_tasks` (`DashboardAgentTask[]`) |
| **Mount fetch** | Skipped when `initialData.agent_tasks` present; else `getAgentTasksSummaryAction` in `useEffect` + `startTransition` with `cancelled` flag |

**Renders:** Playfair header "My Tasks."; refresh; scrollable list split **Overdue** / **Active** (`is_overdue`); empty copy *"Nothing on your plate. Enjoy the quiet."*; category legend footer.

**Task categories:** `personal`, `group_subtask`, `gia_followup`.
**Active statuses:** `to_do`, `in_progress`, `in_review` (widget shows status chip for non-`to_do` only).
**Category dot:** keyframe `serene-cat-dot-pulse` — 7px circle, `2.4s ease-in-out`, stagger `0s`/`0.4s`/`0.8s`; colours from `TASK_CATEGORY[cat].dotColor`.
**Priority chip:** only `urgent` and `high` (`normal` → no chip).
**Context label:** italic tertiary after title — lead name (`gia_followup`) or group title (`group_subtask`).
**Sort order (server):** overdue → priority → `due_at`. **Row limit:** 30.
**Links:** `lead_id` → `/leads/{id}`; else `/tasks`.
**Refresh:** `getAgentTasksSummaryAction` — re-verifies `profile.id` server-side (ignores client `userId`). Service is **Redis cache-aside** (`dashboard:agent-tasks:{userId}`, 30s TTL), invalidated by task create/update/lead-task actions.
**Date filter:** does not apply (tasks are always live).

---

#### 9b. `AgentActivityWidget`

| | |
| - | - |
| **File** | `src/components/dashboard/widgets/AgentActivityWidget.tsx` |
| **`initialData` key** | `agent_activity` |

**Role-scoped data:**

| Role | Seed / service scope |
| ---- | -------------------- |
| `admin`, `founder` | All activities |
| `manager` | Activities on leads where `leads.domain = caller domain` |
| `agent` | `actor_id = caller` |

##### Scrollable feed with auto-drift (2026-06-12 rework — replaced the transform ticker)

- Viewport is **natively scrollable** (`overflow-y: auto`, `scrollbarWidth: none`, absolute-inset inside a `flex: 1 / minHeight: 160px` relative wrapper) — the pointer scrolls the list directly, no transform fighting it.
- Auto-drift: rAF loop advances `scrollTop` by `SCROLL_SPEED` (`0.11` px/frame) when not paused; wraps to top at the bottom. Pauses on hidden tab (visibilitychange).
- **Hover pause:** `pausedRef` on mouseenter/leave; touch pauses on touchstart and resumes 1.5s after touchend. **`onScroll` syncs `scrollPosRef` to the user's position so resuming the drift never jumps.**
- **Fade masks:** fixed overlay sibling of the viewport (not inside it), `z-index: 1`, `pointer-events: none`, `linear-gradient` from `var(--theme-paper)` to transparent at 12% / 88%.
- New rows enter via the Framer transform/opacity slide-in (`opacity 0→1, y -6→0`, 180ms) and reset scroll to top so the entrance is visible.
- `defaultSize` is now `lg` (420px) — the taller feed.

##### Realtime

- Table `lead_activities`, event **`INSERT`** only.
- Channel: `` `agent-activity:${userId}:${mountId}` `` (`useId()` suffix for Strict Mode).
- Filter: **admin/founder** — none; **else** (agent **and** manager) — `actor_id=eq.${userId}`.
- **Manager caveat:** initial seed is domain-scoped, but the Realtime subscription filters `actor_id = userId` — live inserts from other agents in the domain do not appear until refresh/RSC.
- New row: prepends, `offsetRef` reset to 0; cap `ACTIVITY_CAP = 25`.
- Cleanup: `supabase.removeChannel(channel)` on unmount.

**`note_added`:** no longer blanket-skipped (2026-06-12 enrich). The paired-note rule (`isPairedNote`/`enrichFeed`) drops only `note_added` rows that have a `call_logged` twin on the same lead within 5s (`PAIRED_NOTE_WINDOW_MS` — the call-note RPC writes both); **standalone dossier notes render** with a FileText icon and a 60-char content excerpt. Same rule on seed, mount fetch, and Realtime insert.

##### Action types rendered (6 + fallback)

| `action_type` | Icon | Label | Subtitle |
| ------------- | ---- | ----- | -------- |
| `call_logged` | `Phone` (`--color-info-text`) | `lead_name` or `"Unknown lead"` | `CALL_OUTCOME_LABELS[outcome]` or `"Call logged"` |
| `status_changed` | `ArrowRight` (`--theme-accent`) | lead name | `{old} → {new}` via `LEAD_STATUS_LABELS` or `"Status changed"` |
| `note_added` (standalone only) | `FileText` (`--theme-text-secondary`) | lead name or `"Lead"` | content excerpt (≤60 chars) or `"Note added"` |
| `lead_created` | `UserPlus` (`--color-success-text`) | lead name or `"New lead"` | `"Entered the system"` |
| `agent_assigned` | `User` (`--theme-text-secondary`) | lead name or `"Lead"` | `"Assigned to you"` |
| `duplicate_submission` | `Copy` (`--color-warning-text`) | lead name or `"Lead"` | `"Duplicate submission"` |
| *(other)* | `ArrowRight` (`--theme-text-tertiary`) | lead name | `action_type` underscores → spaces |

**Subtitle when loaded:** *"Live Lead Activity."* (with page-title-dot).
**Mount fetch:** `getAgentRecentActivityAction` only when seed absent. The service `getAgentRecentActivity` now calls the `get_agent_recent_activity(p_role, p_domain, p_user_id)` RPC (migration 0063) — a single SQL query, replacing the old two-step `SELECT ids FROM leads LIMIT 1000 → .in()` pump.
**Date filter:** does not apply.

---

#### 9c. `ManagerLeadStatusWidget`

| | |
| - | - |
| **Roles** | `manager`, `admin`, `founder` |
| **`initialData` key** | `lead_status` |

**Renders:** five stat chips; up to 6 agents with per-status counts + mini stacked bar; domain tabs for admin/founder (`GIA_DOMAINS` + **All**).

**Semantic colours (`LEAD_STATUS_COLORS`):** per-status `var(--status-*-text)` + `var(--status-*-light)` for new / touched / in_discussion / nurturing / won / lost / junk.

**Refresh:** `getLeadStatusSummaryAction(from?, to?, targetDomain?)` — one action for both the All view (`targetDomain` undefined) and the admin/founder domain tabs (`targetDomain` from `resolveWidgetScope(role, mode)`). Lifecycle via `useWidgetData` (`src/hooks/useWidgetData.ts`): RSC seed skips the mount fetch, the auto-fetch effect covers non-seeded tabs, `refetch` serves tab changes + the refresh button. Service `getLeadStatusSummary` calls the **`get_lead_pipeline_refresh(p_role, p_domain, p_date_from, p_date_to)` RPC** (migration 0064), **Redis cache-aside** (`dashboard:lead-status:{domain}:{from}:{to}`, 60s). Agent totals derived from status mix via `normalizeLeadStatusSummary` (defends against the migration-0070 `SUM` fix + stale Redis).
**Date filter:** applies (cohort by `created_at`).

---

#### 9d. `ManagerLeadVolumeWidget`

| | |
| - | - |
| **File** | `src/components/dashboard/widgets/ManagerLeadVolumeWidget.tsx` |
| **Roles** | `manager`, `admin`, `founder` |
| **`initialData` keys** | `lead_volume` (managers) · `lead_volume_multi` (admin/founder) |
| **`dateRange` prop** | Read directly; falls back to `resolvePresetToRange('week')` if absent |

**Driven by the global date range** — there is **no local period toggle** (the old Today/Week/Month/Quarter pill is gone; range now comes from `DashboardDateFilter`). Bucket granularity is inferred from the range span in the service layer.

**Client refetch on range/domain change:** `getLeadVolumeByDomainsAction(from, to, domains)` (All tab) and `getLeadVolumeForDomainAction(from, to, domain)` (domain tab) behind one `loadVolume(mode)` fetcher + `useWidgetData` (the two actions stay separate because their return shapes differ). Uses `useDashboardCohortSync` to stay aligned with the active cohort. *(The old `getLeadVolumeByRangeAction` was dead — imported, never called — and is deleted.)*

**Admin/founder:** domain picker (`GIA_DOMAINS` + All). `all` mode → multi-line chart (seeded from `lead_volume_multi`); single domain → single line + tab totals (`getLeadVolumeForDomainAction`).

**Chart:** Recharts `LineChart` in `ResponsiveContainer width="100%"` with computed `chartHeight` (min 120px) from `WIDGET_HEIGHT_BY_SIZE[size]` minus chrome. Colours via `useChartTokens()` / `DOMAIN_LINE_COLORS` (resolved with `resolveColorMap`) — no hex in chart props.
**Empty state:** Playfair italic *"No leads in this period."*

---

#### 9e. `ManagerCampaignWidget`

| | |
| - | - |
| **Roles** | `manager`, `admin`, `founder` |
| **`initialData` key** | `campaigns` |
| **`colSpan`** | **2** (full grid width) |

**Renders:** stacked `BarChart` (`src/components/ui/charts/BarChart.tsx`, `colorMap={STATUS_COLORS}`).
**Bar rule:** stacked segments use `topRadiusBar(4)` → `[4, 4, 0, 0]` on the top segment only.
**Chart height:** computed from `WIDGET_HEIGHT_BY_SIZE[size]` minus padding/header/legend/domain row — `Math.max(120, …)`.

**Status fill tokens (`STATUS_COLORS`):** new → `--color-info` · touched → `--theme-accent` · in_discussion → `--color-warning` · nurturing → `--theme-accent-muted` · won → `--color-success` · lost → `--color-danger` · junk → `--theme-text-tertiary`.

**Empty state:** *"Leads with UTM campaign data will appear here."*
**Refresh:** `getLeadsByCampaignAction(from?, to?, targetDomain?)` — one action for All view and domain tabs (`targetDomain` from `resolveWidgetScope`), lifecycle via `useWidgetData`. Service `getLeadsByCampaign` calls **`get_campaign_pipeline_refresh(p_role, p_domain, p_date_from, p_date_to)` RPC** (migration 0064), **Redis cache-aside** (`dashboard:campaigns:{domain}:{from}:{to}`, 120s).
**Date filter:** applies (cohort by `created_at`).

---

#### 9f. `ManagerColdLeadsWidget`

| | |
| - | - |
| **File** | `src/components/dashboard/widgets/ManagerColdLeadsWidget.tsx` |
| **Roles** | `manager`, `admin`, `founder` |
| **`initialData` key** | `cold_leads_count` |
| **`defaultSize`** | `sm` |

**Single data source:** `initialData.cold_leads_count ?? 0`. **No `useEffect` fetch, no server action, no refresh button** — the scalar comes from the `get_dashboard_summary` RPC (migration 0081).

**Renders:** composes **`SnapshotCountWidget`** (the shared base since 2026-06-12) — a `Link` to `/leads?going_cold=true`, large mono count + "Going Cold" label + "leads with no activity in 5+ days" hint. Count colour: `var(--color-warning)` when `> 0`, else `var(--theme-text-secondary)`. Framer `opacity 0→1` entrance.

**Agent role:** RPC returns `cold_leads_count: 0` via the early-return branch; the widget is not in the agent default layout anyway.
**Scoping:** the `/leads` link carries no `&domain=` param — the leads service enforces role/domain scoping server-side.
**Date filter:** does not apply (going-cold is a live state).

---

#### 9g. `AgentPendingCallsWidget` / 9h. `AgentNewLeadsWidget` (2026-06-12)

| | `agent-pending-calls` | `agent-new-leads` |
| - | - | - |
| **`initialData` key** | `pending_calls_count` | `new_leads_count` |
| **Meaning** | open `gia_followup` tasks assigned to the agent (non-terminal) | own non-archived leads at `status='new'` |
| **Link** | `/tasks?tab=gia` | `/leads?status=new` |
| **Positive colour** | `--color-info-text` | `--color-success-text` |

Both compose `SnapshotCountWidget` (`src/components/dashboard/widgets/SnapshotCountWidget.tsx` — THE big-count/label/hint/Link card; any new snapshot count composes it, never a fork). Roles: `agent` only. **No fetch, no refresh, no date wiring — by construction a date param cannot reach them** (the RPC counts take zero date inputs; failure mode #1 of the redesign brief).

---

#### 9i. `ElayaPresenceCard` (2026-06-12)

| | |
| - | - |
| **File** | `src/components/dashboard/widgets/ElayaPresenceCard.tsx` |
| **Roles** | `agent` (default layout right column, index 1) |
| **Data** | none — no fetch, no AI call on login |

The reserved home for the future Elaya layer; ships as a shell. Renders: breathing `LiaGlyph` (28px, `--theme-accent` — a static glyph = not present, never pass `breathing={false}` here) + "Elaya" micro-label; IST time-of-day greeting (`getElayaTimeGreeting` — morning/afternoon/evening) with `firstName` from `WidgetProps`; one curated line per agent per IST day (`pickElayaDailyLine` — `hashString(userId:istDay) % lines.length`, content in `src/lib/constants/elaya.ts`); a **disabled `MessageBar`** (`variant="nested"`, placeholder "Elaya is on her way…") as her future conversation seat. **No three.js / 3D** — that lazy-loads post-Elaya-ship. Reading the clock in-component is safe: `MinSkeletonBoundary` mounts widgets client-side only.

---

#### 9j. `ManagerBudgetWidget` (2026-06-12)

| | |
| - | - |
| **File** | `src/components/dashboard/widgets/ManagerBudgetWidget.tsx` |
| **Roles** | `manager`, `admin`, `founder` |
| **`initialData` key** | `budget_summary` (page-assembled — NOT in the RPC; spend lives in `ad_spend_daily`) |
| **Refresh** | `getBudgetSummaryWidgetAction(from, to)` — manager pinned via `effectiveWidgetDomain()` |

Reuses the `/budget` pipeline: `getBudgetSummary` (ad-spend-service) seeds via the page `Promise.all`; manager rows are filtered to their domain server-side with `filterBudgetRowsByDomain` (campaign-prefix → domain via `resolveDomainFromCampaign` — `ad_spend_daily` has no domain column). Renders four `StatTile variant="cell"` aggregates — Spend, Leads, Cost/Lead, Deal Revenue (CPL renders "—" at zero leads, never ₹0) — plus a campaign-count footer ("· your domain" for managers). Lifecycle: `useWidgetData` + `useDashboardCohortSync`. **Date filter applies** (cohort data, like campaigns). Empty state: italic *"No ad spend recorded in this period."*

---

### 10. Server Actions — `dashboard.ts`

All return `{ data, error }`. All guard via `requireProfile()` first — **client-supplied `role` / `domain` / `userId` are never trusted** for authorization. Date params validated via Zod (`WidgetScopeSchema` / `VolumeScopeSchema` / `DomainsVolumeSchema` — collapsed from six near-identical schemas in dry-audit H-5) — inverted ranges rejected; managers are locked to `profile.domain` regardless of the requested domain via the single `effectiveWidgetDomain()` helper.

| Action | Service / RPC | Role guard | Return shape |
| ------ | ------------- | ---------- | ------------ |
| `getAgentTasksSummaryAction(_agentId)` | `getAgentTasksSummary(profile.id)` | Authenticated | `{ data: DashboardAgentTask[] \| null, error }` |
| `getAgentRecentActivityAction(_agentId)` | `getAgentRecentActivity(profile.id, profile.role, profile.domain)` | Authenticated | `{ data: AgentActivity[] \| null, error }` |
| `getLeadStatusSummaryAction(from?, to?, targetDomain?)` | `getLeadStatusSummary(role, domain, effectiveDomain?, range?)` | manager+ | `{ data: LeadStatusSummary \| null, error }` |
| `getLeadsByCampaignAction(from?, to?, targetDomain?)` | `getLeadsByCampaign(role, domain, effectiveDomain?, range?)` | manager+ | `{ data: CampaignStatusMix[] \| null, error }` |
| `getLeadVolumeByDomainsAction(from, to, domains)` | `getLeadVolumeByDomains(domains, range)` | manager+ | `{ data: MultiDomainVolumeSummary \| null, error }` |
| `getLeadVolumeForDomainAction(from, to, targetDomain)` | `getLeadVolumeForDomain(effectiveDomain, range)` | manager+ | `{ data: LeadVolumeSummary \| null, error }` |
| `getBudgetSummaryWidgetAction(from, to, targetDomain?)` | `getBudgetSummary(from, to)` + `filterBudgetRowsByDomain` (ad-spend-service) | manager+ (manager always pinned to own domain) | `{ data: BudgetCampaignRow[] \| null, error }` |

`targetDomain` omitted → role-scoped summary ("All" view). `targetDomain` set → single-domain drill-down. The status/campaign `*ForDomainAction` twins and the dead `getLeadVolumeByRangeAction` were removed (dry-audit H-5, 2026-06-11). The volume pair stays two actions deliberately — different return shapes.

The file also re-exports `resolvePresetToRange` for client components.

---

### 11. Realtime Integration

#### Dashboard widget (`AgentActivityWidget`)

| | |
| - | - |
| **Table** | `lead_activities` |
| **Event** | `INSERT` only |
| **Filter** | None for `admin`/`founder`; `actor_id=eq.{userId}` for `agent` and `manager` (see §9b) |
| **Channel** | `` `agent-activity:${userId}:${mountId}` `` (`useId()` suffix) |
| **Teardown** | `supabase.removeChannel(channel)` — never `unsubscribe()` alone |

`ManagerColdLeadsWidget` has **no** Realtime subscription — its count is RPC-seeded and static until the next RSC render.

#### Sound notification (not on activity widget)

The dashboard activity ticker **does not** play audio. Sound is owned by the **notifications** pipeline:

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
| `agent-tasks` | `agent`, `manager`, `admin`, `founder` | `DEFAULT_LAYOUT_BY_ROLE` + registry `roles`; tasks RPC filters `assigned_to = p_user_id` |
| `agent-activity` | same | Layout + registry; RPC role CTE; Realtime filter per §9b |
| `manager-lead-status` | `manager`, `admin`, `founder` | Layout + registry; omitted for `agent`; server actions require manager+ |
| `manager-lead-volume` | `manager`, `admin`, `founder` | Layout + registry; volume service filters manager domain |
| `manager-campaigns` | `manager`, `admin`, `founder` | Layout + registry; RPC domain gate |
| `manager-cold-leads` | `manager`, `admin`, `founder` | Layout + registry; RPC `cold_leads_count` scoped (manager domain / admin all); agent branch returns 0 |
| `agent-pending-calls` / `agent-new-leads` | `agent` | Layout + registry; RPC counts filter `assigned_to = p_user_id`; manager+ branch returns 0 |
| `elaya-presence` | `agent` | Layout + registry only — no data surface |
| `manager-budget` | `manager`, `admin`, `founder` | Layout + registry; page/action filter manager rows to own domain (`effectiveWidgetDomain` + `filterBudgetRowsByDomain`) |

**Guest:** empty default layout. **Login gate:** page redirects unauthenticated users to `/login`.

---

### 13. Known Invariants (must never be violated)

1. **RSC rule (perf-01):** Summary widgets must not POST on initial load. `AgentTasksWidget`, `AgentActivityWidget`, `ManagerLeadStatusWidget`, `ManagerCampaignWidget` skip mount fetch when `initialData` is present; refresh buttons still call server actions. `ManagerLeadVolumeWidget` refetches on range/domain change. `ManagerColdLeadsWidget` never fetches.
2. **Dashboard summary data is RSC + cached.** Do not split `getDashboardSummary` back into individual server action calls for summary data.
3. **PRIMARY ENTRY POINT:** `getDashboardSummary()` — single cached RPC, all summary widgets (+ `cold_leads_count`).
4. **Uses React `cache()` (not `unstable_cache`)** because `createClient()` reads `cookies()`, forbidden inside `unstable_cache` closures.
5. **Individual service functions are NOT used for initial page load** (except the two volume seeders) — refresh buttons / client range changes only.
6. **All dashboard data goes through `src/lib/services/dashboard-service.ts` — never `leads-service.ts`.**
7. **All client-side fetches go through server actions in `src/lib/actions/dashboard.ts`.**
8. **Server actions always call `getCurrentProfile()` and use the verified profile** — never trust client-supplied role/domain/userId.
9. **Widgets receive `userId`, `role`, `domain`, `dateRange` as props** — but server actions re-verify via `getCurrentProfile()`.
10. **`DashboardWidgetSlot` uses a static map of `React.lazy()` calls.** Never `require()` from a string. Never compute the import path dynamically.
11. **Widget registry `id` is a stable localStorage key — NEVER rename after shipping.**
12. **`sanitizeStored()` validates each stored `widgetId` against the registry AND the caller's role.** Unrecognised or role-disallowed ids are silently dropped.
13. **`DashboardCanvas` no longer gates on `isHydrated`. Do not add that gate back.**
14. **The hook initialises `stored` synchronously with `DEFAULT_LAYOUT_BY_ROLE[role]`** so widgets render immediately with correct defaults.
15. **Realtime teardown:** `supabase.removeChannel(channel)` — never `channel.unsubscribe()` alone. Channel name `` `agent-activity:${userId}:${mountId}` `` — `useId()` mount suffix required.
16. **Min skeleton:** never show a skeleton for less than **150ms** (V-08) — enforced by `MinSkeletonBoundary`.
17. **Initial data fetch in a widget (when no `initialData`) must live in `useEffect`,** never as a render-phase guard — use `startTransition` + `cancelled` flag where applicable.
18. **`initialData` null-coercion:** page always coerces `agent_tasks ?? []`, `agent_activity ?? []`, `campaigns ?? []` before spreading. A widget's `seed !== null` guard would otherwise fire a POST on first load.
19. **Page never throws/redirects on RPC failure** — `try/catch` renders zeroed `initialData` with a `[dashboard/page]` log.
20. **GRANT after every `CREATE OR REPLACE`** of `get_dashboard_summary` — `CREATE OR REPLACE` silently drops the GRANT.
21. **Date filter scopes by `leads.created_at` (cohort/intake), never `status_changed_at`** — and applies only to `lead_status` + `campaigns` (+ the volume series and `budget_summary`). `agent_tasks`, `agent_activity`, `cold_leads_count`, `pending_calls_count`, `new_leads_count` are always live — **the snapshot counts take zero date inputs anywhere in the chain; wiring them to the URL date param is conceptually invalid.**
22. **`cold_leads_count` 5-day threshold mirrors `COLD_LEAD_THRESHOLD_DAYS`** in `src/lib/constants/leads.ts` — change both in the same commit.
23. **Snapshot count cards compose `SnapshotCountWidget`** — never fork the big-count/label/hint/Link card.
24. **Layout storage version (`useDashboardLayout` `STORAGE_VERSION`, currently `v2`) must be bumped whenever the default grid changes shape** — stale persisted layouts must be orphaned, never reconciled against a new grid.
25. **The Elaya card makes no model call and loads no 3D** until the Elaya layer ships — greeting + curated line are deterministic and local.

---

### 14. Motion constants (`src/lib/constants/motion.ts`)

Dashboard widgets mostly use inline durations or Framer defaults; `ManagerColdLeadsWidget` imports `EXIT_DURATION` + `EASE_OUT_EXPO`. `TabSelector` (volume/status domain pickers) uses `SPRING_CONFIG` / `ENTER_DURATION` internally. `DashboardDateFilter` uses `DROPDOWN_VARIANTS`.

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
| `20260603000063_get_agent_recent_activity.sql` | `get_agent_recent_activity` RPC (single-query activity) |
| `20260603000064_dashboard_refresh_rpcs.sql` | `get_lead_pipeline_refresh` + `get_campaign_pipeline_refresh` |
| `20260604000069_dashboard_date_filter.sql` | 6-param; date filter on all three RPCs |
| `20260604000070_fix_pipeline_agent_total.sql` | `COUNT(*)` → `SUM(cnt)` totals fix |
| `20260606000081_dashboard_cold_leads.sql` | `cold_leads_count` key (regressed the 0070 SUM totals — fixed in 0115) |
| `20260612000115_dashboard_agent_snapshot_counts.sql` | `pending_calls_count` + `new_leads_count` keys; SUM(cnt) totals restored — **canonical current `get_dashboard_summary`** |

---

*End of document.*
