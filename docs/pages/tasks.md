# Tasks — Page Spec

> **Purpose:** spec for `/tasks` (Gia / My Tasks / Group Tasks tabbed hub) and `/tasks/[id]` (group workspace) — the whole OS Tasks module.
> **Audience:** engineers. · **Source-of-truth scope:** the task system (tables-usage, RPCs, actions, tabs, modals, flows, invariants). Schema rows: `../architecture/database.md`; reminder-job mechanics: `../integrations/trigger-dev.md`.
> **Last verified:** 2026-06-11 (restructure pass over the 2026-06-11 intelligence doc).

## 1. Purpose

One `tasks` table carries three categories, discriminated by `task_category`: **personal**
(individual todos), **group_subtask** (under a `task_groups` parent), **gia_followup**
(system/agent-created, lead-linked via `task_gia_meta`). Each task has an append-only
`task_remarks` narrative; meaningful status changes ride a remark via
`add_task_remark_with_status` (accountability through narrative).

## 2. Who sees it

`/tasks` is in every domain's route map. Agents see tasks they own or created; group
visibility is purely data-driven (creator OR assigned a subtask — migration 0058b, no
role/domain branching); agents never see colleagues' subtasks within a group. The full
operation×role matrix + RLS notes: Deep dive §20.

## 3. Data sources

| Layer | Key items |
| ----- | --------- |
| Service | `tasks-service.ts` (read-only) — `getPersonalTasks` (cursor RPC), `getGroupTasks`, `getGroupSubtasks`, `getTaskRemarks`, `getGiaTasksForUser`, `getAllLeadTasks`; Redis per `../architecture/caching.md` (`task:*`) |
| RPCs | `get_personal_tasks` (0026), `get_group_task_summaries` (0020), `add_task_remark_with_status` (0035/0051), `get_gia_tasks` (0055), `create_lead_gia_task` (0054) |
| Actions | `tasks.ts` — create personal/group/subtask, update status/brief/checklist/tags, delete, remarks (+ suppression); all `{ data, error }` |
| Jobs | task due reminders — `../integrations/trigger-dev.md` |

## 4. Components

`TasksShell` + `TasksAsync` (RSC seed) · `TasksFilters` (client-state `<FilterBar>`) · tabs:
`GiaTasksTab`, `MyTasksCalendarView` (the personal view), `GroupTasksTab` ·
`GroupTaskWorkspace` (`/tasks/[id]`, list/board, Realtime) · `SubTaskModal` (two-zone) +
`TaskRemarksPanel` + `AssigneePickerModal` + `TaskStatusIcon` · create modals
(`CreatePersonalTaskModal`, `CreateGroupTaskModal`, `CreateGiaTaskModal`) — all composing
`TaskFormFields`. Component contracts live code-adjacent in `src/components/tasks/CLAUDE.md`.

## 5. States

- **Loading:** `tasks/loading.tsx` (PageSkeletons composition); per-tab skeletons; remark panel gates open on pre-fetched remarks.
- **Empty:** `<EmptyState>` per tab; remarks panel "No updates yet." (Playfair italic).
- **Error:** `{ error }` → toast; optimistic inserts roll back (remarks, status chips).

## 6. Invariants

Deep dive §22 — append-only remarks (suppression is the only mutation), `status_change` CHECK
coupled to `tasks.status`, audit-log excludes `attachments`, reminder idempotency keys,
cancel-before-delete, `PersonalTasksTab` deleted (was legacy/unmounted — removed 2026-06-11,
design-audit L-02), no JS sort on `getPersonalTasks` output, channel nonces.

## 7. Open items

`CreateGroupTaskModal` accent_color/icon_key + member chips are UI-only (no DB columns /
`task_group_members` table yet) — tracked as TODOs in the file.

---

## 8. Deep dive

> Section numbering preserved from the original intelligence document. The former §6
> (Trigger.dev) now lives in `../integrations/trigger-dev.md`.

### 2. Data Model

#### 2a. `tasks` table

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PK |
| `assigned_to` | uuid | NOT NULL | — | FK → `profiles(id)` |
| `created_by` | uuid | NOT NULL | — | FK → `profiles(id)` |
| `module` | text | NOT NULL | — | OS inserts use `'gia'` |
| `task_type` | text | NOT NULL | — | `call`, `whatsapp_message`, `other` (migration 0057) |
| `title` | text | NOT NULL | — | Backfilled `'(untitled)'` in 0017 |
| `description` | text | NULL | — | |
| `status` | text | NOT NULL | `'to_do'` | CHECK: 6 values (post-0017). Column DEFAULT corrected `'pending'` → `'to_do'` in 0086 (0017 left a stale default that violated the CHECK on default INSERTs) |
| `priority` | text | NOT NULL | `'normal'` | CHECK: `urgent`, `high`, `normal` |
| `task_category` | text | NOT NULL | `'personal'` | CHECK: `personal`, `group_subtask`, `gia_followup` |
| `group_id` | uuid | NULL | — | FK → `task_groups(id)` ON DELETE CASCADE |
| `due_at` | timestamptz | NULL | — | |
| `completed_at` | timestamptz | NULL | — | Set when `status = 'completed'` |
| `attachments` | jsonb | NOT NULL | `'[]'` | Checklist items; CHECK `jsonb_typeof = 'array'` (0023) |
| `tags` | text[] | NOT NULL | `'{}'` | Personal tasks; GIN partial index (0024) |
| `created_at` | timestamptz | NOT NULL | `now()` | |
| `updated_at` | timestamptz | NOT NULL | `now()` | |

**Indexes (current):**

| Name | Columns | Partial condition |
| --- | --- | --- |
| `idx_tasks_assigned_to` | `(assigned_to, due_at ASC NULLS LAST)` | `status NOT IN ('completed','cancelled','error')` |
| `idx_tasks_module` | `(module, assigned_to)` | same |
| `idx_tasks_agent_active` | `(assigned_to, task_category, due_at ASC NULLS LAST)` | same |
| `idx_tasks_category` | `(task_category)` | `status NOT IN ('completed','cancelled')` |
| `idx_tasks_group_id` | `(group_id)` | `group_id IS NOT NULL` |
| `idx_tasks_priority` | `(priority, due_at)` | `status NOT IN ('completed','cancelled')` |
| `idx_tasks_tags_gin` | GIN `(tags)` | `task_category = 'personal'` |
| `idx_tasks_tags_active` | `(assigned_to) INCLUDE (tags)` | `task_category = 'personal' AND status NOT IN ('completed','cancelled','error')` |

**Triggers:**

| Name | Event | Function | Fields watched / excluded |
| --- | --- | --- | --- |
| `tasks_updated_at` | BEFORE UPDATE | `update_updated_at()` | — |
| `tasks_audit` | AFTER UPDATE FOR EACH ROW | `log_task_changes()` | **Watches:** `title`, `description`, `status`, `priority`, `due_at`, `assigned_to`. **Excluded:** `attachments`, `tags`, `task_category`, `group_id`, `created_at`, `updated_at`, `completed_at` (checklist toggles must not flood audit log) |

**RLS policies:**

| Policy | Command | Rule |
| --- | --- | --- |
| `tasks_agent_select` | SELECT | `get_user_role() = 'agent' AND (assigned_to = auth.uid() OR created_by = auth.uid())` (0051) |
| `tasks_manager_admin_founder_select` | SELECT | `get_user_role() IN ('manager','admin','founder')` |
| `tasks_update` | UPDATE | Agent: `assigned_to = auth.uid()`; manager+: all |
| `tasks_insert` | INSERT | `created_by = auth.uid() AND assigned_to = auth.uid() AND task_category = 'personal'` (0094) — personal, self-assigned only |
| `tasks_delete` | DELETE | Agent: `task_category = 'personal' AND created_by = auth.uid() AND assigned_to = auth.uid() AND status IN ('to_do','in_progress')` (0094) |
| `tasks_delete_privileged` | DELETE | `get_user_role() IN ('manager','admin','founder')` (0094) — any task |

> **0088 InitPlan note:** all five policies above wrap `get_user_role()` in `(SELECT public.get_user_role())` so the STABLE function runs once per statement, not per row. Logic is identical to the pre-0088 form — only the scalar-subquery wrapping changed.

**INSERT/DELETE RLS now exists (0094) but app writes still bypass it.** `tasks_insert` covers only personal self-assigned rows; gia-followup and group-subtask inserts have **no** direct policy and are blocked by default — created only via SECURITY DEFINER RPCs (`create_lead_gia_task`, `update_lead_status`) or `adminClient`. Mutations from server actions continue to use `adminClient` with `canMutateTask` / delete rules; the RLS policies are defence-in-depth for any direct client access, not the primary enforcement path.

---

#### 2b. `task_groups` table

| Column | Type | Nullable | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PK |
| `title` | text | NOT NULL | — | |
| `description` | text | NULL | — | |
| `priority` | text | NOT NULL | `'normal'` | CHECK urgent/high/normal |
| `status` | text | NOT NULL | `'to_do'` | Same 6-value CHECK as tasks |
| `due_at` | timestamptz | NULL | — | |
| `created_by` | uuid | NOT NULL | FK → profiles | |
| `domain` | app_domain | NOT NULL | — | Enum after migration 0041 |
| `created_at` / `updated_at` | timestamptz | NOT NULL | `now()` | |

**Indexes:** `idx_task_groups_domain` (partial active), `idx_task_groups_created_by`, `idx_tasks_group_assignee` on `tasks(group_id, assigned_to)` WHERE `group_subtask` (migration 0058 — speeds EXISTS subquery)

**RLS (migration 0058 — flat visibility; replaces 0018/0041 role-branched model):**

| Policy | Command | Rule |
| --- | --- | --- |
| `task_groups_select` | SELECT | `created_by = auth.uid()` OR EXISTS subtask WHERE `assigned_to = auth.uid()` AND `group_subtask` |
| `task_groups_insert` | INSERT | `auth.uid() IS NOT NULL` |
| `task_groups_update` | UPDATE | Same two-condition rule as SELECT (USING + WITH CHECK) |
| `task_groups_delete` | DELETE | `created_by = auth.uid()` only — orphaned group cleanup is service-role |

No `get_user_role()` / `get_user_domain()` calls anywhere in the SELECT, UPDATE, or DELETE policies.

Realtime: **not enabled** on `task_groups`.

---

#### 2c. `task_remarks` table

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | |
| `task_id` | uuid FK → tasks CASCADE | |
| `author_id` | uuid FK → profiles | |
| `content` | text NOT NULL | `sanitizeText()` at action layer |
| `status_change` | text NULL | CHECK mirrors `tasks.status` exactly — **must stay coupled** |
| `is_suppressed` | boolean NOT NULL DEFAULT false | |
| `suppressed_by` | uuid NULL | |
| `suppressed_at` | timestamptz NULL | |
| `created_at` | timestamptz NOT NULL | |

**Coupling risk:** If `tasks.status` gains a value without extending `task_remarks.status_change` CHECK, inserts with that `status_change` fail at DB level.

**RLS:**

| Allowed | Policy |
| --- | --- |
| SELECT | `task_remarks_select` — EXISTS on tasks: `assigned_to = auth.uid() OR created_by = auth.uid() OR role IN (manager,admin,founder)` |
| INSERT | `task_remarks_insert` — `author_id = auth.uid()` + same task visibility |
| UPDATE | `task_remarks_suppression_update` — admin/founder only (suppression) |
| **Forbidden** | **No DELETE policy — ever** |

> **0088 InitPlan note:** these three policies were rewritten to wrap `get_user_role()` in `(SELECT …)` for once-per-statement evaluation. The creator path (`created_by = auth.uid()`) is explicit in both SELECT and INSERT — logic unchanged from pre-0088.

Suppression column scope is enforced in `suppressTaskRemarkAction` only (PostgreSQL RLS cannot restrict columns).

Realtime: **enabled**.

---

#### 2d. `task_audit_log` table

| Column | Type |
| --- | --- |
| `id` | uuid PK |
| `task_id` | uuid FK → tasks ON DELETE CASCADE |
| `changed_by` | uuid FK → profiles |
| `field_name` | text |
| `old_value` / `new_value` | text |
| `changed_at` | timestamptz |

**Trigger watches (only):** `title`, `description`, `status`, `priority`, `due_at`, `assigned_to`.

**Intentionally excluded:** `attachments` (checklist flood), `tags`, `task_category`, `group_id`, timestamps, `completed_at`.

**RLS:** `task_audit_log_select` — manager/admin/founder only (0088 wraps the role check in `(SELECT …)`). No INSERT/UPDATE/DELETE policies (trigger + service role only).

---

#### 2e. `task_gia_meta` table

| Column | Type | Notes |
| --- | --- | --- |
| `task_id` | uuid PK FK → tasks CASCADE | |
| `lead_id` | uuid FK → leads | |
| `call_outcome` | text NULL | When call task completes |

**Index:** `idx_task_gia_meta_lead_id`

**RLS:** SELECT via EXISTS on tasks (agent: assigned; manager+: broader).

---

#### 2f. Notification types relevant to tasks

| Type | Created by | `action_url` |
| --- | --- | --- |
| `task_assigned` | `createPersonalTaskAction`, `createSubtaskAction` when assignee ≠ caller | `/tasks` (relative only) |
| `task_due` | `sendTaskReminderTask` (Trigger.dev) | `/tasks` |

`notifications.action_url` CHECK: `NOT LIKE 'http%'` — relative paths only.

---

### 3. Database RPCs

#### 3a. `get_personal_tasks` (migrations 0025, 0026)

**Purpose:** DB-level sort PostgREST cannot express: `due_at ASC NULLS LAST` → priority CASE → `id ASC`, plus composite keyset cursor.

| Parameter | Purpose |
| --- | --- |
| `p_user_id` | Owner filter (`assigned_to`); action layer must match session |
| `p_status`, `p_priority`, `p_tags`, `p_due_before` | Optional filters (`tags` uses `@>`) |
| `p_limit` | Default 51 (= pageSize + 1 for `hasMore`) |
| `p_cursor_id` | Last row's `id` |
| `p_cursor_due_at` | Last row's `due_at` (may be null) |
| `p_cursor_has_due_at` | `true` = cursor had deadline; `false` = null deadline; **all null = page 1** |

**Sort (every page):** `due_at ASC NULLS LAST` → `CASE priority WHEN urgent THEN 1 WHEN high THEN 2 ELSE 3 END` → `id ASC`

**Cursor mechanics:**

- Page 1: `p_cursor_id`, `p_cursor_due_at`, `p_cursor_has_due_at` all null → `WHEN p_cursor_id IS NULL THEN TRUE`
- Cursor with due_at: rows with later `due_at`, or same `due_at` + higher `id`, or any `due_at IS NULL`
- Cursor without due_at: only `due_at IS NULL AND id > cursor_id`

**Security:** `STABLE SECURITY DEFINER`, `SET search_path = public`

**Why it exists:** Retired PostgREST path could not keep priority sort on pages 2+ (TD-003, 2026-05-29).

---

#### 3b. `get_group_task_summaries` (migration 0020, fixed 0042, rewritten 0058)

| Parameter | Purpose |
| --- | --- |
| `p_status`, `p_priority` | Optional filters on **group** row |

**Returns per row:** All `task_groups` columns + `subtask_total`, `subtask_completed`, `assignee_ids uuid[]`

**Visibility (post-0058 flat model):** `tg.created_by = auth.uid()` OR EXISTS subtask where `assigned_to = auth.uid()` AND `group_subtask`. No `get_user_role()` / `get_user_domain()` calls. `auth.uid()` resolves from the calling session JWT even inside `SECURITY DEFINER` — consistent with how `created_by = auth.uid()` already worked in the previous version.

**Avatar preview:** `assignee_ids` aggregated in SQL; service slices to **max 4** and batch-fetches profiles.

---

#### 3c. `get_gia_tasks` (migrations 0055, 0056)

| Parameter | Type | Purpose |
| --- | --- | --- |
| `p_user_id` | uuid | Caller id |
| `p_role` | text | Role string |
| `p_domain` | **app_domain** | Prevents `42883` text/enum mismatch on `leads.domain =` |

**Role behaviour:**

- `p_role = 'agent'` → `tasks.assigned_to = p_user_id`
- Else → `leads.domain = p_domain`

**Returned fields:** Full `tasks` row + `lead_id`, `lead_first_name`, `lead_last_name`, `lead_phone`, `lead_slug`, `lead_domain`

**Order:** Active (`to_do`, `in_progress`, `in_review`) first, then `due_at ASC NULLS LAST`, `created_at ASC`

---

#### 3d. `add_task_remark_with_status` (migration 0035, fix 0051)

| Parameter | Purpose |
| --- | --- |
| `p_task_id` | Target task |
| `p_author_id` | Remark author |
| `p_content` | Pre-sanitized text |
| `p_status_change` | Nullable; optional status UPDATE |

**Atomic behaviour:**

1. Optional `tasks.status` UPDATE (`completed_at` when → `completed`; fires `log_task_changes()`)
2. `task_remarks` INSERT (append-only)

**Auth model post-fix:** RPC has **no** `auth.uid()` gate (NULL under service role). **View = post:** `addTaskRemarkAction` runs user-scoped `tasks` SELECT first; only if RLS returns the row does it call RPC via `adminClient`.

**Returns:** Full `task_remarks` row

---

#### 3e. `create_lead_gia_task` (migration 0054)

**Two-INSERT transaction:** `tasks` (`task_category = 'gia_followup'`) + `task_gia_meta` in same function. Orphan `tasks` row without meta is invisible on all Gia surfaces — RPC prevents that.

---

### 4. Services — `tasks-service.ts`

| Function | Parameters | Return | Query pattern | Called by |
| --- | --- | --- | --- | --- |
| `getPersonalTasks` | `userId`, `filters?` | `PersonalTasksResult` | RPC `get_personal_tasks` only | `getPersonalTasksAction`, `TasksAsync` (personal tab) |
| `getGroupTasks` | `filters?`, `cacheHint?: { userId }` | `TaskGroupRow[]` | Redis 120s → RPC + batch profiles; React `cache()`. `userId` scopes cache key — user-specific after migration 0058. | `TasksAsync` (group tab) |
| `getGroupSubtasks` | `groupId`, `userId` | `SubtaskWithAssignee[]` | Redis 30s → PostgREST + batch assignees; React `cache()`. `userId` scopes cache key — prevents cross-user bleed. | `getGroupSubtasksAction`, `WorkspaceAsync` |
| `getTaskById` | `taskId` | `TaskWithMessages \| null` | Parallel task + remarks | (modal/detail paths) |
| `getTaskRemarks` | `taskId` | `TaskRemarkWithAuthor[]` | Redis 30s → PostgREST ASC + batch authors; React `cache()` | `getTaskRemarksAction` |
| `getTaskGroupById` | `groupId` | `TaskGroup \| null` | Single row; RLS | `getTaskGroupByIdAction`, `WorkspaceAsync` |
| `getPersonalTaskTags` | `userId` | `string[]` | Active personal tasks; dedupe sort | `getPersonalTaskTagsAction`, `TasksShell` |
| `getGiaTasksForUser` | `userId`, `role`, `domain` | `GiaTask[]` | RPC `get_gia_tasks` | `TasksAsync` (gia tab) |
| `getAllLeadTasks` | `leadId` | `Task[]` | PostgREST + inner join meta | Lead dossier |

`PERSONAL_TASKS_PAGE_SIZE = 50` (default). `getPersonalTasks` accepts an optional `filters.limit` override capped at **500** (`Math.min(filters.limit ?? PERSONAL_TASKS_PAGE_SIZE, 500)`) — used for bulk/export-style reads. On RPC error: logs + empty result (TD-002).

---

### 5. Server Actions

#### 5a. `tasks.ts` — all actions

| Action | Zod schema | Auth | DB | Side effects | `adminClient`? |
| --- | --- | --- | --- | --- | --- |
| `createPersonalTaskAction` | `CreatePersonalTaskSchema` | Session; manager+ to assign others | INSERT tasks | `task_assigned` notification; `scheduleTaskReminder` if due; del `task:personal:page1:{assignedTo}` | Yes |
| `createGroupTaskAction` | `CreateGroupTaskSchema` | Any non-guest; domain locked to own unless admin/founder | INSERT task_groups | `revalidatePath('/tasks')`; **await** del `task:group-list:{callerId}` | Yes |
| `createSubtaskAction` | `CreateSubtaskSchema` | Group exists; agent domain check | INSERT tasks | notification; reminder; `revalidatePath('/tasks')`; **await** del `task:group-list:{callerId}` + `task:group-list:{assignedTo}` (if different); del `task:subtasks:{groupId}:{callerId}` | Yes |
| `updateTaskStatusAction` | `UpdateTaskStatusSchema` | `canMutateTask` | UPDATE status/completed_at | `cancelTaskReminder` on terminal; del by `task_category`: `personal` → `task:personal:page1:{callerId}`; `gia_followup` → `task:gia:{callerId}:{role}:{domain}`; `group_subtask` → `task:subtasks:{groupId}:{callerId}` | Yes |
| `updateTaskAction` | `UpdateTaskSchema` | `canMutateTask` | Partial UPDATE | Reminder reschedule on due change; del `task:subtasks:{groupId}:{callerId}` if group subtask | Yes |
| `deleteTaskAction` | `DeleteTaskSchema` | Agent: both created_by AND assigned_to; else open | DELETE | **Awaited** `cancelTaskReminder` before delete; del by `task_category` (same three-branch as `updateTaskStatusAction`) | Yes |
| `updateChecklistAction` | `UpdateChecklistSchema` | `canMutateTask` | UPDATE attachments | Excluded from audit trigger | Yes |
| `updateTaskTagsAction` | `UpdateTaskTagsSchema` | `canMutateTask` | UPDATE tags | — | Yes |
| `addTaskRemarkAction` | `AddTaskRemarkSchema` | View = post (tasks SELECT) | RPC `add_task_remark_with_status` | del `task:remarks:{taskId}` | Yes (RPC) |
| `suppressTaskRemarkAction` | `SuppressTaskRemarkSchema` | admin/founder | UPDATE 3 suppression cols only | del `task:remarks:{taskId}` | Yes |
| `getGroupSubtasksAction` | — | Session | read service | — | No |
| `getPersonalTasksAction` | filters | Session | read service | — | No |
| `getPersonalTaskTagsAction` | — | Session | read service | — | No |
| `getTaskGroupByIdAction` | — | Session | read service | — | No |
| `getTaskRemarksAction` | — | Session | read service | — | No |

**`adminClient` why:** `task_groups` has no INSERT RLS; `tasks` gained explicit INSERT/DELETE policies in 0094 but they cover only personal self-assigned rows (gia-followup / group-subtask creation is blocked by default and goes through RPCs). All task writes from actions still use `adminClient` and bypass RLS, so the application layer must enforce the same rules RLS would (`canMutateTask`, role checks, view = post gate).

**`canMutateTask`:** admin/founder always; assignee or creator; manager + group in domain.

**Redis invalidation — three-branch rule (2026-06-02):** `updateTaskStatusAction` and `deleteTaskAction` read `task_category` from the task object already fetched by `canMutateTask` (no extra DB round-trip). `personal` → del caller's `personalPage1` key; `gia_followup` → del caller's `giaList` key (uses `caller.id`/`role`/`domain` — not `task.assigned_to`; manager's slot cleared, agent's expires at 60s TTL); `group_subtask` → del caller's `subtasks` key for that group. All dels are fire-and-forget (`void redis.del(...).catch(() => {})`).

**Redis key namespace:** All task keys use `REDIS_KEYS.task.*` builders from `src/lib/constants/redis-keys.ts`. Legacy flat aliases (`REDIS_KEYS.taskSubtasks`, `REDIS_KEYS.taskRemarks`) are kept for backward compatibility but new code must use the namespaced form.

---

#### 5b. `leads.ts` — task-relevant actions

##### `createLeadTaskAction`

1. `CreateLeadTaskSchema` (Zod)
2. `getCurrentProfile()`
3. Lead SELECT + access: agent → assigned; manager → domain; admin/founder → all
4. Title from `TASK_TYPE_LABELS[taskType]` — never hardcoded
5. Assignee: `lead.assigned_to ?? caller.id`
6. RPC `create_lead_gia_task` (atomic tasks + meta)
7. Fire-and-forget `scheduleTaskReminder` if due
8. `revalidatePath(/leads/${slug ?? id})`
9. Returns `ActionResult<Task>`

##### `searchLeadsAction`

- `SearchLeadsSchema` on query string
- `searchLeadsForTask(query, role, domain, userId)` — max **8** results
- Agent: `assigned_to = userId`; manager: `domain`; admin/founder: all

---

### 7. Client Filter Util — `task-client-filters.ts`

#### Exported functions

| Function | Purpose |
| --- | --- |
| `filterGiaTasks` | Gia tab list |
| `filterGroupRows` | Group tab cards |
| `countVisiblePersonalTasks` | Personal count (legacy helper; calendar uses inline filter) |
| `personalFiltersActiveCount` / `groupFiltersActiveCount` / `giaFiltersActiveCount` | Badge counts |
| `domainsInGroupRows` | Domain dropdown options |
| `resolvePersonalTaskAssignee` | Modal assignee chip |
| `EMPTY_*_FILTERS` | Initial state |

My Tasks applies filters inside `MyTasksCalendarView` via the same predicate rules as `personalTaskPasses` (search, tags `@>` semantics all tags required, status, priority).

#### Tab → filter function

| Tab | Filter state in `TasksShell` | Filter applied in |
| --- | --- | --- |
| personal | `personalFilters` | `MyTasksCalendarView` |
| group | `groupFilters` | `GroupTasksTab` → `filterGroupRows` |
| gia | `giaFilters` | `GiaTasksTab` → `filterGiaTasks` |

#### Why client-side (vs leads server-side)

Task list payloads are loaded once per tab via RSC (`TasksAsync`). Tab switches refetch via URL, but **filter changes do not call the server** — instant UX, no skeleton flash. Leads uses URL-backed server filters because row counts are huge and search must hit indexed DB columns.

#### Separate state per tab

`personalFilters`, `groupFilters`, and `giaFilters` are independent `useState` objects in `TasksShell` — switching tabs preserves each tab's filter selections.

---

### 8. The `/tasks` Page

#### 8a. `TasksCreateProvider` + `TasksCreateContext`

- **`createTrigger`:** number incremented by `requestCreate()`
- **`requestCreate()`:** called from `AddTaskButton` (`onClick`)
- **Listeners:** `useEffect` in `MyTasksCalendarView`, `GroupTasksTab`, `TasksShell` (gia → `setGiaCreateOpen(true)`)
- **Why context:** Header button and tab modals are siblings under `page.tsx`; context avoids prop drilling through `TasksShell` only for the counter

#### 8b. `page.tsx` — domain-aware tabs (updated migration 0058)

`isGiaDomain = GIA_DOMAINS.includes(profile.domain)`

| Caller | `validTabs` | Default (`?tab` invalid) |
| --- | --- | --- |
| Gia domain (any role) | `['gia', 'personal', 'group']` | `gia` |
| Non-Gia (any role) | `['personal', 'group']` | `personal` |

All non-guest roles now receive the Group Tasks tab. The old `profile.role === 'agent'` exclusion that gave Gia agents only `['gia', 'personal']` was removed in migration 0058.

`?tab=gia` for non-Gia callers → resolves to `validTabs[0]` (`personal`) — silent, no error.

**SSR:** Only active tab data fetched in `TasksAsync`; inactive tab gets empty sentinel.

#### 8c. `TasksAsync`

| `tab` | Service |
| --- | --- |
| `personal` | `getPersonalTasks(userId)` |
| `group` | `getGroupTasks({})` |
| `gia` | `getGiaTasksForUser(userId, role, domain)` |

Passes serialisable props to `TasksShell` only.

#### 8d. `TasksShell`

- **Tabs:** `TabSelector` `variant="accent"`, `indicatorLayoutId="tasks-page-tabs"`; labels Gia Tasks / My Tasks / Group Tasks from `validTabs`
- **Filters:** `TasksFilters` right; `onFilteredCountChange` per tab
- **Panels:** `gia` → `GiaTasksTab` + `CreateGiaTaskModal` (`AnimatePresence`); `personal` → `MyTasksCalendarView`; `group` → `GroupTasksTab`
- **Tags:** `getPersonalTaskTagsAction` when `activeTab === 'personal'`

#### 8e. `AddTaskButton`

| Tab | Label | Hidden when |
| --- | --- | --- |
| gia | `Gia Task` | — |
| personal | `My Task` | — |
| group | `Group Task` | — |

The `callerRole === 'agent'` hidden condition was removed. All roles that can reach the Group tab (all non-guest roles after migration 0058) see the button.

Uses `MotionButton` + `requestCreate()`.

#### 8f. `TasksFilters`

| Tab | Controls |
| --- | --- |
| **My Tasks** | Search (title + description), Tags (multi), Status (multi), Priority (multi) |
| **Group Tasks** | Search (title), Status, Priority, Domain (admin/founder only, options from roster), Progress (`in_progress` / `complete` / `empty`) |
| **Gia Tasks** | Search (lead name + task fields), Task Type (multi), **Range** date picker (trigger button + portal panel — matches `LeadsFilters` pattern; `dateFromUrlParam`/`dateToUrlParam` bridge `Date ↔ YYYY-MM-DD`; tasks without `due_at` hidden when either bound is set) |

**Gia date range picker pattern:** a "Range" trigger button opens a `motion.div` portal panel (portaled to `document.body`; positioned via `getBoundingClientRect()` + `visualViewport` offset correction; closes on outside `pointerdown`). Panel contains two `DatePicker` components (From / To) with cross-constraints (`minDate`/`maxDate`) and a clear × button. Active state shown via accent border + count badge. State lives in `giaFilters.dateFrom` / `giaFilters.dateTo` as `YYYY-MM-DD` strings (empty string = no bound).

**Result count:** `{resultCount} {resultNoun}` from active tab's `onFilteredCountChange`.

**No server refetch on filter change:** filters only update React state; no `router.push` for filter fields.

#### 8g. `TasksSkeleton`

| `tab` | Shape |
| --- | --- |
| `personal` | Two-column: 280px calendar + stats + quick-add; right: 3 date sections with rows; stagger 0/80/160/240/320ms |
| `group` | 4 group cards |
| `gia` | Paper card with 3 date-group row skeletons |

Uses `var(--theme-paper-subtle)` shimmer only.

---

### 9. My Tasks — `MyTasksCalendarView`

**Canonical My Tasks UI** — mounted from `TasksShell` when `tab=personal`.

(The legacy `PersonalTasksTab.tsx` priority-section layout was deleted on 2026-06-11 — design audit Phase 3.)

#### Layout

- **Left (280px sticky):** `Calendar` + `taskDots` (local `YYYY-MM-DD` keys; urgent → danger dot); summary strip; quick-add trigger
- **Right:** date-grouped sections; optional inline quick-add; Load more when `hasMore`

#### Section order (all-mode)

Today → future dates ascending → Overdue → No Due Date. **Completed tasks excluded** from sections (`useTaskCompletionToggle` removes them).

#### Calendar

- `calendarDate === null` → all sections
- Click day → single-date mode; empty day → Playfair **"Hooray."**
- Dot keys: `localKey()` — never `toISOString().slice(0,10)`

#### Data

- Seed from SSR `initialResult` — no mount refetch for page 1
- Load more: `getPersonalTasksAction({ cursor, status: active statuses })`
- Manager+: `getAssignableUsersAction(domain)` for assignee picker

#### Completion

`TaskCompletionCircle` + `useTaskCompletionToggle` + `canToggleTaskComplete` → `updateTaskStatusAction` (`completed` ↔ `to_do`).

#### Creates

`createTrigger` → `CreatePersonalTaskModal`; quick-add → `createPersonalTaskAction`; prepend with `assignedTo` / `createdBy` from action response.

#### Modal

Row click → `getTaskRemarksAction` → `SubTaskModal` only when `selectedTaskRemarks !== null`.

---

### 10. Gia Tasks Tab — `GiaTasksTab`

#### `GiaTask` fields

All `Task` columns plus: `lead_id`, `lead_first_name`, `lead_last_name`, `lead_phone`, `lead_slug`, `lead_domain`.

#### `GiaDaySection`

`.label-micro` heading + 1px bottom border — matches My Tasks date headers.

#### `GiaTaskRow`

- `TaskCompletionCircle` + lead link `/leads/[slug ?? id]`
- Type icon (`call` / `whatsapp_message` / `other`) in accent colour
- `TASK_TYPE_LABELS` label; due time; overdue → `var(--color-danger)`
- Completed: `opacity: 0.5` + strikethrough on lead name

#### Empty state

Playfair italic (in tab wrapper when no rows after filter).

#### Stagger

Framer Motion per `GiaDaySection` (`opacity` + `y`, `EASE_OUT_EXPO`).

#### Primitives

Reuses `TaskCompletionCircle` + `useTaskCompletionToggle` — no duplicate toggle logic.

---

### 11. `CreateGiaTaskModal`

1. Lead search — **300ms** debounce → `searchLeadsAction` (max 8)
2. Task type — `TASK_TYPES` / `TASK_TYPE_LABELS`
3. Priority chips — Urgent / High / Normal
4. `DatePicker` `showTime={true}`
5. Notes — optional, max 1000 chars

**Action:** `createLeadTaskAction` (same as lead dossier `CreateLeadTaskModal`).

**On success:** builds `GiaTask` from returned `Task` + selected lead fields → `onTaskCreated`.

**`AnimatePresence`:** at call site in `TasksShell`, not inside modal.

---

### 12. Group Tasks Tab — `GroupTasksTab`

#### `TaskGroupRow` (service type + UI meta)

`TaskGroup` + `subtask_count`, `completed_count`, `assignee_previews` (+ local `accent_color` / `icon_key` from hash until DB columns exist).

#### Group card

Accordion (one expanded); progress bar; avatar stack (max 4); **Open** → `/tasks/[id]` with `stopPropagation`.

#### Expanded subtasks

Lazy `getGroupSubtasksAction` on first expand; `createSubtaskAction` append; assignable users SSR-hoisted (`initialAgents`) **once** at tab level → all `GroupRow`s.

#### Delete group — portal pattern

The ⋯ dropdown menu and confirm delete dialog are both portaled to `document.body` via `createPortal`. This escapes two constraints:

1. Card `overflow: hidden` clips the dropdown when the row is collapsed — portal bypasses it.
2. Framer Motion's entrance `transform` on the card creates a new containing block for `position: fixed` children, trapping the dialog inside the card. Portal + `--z-overlay` backdrop / `--z-modal` dialog at `document.body` level fix both.

`moreButtonRef` captures `getBoundingClientRect()` at open time → `menuRect` state positions the dropdown with `position: fixed`. Confirm dialog backdrop uses `--z-overlay` (50); panel uses `--z-modal` (60) — backdrop is below the panel.

#### Callbacks

- `onTaskUpdated` / `onTaskDeleted` on `SubTaskModal` — patch subtask row + adjust `completed_count` / `subtask_count` without `router.refresh()`

#### New group

`createTrigger` → `CreateGroupTaskModal`; manager/admin/founder only (`canCreate`).

---

### 13. `CreateGroupTaskModal`

**Current implementation** (2026-06-01): single-column `Modal` `max-w-2xl` (not the older two-column 640px preview layout).

#### Fields (order)

Title → Description → Domain (hidden for manager-locked) + Priority + Due date → Accent colour swatches (`GROUP_TASK_ACCENT_COLORS`) → Icon grid (`GROUP_TASK_ICONS`) → optional **inline subtask drafts** (title, priority, assignee, due).

#### `accent_color` + `icon_key` — UI-only (TODO)

- State drives preview styling in the form.
- **`createGroupTaskAction` does not receive them** — no DB columns on `task_groups` yet (`GroupTaskWithMeta` comment in file).
- **`onCreated` synthetic group** includes `accent_color` and `icon_key` for local prepend in `GroupTasksTab`.

#### Members

No separate members chip flow in current modal — optional subtasks are created via `createSubtaskAction` after group insert (draft rows with assignee required).

#### `onCreated` conversion (`GroupTasksTab.handleGroupCreated`)

```text
TaskGroupRow = { ...group, subtask_count: 0, completed_count: 0, assignee_previews: [], accent_color, icon_key }
```

Prepended to local state — no list refetch.

---

### 14. `CreatePersonalTaskModal`

#### Fields

Title (autofocus, auto-grow) → Due presets (Today / Tomorrow / Next week) + optional `DatePicker` → Priority chips → Tags (max 10, Enter/comma) → Notes (collapsed "+ Add notes").

#### IST end-of-day presets

`istEndOfDay(dayOffset)` in modal:

- `IST_OFFSET_MS = 5.5 * 60 * 60 * 1000` (UTC+5:30)
- Floor to IST midnight for `today + dayOffset`
- End of IST day = midnight + 24h − 1ms
- Convert back to UTC → `.toISOString()`
- **Not** `toUTC()` from `dates.ts` (UTC passthrough only)

Offsets: Today = 0, Tomorrow = 1, Next week = 7.

#### Tags

Wired to `createPersonalTaskAction` → `tasks.tags` (migration 0024).

#### `onCreated(syntheticTask)`

Action returns `{ taskId, assignedTo, createdBy }`. Synthetic `Task` uses **`result.data.assignedTo` and `result.data.createdBy`** — not optimistic defaults — so assignee/creator match DB.

---

### 15. The `/tasks/[id]` Group Workspace

#### 15a. `WorkspaceAsync` / `page.tsx`

- `Promise.all([getTaskGroupById, getGroupSubtasks])`
- `null` group → `redirect('/tasks?tab=group')` inside `WorkspaceAsync` (not page)
- Back link in `page.tsx` outside Suspense

#### 15b. `GroupTaskWorkspace`

**View toggle:** `list` \| `board`  
**localStorage key:** `eia:tasks:workspace-view:${groupId}`  
**Default:** `useState('list')` until `useEffect` reads storage (no SSR mismatch).

**List sort:** priority DESC, then `due_at ASC NULLS LAST`.

**Board:** 5 columns — To Do, In Progress, In Review, Completed, Error/Cancelled (terminal merges error + cancelled; header count = sum; cards show actual status pill). Framer `layout` only — **no drag-and-drop between columns**.

**Realtime:** channel `` `workspace-subtasks-${groupId}-${mountId}` `` — INSERT/UPDATE merge into `subtasks` state.

**FAB:** title + assignee + priority + `DatePicker showTime` due date → `createSubtaskAction` → refetch/merge on success. `addDueAt` state is `Date | null` (was `string`); `.toISOString()` passed to action. Native `<input type="date">` is replaced — `DatePicker` is the only date input in this panel.

**Modal:** `getTaskRemarksAction` gate; `SubTaskModal` with `onTaskUpdated` / `onTaskDeleted`.

---

### 16. `SubTaskModal`

#### Shell

~`maxWidth: 1100px`, `width: 95vw`, `height: 90vh`, backdrop `var(--overlay-bg)`.

#### Two-zone grid (`38%` / `62%`)

| Zone A (38%) | Zone B (62%) |
| --- | --- |
| Title, description, Action Items checklist, deadline, assignee, metadata | `TaskRemarksPanel` `embedded` |

#### Header controls (semantic tokens)

- **Status dropdown:** `TASK_STATUS[status].pillBg` / `pillText` / `color`
- **Priority dropdown:** `TASK_PRIORITY[priority].color`
- Edit pencil, delete menu, close

#### Edit mode (Zone A only)

Save → `updateTaskAction` (title + description + **due_at**) + `updateChecklistAction` if changed — **no remark**. `router.refresh()` called after every successful save to sync RSC data.

**Deadline editing in edit mode:**

- `dueAt: string | null` — display state, seeded from `task.due_at` on mount. Read-only deadline row reads from this, not from `task.due_at` (which is an immutable prop). Updated via `setDueAt(newDueAtIso)` on save success.
- `editDueAt: Date | null` — edit state, seeded from `dueAt` state on `enterEditMode`. Bound to `DatePicker showTime` which replaces the read-only span when `editMode` is true.
- On save: `editDueAt?.toISOString()` compared against `task.due_at ?? null`; `due_at` included in `updateTaskAction` payload only when changed; `onTaskUpdated` emits `due_at` to parent.
- `SubTaskModalTaskUpdate` type includes `due_at?: string | null`.

#### `ActionItemAddRow`

Outside edit mode when `canToggleTaskComplete`; immediate `updateChecklistAction` (full array replace).

#### View-mode checklist toggle

`updateChecklistAction` optimistic.

#### Delete

- **Group subtask:** manager/admin/founder
- **Personal:** `created_by === caller.id AND assigned_to === caller.id`

Blocking `cancelTaskReminder` then `deleteTaskAction`.

#### `AnimatePresence`

**Required at call site** — modal does not wrap its own.

#### `onTaskUpdated`

`SubTaskModalTaskUpdate`: `{ id, status?, priority?, title?, description?, due_at? }`.

#### Remarks gate

Call sites fetch `getTaskRemarksAction` first; mount modal only when `remarks !== null`.

#### Personal Action Items

Shown for personal + group subtasks (`attachments` JSONB, migration 0023).

---

### 17. `TaskRemarksPanel`

#### Props

| Prop | Purpose |
| --- | --- |
| `taskId` | Remark thread |
| `currentUserId` / `currentUserName` | Author + optimistic |
| `initialRemarks` | Seed — no mount fetch |
| `composerPlaceholder?` | Default Playfair italic "Write a progress." |
| `embedded?` | Softer card borders + composer padding in Zone B |

#### Data seeding

`useEffect` on `taskId`: reset `remarks` from `initialRemarks`; seed `seenIds` from remark ids.

#### Optimistic post flow (4 steps, in order)

1. **Optimistic insert** at end of list at reduced opacity (`optimisticIds` tracks temp id).
2. **`addTaskRemarkAction`** → RPC `add_task_remark_with_status`.
3. **On success:** replace optimistic row immediately from `result.data` (do not wait for Realtime); add id to `seenIds`.
4. **Realtime echo:** dropped via `seenIds` (and echo replacement via `optimisticIds` + matching `author_id`).

#### Dedup

- **`seenIds` ref** — primary guard
- **`optimisticIds` ref** — secondary for echo replacement

Channel: `` `task-remarks-${taskId}-${mountId}` ``

#### `statusChange` contract

- **Schema:** `AddTaskRemarkSchema.statusChange` optional (`StatusEnum.optional()` — not nullable in Zod).
- **Display:** timeline shows chip when `remark.status_change` set (`TASK_REMARK_STATUS_LABELS` + `TASK_STATUS` remark tokens).
- **Compose UI (2026-06-01):** current `TaskRemarksPanel` posts **content only** — status chips in compose area are not wired in this file; use header/`updateTaskStatusAction` or extend panel to pass `statusChange` per blueprint A-4.

#### Suppressed rows

"This remark was removed." — content hidden for all roles.

#### Ambient orbs

`trp-orb-a` / `trp-orb-b` — transform + opacity only; `pointer-events: none`.

---

### 18. `AssigneePickerModal`

| Item | Value |
| --- | --- |
| Backdrop z-index | `var(--z-modal-overlay)` → **61** |
| Panel z-index | `var(--z-modal-nested)` → **62** |
| Above | `SubTaskModal` at `var(--z-modal)` → **60** |

Domain tabs: only `GIA_DOMAINS` with ≥1 user. Search: client-side on `users` prop (pre-fetched, max ~100). Single select.

**`AssignableUser`:** `Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'role' | 'domain'>`

Portaled to `document.body`.

---

### 19. Task Flows (A–N)

#### A. Create personal task (modal)

Header **+ My Task** → `requestCreate()` → `createTrigger++` → `CreatePersonalTaskModal` → `createPersonalTaskAction` → prepend synthetic `Task` with `assignedTo` / `createdBy` from response.

#### B. Create personal task (quick-add)

Calendar sidebar or inline row → `createPersonalTaskAction` → prepend — no full list refetch.

#### C. Inline complete (My Tasks + Gia + group subtask rows)

`TaskCompletionCircle` → `useTaskCompletionToggle` → `updateTaskStatusAction` (`completed` ↔ `to_do`) → on error rollback + toast. Completed My Tasks / Gia rows leave date sections (not a COMPLETED accordion).

#### D. Create group task

Any non-guest **+ Group Task** → `CreateGroupTaskModal` → `createGroupTaskAction` (+ optional parallel `createSubtaskAction` for drafts) → prepend `TaskGroupRow` locally. Domain locked to caller's own domain unless admin/founder.

#### E. Create subtask

Group tab inline or workspace FAB → `createSubtaskAction` → append `SubtaskWithAssignee` locally.

#### F. Open `SubTaskModal`

Row click → `getTaskRemarksAction` → gate `remarks !== null` → mount modal; parent passes `onTaskUpdated` / `onTaskDeleted` when lists must stay in sync.

#### G. Edit brief (Zone A)

Pencil → edit mode → Save Brief → `updateTaskAction` (+ `updateChecklistAction` if changed) — no remark.

#### H. Post remark (+ optional status)

Compose → `addTaskRemarkAction` → **`add_task_remark_with_status` RPC** (optional status in schema; atomic when provided).

#### I. Checklist toggle

Optimistic → `updateChecklistAction` (full array replace) → rollback on error.

#### J. Suppress remark

Admin/founder → `suppressTaskRemarkAction` → Realtime UPDATE → suppressed copy.

#### K/L. Delete task

Confirm → **awaited** `cancelTaskReminder` → `deleteTaskAction` → cascade remarks; `onTaskDeleted` updates parent lists.

#### M. Reminder fires

Trigger.dev at **`dueAt`** (not 30 minutes early) → `task_due` notification → bell → `/tasks`.

#### N. Gia follow-up created

| Trigger | Path |
| --- | --- |
| UI | `createLeadTaskAction` / `CreateGiaTaskModal` / dossier |
| Lead RPCs | `add_lead_call_note`, `update_lead_status` (nurturing — migration 0039 fix) |

Displayed: Gia tab (`get_gia_tasks`), dashboard widget, lead task cards (`getAllLeadTasks`).

---

### 20. Access Control Summary

| Operation | Agent | Manager | Admin/Founder |
| --- | --- | --- | --- |
| Create personal task | ✓ (own domain assign rules) | ✓ | ✓ |
| Create group task | ✓ (own domain, migration 0058) | ✓ (own domain) | ✓ |
| Create subtask | ✓ (domain) | ✓ (domain) | ✓ |
| Toggle complete (own assignment) | ✓ if assigned | ✓ | ✓ |
| Edit brief / checklist / remark | own assignee or creator | + domain group subtasks | ✓ |
| Suppress remark | ✗ | ✗ | ✓ |
| Delete personal task | both ownership fields | ✓ | ✓ |
| Delete group | own groups only (RLS: `created_by = auth.uid()`) | own groups only | service-role op |
| Delete subtask | ✗ | ✓ | ✓ |
| View group list | groups created by OR assigned a subtask in | same (migration 0058) | same (migration 0058) |
| View group workspace | own subtasks only in group list | same (migration 0058) | same (migration 0058) |
| View audit log | ✗ | ✓ | ✓ |

**RLS note (migration 0058):** `task_groups` visibility is now purely data-driven — creator OR subtask assignee. No role/domain branching. `get_user_role()` / `get_user_domain()` are absent from all group policies and the `get_group_task_summaries` RPC.

**RLS note (tasks):** Agents SELECT tasks where `assigned_to = auth.uid()` OR `created_by = auth.uid()`. `canMutateTask` also allows creator mutations when assignee differs. Migration 0094 added explicit `tasks_insert` (personal, self-assigned) + `tasks_delete` (agent: personal, self-owned, non-terminal) + `tasks_delete_privileged` (manager+: any) policies as defence-in-depth; server actions still mutate via `adminClient`. Migration 0088 wrapped every task-table role check in an InitPlan `(SELECT …)` subquery with no logic change.

**Group subtask visibility (unchanged):** Agents do not see colleagues' subtasks in the same group. Each agent sees only their own assigned subtasks — the group appears in their list only because they are assigned at least one subtask in it.

---

### 21. Migration Index

| # | File | Summary |
| --- | --- | --- |
| 0003 | `20260527000003_leads.sql` | Initial `tasks`, `task_gia_meta`, base RLS |
| 0016 | `20260528000016_notifications.sql` | `notifications` incl. `task_due`; relative `action_url` |
| 0017 | `20260528000017_os_tasks.sql` | `task_groups`, `task_messages`, tasks schema upgrade, status enum |
| 0018 | `20260528000018_task_groups_rls_domain.sql` | Manager domain enforcement on groups |
| 0019 | `20260528000019_task_messages_rls_creator.sql` | Creator access on messages (superseded by 0022) |
| 0020 | `20260528000020_group_task_summaries_rpc.sql` | `get_group_task_summaries` |
| 0021 | `20260528000021_task_suppression_audit.sql` | Suppression columns + `task_audit_log` + trigger |
| 0022 | `20260529000022_task_remarks.sql` | `task_remarks` replaces `task_messages` |
| 0023 | `20260529000023_task_attachments.sql` | Checklist JSONB on `tasks` |
| 0024 | `20260529000024_task_tags.sql` | `tags text[]` + GIN |
| 0025 | `20260529000025_task_performance_indexes.sql` | Index refresh + `get_personal_tasks` v1 |
| 0026 | `20260529000026_get_personal_tasks_cursor.sql` | Cursor params; retires PostgREST pagination |
| 0030 | `20260529000030_rpc_add_lead_call_note.sql` | Lead call note + Gia side-effects |
| 0031 | `20260529000031_rpc_update_lead_status.sql` | Lead status + nurturing Gia task |
| 0035 | `20260530000035_rpc_add_task_remark_with_status.sql` | Atomic remark + status RPC |
| 0039 | `20260530000039_fix_nurturing_task_insert.sql` | Nurturing task title + `gia_followup` category |
| 0041 | `20260530000041_normalize_lead_domain.sql` | `task_groups.domain` → `app_domain` |
| 0042 | `20260530000042_fix_group_task_summaries_domain_type.sql` | Fix RPC enum comparison |
| 0047 | `20260531000047_dashboard_agent_tasks_all_categories.sql` | Dashboard tasks CTE all categories |
| 0051 | `20260531000051_task_remark_rpc_auth_fix.sql` | Remark RPC auth; tasks agent `created_by` SELECT |
| 0054 | `20260531000054_create_lead_gia_task.sql` | `create_lead_gia_task` two-INSERT RPC |
| 0055 | `20260531000055_get_gia_tasks.sql` | `get_gia_tasks` for Gia tab |
| 0056 | `20260531000056_get_gia_tasks_slug_prereq.sql` | `leads.slug` + RPC recreate |
| 0057 | `20260531000057_task_type_other.sql` | `task_type` CHECK: call / whatsapp_message / other |
| 0058 | `20260605000058_task_groups_flat_visibility.sql` | Flat group visibility: creator OR subtask assignee for all roles; drops `get_user_role()`/`get_user_domain()` from RLS + RPC; agents unblocked from Group tab; `idx_tasks_group_assignee`; `task:group-list:{userId}` Redis key |
| 0086 | `20260608000086_fix_tasks_status_default.sql` | `ALTER COLUMN status SET DEFAULT 'to_do'` — 0017 migrated CHECK values but left the column default at legacy `'pending'`, which violated `tasks_status_check` on any INSERT that omitted `status` |
| 0088 | `20260608000088_rls_initplan_hoist.sql` | InitPlan optimisation — rewrites every task-table SELECT/UPDATE policy (`tasks_agent_select`, `tasks_manager_admin_founder_select`, `tasks_update`, `task_gia_meta_select`, `task_remarks_select`, `task_remarks_insert`, `task_remarks_suppression_update`, `task_audit_log_select`) to wrap `get_user_role()`/`get_user_domain()` in uncorrelated `(SELECT …)` subqueries so the STABLE function is evaluated once per statement, not once per row. **Logic unchanged — only the InitPlan wrapping.** Also confirms `task_remarks_select`/`_insert` use `assigned_to = auth.uid() OR created_by = auth.uid() OR role IN (manager,admin,founder)` directly (creator path explicit). |
| 0094 | `20260608000094_explicit_insert_delete_policies.sql` | **Adds explicit task INSERT/DELETE RLS** (defence-in-depth — app writes still use `adminClient`): `tasks_insert` (`created_by = auth.uid() AND assigned_to = auth.uid() AND task_category = 'personal'`); `tasks_delete` (agent: personal, self-owned, status IN `to_do`/`in_progress`); `tasks_delete_privileged` (manager/admin/founder: any). Gia-followup and group-subtask inserts have **no** direct policy — blocked by default, created only via SECURITY DEFINER RPCs or `adminClient`. |

---

### 22. Known Invariants (must never be violated)

1. **`page.tsx` rule:** Zero data-fetching calls in the page component body. Only `getCurrentProfile()` and `searchParams` parse. If violated, the Suspense boundary is broken and the skeleton never renders.

2. **`TasksAsync` prop boundary:** Returns serialisable plain objects to `TasksShell` — no service references, no Promises, no class instances cross the server→client boundary.

3. **`getPersonalTasks` sort:** Priority sort (urgent → high → normal) is done at the DB level via `get_personal_tasks` RPC on every page. JS `.sort()` is intentionally absent.

4. **`getPersonalTasks` return shape:** `{ tasks, hasMore, nextCursor }` — never `Task[]` alone. `hasMore` from `LIMIT pageSize+1`, never a second COUNT query.

5. **`getGroupTasks` cache:** Uses React `cache()` for per-request memoisation + Redis 120s (key `task:group-list:{userId}`, unfiltered calls only). Cannot use `unstable_cache` because `createClient()` calls `cookies()`, which Next.js forbids inside `unstable_cache` closures. Cache key is user-scoped since migration 0058 (visibility is creator OR subtask assignee — two users in the same domain see different sets). `createGroupTaskAction` awaits `redis.del(task:group-list:{callerId})`; `createSubtaskAction` awaits del for both `callerId` and `assignedTo`. Both also call `revalidatePath('/tasks')`.

6. **Client-side filtering:** All filtering is client-side via `src/lib/utils/task-client-filters.ts`. Never add server refetches for filter changes.

7. **Separate filter state:** `personalFilters` / `groupFilters` / `giaFilters` in `TasksShell` — switching tabs preserves each tab's filters.

8. **Inactive tab:** Inactive tab component never mounts; zero-value sentinel never visible.

9. **`task_remarks` append-only:** No DELETE policy ever. Suppression is the only UPDATE exception.

10. **`status_change` coupling:** CHECK values on `task_remarks.status_change` must mirror `tasks.status` CHECK exactly — if `tasks.status` gains a value, extend `task_remarks` in a new migration.

11. **`log_task_changes()` trigger:** Fires AFTER UPDATE on `tasks` FOR EACH ROW. Logs exactly six fields: `title`, `description`, `status`, `priority`, `due_at`, `assigned_to`. Never add `attachments` to this trigger — checklist toggles would flood the log.

12. **Trigger.dev idempotency:** `scheduleTaskReminder` passes `idempotencyKey: 'task-reminder-${taskId}'`. Trigger.dev v3 deduplicates by idempotency key for all non-terminal run states including DELAYED — a second `tasks.trigger()` with the same key while a DELAYED run exists returns the existing run handle (`isCached: true`), never creates a new run. Do not add a `reminder_run_id` column to `tasks` — it is not needed.

13. **View = post (remarks):** `addTaskRemarkAction` runs a user-scoped `tasks` SELECT first; only if RLS returns the row does it call `add_task_remark_with_status` with `adminClient`. Agents see tasks they created or are assigned to (`tasks_agent_select`).

14. **`adminClient` justification:** No INSERT/UPDATE RLS on `task_groups`, and the `tasks` INSERT/DELETE policies added in 0094 cover only personal self-assigned rows (gia-followup / group-subtask inserts have no policy and are blocked by default). `adminClient` bypasses RLS for all task mutations so the application layer must enforce the same access rules RLS would (`canMutateTask`, role checks, view = post gate). The 0094 policies are defence-in-depth for direct client access — they are **not** the path server actions take. Never skip the pre-write auth fetch.

15. **`deleteTaskAction`:** Cancel Trigger.dev reminder **before** DB delete. If cancel throws, the delete is aborted.

16. **`addTaskRemarkAction`:** Does not call `updateTaskStatusAction` when `statusChange` is set — the RPC handles both writes atomically.

17. **`suppressTaskRemarkAction`:** Writes only `{ is_suppressed, suppressed_by, suppressed_at }` — column restriction at action layer; RLS does not restrict columns.

18. **`GroupTasksTab` agents:** assignable users provided once at tab level (`initialAgents` prop) — `GroupRow` must never fetch them per group.

19. **`AnimatePresence`:** Required at **call site** for `SubTaskModal` and `CreateGiaTaskModal` — exit animation does not run if omitted.

20. **My Tasks vs legacy:** `MyTasksCalendarView` is the active My Tasks UI. The legacy `PersonalTasksTab` was deleted (2026-06-11) — do not recreate its COMPLETED accordion in the calendar view.

21. **Realtime channel names:** Include `mountId` from `useId()` — e.g. `task-remarks-${taskId}-${mountId}`, `workspace-subtasks-${groupId}-${mountId}`.

22. **Leads vs tasks filtering:** Tasks filter client-side on already-fetched tab data. Leads filter server-side via URL — do not conflate the two patterns.

---

### Constants reference (`task-constants.ts`)

Exports used by tasks UI: `TASK_PRIORITY`, `TASK_STATUS` (incl. `pillBg`/`pillText`, `remarkBg`/`remarkColor`/`remarkBorder`), `TASK_CATEGORY`, `TASK_REMARK_STATUS_LABELS`, `GROUP_TASK_ACCENT_COLORS`, `GROUP_TASK_ICONS`.

`WIDGET_HEIGHT_BY_SIZE` lives in `src/lib/constants/dashboard-widgets.ts` (dashboard widgets only — not part of task-constants).

#### `GIA_DOMAINS` / `DOMAIN_LABELS` (from `domains.ts`)

**`GIA_DOMAINS`:** `onboarding`, `house`, `shop`, `legacy`

**`DOMAIN_LABELS`:** full platform map including Gia domains (e.g. `onboarding` → "Onboarding", `house` → "Indulge House", …).

---

### Component inventory (`src/components/tasks/`)

| File | Role |
| --- | --- |
| `AddTaskButton.tsx` | Header CTA + `requestCreate` |
| `AssigneePickerModal.tsx` | Nested assignee picker |
| `CreateGiaTaskModal.tsx` | Gia task create |
| `CreateGroupTaskModal.tsx` | Group + optional subtask drafts |
| `CreatePersonalTaskModal.tsx` | Personal task create |
| `GiaDaySection.tsx` | Gia date heading |
| `GiaTaskRow.tsx` | Gia row |
| `GiaTasksTab.tsx` | Gia tab |
| `GroupTaskWorkspace.tsx` | `/tasks/[id]` workspace |
| `GroupTasksTab.tsx` | Group tab |
| `MyTasksCalendarView.tsx` | **Active** My Tasks |
| `SubTaskModal.tsx` | Task detail modal |
| `TaskCompletionCircle.tsx` | 24px completion control |
| `TaskRemarksPanel.tsx` | Remarks timeline |
| `TaskStatusIcon.tsx` | Canonical status icon |
| `TasksCreateContext.tsx` | `createTrigger` provider |
| `TasksFilters.tsx` | Filter strip controls |

---

*End of document. Source of truth: migrations, `tasks-service.ts`, `actions/tasks.ts`, route files, and components as of 2026-06-09 (migrations 0086 / 0088 / 0094).*
