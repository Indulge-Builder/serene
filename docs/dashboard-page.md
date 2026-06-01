# Dashboard Page — Full Intelligence Document

Last verified: 2026-06-01

## 1. Module Overview

The dashboard (`/dashboard`) is Eia’s home surface: a personalised bento grid of Gia widgets. Each widget is an independently code-split client component. Summary data arrives on first paint via one server-side `get_dashboard_summary` RPC (React `cache()`), plus a separate `getLeadVolumeByPeriod('week')` call merged into `initialData.lead_volume`. Widgets do not share mutable state with each other.

### Who sees what (by role)

| Role | Widgets in default layout | Data scope |
| ---- | ------------------------- | ---------- |
| `agent` | `agent-tasks`, `agent-activity` | Own tasks (`assigned_to = caller`); own activity (`actor_id = caller`) |
| `manager` | All five widgets | Domain-scoped leads/status/campaigns/volume; activity on leads in `profiles.domain`; tasks still assigned to self |
| `admin`, `founder` | All five widgets | Cross-domain summary widgets; domain picker tabs on manager widgets; activity = all `lead_activities` |
| `guest` | None (`DEFAULT_LAYOUT_BY_ROLE.guest` = `[]`) | Not the dashboard audience |

### Route

| Route | File |
| ----- | ---- |
| `/dashboard` | `src/app/(dashboard)/dashboard/page.tsx` |

---

## 2. Data Model

### 2a. `get_dashboard_summary` RPC

**Canonical definition (latest):** `supabase/migrations/20260531000050_dashboard_activity_role_scoped.sql`  
**Prior revisions:** `20260529000029_get_dashboard_summary.sql` (initial), `20260530000043_fix_dashboard_summary_domain_type.sql` (`p_domain` → `app_domain`), `20260531000047_dashboard_agent_tasks_all_categories.sql` (tasks CTE), `20260531000048_dashboard_activity_limit_25.sql` (activity LIMIT 25).

**Signature (exact, as in migration):**

```sql
CREATE OR REPLACE FUNCTION get_dashboard_summary(
  p_role    text,
  p_domain  app_domain,
  p_user_id uuid
)
RETURNS jsonb
```

**GRANT:**

```sql
GRANT EXECUTE ON FUNCTION get_dashboard_summary(text, app_domain, uuid) TO authenticated;
```

**SECURITY:** `SECURITY DEFINER SET search_path = public` — RLS does not fire; role/domain/user scoping is enforced inside the function body via `p_role`, `p_domain`, and `p_user_id`.

**Top-level return:** single `jsonb` object with **four keys** (volume is intentionally excluded):

| Key | Type in RPC | Consumed by widget |
| --- | ----------- | ------------------ |
| `agent_tasks` | `jsonb` **array** of task objects | `AgentTasksWidget` → `initialData.agent_tasks` |
| `agent_activity` | `jsonb` array of activity objects | `AgentActivityWidget` → `initialData.agent_activity` |
| `lead_status` | `jsonb` object `{ totals, byAgent }` | `ManagerLeadStatusWidget` → `initialData.lead_status` |
| `campaigns` | `jsonb` array of campaign objects | `ManagerCampaignWidget` → `initialData.campaigns` |

#### `agent_tasks` element shape

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

**CTE behaviour:** `tasks` where `assigned_to = p_user_id` and `status IN ('to_do','in_progress','in_review')`. LEFT JOINs: `task_gia_meta` + `leads` for `gia_followup` context; `task_groups` for `group_subtask` context. ORDER: overdue first → priority (`urgent`→`high`→`normal`) → `due_at ASC NULLS LAST`. **LIMIT 30.**

#### `agent_activity` element shape

```json
{
  "id": "uuid",
  "action_type": "string",
  "details": "jsonb | null",
  "created_at": "timestamptz",
  "lead_id": "uuid | null",
  "lead_name": "string | null"
}
```

**CTE behaviour (role-scoped — migration 050):**

| `p_role` | WHERE clause |
| -------- | ------------ |
| `admin`, `founder` | `true` (all rows in `lead_activities`) |
| `manager` | `l.domain = p_domain` (join `leads l` on `la.lead_id`) |
| `agent` (else) | `la.actor_id = p_user_id` |

**LIMIT 25.** (`note_added` is stripped in the client — see §9b.)

#### `lead_status` shape

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

**CTE behaviour:** active leads (`archived_at IS NULL`). **manager:** `l.domain = p_domain`. **admin/founder:** no domain filter. Status order in `totals`: new → touched → in_discussion → nurturing → won → lost → junk. `byAgent` ordered by `total DESC`.

#### `campaigns` element shape

```json
{
  "campaign": "string",
  "total": <int>,
  "mix": { "<status>": <int>, ... }
}
```

**CTE behaviour:** `utm_campaign IS NOT NULL`, not archived. **manager:** `domain = p_domain`. **admin/founder:** all domains. Top **12** campaigns by `total DESC`.

#### Why React `cache()` instead of `unstable_cache`

From **Decision Log (perf-01)** in `docs/The_Blueprint.md` (2026-05-29):

> Dashboard summary collapsed to a single cached RSC fetch (perf-01). … `unstable_cache` not viable — `createClient()` calls `cookies()`, which Next.js forbids inside `unstable_cache` closures.

`getDashboardSummary` in `src/lib/services/dashboard-service.ts` wraps the RPC with `cache()` from `'react'`. That deduplicates within a single RSC render pass (per-request memoisation) and does not block dynamic data sources. On RPC error the service **`throw error`** (not swallowed).

---

### 2b. `DashboardSummary` type

**File:** `src/lib/types/index.ts`

**Assembled on the page:** RPC result spread + `lead_volume` from `getLeadVolumeByPeriod(role, domain, 'week')`.

```typescript
export type DashboardAgentTask = {
  id:            string;
  title:         string;
  task_category: 'personal' | 'group_subtask' | 'gia_followup';
  task_type:     string;
  priority:      'urgent' | 'high' | 'normal';
  status:        'to_do' | 'in_progress' | 'in_review';
  due_at:        string | null;
  is_overdue:    boolean;
  context_label: string | null;
  lead_id:       string | null;
};

export type DashboardAgentActivity = {
  id:          string;
  action_type: string;
  details:     Record<string, unknown> | null;
  created_at:  string;
  lead_id:     string | null;
  lead_name:   string | null;
};

export type DashboardLeadStatusCount = {
  status: LeadStatus;
  count:  number;
};

export type DashboardAgentStatusBreakdown = {
  agent_id:   string;
  agent_name: string;
  counts:     Partial<Record<LeadStatus, number>>;
  total:      number;
};

export type DashboardLeadStatusSummary = {
  totals:  DashboardLeadStatusCount[];
  byAgent: DashboardAgentStatusBreakdown[];
};

export type DashboardCampaignStatusMix = {
  campaign: string;
  total:    number;
  mix:      Partial<Record<LeadStatus, number>>;
};

export type DashboardVolumeDataPoint = {
  label: string;
  count: number;
};

export type DashboardLeadVolumeSummary = {
  total:  number;
  series: DashboardVolumeDataPoint[];
};

export type DashboardSummary = {
  agent_tasks:    DashboardAgentTask[];
  agent_activity: DashboardAgentActivity[];
  lead_status:    DashboardLeadStatusSummary;
  campaigns:      DashboardCampaignStatusMix[];
  lead_volume:    DashboardLeadVolumeSummary;
};
```

(`LeadStatus` is imported from `src/lib/types/database.ts`.)

---

### 2c. Volume data — `getLeadVolumeByPeriod`

**Why excluded from RPC:** Time-bucketing depends on the selected period (`today` | `week` | `month` | `quarter`). The RPC is a fixed snapshot; volume needs per-period bucket boundaries computed in TypeScript (`getPeriodBounds` in `dashboard-service.ts`). Comment in `src/lib/types/index.ts`: *"lead_volume is NOT in the RPC — time-bucketing is too period-dependent."*

**Returns:** `LeadVolumeSummary` — `{ total: number, series: VolumeDataPoint[] }` where each point has `label` (IST-formatted bucket) and `count`.

**Where called:**

| Call site | Period | Purpose |
| --------- | ------ | ------- |
| `dashboard/page.tsx` | `'week'` | Seeds `initialData.lead_volume` for **managers** on first paint |
| `getLeadVolumeByPeriodAction` | Client-selected | `ManagerLeadVolumeWidget` period toggle + manager mount fallback |
| `getLeadVolumeByDomainsAction` | Client-selected | Admin/founder multi-line “All domains” mode |
| `getLeadVolumeForDomainAction` | Client-selected | Admin/founder single-domain tab |

**Manager scope:** `.eq('domain', domain)` when `role === 'manager'`. Admin/founder single-domain drill-down uses `getLeadVolumeByPeriod('manager', effectiveDomain, period)` so domain filter always applies.

---

## 3. Widget Registry — `dashboard-widgets.ts`

**File:** `src/lib/constants/dashboard-widgets.ts`

### All five widget entries

| `id` | `label` | `roles` | `domains` | `defaultSize` | `colSpan` | `module` |
| ---- | ------- | ------- | ----------- | ------------- | --------- | -------- |
| `agent-tasks` | My Tasks | `agent`, `manager`, `admin`, `founder` | `*` | `md` | `1` | `gia` |
| `agent-activity` | Recent Activity | `agent`, `manager`, `admin`, `founder` | `*` | `md` | `1` | `gia` |
| `manager-lead-status` | Lead Pipeline | `manager`, `admin`, `founder` | `*` | `lg` | `1` | `gia` |
| `manager-lead-volume` | Lead Volume | `manager`, `admin`, `founder` | `*` | `lg` | `1` | `gia` |
| `manager-campaigns` | Campaign Performance | `manager`, `admin`, `founder` | `*` | `xl` | `2` | `gia` |

### `WIDGET_HEIGHT_BY_SIZE` (shared by widgets + `WidgetSkeleton`)

| Size | Height |
| ---- | ------ |
| `sm` | `200px` |
| `md` | `300px` |
| `lg` | `420px` |
| `xl` | `540px` |

### `DEFAULT_LAYOUT_BY_ROLE`

| Role | Ordered widget ids |
| ---- | ------------------ |
| `founder` | `agent-tasks`, `agent-activity`, `manager-lead-status`, `manager-lead-volume`, `manager-campaigns` |
| `admin` | Same as founder |
| `manager` | Same as founder |
| `agent` | `agent-tasks`, `agent-activity` |
| `guest` | `[]` |

Initial grid positions are derived in `useDashboardLayout.getDefaults()`: `col = index % 2`, `row = floor(index / 2)`, `size` and `colSpan` from `WIDGET_MAP[id]`.

### `WIDGET_MAP` and `isValidWidgetId`

- `WIDGET_MAP`: `Record<string, WidgetDefinition>` built from `DASHBOARD_WIDGETS` — O(1) lookup for labels, defaults, and validation.
- `isValidWidgetId(id)`: returns `id in WIDGET_MAP`. Used when reading `localStorage` and when adding/reordering widgets so **stale or renamed ids never enter the layout**.

---

## 4. `useDashboardLayout` Hook

**File:** `src/hooks/useDashboardLayout.ts`

### localStorage key

Exact format:

```text
eia:dashboard:layout:${userId}:v1
```

(`STORAGE_KEY_PREFIX` + `:` + `userId` + `:` + `STORAGE_VERSION` where version is `v1`.)

### Stored shape

```typescript
{
  placements: WidgetPlacement[]  // { widgetId, col, row, size, colSpan }[]
}
```

### Hydration behaviour

1. **First render:** `useState(() => getDefaults(role))` — synchronous defaults from `DEFAULT_LAYOUT_BY_ROLE` so widgets appear immediately (no empty canvas).
2. **After mount:** `useEffect` reads `localStorage` via `readFromStorage()` → `sanitizeStored()` → compares JSON to current state; **`setStored` only if different** — avoids unmount/remount when stored layout matches defaults.
3. **`isHydrated`:** set `true` after the effect runs. Exposed for consumers that need to know persistence has settled; **`DashboardCanvas` does not gate rendering on it** (do not re-add a hydration gate).

### Returned operations

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

### Validation on load

`sanitizeStored()` inside `readFromStorage()`:

- Invalid root → role defaults.
- Each placement: `widgetId` must pass `isValidWidgetId()` or **silently dropped**.
- `size` must be `sm`|`md`|`lg`|`xl` else `'md'`.
- `colSpan` must be `1`|`2` else falls back to `WIDGET_MAP[widgetId].colSpan ?? 1`.

---

## 5. Page Component — `dashboard/page.tsx`

### Server flow

1. `getCurrentProfile()` — if null → `redirect('/login')`.
2. `Promise.all([ getDashboardSummary(role, domain, profile.id), getLeadVolumeByPeriod(role, domain, 'week') ])`.
3. `initialData = { ...rpcData, lead_volume: weekVolume }`.
4. `greeting = pickDashboardGreeting()` from `src/lib/constants/dashboard-greetings.ts`; `firstName` = first token of `profile.full_name`.
5. Render `<DashboardCanvas greeting firstName userId role domain initialData />` inside `<main className="flex-1 p-8">`.

### `initialData` prop threading

```text
dashboard/page.tsx
  → DashboardCanvas (initialData)
    → SortableWidget (initialData per widget)
      → DashboardWidgetSlot (initialData)
        → React.lazy widget (initialData)
```

Each widget receives the **full** `DashboardSummary` and reads its own key.

### Failure behaviour

`getDashboardSummary` **throws** on Supabase RPC error (`if (error) throw error`). There is no try/catch on the page — Next.js surfaces the error boundary / error page for that request. `getLeadVolumeByPeriod` does not throw on empty data (returns zeroed series).

---

## 6. `DashboardCanvas`

**File:** `src/components/dashboard/DashboardCanvas.tsx`

### Bento grid

- **12 CSS grid columns** (`.eia-bento-grid`: `grid-template-columns: repeat(12, 1fr)`; `gap: var(--space-4)`).
- **`colSpan: 1`** → `.eia-bento-cell-1` → `grid-column: span 6` (half width on wide screens).
- **`colSpan: 2`** → `.eia-bento-cell-2` → `grid-column: span 12` (full width — used by `manager-campaigns`).
- **Breakpoint `@media (max-width: 820px)`:** both cell classes become `span 12` (full-width stack).

### dnd-kit

- **`DndContext`** with `closestCenter` collision detection.
- **`SortableContext`** with **`verticalListSortingStrategy`** (not `rectSortingStrategy`) — reorder is a **vertical list order** mapped back to bento rows via `reorderWidgets(arrayMove(...))`.
- **Sensors:** `PointerSensor` + `KeyboardSensor` (`sortableKeyboardCoordinates`).
- **Drag enabled only in edit mode** (`useSortable({ disabled: !editMode })`).
- On drag end: `reorderWidgets(arrayMove(oldOrder, oldIndex, newIndex))`.

### Edit mode

- Toggle: **"Edit layout"** / **"Done"** (`aria-pressed` when active); accent fill when on.
- When on: dashed **`2px dashed var(--theme-accent)`** overlay per widget; top-right controls — **ResizePopover**, **drag handle** (`GripVertical`), **remove ×** (`var(--color-danger)`).
- **Reset layout** (`RotateCcw`) visible only in edit mode → `resetToDefaults()`.

### `ResizePopover`

- **Trigger:** compact button showing `WIDGET_SIZE_LABELS[size]` + chevron.
- **Height options:** `sm` | `md` | `lg` | `xl` with pixel hints from `WIDGET_HEIGHT_BY_SIZE`.
- **Width options:** `Half width` (`colSpan: 1`) | `Full width` (`colSpan: 2`).
- **Close:** outside `mousedown`, **Escape**, or after selecting an option (`onResize` → `resizePlacement`).

### Pre-hydration / skeleton

**Current behaviour:** no full-canvas skeleton gate. `useDashboardLayout` seeds defaults synchronously; widgets mount immediately. Per-widget loading uses `WidgetSkeleton` inside `DashboardWidgetSlot` (`Suspense` + `MinSkeletonBoundary`).

### Page header (in canvas)

- `type-page-title` greeting: `{greeting},` + accent `firstName` + `page-title-dot`.
- Not the list-page filter bar pattern — dashboard is widget-only below the header.

---

## 7. `DashboardWidgetSlot`

**File:** `src/components/dashboard/DashboardWidgetSlot.tsx`

### Static `React.lazy` map

```typescript
const WIDGET_COMPONENTS: Record<string, React.LazyExoticComponent<...>> = {
  'agent-tasks': lazy(() => import('./widgets/AgentTasksWidget').then(...)),
  'agent-activity': lazy(() => import('./widgets/AgentActivityWidget').then(...)),
  'manager-lead-status': lazy(() => import('./widgets/ManagerLeadStatusWidget').then(...)),
  'manager-lead-volume': lazy(() => import('./widgets/ManagerLeadVolumeWidget').then(...)),
  'manager-campaigns': lazy(() => import('./widgets/ManagerCampaignWidget').then(...)),
};
```

**Never** dynamic import strings or `require(variable)`. Bundles split per widget; ids not in the map render `null`.

### `MinSkeletonBoundary` (V-08)

- `useEffect` → `setTimeout(..., 150)` before showing lazy children.
- Until ready: `<WidgetSkeleton size={size} />`.
- **Rule V-08:** never show a skeleton for less than 150ms.

### Edit mode chrome

- Dashed overlay: `2px dashed var(--theme-accent)`, `pointer-events: none`, `z-index: var(--z-raised)`.
- Controls at `z-index: calc(var(--z-raised) + 1)`.

### `size` and `colSpan`

Passed into each lazy widget as `size` (container height). `colSpan` is applied on the **sortable grid cell** in `DashboardCanvas`, not inside the slot.

### `WidgetProps`

```typescript
{
  userId: string;
  role: UserRole;
  domain: AppDomain;
  initialData?: DashboardSummary;
  size?: WidgetSize;
}
```

---

## 8. `WidgetSkeleton`

**File:** `src/components/dashboard/WidgetSkeleton.tsx`

- Reads `WIDGET_HEIGHT_BY_SIZE[size]` → sets **`minHeight`** on the card (default `size = 'md'`).
- Card chrome: `var(--theme-paper)`, `var(--theme-paper-border)`, `var(--shadow-1)`, `var(--radius-lg)`.
- Shimmer lines use `animation: pulse 1.8s` with stagger `0/80/160/240ms` on body rows.
- Inner body uses `flex: 1` so filler lines expand inside the min-height shell (bento cell alignment comes from the grid + widget fixed `height` on real widgets).

---

## 9. Each Widget — detailed breakdown

### 9a. `AgentTasksWidget`

| | |
| - | - |
| **File** | `src/components/dashboard/widgets/AgentTasksWidget.tsx` |
| **Registry roles** | `agent`, `manager`, `admin`, `founder` (not agent-only) |
| **`initialData` key** | `agent_tasks` (`DashboardAgentTask[]`) |
| **Mount fetch** | Skipped when `initialData.agent_tasks` present; else `getAgentTasksSummaryAction` in `useEffect` + `startTransition` with `cancelled` flag |

**Renders:** Playfair header "My Tasks."; refresh (`getAgentTasksSummaryAction`); scrollable list split **Overdue** / **Active** (`is_overdue`); empty copy *"Nothing on your plate. Enjoy the quiet."*; category legend footer.

**Task categories:** `personal`, `group_subtask`, `gia_followup` (all three in legend).

**Active statuses:** `to_do`, `in_progress`, `in_review` (from RPC/service; widget displays status chips for non-`to_do` only).

**Category dot:** keyframe **`eia-cat-dot-pulse`** — 7px circle, `2.4s ease-in-out`, stagger delays **`0s` / `0.4s` / `0.8s`** per category; colours from `TASK_CATEGORY[cat].dotColor`.

**Priority chip:** only **`urgent`** and **`high`** (`TASK_PRIORITY`; `normal` → no chip).

**Status chip:** only **`in_progress`** and **`in_review`** (`to_do` → no chip).

**Context label:** italic tertiary after title — lead name (`gia_followup`) or group title (`group_subtask`).

**Sort order (server):** overdue → priority → `due_at`.

**Row limit:** **30** (RPC LIMIT).

**Links:** `lead_id` → `/leads/{id}`; else `/tasks`.

**Refresh:** `getAgentTasksSummaryAction` — re-verifies `profile.id` server-side (ignores client `userId` for auth).

*Note:* Legacy RPC included `newLeadsCount`; removed in migration 047. The widget does **not** display a new-leads count.

---

### 9b. `AgentActivityWidget`

| | |
| - | - |
| **File** | `src/components/dashboard/widgets/AgentActivityWidget.tsx` |
| **`initialData` key** | `agent_activity` |

**Role-scoped data (RPC migration 050):**

| Role | Seed / service scope |
| ---- | -------------------- |
| `admin`, `founder` | All activities |
| `manager` | Activities on leads where `leads.domain = caller domain` |
| `agent` | `actor_id = caller` |

#### Auto-scrolling ticker

- Loop driver: `setTimeout(tick, 16)` (~60fps), not `requestAnimationFrame`.
- Speed: **`0.11` px per frame** (`SCROLL_SPEED`).
- Transform: `translateY(offset)` on inner ref; **`willChange: transform`**.
- **Hover pause:** `pausedRef` true on `mouseEnter`, false on `mouseLeave`.
- **Wrap:** when `offset < -maxScroll`, reset `offsetRef` to `0`.
- Viewport: `flex: 1`, **`minHeight: 160px`** (replaces earlier fixed `220px`).

**`viewportRef`:** reads `clientHeight` for `maxScroll = totalHeight - viewportHeight` (`totalHeight = activities.length * ROW_HEIGHT`, **`ROW_HEIGHT = 48`**).

**Fade masks:** absolutely positioned overlay, `z-index: 1`, `pointer-events: none`, `linear-gradient` from `var(--theme-paper)` at 0% and 100% to transparent at 18% / 82%.

#### Agent activity Realtime

- Table: **`lead_activities`**, event **`INSERT`** only.
- Channel: `` `agent-activity:${userId}:${mountId}` `` (`useId()` suffix for Strict Mode).
- Filter: **admin/founder** — no filter (all inserts); **else** — `filter: actor_id=eq.${userId}`.
- **Manager caveat:** initial RPC is domain-scoped, but Realtime subscription still filters **`actor_id = userId`** (same as agent) — live inserts from other agents in the domain do not appear until refresh/RSC.
- New row: prepends to state, **`offsetRef` reset to 0**; cap **`ACTIVITY_CAP = 25`**.
- Cleanup: **`supabase.removeChannel(channel)`** on unmount (never `unsubscribe()` alone).

**`note_added`:** in `SKIP_TYPES` — filtered on seed, mount fetch, and Realtime handler (always paired with `call_logged`).

#### Action types rendered (5 + fallback)

| `action_type` | Icon | Label | Subtitle |
| ------------- | ---- | ----- | -------- |
| `call_logged` | `Phone` (`var(--color-info-text)`) | `lead_name` or `"Unknown lead"` | `CALL_OUTCOME_LABELS[outcome]` or `"Call logged"` |
| `status_changed` | `ArrowRight` (`var(--theme-accent)`) | lead name | `{old} → {new}` via `LEAD_STATUS_LABELS` or `"Status changed"` |
| `lead_created` | `UserPlus` (`var(--color-success-text)`) | lead name or `"New lead"` | `"Entered the system"` |
| `agent_assigned` | `User` (`var(--theme-text-secondary)`) | lead name or `"Lead"` | `"Assigned to you"` |
| `duplicate_submission` | `Copy` (`var(--color-warning-text)`) | lead name or `"Lead"` | `"Duplicate submission"` |
| *(other)* | `ArrowRight` (`var(--theme-text-tertiary)`) | lead name | `action_type` with underscores → spaces |

**Subtitle when loaded:** *"Live Lead Activity."* (with page-title-dot).

**No `initialData` mount fetch:** uses `getAgentRecentActivityAction` only when seed absent (no `startTransition` on that path).

---

### 9c. `ManagerLeadStatusWidget`

| | |
| - | - |
| **Roles** | `manager`, `admin`, `founder` |
| **`initialData` key** | `lead_status` |

**Renders:** five stat chips (`new`, `touched`, `in_discussion`, `won`, `junk`); up to **6** agents with per-status counts + mini **stacked bar** (all statuses); domain tabs for admin/founder (`GIA_DOMAINS` + **All**).

**Semantic colours (design-dna §16.4 / `LEAD_STATUS_COLORS`):**

| Status | Text token | Light/bg token |
| ------ | ---------- | -------------- |
| `new` | `var(--status-new-text)` | `var(--status-new-light)` |
| `touched` | `var(--status-touched-text)` | `var(--status-touched-light)` |
| `in_discussion` | `var(--status-in-discussion-text)` | `var(--status-in-discussion-light)` |
| `nurturing` | `var(--status-nurturing-text)` | `var(--status-nurturing-light)` |
| `won` | `var(--status-won-text)` | `var(--status-won-light)` |
| `lost` | `var(--status-lost-text)` | `var(--status-lost-light)` |
| `junk` | `var(--status-junk-text)` | `var(--status-junk-light)` |

**Refresh:** `getLeadStatusSummaryAction` (manager / All) or `getLeadStatusForDomainAction` (admin/founder domain tab) — `useEffect` + `startTransition` with `cancelled` flag when seed missing; admin/founder **always** refetch onboarding domain on mount even if seed present.

---

### 9d. `ManagerLeadVolumeWidget`

| | |
| - | - |
| **Roles** | `manager`, `admin`, `founder` |
| **`initialData` key** | **`lead_volume`** for **managers only** (`initialData?.lead_volume`); admin/founder pass `null` seed and fetch multi-domain series on mount |

**Why partial `initialData`:** period and (for admin/founder) domain mode are client-driven; RPC excludes volume.

**Period toggle:** **`Month` | `Week` | `Today`** (`VolumePeriod` — local state default **`week`**). *Quarter exists on the service type but is not exposed in this widget UI.* `useTransition` on change; calls `getLeadVolumeByPeriodAction` / `getLeadVolumeByDomainsAction` / `getLeadVolumeForDomainAction`.

**Chart:** Recharts `LineChart` in `ResponsiveContainer` **`width="100%"`** with computed **`chartHeight`** (min **120px**) from `WIDGET_HEIGHT_BY_SIZE[size]` minus chrome.

**Colours:** `useChartTokens()` → `chartColors[i]` for strokes; grid/axes/tooltip use `var(--theme-paper-border)`, `var(--theme-text-tertiary)`, `var(--theme-paper)`, `var(--shadow-2)` — **no hex in chart props**.

**Empty state:** `ChartEmpty` — Playfair italic *"No leads in this period."*

**Admin/founder:** multi-line chart when domain mode `all`; single line + domain tab totals when one domain selected.

---

### 9e. `ManagerCampaignWidget`

| | |
| - | - |
| **Roles** | `manager`, `admin`, `founder` |
| **`initialData` key** | `campaigns` |
| **`colSpan`** | **2** (full grid width for long campaign labels + stacked bars) |

**Renders:** `BarChart` (`stacked`, `colorMap={STATUS_COLORS}`) via `src/components/ui/charts/BarChart.tsx`.

**Bar rule:** stacked segments use **`topRadiusBar(4)`** → **`[4, 4, 0, 0]`** on the top segment only (design-dna §16.4 top-radius rule).

**Chart height:** computed from `WIDGET_HEIGHT_BY_SIZE[size]` minus padding/header/legend/domain row — **`Math.max(120, …)`** (comment in source: bumped from 260px fixed to dynamic fill; effective chart area ≈ **300px+** on default `xl` / `540px` card).

**Status fill tokens (`STATUS_COLORS`):**

| Status | Fill |
| ------ | ---- |
| `new` | `var(--color-info)` |
| `touched` | `var(--theme-accent)` |
| `in_discussion` | `var(--color-warning)` |
| `nurturing` | `var(--theme-accent-muted)` |
| `won` | `var(--color-success)` |
| `lost` | `var(--color-danger)` |
| `junk` | `var(--theme-text-tertiary)` |

**Empty state:** *"Leads with UTM campaign data will appear here."*

**Refresh:** `getLeadsByCampaignAction` / `getLeadsByCampaignForDomainAction` — `useEffect` + `startTransition` when seed absent.

---

## 10. Server Actions — `dashboard.ts`

All return `{ data, error }`. All call `getCurrentProfile()` first — **client-supplied `role` / `domain` / `userId` are never trusted** for authorization.

| Action | Service / RPC | Role guard | Return shape |
| ------ | ------------- | ---------- | -------------- |
| `getAgentTasksSummaryAction(_agentId)` | `getAgentTasksSummary(profile.id)` | Authenticated | `{ data: DashboardAgentTask[] \| null, error }` |
| `getAgentRecentActivityAction(_agentId)` | `getAgentRecentActivity(profile.id, profile.role, profile.domain)` | Authenticated | `{ data: AgentActivity[] \| null, error }` |
| `getLeadStatusSummaryAction(_role, _domain)` | `getLeadStatusSummary(profile.role, profile.domain)` | `manager`, `admin`, `founder` else `'Unauthorized.'` | `{ data: LeadStatusSummary \| null, error }` |
| `getLeadsByCampaignAction(_role, _domain)` | `getLeadsByCampaign(profile.role, profile.domain)` | manager+ | `{ data: CampaignStatusMix[] \| null, error }` |
| `getLeadVolumeByPeriodAction(_role, _domain, period)` | Zod `VolumePeriodSchema` then `getLeadVolumeByPeriod(profile.role, profile.domain, period)` | manager+ | `{ data: LeadVolumeSummary \| null, error }` |

**Additional actions (domain drill-down / multi-line volume):** `getLeadStatusForDomainAction`, `getLeadsByCampaignForDomainAction`, `getLeadVolumeByDomainsAction`, `getLeadVolumeForDomainAction` — same auth pattern; managers locked to `profile.domain` regardless of requested domain.

---

## 11. Realtime Integration

### Dashboard widget (`AgentActivityWidget`)

| | |
| - | - |
| **Table** | `lead_activities` |
| **Event** | `INSERT` only |
| **Widget** | `AgentActivityWidget` |
| **Filter** | None for `admin`/`founder`; `actor_id=eq.{userId}` for `agent` and `manager` (see §9b) |

### Sound notification (not on activity widget)

The dashboard activity ticker **does not** play audio. Sound is owned by the **notifications** pipeline:

| | |
| - | - |
| **Hook** | `src/hooks/useNotificationSound.ts` |
| **Triggered from** | `src/hooks/useNotifications.ts` on `notifications` **INSERT** only (never on seed/mark read) |
| **Implementation** | Web Audio API — oscillators **1047 Hz (C6)** + **1318 Hz (E6)**, ~0.4s decay, master gain **0.12** |
| **Debounce** | **1500ms** between plays |
| **Autoplay** | `context.resume()`; if state ≠ `'running'`, **silent return** (no throw) |
| **localStorage** | **`eia:notifications:sound:v1`** — default `true` when absent; toggle in `NotificationPreferences` |

**Rule:** only `useNotifications.ts` may call `sound.play()`.

---

## 12. Access Control Summary

| Widget | Roles who see it (default layout) | Enforcement layer |
| ------ | --------------------------------- | ----------------- |
| `agent-tasks` | `agent`, `manager`, `admin`, `founder` | `DEFAULT_LAYOUT_BY_ROLE` + registry `roles`; tasks RPC filters `assigned_to = p_user_id` |
| `agent-activity` | same | Layout + registry; RPC role CTE; Realtime filter per §9b |
| `manager-lead-status` | `manager`, `admin`, `founder` | Layout + registry; omitted for `agent`; server actions require manager+ |
| `manager-lead-volume` | `manager`, `admin`, `founder` | Layout + registry; volume service filters manager domain |
| `manager-campaigns` | `manager`, `admin`, `founder` | Layout + registry; RPC domain gate |

**Guest:** empty default layout. **Login gate:** page redirects unauthenticated users to `/login`.

---

## 13. Known Invariants (must never be violated)

1. **RSC rule (perf-01):** Summary widgets must not POST on initial load. `AgentTasksWidget`, `AgentActivityWidget`, `ManagerLeadStatusWidget`, `ManagerCampaignWidget` skip mount fetch when `initialData` is present; refresh buttons still call server actions. `ManagerLeadVolumeWidget` keeps its own period-toggle fetch (volume excluded from RPC).

2. **Dashboard summary data is RSC + cached.** Do not split `getDashboardSummary` back into individual server action calls for summary data. `getLeadVolumeByPeriod` is the only individual dashboard service function still called on the page load path (week default for `lead_volume`).

3. **PRIMARY ENTRY POINT:** `getDashboardSummary()` — single cached RPC, all summary widgets. Do not split back into individual service function calls for summary data. (`src/lib/services/dashboard-service.ts` header comment.)

4. **Uses React `cache()` (not `unstable_cache`) because `createClient()` reads `cookies()`, which cannot be called inside an `unstable_cache` closure (Next.js constraint).** (`dashboard-service.ts` comment block.)

5. **Individual service functions below are NOT used for initial page load — `getDashboardSummary()` handles that.** Used only for per-widget refresh buttons (user-initiated targeted refetch). (`dashboard-service.ts`.)

6. **All dashboard data goes through `src/lib/services/dashboard-service.ts` — never `leads-service.ts`.** (`src/app/(dashboard)/CLAUDE.md` Data Access Rules.)

7. **All client-side fetches go through server actions in `src/lib/actions/dashboard.ts`.**

8. **Server actions always call `getCurrentProfile()` and use the verified profile — never trust client-supplied role/domain/userId.**

9. **Widgets receive `userId`, `role`, `domain` as props from the canvas — but server actions re-verify via `getCurrentProfile()`.**

10. **`DashboardWidgetSlot` uses a static switch/map of `React.lazy()` calls. Never `require()` from a string. Never compute the import path dynamically.**

11. **Widget registry `id` is a stable localStorage key — NEVER rename after shipping.**

12. **`sanitizeStored()` validates each stored `widgetId` against the registry. Unrecognised ids are silently dropped.**

13. **`DashboardCanvas` no longer gates on `isHydrated`. Do not add that gate back.**

14. **The hook initialises `stored` synchronously with `DEFAULT_LAYOUT_BY_ROLE[role]` so widgets render immediately on first mount with the correct defaults.**

15. **Realtime teardown:** `supabase.removeChannel(channel)` — never `channel.unsubscribe()` alone. Channel name: `` `agent-activity:${userId}:${mountId}` `` — `useId()` mount suffix required. (`src/app/(dashboard)/CLAUDE.md` Phase B file locations.)

16. **Min skeleton:** never show a skeleton for less than **150ms** (V-08) — enforced by `MinSkeletonBoundary` in `DashboardWidgetSlot`.

17. **Initial data fetch in a widget (when no `initialData`) must live in `useEffect`, never as a render-phase guard** — use `startTransition` + `cancelled` flag where applicable (post-ship pattern from Phase 7 fix).

---

## Motion constants (`src/lib/constants/motion.ts`)

Dashboard widgets **do not import** shared motion constants. They use inline durations (e.g. `0.18s easeOut` on activity items, `150ms`/`200ms` on popovers) or Framer defaults. **`TabSelector`** on volume/status/campaign widgets uses `SPRING_CONFIG` / `ENTER_DURATION` internally via `src/components/ui/TabSelector.tsx`.

---

## Related migrations (grep index)

| File | Relevance |
| ---- | --------- |
| `20260529000029_get_dashboard_summary.sql` | Initial RPC |
| `20260530000043_fix_dashboard_summary_domain_type.sql` | `p_domain app_domain` |
| `20260531000047_dashboard_agent_tasks_all_categories.sql` | Tasks CTE rewrite |
| `20260531000048_dashboard_activity_limit_25.sql` | Activity LIMIT 25 |
| `20260531000050_dashboard_activity_role_scoped.sql` | Activity role CTE (canonical) |
| `20260526000001_profiles.sql` | Incidental mention only (not dashboard schema) |

---

*End of document.*
