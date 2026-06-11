# Tasks Page — CLAUDE.md

## Suspense architecture

```text
tasks/page.tsx          ← thin orchestrator (session read + URL parse only — NO data fetching)
  └─ <Suspense fallback={<TasksSkeleton tab={tab} />}>
       └─ <TasksAsync tab callerRole callerDomain callerName userId />
            └─ <TasksShell ... />   ← 'use client'
```

**`page.tsx` rule:** Zero data-fetching calls in the page component body. Only `getCurrentProfile()` and `searchParams` parse. If this rule is violated, the Suspense boundary is broken and the skeleton never renders.

**`TasksAsync.tsx`:** Async server component — the ONLY component in the tasks tree allowed to call `getPersonalTasks`, `getGroupTasks`, `getAssignableUsers`, or `getPersonalTaskTags`. Returns serialisable plain objects to `TasksShell` (no service references, no Promises, no class instances cross the server→client boundary).

**SSR hoists (perf — 2026-06-01, single-wave 2026-06-11):** `TasksAsync` fetches `initialAgents` (from `getAssignableUsers()` in profiles-service), `initialTags` (from `getPersonalTaskTags` — **personal tab only**, perf audit E-2), and the active tab's data in ONE `Promise.all` (perf audit E-1) — never re-split into sequential waves. These are passed as props to `TasksShell`, then threaded to `GroupTasksTab` and `MyTasksCalendarView`. Neither component calls `getAssignableUsersAction` or `getPersonalTaskTagsAction` on mount — the SSR data is always present. The `onTagsMayHaveChanged` callback in `TasksShell` still calls `getPersonalTaskTagsAction` for post-create tag refresh, which is correct — that is a user-triggered update, not a mount fetch.

**`personalTagItems` re-seed effect (required by E-2):** `TasksShell` never remounts on tab switches (per-tab filter state must survive), so its mount-time `useState(initialTags)` seed alone would freeze the tag filter at `[]` for a user who lands on gia/group and switches to My Tasks. A `useEffect` re-seeds `personalTagItems` from the `initialTags` prop whenever `initialTab === 'personal'`. Do not remove it, and do not widen the tags fetch back to all tabs to "fix" stale tags — the effect is the fix.

**`TasksSkeleton.tsx`:** `<Suspense>` fallback. Two variants: `personal` (3 priority sections × 5 task rows) and `group` (4 group cards). Stagger delays: 0/80/160/240/320ms per §11.4. Uses `var(--theme-paper-subtle)` for shimmer — never hardcoded colours.

## Filter bar (`TasksShell` + `TasksFilters`)

- Single paper strip: **My Tasks / Group Tasks** `TabSelector` **left** (`variant="accent"`, `indicatorLayoutId="tasks-page-tabs"`), **filters** to the right in the same row. **Create button** is in the page header (`AddTaskButton`, same row as `<h1>`) — mirrors Leads. `TasksCreateProvider` wires header clicks to tab modals via `createTrigger`.
- Filter state lives in `TasksShell` (separate `personalFilters` / `groupFilters` objects — switching tabs preserves each tab’s filters).
- **All filtering is client-side** via `src/lib/utils/task-client-filters.ts`. Never add server refetches for filter changes.
- **My Tasks:** search (title + description), tags (multi), status (multi), priority (multi). Tags seeded from `initialTags` prop (SSR); refreshed via `getPersonalTaskTagsAction` only after a task create/update that may have changed the tag set.
- **Group Tasks:** search (group title), status, priority, domain (`FilterDropdown`, admin/founder only, domains present in roster), progress (in progress / complete / no subtasks).
- Result count in the filter bar is reported from each tab (`onFilteredCountChange`) so optimistic row updates stay accurate.

## My Tasks — completed tasks

`MyTasksCalendarView` (active UI) does **not** show completed tasks in the main list or calendar dots. Completing a task removes it from the active set via `useTaskCompletionToggle` + local state.

The legacy `PersonalTasksTab` (deleted 2026-06-11, design-audit Phase 3) used a lazy-loaded COMPLETED accordion — do not recreate that pattern in `MyTasksCalendarView`.

## Redis cache-aside — active on 3 tab-load functions (2026-06-02)

All keys use the `task:` namespace defined in `src/lib/constants/redis-keys.ts`.

| Service function | Cache key | TTL | Scope |
| --- | --- | --- | --- |
| `getGiaTasksForUser` | `task:gia:{userId}:{role}:{domain}` | 60s | Per-user + per-role + per-domain |
| `getGroupTasks` (unfiltered only) | `task:group-list:{userId}` | 120s | Per-user (migration 0058: visibility is user-specific) |
| `getPersonalTasks` (page 1 only) | `task:personal:page1:{userId}` | 30s | Per-user |

**Rules:**

- `getGroupTasks` caches only when `filters.status` and `filters.priority` are both empty/undefined. Filtered calls bypass Redis entirely (too many combinations).
- `getPersonalTasks` caches only page 1 — defined as: `cursor === null` AND no status/priority/tag filters AND no `due_before`. Pages 2+ bypass Redis entirely.
- `getGiaTasksForUser` caches every call — it has no cursor pagination. The key includes all three scoping dimensions (userId, role, domain).
- All cache operations are non-fatal — a Redis error falls through to the RPC, never blocks.

**Invalidation table:**

| Action | Keys deleted |
| --- | --- |
| `createPersonalTaskAction` | `task:personal:page1:{assignedTo}` |
| `createGroupTaskAction` | `task:group-list:{callerId}` |
| `createSubtaskAction` | `task:subtasks:{groupId}:{callerUserId}`, `task:group-list:{callerId}`, `task:group-list:{assignedTo}` (if assignee ≠ caller) |
| `addTaskRemarkAction` | `task:remarks:{taskId}` |
| `suppressTaskRemarkAction` | `task:remarks:{taskId}` |
| `updateTaskStatusAction` (group subtask) | `task:subtasks:{group_id}:{callerUserId}` |
| `updateTaskAction` (group subtask) | `task:subtasks:{group_id}:{callerUserId}` |
| `deleteTaskAction` (group subtask) | `task:subtasks:{group_id}:{callerUserId}` |

Note: Gia task list (`task:gia:*`) has no explicit invalidation — TTL-only (60s). Creating a Gia task goes through `createLeadTaskAction` in `leads.ts`, which does not currently del this key. New Gia tasks appear within 60s.

## getGroupTasks cache

`getGroupTasks` uses React `cache()` for per-request memoisation. It cannot use `unstable_cache`
because `createClient()` calls `cookies()`, which Next.js forbids inside `unstable_cache` closures (P-09).

After mutations, `createGroupTaskAction` and `createSubtaskAction` call `revalidatePath('/tasks')`
to invalidate the RSC cache and trigger a fresh fetch on the next request.

The `cacheHint?: { userId: string }` optional second parameter carries the caller's user ID
for the Redis key only. It must NEVER be passed to the RPC — the RPC derives visibility from
`auth.uid()` inside Postgres (flat-visibility model, migration 0058). `TasksAsync` passes this
from its own `userId` prop.

## getPersonalTasks sort

Priority sort (urgent → high → normal) is done at the DB level via `get_personal_tasks` RPC on every page. JS `.sort()` is intentionally absent. See `src/lib/CLAUDE.md` for the full rule.

---

## Group workspace Suspense architecture

```text
tasks/[id]/page.tsx          ← thin orchestrator (session read + params only — NO data fetching)
  ├─ <Link href="/tasks?tab=group"> ← back link — renders immediately, outside Suspense
  └─ <Suspense fallback={<WorkspaceSkeleton />}>
         └─ <WorkspaceAsync groupId currentUserId currentUserName callerRole callerDomain />
                └─ <GroupTaskWorkspace ... />   ← 'use client'
```

**`page.tsx` rule:** Zero data-fetching calls in the page body. Only `getCurrentProfile()` and `params` read. The `Promise.all([getTaskGroupById, getGroupSubtasks])` lives entirely in `WorkspaceAsync`.

**`WorkspaceAsync.tsx`:** Async server component — the ONLY component in the workspace tree allowed to call `getTaskGroupById` or `getGroupSubtasks`. Redirects to `/tasks?tab=group` if `getTaskGroupById` returns null (RLS denied / not found). The redirect happens here, not in `page.tsx` — if it were in the page, the page would have to await the data fetch to know whether to redirect, defeating the entire purpose of streaming.

**`WorkspaceSkeleton.tsx`:** `<Suspense>` fallback. Renders a group header skeleton (title + priority badge + domain pill + two action button outlines), a view-toggle skeleton (two tab buttons), and five subtask row skeletons. Stagger: 0/80/160/240/320ms per §11.4. Uses `var(--theme-paper-subtle)` for shimmer — never hardcoded colours. Does NOT include the back-navigation link — that renders in the page shell immediately.

**Prop boundary contract:** `WorkspaceAsync` passes only JSON-serialisable plain objects to `GroupTaskWorkspace` (`TaskGroup` and `SubtaskWithAssignee[]` — string timestamps, no Date instances, no class instances).

---

## Gia Tasks tab — domain-aware logic (updated 2026-06-05)

`page.tsx` computes `isGiaDomain = GIA_DOMAINS.includes(profile.domain)`.

- **Gia domain (any role):** `validTabs = ['gia', 'personal', 'group']` — Gia tab is the default.
- **Non-Gia:** `validTabs = ['personal', 'group']` — Gia tab never rendered or reachable.

All roles (agent, manager, admin, founder) now get the Group Tasks tab — the old
`profile.role === 'agent'` exclusion was removed in migration 0058.

`?tab=gia` for a non-Gia caller resolves to `validTabs[0]` server-side — no error, no blank page.

**Gia tab data path:**

```text
page.tsx   ← getGiaTasksForUser not called here (thin orchestrator)
  └─ <Suspense fallback={<TasksSkeleton tab="gia" />}>
       └─ TasksAsync   ← calls getGiaTasksForUser(userId, role, domain) when tab === 'gia'
            └─ TasksShell  ← renders GiaTasksTab with giaTasks prop
                 └─ GiaTasksTab  ← date-groups tasks, renders GiaTaskRow items
```

**`get_gia_tasks` RPC (migration 0055):**

- `p_role = 'agent'` → `tasks.assigned_to = p_user_id`
- Other roles → `leads.domain = p_domain`
- `p_domain` cast to `app_domain` enum inside the function — no `42883` on `=` operator mismatch.
- Order: active tasks first, then `due_at ASC NULLS LAST, created_at ASC`.

**`searchLeadsAction`** in `lib/actions/leads.ts`:

- Calls `searchLeadsForTask` in `leads-service.ts`.
- Scoped by caller role: agent → `assigned_to = userId`; manager → `domain`; admin/founder → all.
- Returns max 8 results. Used by `CreateGiaTaskModal` lead picker (300ms debounce).

**`TaskTab` type** exported from `page.tsx`: `'gia' | 'personal' | 'group'`.
All shell components (`TasksAsync`, `TasksShell`, `AddTaskButton`, `TasksSkeleton`) consume this type — do not widen or narrow it elsewhere.

---

## TasksShell — prop contract (updated 2026-06-01)

`src/app/(dashboard)/tasks/TasksShell.tsx` — `'use client'`. Two tabs: personal / group / gia.

**Props added by perf-hoisting pass:**

| Prop | Type | Source | Consumer |
| --- | --- | --- | --- |
| `initialAgents` | `AssignableUser[]` | `getAssignableUsers()` in `TasksAsync` | `GroupTasksTab`, `MyTasksCalendarView` |
| `initialTags` | `string[]` | `getPersonalTaskTags(userId)` in `TasksAsync` (personal tab only) | `personalTagItems` state seed |

`AssignableUser` is the canonical type from `@/lib/types` (dry-audit M-4): `Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'role' | 'domain'>`. The old `AgentSlim` export on `TasksAsync.tsx` is gone.

**Rules:**

- `GroupTasksTab` and `MyTasksCalendarView` must NOT call `getAssignableUsersAction` on mount. They receive `initialAgents` as a prop.
- `getPersonalTaskTagsAction` is still called from `onTagsMayHaveChanged` (post-create tag refresh) — this is a user-triggered update, not a mount fetch. Do not remove it.
- `getPersonalTaskTagsAction` import in `TasksShell` is retained for the `onTagsMayHaveChanged` callback only.

---

## Design-token hardening log

- **A-4 resolved (2026-05-30):** Status-change chips implemented in `TaskRemarksPanel` compose area — 6 toggleable pills, `statusChange` state, passed as `statusChange?: TaskStatus` to `addTaskRemarkAction`; cleared on successful post; optimistic remark includes `status_change` field.
- **A-1 resolved (2026-05-30):** Cursor pagination in legacy `PersonalTasksTab` (superseded by calendar view for My Tasks).
- **A-2 resolved (2026-05-30):** `currentUserName` threaded `GroupTasksTab → GroupRow → SubTaskModal` — optimistic remark author names now display correctly in group tasks.
- **B-2 resolved (2026-05-30):** `SubTaskModal` backdrop `rgba(0,0,0,0.5)` replaced with `var(--overlay-bg)`.
- **B-3 resolved (2026-05-30):** `AssigneePickerModal` nested-modal backdrop `rgba(0,0,0,0.35)` replaced with `var(--overlay-bg-light)`.
  Both tokens defined in `src/styles/design-tokens.css` `:root` (theme-invariant).
