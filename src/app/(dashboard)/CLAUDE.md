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

**Hydration rule:** The hook initialises `stored` synchronously with `DEFAULT_LAYOUT_BY_ROLE[role]`
so widgets render immediately on first mount with the correct defaults. After mount, `useEffect`
reads localStorage and calls `setStored` **only if the persisted layout differs** from the current
state. This keeps the widget subtree alive across the hydration flip — no unmount/remount cycle.

`isHydrated` is kept in the hook return value for consumers that need to know when the localStorage
preference has settled, but `DashboardCanvas` no longer gates on it. Do not add that gate back.

**On load:** validates each stored widgetId against the registry. Silently drops unrecognised ids.
`sanitizeStored()` is a standalone module-level function called inside `readFromStorage()`, which is
called inside the hydration `useEffect`. It was never gated behind `isHydrated` — the guard survived
the hydration-gate removal intact and fires on every post-mount reconciliation. A stale stored ID
(e.g. a renamed widget) is dropped before `setStored` is called, so widgets from deleted/renamed
definitions can never appear in the rendered layout.

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

## WhatsApp Page — `/whatsapp`

**File:** `src/app/(dashboard)/whatsapp/page.tsx` — Server Component.

Fetches `getCurrentProfile()`, then `getConversations({ limit: WHATSAPP_CONVERSATIONS_PAGE_SIZE })` and `getUnreadCount()` in `Promise.all`. Passes `callerProfile` and `initialConversations` to `WhatsAppShell`.

**No Suspense boundary here** — the page itself streams via Next.js. `loading.tsx` provides the skeleton.

**Access:** all roles except `guest` (redirected to `/dashboard`).

**Layout:** full-height two-panel (`height: calc(100dvh - 56px)`). No `p-8` page padding — the shell is flush. `WhatsAppShell` owns both panels.

**Client reads via actions:** `WhatsAppShell` and `ConversationList` call server action wrappers (`getConversationsAction`, `getMessagesAction`, `searchConversationsAction`) in `src/lib/actions/whatsapp.ts`. They must never import `whatsapp-service.ts` directly — it uses the server Supabase client.

---

## Tasks Page — `/tasks`

**File:** `src/app/(dashboard)/tasks/page.tsx` — thin Server Component orchestrator.

Reads `searchParams.tab` and fetches **only the active tab's data** on each page load.
The inactive tab receives a zero-value sentinel (`{ tasks: [], hasMore: false, nextCursor: null }` or `[]`).
When the user switches tabs, `router.push` changes the URL param and the server re-runs with the new active tab.
`getGroupTasks` takes no domain argument — domain scoping is enforced inside the RPC using `get_user_domain()`.

**No empty-state flash risk:** `TasksShell` renders only the active panel (`activeTab === 'personal' ? … : …`).
The inactive tab component never mounts, so the zero-value sentinel is never visible to the user.

**`GroupTasksTab` assumption:** its `if (initialRows.length === 0)` guard is a prop-time check, not state.
This is safe as long as `TasksShell` is the only render site for `GroupTasksTab`. Do not render it directly
with `initialRows = []` as the active view — that would flash the empty state before any client fetch fires.
If a Suspense-on-tab-switch pattern is added later, replace this guard with an `isLoading` state instead.

### TasksShell

`src/app/(dashboard)/tasks/TasksShell.tsx` — `'use client'`.
Two tabs: "Personal" and "Group". Active tab persisted to `?tab=personal|group` URL param.
Uses `useSearchParams` + `useTransition` + `router.push`. Browser back/forward works.

### PersonalTasksTab

`src/components/tasks/PersonalTasksTab.tsx` — `'use client'`.
- Client-side filters: Status (multi-select pills), Priority (multi-select pills), due date range.
- Quick-add inline row: title input + priority selector + due date + assignee picker. Enter=save, Esc=cancel.
- Task list rows with 3px priority left border. Click row → `SubTaskModal`.
- Cursor pagination: "Load more" button. `PERSONAL_TASKS_PAGE_SIZE = 50`.
- `AssigneePickerModal` portaled to `document.body` — never inline inside scroll container.
- **Data initialisation:** `activeTasks` state is seeded directly from `initialResult.tasks` (SSR prop). No mount re-fetch. Tags are loaded once on mount via `getPersonalTaskTagsAction` (not in `initialResult`). Active task list is mutated locally — quick-add prepends a synthetic task, optimistic circle toggles update `optimisticStatus`. `getPersonalTasksAction` is never called on mount or after quick-add.
- **Quick-add prepend pattern:** after `createPersonalTaskAction` succeeds, a synthetic `Task` object (all required fields, `priority: 'normal'`, `status: 'to_do'`, `tags: []`) is prepended to `activeTasks` state. Mirrors `CreatePersonalTaskModal.onCreated`.

### GroupTasksTab

`src/components/tasks/GroupTasksTab.tsx` — `'use client'`.
- Accordion: only one group expanded at a time. `expandedGroupId: string | null`.
- Group row: priority border, title, description, subtask count + progress%, due date, avatar stack (max 4), status pill.
- **"Open" link** per group row: `Link href="/tasks/${group.id}"` — `e.stopPropagation()` on click/keydown prevents accordion expand.
- Subtask rows: title + status pill + assignee avatar. Click → `SubTaskModal`.
- "Add subtask" row at bottom. `AssigneePickerModal` portaled to `document.body`.
- Subtask data loaded on first expand (`getGroupSubtasks`) — not on mount.
- **Agent list fetch:** `listAgentsForDomain` is called **once on mount** in `GroupTasksTab` (manager+ only) and the result is stored as `assignableUsers` state. This is passed as a prop to every `GroupRow`. `GroupRow` must never call `listAgentsForDomain` independently — doing so would fire one DB call per expanded group.

### Group Task Workspace — `/tasks/[id]`

**Page:** `src/app/(dashboard)/tasks/[id]/page.tsx` — Server Component.
- Fetches `getTaskGroupById(id)` + `getGroupSubtasks(id)` in parallel.
- Null group (RLS blocks access or not found) → `redirect('/tasks?tab=group')`. No 404.
- Passes `group`, `initialSubtasks`, `currentUserId`, `currentUserName`, `callerRole`, `callerDomain` as props.

**Client Component:** `src/components/tasks/GroupTaskWorkspace.tsx`
- Two views: List (priority DESC + due_at ASC NULLS LAST) | Board (5 columns).
- View persisted to `localStorage` at `eia:tasks:workspace-view:${groupId}`. Default `'list'` on SSR; `useEffect` reads after mount (no hydration mismatch).
- Board has 5 columns: To Do · In Progress · In Review · Completed · Error/Cancelled. Error and Cancelled share one column; header shows sum of both counts; cards show actual status pill.
- Click any row/card → fires `getTaskRemarksAction(subtask.id)`, sets `selectedSubtaskRemarks` state. `SubTaskModal` mounts only once `selectedSubtaskRemarks !== null`. Status changes via TaskModal → local state update on `handleModalClose` (re-fetches subtasks, clears remarks).
- Realtime: subscribes to `tasks WHERE group_id = id`. Channel: `workspace-subtasks-${groupId}-${mountId}`.
- Floating "+ Add subtask" FAB (bottom-right). Opens inline panel: title + assignee + priority + due date. `createSubtaskAction` → re-fetches on success.
- No drag-and-drop. No inline complete for subtasks.

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
                                  Teardown: supabase.removeChannel(channel) — never channel.unsubscribe() alone
                                  Channel name: `agent-activity:${userId}:${mountId}` — useId() mount suffix required
    ManagerLeadStatusWidget.tsx ← 'use client'; stacked bar pipeline + per-agent breakdown
    ManagerLeadVolumeWidget.tsx ← 'use client'; line chart with period toggle (Today/Week/Month/Quarter)
    ManagerCampaignWidget.tsx   ← 'use client'; stacked bar chart per utm_campaign

src/lib/services/dashboard-service.ts  ← all dashboard DB queries
src/lib/actions/dashboard.ts           ← all dashboard server actions
src/lib/constants/dashboard-widgets.ts ← widget registry (pure data)
src/hooks/useDashboardLayout.ts        ← localStorage layout preference hook
```
