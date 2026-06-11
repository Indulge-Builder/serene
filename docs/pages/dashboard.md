# Dashboard — Page Spec

> **Purpose:** spec for `/dashboard` — the personalised bento-grid home surface.
> **Audience:** engineers. · **Source-of-truth scope:** this route's behaviour, data flow, components, invariants. Widget queries live in `dashboard-service.ts` (home: this doc); shell/theming live in `../architecture/overview.md`.
> **Last verified:** 2026-06-09 full pass; 2026-06-11 restructure (H-5 action consolidation reflected).

## 1. Purpose

Eia's home surface: a personalised bento grid of Gia widgets. Each widget is an independently
code-split client component. Summary data arrives on first paint via one server-side
`get_dashboard_summary` RPC (React `cache()`); a global URL-param date filter
(`DashboardDateFilter`) scopes pipeline/campaign/volume to a cohort window
(by `leads.created_at`, IST — Decision Log 2026-06-04). Widgets share no mutable state.

## 2. Who sees it

| Role | Widgets in default layout | Data scope |
| ---- | ------------------------- | ---------- |
| `agent` | `agent-tasks`, `agent-activity` | own tasks + own activity; date filter does not apply |
| `manager` | all six | domain-scoped leads/status/campaigns/volume/cold-leads; tasks still own |
| `admin` / `founder` | all six | cross-domain + domain picker tabs on manager widgets |
| `guest` | none (`DEFAULT_LAYOUT_BY_ROLE.guest = []`) | — |

Route guards: dashboard layout session gate; `/dashboard` is in `ALWAYS_ALLOWED_PREFIXES`.
Per-widget enforcement table: Deep dive §12.

## 3. Data sources

| Layer | File | Notes |
| ----- | ---- | ----- |
| RPC | `get_dashboard_summary` (0029/0062/0069) | single jsonb, all summary widgets + `cold_leads_count` |
| Service | `src/lib/services/dashboard-service.ts` | `getDashboardSummary` (React `cache()`), `getLeadVolumeByPeriod`; Redis cache-aside per `../architecture/caching.md` |
| Actions | `src/lib/actions/dashboard.ts` | 6 widget-refresh actions, all via `requireProfile()`; manager pinned via `effectiveWidgetDomain()` |
| Hooks | `useDashboardLayout`, `useWidgetData`, `useDashboardCohortSync`, `resolveWidgetScope` | layout persistence, fetch lifecycle, cohort URL sync, scope decision |

## 4. Components

`page.tsx` (RSC orchestrator) · `DashboardCanvas` · `DashboardWidgetSlot` (static `React.lazy` map) ·
`WidgetSkeleton` · `DashboardDateFilter` · widgets: `AgentTasksWidget`, `AgentActivityWidget`,
`ManagerLeadStatusWidget`, `ManagerLeadVolumeWidget`, `ManagerCampaignWidget`,
`ManagerColdLeadsWidget`. Registry: `src/lib/constants/dashboard-widgets.ts` (pure data).

## 5. States

- **Loading:** `loading.tsx` composes `PageSkeletons` + a bespoke bento skeleton; per-widget `WidgetSkeleton` behind `MinSkeletonBoundary` (≥150 ms, V-08).
- **Empty:** each widget renders its own `<EmptyState>` (Playfair italic, V-09) on zero data.
- **Error:** page never throws/redirects on RPC failure — renders zeroed `initialData` with a `[dashboard/page]` log; widget refresh errors surface via toast.

## 6. Invariants

The 22 must-never-be-violated rules are maintained in Deep dive §13 (RSC no-POST-on-load rule,
React `cache()` not `unstable_cache`, stable widget ids, GRANT after `CREATE OR REPLACE`,
cohort-date semantics, …). Read them before touching any widget.

## 7. Open items

None recorded.

---

## 8. Deep dive

### 2. Data Model

#### 2a. `get_dashboard_summary` RPC

**Canonical definition (latest):** `supabase/migrations/20260606000081_dashboard_cold_leads.sql`
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
| `20260606000081_dashboard_cold_leads.sql` | Adds 5th return key `cold_leads_count` (scalar int); **canonical current definition** |

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

**Date filter:** `p_date_from`/`p_date_to` apply `created_at >= p_date_from AND created_at < p_date_to` to the `lead_status` and `campaigns` CTEs **only**. `agent_tasks`, `agent_activity`, and `cold_leads_count` ignore the range. Filtering is on `leads.created_at` (intake/cohort date), **never** `status_changed_at`. NULL params → all-time (backwards compatible).

**Top-level return:** single `jsonb` object with **five keys**:

| Key | Type in RPC | Consumed by widget |
| --- | ----------- | ------------------ |
| `agent_tasks` | `jsonb` **array** of task objects | `AgentTasksWidget` → `initialData.agent_tasks` |
| `agent_activity` | `jsonb` array of activity objects | `AgentActivityWidget` → `initialData.agent_activity` |
| `lead_status` | `jsonb` object `{ totals, byAgent }` | `ManagerLeadStatusWidget` → `initialData.lead_status` |
| `campaigns` | `jsonb` array of campaign objects | `ManagerCampaignWidget` → `initialData.campaigns` |
| `cold_leads_count` | `jsonb` **scalar int** | `ManagerColdLeadsWidget` → `initialData.cold_leads_count` |

(Volume — `lead_volume` / `lead_volume_multi` — is intentionally **excluded** from the RPC; see §2c.)

**Agent role branch:** when `p_role = 'agent'`, the RPC computes only `agent_tasks` + `agent_activity`, then returns immediately with empty stubs for `lead_status` (`{ totals: [], byAgent: [] }`), `campaigns` (`[]`), and `cold_leads_count` (`0`). No pipeline/campaign/cold-leads DB work runs for agents.

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

#### All six widget entries

| `id` | `label` | `roles` | `domains` | `defaultSize` | `colSpan` | `module` |
| ---- | ------- | ------- | --------- | ------------- | --------- | -------- |
| `agent-tasks` | My Tasks | `agent`, `manager`, `admin`, `founder` | `*` | `md` | `1` | `gia` |
| `agent-activity` | Recent Activity | `agent`, `manager`, `admin`, `founder` | `*` | `md` | `1` | `gia` |
| `manager-lead-status` | Lead Pipeline | `manager`, `admin`, `founder` | `*` | `lg` | `1` | `gia` |
| `manager-lead-volume` | Lead Volume | `manager`, `admin`, `founder` | `*` | `lg` | `1` | `gia` |
| `manager-campaigns` | Campaign Performance | `manager`, `admin`, `founder` | `*` | `xl` | `2` | `gia` |
| `manager-cold-leads` | Going Cold | `manager`, `admin`, `founder` | `*` | `sm` | `1` | `gia` |

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
| `founder` | `agent-tasks`, `agent-activity`, `manager-lead-status`, `manager-lead-volume`, `manager-campaigns`, `manager-cold-leads` |
| `admin` | Same as founder |
| `manager` | Same as founder |
| `agent` | `agent-tasks`, `agent-activity` |
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
eia:dashboard:layout:${userId}:v1
```

(`STORAGE_KEY_PREFIX` + `:` + `userId` + `:` + `STORAGE_VERSION` where version is `v1`.)

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
5. `initialData = { ...rpcData, agent_tasks: rpcData.agent_tasks ?? [], agent_activity: rpcData.agent_activity ?? [], campaigns: rpcData.campaigns ?? [], lead_volume: managerVolume, lead_volume_multi: multiVolume }`.
6. `greeting = pickDashboardGreeting()`; `firstName` = first token of `profile.full_name`.
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

- **12 CSS grid columns** (`.eia-bento-grid`: `grid-template-columns: repeat(12, 1fr)`; `gap: var(--space-4)`).
- **`colSpan: 1`** → `.eia-bento-cell-1` → `grid-column: span 6` (half width on wide screens).
- **`colSpan: 2`** → `.eia-bento-cell-2` → `grid-column: span 12` (full width — used by `manager-campaigns`).
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
**Category dot:** keyframe `eia-cat-dot-pulse` — 7px circle, `2.4s ease-in-out`, stagger `0s`/`0.4s`/`0.8s`; colours from `TASK_CATEGORY[cat].dotColor`.
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

##### Auto-scrolling ticker

- Loop driver: `setTimeout(tick, 16)` (~60fps).
- Speed: `0.11` px/frame (`SCROLL_SPEED`). Transform: `translateY(offset)` with `willChange: transform`.
- **Hover pause:** `pausedRef`. **Wrap:** when `offset < -maxScroll`, reset `offsetRef` to `0`.
- Viewport: `flex: 1`, `minHeight: 160px`. `ROW_HEIGHT = 48`.
- **Fade masks:** absolute overlay, `z-index: 1`, `pointer-events: none`, `linear-gradient` from `var(--theme-paper)` to transparent at 18% / 82%.

##### Realtime

- Table `lead_activities`, event **`INSERT`** only.
- Channel: `` `agent-activity:${userId}:${mountId}` `` (`useId()` suffix for Strict Mode).
- Filter: **admin/founder** — none; **else** (agent **and** manager) — `actor_id=eq.${userId}`.
- **Manager caveat:** initial seed is domain-scoped, but the Realtime subscription filters `actor_id = userId` — live inserts from other agents in the domain do not appear until refresh/RSC.
- New row: prepends, `offsetRef` reset to 0; cap `ACTIVITY_CAP = 25`.
- Cleanup: `supabase.removeChannel(channel)` on unmount.

**`note_added`:** in `SKIP_TYPES` — filtered on seed, mount fetch, and Realtime (always paired with `call_logged`).

##### Action types rendered (5 + fallback)

| `action_type` | Icon | Label | Subtitle |
| ------------- | ---- | ----- | -------- |
| `call_logged` | `Phone` (`--color-info-text`) | `lead_name` or `"Unknown lead"` | `CALL_OUTCOME_LABELS[outcome]` or `"Call logged"` |
| `status_changed` | `ArrowRight` (`--theme-accent`) | lead name | `{old} → {new}` via `LEAD_STATUS_LABELS` or `"Status changed"` |
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

**Renders:** a `Link` to `/leads?going_cold=true`. Large mono count + "Going Cold" label + "leads with no activity in 5+ days" hint. Count colour: `var(--color-warning)` when `> 0`, else `var(--theme-text-secondary)`. Hover swaps card bg to `var(--theme-paper-hover)`. Framer `opacity 0→1` entrance.

**Agent role:** RPC returns `cold_leads_count: 0` via the early-return branch; the widget is not in the agent default layout anyway.
**Scoping:** the `/leads` link carries no `&domain=` param — the leads service enforces role/domain scoping server-side.
**Date filter:** does not apply (going-cold is a live state).

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
| **localStorage** | `eia:notifications:sound:v1` — default `true` when absent |

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
21. **Date filter scopes by `leads.created_at` (cohort/intake), never `status_changed_at`** — and applies only to `lead_status` + `campaigns` (+ the volume series). `agent_tasks`, `agent_activity`, `cold_leads_count` are always live.
22. **`cold_leads_count` 5-day threshold mirrors `COLD_LEAD_THRESHOLD_DAYS`** in `src/lib/constants/leads.ts` — change both in the same commit.

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
| `20260606000081_dashboard_cold_leads.sql` | `cold_leads_count` key — **canonical current `get_dashboard_summary`** |

---

*End of document.*
