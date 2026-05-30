# Task System Blueprint

<!-- markdownlint-disable MD013 MD060 -->

> Last verified against source: **2026-05-30**. Every fact extracted from migrations, services, actions, and components. Where source contradicts this document, source wins.

---

## 1. Overview

The Eia task system is an internal accountability layer spanning three task categories:

| Category | `task_category` | Owner / scope |
|---|---|---|
| **OS Personal** | `personal` | Individual todos owned by one user |
| **OS Group** | `group_subtask` | Subtasks under a `task_groups` parent, assignable across a domain |
| **Gia Follow-up** | `gia_followup` | System-created tasks attached to leads |

**Design principle — accountability through narrative:** every meaningful status change should carry a remark. A bare status toggle in the remarks panel is discouraged; `addTaskRemarkAction` accepts an optional `statusChange` and applies it atomically via the `add_task_remark_with_status` RPC (migration 0035). `updateTaskStatusAction` remains available for remark-free toggles (e.g. completion circles on the personal task list).

All three categories share one `tasks` table (discriminated by `task_category`) and one `task_remarks` table for the audit thread.

**Routes:**

| Route | Purpose |
|---|---|
| `/tasks` | Personal + group list (tabbed) |
| `/tasks/[id]` | Full group workspace (list/board views) |

**Sidebar:** Tasks nav item lives in `src/components/layout/Sidebar.tsx`.

---

## 2. Architecture

### 2.1 Layer map

```text
┌─────────────────────────────────────────────────────────────────┐
│  Pages (RSC orchestrators — session + URL only)                   │
│    tasks/page.tsx          tasks/[id]/page.tsx                  │
└────────────────────────────┬────────────────────────────────────┘
                             │ <Suspense>
┌────────────────────────────▼────────────────────────────────────┐
│  Async server components (only place that calls tasks-service)    │
│    TasksAsync.tsx          WorkspaceAsync.tsx                     │
└────────────────────────────┬────────────────────────────────────┘
                             │ serialisable props
┌────────────────────────────▼────────────────────────────────────┐
│  Client shells + feature components                             │
│    TasksShell → PersonalTasksTab | GroupTasksTab                  │
│    GroupTaskWorkspace → SubTaskModal → TaskRemarksPanel           │
└────────────────────────────┬────────────────────────────────────┘
                             │ server actions
┌────────────────────────────▼────────────────────────────────────┐
│  src/lib/actions/tasks.ts  (+ leads.ts for Gia tasks)             │
│    Zod → auth → canMutateTask / RPC → adminClient writes          │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  src/lib/services/tasks-service.ts  (reads — server client)       │
│  Supabase RPCs: get_personal_tasks, get_group_task_summaries,     │
│                 add_task_remark_with_status                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────────┐
│  PostgreSQL: tasks, task_groups, task_remarks, task_audit_log,  │
│              task_gia_meta, notifications                         │
└─────────────────────────────────────────────────────────────────┘

Trigger.dev (async): scheduleTaskReminder / cancelTaskReminder
  → sendTaskReminderTask → createNotification(type: task_due)
```

### 2.2 Suspense-split pages

**Rule:** page components never fetch task data. They read session + URL, then render `<Suspense>` with an async child.

**`/tasks`**

```text
tasks/page.tsx          ← getCurrentProfile() + parse ?tab= only
  └─ <Suspense fallback={<TasksSkeleton tab={tab} />}>
       └─ TasksAsync.tsx   ← getPersonalTasks | getGroupTasks (active tab only)
            └─ TasksShell.tsx   ← 'use client'
```

**`/tasks/[id]`**

```text
tasks/[id]/page.tsx     ← getCurrentProfile() + params.id only; back link outside Suspense
  └─ <Suspense fallback={<WorkspaceSkeleton />}>
       └─ WorkspaceAsync.tsx   ← getTaskGroupById + getGroupSubtasks; redirect if null
            └─ GroupTaskWorkspace.tsx   ← 'use client'
```

Null group redirect (`/tasks?tab=group`) happens inside `WorkspaceAsync`, not the page — so the shell streams without blocking on the fetch result.

### 2.3 Caching

| Function | Strategy | Invalidation |
|---|---|---|
| `getGroupTasks` | React `cache()` per request | `revalidatePath('/tasks')` in `createGroupTaskAction`, `createSubtaskAction` |
| `getPersonalTasks` | RPC per call — no cross-request cache | Client local state updates after mutations |

`unstable_cache` is **not** used for task queries — `createClient()` calls `cookies()`, which Next.js forbids inside `unstable_cache` closures.

### 2.4 Realtime surfaces

| Table | Where subscribed | Channel pattern |
|---|---|---|
| `task_remarks` | `TaskRemarksPanel` | `task-remarks-${taskId}-${mountId}` |
| `tasks` | `GroupTaskWorkspace` | `workspace-subtasks-${groupId}-${mountId}` |

`task_groups` does **not** have Realtime enabled.

### 2.5 File index

| Concern | Location |
|---|---|
| DB reads | `src/lib/services/tasks-service.ts` |
| Mutations | `src/lib/actions/tasks.ts` |
| Gia task creation | `src/lib/actions/leads.ts` (RPCs) |
| Zod schemas | `src/lib/validations/task-schemas.ts` |
| UI constants | `src/lib/constants/task-constants.ts`, `task-types.ts` |
| Reminders | `src/trigger/task-reminders.ts` |
| Notifications | `src/lib/services/notifications-service.ts` |
| Page rules | `src/app/(dashboard)/tasks/CLAUDE.md` |

---

## 3. Database Schema

### 3.1 `tasks`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PK |
| `assigned_to` | uuid | NOT NULL | — | FK → `profiles(id)` |
| `created_by` | uuid | NOT NULL | — | FK → `profiles(id)` |
| `module` | text | NOT NULL | — | OS tasks use `'gia'` in practice |
| `task_type` | text | NOT NULL | — | `call`, `whatsapp_message`, `email`, `general_follow_up` |
| `title` | text | NOT NULL | — | backfilled `'(untitled)'` in migration 0017 |
| `description` | text | NULL | — | |
| `status` | text | NOT NULL | `'to_do'` | CHECK: 6 values (see §4) |
| `priority` | text | NOT NULL | `'normal'` | CHECK: `urgent`, `high`, `normal` |
| `task_category` | text | NOT NULL | `'personal'` | CHECK: `personal`, `group_subtask`, `gia_followup` |
| `group_id` | uuid | NULL | — | FK → `task_groups(id)` ON DELETE CASCADE |
| `due_at` | timestamptz | NULL | — | |
| `completed_at` | timestamptz | NULL | — | set when `status = 'completed'` |
| `attachments` | jsonb | NOT NULL | `'[]'` | checklist items; CHECK `jsonb_typeof = 'array'` |
| `tags` | text[] | NOT NULL | `'{}'` | personal tasks only in practice |
| `created_at` | timestamptz | NOT NULL | `now()` | |
| `updated_at` | timestamptz | NOT NULL | `now()` | |

**Indexes (current — migration 0025 recreated stale ones):**

| Name | Columns | Partial condition |
|---|---|---|
| `idx_tasks_assigned_to` | `(assigned_to, due_at ASC NULLS LAST)` | `status NOT IN ('completed','cancelled','error')` |
| `idx_tasks_module` | `(module, assigned_to)` | same |
| `idx_tasks_agent_active` | `(assigned_to, task_category, due_at ASC NULLS LAST)` | same |
| `idx_tasks_category` | `(task_category)` | `status NOT IN ('completed','cancelled')` |
| `idx_tasks_group_id` | `(group_id)` | `group_id IS NOT NULL` |
| `idx_tasks_priority` | `(priority, due_at)` | `status NOT IN ('completed','cancelled')` |
| `idx_tasks_tags_gin` | GIN `(tags)` | `task_category = 'personal'` |
| `idx_tasks_tags_active` | `(assigned_to) INCLUDE (tags)` | `task_category = 'personal' AND status NOT IN ('completed','cancelled','error')` |

**Triggers:**

| Name | Event | Function |
|---|---|---|
| `tasks_updated_at` | BEFORE UPDATE | `update_updated_at()` |
| `tasks_audit` | AFTER UPDATE FOR EACH ROW | `log_task_changes()` — watches: `title`, `description`, `status`, `priority`, `due_at`, `assigned_to` only |

**RLS:**

| Policy | Command | Rule |
|---|---|---|
| `tasks_agent_select` | SELECT | `get_user_role() = 'agent' AND assigned_to = auth.uid()` |
| `tasks_manager_admin_founder_select` | SELECT | role IN (`manager`,`admin`,`founder`) |
| `tasks_update` | UPDATE | agent: own assignment; manager+: all |

No INSERT/DELETE RLS — writes go through `adminClient` in actions.

---

### 3.2 `task_groups`

| Column | Type | Nullable | Default | Notes |
|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PK |
| `title` | text | NOT NULL | — | |
| `description` | text | NULL | — | |
| `priority` | text | NOT NULL | `'normal'` | same CHECK as tasks |
| `status` | text | NOT NULL | `'to_do'` | same CHECK as tasks |
| `due_at` | timestamptz | NULL | — | |
| `created_by` | uuid | NOT NULL | FK → profiles | |
| `domain` | text | NOT NULL | — | scoped to `app_domain` values |
| `created_at` / `updated_at` | timestamptz | NOT NULL | `now()` | |

**Indexes:** `idx_task_groups_domain` (partial active), `idx_task_groups_created_by`

**RLS (migration 0018 — manager domain enforced):**

| Policy | Command | Rule |
|---|---|---|
| `task_groups_select` | SELECT | creator OR admin/founder OR (manager AND `get_user_domain() = domain`) |
| `task_groups_insert` | INSERT | authenticated |
| `task_groups_update` | UPDATE | same as SELECT |
| `task_groups_delete` | DELETE | admin/founder only |

Realtime: **not enabled**.

---

### 3.3 `task_remarks`

Replaced `task_messages` (dropped migration 0022).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `task_id` | uuid FK → tasks ON DELETE CASCADE | |
| `author_id` | uuid FK → profiles | |
| `content` | text NOT NULL | `sanitizeText()` at action layer |
| `status_change` | text NULL | CHECK mirrors `tasks.status` — must stay coupled |
| `is_suppressed` | boolean NOT NULL DEFAULT false | |
| `suppressed_by` | uuid NULL | |
| `suppressed_at` | timestamptz NULL | |
| `created_at` | timestamptz NOT NULL | |

**Index:** `idx_task_remarks_task_id` on `(task_id, created_at ASC)`

**Realtime:** enabled.

**RLS:** SELECT/INSERT via EXISTS on tasks (assignee, creator, or manager+). UPDATE only for suppression (admin/founder). **No DELETE policy — ever.**

Column scope on suppression UPDATE is enforced at the action layer only — PostgreSQL RLS cannot restrict columns.

---

### 3.4 `task_audit_log`

Append-only. Populated exclusively by `log_task_changes()` trigger.

Columns: `id`, `task_id`, `changed_by`, `field_name`, `old_value`, `new_value`, `changed_at`

**Index:** `(task_id, changed_at DESC)`

**RLS:** SELECT for manager/admin/founder only. No INSERT/UPDATE/DELETE policies.

ON DELETE CASCADE from tasks — deleting a task removes its audit log (application restricts deletion to admin/founder).

`attachments`, `tags`, `task_category`, `group_id` are **intentionally excluded** from the trigger.

---

### 3.5 `task_gia_meta`

One row per Gia follow-up task.

| Column | Type | Notes |
|---|---|---|
| `task_id` | uuid PK FK → tasks CASCADE | |
| `lead_id` | uuid FK → leads | |
| `call_outcome` | text NULL | populated when call task completes |

**Index:** `idx_task_gia_meta_lead_id`

**RLS:** SELECT via EXISTS on tasks with role-appropriate assignment rules.

---

### 3.6 `notifications` — task-relevant

Task notification types: `task_due`, `task_assigned`.

`action_url` CHECK: relative paths only (`NOT LIKE 'http%'`).

Full `NotificationType` union in `database.ts` also includes `lead_assigned`, `lead_won`, `mention`, `system`, `sla_breach_agent`, `sla_breach_manager` — only the first two task types concern this module.

---

## 4. Database RPCs

### 4.1 `get_personal_tasks` (migrations 0025, 0026)

**Purpose:** DB-level sort that PostgREST cannot express — priority CASE inside ORDER BY, plus composite keyset cursor.

**Sort order (every page):** `due_at ASC NULLS LAST` → priority (`urgent=1, high=2, normal=3`) → `id ASC`

**Parameters:**

| Param | Purpose |
|---|---|
| `p_user_id` | Required — must match authenticated user (enforced in action layer) |
| `p_status`, `p_priority`, `p_tags`, `p_due_before` | Optional filters |
| `p_limit` | Default 51 (= pageSize + 1 for hasMore) |
| `p_cursor_id`, `p_cursor_due_at`, `p_cursor_has_due_at` | Composite cursor; all null = page 1 |

**Security:** `STABLE SECURITY DEFINER`, `SET search_path = public`

**Service usage:** `getPersonalTasks()` calls this RPC for **all** pages. The PostgREST cursor path was retired when TD-003 was resolved (2026-05-29). No JavaScript re-sort.

---

### 4.2 `get_group_task_summaries` (migration 0020)

**Purpose:** One round trip for group list rows with pre-aggregated subtask counts and assignee id arrays.

**Parameters:** `p_status`, `p_priority` (nullable arrays)

**Returns per row:** all `task_groups` columns + `subtask_total`, `subtask_completed`, `assignee_ids[]`

**Domain scoping:** enforced inside RPC via `get_user_domain()` — caller never passes domain.

**Service usage:** `getGroupTasks()` → RPC + one batch `profiles` fetch for avatar previews (max 4 per group, sliced in service).

---

### 4.3 `add_task_remark_with_status` (migration 0035)

**Purpose:** Atomic remark insert + optional status update in one transaction (replaces 6 sequential awaits).

**Parameters:** `p_task_id`, `p_author_id`, `p_content` (pre-sanitized), `p_status_change` (nullable)

**Behaviour:**

1. Inline auth via `auth.uid()` — assigned_to, created_by, or manager/admin/founder
2. Optional `tasks.status` UPDATE (sets `completed_at` when → `completed`; fires `log_task_changes()`)
3. `task_remarks` INSERT — append-only

**Returns:** full `task_remarks` row

**Security:** `SECURITY DEFINER` — RLS bypassed; access check duplicated inside function.

---

### 4.4 Lead RPCs that create Gia tasks

| RPC | Migration | Gia side-effect |
|---|---|---|
| `add_lead_call_note` | 0030 | Creates follow-up task + `task_gia_meta` on certain outcomes |
| `update_lead_status` | 0031, fixed 0039 | When `p_status = 'nurturing'`: inserts task with `title = 'Nurturing follow-up'`, `task_category = 'gia_followup'`, `due_at = now() + 3 months` |

Migration 0039 fixed silent nurturing failure: original INSERT omitted `title` (NOT NULL) and defaulted `task_category` to `'personal'`.

---

## 5. Type System

Defined in `src/lib/types/database.ts` unless noted.

### Enums and unions

```typescript
TaskStatus   = 'to_do' | 'in_progress' | 'in_review' | 'completed' | 'error' | 'cancelled'
TaskPriority = 'urgent' | 'high' | 'normal'
TaskCategory = 'personal' | 'group_subtask' | 'gia_followup'
TaskType     = 'call' | 'whatsapp_message' | 'email' | 'general_follow_up'
```

Old values `pending` / `done` were removed in migration 0017.

### `ChecklistItem`

```typescript
{ id: string; text: string; checked: boolean }
```

Stored in `tasks.attachments` JSONB. Shape validated at application layer only.

### Core row types

`Task`, `TaskGroup`, `TaskRemark`, `TaskAuditLog`, `TaskGiaMeta` — mirror DB columns with narrowed unions on `Task`.

### Composite types — `src/lib/services/tasks-service.ts`

| Type | Shape |
|---|---|
| `PersonalTaskCursor` | `{ due_at: string \| null; id: string }` |
| `PersonalTaskFilters` | `status?`, `priority?`, `tags?`, `due_before?`, `cursor?`, `limit?` (cap 500) |
| `PersonalTasksResult` | `{ tasks, hasMore, nextCursor }` |
| `GroupTaskFilters` | `status?`, `priority?` |
| `AssigneeSlim` | `Pick<Profile, 'id' \| 'full_name' \| 'avatar_url'>` |
| `TaskGroupRow` | `TaskGroup & { subtask_count, completed_count, assignee_previews }` |
| `SubtaskWithAssignee` | `Task & { assignee: AssigneeSlim \| null }` |
| `TaskRemarkWithAuthor` | `TaskRemark & { author: AssigneeSlim \| null }` |
| `TaskWithMessages` | `Task & { messages: TaskRemarkWithAuthor[] }` |

---

## 6. Constants

### 6.1 `src/lib/constants/task-constants.ts`

**`TASK_PRIORITY`** — label, `color` (CSS var), `order`

**`TASK_STATUS`** — extended token set per status:

| Token | Used for |
|---|---|
| `label`, `color`, `order` | Icons, dropdowns, inline labels |
| `pillBg`, `pillText` | Solid status pills (group list, workspace) |
| `remarkBg`, `remarkColor`, `remarkBorder` | Light chips in remark timeline |

All values are CSS variables — never hex in components.

**`TASK_CATEGORY`** — label + color for personal / group / Gia badges

**`TASK_REMARK_STATUS_LABELS`** — past-tense strings for timeline status chips (`Record<TaskStatus, string>`)

**`GROUP_TASK_ACCENT_COLORS`** — 10 `{ id, hex, label }` entries for UI swatches. **Not persisted** — no DB column yet.

**`GROUP_TASK_ICONS`** — 25 Lucide icon names for UI grid. **Not persisted** — no DB column yet.

### 6.2 `src/lib/constants/task-types.ts`

`TASK_TYPES`, `TASK_TYPE_LABELS`, `TASK_STATUSES`, `TASK_STATUS_LABELS` — used by group tab status pills and Gia task typing.

### 6.3 `TaskStatusIcon` — `src/components/tasks/TaskStatusIcon.tsx`

**Canonical** status icon for all task UI. Maps each `TaskStatus` to a Lucide icon coloured from `TASK_STATUS[status].color`. Replaces all local inline icon switches (GroupTasksTab, GroupTaskWorkspace, SubTaskModal, TaskRemarksPanel).

Props: `status`, `className?`, `size?` (default 13px).

---

## 7. Validation Schemas

All in `src/lib/validations/task-schemas.ts`. Zod first line of every action (Rule S-01).

| Schema | Action | Key fields |
|---|---|---|
| `CreatePersonalTaskSchema` | `createPersonalTaskAction` | title, description?, priority, due_at?, assigned_to?, tags (max 10) |
| `CreateGroupTaskSchema` | `createGroupTaskAction` | title, description?, priority, due_at?, domain |
| `CreateSubtaskSchema` | `createSubtaskAction` | group_id, title, description?, priority, due_at?, assigned_to (required) |
| `UpdateTaskSchema` | `updateTaskAction` | taskId + optional title, description, priority, status, due_at, assigned_to |
| `UpdateTaskStatusSchema` | `updateTaskStatusAction` | taskId, status |
| `AddTaskRemarkSchema` | `addTaskRemarkAction` | taskId, content (1–2000), statusChange? |
| `DeleteTaskSchema` | `deleteTaskAction` | taskId |
| `SuppressTaskRemarkSchema` | `suppressTaskRemarkAction` | messageId (remark id) |
| `UpdateChecklistSchema` | `updateChecklistAction` | taskId, items[] |
| `UpdateTaskTagsSchema` | `updateTaskTagsAction` | taskId, tags (max 10) |

All text fields pass through `sanitizeText()` in schema transforms.

---

## 8. Service Layer

**File:** `src/lib/services/tasks-service.ts`  
**Client:** server Supabase client only — never `adminClient`.

### `PERSONAL_TASKS_PAGE_SIZE = 50`

### `getPersonalTasks(userId, filters?)`

- Calls `get_personal_tasks` RPC (single code path)
- Returns `{ tasks, hasMore, nextCursor }` where `nextCursor` encodes last row's `(due_at, id)`
- On error: logs + empty result

### `getGroupTasks(filters?)`

- Wrapped in React `cache()` for per-request dedup
- RPC `get_group_task_summaries` + batch profile fetch
- Assignee previews capped at 4 in service layer

### `getGroupSubtasks(groupId)`

- PostgREST query: `group_id + task_category = 'group_subtask'`, order `due_at ASC NULLS LAST`
- Batch profile resolve for assignees

### `getTaskById(taskId)`

- `Promise.all` — task SELECT + `getTaskRemarks()` in parallel
- Returns `TaskWithMessages | null`

### `getTaskRemarks(taskId)`

- ASC order (oldest first)
- Batch author profile fetch — no N+1

### `getTaskGroupById(groupId)`

- Single row; RLS returns null for wrong domain

### `getPersonalTaskTags(userId)`

- Scans **active** personal tasks only (`status NOT IN completed/cancelled/error`)
- Uses `idx_tasks_tags_active` covering index
- Returns sorted deduplicated `string[]`

---

## 9. Action Layer

**File:** `src/lib/actions/tasks.ts` — `'use server'`

**Invariants:**

- Zod → auth → authorization → write
- `adminClient` for INSERT/UPDATE/DELETE (RLS bypass — app layer enforces access)
- Server client for read-before-write
- Returns `ActionResult<T>` — never throws

### `canMutateTask(caller, task)` (internal)

| Role | Allowed when |
|---|---|
| admin / founder | always |
| any | `assigned_to === caller.id` OR `created_by === caller.id` |
| manager | above OR group subtask in `caller.domain` (extra `task_groups` read) |

### Mutation actions

| Action | Auth highlights | Side effects |
|---|---|---|
| `createPersonalTaskAction` | manager+ to assign others | `task_assigned` notification; `scheduleTaskReminder` if due |
| `createGroupTaskAction` | manager+ only; domain locked for managers | `revalidatePath('/tasks')` |
| `createSubtaskAction` | agent domain-scoped | returns full `SubtaskWithAssignee`; notification; reminder; `revalidatePath('/tasks')` |
| `updateTaskStatusAction` | `canMutateTask`; auth + task fetch in `Promise.all` | sets `completed_at`; `cancelTaskReminder` on terminal |
| `updateTaskAction` | `canMutateTask`; parallel auth + fetch | reminder reschedule on due change |
| `deleteTaskAction` | agent: both created_by AND assigned_to | **awaited** `cancelTaskReminder` before delete |
| `updateChecklistAction` | `canMutateTask`; parallel auth + fetch | excluded from audit trigger |
| `updateTaskTagsAction` | `canMutateTask`; parallel auth + fetch | |
| `addTaskRemarkAction` | assigned/created/manager+ | single RPC call — no nested `updateTaskStatusAction` |
| `suppressTaskRemarkAction` | admin/founder only | idempotent; three columns only |

### Read wrappers (client-callable)

| Action | Underlying |
|---|---|
| `getPersonalTasksAction(filters?)` | `getPersonalTasks(caller.id, filters)` |
| `getGroupSubtasksAction(groupId)` | `getGroupSubtasks` |
| `getPersonalTaskTagsAction()` | `getPersonalTaskTags(caller.id)` |
| `getTaskGroupByIdAction(groupId)` | `getTaskGroupById` |
| `getTaskRemarksAction(taskId)` | `getTaskRemarks` |

Never accept `userId` from the client — always derive from `getCurrentProfile()`.

---

## 10. Trigger.dev Integration

**File:** `src/trigger/task-reminders.ts`

### `sendTaskReminderTask`

- ID: `'send-task-reminder'`, retry ×3
- Payload: `{ taskId, assignedTo }`
- Fires `createNotification({ type: 'task_due', action_url: '/tasks' })` 30 min before due

### `scheduleTaskReminder(taskId, dueAt, assignedTo)`

- `reminderAt = dueAt - 30min`; no-op if past
- `idempotencyKey: 'task-reminder-${taskId}'` — Trigger.dev v3 deduplicates DELAYED runs
- Tag: `task-reminder-${taskId}`

### `cancelTaskReminder(taskId)`

- Lists runs by tag with status DELAYED/QUEUED; cancels all (idempotent)

### Call matrix

| Action | schedule | cancel |
|---|---|---|
| `createPersonalTaskAction` | if due_at | — |
| `createSubtaskAction` | if due_at | — |
| `updateTaskStatusAction` | — | fire-and-forget on terminal |
| `updateTaskAction` | if due changed | awaited before reschedule |
| `deleteTaskAction` | — | **blocking** — abort delete on failure |

No `reminder_run_id` column in DB — idempotency key is sufficient.

---

## 11. Notification Integration

| Source | Type | Recipient | Condition |
|---|---|---|---|
| `createPersonalTaskAction` | `task_assigned` | assignee | assignee ≠ caller |
| `createSubtaskAction` | `task_assigned` | assignee | assignee ≠ caller |
| `sendTaskReminderTask` | `task_due` | assignee | always |

All action-side `createNotification()` calls are fire-and-forget.

**`NotificationItem.tsx`:** `task_assigned` → `CheckSquare`; `task_due` → `Clock`. Both navigate to `/tasks`.

---

## 12. Page Routes

### `/tasks`

| File | Role |
|---|---|
| `page.tsx` | Session gate; parse `?tab=personal\|group`; render Suspense |
| `TasksAsync.tsx` | Fetch active tab only; pass props to shell |
| `TasksSkeleton.tsx` | Fallback — personal (3×5 rows) or group (4 cards), stagger §11.4 |
| `TasksShell.tsx` | Tab state, URL sync, `+ My Task` / `+ Group Task` header button |

**Inactive tab:** receives empty sentinel on SSR; no fetch until user switches tab (client refetch via actions on tab activation is **not** implemented — switching tab triggers full navigation with new SSR fetch via URL).

### `/tasks/[id]`

| File | Role |
|---|---|
| `page.tsx` | Back link + Suspense |
| `WorkspaceAsync.tsx` | Parallel fetch; redirect if null |
| `WorkspaceSkeleton.tsx` | Header + 5 subtask row skeletons |
| `GroupTaskWorkspace.tsx` | List/board toggle, Realtime, FAB add subtask |

---

## 13. Component Map

### `PersonalTasksTab`

**Props:** `initialResult`, `currentUserId`, `currentUserName`, `callerRole`, `callerDomain`, `createTrigger?`

**Data strategy:**

- Active tasks: seeded from SSR `initialResult` — **no mount re-fetch**
- Completed: lazy-loaded on first accordion expand (`hasLoadedCompleted` ref guard)
- Tags: `getPersonalTaskTagsAction` on mount
- Assignable agents: `listAgentsForDomain` on mount (manager+ only)

**Layout:** quick-add row → URGENT / HIGH / NORMAL sections → COMPLETED (collapsed)

**Modal open pattern:**

1. Row click → `setSelectedTaskRemarks(null)` (gate)
2. `getTaskRemarksAction(taskId)` in flight
3. `<AnimatePresence>` renders `SubTaskModal` only when `selectedTaskRemarks !== null`

**Actions:** `createPersonalTaskAction`, `updateTaskStatusAction` (completion circle), `getPersonalTasksAction` (completed lazy load), `getTaskRemarksAction`

**Optimistic:** completion circle via `optimisticStatus` map; section collapse in `useRef`

**Quick-add:** prepends synthetic task on success — no full re-fetch

---

### `GroupTasksTab`

**Props:** `initialRows`, user context, `createTrigger?`

**Data strategy:**

- `assignableUsers` fetched **once** at tab level — passed to every `GroupRow` (not N calls)
- Subtasks lazy-loaded per group on first accordion expand
- New group prepended locally from `CreateGroupTaskModal.onCreated`
- New subtask appended locally from `createSubtaskAction` return value

**Modal open:** same remarks pre-fetch gate as personal tab

**Actions:** `getGroupSubtasksAction`, `createSubtaskAction`, `getTaskRemarksAction`, `listAgentsForDomain`

---

### `GroupTaskWorkspace`

**Props:** `group`, `initialSubtasks`, user context

**Views:** list (default) | board (5 columns) — persisted to `localStorage` key `eia:tasks:workspace-view:${groupId}`

**Realtime:** subtask INSERT/UPDATE merged into local state

**Board:** Framer Motion `layout` on card move — **no drag-and-drop between columns**

**No inline complete** for subtasks in list/board — status changes happen in `SubTaskModal`

**Actions:** `createSubtaskAction`, `getGroupSubtasksAction` (modal close re-sync), `getTaskRemarksAction`

---

### `SubTaskModal`

**Props:** `open`, `onClose`, `task`, `group?`, `assignee?`, `initialRemarks`, `callerProfile`, `currentUserName?`

**Shell:** fixed overlay, ~1100px max width, 90vh. Backdrop uses `var(--theme-overlay)`.

**Zones:**

- **A (38%):** title, description, checklist (group subtasks only), deadline, assignee, metadata
- **B (62%):** `TaskRemarksPanel`

**Header:** status + priority dropdowns (optimistic), edit pencil, delete menu

**Edit mode:** Zone A only — `updateTaskAction` + `updateChecklistAction`; no remark inserted

**Delete:** personal — agent needs both ownership fields; group subtask — broader access

**`AnimatePresence`:** required at **call site** for exit animation; modal has internal backdrop animation only

**Uses:** `TaskStatusIcon` for status UI

---

### `TaskRemarksPanel`

**Props:** `taskId`, `currentUserId`, `currentUserName`, `initialRemarks`, `composerPlaceholder?`

**Data:** seeded from `initialRemarks`; re-seeds on `taskId` change. No mount fetch.

**Post flow:**

1. Optimistic insert at reduced opacity
2. `addTaskRemarkAction` → RPC
3. On success: immediately replace optimistic row from `result.data` (don't wait for Realtime)
4. Realtime echo hits `seenIds` — dropped

**Dedup:** `seenIds` ref (primary); echo replacement via `optimisticIds` + `author_id === currentUserId`

**Status pills:** 6 optional status-change chips; uses `TASK_STATUS` remark tokens + `TaskStatusIcon`

**Suppressed rows:** "This remark was removed." — content hidden for all roles

**Ambient orbs:** GPU-only transform + opacity; `pointer-events: none`

---

### `AssigneePickerModal`

Nested modal (`--z-modal-nested`). Portaled to `document.body`. Domain tabs + client search. Pre-fetched user list from parent (max ~100 agents).

---

### `CreatePersonalTaskModal`

Composes `ui/modal.tsx`. Fields: title, due presets (IST end-of-day chips), priority, tags, notes. Tags wired to DB since migration 0024. `onCreated(syntheticTask)` — parent prepends.

---

### `CreateGroupTaskModal`

Composes `ui/modal.tsx` (`max-w-3xl`). Left preview + right form. Accent colour, icon, and members are **UI-only** — not sent to `createGroupTaskAction`.

---

## 14. Task Flows

### A. Create personal task (modal)

Header `+ My Task` → `createTrigger++` → modal → `createPersonalTaskAction` → parent prepends synthetic task.

### B. Create personal task (quick-add)

Inline row → Enter/Save → `createPersonalTaskAction` → prepend to `activeTasks` (no refetch).

### C. Inline complete (personal list)

Circle click → optimistic status → `updateTaskStatusAction` → on error rollback + toast.

### D. Create group task

Manager+ header button → `CreateGroupTaskModal` → `createGroupTaskAction` → prepend `TaskGroupRow` locally.

### E. Create subtask

Inline panel or workspace FAB → `createSubtaskAction` → returns `SubtaskWithAssignee` → append to local list (no refetch).

### F. Open SubTaskModal

Row click → fetch remarks → gate modal on `remarks !== null` → mount with populated timeline.

### G. Edit brief (Zone A)

Pencil → edit mode → Save Brief → `updateTaskAction` (+ checklist if changed) → no remark.

### H. Post remark (+ optional status)

Compose → optional status pill → `addTaskRemarkAction` → **`add_task_remark_with_status` RPC** (atomic).

### I. Checklist toggle

Optimistic → `updateChecklistAction` (full array replace) → rollback on error.

### J. Suppress remark

Admin/founder → `suppressTaskRemarkAction` → Realtime UPDATE → suppressed copy.

### K/L. Delete task

Confirm → blocking `cancelTaskReminder` → `deleteTaskAction` → cascade remarks.

### M. Reminder fires

Trigger.dev at due−30m → `task_due` notification → bell → navigate `/tasks`.

### N. Gia follow-up created

Via lead RPCs only — no direct UI creates `gia_followup` tasks:

| Trigger | RPC | Result |
|---|---|---|
| Call logged | `add_lead_call_note` | Task + meta for follow-up outcomes |
| Status → nurturing | `update_lead_status` | 3-month nurturing task (fixed 0039) |

Displayed in `AgentTasksWidget` and `LeadDossierTasksAsync` via dashboard/leads services.

---

## 15. Gia Task Integration

### Discriminators

- `task_category = 'gia_followup'`
- `module = 'gia'`
- `task_type` meaningful: `call`, `whatsapp_message`, `email`, `general_follow_up`
- Companion `task_gia_meta.lead_id` row required
- No `group_id`; tags unused in practice

### Display surfaces

| Surface | Service | Query pattern |
|---|---|---|
| Dashboard widget | `getAgentTasksSummary` | `tasks !inner task_gia_meta !inner leads` |
| Lead dossier | `getNextLeadTask` | root `tasks`, filter `task_gia_meta.lead_id`, status active, order `due_at ASC`, limit 1 |

**Join rule:** filter on root table columns; use `!inner` when filtering on joined tables in Supabase JS.

---

## 16. Authorization Matrix

| Operation | agent | manager | admin | founder |
|---|---|---|---|---|
| Create personal task | ✓ | ✓ | ✓ | ✓ |
| Create group task | ✗ | domain | ✓ | ✓ |
| Create subtask | domain | domain | ✓ | ✓ |
| View personal (own) | ✓ | ✓ | ✓ | ✓ |
| View personal (others) | ✗ | ✓ | ✓ | ✓ |
| View group / subtask | own subtask | domain | ✓ | ✓ |
| Edit / status / remark / checklist | own | domain | ✓ | ✓ |
| Suppress remark | ✗ | ✗ | ✓ | ✓ |
| Delete personal (both ownership) | ✓ | ✓ | ✓ | ✓ |
| Delete personal (assigned by other) | ✗ | ✓ | ✓ | ✓ |
| Delete group | ✗ | ✗ | ✓ | ✓ |
| Delete subtask | ✗ | ✓ | ✓ | ✓ |
| View audit log | ✗ | ✓ | ✓ | ✓ |

**RLS note:** agents only **see** tasks where `assigned_to = auth.uid()` — but `canMutateTask` allows mutation when `created_by` matches even if RLS blocks SELECT on reads.

**Group subtask visibility:** agents cannot see colleagues' subtasks in the same group — by design.

---

## 17. Performance Optimizations (shipped)

| Change | Date | Effect |
|---|---|---|
| `get_personal_tasks` RPC with cursor (0026) | 2026-05-29 | DB-level priority sort on every page; TD-003 closed |
| Index refresh (0025) | 2026-05-29 | Dead `pending` partial indexes replaced |
| `add_task_remark_with_status` RPC (0035) | 2026-05-30 | 6 awaits → 1 round-trip on remark+status |
| Remarks pre-fetch before modal mount | 2026-05-30 | Eliminates blank timeline POST on modal open |
| `Promise.all` auth + task fetch in 4 mutation actions | 2026-05-30 | −1 RTT per mutation |
| `getTaskById` parallel task + remarks | 2026-05-30 | −1 RTT |
| Completed tasks lazy load | 2026-05-30 | No completed fetch on page load |
| Quick-add / subtask create local prepend | 2026-05-30 | No 500-row refetch after create |
| `assignableUsers` hoisted to `GroupTasksTab` | 2026-05-30 | N agent fetches → 1 |
| Suspense-split tasks pages | 2026-05-30 | Skeleton renders immediately |
| Lead RPCs for call note + status (0030/0031) | 2026-05-29 | Gia task creation atomic with lead writes |

---

## 18. Known Gaps and Tech Debt

### Resolved

| ID | Item | Resolved |
|---|---|---|
| TD-001 | Duplicate `getCallerProfile` in leads actions | 2026-05-29 — uses `getCurrentProfile` |
| TD-003 | PostgREST cursor path lacked priority sort | 2026-05-29 — migration 0026 |

### Open

**TD-002 — `console.error` in tasks-service**  
`getPersonalTasks`, `getGroupTasks`, `getGroupSubtasks`, `getTaskRemarks` log to console. Replace with Sentry when wired.

**Stale TODO in `CreatePersonalTaskModal`**  
Comment about wiring tags is obsolete — tags work since migration 0024. Remove comment.

**`CreateGroupTaskModal` open items:**

1. `accent_color` + `icon_key` columns on `task_groups`
2. `searchProfilesAction` for member search
3. `task_group_members` junction table

**Audit trigger imperfection**  
`log_task_changes()` `changed_by` may fall back to `assigned_to` in service-role context — documented trade-off.

---

## 19. What Does Not Exist Yet

| Item | Notes |
|---|---|
| `accent_color` / `icon_key` on `task_groups` | UI renders swatches; action omits |
| `task_group_members` table | Member chips are local-only in create modal |
| `searchProfilesAction` | Stub "coming soon" in create modal |
| Sia / finance task modules | `module` column is free text; only `'gia'` used |
| `/task-insights` route | Planned, not built |
| CSV/batch task import | Not built |
| Board drag-and-drop | Board view exists; no column DnD |
| Inline complete for group subtasks | Status changes via modal only |
| Direct UI to create `gia_followup` | All creation via lead RPCs |
| LuxuryCalendar | Use `ui/DatePicker` if needed |

---

## 20. Migration Index (task-related)

| # | File | Summary |
|---|---|---|
| 0017 | `20260528000017_os_tasks.sql` | `task_groups`, tasks schema upgrade, status enum migration |
| 0018 | `20260528000018_task_groups_rls_domain.sql` | Manager domain RLS on groups |
| 0020 | `20260528000020_group_task_summaries_rpc.sql` | `get_group_task_summaries` |
| 0021 | `20260528000021_task_suppression_audit.sql` | Suppression columns + `task_audit_log` |
| 0022 | `20260529000022_task_remarks.sql` | `task_remarks` replaces `task_messages` |
| 0023 | `20260529000023_task_attachments.sql` | Checklist JSONB on tasks |
| 0024 | `20260529000024_task_tags.sql` | `tags text[]` + GIN index |
| 0025 | `20260529000025_task_performance_indexes.sql` | Index fix + `get_personal_tasks` v1 |
| 0026 | `20260529000026_get_personal_tasks_cursor.sql` | Cursor params — retires PostgREST path |
| 0030 | `20260529000030_rpc_add_lead_call_note.sql` | Lead call note atomic RPC |
| 0031 | `20260529000031_rpc_update_lead_status.sql` | Lead status atomic RPC |
| 0035 | `20260530000035_rpc_add_task_remark_with_status.sql` | Remark + status RPC |
| 0039 | `20260530000039_fix_nurturing_task_insert.sql` | Nurturing Gia task fix |

---

*End of blueprint. Update this file whenever task schema, RPCs, actions, or UI architecture changes materially.*
