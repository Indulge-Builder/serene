# Tasks Page — CLAUDE.md

## Suspense architecture

```
tasks/page.tsx          ← thin orchestrator (session read + URL parse only — NO data fetching)
  └─ <Suspense fallback={<TasksSkeleton tab={tab} />}>
       └─ <TasksAsync tab callerRole callerDomain callerName userId />
            └─ <TasksShell ... />   ← 'use client'
```

**`page.tsx` rule:** Zero data-fetching calls in the page component body. Only `getCurrentProfile()` and `searchParams` parse. If this rule is violated, the Suspense boundary is broken and the skeleton never renders.

**`TasksAsync.tsx`:** Async server component — the ONLY component in the tasks tree allowed to call `getPersonalTasks` or `getGroupTasks`. Returns serialisable plain objects to `TasksShell` (no service references, no Promises, no class instances cross the server→client boundary).

**`TasksSkeleton.tsx`:** `<Suspense>` fallback. Two variants: `personal` (3 priority sections × 5 task rows) and `group` (4 group cards). Stagger delays: 0/80/160/240/320ms per §11.4. Uses `var(--theme-paper-subtle)` for shimmer — never hardcoded colours.

## Lazy-loaded completed tasks

Completed tasks in `PersonalTasksTab` are NOT fetched on page load. They are fetched lazily on the first time the user expands the COMPLETED accordion section.

**Pattern:**
```ts
const hasLoadedCompleted = useRef(false); // declared before toggleSection
// ...
function toggleSection(key: string) {
  sectionOpenRef.current[key] = !sectionOpenRef.current[key];
  setSectionRenderKey((k) => k + 1);
  if (key === 'completed' && sectionOpenRef.current['completed'] && !hasLoadedCompleted.current) {
    hasLoadedCompleted.current = true; // SET BEFORE action call, not after resolution
    setIsLoadingCompleted(true);
    getPersonalTasksAction({ status: ['completed'], limit: 20 })
      .then(/* ... */)
      .finally(() => setIsLoadingCompleted(false));
  }
}
```

**Why `hasLoadedCompleted.current` is set before the action call:** If set after resolution, a double-click before the first response returns fires two identical action calls. Setting it before the call uses the ref as an in-flight guard.

**The completed section always renders its header** (never conditionally hidden), so the accordion is always accessible. The body loads on first expand.

## getGroupTasks cache

`getGroupTasks` is wrapped in `unstable_cache` with:
- Tag: `'group-tasks'`
- TTL: 60 seconds
- Cache key includes `callerDomain` — a manager in `concierge` must never see another domain's groups from cache

**Revalidation sites** (must call `revalidateTag('group-tasks', { expire: 0 })` after success):
- `createGroupTaskAction` — new group created
- `createSubtaskAction` — subtask added (changes aggregate counts)

## getPersonalTasks sort

Priority sort (urgent → high → normal) is done at the DB level via `get_personal_tasks` RPC on every page. JS `.sort()` is intentionally absent. See `src/lib/CLAUDE.md` for the full rule.

---

## Group workspace Suspense architecture

```
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
