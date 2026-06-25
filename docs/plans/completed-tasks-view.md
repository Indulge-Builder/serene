# Completed Tasks View — Implementation Plan

## Goal
A "Completed" view on the Tasks page showing tasks a person has finished — covering **both
personal tasks AND group subtasks**. Agents see their own; managers see anyone in their domain;
admin/founder see anyone. Surfaced as a **modal** opened from the `/tasks` header, with
**recent-first keyset pagination** (load more).

## Decisions locked (from clarifying questions)
- **Surface:** modal opened from the `/tasks` header (does not widen the `TaskTab` type).
- **Scope:** role+domain — agent → self only; manager → own domain; admin/founder → anyone.
- **Range:** recent-first, keyset pagination + "Load more" (no date filter v1).

## Key facts established from the codebase
- `tasks.completed_at timestamptz null` exists — the sort/cursor key.
- `tasks.status` terminal value is `'completed'`; `task_category` is `'personal' | 'group_subtask'`.
- RLS `tasks_manager_admin_founder_select` lets ANY manager/admin/founder SELECT ALL tasks (NOT
  domain-scoped). So domain scoping is NOT enforced by RLS — the **action is the trust boundary**.
  Agents are already RLS-restricted to `assigned_to/created_by = auth.uid()`.
- Existing keyset/composite-cursor reference: `getPersonalTasks` (`tasks-service.ts`).
- `getAssignableUsers({ domain?, roles? })` is the canonical people query for the picker.

## Files to change

### 1. Service — `src/lib/services/tasks-service.ts`
Add `getCompletedTasks(targetUserId, cursor?)`:
- Session client (`createClient()`); RLS permits the read (agent self / manager+ all).
- Query `tasks` where `assigned_to = targetUserId` AND `status = 'completed'`
  AND `task_category IN ('personal','group_subtask')`.
- Select `*` plus a `task_groups(title)` join (for group subtasks → show the group name) and a
  `task_gia_meta(lead_id, ...)` left join is NOT needed (keep it simple; group title is enough).
  Use a plain embed `task_groups ( title )`.
- Order `completed_at DESC NULLS LAST, id DESC`; `LIMIT pageSize + 1`; `hasMore` + `nextCursor`.
- **Composite cursor** `{ completed_at: string | null, id: string }` via a single `.or()` —
  mirror the `getPersonalTasks` nullable-cursor pattern exactly (Composite cursor rule in
  `src/lib/CLAUDE.md`). Page size const `COMPLETED_TASKS_PAGE_SIZE = 30`.
- Export `CompletedTaskRow` (`Task & { group_title: string | null }`), `CompletedTaskCursor`,
  `CompletedTasksResult`. No Redis (history, low traffic — like cursor pages 2+ already bypass).

### 2. Action — `src/lib/actions/tasks.ts`
Add `getCompletedTasksAction(targetUserId, cursor?)`:
- `requireProfile()` (any non-guest).
- **Authz (the domain trust boundary):**
  - agent → may only request `targetUserId === caller.id` (else `formErrors.unauthorized`).
  - manager → `targetUserId === self` OR the target's `domain === caller.domain` (one
    `getProfileById(targetUserId)` to read the target's domain).
  - admin/founder → any target.
- Returns `ActionResult<CompletedTasksResult>` (`{ data, error }`, never throws — Rule 10).
- Validate `targetUserId` is a uuid + cursor shape with a small Zod schema in
  `validations/task-schemas.ts` (`CompletedTasksQuerySchema`) — Rule 02. Issue messages are
  internal codes mapped to `formErrors` (Q-04).

### 3. People picker data
Reuse `getAssignableUsersAction(domain?)` (already client-callable, returns `AssignableUser[]`):
- Agent: no picker rendered (self only) — modal title is "My completed tasks".
- Manager: picker scoped to own domain → `getAssignableUsersAction(caller.domain)`.
- Admin/founder: picker over all users → `getAssignableUsersAction()`.
The modal will fetch the people list on first open (manager+ only) via the action; the caller's
own id/name/role are threaded from the page so the picker defaults to self.

### 4. Modal component — `src/components/tasks/CompletedTasksModal.tsx` (`'use client'`)
- Composes `src/components/ui/modal.tsx` (Modal Rule — never hand-roll chrome). `maxWidth="max-w-2xl"`.
- Props: `open`, `onClose`, `currentUser: { id, full_name, role, domain }`.
- State: `targetUserId` (default self), `rows`, `cursor`, `hasMore`, `loading`, plus people list
  (manager+; lazy-loaded on first open).
- On open / target change: call `getCompletedTasksAction(targetUserId)`; reset list.
- Person selector (manager+ only): a `FilterDropdown` (single-select) of `AssignableUser`s —
  reuses existing primitive; agent sees a static "You" label instead.
- Row rendering: reuse `TaskStatusIcon` + `TASK_STATUS` pill tokens + `Avatar`-free compact rows:
  title, a small category/group label (`group_title` for subtasks, "Personal" otherwise),
  `formatDate(completed_at)` (or `formatRelativeTime`). Display-only — NO row click → modal-in-modal
  (keep v1 read-only; clicking is out of scope to avoid the remarks-gate plumbing).
- Empty state: `<EmptyState variant="inline">` Playfair italic ("Nothing completed yet.") — never
  "No data available".
- "Load more" button (Button, secondary) when `hasMore`; keyset appends. Min skeleton not needed
  (button-driven). Loading uses `Spinner`.
- All colours via tokens; motion via `m as motion` if any; transform/opacity only.

### 5. Header button — `src/app/(dashboard)/tasks/page.tsx` + a small client trigger
- Add a "Completed" button (secondary `Button`, `CheckCircle2`/`History` lucide icon) in the
  header action row next to `AddTaskButton`.
- Because `page.tsx` is a server component and the modal is client + stateful, add a tiny
  `'use client'` wrapper `CompletedTasksButton.tsx` (button + `useState(open)` +
  `next/dynamic` import of `CompletedTasksModal` per the Heavy-modal-loading rule, gated on
  `{open && …}` so the chunk defers). It receives `currentUser` from the page.
- Mount it inside the existing `<div className="flex items-center gap-3">` in `page.tsx`.

### 6. Docs (Rule 12 — mandatory)
- `docs/changelog.md`: one entry describing the completed-tasks modal + the role/domain scope.
- `src/app/(dashboard)/tasks/CLAUDE.md`: extend the "My Tasks — completed tasks" section to note
  the new modal is THE way to view completed tasks (personal + group subtasks), self for agents /
  domain for managers / anyone for admin-founder; the active list still hides completed.
- `src/components/tasks/CLAUDE.md`: add `CompletedTasksModal` to the component inventory + service
  dependency map (`getCompletedTasksAction`, `getAssignableUsersAction`).
- `src/lib/CLAUDE.md` services row: note `getCompletedTasks` on `tasks-service.ts`.

## Explicitly out of scope (v1)
- Clicking a completed row to open `SubTaskModal` (avoids the remarks pre-fetch gate; can add later).
- Date-range filtering (recent + load-more chosen instead).
- A dedicated `/tasks/completed` route (modal chosen).

## Verification
- `pnpm tsc --noEmit` / lint clean.
- Manual: agent sees only own completed (personal + a completed group subtask); manager can switch
  to a same-domain user but NOT a cross-domain user (action returns unauthorized — verify the
  picker only lists own-domain users so it's not reachable anyway); admin/founder can switch to anyone.
- `graphify update .` after the code lands.
