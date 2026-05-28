# Eia — Changelog

All notable changes to the Eia platform are recorded here in reverse chronological order.
This is the **single source of truth** for all development changes.
Every meaningful change — feature, fix, refactor, migration, new package — must be logged here before or alongside the code that implements it.
Format: `[date] — [area] — [what changed]`

---

## 2026-05-28 — Migration 0021: task_messages suppression + task_audit_log

- `supabase/migrations/20260528000021_task_suppression_audit.sql` — Part A: adds `is_suppressed` (bool NOT NULL DEFAULT false), `suppressed_by` (uuid FK → profiles ON DELETE SET NULL), `suppressed_at` (timestamptz) columns to `task_messages`; adds `task_messages_suppression_update` RLS UPDATE policy for admin/founder (row-level only — column restriction at action layer). Part B: creates `task_audit_log` append-only table (id, task_id, changed_by, field_name, old_value, new_value, changed_at) with `idx_task_audit_log_task_id` index; RLS SELECT for manager/admin/founder; no INSERT/UPDATE/DELETE policies; `log_task_changes()` SECURITY DEFINER trigger fires AFTER UPDATE on tasks, logs six fields (title, description, status, priority, due_at, assigned_to).
- `src/lib/types/database.ts` — `TaskMessage` type updated with suppression fields; `TaskAuditLog` type added; `task_messages` Database entry updated (Insert/Update types narrowed); `task_audit_log` Database entry added.
- `src/lib/validations/task-schemas.ts` — `SuppressTaskMessageSchema` + `SuppressTaskMessageInput` added.
- `src/lib/actions/tasks.ts` — `suppressTaskMessageAction` added: Zod → admin/founder guard → message existence check (S-06) → idempotent suppression write via adminClient.
- `src/components/tasks/TaskChatPanel.tsx` — suppressed messages render as "This message was removed." (tertiary italic, same row height); original content never shown for any role; optimistic inserts carry `is_suppressed: false`.

---

## 2026-05-28 — PersonalTasksTab: replace unbounded append with page-replace pagination (Fix — P-03)

Option A chosen: `@tanstack/virtual` was not in `package.json`; no new dependency added.

- `src/components/tasks/PersonalTasksTab.tsx` — `handleLoadMore` (append) removed; replaced with `handleNextPage` (replaces task list, pushes previous cursor onto `cursorStack`) and `handlePrevPage` (pops `cursorStack`, re-fetches that page); DOM is always max 50 rows; "Load more" button replaced with Previous/Next pagination footer showing current page number; filter-change `useEffect` resets to page 1 when `cursorStack.length > 0` so client-side filters apply against the first page (full dataset entry point) rather than a mid-stack page

---

## 2026-05-28 — TaskChatPanel: fix Realtime "cannot add callbacks after subscribe()" (Fix)

Root cause: `createBrowserClient` (Supabase SSR) is a singleton — same client instance on every call. The Supabase JS client reuses channel objects by name from an internal registry. React 18 StrictMode double-invokes effects: mount → cleanup → mount again. The first cleanup called `removeChannel` (async, not awaited), but by the time the second mount ran, the channel by the same name was still present in the registry in `SUBSCRIBED` or `LEAVING` state. Calling `.on()` on it threw `"cannot add postgres_changes callbacks after subscribe()"`.

Fix: `useId()` produces a stable, mount-scoped nonce that is unique across mounts. The channel name becomes `task-messages-${taskId}-${mountId}`, making each mount's channel name distinct. StrictMode's first cleanup fully removes its channel; the second mount creates a new channel under a different name and never collides with the prior one.

- `src/components/tasks/TaskChatPanel.tsx` — `useId` added to React import; `mountId = useId()` ref added; channel name changed from `` `task-messages-${taskId}` `` to `` `task-messages-${taskId}-${mountId}` ``

---

## 2026-05-28 — GroupTasksTab / PersonalTasksTab: fix server module in client bundle (Fix)

Root cause: both `'use client'` components imported value symbols directly from `src/lib/services/tasks-service.ts`, which calls `createClient()` from `src/lib/supabase/server.ts`, which imports `next/headers`. Next.js rejects any client bundle that transitively reaches `next/headers`.

Rule A-03: all DB queries go through `lib/services/`; but the service layer is server-only. Client components must use server actions as the boundary — never import service modules directly.

- `src/lib/actions/tasks.ts` — `getGroupSubtasksAction(groupId)` and `getPersonalTasksAction(filters?)` added; both call the service, verify session, and return `ActionResult<T>`; `userId` is derived from `getCurrentProfile()` server-side so the client never needs to supply it
- `src/components/tasks/GroupTasksTab.tsx` — `import { getGroupSubtasks } from '…/tasks-service'` replaced with `import { …, getGroupSubtasksAction } from '…/actions/tasks'`; call site updated; `cancelled` flag added (matches widget pattern)
- `src/components/tasks/PersonalTasksTab.tsx` — `import { getPersonalTasks } from '…/tasks-service'` removed; `getPersonalTasksAction` imported from actions; all three call sites (`handleNextPage`, `handlePrevPage`, filter-reset `useEffect`) updated

---

## 2026-05-28 — Migrations 0018/0019/0020: fix app_domain = text type error (Fix)

Root cause: `get_user_domain()` returns `app_domain` (enum). `task_groups.domain` is `text`. PostgreSQL will not implicitly cast enum → text — `ERROR 42883: operator does not exist: app_domain = text`. All three migrations built in the same session carried the same uncast comparison. The correct pattern (already in migration 0003) is `get_user_domain()::text`.

- `supabase/migrations/20260528000018_task_groups_rls_domain.sql` — `get_user_domain() = domain` → `get_user_domain()::text = domain` in both SELECT and UPDATE policies (3 occurrences); type-note comment added
- `supabase/migrations/20260528000019_task_messages_rls_creator.sql` — `tg.domain = get_user_domain()` → `tg.domain = get_user_domain()::text` in both SELECT and INSERT policies (2 occurrences); type-note comment added
- `supabase/migrations/20260528000020_group_task_summaries_rpc.sql` — `tg.domain = get_user_domain()` → `tg.domain = get_user_domain()::text` (1 occurrence)

All three files were edited in-place: they had never successfully applied to the database (each failed at the type-mismatch error before any DDL committed).

---

## 2026-05-28 — AssigneePickerModal: fix z-index arithmetic V-05 violation (Fix)

- `src/styles/design-tokens.css` — `--z-modal-overlay: 61` and `--z-modal-nested: 62` added to the z-index scale; nested modal layering now has named tokens instead of arithmetic
- `src/components/tasks/AssigneePickerModal.tsx` — `calc(var(--z-modal) + 10)` → `var(--z-modal-overlay)`; `calc(var(--z-modal) + 11)` → `var(--z-modal-nested)`; file-header comment updated
- `src/components/CLAUDE.md` — AssigneePickerModal entry updated to reference new token names

No `--color-*` violations were found in `src/components/tasks/` — those tokens are legitimately defined in `design-tokens.css` (section 7) and are correct per the Surface Contract. The actual violation was V-05 (z-index arithmetic), not V-01.

---

## 2026-05-28 — PersonalTasksTab: fix duplicate task creation on fast Enter (Fix)

- `src/components/tasks/PersonalTasksTab.tsx` — `useTransition` now destructures `isPending`; `handleQuickAddSave` guards with `if (isPending) return` as first statement, making all subsequent Enter presses a no-op until the transition completes; `isSavingQuickAdd` boolean state removed entirely; title input gains `disabled={isPending}` + `opacity: isPending ? 0.6 : 1`; Save button uses `isPending` for `disabled`, `cursor`, `opacity`, and label text ("Saving…")

---

## 2026-05-28 — getPersonalTasks: fix NULL due_at cursor pagination bug (Fix)

- `src/lib/services/tasks-service.ts` — `PersonalTaskFilters.cursor` changed from `string | null` to composite `PersonalTaskCursor = { due_at: string | null, id: string } | null`; `PersonalTasksResult.nextCursor` updated to the same composite type; `getPersonalTasks` now sorts by `due_at ASC NULLS LAST, id ASC` and uses a `.or()` condition covering all four cases of the composite continuation predicate; tasks with no deadline (`due_at IS NULL`) are now visible on every page after the first
- `src/components/tasks/PersonalTasksTab.tsx` — `cursor` state typed as `PersonalTaskCursor | null`; `PersonalTaskCursor` imported from service
- `src/lib/CLAUDE.md` — composite cursor pattern documented under a new "Composite cursor pattern for nullable sort columns" section

---

## 2026-05-28 — get_group_task_summaries: fix SECURITY DEFINER domain bypass (Security)

### What was wrong

Migration 0020's initial `get_group_task_summaries` RPC accepted `p_domain text` as a caller-supplied parameter and used it in `WHERE tg.domain = p_domain`. The comment incorrectly stated "the function does NOT bypass RLS — it runs as the calling user's session." Both claims were wrong: SECURITY DEFINER always runs as the function owner (postgres), which bypasses RLS entirely. Any authenticated caller could pass any domain value and receive results from that domain — the RLS domain guard was effectively off.

### What changed

- `supabase/migrations/20260528000020_group_task_summaries_rpc.sql` rewritten (migration had not yet run in production): `p_domain` parameter removed; WHERE clause now replicates the `task_groups_select` policy from migration 0018 explicitly using `get_user_role()` and `get_user_domain()` (agent: created_by = auth.uid(); manager: domain = get_user_domain(); admin/founder: all); comment corrected to accurately describe SECURITY DEFINER behaviour
- `src/lib/services/tasks-service.ts` — `getGroupTasks` signature changed from `(domain: string, filters?)` to `(filters?)` — domain is no longer accepted or forwarded; scoping is fully server-enforced
- `src/app/(dashboard)/tasks/page.tsx` — call site updated from `getGroupTasks(profile.domain)` to `getGroupTasks()`
- `src/app/(dashboard)/CLAUDE.md` — updated to reflect the new signature and explain why domain is not passed
- `src/lib/CLAUDE.md` — RPC pattern rules updated: documents that SECURITY DEFINER bypasses RLS, that access control must be replicated in the WHERE clause, and that caller-supplied domain parameters must never be trusted for scoping

### Verified

- `pnpm tsc --noEmit` passes with zero errors
- Domain scoping is now enforced inside the RPC body, not by a caller-supplied parameter
- Comment accurately describes SECURITY DEFINER semantics

---

## 2026-05-28 — getGroupTasks: replace in-memory aggregation with Postgres RPC (Performance)

`getGroupTasks` previously fetched all subtask rows for every group in the domain and aggregated counts in Node. At scale (500 groups × 50 subtasks = 25 000 rows) this would transfer 25 000 rows to render a count badge and 4 avatars.

**Modified files:**

- `supabase/migrations/20260528000020_group_task_summaries_rpc.sql` — `get_group_task_summaries(p_status, p_priority)` RPC; GROUP BY on `task_groups` LEFT JOIN `tasks`; returns `subtask_total`, `subtask_completed`, `assignee_ids uuid[]` per group; `SECURITY DEFINER SET search_path = public`; access control replicated in WHERE clause
- `src/lib/services/tasks-service.ts` — `getGroupTasks` rewritten: one RPC call + one batch profile fetch = exactly 2 DB round-trips; zero subtask rows transferred; `subtask_total`/`subtask_completed` cast with `Number()` (Q-09); `assignee_ids` sliced to max 4 in service layer; `GroupTaskSummaryRaw` internal type defined; `any` cast on `.rpc()` because generated types predate the migration
- `src/lib/CLAUDE.md` — RPC aggregation pattern documented for future reference

**Verified:** `pnpm tsc --noEmit` passes; `getGroupTasks` makes exactly 2 DB round-trips; no subtask rows fetched; `GroupTasksTab` component unchanged.

---

## 2026-05-28 — Trigger.dev reminder race window: documented as closed by SDK idempotency guarantee (A-12)

### Modified files
- `src/trigger/task-reminders.ts` — added a detailed comment block at the top of the file documenting the Trigger.dev v3 idempotency key deduplication guarantee for DELAYED runs; confirms the list-snapshot race described in A-12 is structurally impossible because `tasks.trigger()` with an idempotency key matching an existing DELAYED run returns the existing run handle (`isCached: true`) rather than creating a second distinct run; evidence cited from `@trigger.dev/core@4.4.6` apiClient types (line 55) and SDK shared.js (lines 1063–1110); no code change to scheduling or cancellation logic required; no migration required

### Decision log
- Approach chosen: document guarantee (not store-run-ID-in-DB), because the SDK evidence confirms deduplication makes a second concurrent DELAYED run with the same idempotency key impossible. The store-run-ID path would have required migration 0020 + adminClient write in scheduleTaskReminder — complexity not warranted when the race window does not exist.

---

## 2026-05-28 — Tech debt register created; TD-001 logged for leads.ts

### New files
- `docs/tech-debt.md` — tech debt register; tracks pre-existing violations identified but not fixed in the current session; each item has file, rule, what, fix, and logged date

### TD-001 logged
- `src/lib/actions/leads.ts` — inline `getCallerProfile()` is a Rule A-03 / Rule 04 duplicate of `getCurrentProfile()` from `profiles-service.ts`; inline comment added at the violation site referencing TD-001; fix path documented (delete inline fn, import canonical, replace 8 call sites); must be resolved when `leads.ts` is next touched for any reason

---

## 2026-05-28 — tasks.ts: replace local getCallerProfile duplicate with canonical getCurrentProfile (Rule 03/04)

### Modified files
- `src/lib/actions/tasks.ts` — removed local `getCallerProfile()` inline definition (was duplicating `getCurrentProfile` from `profiles-service.ts`); replaced with `import { getCurrentProfile } from '@/lib/services/profiles-service'`; all 7 call sites updated to `getCurrentProfile()`; `createClient` import retained because `canMutateTask` still uses it for the manager domain lookup (user-scoped client, not admin)

---

## 2026-05-28 — Security fix: updateTaskStatusAction + updateTaskAction missing application-layer auth (A-09/S-06)

### Modified files
- `src/lib/actions/tasks.ts` — added `canMutateTask(caller, task)` helper that explicitly enforces the same access rules as the tasks RLS UPDATE policy (agent: `assigned_to OR created_by`; manager: same OR group subtask in caller's domain via `task_groups` join; admin/founder: unrestricted); wired into `updateTaskStatusAction` (step 4 — was entirely absent) and `updateTaskAction` (step 4 — replaced the agent-only check that left managers unguarded); both actions now fetch `group_id` in their task select to support the manager domain check; both fetches still use the user client (RLS layer 1) before the `adminClient` write

---

## 2026-05-28 — Security fix: task_messages RLS creator visibility + manager domain scope (A-09)

### Migration 0019
- `supabase/migrations/20260528000019_task_messages_rls_creator.sql` — drops the A-09-violating `task_messages_select` and `task_messages_insert` policies from migration 0017; replaces both with three-tier visibility: (1) assignee or creator of the task — any role, always visible; (2) manager whose domain matches the parent `task_groups.domain` for `group_subtask` tasks; (3) admin/founder unrestricted; fixes two bugs: task creator locked out of own chat thread, and manager cross-domain message leak

---

## 2026-05-28 — Security fix: task_groups RLS domain enforcement (A-09)

### Migration 0018
- `supabase/migrations/20260528000018_task_groups_rls_domain.sql` — drops the A-09-violating `task_groups_select` and `task_groups_update` policies from migration 0017; replaces both with domain-scoped versions: `created_by = auth.uid() OR get_user_role() IN ('admin', 'founder') OR (get_user_role() = 'manager' AND get_user_domain() = domain)`; managers can no longer read or mutate task_groups rows belonging to a different domain

---

## 2026-05-28 — Tasks Page (Personal + Group tabs)

### New files
- `src/app/(dashboard)/tasks/page.tsx` — Server Component; fetches `getPersonalTasks` + `getGroupTasks` in `Promise.all`; passes data as props to `TasksShell`; guest → redirect `/dashboard`
- `src/app/(dashboard)/tasks/TasksShell.tsx` — `'use client'` tab shell; two tabs: "Personal" + "Group"; active tab persisted to `?tab=personal|group` URL param via `useSearchParams` + `useTransition` + `router.push`; browser back/forward works
- `src/components/tasks/PersonalTasksTab.tsx` — filter bar (Status multi-select pills, Priority multi-select pills, due date range); quick-add inline row (priority selector + title input + due date + assignee picker, Enter=save, Esc=cancel); task list rows with 3px priority left border, title, due date, status pill; click row → `TaskModal`; "Load more" cursor pagination; `AssigneePickerModal` portaled to `document.body`; Playfair italic empty state
- `src/components/tasks/GroupTasksTab.tsx` — accordion group list; one group expanded at a time (no conflicting Framer Motion); group row: title, priority border, status pill, due date, subtask count + progress%, member avatar stack (max 4 + overflow); subtask rows: title + status pill + assignee avatar; subtask add row at bottom of expanded group with assignee picker; click subtask → `TaskModal`; `AssigneePickerModal` portaled to `document.body`

### Modified files
- `src/lib/services/tasks-service.ts` — `getPersonalTasks` now returns `PersonalTasksResult = { tasks, hasMore, nextCursor }`; LIMIT 50 + 1 (detects `hasMore` without COUNT query); cursor pagination via `due_at > cursor`; new exports: `PersonalTasksResult`, `PERSONAL_TASKS_PAGE_SIZE`
- `src/components/layout/Sidebar.tsx` — "Tasks" nav item added (`CheckSquare`, `/tasks`); position: between Leads and Performance in `MAIN_NAV`

### Contracts established
- `getPersonalTasks` always returns `PersonalTasksResult` — never `Task[]` alone
- `hasMore` is detected by fetching `LIMIT + 1` rows — never a separate COUNT query
- Accordion: `expandedGroupId` state is a single `string | null` — guarantees only one group expanded at a time
- `AssigneePickerModal` always portals to `document.body` when rendered inside a scroll container (never inline)
- Tasks page data is fetched server-side on load — `TasksShell` does not re-fetch on tab switch

### Sign-off
- ✓ `pnpm tsc --noEmit` passes with zero errors
- ✓ `?tab=` URL param persists on browser back/forward
- ✓ `getPersonalTasks` uses cursor pagination — no unbounded SELECT
- ✓ `AssigneePickerModal` portals to `document.body`
- ✓ Only one group task row expanded at a time (accordion)
- ✗ Tasks not fetched client-side on tab switch — data is passed from the Server Component

---

## 2026-05-28 — Task Modal + Chat Panel (Prompt 3)

### New files
- `src/components/tasks/TaskModal.tsx` — two-column task detail modal (55% details / 45% chat); inline title + description editing with 400ms debounce, flushed synchronously on close; 6-state segmented status control (2-col grid at ≤480px to prevent overflow); 3-pill priority selector; assignee avatar + meta fields; Framer Motion entrance 200ms ease-out-expo; mobile full-screen bottom sheet with swipe-down-to-dismiss; no `<form>` tag, no internal data fetching
- `src/components/tasks/TaskChatPanel.tsx` — scrollable message list with auto-scroll; Realtime subscription on `task_messages` filtered by `task_id`, channel `task-messages-${taskId}`; optimistic inserts confirmed on Realtime echo, rolled back + `toast.danger` on error; growing textarea (1–3 lines), Enter to send, Shift+Enter newline; Playfair italic empty state; exports `TaskMessageWithAuthor` type
- `src/components/tasks/AssigneePickerModal.tsx` — nested modal (`z-index: var(--z-modal) + 11`); domain tabs (only populated domains shown); client-side search; avatar + role badge per user row; single select + Confirm; exports `AssignableUser` type

### Contracts established
- `TaskChatPanel` channel name must always be `task-messages-${taskId}` — never bare `task-messages`
- `TaskModal` never fetches its own data — receives `task`, `assignee`, `initialMessages` as props
- Debounced inline edits (title/description) are always flushed synchronously in `flushAndClose` before unmounting — no silent data loss on quick close

### Sign-off
- ✓ `pnpm tsc --noEmit` passes with zero errors
- ✓ Realtime channel uses `taskId` in name
- ✓ Debounced saves flush on modal close
- ✓ All colours reference CSS token vars — zero hex values
- ✓ Mobile status grid uses 2-col at ≤480px
- ✗ No `<form>` tags used anywhere in the three components

---

## 2026-05-28 — OS Tasks: service + action layer

### New files
- `src/lib/constants/task-constants.ts` — `TASK_PRIORITY`, `TASK_STATUS`, `TASK_CATEGORY` typed const objects; labels, colors as CSS token names (never hex), sort order
- `src/lib/validations/task-schemas.ts` — `CreatePersonalTaskSchema`, `CreateGroupTaskSchema`, `CreateSubtaskSchema`, `UpdateTaskSchema`, `UpdateTaskStatusSchema`, `AddTaskMessageSchema`, `DeleteTaskSchema` + inferred input types; priority/status as inline `z.enum`; all text fields run through `sanitizeText`
- `src/lib/services/tasks-service.ts` — `getPersonalTasks`, `getGroupTasks`, `getGroupSubtasks`, `getTaskById`, `getTaskMessages`; `getGroupTasks` uses a single flat query + in-memory aggregation to avoid N+1; batch profile fetch for assignee avatars; composite types: `TaskGroupRow`, `SubtaskWithAssignee`, `TaskWithMessages`, `AssigneeSlim`
- `src/trigger/task-reminders.ts` — `scheduleTaskReminder(taskId, dueAt, assignedTo)` one-time delayed job; `cancelTaskReminder(taskId)` finds and cancels by tag (`task-reminder-${taskId}`); past-date guard: no-op when `dueAt - 30min < now()`; `sendTaskReminderTask` exported for Trigger.dev scan
- `src/lib/actions/tasks.ts` — `createPersonalTaskAction`, `createGroupTaskAction`, `createSubtaskAction`, `updateTaskStatusAction`, `updateTaskAction`, `deleteTaskAction`, `addTaskMessageAction`; all actions: Zod first, `{ data, error }` return, no throws; `deleteTaskAction` cancels Trigger.dev reminder **before** DB delete — if cancel throws, delete is aborted

### Package added
- `@trigger.dev/sdk@4.4.6` — async job scheduling for task reminders; one-time delayed jobs via `tasks.trigger()` with `delay: Date`; cancellation via `runs.cancel()` using tag-based run discovery

### Updated docs
- `src/lib/CLAUDE.md` — services registry, actions registry, Trigger.dev jobs section, `createNotification` call sites for tasks

### Pre-mortem invariants met
- `getGroupTasks`: zero N+1 — one group query + one subtask query + one profile query, then O(subtasks) aggregation in memory
- `scheduleTaskReminder`: no-op guard when `dueAt - 30min <= now()`; never errors on past dates
- `deleteTaskAction`: Trigger.dev cancel precedes DB delete; cancel failure aborts delete
- All `TASK_STATUS` colors reference CSS token names (`var(--theme-accent)` etc.) — no hex values

---

## 2026-05-28 — Migration 0017: OS Tasks schema (task_groups, task_messages, tasks core upgrade)

### Migration `20260528000017_os_tasks.sql`

**Part A — tasks core table extended:**
- `title text NOT NULL` added; existing rows backfilled with `'(untitled)'`
- `description text` added (nullable)
- `priority text NOT NULL DEFAULT 'normal'` added; CHECK `IN ('urgent','high','normal')`
- `task_category text NOT NULL DEFAULT 'personal'` added; CHECK `IN ('personal','group_subtask','gia_followup')`; backfilled: rows with a `task_gia_meta` match → `'gia_followup'`, others → `'personal'`
- `group_id uuid` added; FK → `task_groups(id) ON DELETE CASCADE`; nullable
- Status enum migrated: `'pending'` → `'to_do'`, `'done'` → `'completed'`; new CHECK: `to_do | in_progress | in_review | completed | error | cancelled`
- New indexes: `idx_tasks_category`, `idx_tasks_group_id`, `idx_tasks_priority`

**Part B — `task_groups` table created:**
- Full RLS: SELECT (owner or manager+), INSERT (any authed), UPDATE (owner or manager+), DELETE (admin/founder)
- `update_updated_at()` trigger reused (not recreated)
- Indexes: `idx_task_groups_domain` (partial), `idx_task_groups_created_by`

**Part C — `task_messages` table created (append-only):**
- No UPDATE or DELETE RLS policies — enforced at policy level (rule A-11)
- SELECT/INSERT RLS mirrors tasks visibility via indexed EXISTS subquery (no full table scan)
- Realtime enabled: `ALTER PUBLICATION supabase_realtime ADD TABLE task_messages`

**Part D — notifications type expanded:**
- `task_assigned` added to `notifications_type_check` CHECK constraint

### TypeScript (`src/lib/types/database.ts`)
- `TaskStatus` updated: `to_do | in_progress | in_review | completed | error | cancelled`
- `TaskPriority` type added: `urgent | high | normal`
- `TaskCategory` type added: `personal | group_subtask | gia_followup`
- `Task` type extended: `title`, `description`, `priority`, `task_category`, `group_id` added
- `TaskGroup` type added
- `TaskMessage` type added
- `NotificationType` extended: `task_assigned` added
- `Database` tables: `task_groups` and `task_messages` entries added; `tasks` Insert type updated

### Components
- `src/components/notifications/NotificationItem.tsx` — `task_assigned` case added to exhaustive switch (maps to `CheckSquare` icon); `task_due` was already present; Q-11 still satisfied

---

## 2026-05-28 — assertNever moved to shared util

- `src/lib/utils/assert-never.ts` — created. Single export, three lines. `assertNever(x: never): never` is now the canonical exhaustive-switch helper for the entire codebase. Use it as the final return of any `switch` over a union type — TypeScript errors at build time if any case is unhandled.
- `src/components/notifications/NotificationItem.tsx` — inline `assertNever` definition removed. Now imports from `@/lib/utils/assert-never`. `default: return Bell` branch removed — the switch is fully exhaustive over `NotificationType`.
- `docs/The_Rules.md` — Q-11 added: exhaustive switches must use `assertNever` from `lib/utils/assert-never.ts`. No `default` branch on union-type switches.

---

## 2026-05-28 — Phase 9 post-ship: toast store hardening + exhaustive notification icon map

- `src/lib/toast.ts` — `_update()` now patches items in `_queue` as well as `_toasts`. A `toast.resolve(id)` called while the loading toast is still queued (3 other toasts visible) no longer silently drops the patch — the resolved state is carried into the item when it promotes to visible. `subscribeQueue` removed from public API; `"queue"` renamed to `"_queue_internal"` to prevent external listeners from registering without cleanup.
- `src/components/ui/toast-provider.tsx` — `useEffect` made explicit: `unsubscribe` assigned to a named const before return, plus `setToasts(toastStore.getToasts())` on mount to sync any toasts fired before the provider mounted (hot reload edge case).
- `src/components/notifications/NotificationItem.tsx` — `default: return Bell` branch replaced with `return assertNever(type)`. Adding a new `NotificationType` to `database.ts` without updating the icon map now fails at build time, not silently at runtime.

---

## 2026-05-28 — Phase 9 — Toast system + Persistent notification inbox shipped

### Part A — Toast System (ephemeral, client-only, no DB)

- `src/lib/toast.ts` — singleton store with pub/sub via `EventTarget` (no React dependency, no zustand). Exports `toast.success/danger/warning/info/loading/lia/resolve/dismiss/dismissAll`. `danger` duration = 0 (never auto-dismisses). `loading` duration = 0 (lives until `resolve()`). `resolve()` patches in-place by same id — no flicker.
- `src/components/ui/toast-item.tsx` — single toast card. Section 13.2 anatomy. 3px living bar via `eia-toast-bar-breathe` CSS keyframe (fires once; `lia` type uses continuous `eia-lia-breathe`). Warning depletion bar via new `toast-deplete` CSS keyframe (linear timing — intentional). Icon crossfade on loading→resolved via `AnimatePresence mode="wait"`. Hover/focus pauses dismiss timer; leaving resumes remaining time.
- `src/components/ui/toast-provider.tsx` — subscribes to toast store. Max 3 in DOM, queue the rest. Section 13.6 stagger: scale 1.0/0.95/0.90, translateY 0/−8px/−14px. Desktop: bottom-right. Mobile: bottom full-width, clears 80px nav.
- `src/hooks/useToast.ts` — thin re-export of `toast` singleton for React consumers.
- `src/app/(dashboard)/layout.tsx` — `<ToastProvider />` added after `<Sidebar />`, outside scroll container.
- `src/styles/design-tokens.css` — `toast-deplete` keyframe added (Section 15, after existing animations).

### Part B — Persistent Notification Inbox (DB + Realtime + Bell UI)

- Migration `20260528000016_notifications.sql` — `notifications` table; `recipient_id` FK → `profiles(id)` ON DELETE CASCADE; `action_url` CHECK constraint rejects absolute URLs; partial index on unread; full index on all; RLS: SELECT own only, UPDATE own only (mark read), no INSERT policy (service-role only), no DELETE; `ALTER PUBLICATION supabase_realtime ADD TABLE notifications`.
- `src/lib/types/database.ts` — `NotificationType`, `Notification` types added.
- `src/lib/services/notifications-service.ts` — `getUnreadNotifications`, `getNotifications`, `markNotificationRead`, `markAllNotificationsRead` (server client); `createNotification` (admin/service-role client only).
- `src/lib/actions/notifications.ts` — `markNotificationReadAction(id)`, `markAllReadAction()`. Both begin with Zod. Both return `{ data, error }`.
- `src/hooks/useNotifications.ts` — THE single owner of notification state. Seeds from server prop. Realtime subscription filtered strictly at channel level by `recipient_id=eq.${userId}`. Optimistic updates for markRead/markAllRead. Unsubscribes on unmount.
- `src/components/notifications/NotificationBell.tsx` — bell icon, single unread dot (never a number badge), wraps panel.
- `src/components/notifications/NotificationPanel.tsx` — dropdown 380px, scrollable list 420px max, empty state Playfair italic, header + mark-all-read, entrance 150ms ease-out-expo.
- `src/components/notifications/NotificationItem.tsx` — unread dot (always rendered, transparent when read), type icon, title/body/timestamp (`formatRelativeTime`). Validates `action_url` as relative path before `router.push`.
- `src/lib/utils/dates.ts` — `formatRelativeTime()` added.
- `src/components/layout/Sidebar.tsx` — stub bell replaced with `<NotificationBell>`. Accepts `initialNotifications` prop.
- `src/app/(dashboard)/layout.tsx` — fetches `getNotifications(profile.id)` and passes as `initialNotifications` to Sidebar.
- `src/lib/actions/leads.ts` — `createNotification` wired: `updateLeadStatus` → `won` notifies domain managers; `assignLead` → notifies receiving agent; `createManualLead` → notifies assigned agent when different from caller.
- `src/components/CLAUDE.md` — Toast system and Notification components documented.
- `src/components/notifications/CLAUDE.md` — created.
- `src/lib/CLAUDE.md` — `createNotification()` call sites and action patterns documented.

---

## 2026-05-28 — Performance page — fix: all_time delta arrows verified as "—", agentCount and mean-of-means documented

- `src/lib/services/performance-service.ts` — comments added: unweighted mean-of-means is intentional (each agent counts equally regardless of lead volume); `agentCount` is roster-based not activity-based; both design decisions documented with guidance on how to change them if ever needed
- `src/app/(dashboard)/performance/CLAUDE.md` — same two contracts documented: averaging method and agentCount distinction
- Verified (no code change needed): `all_time` period renders `"—"` on all four delta arrows. Chain: `getPreviousPeriodDateRange('all_time') → null` → `getPreviousPeriodCoreMetrics` returns `null` without querying → `CoreFourGrid` receives `previous={null}` → all four `delta:` entries short-circuit to `null` → `MetricCard` renders `"—"` in `--theme-text-tertiary`

---

## 2026-05-28 — Number formatting cleanup — formatCompact/formatPercent applied across 5 widget and campaign components — 2026-05-28

- `src/components/dashboard/widgets/AgentTasksWidget.tsx` — `tasks.length` and `newLeadsCount` wrapped with `formatCompact()`
- `src/components/dashboard/widgets/ManagerLeadStatusWidget.tsx` — `grandTotal`, `t.count` (legend), `agent.total` (per-agent row) wrapped with `formatCompact()`
- `src/components/dashboard/widgets/ManagerLeadVolumeWidget.tsx` — `total` stat display wrapped with `formatCompact()`; `tickFormatter={(v) => formatCompact(v)}` added to `<YAxis>`
- `src/components/dashboard/widgets/ManagerCampaignWidget.tsx` — `tickFormatter={(v) => formatCompact(v)}` added to `<YAxis>`
- `src/components/campaigns/CampaignCard.tsx` — `{count}` in `MetricPill` wrapped with `formatCompact(count)`

---

## 2026-05-28 — Campaign detail: metrics strip (6 stat cards + agent distribution) — Phase 8

- Migration `20260528000015_campaign_detail_metrics.sql` — `get_campaign_detail_metrics` RPC (status/outcome counts + `avg_hours_to_first_touch` via lateral join to `lead_activities`); `get_campaign_agent_distribution` RPC (single `GROUP BY assigned_to` join to `profiles` — never N+1)
- `src/lib/utils/numbers.ts` — `formatCompact`, `formatPercent`, `formatCount`, `formatCurrency` fully implemented per design-dna §8.2 (were stubs previously)
- `src/lib/types/database.ts` — `CampaignDetailMetrics` (extends `CampaignMetrics` + `avg_hours_to_first_touch: number | null`) and `AgentDistributionRow` types added
- `src/lib/services/leads-service.ts` — `getCampaignDetailMetrics(campaignName, filters)` and `getCampaignAgentDistribution(campaignName, filters)` added; both cast `bigint → Number()` per Q-09; both silently return null/[] on RPC error
- `src/components/campaigns/CampaignMetricsStrip.tsx` — server component; 6 stat cards (Total Leads, Won + conv. rate, Active Pipeline, Junk Rate, RNR, Avg. First Touch); division-by-zero guarded on all rate fields; all colours CSS tokens
- `src/components/campaigns/AgentDistributionBar.tsx` — `'use client'`; stacked bar `h-2 radius-full`; Framer Motion `layoutId` + `animate={{ width }}` per segment (never CSS width transition); legend with colour dots + name + count; hidden when `distribution.length <= 1`
- `src/components/campaigns/CampaignMetricsStripSkeleton.tsx` — 6 skeleton stat cards per §11.3; stagger 0→320ms per §11.4
- `src/app/(dashboard)/campaigns/[id]/page.tsx` — two independent Suspense boundaries (metrics + table stream separately); `CampaignMetricsAsync` runs `Promise.all([getCampaignDetailMetrics, getCampaignAgentDistribution])` in parallel; `campaignName` decoded once and used identically for both RPCs and the leads query (no mismatch)
- `src/app/(dashboard)/campaigns/CLAUDE.md` — updated: detail page architecture, two new RPCs, Promise.all contract, division-by-zero guard, agent distribution bar rule

---

## 2026-05-28 — Campaign analytics command center — list + detail pages, get_campaign_metrics RPC, two indexes — Phase 8

- Migration `20260528000014_campaign_analytics.sql` — two partial indexes (`idx_leads_campaign_domain`, `idx_leads_campaign_status`); `get_campaign_metrics` SQL function (STABLE SECURITY DEFINER) using conditional `COUNT(*) FILTER (WHERE ...)` aggregates — one round trip regardless of campaign count; `p_domain`, `p_date_from`, `p_date_to` params
- `src/lib/types/database.ts` — `CampaignMetrics` type added; `CampaignFilters` type added
- `src/lib/services/leads-service.ts` — `getCampaignMetrics(role, callerDomain, filters)` added; manager domain constraint enforced before RPC call; RPC column names mapped to clean `CampaignMetrics` shape; `bigint` → `number` cast
- `src/components/campaigns/CampaignFilters.tsx` — `'use client'`; Domain (single select, hidden for manager), Date range; `useTransition` on all navigations; Clear button when any filter active
- `src/components/campaigns/CampaignCard.tsx` — interactive card per §5.04; hover `--shadow-2 + translateY(-1px)`; left: campaign name + domain badge; right: 7 metric pills (total/won/in_discussion/nurturing/lost/junk/rnr); Framer Motion staggered entrance §11.4; `router.push('/campaigns/[encodedName]')` on click
- `src/components/campaigns/CampaignListSkeleton.tsx` — 5 skeleton rows; card shell + name/domain-pill + 7 metric-pill skeletons; stagger 0/80/160/240/320ms §11.4
- `src/components/campaigns/CampaignListAsync.tsx` — async server component; direct child of Suspense; calls `getCampaignMetrics`; Playfair italic empty state
- `src/app/(dashboard)/campaigns/page.tsx` — server component; agent/guest → redirect `/dashboard`; manager domain pre-locked; `<CampaignFilters>` + `<Suspense><CampaignListAsync /></Suspense>`
- `src/app/(dashboard)/campaigns/[id]/page.tsx` — server component; `id` = `encodeURIComponent(utm_campaign)`; `decodeURIComponent` on params; calls `getLeadsByRoleCached` with `{ campaign: decodedName }`; renders existing `<LeadsTable>` + `<LeadsPagination>`
- `src/components/layout/Sidebar.tsx` — "Campaigns" nav item added (`TrendingUp` icon, `/campaigns` route); visible for manager + admin + founder; "Analytics" section label added
- `src/app/(dashboard)/campaigns/CLAUDE.md` — created: RPC pattern, campaign id encoding contract, domain-lock rule, URL param keys

---

## 2026-05-28 — Performance page — team benchmarks layer (domain avg. touch rate, response time, conversion rate; agentCount guard; accent pip for above-average metrics) — Phase 9

- `src/lib/services/performance-service.ts` — `TeamBenchmarks` type exported; `getTeamBenchmarks(callerDomain, period)` added: 1 query for peer agent IDs, 3 flat queries scoped to `assigned_to IN (agentIds)` (never N queries); `agentCount < 2` guard returns all nulls; `leadsWon` intentionally excluded
- `src/app/(dashboard)/performance/PerformanceAsync.tsx` — sixth call added to `Promise.all`; `domain` prop added (server-side from `profile.domain`, never a URL param); `benchmarks` passed to `CoreFourGrid`
- `src/app/(dashboard)/performance/page.tsx` — `domain={profile.domain}` passed to `PerformanceAsync`
- `src/components/performance/CoreFourGrid.tsx` — `TeamBenchmarks` type imported; `benchmarks: TeamBenchmarks | null` prop added; benchmark line renders below delta per card (absent not "—" when null); accent pip on above-average metrics; response time uses inverse comparison (lower is better)
- `src/app/(dashboard)/performance/PerformanceSkeleton.tsx` — two extra skeleton lines added to Touch Rate, Avg Response Time, Conversion Rate cards; Leads Won card unchanged
- `src/app/(dashboard)/performance/CLAUDE.md` — updated with `getTeamBenchmarks` signature, `TeamBenchmarks` type, agentCount guard rule, benchmark null contract (absent vs "—")

---

## 2026-05-28 — Performance page — agent self-view (Core Four metrics, effort layer, call outcome breakdown, period selector) — Phase 8

- Migration `20260528000013_performance_indexes.sql` — three partial indexes: `idx_lead_activities_actor_status`, `idx_lead_notes_author_outcome`, `idx_leads_assigned_status_created`
- `src/lib/services/performance-service.ts` — new dedicated service; `getCoreFourMetrics`, `getEffortMetrics`, `getCallOutcomeBreakdown`, `getPreviousPeriodCoreMetrics`, `getPeriodDateRange`, `getPreviousPeriodDateRange`, `_getCoreFourMetricsForRange`; IST-correct period boundaries; null contract for `avgResponseTimeMinutes` and `conversionRate`
- `src/lib/utils/dates.ts` — `formatDuration(minutes: number | null)` added: null → "—", < 60m → "48m", ≥ 60m → "2h 34m"
- `src/app/(dashboard)/performance/page.tsx` — agent-only server component; non-agent roles redirect to `/dashboard`; reads `searchParams.period`; Suspense boundary around `PerformanceAsync`; `PerformanceMotivationalFooter` (Playfair italic, Lia's voice)
- `src/app/(dashboard)/performance/PerformanceAsync.tsx` — async server component; direct child of Suspense; calls all 5 service functions in `Promise.all`
- `src/app/(dashboard)/performance/PerformanceSkeleton.tsx` — 2×2 Tier-1 + 4 compact Tier-2 + 1 wide Tier-3; stagger 0/80/160/240ms per §11.4
- `src/components/performance/PerformancePeriodSelector.tsx` — `'use client'`; URL param only; `useTransition` on all pushes; tab-style ghost buttons
- `src/components/performance/CoreFourGrid.tsx` — `'use client'`; 2×2 grid; Playfair serif primary values; unicode delta arrows (↑ ↓); success/danger text colours; null → "—"
- `src/components/performance/EffortGrid.tsx` — `'use client'`; 4-col compact cards; live-state dots on in_discussion (info) and nurturing (warning); sans-serif numbers
- `src/components/performance/CallOutcomeBar.tsx` — `'use client'`; horizontal segmented bar; all CSS variable colours; Playfair italic empty state per V-09
- `src/components/layout/Sidebar.tsx` — Performance nav item added (BarChart2, below Leads)
- `src/app/(dashboard)/performance/CLAUDE.md` — created

---

## 2026-05-28 — Dashboard widgets — fix: startTransition called during render

- `src/components/dashboard/widgets/AgentTasksWidget.tsx` — initial data fetch moved from render-phase guard (`if (!loaded && !isPending)`) into `useEffect`; `cancelled` flag prevents state update on unmounted component
- `src/components/dashboard/widgets/ManagerLeadStatusWidget.tsx` — same fix applied
- `src/components/dashboard/widgets/ManagerCampaignWidget.tsx` — same fix applied

Root cause: `startTransition` is a side effect and cannot be called during the render phase. React throws "Cannot call startTransition while rendering." All three widgets now use the same `useEffect` + `startTransition` pattern already present in `AgentActivityWidget` and `ManagerLeadVolumeWidget`.

---

## 2026-05-28 — Dashboard widget system: canvas, registry, useDashboardLayout hook, 5 Gia widgets (agent tasks, agent activity, manager status, manager volume, manager campaigns) — Phase 7

- `src/lib/constants/dashboard-widgets.ts` — widget registry: 5 entries with id, label, description, roles, domains, defaultSize, module; `DEFAULT_LAYOUT_BY_ROLE` per role; `WIDGET_MAP`, `isValidWidgetId`
- `src/hooks/useDashboardLayout.ts` — localStorage layout hook; key `eia:dashboard:layout:${userId}:v1`; validates ids against registry; hydrates after mount; returns layout + CRUD operations
- `src/components/dashboard/WidgetSkeleton.tsx` — size-aware shimmer skeleton
- `src/components/dashboard/DashboardWidgetSlot.tsx` — Suspense boundary; static `React.lazy` import map; 150ms min skeleton; edit mode chrome
- `src/components/dashboard/DashboardCanvas.tsx` — 2-col grid; `@dnd-kit/sortable` drag; edit mode toggle; hydration-safe full-canvas skeleton
- `src/lib/services/dashboard-service.ts` — dedicated dashboard queries; never mixed into `leads-service.ts`
- `src/lib/actions/dashboard.ts` — 5 server actions; all re-verify via `getCurrentProfile()`
- `src/components/dashboard/widgets/AgentTasksWidget.tsx` — overdue + today tasks + new leads count
- `src/components/dashboard/widgets/AgentActivityWidget.tsx` — Realtime subscription filtered by actor_id; Framer Motion slide-in on new items; subscription cleaned up on unmount
- `src/components/dashboard/widgets/ManagerLeadStatusWidget.tsx` — stacked bar pipeline + per-agent breakdown
- `src/components/dashboard/widgets/ManagerLeadVolumeWidget.tsx` — Recharts LineChart; period toggle; all colours CSS vars
- `src/components/dashboard/widgets/ManagerCampaignWidget.tsx` — Recharts stacked BarChart per utm_campaign
- `src/app/(dashboard)/dashboard/page.tsx` — replaced placeholder with `<DashboardCanvas>`
- `src/app/(dashboard)/CLAUDE.md` — created: full widget system documentation
- `recharts@3.8.1` — added (Q-05: first chart package; dashboard widgets only; Recharts not imported at page level — only inside widget components that use it)

---

## 2026-05-28 — Gia — Campaign ad video preview modal — Phase 6

Click `utm_campaign` on the lead dossier to play the Meta ad creative that generated the lead. If no creative row exists the field renders as plain static text — zero visual change.

- Migration 0012: `ad_creatives` table — `campaign_key` (UNIQUE, normalised via CHECK constraint), `video_url`, `thumbnail_url`, `ad_name`, `notes`; RLS: SELECT open to all authenticated, INSERT/UPDATE/DELETE admin/founder only; `idx_ad_creatives_campaign_key` index
- `src/lib/types/database.ts` — `AdCreative` type added; `ad_creatives` table added to `Database.public.Tables`
- `src/lib/services/ad-creatives-service.ts` — `getAdCreativeForCampaign(campaignName)`: normalises input (toLowerCase + trim), queries `ad_creatives` by `campaign_key`, returns `AdCreative | null`, never throws
- `src/components/leads/CampaignVideoModal.tsx` — new modal composing `ui/modal.tsx`; `max-w-2xl`; native `<video>` with `autoPlay muted playsInline controls`; video.play() via ref after mount with silent `NotAllowedError` catch; Framer Motion entrance from `ui/modal.tsx` (350ms ease-out-expo)
- `src/components/leads/LeadInfoCard.tsx` — converted to `'use client'`; accepts `adCreative?: AdCreative | null` prop; `AttributionTrigger` sub-component added; campaign field renders as interactive trigger (cursor-pointer, hover → `--theme-accent` + underline, 150ms transition) when creative exists; `ad_name` field also interactive when `adCreative.ad_name === lead.ad_name`; `CampaignVideoModal` rendered conditionally
- `src/app/(dashboard)/leads/[id]/page.tsx` — `getAdCreativeForCampaign(lead.utm_campaign)` added to existing `Promise.all` block; skipped (returns null) when `lead.utm_campaign` is null; result passed as `adCreative` prop to `LeadInfoCard`

---

## 2026-05-28 — Gia — Won action restored on lead dossier (In Discussion)

`StatusActionPanel` — Won button + confirm modal when status is `in_discussion`; calls existing `updateLeadStatus('won')`. Restores spec behaviour removed during the Level Up refactor.

---

## 2026-05-28 — Gia — Leads table Assigned To column shows agent name

`getLeadsByRole` now joins `profiles!leads_assigned_to_fkey(full_name)` in the same query; `LeadWithAssignee` type added. `LeadsTable` Assigned To cell renders `assignee.full_name` instead of the raw UUID.

---

## 2026-05-28 — Layout — Sidebar logo: remove domain module label

Removed the italic module name (Gia, Hia, Sia, etc.) below the sidebar logo. Deleted unused `DOMAIN_MODULE_NAMES` from `src/lib/constants/domains.ts`.

---

## 2026-05-28 — Gia — Fix getNextLeadTask broken filter (Phase 6)

Inverted join direction in `getNextLeadTask` — now starts from `tasks` with `!inner` on `task_gia_meta` to filter by `lead_id`. Previous version started from `task_gia_meta` and used dot-notation (`.eq('tasks.status', ...)`, `.order('tasks.due_at', ...)`) which PostgREST / Supabase JS client silently drops, causing the status filter and ordering to be no-ops and `.limit(1)` to return an arbitrary row. Native column filters (`status`, `due_at`) are now applied directly on the root `tasks` table. Return type `Task | null` and `LeadDossierTasksAsync` unchanged.

---

## 2026-05-28 — Gia — Fix N+1 queries on lead dossier (Phase 6)

Repaired `Relationships` arrays in `database.ts` for `lead_notes`, `lead_activities`, `tasks`, and `task_gia_meta` — all were `[]` despite FK constraints existing in Postgres. Collapsed `getLeadNotesFull`, `getLeadActivitiesFull`, and `getNextLeadTask` from 5 sequential round trips to 3 parallel single-query joins using inline FK disambiguators. `getProfileNameMap` is no longer called from any lead service function (marked for future removal). Updated `LeadNoteWithAuthor` (`author.full_name`) and `LeadActivityWithActor` (`actor?.full_name`) types and all consumers (`LeadNotesSection`, `LeadActivityLog`). `pnpm tsc --noEmit` passes with zero errors.

---

## 2026-05-28 — Gia — Status pills moved from page header into LeadsTable toolbar row

2026-05-28 — Gia — Status pills moved from page header into LeadsTable toolbar row

---

## 2026-05-28 — Gia — Leads page header: serif title + status summary pills

2026-05-28 — Gia — Leads page header: serif title + status summary pills (eyebrow removed per product)

---

## 2026-05-28 — Gia — LeadInfoCard contact fields redesign

LeadInfoCard contact fields redesigned — labelled datum row pattern with consistent icon rail, mono phone, micro-label typography; 2026-05-28, Phase 6.

---

## 2026-05-28 — Gia — Leads: server-side search, pagination, phone text index

Leads — server-side search (ilike across name/phone/email), pagination (50/page, URL-param driven), migration 0011 phone text index; 2026-05-28, Phase 6.

### Files added

- `supabase/migrations/20260528000011_lead_search_index.sql` — `idx_leads_phone_text` on `leads(phone text_pattern_ops) WHERE archived_at IS NULL`; enables ILIKE substring search without sequential scan.
- `src/components/leads/LeadsPagination.tsx` — `'use client'` component; "Showing X–Y of Z leads" count; Prev/Next buttons with `ChevronLeft`/`ChevronRight`; `useTransition` on all navigation; `pointer-events: none` on disabled state (not just `opacity`); rendered only when `totalCount > pageSize`.

### Files modified

- `src/lib/types/database.ts` — `LeadFilters.search: string | null` added.
- `src/lib/services/leads-service.ts` — `getLeadsByRole` return type changed from `Lead[]` to `LeadsResult = { leads, totalCount }`. Count obtained via `{ count: 'exact', head: false }` on the same query builder — one round trip. Search applied as `.or(first_name.ilike.%term%,...,email.ilike.%term%)` after role constraints, before `.range()`. Term trimmed and lowercased in service.
- `src/components/leads/LeadsFilters.tsx` — search input added to filter bar (Section 5.10 spec); 500ms debounce via `useEffect`+`setTimeout`, no library; clear X button; `search` counted in active filter badge; `buildParams` deletes `page` on every change → automatic page-1 reset; `clearAll` clears search local state and URL simultaneously.
- `src/components/leads/LeadsTable.tsx` — all client-side search code removed (`useState`, `useMemo`, `Search` icon, search input, `filtered` variable). Table is now display-only — it renders what the server returned.
- `src/components/leads/LeadsTableAsync.tsx` — destructures `{ leads, totalCount }` from `getLeadsByRole`; renders `LeadsTable` + `LeadsPagination` (conditional on `totalCount > pageSize`); `search` filter included in `hasActiveFilters` check.
- `src/components/leads/LeadsTableSkeleton.tsx` — skeleton rows increased from 5 to 50 (matches `pageSize`); prevents layout height jump between skeleton and real content during pagination navigation.
- `src/app/(dashboard)/leads/page.tsx` — `parseFilters` now includes `search: getString('search')`.
- `src/app/(dashboard)/leads/CLAUDE.md` — updated with server-side search spec, `LeadsResult` return shape, pagination render condition, 500ms debounce rule, and page-reset contract.

---

## 2026-05-28 — Gia — Leads filter: Suspense-split architecture + server-side URL-param filters

Leads filter — Suspense-split architecture, server-side URL-param filters (status, outcome, source, campaign, agent, date range), migration 0010 indexes; 2026-05-28, Phase 6.

### Files added

- `supabase/migrations/20260528000010_lead_filter_indexes.sql` — three partial indexes on `leads`: `idx_leads_utm_source`, `idx_leads_utm_campaign`, `idx_leads_last_call_outcome` (all `WHERE archived_at IS NULL`). `IF NOT EXISTS` on indexes only — no RLS changes.
- `src/lib/constants/lead-sources.ts` — `LEAD_SOURCES`, `LeadSource`, `LEAD_SOURCE_LABELS` constants. Values: `meta | google | website`. No inline literals in components.
- `src/components/leads/LeadsFilters.tsx` — `'use client'` filter bar. Reads/writes URL params only. Six controls: Status (multi), Outcome (multi), Source (single), Campaign (single, server prop), Agent (single, server prop, absent for `agent` role), Date range. Active filter badge. `useTransition` on all `router.push` calls. Never fetches data.
- `src/components/leads/LeadsTableAsync.tsx` — async server component. Calls `getLeadsByRole` with `LeadFilters`. Renders `<LeadsTable>`. No UI of its own. Direct child of `<Suspense>` in `page.tsx`.
- `src/app/(dashboard)/leads/CLAUDE.md` — documents the three-component split, `LeadFilters` type location, `showAgentFilter` contract, `date_to` end-of-day rule, `getLeadFilterOptions` call location, and `page`/`pageSize` pagination readiness.

### Files modified

- `src/lib/types/database.ts` — `LeadFilters` type added (status, last_call_outcome, agent_id, source, campaign, date_from, date_to, page, pageSize).
- `src/lib/services/leads-service.ts` — `getLeadsByRole` extended to accept `LeadFilters`; builds a single chained Supabase query; `.range()` always applied (never conditional); agent role constraint enforced before `LeadFilters.agent_id`; `date_to` end-of-day transform (`T23:59:59.999Z`) in service, not component. New `getLeadFilterOptions(role, domain)` returns `{ campaigns, agents }` — called once at page level.
- `src/components/leads/LeadsTable.tsx` — accepts `hasActiveFilters` prop; internal `statusFilter` state removed (server-side now); Framer Motion entrance `initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}` per Section 11.5 (250ms, 100ms delay, ease-out-expo); empty state updated to "Nothing matches these filters." (Section 8.6).
- `src/components/leads/LeadsTableSkeleton.tsx` — rebuilt to spec: 5 rows (Section 11.3), staggered pulse per Section 11.4 (0/80/160/240/320ms), column widths match spec.
- `src/app/(dashboard)/leads/page.tsx` — restructured as thin orchestrator: fetches `filterOptions` once, parses `searchParams` into `LeadFilters`, renders `<LeadsFilters>` (stable) + `<Suspense><LeadsTableAsync /></Suspense>`.

---

## 2026-05-28 — Gia — LeadInfoCard AttributionStrip

LeadInfoCard: UTM section redesigned as AttributionStrip with accent-tone treatment and campaign repatriated — 2026-05-28, Phase 6

---

## 2026-05-28 — Gia — Leads table column visibility picker + drag-to-reorder

### New packages (Q-05)

- `@dnd-kit/core` `@dnd-kit/sortable` `@dnd-kit/utilities` — drag-to-reorder in the column picker. Selected over `react-beautiful-dnd` (unmaintained) and hand-rolled pointer listeners (no accessible keyboard support). `@dnd-kit` is now the **canonical drag library for all of Eia** (see rule Q-07).

### Files added

- `src/lib/constants/lead-columns.ts` — column registry: 11 columns, each with a stable `id` (localStorage key — never rename after shipping), `label`, `defaultVisible`, `locked`. `status` and `name` are locked always-visible.
- `src/hooks/useLeadColumnPreferences.ts` — `useLeadColumnPreferences(userId)` reads/writes `localStorage` at `eia:leads:columns:${userId}:v1`; validates stored ids against registry on load (unrecognised ids silently dropped); locked columns always enforced in `visibleColumns`; hydrates after mount (no SSR mismatch). Returns `{ visibleColumns, columnOrder, toggleColumn, reorderColumns, resetToDefaults }`. This hook is the **canonical pattern** for per-user table column preferences across Eia (see rule Q-08).
- `src/components/leads/LeadColumnPicker.tsx` — popover panel (not a modal); `@dnd-kit/sortable` for visible-column drag-to-reorder; locked rows show `Lock` icon and are excluded from the drag context; hidden columns shown below a divider, non-draggable; "Reset to defaults" footer; 200ms `opacity/y` entrance animation matching dropdown spec from design-dna.md §5.09.

### Files modified

- `src/components/leads/LeadsTable.tsx` — accepts `userId` prop; "Columns" ghost button (`Columns` lucide icon, `w-4 h-4`, stroke `1.5`) opens picker before filter controls; table renders only `orderedVisible` columns in stored order via a `LeadCell` switch covering all 11 ids; no Supabase re-query on toggle — purely presentational.
- `src/app/(dashboard)/leads/page.tsx` — passes `profile.id` as `userId` to `LeadsTable`.

### Conventions locked in

- Rule Q-07 added to `The_Rules.md`: `@dnd-kit` is the only drag library permitted in Eia.
- Rule Q-08 added to `The_Rules.md`: column preference hooks always follow the `useLeadColumnPreferences` signature and `eia:[module]:columns:${userId}:v1` key format.

## 2026-05-28 — Gia — Add Lead modal: removed E.164 hint and intent chips; added Source field (WhatsApp, Website, Meta, Google, Referral, YPO, Events) stored in form_data.manual_source

---

## 2026-05-28 — Gia — Add Lead modal: manual lead creation with phone dedup, domain enforcement, and agent assignment

---

## 2026-05-28 — Documentation

README.md created at repo root — project overview, phase status, stack, RBAC, planned modules. 2026-05-28.

---

## 2026-05-27 — Phase 6 complete

### `ui/Modal` primitive + modal refactor

- `src/components/ui/modal.tsx` — chrome-only Modal primitive: backdrop (`fixed inset-0`, `rgba(0,0,0,0.5)`, `backdrop-blur-sm`, `z-[--z-overlay]`), container (`bg var(--theme-paper)`, `radius-lg`, `shadow-3`, `z-[--z-modal]`), header, body slot, footer slot; Framer Motion `AnimatePresence` — enter `{ opacity:0, y:10, scale:0.98 }→{ opacity:1, y:0, scale:1 }` at 350ms `ease-out-expo`, exit `{ opacity:0, scale:0.97 }` at 150ms; Escape key listener; backdrop click → `onClose`; `role="dialog"` + `aria-modal="true"` + `aria-labelledby` via `useId()`; zero hardcoded colour values
- `CalledModal`, `ConfirmModal`, `ReasonModal` refactored to compose `Modal`; own chrome deleted; hardcoded `#fff`/`#ffffff` violations replaced with CSS tokens
- `src/components/CLAUDE.md` updated with props contract and the rule that every future modal composes the primitive

Props: `open: boolean`, `onClose: () => void`, `title: string`, `children: React.ReactNode`, `footer: React.ReactNode`, `maxWidth?: string` (default `max-w-lg`)

---

## 2026-05-27

### Personal details card on lead dossier

#### Personal details enrichment (Migration 0009)

- `personal_details JSONB` column added to `leads` — stores agent-collected enrichment keyed by field name; existing RLS covers it; no extra policies needed
- `Lead.personal_details: Record<string, string> | null` added to `database.ts`
- `UpdatePersonalDetailsSchema` added to `lead-schema.ts` — five fields (company, occupation, interests, city, notes); each passes through `sanitizeText()`
- `updatePersonalDetails` server action in `leads.ts` — Zod → auth → two-layer access check → merge into existing JSONB (preserves prior keys, strips empty strings)
- `PersonalDetailsCard` — inline card on the dossier left column; dormant read-only view until user clicks a field; 2-col grid (Company, Occupation, Interests, City) + full-width Details textarea; Save + Cancel footer appears only when active; follows `AgentScratchpad` card pattern
- Card is visible to all roles with dossier access; editable by assigned agent, manager (domain), admin, founder

---

### Post-Phase 5 hardening

#### Atomic round-robin agent assignment (Migration 0007)

- Replaced three-query application-layer round-robin with a single `get_next_round_robin_agent()` SECURITY DEFINER function
- `SELECT FOR UPDATE SKIP LOCKED` on `agent_routing_config` — two concurrent webhook calls cannot pick the same agent
- O(agents) not O(leads) — `MAX(assigned_at) GROUP BY` subquery, not a full table scan
- Two-step fallback for agents without a routing config row
- Added `idx_leads_assigned_to_assigned_at` partial index

#### Lead deduplication by phone (Migration 0008)

- Phone is the dedup key. Active lead (`new | touched | in_discussion | nurturing`) → log `duplicate_submission` activity, return existing lead, no new row created
- Terminal lead (`lost | junk | won`) → create new lead, set `previous_lead_id` FK to predecessor
- `get_active_lead_by_phone()` SECURITY DEFINER function with `idx_leads_phone_active` partial index
- `previous_lead_id` self-referential FK added to `leads` table (`ON DELETE RESTRICT`)
- `duplicate_submission` registered as valid `action_type` on `lead_activities`
- `Lead.previous_lead_id` and `duplicate_submission` added to `database.ts` types
- `IngestionResult` union extended with `duplicate: boolean` flag

#### Activity log — assignee name resolution

- `LeadActivityWithActor` type extended with `assignee_name: string | null`
- `getLeadActivitiesFull()` now batch-resolves `details.assigned_to` UUIDs alongside `actor_id` in a single `getProfileNameMap` call — zero extra DB queries
- `LeadActivityLog` component: `lead_created` now reads "Lead entered the system"; `agent_assigned` now reads "Assigned to [Name]"

---

## 2026-05-27 — Phase 5 complete

### Profile page + theme system

- `GET /profile` — server component; 6 card sections (avatar, details, theme, password, notifications)
- `ProfileAvatarSection` — click-to-upload via Supabase Storage `avatars` bucket; initials fallback; role/domain badges
- `ThemeSelector` — 5 swatches; instant DOM switch + async DB persist; no flash on load
- `PasswordChangeForm` — re-authenticates before `updateUser`; live 4-step strength bar
- `NotificationPreferences` — stubbed; "Coming soon"
- Inline `<script>` in dashboard layout sets `data-theme` synchronously before paint
- Sidebar footer → `<Link href="/profile">` with active-state styling

---

## 2026-05-27 — Raw payload logging

- Migration 0004: `lead_raw_payloads` table — immutable JSONB log; `lead_id` backfilled after insert; admin/founder only
- Migration 0005: `ingestion_error` column on `lead_raw_payloads` — marks failed ingestions for the error log
- `lead-ingestion.ts` — logs raw payload as step 1; logging failure is non-fatal
- `adapters.ts` — `adaptMeta` handles three payload shapes: Meta native, Pabbly, flat top-level keys; multi-key fallback for phone/email/ad fields
- `GET /error-log` — admin/founder page showing all errored raw payloads

---

## 2026-05-27 — Phase 4 complete

### Lead dossier + full lifecycle

- `GET /leads/[id]` — server component; parallel fetches; page-level access gate mirrors action-level
- `LeadInfoCard` — contact fields, UTM params, domain/platform/intent
- `StatusActionPanel` — Called/Won/Nurturing/Lost/Junk actions; owns CalledModal + ConfirmModal + ReasonModal
- `CalledModal` — call outcome dropdown + required note; auto-advances `new → touched`
- `AgentScratchpad` — debounced auto-save (1s); assigned agent + admin only
- `LeadNotesSection` — chronological notes timeline with author names + call outcome badges
- `LeadJourneyTimeline` — visual 4-stage path (`new → touched → in_discussion → won`); dwell times; resolution badge
- `LeadActivityLog` — append-only activity history; newest first
- `LeadDossierTasksAsync` — async server component; next pending task; overdue state highlighted

---

## 2026-05-27 — Phase 3 complete

### Gia module: lead ingestion, assignment, lead list

- Migration 0003: `leads`, `lead_activities`, `lead_notes`, `tasks`, `task_gia_meta` with full RLS
- Webhook `POST /api/webhooks/leads` — Bearer auth + in-memory rate limiting
- `ingestLead()` — validate → sanitize → resolve domain → round-robin assign → insert → log activities
- `LeadsTable` — client-side status filter + search; role-aware (agent/manager/admin/founder)
- Sidebar: Leads nav link added

---

## 2026-05-27 — Phase 2 complete

### User management + agent routing

- `agent_routing_config` table; auto-created on `role=agent` via trigger
- `toggleAgentRouting` server action (manager/admin/founder)
- `inviteUser` action — magic-link invite via `inviteUserByEmail`
- `UsersTable` — client-side filters (role, domain, search)
- `EditProfileForm`, `EditAuthorizationForm`, `UserStatusControls`
- `GET /admin/users/[id]` — user detail page

---

## 2026-05-26 — Phase 1 complete

### Profiles system + user creation

- Migration 0001: `user_role` and `app_domain` enums
- Migration 0002: `profiles` table; RLS; `get_user_role()` / `get_user_domain()`; `on_auth_user_created` trigger; `profile_audit_log`
- `createUser`, `updateProfile`, `updateUserAuthorization`, `toggleUserActive` server actions
- Dashboard layout; Sidebar; TopBar
- `GET /admin/users` — user list
- `GET /admin/users/new` — create user form

---

## 2026-05-26 — Phase 0 complete

### Foundation

- Next.js 16 App Router scaffolded; Supabase connected; Tailwind v4; shadcn/ui
- `design-tokens.css` — all CSS variables; five themes (Earth, Air, Water, Fire, Cosmos)
- Supabase client files: `client.ts`, `server.ts`, `middleware.ts`
- Auth pages: login, forgot-password, update-password
- Shared utilities: `sanitize.ts`, `phone.ts`, `dates.ts`, `numbers.ts`, `chart-tokens.ts`, `scroll.ts`
