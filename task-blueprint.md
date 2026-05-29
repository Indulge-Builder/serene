# Task System Blueprint

> Generated 2026-05-29. Every fact extracted from source files. Where source contradicts memory, source wins.

---

## 1. Overview

The Eia task system is an internal accountability layer that spans three distinct task categories: **OS Personal** (individual todos owned and managed by a single user), **OS Group** (structured work items organised under a `task_groups` parent, with subtasks assignable across a domain), and **Gia Follow-up** (system-created tasks attached to leads, driving the concierge/sales pipeline). The design principle is *accountability through narrative*: every status change must be accompanied by a remark, creating an auditable timeline that links what happened to who did it and why. A bare status toggle is never acceptable — `addTaskRemarkAction` calls `updateTaskStatusAction` internally, enforcing the coupling at the action layer. All three categories share a single `tasks` table, distinguished by the `task_category` column, and a single `task_remarks` table for their comment/audit thread.

---

## 2. Database Schema

### `tasks`

| Column | Type | Nullable | Default | Constraints | FK |
|---|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PRIMARY KEY | — |
| `assigned_to` | uuid | NOT NULL | — | REFERENCES profiles(id) | profiles.id |
| `created_by` | uuid | NOT NULL | — | REFERENCES profiles(id) | profiles.id |
| `module` | text | NOT NULL | — | — | — |
| `task_type` | text | NOT NULL | — | — | — |
| `title` | text | NOT NULL | — | (backfilled '(untitled)' on existing rows) | — |
| `description` | text | NULL | — | — | — |
| `status` | text | NOT NULL | `'to_do'` | CHECK (`to_do`,`in_progress`,`in_review`,`completed`,`error`,`cancelled`) | — |
| `priority` | text | NOT NULL | `'normal'` | CHECK (`urgent`,`high`,`normal`) | — |
| `task_category` | text | NOT NULL | `'personal'` | CHECK (`personal`,`group_subtask`,`gia_followup`) | — |
| `group_id` | uuid | NULL | — | REFERENCES task_groups(id) ON DELETE CASCADE | task_groups.id |
| `due_at` | timestamptz | NULL | — | — | — |
| `completed_at` | timestamptz | NULL | — | — | — |
| `attachments` | jsonb | NOT NULL | `'[]'` | CHECK `jsonb_typeof(attachments) = 'array'` (`tasks_attachments_is_array`) | — |
| `tags` | text[] | NOT NULL | `'{}'` | — | — |
| `created_at` | timestamptz | NOT NULL | `now()` | — | — |
| `updated_at` | timestamptz | NOT NULL | `now()` | — | — |

**Indexes on `tasks`:**

| Name | Columns | Partial condition |
|---|---|---|
| `idx_tasks_assigned_to` | `(assigned_to, due_at)` | `WHERE status = 'pending'` *(legacy — pre-0017; condition does not match new status values; harmless but inert)* |
| `idx_tasks_module` | `(module)` | `WHERE status = 'pending'` *(same legacy issue)* |
| `idx_tasks_category` | `(task_category)` | `WHERE status NOT IN ('completed','cancelled')` |
| `idx_tasks_group_id` | `(group_id)` | `WHERE group_id IS NOT NULL` |
| `idx_tasks_priority` | `(priority, due_at)` | `WHERE status NOT IN ('completed','cancelled')` |
| `idx_tasks_tags_gin` | `USING GIN (tags)` | `WHERE task_category = 'personal'` |

**Triggers on `tasks`:**

| Name | Event | Function |
|---|---|---|
| `tasks_updated_at` | BEFORE UPDATE | `update_updated_at()` |
| `tasks_audit` | AFTER UPDATE FOR EACH ROW | `log_task_changes()` — logs changes to: `title`, `description`, `status`, `priority`, `due_at`, `assigned_to` only |

**RLS policies on `tasks`:**

| Policy | Command | USING / WITH CHECK |
|---|---|---|
| `tasks_agent_select` | SELECT | `get_user_role() = 'agent' AND assigned_to = auth.uid()` |
| `tasks_manager_admin_founder_select` | SELECT | `get_user_role() IN ('manager','admin','founder')` |
| `tasks_update` | UPDATE | `(get_user_role() = 'agent' AND assigned_to = auth.uid()) OR get_user_role() IN ('manager','admin','founder')` |

No INSERT or DELETE RLS policies — inserts and deletes go through `adminClient` in actions.

---

### `task_groups`

| Column | Type | Nullable | Default | Constraints | FK |
|---|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PRIMARY KEY | — |
| `title` | text | NOT NULL | — | — | — |
| `description` | text | NULL | — | — | — |
| `priority` | text | NOT NULL | `'normal'` | CHECK (`urgent`,`high`,`normal`) | — |
| `status` | text | NOT NULL | `'to_do'` | CHECK (`to_do`,`in_progress`,`in_review`,`completed`,`error`,`cancelled`) | — |
| `due_at` | timestamptz | NULL | — | — | — |
| `created_by` | uuid | NOT NULL | — | REFERENCES profiles(id) | profiles.id |
| `domain` | text | NOT NULL | — | — | — |
| `created_at` | timestamptz | NOT NULL | `now()` | — | — |
| `updated_at` | timestamptz | NOT NULL | `now()` | — | — |

**Indexes on `task_groups`:**

| Name | Columns | Partial condition |
|---|---|---|
| `idx_task_groups_domain` | `(domain)` | `WHERE status NOT IN ('completed','cancelled')` |
| `idx_task_groups_created_by` | `(created_by)` | — |

**Triggers on `task_groups`:**

| Name | Event | Function |
|---|---|---|
| `task_groups_updated_at` | BEFORE UPDATE | `update_updated_at()` |

**RLS policies on `task_groups`** (as amended by migration 0018):

| Policy | Command | USING / WITH CHECK |
|---|---|---|
| `task_groups_select` | SELECT | `created_by = auth.uid() OR get_user_role() IN ('admin','founder') OR (get_user_role() = 'manager' AND get_user_domain()::text = domain)` |
| `task_groups_insert` | INSERT | WITH CHECK: `auth.uid() IS NOT NULL` |
| `task_groups_update` | UPDATE | same as SELECT (both USING and WITH CHECK) |
| `task_groups_delete` | DELETE | `get_user_role() IN ('admin','founder')` |

Realtime: **not enabled** on `task_groups`.

---

### `task_remarks`

Replaces `task_messages` (dropped in migration 0022, pre-production, no data loss).

| Column | Type | Nullable | Default | Constraints | FK |
|---|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PRIMARY KEY | — |
| `task_id` | uuid | NOT NULL | — | REFERENCES tasks(id) ON DELETE CASCADE | tasks.id |
| `author_id` | uuid | NOT NULL | — | REFERENCES profiles(id) | profiles.id |
| `content` | text | NOT NULL | — | `sanitizeText()` applied at action layer | — |
| `status_change` | text | NULL | — | CHECK (`to_do`,`in_progress`,`in_review`,`completed`,`error`,`cancelled`) — coupled to `tasks.status` CHECK | — |
| `is_suppressed` | boolean | NOT NULL | `false` | — | — |
| `suppressed_by` | uuid | NULL | — | REFERENCES profiles(id) ON DELETE SET NULL | profiles.id |
| `suppressed_at` | timestamptz | NULL | — | — | — |
| `created_at` | timestamptz | NOT NULL | `now()` | — | — |

**Indexes on `task_remarks`:**

| Name | Columns | Notes |
|---|---|---|
| `idx_task_remarks_task_id` | `(task_id, created_at ASC)` | ASC because timeline reads oldest-first |

**Realtime:** enabled (`ALTER PUBLICATION supabase_realtime ADD TABLE task_remarks`).

**RLS policies on `task_remarks`:**

| Policy | Command | USING / WITH CHECK |
|---|---|---|
| `task_remarks_select` | SELECT | EXISTS on tasks where `assigned_to = auth.uid() OR created_by = auth.uid() OR get_user_role() IN ('manager','admin','founder')` |
| `task_remarks_insert` | INSERT | same EXISTS check + `auth.uid() IS NOT NULL` |
| `task_remarks_suppression_update` | UPDATE | `get_user_role() IN ('admin','founder')` (both USING and WITH CHECK) |

**No DELETE policy — ever.** Append-only with suppression soft-delete pattern.

**Column restriction note:** The UPDATE RLS policy does not restrict which columns may change — PostgreSQL RLS has no column-level write restriction. Column scope (only `is_suppressed`, `suppressed_by`, `suppressed_at`) is enforced exclusively at the action layer in `suppressTaskRemarkAction`.

---

### `task_audit_log`

Append-only. Populated by the `log_task_changes()` trigger only.

| Column | Type | Nullable | Default | Constraints | FK |
|---|---|---|---|---|---|
| `id` | uuid | NOT NULL | `gen_random_uuid()` | PRIMARY KEY | — |
| `task_id` | uuid | NOT NULL | — | REFERENCES tasks(id) ON DELETE CASCADE | tasks.id |
| `changed_by` | uuid | NOT NULL | — | REFERENCES profiles(id) | profiles.id |
| `field_name` | text | NOT NULL | — | — | — |
| `old_value` | text | NULL | — | — | — |
| `new_value` | text | NULL | — | — | — |
| `changed_at` | timestamptz | NOT NULL | `now()` | — | — |

**ON DELETE CASCADE note:** deleting a task removes its audit log. Task deletion is restricted to admin/founder at the application layer.

**Indexes:**

| Name | Columns |
|---|---|
| `idx_task_audit_log_task_id` | `(task_id, changed_at DESC)` |

**RLS policies:**

| Policy | Command | USING |
|---|---|---|
| `task_audit_log_select` | SELECT | `get_user_role() IN ('manager','admin','founder')` |

No INSERT, UPDATE, or DELETE policies. Written by trigger only.

---

### `task_gia_meta`

Extension table for Gia follow-up tasks. One row per Gia task.

| Column | Type | Nullable | Default | Constraints | FK |
|---|---|---|---|---|---|
| `task_id` | uuid | NOT NULL | — | PRIMARY KEY, REFERENCES tasks(id) ON DELETE CASCADE | tasks.id |
| `lead_id` | uuid | NOT NULL | — | REFERENCES leads(id) | leads.id |
| `call_outcome` | text | NULL | — | populated when `task_type='call'` and task is completed | — |

**Indexes:**

| Name | Columns |
|---|---|
| `idx_task_gia_meta_lead_id` | `(lead_id)` |

**RLS policies:**

| Policy | Command | USING |
|---|---|---|
| `task_gia_meta_select` | SELECT | EXISTS on tasks where `(get_user_role() = 'agent' AND t.assigned_to = auth.uid()) OR get_user_role() IN ('manager','admin','founder')` |

---

### `notifications` — task-relevant columns and types

Full table in migration 0016. Task-relevant:

| Column | Type | Notes |
|---|---|---|
| `type` | text | CHECK includes `task_due` (migration 0016) and `task_assigned` (migration 0017) |
| `action_url` | text | CHECK: `action_url IS NULL OR action_url NOT LIKE 'http%'` — relative paths only |

Task notification types: `task_due`, `task_assigned`.

---

## 3. Type System

All types defined in `src/lib/types/database.ts` unless noted.

### `TaskStatus`
```typescript
'to_do' | 'in_progress' | 'in_review' | 'completed' | 'error' | 'cancelled'
```
Old values `pending` and `done` no longer exist. Any reference to them fails at the DB constraint.

### `TaskPriority`
```typescript
'urgent' | 'high' | 'normal'
```

### `TaskCategory`
```typescript
'personal' | 'group_subtask' | 'gia_followup'
```

### `TaskModule`
```typescript
'gia' | 'concierge' | 'finance' | 'marketing' | 'tech'
```

### `TaskType`
```typescript
'call' | 'whatsapp_message' | 'email' | 'general_follow_up'
```

### `ChecklistItem`
```typescript
type ChecklistItem = {
  id:      string;
  text:    string;
  checked: boolean;
};
```
Defined in `src/lib/types/database.ts`. Shape validation beyond array-type is at the application layer only.

### `Task`
```typescript
type Task = {
  id:            string;
  assigned_to:   string;
  created_by:    string;
  module:        TaskModule;
  task_type:     TaskType;
  title:         string;
  description:   string | null;
  status:        TaskStatus;
  priority:      TaskPriority;
  task_category: TaskCategory;
  group_id:      string | null;
  due_at:        string | null;
  completed_at:  string | null;
  attachments:   ChecklistItem[];
  tags:          string[];
  created_at:    string;
  updated_at:    string;
};
```

### `TaskGroup`
```typescript
type TaskGroup = {
  id:          string;
  title:       string;
  description: string | null;
  priority:    TaskPriority;
  status:      TaskStatus;
  due_at:      string | null;
  created_by:  string;
  domain:      string;
  created_at:  string;
  updated_at:  string;
};
```

### `TaskRemark`
```typescript
type TaskRemark = {
  id:            string;
  task_id:       string;
  author_id:     string;
  content:       string;
  status_change: TaskStatus | null;
  is_suppressed: boolean;
  suppressed_by: string | null;
  suppressed_at: string | null;
  created_at:    string;
};
```

### `TaskAuditLog`
```typescript
type TaskAuditLog = {
  id:         string;
  task_id:    string;
  changed_by: string;
  field_name: string;
  old_value:  string | null;
  new_value:  string | null;
  changed_at: string;
};
```

### `TaskGiaMeta`
```typescript
type TaskGiaMeta = {
  task_id:      string;
  lead_id:      string;
  call_outcome: CallOutcome | null;
};
```

### `NotificationType` — task-relevant values
```typescript
'task_due' | 'task_assigned'
```
(Full type: `'lead_assigned' | 'lead_won' | 'task_due' | 'task_assigned' | 'mention' | 'system'`)

### Composite types — defined in `src/lib/services/tasks-service.ts`

#### `PersonalTaskCursor`
```typescript
type PersonalTaskCursor = {
  due_at: string | null;
  id:     string;
};
```
Composite cursor for keyset pagination over `(due_at ASC NULLS LAST, id ASC)`. Required because `due_at` is nullable — a single-column cursor silently drops all `due_at IS NULL` rows on pages after the first.

#### `PersonalTaskFilters`
```typescript
type PersonalTaskFilters = {
  status?:     TaskStatus[];
  priority?:   TaskPriority[];
  tags?:       string[];        // task must contain ALL specified tags
  due_before?: string;          // ISO datetime string
  cursor?:     PersonalTaskCursor | null;
  limit?:      number;          // capped at 500
};
```

#### `PersonalTasksResult`
```typescript
type PersonalTasksResult = {
  tasks:      Task[];
  hasMore:    boolean;
  nextCursor: PersonalTaskCursor | null;
};
```

#### `GroupTaskFilters`
```typescript
type GroupTaskFilters = {
  status?:   TaskStatus[];
  priority?: TaskPriority[];
};
```

#### `AssigneeSlim`
```typescript
type AssigneeSlim = Pick<Profile, 'id' | 'full_name' | 'avatar_url'>;
```

#### `TaskGroupRow`
```typescript
type TaskGroupRow = TaskGroup & {
  subtask_count:     number;
  completed_count:   number;
  assignee_previews: AssigneeSlim[];  // max 4
};
```

#### `SubtaskWithAssignee`
```typescript
type SubtaskWithAssignee = Task & {
  assignee: AssigneeSlim | null;
};
```

#### `TaskRemarkWithAuthor`
```typescript
type TaskRemarkWithAuthor = TaskRemark & {
  author: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null;
};
```
Also re-exported from `src/components/tasks/TaskRemarksPanel.tsx` for component-local use.

#### `TaskWithMessages`
```typescript
type TaskWithMessages = Task & {
  messages: TaskRemarkWithAuthor[];
};
```

#### `GroupTaskSummaryRaw`
Internal type (not exported). Raw shape returned by the `get_group_task_summaries` RPC:
```typescript
type GroupTaskSummaryRaw = {
  id:                string;
  title:             string;
  description:       string | null;
  priority:          string;
  status:            string;
  due_at:            string | null;
  created_by:        string;
  domain:            string;
  created_at:        string;
  updated_at:        string;
  subtask_total:     number;     // bigint cast to number by Postgres JSON serialisation
  subtask_completed: number;
  assignee_ids:      string[] | null;
};
```

---

## 4. Constants

All defined in `src/lib/constants/task-constants.ts`.

### `TASK_PRIORITY`
```typescript
Record<TaskPriority, { label: string; color: string; order: number }>
```
| Key | label | color | order |
|---|---|---|---|
| `urgent` | Urgent | `var(--color-danger)` | 1 |
| `high` | High | `var(--theme-warning)` | 2 |
| `normal` | Normal | `var(--theme-text-tertiary)` | 3 |

### `TASK_STATUS`
```typescript
Record<TaskStatus, { label: string; color: string; order: number }>
```
| Key | label | color | order |
|---|---|---|---|
| `to_do` | To Do | `var(--theme-text-secondary)` | 1 |
| `in_progress` | In Progress | `var(--theme-accent)` | 2 |
| `in_review` | In Review | `var(--theme-warning)` | 3 |
| `completed` | Completed | `var(--color-success)` | 4 |
| `error` | Error | `var(--color-danger)` | 5 |
| `cancelled` | Cancelled | `var(--theme-text-tertiary)` | 6 |

### `TASK_CATEGORY`
```typescript
Record<TaskCategory, { label: string; color: string }>
```
| Key | label | color |
|---|---|---|
| `personal` | Personal | `var(--theme-accent)` |
| `group_subtask` | Group Task | `var(--theme-text-primary)` |
| `gia_followup` | Gia Follow-up | `var(--color-info)` |

### `TASK_REMARK_STATUS_LABELS`
```typescript
Record<TaskStatus, string>
```
Past-tense labels shown in the timeline when a remark carried a status change:
| Key | Label |
|---|---|
| `to_do` | moved to To Do |
| `in_progress` | started work |
| `in_review` | sent for review |
| `completed` | marked complete |
| `error` | flagged an error |
| `cancelled` | cancelled this task |

### `GROUP_TASK_ACCENT_COLORS`
```typescript
{ id: string; hex: string; label: string }[]
```
10 entries. IDs are stable DB keys (no DB column exists yet — see Section 16):
`slate-blue`, `terracotta`, `sage-green`, `warm-gold`, `dusty-rose`, `deep-teal`, `muted-plum`, `sand`, `burnt-orange`, `charcoal`.

Hex values: `#5c7a9e`, `#c4714a`, `#6b9e7a`, `#c49a3a`, `#b87a8a`, `#3a8a8a`, `#7a5a9a`, `#b8a07a`, `#c46a30`, `#5a5a6a`.

### `GROUP_TASK_ICONS`
```typescript
{ id: string; label: string }[]
```
25 entries. `id` is the exact Lucide component name (no DB column exists yet — see Section 16):
`Briefcase`, `Target`, `Zap`, `Star`, `Flag`, `Bell`, `Bookmark`, `Calendar`, `CheckSquare`, `Clock`, `FileText`, `Folder`, `Globe`, `Hash`, `Heart`, `Layers`, `Layout`, `List`, `MessageSquare`, `Package`, `Search`, `Settings`, `Shield`, `TrendingUp`, `Users`.

---

## 5. Validation Schemas

All defined in `src/lib/validations/task-schemas.ts`. All schemas use `zod`.

### `CreatePersonalTaskSchema`
Used by: `createPersonalTaskAction`
| Field | Type | Constraints |
|---|---|---|
| `title` | string | min 1, max 255, `.transform(sanitizeText)` |
| `description` | string (optional) | transformed to `null` if empty, `sanitizeText` applied |
| `priority` | `'urgent'|'high'|'normal'` | default `'normal'` |
| `due_at` | string (optional, nullable) | ISO datetime with offset |
| `assigned_to` | uuid string (optional) | — |
| `tags` | string[] | max 10, each min 1 max 50, `.transform(sanitizeText)`, default `[]` |

### `UpdateTaskTagsSchema`
Used by: `updateTaskTagsAction`
| Field | Type | Constraints |
|---|---|---|
| `taskId` | uuid string | — |
| `tags` | string[] | max 10, each min 1 max 50, `.transform(sanitizeText)` |

### `CreateGroupTaskSchema`
Used by: `createGroupTaskAction`
| Field | Type | Constraints |
|---|---|---|
| `title` | string | min 1, max 255, `.transform(sanitizeText)` |
| `description` | string (optional) | nullable, `sanitizeText` |
| `priority` | `'urgent'|'high'|'normal'` | default `'normal'` |
| `due_at` | string (optional, nullable) | ISO datetime with offset |
| `domain` | string | min 1 |

### `CreateSubtaskSchema`
Used by: `createSubtaskAction`
| Field | Type | Constraints |
|---|---|---|
| `group_id` | uuid string | — |
| `title` | string | min 1, max 255, `.transform(sanitizeText)` |
| `description` | string (optional) | nullable, `sanitizeText` |
| `priority` | `'urgent'|'high'|'normal'` | default `'normal'` |
| `due_at` | string (optional, nullable) | ISO datetime with offset |
| `assigned_to` | uuid string | required |

### `UpdateTaskSchema`
Used by: `updateTaskAction`
| Field | Type | Constraints |
|---|---|---|
| `taskId` | uuid string | — |
| `title` | string (optional) | min 1, max 255, `sanitizeText` |
| `description` | string (optional) | nullable, `sanitizeText` |
| `priority` | `'urgent'|'high'|'normal'` (optional) | — |
| `status` | `TaskStatus` (optional) | — |
| `due_at` | string (optional, nullable) | ISO datetime with offset |
| `assigned_to` | uuid string (optional) | — |

### `UpdateTaskStatusSchema`
Used by: `updateTaskStatusAction`
| Field | Type | Constraints |
|---|---|---|
| `taskId` | uuid string | — |
| `status` | `TaskStatus` | — |

### `AddTaskRemarkSchema`
Used by: `addTaskRemarkAction`
| Field | Type | Constraints |
|---|---|---|
| `taskId` | uuid string | — |
| `content` | string | min 1, max 2000, `.transform(sanitizeText)` |
| `statusChange` | `TaskStatus` (optional) | — |

### `DeleteTaskSchema`
Used by: `deleteTaskAction`
| Field | Type | Constraints |
|---|---|---|
| `taskId` | uuid string | — |

### `SuppressTaskRemarkSchema`
Used by: `suppressTaskRemarkAction`
| Field | Type | Constraints |
|---|---|---|
| `messageId` | uuid string | — |

### `UpdateChecklistSchema`
Used by: `updateChecklistAction`
| Field | Type | Constraints |
|---|---|---|
| `taskId` | uuid string | — |
| `items` | `{ id: string (min 1), text: string (min 1, max 500), checked: boolean }[]` | — |

---

## 6. Service Layer

All in `src/lib/services/tasks-service.ts`. Uses the **server Supabase client** (`createClient()` from `src/lib/supabase/server`) exclusively. Never the admin client.

### `PERSONAL_TASKS_PAGE_SIZE`
Constant: `50`. Exported. Used as default page size for keyset pagination.

---

### `getPersonalTasks(userId, filters?)`
**Signature:** `(userId: string, filters: PersonalTaskFilters = {}) => Promise<PersonalTasksResult>`

**Query:** `tasks` table, `task_category = 'personal'`, `assigned_to = userId`. Conditionally applies:
- `.in('status', filters.status)` if provided
- `.in('priority', filters.priority)` if provided
- `.contains('tags', filters.tags)` (array containment `@>` operator) if provided
- `.lte('due_at', filters.due_before)` if provided
- Composite cursor `.or(...)` — 4-case expression covering `due_at NOT NULL` and `due_at IS NULL` cursor scenarios

**Sort:** `.order('due_at', { ascending: true, nullsFirst: false })` then `.order('id', { ascending: true })` as tiebreaker.

**Limit:** `pageSize + 1` where `pageSize = Math.min(filters.limit ?? 50, 500)`. Returns `hasMore = rows.length > pageSize`.

**Post-fetch client-side sort:** secondary sort by `priority` order (`urgent=1, high=2, normal=3`) applied in JavaScript after the DB query. This overrides DB row order within the page.

**Return:** `PersonalTasksResult` — `{ tasks, hasMore, nextCursor }`. On error: logs to `console.error`, returns `{ tasks: [], hasMore: false, nextCursor: null }`.

**Called by:** `getPersonalTasksAction` (action wrapper), `tasks/page.tsx` (server component).

---

### `getGroupTasks(filters?)`
**Signature:** `(filters: GroupTaskFilters = {}) => Promise<TaskGroupRow[]>`

**Query:** 2 DB round-trips total.
1. RPC `get_group_task_summaries` with `p_status` and `p_priority` params (null when not provided). Returns `GroupTaskSummaryRaw[]` with pre-aggregated `subtask_total`, `subtask_completed`, `assignee_ids[]`. Domain scoping is enforced inside the RPC via `get_user_domain()` — caller never passes domain.
2. Batch profile fetch: `profiles.select('id, full_name, avatar_url').in('id', allAssigneeIds)` — one query for all unique assignee IDs across all groups.

**Slicing:** `assignee_ids.slice(0, 4)` in service layer — max 4 previews per group.

**Bigint cast:** `Number(r.subtask_total)` and `Number(r.subtask_completed)` per Q-09.

**Return:** `TaskGroupRow[]`. On error: logs `console.error` (TD-002), returns `[]`.

**Called by:** `tasks/page.tsx` (server component).

---

### `getGroupSubtasks(groupId)`
**Signature:** `(groupId: string) => Promise<SubtaskWithAssignee[]>`

**Query:** `tasks` where `group_id = groupId AND task_category = 'group_subtask'`, ordered by `due_at ASC NULLS LAST`. Then batch profile fetch for all unique `assigned_to` IDs.

**Return:** `SubtaskWithAssignee[]`. On error: logs, returns `[]`.

**Called by:** `getGroupSubtasksAction`, `tasks/[id]/page.tsx`.

---

### `getTaskById(taskId)`
**Signature:** `(taskId: string) => Promise<TaskWithMessages | null>`

**Query:** single `tasks` row by id, then calls `getTaskRemarks(taskId)` internally.

**Return:** `TaskWithMessages | null`.

**Called by:** not currently used by any page directly; available for future task detail views.

---

### `getTaskRemarks(taskId)`
**Signature:** `(taskId: string) => Promise<TaskRemarkWithAuthor[]>`

**Query:** `task_remarks` where `task_id = taskId`, ordered `created_at ASC` (oldest first). Batch resolves author profiles in one query — no N+1.

**Return:** `TaskRemarkWithAuthor[]`. On error: logs, returns `[]`.

**Called by:** `getTaskById`, and indirectly by `tasks/[id]/page.tsx` via `getTaskById`.

---

### `getTaskGroupById(groupId)`
**Signature:** `(groupId: string) => Promise<TaskGroup | null>`

**Query:** single `task_groups` row by id. RLS enforces domain-scoped access — a manager from a different domain receives null.

**Return:** `TaskGroup | null`.

**Called by:** `getTaskGroupByIdAction`, `tasks/[id]/page.tsx`.

---

### `getPersonalTaskTags(userId)`
**Signature:** `(userId: string) => Promise<string[]>`

**Query:** `tasks.select('tags').eq('task_category','personal').eq('assigned_to', userId)`. Collects all tags across rows into a `Set`, returns sorted deduplicated array.

**Return:** `string[]`.

**Called by:** `getPersonalTaskTagsAction`.

---

## 7. Action Layer

All in `src/lib/actions/tasks.ts`. All use `'use server'` directive.

**Pattern invariants:**
- Zod validation is always step 1 (Rule S-01).
- `getCurrentProfile()` is always step 2.
- `createAdminClient()` is used for all INSERT/UPDATE/DELETE writes (bypasses RLS — application-layer auth checks provide the security equivalent).
- Server client is used for read-before-write (RLS layer 1).
- `canMutateTask()` is called for all mutations after the server-client read (application layer 2 — A-09).
- All actions return `ActionResult<T>` — `{ data, error }`. Never throw. Never void.

### `canMutateTask(caller, task)` (internal helper)
Not exported. Authorization rules:
- `admin` or `founder`: always allowed.
- Any role: allowed if `task.assigned_to === caller.id` OR `task.created_by === caller.id`.
- `manager`: additionally allowed if `task.group_id` exists and the parent `task_groups.domain === caller.domain` (one extra DB read via server client).

---

### `createPersonalTaskAction(input)`
**Input:** `unknown` → `CreatePersonalTaskSchema`
**Auth:** any authenticated user. Assigning to another user requires `manager+` role.
**Flow:**
1. Zod parse
2. `getCurrentProfile()`
3. If `assigned_to ≠ caller.id`, verify `manager+`
4. `adminClient.from('tasks').insert(...)` with `task_category: 'personal'`, `module: 'gia'`, `task_type: 'general_follow_up'`
5. If `assigned_to ≠ caller.id`: `createNotification({ type: 'task_assigned', ... })` fire-and-forget
6. If `due_at` set: `scheduleTaskReminder(taskId, dueAt, assignedTo)` fire-and-forget
**Return:** `ActionResult<{ taskId: string }>`
**Notifications:** `task_assigned` to assignee when different from caller.

---

### `createGroupTaskAction(input)`
**Input:** `unknown` → `CreateGroupTaskSchema`
**Auth:** `manager`, `admin`, `founder` only.
**Flow:**
1. Zod parse
2. `getCurrentProfile()` — reject if `agent` or `guest`
3. Domain enforcement: `manager` locked to `caller.domain`; admin/founder use `fields.domain`
4. `adminClient.from('task_groups').insert(...)`
**Return:** `ActionResult<{ groupId: string }>`
**Notifications:** none.
**Trigger.dev:** none.

---

### `createSubtaskAction(input)`
**Input:** `unknown` → `CreateSubtaskSchema`
**Auth:** any authenticated non-guest user. Agent must be in the same domain as the group.
**Flow:**
1. Zod parse
2. `getCurrentProfile()`
3. Server client: fetch `task_groups` row to verify group exists and get domain
4. If `caller.role === 'agent'` and `group.domain !== caller.domain`: reject
5. `adminClient.from('tasks').insert(...)` with `task_category: 'group_subtask'`
6. If `assigned_to ≠ caller.id`: `createNotification({ type: 'task_assigned', ... })` fire-and-forget
7. If `due_at` set: `scheduleTaskReminder(taskId, dueAt, assignedTo)` fire-and-forget
**Return:** `ActionResult<{ taskId: string }>`
**Notifications:** `task_assigned` to assignee when different from caller (always notifies for subtasks — comment in code says "always notify").

---

### `updateTaskStatusAction(input)`
**Input:** `unknown` → `UpdateTaskStatusSchema`
**Auth:** via `canMutateTask`.
**Flow:**
1. Zod parse
2. `getCurrentProfile()`
3. Server client: fetch task (`id, assigned_to, created_by, group_id, status, due_at`)
4. `canMutateTask` check
5. No-op if `task.status === status`
6. `adminClient.from('tasks').update({ status, completed_at? })` — sets `completed_at` when `status === 'completed'`
7. If status is in `TERMINAL_STATUSES` (`completed`, `cancelled`, `error`): `cancelTaskReminder(taskId)` fire-and-forget
**Return:** `ActionResult<{ taskId: string }>`

---

### `updateTaskAction(input)`
**Input:** `unknown` → `UpdateTaskSchema`
**Auth:** via `canMutateTask`.
**Flow:**
1. Zod parse
2. `getCurrentProfile()`
3. Server client: fetch task (`id, assigned_to, created_by, group_id, due_at, status`)
4. `canMutateTask` check
5. Build typed `updatePayload` — only include defined fields; set `completed_at` if `status === 'completed'`
6. `adminClient.from('tasks').update(updatePayload)`
7. If `due_at` changed: `cancelTaskReminder(taskId)` (awaited, not fire-and-forget), then `scheduleTaskReminder(taskId, newDueAt, assignedTo)` fire-and-forget
8. If status moved to terminal and `due_at` did NOT change: `cancelTaskReminder(taskId)` fire-and-forget (safety net)
**Return:** `ActionResult<{ taskId: string }>`

---

### `deleteTaskAction(input)`
**Input:** `unknown` → `DeleteTaskSchema`
**Auth:** Agent: must be both `created_by` AND `assigned_to`. Manager/admin/founder: unrestricted.
**Flow:**
1. Zod parse
2. `getCurrentProfile()`
3. Server client: fetch task (`id, assigned_to, created_by`)
4. Authorization check (stricter than `canMutateTask` for agents — both ownership fields required)
5. `await cancelTaskReminder(taskId)` — **blocking, not fire-and-forget**. If this throws, abort — delete does not proceed.
6. `adminClient.from('tasks').delete().eq('id', taskId)` — cascade removes `task_remarks` (ON DELETE CASCADE)
**Return:** `ActionResult<null>`

---

### `updateChecklistAction(input)`
**Input:** `unknown` → `UpdateChecklistSchema`
**Auth:** via `canMutateTask`.
**Flow:**
1. Zod parse
2. `getCurrentProfile()`
3. Server client: fetch task (`id, assigned_to, created_by, group_id`)
4. `canMutateTask` check
5. `adminClient.from('tasks').update({ attachments: items })`
**Return:** `ActionResult<ChecklistItem[]>`
**Note:** Intentionally excluded from `log_task_changes` trigger — checklist toggles must not flood `task_audit_log`.

---

### `updateTaskTagsAction(input)`
**Input:** `unknown` → `UpdateTaskTagsSchema`
**Auth:** via `canMutateTask`.
**Flow:**
1. Zod parse
2. `getCurrentProfile()`
3. Server client: fetch task
4. `canMutateTask` check
5. `adminClient.from('tasks').update({ tags })`
**Return:** `ActionResult<{ taskId: string }>`

---

### `addTaskRemarkAction(input)`
**Input:** `unknown` → `AddTaskRemarkSchema`
**Auth:** `assigned_to`, `created_by`, or `manager+`. NOT via `canMutateTask` — separate access check.
**Flow:**
1. Zod parse — `content` sanitized by schema transform; re-sanitized explicitly with `sanitizeText()` (Rule S-06)
2. `getCurrentProfile()`
3. Server client: fetch task (`id, assigned_to, created_by, group_id`)
4. Access check: `assigned_to === caller.id OR created_by === caller.id OR role in manager+`
5. If `statusChange` provided: `await updateTaskStatusAction({ taskId, status: statusChange })` — if this fails, abort (no remark insert)
6. `adminClient.from('task_remarks').insert({ task_id, author_id: caller.id, content: sanitizedContent, status_change: statusChange ?? null })`
**Return:** `ActionResult<TaskRemark>` — full remark row.
**Critical invariant:** `updateTaskStatusAction` does NOT insert a remark. No circular dependency.

---

### `suppressTaskRemarkAction(input)`
**Input:** `unknown` → `SuppressTaskRemarkSchema`
**Auth:** `admin` or `founder` only.
**Flow:**
1. Zod parse
2. `getCurrentProfile()` — reject if not `admin` or `founder`
3. `adminClient.from('task_remarks').select('id, is_suppressed')` — verify remark exists
4. Idempotent: if `is_suppressed` already true, return `{ data: { remarkId }, error: null }` without DB write
5. `adminClient.from('task_remarks').update({ is_suppressed: true, suppressed_by: caller.id, suppressed_at: now() })`
**Column restriction:** only the three suppression columns are written. The RLS UPDATE policy does not enforce this — the action does.
**Return:** `ActionResult<{ remarkId: string }>`

---

### Read action wrappers

These thin wrappers exist so client components never import from server-only service modules.

| Action | Calls | Returns |
|---|---|---|
| `getGroupSubtasksAction(groupId)` | `getGroupSubtasks(groupId)` | `ActionResult<SubtaskWithAssignee[]>` |
| `getPersonalTasksAction(filters?)` | `getPersonalTasks(caller.id, filters)` | `ActionResult<PersonalTasksResult>` |
| `getPersonalTaskTagsAction()` | `getPersonalTaskTags(caller.id)` | `ActionResult<string[]>` |
| `getTaskGroupByIdAction(groupId)` | `getTaskGroupById(groupId)` | `ActionResult<TaskGroup>` |

All derive `caller.id` from `getCurrentProfile()` — never accept userId from client.

---

## 8. Trigger.dev Integration

File: `src/trigger/task-reminders.ts`

### `sendTaskReminderTask`
Exported Trigger.dev task. ID: `'send-task-reminder'`. Retry: `maxAttempts: 3`.

**Payload:** `{ taskId: string; assignedTo: string }`

**Run:** dynamically imports `createNotification` from `src/lib/services/notifications-service.ts` (dynamic import avoids SSR module-level import). Calls:
```
createNotification({
  recipient_id: payload.assignedTo,
  type:         'task_due',
  title:        'Task due soon',
  body:         'A task assigned to you is due in 30 minutes.',
  action_url:   '/tasks',
})
```
Notification failure is non-fatal (`.catch` with `console.error`).

---

### `scheduleTaskReminder(taskId, dueAt, assignedTo)`
**Signature:** `(taskId: string, dueAt: Date, assignedTo: string) => Promise<void>`

**Past-date guard:** `reminderAt = dueAt - 30min`. If `reminderAt <= now()`, returns immediately — never errors on past dates.

**Trigger.dev call:**
```
tasks.trigger(
  'send-task-reminder',
  { taskId, assignedTo },
  {
    delay:          reminderAt,
    idempotencyKey: `task-reminder-${taskId}`,
    tags:           [`task-reminder-${taskId}`],
  }
)
```

**Idempotency key guarantee (race window analysis):** `task-reminder-${taskId}` is the idempotency key. Trigger.dev v3 deduplicates by idempotency key for all non-terminal run states, including `DELAYED`. If two concurrent `updateTaskAction` calls race, the second `scheduleTaskReminder` call returns the existing run handle (`isCached: true`) — no duplicate run is created. The first call's `cancelTaskReminder` correctly cancels the single DELAYED run. No orphaned run exists.

Evidence: SDK `@trigger.dev/core v4.4.6` — `apiClient.triggerTask()` returns `{ id, isCached?: boolean }` where `isCached: true` means an existing run was returned. Source: `dist/esm/v3/apiClient/index.d.ts` line 55.

**No DB storage of run IDs required.** Tag-based cancel is safe because idempotency prevents two simultaneous DELAYED runs for the same task.

---

### `cancelTaskReminder(taskId)`
**Signature:** `(taskId: string) => Promise<void>`

**Flow:**
1. `runs.list({ tag: 'task-reminder-${taskId}', status: ['DELAYED', 'QUEUED'] })`
2. If `runIds.length === 0`: return (no-op — already cancelled or never scheduled)
3. `Promise.allSettled(runIds.map((id) => runs.cancel(id)))` — cancel all matching runs, idempotent

---

### When called from actions

| Action | scheduleTaskReminder | cancelTaskReminder |
|---|---|---|
| `createPersonalTaskAction` | fire-and-forget if `due_at` set | — |
| `createSubtaskAction` | fire-and-forget if `due_at` set | — |
| `updateTaskStatusAction` | — | fire-and-forget when status → terminal |
| `updateTaskAction` | fire-and-forget if `due_at` changed and new date is future | awaited before new schedule when `due_at` changed |
| `deleteTaskAction` | — | **awaited and blocking** — if throws, delete aborts |

---

## 9. Notification Integration

### Which actions fire notifications

| Action | Type | Recipient | Condition |
|---|---|---|---|
| `createPersonalTaskAction` | `task_assigned` | `assigned_to` | When `assigned_to ≠ caller.id` |
| `createSubtaskAction` | `task_assigned` | `assigned_to` | When `assigned_to ≠ caller.id` |
| `sendTaskReminderTask` (Trigger.dev) | `task_due` | `assigned_to` | Always — fires 30 min before `due_at` |

All `createNotification()` calls from actions are **fire-and-forget** (`createNotification(...).catch(() => {})`). A notification failure never fails the task action.

### `createNotification()` call pattern
From `src/lib/services/notifications-service.ts`:
```typescript
createNotification({
  recipient_id: string,
  type:         NotificationType,
  title:        string,
  body?:        string,
  action_url?:  string,   // relative path only
})
```
Uses `adminClient` for INSERT — RLS blocks direct inserts for all other clients. Called from server actions only, never from components.

### How task notifications render in `NotificationItem.tsx`

| Type | Icon | Navigation |
|---|---|---|
| `task_assigned` | `CheckSquare` (lucide) | `action_url` → `/tasks` |
| `task_due` | `Clock` (lucide) | `action_url` → `/tasks` |

Both types navigate to `/tasks` (the tasks page root). `action_url` is validated before `router.push`: must start with `/` and not start with `//`.

The `getTypeIcon` switch in `NotificationItem` uses `assertNever(type)` — if a new `NotificationType` is added to `database.ts` without a matching case, TypeScript errors at build time.

### Reminder timing
Trigger.dev fires `sendTaskReminderTask` exactly 30 minutes before `due_at`. If `due_at - 30min < now()` at scheduling time, the reminder is silently skipped.

---

## 10. Page Routes

### `/tasks` — `src/app/(dashboard)/tasks/page.tsx`

**Component type:** Server Component (async).

**Auth guard:**
- No profile → `redirect('/login')`
- `role === 'guest'` → `redirect('/dashboard')`

**What it fetches:**
- Reads `searchParams.tab` — defaults to `'personal'`
- **Only the active tab's data is fetched.** Inactive tab receives a zero-value sentinel:
  - `tab === 'group'`: calls `getGroupTasks()` (from `tasks-service`). Personal receives `{ tasks: [], hasMore: false, nextCursor: null }`.
  - `tab === 'personal'` (default): calls `getPersonalTasks(profile.id)` (from `tasks-service`). Group receives `[]`.
- Both calls via `Promise.all` — parallel even when one resolves a pre-built sentinel.

**What it passes to `TasksShell`:**
- `initialTab: 'personal' | 'group'`
- `personalResult: PersonalTasksResult`
- `groupRows: TaskGroupRow[]`
- `currentUserId: profile.id`
- `currentUserName: profile.full_name`
- `callerRole: profile.role`
- `callerDomain: profile.domain`

**URL params used:** `?tab=personal|group`

---

### `/tasks` shell — `src/app/(dashboard)/tasks/TasksShell.tsx`

**Component type:** Client (`'use client'`).

**Tab structure:** Two tabs: "My Tasks" (`personal`) and "Group Tasks" (`group`).

**URL param persistence:** `useSearchParams` + `useTransition` + `router.push`. Tab changes push `?tab=...` to URL. Browser back/forward works.

**Create button:** Renders `+ My Task` or `+ Group Task` depending on active tab. Agents do not see `+ Group Task`. Button increments `createTrigger` counter — each tab component watches this via `useEffect` to open its own create modal.

**Tab rendering:** Only the active tab's component mounts (`activeTab === 'personal' ? <PersonalTasksTab> : <GroupTasksTab>`). The inactive component is not in the DOM.

---

### `/tasks/[id]` — `src/app/(dashboard)/tasks/[id]/page.tsx`

**Component type:** Server Component (async).

**Auth guard:**
- No profile → `redirect('/login')`
- `role === 'guest'` → `redirect('/dashboard')`
- Null group (RLS blocks access or not found) → `redirect('/tasks?tab=group')` — no 404 surfaced.

**What it fetches (parallel via `Promise.all`):**
1. `getTaskGroupById(id)` — from `tasks-service`
2. `getGroupSubtasks(id)` — from `tasks-service`

**What it passes to `GroupTaskWorkspace`:**
- `group: TaskGroup`
- `initialSubtasks: SubtaskWithAssignee[]`
- `currentUserId: profile.id`
- `currentUserName: profile.full_name`
- `callerRole: profile.role`
- `callerDomain: profile.domain`

---

## 11. Component Map

### `PersonalTasksTab`
**File:** `src/components/tasks/PersonalTasksTab.tsx`
**Type:** Client (`'use client'`)

**Props:**
```typescript
{
  initialResult:   PersonalTasksResult;
  currentUserId:   string;
  currentUserName: string;
  callerRole:      UserRole;
  callerDomain:    AppDomain;
  createTrigger?:  number;   // increments to trigger create modal open
}
```

**What it renders:** Three active priority sections (URGENT / HIGH / NORMAL) with collapsible accordion; completed section (collapsed by default, last 20); tag filter bar (visible only when tags exist); quick-add inline row; empty state.

**Actions called:**
- `getPersonalTasksAction` (on mount — two parallel calls: active + completed)
- `getPersonalTaskTagsAction` (on mount)
- `createPersonalTaskAction` (quick-add save, modal save)
- `updateTaskStatusAction` (completion circle click — optimistic)

**Realtime channels:** none. Uses server action polling on demand.

**Modals opened:**
- `CreatePersonalTaskModal` (via `createTrigger` prop or explicit open)
- `SubTaskModal` (on row click)
- `AssigneePickerModal` (for quick-add assignee, portaled to `document.body`)

**Key UX behaviours:**
- Section collapse tracked in `useRef` (not `useState`) to prevent optimistic status updates from collapsing open sections.
- `sectionRenderKey` counter triggers re-renders only on explicit user toggle.
- Optimistic status map: `Record<string, TaskStatus>` keyed by `taskId`. On error: entry deleted + `toast.danger`.
- Quick-add: `useTransition` + `isPending` guard prevents double-submit (Problem 7 fix).
- Completion circle: own tasks get a solid clickable circle; tasks assigned to someone else get a dashed non-interactive circle.
- Tag filter is client-side — filters `activeTasks` array before sectioning by priority.
- After `createPersonalTaskModal.onCreated`: prepends task to `activeTasks` state, refreshes available tags if task had tags.

---

### `GroupTasksTab`
**File:** `src/components/tasks/GroupTasksTab.tsx`
**Type:** Client (`'use client'`)

**Props:**
```typescript
{
  initialRows:     TaskGroupRow[];
  currentUserId:   string;
  currentUserName: string;
  callerRole:      UserRole;
  callerDomain:    AppDomain;
  createTrigger?:  number;
}
```

**What it renders:** Accordion list of task groups. Each group row shows: priority left border, title, description, subtask count + progress %, due date chip, assignee avatar stack (max 4), status pill, "Open" link. Expanded group shows subtask rows + "Add subtask" inline row.

**Actions called:**
- `getGroupSubtasksAction(groupId)` — called on first accordion expand (lazy load)
- `createSubtaskAction` — from inline add subtask row
- `listAgentsForDomain` (from `leads` actions) — for assignee picker population

**Realtime channels:** none on the tab itself. (Workspace page has Realtime.)

**Modals opened:**
- `CreateGroupTaskModal` (via `createTrigger`)
- `SubTaskModal` (on subtask row click)
- `AssigneePickerModal` (for inline add subtask, portaled to `document.body`)

**Key UX behaviours:**
- Only one group expanded at a time (`expandedGroupId: string | null`).
- "Open" link is `<Link href="/tasks/${group.id}">` with `e.stopPropagation()` to prevent accordion toggle.
- Subtask data not loaded on mount — fetched on first expand.
- After `createGroupTaskModal.onCreated`: converts `TaskGroup` to `TaskGroupRow` (adds `subtask_count: 0`, `completed_count: 0`, `assignee_previews: []`) and prepends to local `rows` state.

---

### `GroupTaskWorkspace`
**File:** `src/components/tasks/GroupTaskWorkspace.tsx`
**Type:** Client (`'use client'`)

**Props:**
```typescript
{
  group:            TaskGroup;
  initialSubtasks:  SubtaskWithAssignee[];
  currentUserId:    string;
  currentUserName:  string;
  callerRole:       UserRole;
  callerDomain:     AppDomain;
}
```

**What it renders:** Full-page group workspace with list/board view toggle, subtask list/cards, FAB for adding subtasks.

**View toggle:** `'list' | 'board'`. Persisted to `localStorage` at `eia:tasks:workspace-view:${groupId}`. Default `'list'` on SSR; `useEffect` reads after mount.

**List view:** sorted by priority DESC + `due_at` ASC. Task rows with priority left border, title, assignee avatar, due chip, status pill, arrow to SubTaskModal.

**Board view:** 5 columns — `to_do`, `in_progress`, `in_review`, `completed`, error/cancelled (combined column). Terminal column header shows sum of both counts; cards show actual status pill. Framer Motion `layout` animations on card move.

**Actions called:**
- `getGroupSubtasksAction(group.id)` — called in `handleModalClose` to re-sync after SubTaskModal status changes
- `createSubtaskAction` — from FAB inline panel

**Realtime channels:** `workspace-subtasks-${groupId}-${mountId}`. Subscribes to `tasks WHERE group_id = id`. Merges INSERT/UPDATE into local state — no full refetch on change.

**Modals opened:**
- `SubTaskModal` (on row/card click, via `handleModalClose` re-sync)
- `AssigneePickerModal` (portaled to `document.body`)

---

### `SubTaskModal`
**File:** `src/components/tasks/SubTaskModal.tsx`
**Type:** Client (`'use client'`)

**Props:**
```typescript
{
  open:           boolean;
  onClose:        () => void;
  task:           Task;
  group?:         TaskGroup;          // present for group subtasks, absent for personal
  assignee?:      Profile;
  initialRemarks: TaskRemarkWithAuthor[];
  callerProfile:  Pick<Profile, 'id' | 'role' | 'domain'>;
  currentUserName?: string;
}
```

**Shell:** `position: fixed; inset: 0`. `max-width: 1100px`, `width: 95vw`, `height: 90vh`, `max-height: 820px`. `var(--theme-overlay)` backdrop with `blur(4px)`. Scale entrance `0.96→1` at 200ms ease-out-expo. Not a bottom sheet.

**Header:** breadcrumb (`group.title › task.title` or `My Tasks › title`). Status pill (inline dropdown, 6 options, optimistic), priority pill (inline dropdown, 3 options, optimistic), divider, edit pencil, ⋯ delete menu, close ×.

**Zone A (38%):** Title, Notes/Objective, Action Items checklist (`group_subtask` only — not shown for personal), Key Variables (deadline + assignee), metadata footer. Edit mode: slide-up Save Brief / Cancel footer.

**Zone B (62%):** `TaskRemarksPanel` with `composerPlaceholder` prop.

**Checklist:** always interactive. First 5 visible, "Show N more" toggle. Edit mode: drag-to-reorder via `@dnd-kit/sortable`, delete ×, add new item input. Toggles call `updateChecklistAction` optimistically.

**Edit mode:** Zone A only. Save calls `updateTaskAction` (title/description) + `updateChecklistAction` if checklist changed. Does NOT insert into `task_remarks`.

**Delete:** via ⋯ menu. Personal task: requires `created_by === caller.id AND assigned_to === caller.id` OR admin/founder. Group subtask: any caller with access OR admin/founder.

**`AnimatePresence` rule:** must be wrapped at the call site, not inside `SubTaskModal`. The modal does not manage its own `AnimatePresence`.

**Actions called:**
- `updateTaskStatusAction` (optimistic status pill change)
- `updateTaskAction` (Save Brief)
- `updateChecklistAction` (checklist toggle)
- `deleteTaskAction` (delete flow)

---

### `TaskRemarksPanel`
**File:** `src/components/tasks/TaskRemarksPanel.tsx`
**Type:** Client (`'use client'`)

**Props:**
```typescript
{
  taskId:               string;
  currentUserId:        string;
  currentUserName:      string;
  initialRemarks:       TaskRemarkWithAuthor[];
  composerPlaceholder?: string;   // default "Add an update…"
}
```

**Realtime channel:** `task-remarks-${taskId}-${mountId}` where `mountId` comes from `useId()`. Unique per task AND per mount — prevents Strict Mode double-mount channel collisions and cross-task subscription bleed.

**Dedup guard:** `seenIds` ref as primary dedup guard. Optimistic inserts at 0.5 opacity; confirmed on Realtime echo.

**Timeline:** oldest at top, newest at bottom. Auto-scrolls to bottom on mount and on new remarks.

**Status chips:** if `remark.status_change` is set, a compact pill rendered above content using `TASK_REMARK_STATUS_LABELS`.

**Suppressed remarks:** italic "This remark was removed." in `var(--theme-text-tertiary)`. Original content never shown for any role.

**Compose area:** textarea (grows to 3 lines) + 6 status-change pills + "Post update" button. `useTransition` + `isPending` guard prevents duplicate submissions. On error: optimistic row removed, `toast.danger` fires.

**Empty state:** Playfair italic "No updates yet."

**Actions called:** `addTaskRemarkAction`

**Ambient CSS orbs:** two ambient CSS orbs using GPU-only `transform + opacity` (not `width/height/padding`).

---

### `AssigneePickerModal`
**File:** `src/components/tasks/AssigneePickerModal.tsx`
**Type:** Client (`'use client'`)

**Props:**
```typescript
{
  open:          boolean;
  onClose:       () => void;
  onConfirm:     (userId: string, user: AssignableUser) => void;
  users:         AssignableUser[];      // pre-fetched by parent, max 100
  initialDomain: AppDomain;
}
```
`AssignableUser = Pick<Profile, "id" | "full_name" | "avatar_url" | "role" | "domain">`

**Shell:** nested modal. Backdrop `--z-modal-overlay` (61). Panel `--z-modal-nested` (62). Sits above SubTaskModal (`--z-modal` = 60).

**Behaviour:** Domain tabs at top — only shows domains with at least one user. Client-side search (no server round-trip). Single select. Role badge per user row. Confirm disabled until selection made.

**Portaling:** always portaled to `document.body` by callers.

---

### `CreatePersonalTaskModal`
**File:** `src/components/tasks/CreatePersonalTaskModal.tsx`
**Type:** Client (`'use client'`)

**Props:**
```typescript
{
  open:      boolean;
  onClose:   () => void;
  onCreated: (task: Task) => void;
}
```

Composes `src/components/ui/modal.tsx`.

**Fields (in order):** Title (autofocus, grows 1→3 lines), Due date (Today/Tomorrow/Next week IST end-of-day preset chips + specific datetime-local toggle), Priority (Urgent/High/Normal chips, default Normal), Tags (free-text chip input, max 10, Enter/comma to add), Notes (collapsed "+ Add notes" toggle).

**IST end-of-day:** preset chips call `istEndOfDay(dayOffset)` — IST UTC+5:30 offset computed explicitly (5.5h). Not via `toUTC()` from `dates.ts`.

**Tags:** wired to `createPersonalTaskAction` since migration 0024. The stale TODO comment at line 594 ("wire tags once column exists") is outdated.

**`onCreated`:** receives a synthetic `Task` object built from known fields + server-returned `taskId`. Parent prepends to `activeTasks` — no re-fetch needed.

**Actions called:** `createPersonalTaskAction`

---

### `CreateGroupTaskModal`
**File:** `src/components/tasks/CreateGroupTaskModal.tsx`
**Type:** Client (`'use client'`)

**Props:**
```typescript
{
  open:      boolean;
  onClose:   () => void;
  onCreated: (group: TaskGroup) => void;
}
```

Composes `src/components/ui/modal.tsx` with `maxWidth="max-w-3xl"`.

**Layout:** left 280px live preview card + right form. Preview hidden below 640px.

**Fields (in order):** Title (autofocus), Description (auto-grow textarea), Domain (`<select>` from `APP_DOMAINS`), Accent Colour (10 swatches from `GROUP_TASK_ACCENT_COLORS`), Icon (25 Lucide icons in 5×5 grid), Priority chips, Due Date, Add Members.

**Not wired to DB:** `accent_color`, `icon_key` (no DB columns yet), `memberIds` (no `task_group_members` table yet). See Section 16.

**`searchProfilesAction`:** not yet implemented. Member search renders a stub "coming soon" dropdown.

**`onCreated`:** parent (`GroupTasksTab`) converts returned `TaskGroup` to `TaskGroupRow` and prepends to local state.

**Actions called:** `createGroupTaskAction`

---

## 12. Task Flows

### A. Create personal task (via modal)

1. User clicks "+ My Task" in `TasksShell` header
2. `TasksShell.createTrigger` increments
3. `PersonalTasksTab` `useEffect` on `createTrigger` fires → `setCreateModalOpen(true)`
4. `CreatePersonalTaskModal` renders
5. User fills title, due date, priority, tags, notes
6. User clicks "Create" → `createPersonalTaskAction(formData)` called
7. Action: Zod parse → `getCurrentProfile()` → `adminClient` INSERT into `tasks` → `createNotification` (fire-and-forget if `assigned_to ≠ caller.id`) → `scheduleTaskReminder` (fire-and-forget if `due_at` set)
8. Action returns `{ data: { taskId }, error: null }`
9. Modal calls `onCreated(syntheticTask)` → `PersonalTasksTab` prepends to `activeTasks` state → modal closes

### B. Create personal task (via quick-add inline row)

1. *(Currently not exposed via a dedicated button — quick-add row is shown via `setShowQuickAdd(true)` inside the tab, not wired to the parent `createTrigger`.)*
2. User fills title input, optional due date, optional assignee (manager+ only)
3. Press Enter or click "Save"
4. `handleQuickAddSave` called — guarded by `isPending` and `useTransition`
5. `createPersonalTaskAction({ title, priority: 'normal', due_at, assigned_to })` called
6. On success: `toast.success`, `setShowQuickAdd(false)`, refetch active tasks via `getPersonalTasksAction`

### C. Inline complete a personal task

1. User clicks completion circle on a task row in `PersonalTasksTab`
2. `handleCircleClick` fires → `e.stopPropagation()` (prevents modal open)
3. `setOptimisticStatus(taskId → newStatus)` — immediate visual feedback
4. `updateTaskStatusAction({ taskId, status: 'completed' | 'to_do' })` called inside `startTransition`
5. On error: `setOptimisticStatus` entry deleted + `toast.danger`
6. On success: optimistic state persists; task moves visually to completed section on next render cycle

### D. Create group task

1. User (manager+) clicks "+ Group Task" in `TasksShell` header
2. `TasksShell.createTrigger` increments → `GroupTasksTab` `useEffect` opens `CreateGroupTaskModal`
3. User fills title, description, domain, accent colour (UI only), icon (UI only), priority, due date, members (stub)
4. "Create" clicked → `createGroupTaskAction({ title, description, priority, due_at, domain })`
5. Action: Zod → auth (manager+ only) → domain enforcement (manager locked to own domain) → `adminClient` INSERT into `task_groups`
6. Returns `{ data: { groupId }, error: null }`
7. `CreateGroupTaskModal.onCreated(group)` → `GroupTasksTab` converts to `TaskGroupRow` and prepends to `rows` state

### E. Create subtask

1. User clicks "+ Add subtask" FAB in `GroupTaskWorkspace` (or inline row in `GroupTasksTab`)
2. Inline panel opens: title + assignee picker + priority + due date
3. "Add" clicked → `createSubtaskAction({ group_id, title, description, priority, due_at, assigned_to })`
4. Action: Zod → auth → server client fetch `task_groups` row (verify group exists + get domain) → domain check for agents → `adminClient` INSERT into `tasks` with `task_category: 'group_subtask'` → `createNotification` (fire-and-forget if `assigned_to ≠ caller.id`) → `scheduleTaskReminder` (fire-and-forget if `due_at`)
5. Returns `{ data: { taskId }, error: null }`
6. Caller (`GroupTaskWorkspace` or `GroupTasksTab`) re-fetches subtasks via `getGroupSubtasksAction`

### F. Open SubTaskModal (from each entry point)

**From `PersonalTasksTab`:**
1. User clicks task row (title area or `→` arrow button)
2. `handleRowClick(task)` → `setSelectedTask(task)`, `setSelectedTaskRemarks([])`, `setTaskModalOpen(true)`
3. `<AnimatePresence>` at call site wraps `<SubTaskModal open={taskModalOpen} task={selectedTask} initialRemarks={[]} ...>`
4. `SubTaskModal` mounts with empty remarks — `TaskRemarksPanel` Realtime subscription established

**From `GroupTasksTab`:**
1. User clicks subtask row
2. Same pattern — `setSelectedTask(subtask)`, `setTaskModalOpen(true)`
3. `SubTaskModal` opened with `group` prop populated

**From `GroupTaskWorkspace`:**
1. User clicks row (list) or card (board)
2. Same pattern — modal closed via `handleModalClose` which calls `getGroupSubtasksAction` to re-sync

### G. Edit task brief (Zone A edit mode → Save Brief)

1. User clicks pencil icon in `SubTaskModal` header → `setEditMode(true)`
2. Zone A input fields become editable (title, description)
3. Checklist: drag-to-reorder enabled, delete × visible, add item input shown
4. User edits fields
5. "Save Brief" clicked → `updateTaskAction({ taskId, title, description })` called
6. If checklist changed → `updateChecklistAction({ taskId, items })` called
7. On success: `setEditMode(false)`, local task state updated — no remark inserted

### H. Post a remark with status change (Zone B composer)

1. User types in `TaskRemarksPanel` compose area
2. User selects a status change pill (optional — e.g. "In Progress")
3. User clicks "Post update"
4. `addTaskRemarkAction({ taskId, content, statusChange? })` called inside `useTransition`
5. Optimistic remark inserted to local state at 0.5 opacity
6. Action flow: Zod → `getCurrentProfile()` → access check → if `statusChange`: `await updateTaskStatusAction({ taskId, status })` → `adminClient` INSERT into `task_remarks` with `status_change` populated
7. Realtime channel echoes back the new remark row → `seenIds` dedup → optimistic item replaced at full opacity
8. On error: optimistic item removed, `toast.danger` fires

### I. Check/uncheck a checklist item

1. User clicks checklist item checkbox in `SubTaskModal` Zone A
2. Optimistic local state update (item `checked` toggled in component state)
3. `updateChecklistAction({ taskId, items: newItems })` called (full array replacement)
4. Action: Zod → auth → `canMutateTask` → `adminClient.update({ attachments: items })`
5. On error: rollback optimistic state + `toast.danger`
6. On success: local state matches DB — no Realtime needed for checklist

### J. Suppress a remark (admin/founder only)

1. Admin/founder long-presses or opens ⋯ menu on a remark in `TaskRemarksPanel`
2. "Remove" option clicked → `suppressTaskRemarkAction({ messageId: remarkId })`
3. Action: Zod → auth (admin/founder only) → fetch remark via `adminClient` to verify existence → idempotency check → `adminClient.update({ is_suppressed: true, suppressed_by, suppressed_at })`
4. Realtime UPDATE event echoes to `TaskRemarksPanel` → remark re-renders as "This remark was removed."

### K. Delete a personal task

1. User opens ⋯ menu in `SubTaskModal` header → "Delete"
2. Confirmation dialog shown
3. On confirm → `deleteTaskAction({ taskId })`
4. Action: Zod → auth (agent: must be both `created_by` AND `assigned_to`) → `await cancelTaskReminder(taskId)` (blocking) → if cancel throws → return error, abort → `adminClient.delete()` → cascade removes `task_remarks`
5. `SubTaskModal` closes → parent removes task from local state

### L. Delete a group subtask

1. User opens ⋯ menu in `SubTaskModal` header → "Delete"
2. Same `deleteTaskAction` flow — manager/admin/founder access (not restricted to both ownership fields)
3. `GroupTaskWorkspace` or `GroupTasksTab` re-fetches subtasks after close

### M. Task deadline reminder fires (Trigger.dev → notification)

1. Task created with `due_at` → `scheduleTaskReminder(taskId, dueAt, assignedTo)` called
2. Trigger.dev stores DELAYED run with `idempotencyKey: 'task-reminder-${taskId}'`, `tag: 'task-reminder-${taskId}'`, fires at `dueAt - 30min`
3. `sendTaskReminderTask` runs → dynamic import `createNotification` → INSERT into `notifications` (`type: 'task_due'`, `action_url: '/tasks'`)
4. Supabase Realtime (notifications table) pushes INSERT event to `useNotifications` hook → bell dot appears
5. User opens notification panel → `NotificationItem` renders `Clock` icon + "Task due soon" title
6. User clicks item → `markNotificationReadAction` → `router.push('/tasks')`

### N. Create a Gia follow-up task (from lead context)

1. Lead call logged via `addLeadCallNote` action in `src/lib/actions/leads.ts`
2. Or explicitly created via (currently undiscovered UI — see Section 13)
3. `adminClient.from('tasks').insert({ ..., task_category: 'gia_followup', module: 'gia', task_type: (call|whatsapp_message|email|general_follow_up) })`
4. Immediately after: `adminClient.from('task_gia_meta').insert({ task_id, lead_id })`
5. Task appears in `AgentTasksWidget` (dashboard) via `getAgentTasksSummary` query which joins `tasks + task_gia_meta + leads`
6. Task appears on lead dossier via `getNextLeadTask` (`leads-service.ts`) which queries `tasks !inner task_gia_meta` filtered by `lead_id`

---

## 13. Gia Task Integration

### `task_gia_meta` schema
(Full schema in Section 2.) Columns: `task_id` (PK, FK→tasks ON DELETE CASCADE), `lead_id` (FK→leads), `call_outcome` (text, nullable).

### How Gia tasks differ from OS tasks
- `task_category = 'gia_followup'` — this is the discriminator.
- `module = 'gia'` — always.
- `task_type` is meaningful: `call`, `whatsapp_message`, `email`, or `general_follow_up` — reflects the intended action with the lead.
- A companion row in `task_gia_meta` links the task to a `lead_id`.
- `call_outcome` on `task_gia_meta` is populated when `task_type = 'call'` and the task is completed.
- Gia tasks have no `group_id` — they are never group subtasks.
- Gia tasks have no `tags` in practice (column exists, defaults to `{}`).

### Where Gia tasks are created
`src/lib/actions/leads.ts` — the `addLeadCallNote` action (and any future lead follow-up action). The action:
1. INSERTs into `tasks` with `task_category: 'gia_followup'`
2. Immediately INSERTs into `task_gia_meta` with `{ task_id, lead_id }`

No UI component currently creates a `gia_followup` task directly. All creation goes through lead actions.

### Where Gia tasks are displayed

**`AgentTasksWidget`** (`src/components/dashboard/widgets/AgentTasksWidget.tsx`):
- Via `getAgentTasksSummaryAction` → `getAgentTasksSummary` in `dashboard-service.ts`
- Query: `tasks!inner(task_gia_meta!inner(lead_id, lead:leads!task_gia_meta_lead_id_fkey(first_name, last_name)))` where `assigned_to = userId` and `status = 'to_do' or 'in_progress'` and `due_at <= today`
- Shows task title, due date, associated lead name

**Lead dossier** (`src/app/(dashboard)/leads/[id]/page.tsx`):
- Via `getNextLeadTask(leadId)` in `leads-service.ts`
- Query: starts from `tasks`, `!inner` joins to `task_gia_meta` filtered by `lead_id`, ordered by `due_at ASC`, limit 1
- Shows the next pending task in `LeadDossierTasksAsync`

### Service functions that query Gia tasks specifically

| Function | File | Query pattern |
|---|---|---|
| `getAgentTasksSummary` | `dashboard-service.ts` | `tasks + task_gia_meta!inner + leads` join; filter by `assigned_to + status + due_at` |
| `getNextLeadTask(leadId)` | `leads-service.ts` | Starts from `tasks`, `task_gia_meta!inner(lead_id)`, `.eq('task_gia_meta.lead_id', leadId)`, `status = to_do|in_progress`, `order due_at ASC`, `limit 1` |

**`getNextLeadTask` join direction note:** starts from `tasks` (not `task_gia_meta`) and uses `!inner` because PostgREST/Supabase JS silently drops dot-notation filters on joined tables when the filter is on a non-root column. Always filter on native columns of the root table.

### `task_type` values used for Gia tasks
`call`, `whatsapp_message`, `email`, `general_follow_up` — from `TaskType`.

---

## 14. Authorization Matrix

| Operation | agent | manager | admin | founder |
|---|---|---|---|---|
| Create personal task | ✓ | ✓ | ✓ | ✓ |
| Create group task | ✗ | domain | ✓ | ✓ |
| Create subtask | domain | domain | ✓ | ✓ |
| View personal (own) | ✓ | ✓ | ✓ | ✓ |
| View personal (others) | ✗ | ✓ | ✓ | ✓ |
| View group task | ✗ | domain | ✓ | ✓ |
| View subtask | own | domain | ✓ | ✓ |
| Edit task brief | own | domain | ✓ | ✓ |
| Change status | own | domain | ✓ | ✓ |
| Post remark | own | domain | ✓ | ✓ |
| Check checklist item | own | domain | ✓ | ✓ |
| Suppress remark | ✗ | ✗ | ✓ | ✓ |
| Delete personal (own — both created_by AND assigned_to) | ✓ | ✓ | ✓ | ✓ |
| Delete personal (assigned by other) | ✗ | ✓ | ✓ | ✓ |
| Delete group task | ✗ | ✗ | ✓ | ✓ |
| Delete subtask | ✗ | ✓ | ✓ | ✓ |
| View audit log | ✗ | ✓ | ✓ | ✓ |

**Key:**
- ✓ = always
- ✗ = never
- `own` = own tasks only (`assigned_to = caller.id` OR `created_by = caller.id`)
- `domain` = same domain only (task's parent group domain matches `caller.domain`)

**Notes:**
- Agent `tasks_agent_select` RLS: `assigned_to = auth.uid()`. Agents cannot see tasks where they are `created_by` but not `assigned_to` (by RLS), but `canMutateTask` permits mutation if either ownership field matches.
- Group subtask agent visibility: agents only see subtasks where `assigned_to = auth.uid()`. A subtask assigned to a colleague in the same group is invisible to the agent — by design, no policy change needed.
- `task_groups_delete` RLS: admin/founder only. Managers cannot delete groups even in their own domain.

---

## 15. Known Gaps and Tech Debt

### TD-001 — `src/lib/actions/leads.ts` — Rule A-03 / Rule 04 duplication
- `getCallerProfile()` defined inline (lines 23–35) is an exact duplicate of `getCurrentProfile()` from `profiles-service.ts`.
- **Fix:** delete inline fn, import canonical, replace 8 call sites.
- Logged: 2026-05-28.

### TD-002 — `src/lib/services/tasks-service.ts` — Rule P-07 `console.error`
- `console.error('[tasks-service] getGroupTasks RPC error:', error)` inside `getGroupTasks`.
- **Fix:** replace with `Sentry.captureException` once Sentry is wired up.
- **Warning:** The `// TD-002` marker comment above the call has been wiped during previous rewrites. Grep for `TD-002` before committing any change to `tasks-service.ts`.
- Logged: 2026-05-28.

### `CreatePersonalTaskModal.tsx:594` — Stale TODO
```
// TODO: wire tags into createPersonalTaskAction once tasks.tags column exists
```
This TODO is **stale**. Migration 0024 added the `tags` column to `tasks`. The `CreatePersonalTaskModal` already wires tags to `createPersonalTaskAction` via `CreatePersonalTaskSchema`. The comment is inaccurate and should be removed.

### `CreateGroupTaskModal.tsx` — Multiple open TODOs
```
// TODO: add `accent_color text` and `icon_key text` columns (new migration).
// TODO: implement searchProfilesAction in src/lib/actions/profiles.ts.
// TODO: add task_group_members table + wire memberIds once the table exists.
// (lines 11, 14, 17, 301, 353, 621, 657, 790, 791)
```
Three open items:
1. `accent_color` and `icon_key` columns on `task_groups` — new migration required
2. `searchProfilesAction` in `src/lib/actions/profiles.ts` — not yet implemented
3. `task_group_members` junction table — not yet created

### `tasks-service.ts` — `console.error` in `getGroupSubtasks` and `getTaskRemarks`
Not marked as TD but present: `console.error('[tasks-service] getGroupSubtasks error:', error)` and `console.error('[tasks-service] getTaskRemarks error:', error)` violate Rule P-07. Same fix as TD-002.

### Decision Log entries (from `docs/The_Blueprint.md`, task-relevant)
- Status vocabulary migration (`pending`→`to_do`, `done`→`completed`) was a breaking change in migration 0017. Any code targeting old values fails at DB constraint.
- `task_messages` dropped and replaced by `task_remarks` in migration 0022 (pre-production, no data loss). The rename was driven by the semantic evolution of the concept.
- `task_audit_log` ON DELETE CASCADE accepted as a trade-off — consistency over retention; task deletion is already admin/founder-restricted at the application layer.
- `log_task_changes()` `changed_by` fallback to `NEW.assigned_to` in service-role context is a documented imperfection — a reassignment via service role records the new assignee as the changer. Adding a `changed_by` parameter to tasks was explicitly rejected as not worth the complexity.

---

## 16. What Does Not Exist Yet

### `accent_color` column on `task_groups`
`GROUP_TASK_ACCENT_COLORS` defined in `task-constants.ts`. `CreateGroupTaskModal` renders 10 colour swatches. The selected colour is NOT passed to `createGroupTaskAction` — no DB column exists. Migration required.

### `icon_key` column on `task_groups`
`GROUP_TASK_ICONS` defined in `task-constants.ts`. `CreateGroupTaskModal` renders a 5×5 icon grid. The selected icon is NOT passed to `createGroupTaskAction` — no DB column exists. Migration required.

### `searchProfilesAction` in `src/lib/actions/profiles.ts`
Referenced in `CreateGroupTaskModal` for the "Add Members" member search. The function does not exist. Member search renders a stub "coming soon" dropdown.

### `task_group_members` junction table
No table exists. The "Add Members" feature in `CreateGroupTaskModal` tracks member chips locally but they are NOT saved. Referenced in multiple TODOs in `CreateGroupTaskModal.tsx`.

### Sia concierge task type
`TaskCategory` only has `personal`, `group_subtask`, `gia_followup`. A `sia` category or module is referenced in planning but not built.

### Finance task type
`TaskModule` includes `finance` but no finance task creation flow exists. `task_groups` has no finance-specific handling.

### LuxuryCalendar component
No `LuxuryCalendar` component exists in `src/components/`. The `DatePicker` in `src/components/ui/DatePicker.tsx` is the current calendar UI primitive.

### Task insights page (`/task-insights`)
No route exists at `src/app/(dashboard)/task-insights/`. Referenced in planning phases but not built.

### Import batch (CSV/Sheets)
No batch task import functionality exists anywhere in the codebase.

### `searchProfilesAction`
Referenced in `CreateGroupTaskModal`. Does not exist in `src/lib/actions/profiles.ts`.

### Board-view drag-and-drop in `GroupTaskWorkspace`
The board view exists with 5 columns and Framer Motion `layout` animations on card move, but drag-and-drop between columns is explicitly documented as **not built**: "No drag-and-drop" per `src/app/(dashboard)/CLAUDE.md`.

### Inline complete for group subtasks
`GroupTaskWorkspace` explicitly does not support inline complete: "No inline complete for subtasks" per `src/app/(dashboard)/CLAUDE.md`.

### `task_assigned` case in `NotificationItem.tsx`
The `getTypeIcon` switch includes `task_assigned` → `CheckSquare`. This is correctly implemented. No gap here — documented for completeness.
