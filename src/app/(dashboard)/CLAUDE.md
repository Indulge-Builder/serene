# Dashboard — CLAUDE.md

## What currently renders at `/dashboard`

`src/app/(dashboard)/dashboard/page.tsx` — server component.
Fetches `getCurrentProfile()`, renders `<DashboardCanvas>` with `userId`, `role`, `domain` props.

---

## Widget System Architecture

The dashboard is a widget canvas. Each widget is an independently code-split client component
that fetches its own data via server actions. Widgets never share data with each other.

### Component Hierarchy

```
dashboard/page.tsx                   ← Server component (thin orchestrator)
  ↓
DashboardCanvas                      ← 'use client'; reads useDashboardLayout; owns drag-to-reorder
  ↓ (per widget, drag-reorderable)
SortableWidget (inside canvas)       ← wraps DashboardWidgetSlot with @dnd-kit useSortable
  ↓
DashboardWidgetSlot                  ← Suspense boundary; min 150ms skeleton rule; edit mode chrome
  ↓ (React.lazy, code-split per widget)
<WidgetComponent>                    ← 'use client'; fetches own data via server action on mount
```

---

## Widget Registry

**File:** `src/lib/constants/dashboard-widgets.ts`

Pure data — no component references. Each entry:
```typescript
{
  id:           string;           // stable localStorage key — NEVER rename after shipping
  label:        string;
  description:  string;
  roles:        UserRole[];
  domains:      AppDomain[] | '*';
  defaultSize:  'sm' | 'md' | 'lg' | 'xl';
  module:       'gia' | 'finance' | 'ops' | 'marketing' | 'tech';
}
```

**Current widgets (Phase 7 — Gia module):**

| id | label | roles | size |
|---|---|---|---|
| `agent-tasks` | My Tasks | all except guest | md |
| `agent-activity` | Recent Activity | all except guest | md |
| `manager-lead-status` | Lead Pipeline | manager, admin, founder | lg |
| `manager-lead-volume` | Lead Volume | manager, admin, founder | lg |
| `manager-campaigns` | Campaign Performance | manager, admin, founder | xl |

---

## useDashboardLayout Hook

**File:** `src/hooks/useDashboardLayout.ts`

Pattern mirrors `useLeadColumnPreferences` exactly.

**localStorage key format:** `eia:dashboard:layout:${userId}:v1`

**Returns:**
```typescript
{
  layout:          WidgetPlacement[];  // { widgetId, col, row, size }[]
  isHydrated:      boolean;           // false on first render (pre-mount)
  addWidget:       (widgetId: string) => void;
  removeWidget:    (widgetId: string) => void;
  moveWidget:      (widgetId: string, col: number, row: number) => void;
  resizeWidget:    (widgetId: string, size: WidgetSize) => void;
  reorderWidgets:  (newOrder: string[]) => void;
  resetToDefaults: () => void;
}
```

**Hydration rule:** `isHydrated` starts `false`. `DashboardCanvas` renders a full-canvas skeleton
until `isHydrated` is `true`. This prevents layout shift between server render and client hydration.
Never render stored layout values during SSR — they are only available post-mount.

**On load:** validates each stored widgetId against the registry. Silently drops unrecognised ids.

---

## Dynamic Import Pattern

`DashboardWidgetSlot` uses a **static switch/map** of `React.lazy()` calls. Never `require()` from
a string. Never compute the import path dynamically. The map must be a literal object with string keys:

```typescript
const WIDGET_COMPONENTS: Record<string, React.LazyExoticComponent<...>> = {
  'agent-tasks': lazy(() => import('./widgets/AgentTasksWidget').then(...)),
  // etc.
};
```

This keeps bundle splitting clean — a widget not visible to a role is never loaded.

---

## Adding a New Widget

1. Add entry to `DASHBOARD_WIDGETS` in `src/lib/constants/dashboard-widgets.ts`
2. Add service function to `src/lib/services/dashboard-service.ts`
3. Add server action to `src/lib/actions/dashboard.ts`
4. Create `'use client'` component in `src/components/dashboard/widgets/`
5. Add to `WIDGET_COMPONENTS` map in `DashboardWidgetSlot.tsx`
6. Update `DEFAULT_LAYOUT_BY_ROLE` in the registry

---

## Data Access Rules

- All dashboard data goes through `src/lib/services/dashboard-service.ts` — never `leads-service.ts`
- All client-side fetches go through server actions in `src/lib/actions/dashboard.ts`
- Server actions always call `getCurrentProfile()` and use the verified profile — never trust client-supplied role/domain/userId
- Widgets receive `userId`, `role`, `domain` as props from the canvas — but server actions re-verify via `getCurrentProfile()`

---

## Tasks Page — `/tasks`

**File:** `src/app/(dashboard)/tasks/page.tsx` — thin Server Component orchestrator.

Fetches `getPersonalTasks(profile.id)` and `getGroupTasks()` in `Promise.all` on page load. `getGroupTasks` takes no domain argument — domain scoping is enforced inside the RPC using `get_user_domain()` so the caller cannot supply an arbitrary domain.
Passes results as props to `TasksShell`. Never re-fetches on tab switch.

### TasksShell

`src/app/(dashboard)/tasks/TasksShell.tsx` — `'use client'`.
Two tabs: "Personal" and "Group". Active tab persisted to `?tab=personal|group` URL param.
Uses `useSearchParams` + `useTransition` + `router.push`. Browser back/forward works.

### PersonalTasksTab

`src/components/tasks/PersonalTasksTab.tsx` — `'use client'`.
- Client-side filters: Status (multi-select pills), Priority (multi-select pills), due date range.
- Quick-add inline row: title input + priority selector + due date + assignee picker. Enter=save, Esc=cancel.
- Task list rows with 3px priority left border. Click row → `TaskModal`.
- Cursor pagination: "Load more" button. `PERSONAL_TASKS_PAGE_SIZE = 50`.
- `AssigneePickerModal` portaled to `document.body` — never inline inside scroll container.

### GroupTasksTab

`src/components/tasks/GroupTasksTab.tsx` — `'use client'`.
- Accordion: only one group expanded at a time. `expandedGroupId: string | null`.
- Group row: priority border, title, description, subtask count + progress%, due date, avatar stack (max 4), status pill.
- Subtask rows: title + status pill + assignee avatar. Click → `TaskModal`.
- "Add subtask" row at bottom. `AssigneePickerModal` portaled to `document.body`.
- Subtask data loaded on first expand (`getGroupSubtasks`) — not on mount.

### getPersonalTasks contract (mandatory)

```
getPersonalTasks(userId, filters?) → Promise<PersonalTasksResult>

PersonalTasksResult = {
  tasks:      Task[];
  hasMore:    boolean;     // true if more rows exist beyond LIMIT 50
  nextCursor: string | null; // due_at of last row for next page
}
```

`hasMore` is detected by fetching `LIMIT 51` and checking `rows.length > 50`. Never use a separate COUNT query.

---

## Phase B Widgets — File Locations

```
src/components/dashboard/
  DashboardCanvas.tsx         ← 'use client'; grid + dnd-kit + edit mode
  DashboardWidgetSlot.tsx     ← 'use client'; Suspense boundary + min 150ms skeleton
  WidgetSkeleton.tsx          ← shimmer skeleton sized by WidgetSize prop
  widgets/
    AgentTasksWidget.tsx      ← 'use client'; tasks + new leads count; server action refresh
    AgentActivityWidget.tsx   ← 'use client'; Realtime subscription + initial server action load
    ManagerLeadStatusWidget.tsx ← 'use client'; stacked bar pipeline + per-agent breakdown
    ManagerLeadVolumeWidget.tsx ← 'use client'; line chart with period toggle (Today/Week/Month/Quarter)
    ManagerCampaignWidget.tsx   ← 'use client'; stacked bar chart per utm_campaign

src/lib/services/dashboard-service.ts  ← all dashboard DB queries
src/lib/actions/dashboard.ts           ← all dashboard server actions
src/lib/constants/dashboard-widgets.ts ← widget registry (pure data)
src/hooks/useDashboardLayout.ts        ← localStorage layout preference hook
```
