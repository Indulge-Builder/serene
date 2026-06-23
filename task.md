# Tasks — Complete Feature Documentation

> **Scope:** Everything currently built for the Tasks feature in Serene — every table, column, constraint, index, RLS policy, trigger, RPC, service function, server action, Zod schema, constant/enum, frontend component, tab, modal, hook, the assignment model, the notification pipeline, the Trigger.dev jobs, the caching layer, and the end-to-end workflows.
>
> **Generated:** 2026-06-24 from a full-codebase scan (DB migrations through 0141, services/actions/validations/constants, frontend, and the feature CLAUDE.md files).
>
> **Authority files this distills:** `docs/pages/tasks.md` (page spec + deep dive), `docs/architecture/database.md`, `docs/changelog.md`, `src/app/(dashboard)/tasks/CLAUDE.md`, `src/components/tasks/CLAUDE.md`, `src/lib/CLAUDE.md`.

---

## 0. The One-Table Model (read this first)

There is **one `tasks` table**. Since **migration 0138 (2026-06-17, `collapse_gia_category_module_enum`)** it carries **two structural categories**, discriminated by the `task_category` column:

| `task_category` | What it is | How it's created |
| --- | --- | --- |
| `personal` | A standalone task owned by one person (an individual to-do **or** a lead follow-up) | `CreatePersonalTaskModal` → `createPersonalTaskAction`; lead follow-ups via `createLeadTaskAction` / SLA / Revival automation → `create_lead_gia_task` RPC |
| `group_subtask` | A subtask under a `task_groups` parent | `CreateGroupTaskModal` (parent) + add-subtask UI → `createSubtaskAction` |

**`task_category` is structure-only.** The pre-0138 third value `gia_followup` was **collapsed** — a lead follow-up is now simply a `personal` task that **also carries a `task_gia_meta` row**. The meta row **is** the task→lead link; the category no longer encodes it.

The module a task belongs to lives on the `module` column, converted in 0138 from free text to a native enum **`task_module ('gia' | 'sia' | 'core')`**:
- `'gia'` — a lead follow-up. **Sole writer:** `create_lead_gia_task` (and the `update_lead_status` nurturing branch).
- `'sia'` — ticket module (future; sole writer will be `create_lead_sia_task`).
- `'core'` — everything else (standalone personal to-dos, group subtasks). Default.

### The single-writer invariant (load-bearing)

A `task_gia_meta` row exists **iff** the task is a lead follow-up, for all time — because `create_lead_gia_task` (+ the `update_lead_status` nurturing branch) is the **only** writer of a `task_gia_meta` row, **always** in the same transaction as the task, **and** the only writer of `module='gia'`. Every other insert path uses `module='core'` and writes no meta row.

**Consequence:** `EXISTS (task_gia_meta row)` / `module='gia'` is the **permanent, correct** substitute for the retired `task_category = 'gia_followup'` check. **Detect a lead task by meta-presence / `module='gia'`, never by category.**

A **subtask is not a separate table** — it is a `tasks` row with `task_category = 'group_subtask'` and a non-null `group_id`.

Every task has an **append-only narrative** in `task_remarks`. Meaningful status changes ride a remark via the `add_task_remark_with_status` RPC — "accountability through narrative."

---

## 1. Database Layer

### 1.1 Tables (5 total)

#### `tasks` — the core table (migration 0003, extended through 0138)

| Column | Type | Constraints | Default |
| --- | --- | --- | --- |
| `id` | uuid | PRIMARY KEY | `gen_random_uuid()` |
| `assigned_to` | uuid | NOT NULL, FK → `profiles(id)` | — |
| `created_by` | uuid | NOT NULL, FK → `profiles(id)` | — |
| `module` | `task_module` (enum `gia\|sia\|core`; was `text`, converted in 0138) | NOT NULL | `'core'` |
| `task_type` | text | NOT NULL | — |
| `title` | text | NOT NULL (added 0017, backfilled `'(untitled)'`) | — |
| `description` | text | NULL | — |
| `priority` | text | NOT NULL, CHECK `urgent\|high\|normal` | `'normal'` |
| `task_category` | text | NOT NULL, CHECK `personal\|group_subtask` (collapsed from 3 values in 0138) | `'personal'` |
| `group_id` | uuid | FK → `task_groups(id)` ON DELETE CASCADE | NULL |
| `status` | text | NOT NULL, CHECK 6 values (see §1.2) | `'to_do'` (default corrected from legacy `'pending'` in 0086) |
| `due_at` | timestamptz | NULL | — |
| `completed_at` | timestamptz | NULL — set to `now()` when status → `completed` | — |
| `attachments` | jsonb | NOT NULL, CHECK `jsonb_typeof = 'array'` — holds `ChecklistItem[]` | `'[]'::jsonb` |
| `tags` | text[] | NOT NULL | `'{}'` |
| `overdue_at` | timestamptz | NULL — stamped **exactly once** by the overdue job (0113) | — |
| `created_at` | timestamptz | NOT NULL | `now()` |
| `updated_at` | timestamptz | NOT NULL (bumped by `tasks_updated_at` trigger) | `now()` |

**RLS:** ENABLED (0003).

#### `task_groups` — the parent container for subtasks (migration 0017)

| Column | Type | Constraints | Default |
| --- | --- | --- | --- |
| `id` | uuid | PRIMARY KEY | `gen_random_uuid()` |
| `title` | text | NOT NULL | — |
| `description` | text | NULL | — |
| `priority` | text | NOT NULL, CHECK `urgent\|high\|normal` | `'normal'` |
| `status` | text | NOT NULL, same 6-value CHECK as `tasks` | `'to_do'` |
| `due_at` | timestamptz | NULL | — |
| `created_by` | uuid | NOT NULL, FK → `profiles(id)` | — |
| `domain` | `app_domain` (enum, was `text`; converted in 0041) | NOT NULL | — |
| `created_at` | timestamptz | NOT NULL | `now()` |
| `updated_at` | timestamptz | NOT NULL | `now()` |

**RLS:** ENABLED (0017). A group is a *container* — it has no `assigned_to`; subtasks carry assignees.

#### `task_remarks` — append-only narrative + status-change log (migration 0022, replaced `task_messages`)

| Column | Type | Constraints | Default |
| --- | --- | --- | --- |
| `id` | uuid | PRIMARY KEY | `gen_random_uuid()` |
| `task_id` | uuid | NOT NULL, FK → `tasks(id)` ON DELETE CASCADE | — |
| `author_id` | uuid | NOT NULL, FK → `profiles(id)` | — |
| `content` | text | NOT NULL (1–2000 chars, sanitized in action) | — |
| `status_change` | text | CHECK = the 6 task-status values, NULL allowed | NULL |
| `is_suppressed` | boolean | NOT NULL | `false` |
| `suppressed_by` | uuid | FK → `profiles(id)` ON DELETE SET NULL | NULL |
| `suppressed_at` | timestamptz | NULL | — |
| `created_at` | timestamptz | NOT NULL | `now()` |

**RLS:** ENABLED (0022). **Realtime:** ENABLED (0022). **Append-only** (Rule A-11) — no DELETE policy; the *only* mutation is the suppression flip (admin/founder).

#### `task_audit_log` — automatic change history (migration 0021)

| Column | Type | Constraints |
| --- | --- | --- |
| `id` | uuid | PRIMARY KEY `gen_random_uuid()` |
| `task_id` | uuid | NOT NULL, FK → `tasks(id)` ON DELETE CASCADE |
| `changed_by` | uuid | NOT NULL, FK → `profiles(id)` |
| `field_name` | text | NOT NULL |
| `old_value` | text | NULL |
| `new_value` | text | NULL |
| `changed_at` | timestamptz | NOT NULL `now()` |

**RLS:** ENABLED (0021), SELECT-only for manager/admin/founder. Written **only** by the `log_task_changes()` trigger — no INSERT/UPDATE/DELETE policies (append-only, Rule A-11).

#### `task_gia_meta` — links lead follow-up tasks to leads (migration 0003)

The presence of a row here **is** what makes a `personal` task a lead follow-up (the single-writer invariant).

| Column | Type | Constraints |
| --- | --- | --- |
| `task_id` | uuid | PRIMARY KEY, FK → `tasks(id)` ON DELETE CASCADE |
| `lead_id` | uuid | NOT NULL, FK → `leads(id)` |
| `call_outcome` | text | NULL — `'revived'` marks a Lead-Revival task (the badge key) |

**RLS:** ENABLED (0003), SELECT mirrors task visibility.

---

### 1.2 Enums / CHECK Vocabularies

**Task status** (`tasks.status`, `task_groups.status`, `task_remarks.status_change`) — constraint `tasks_status_check`, established 0017:

```
to_do · in_progress · in_review · completed · error · cancelled
```
(Legacy `pending → to_do` and `done → completed` were migrated in 0017.)

**Task priority** — constraint `tasks_priority_check`:
```
urgent · high · normal
```

**Task category** — constraint `tasks_category_check` (collapsed to 2 values in 0138):
```
personal · group_subtask
```
(The pre-0138 `gia_followup` value was backfilled to `personal` and dropped from the CHECK. A lead follow-up is now `personal` + a `task_gia_meta` row.)

**Task module** — native enum `task_module` (0138):
```
gia · sia · core
```

**Task type** (`tasks.task_type`) — post-0057 vocabulary:
```
call · whatsapp_message · other
```
(Legacy `email` and `general_follow_up` were backfilled to `other` in 0057.)

---

### 1.3 Indexes

**On `tasks`:**

| Index | Columns | Partial WHERE |
| --- | --- | --- |
| `idx_tasks_assigned_to` | `(assigned_to, due_at ASC NULLS LAST)` | `status NOT IN ('completed','cancelled','error')` |
| `idx_tasks_module` | `(module, assigned_to)` | `status NOT IN ('completed','cancelled','error')` (dropped + recreated in 0138 around the enum retype) |
| `idx_tasks_agent_active` | `(assigned_to, task_category, due_at ASC NULLS LAST)` | same |
| `idx_tasks_category` | `(task_category)` | `status NOT IN ('completed','cancelled')` |
| `idx_tasks_group_id` | `(group_id)` | `group_id IS NOT NULL` |
| `idx_tasks_priority` | `(priority, due_at)` | `status NOT IN ('completed','cancelled')` |
| `idx_tasks_group_assignee` | `(group_id, assigned_to)` | `task_category = 'group_subtask'` (supports 0058 flat visibility) |
| `idx_tasks_tags_gin` | GIN `(tags)` | `task_category = 'personal'` |
| `idx_tasks_tags_active` | `(assigned_to) INCLUDE (tags)` | `task_category = 'personal' AND status NOT IN ('completed','cancelled','error')` |
| `idx_tasks_overdue_at` | `(overdue_at)` | `overdue_at IS NOT NULL` |

**On `task_groups`:** `idx_task_groups_domain` `(domain)` WHERE active · `idx_task_groups_created_by` `(created_by)`
**On `task_remarks`:** `idx_task_remarks_task_id` `(task_id, created_at ASC)` (oldest-first timeline)
**On `task_audit_log`:** `idx_task_audit_log_task_id` `(task_id, changed_at DESC)`
**On `task_gia_meta`:** `idx_task_gia_meta_lead_id` `(lead_id)`

---

### 1.4 RLS Policies

#### `tasks`
- **`tasks_agent_select`** (SELECT): `get_user_role() = 'agent' AND (assigned_to = auth.uid() OR created_by = auth.uid())` (0051)
- **`tasks_manager_admin_founder_select`** (SELECT): `get_user_role() IN ('manager','admin','founder')`
- **`tasks_update`** (UPDATE): agent → `assigned_to = auth.uid()`; manager/admin/founder → all
- **`tasks_insert`** (INSERT, 0094): `created_by = auth.uid() AND assigned_to = auth.uid() AND task_category = 'personal'` — personal, self-assigned only
- **`tasks_delete`** (DELETE, 0094): agent → `task_category = 'personal' AND created_by = auth.uid() AND assigned_to = auth.uid() AND status IN ('to_do','in_progress')`
- **`tasks_delete_privileged`** (DELETE, 0094): `get_user_role() IN ('manager','admin','founder')`

> **Enforcement note:** INSERT/DELETE RLS (0094) is *defence-in-depth*. App writes use `adminClient` gated by `canMutateTask()` and the delete-auth rules in the action layer. A **lead follow-up** (a `personal` task + a `task_gia_meta` row + `module='gia'`) and `group_subtask` inserts have **no** direct INSERT policy and are blocked for clients by default — they're created only through SECURITY DEFINER RPCs or the admin client. Note the `tasks_insert` policy permits `personal` self-assigned inserts, but lead-task creation must still go through `create_lead_gia_task` so the meta row + `module` can never drift (see §2.2 / §1.6).

#### `task_groups` (flat visibility, migration 0058)
- **SELECT / UPDATE:** `created_by = auth.uid() OR EXISTS (SELECT 1 FROM tasks WHERE group_id = task_groups.id AND assigned_to = auth.uid() AND task_category = 'group_subtask')` — **no role/domain branching.** A user sees a group iff they created it **or** are assigned a subtask in it.
- **INSERT:** `auth.uid() IS NOT NULL`
- **DELETE:** `created_by = auth.uid()`

#### `task_remarks`
- **SELECT / INSERT:** allowed iff the caller can see the parent task (`assigned_to = auth.uid() OR created_by = auth.uid() OR role IN ('manager','admin','founder')`)
- **`task_remarks_suppression_update`** (UPDATE): `get_user_role() IN ('admin','founder')`. RLS can't restrict columns, so the action layer restricts the write to the 3 suppression fields.
- **No DELETE** — append-only.

#### `task_audit_log`
- **SELECT:** `get_user_role() IN ('manager','admin','founder')`. No INSERT/UPDATE/DELETE (trigger-written, append-only).

#### `task_gia_meta`
- **SELECT:** mirrors the parent task's visibility (agent sees own; manager+ sees all).

---

### 1.5 Triggers

| Trigger | Table | When | Function | Behavior |
| --- | --- | --- | --- | --- |
| `tasks_updated_at` | `tasks` | BEFORE UPDATE | `update_updated_at()` | bumps `updated_at` |
| `task_groups_updated_at` | `task_groups` | BEFORE UPDATE | `update_updated_at()` | bumps `updated_at` |
| `tasks_audit` | `tasks` | AFTER UPDATE FOR EACH ROW | `log_task_changes()` | logs changes to **6 fields only**: `title`, `description`, `status`, `priority`, `due_at`, `assigned_to`. **Excludes** `attachments`, `tags`, `task_category`, `group_id`, `module`, `created_at`, `updated_at`, `completed_at`, `overdue_at` — so checklist/tag toggles never flood the audit log. `changed_by` prefers `auth.uid()`, falls back to `NEW.assigned_to` for service-role context. One row per changed field. |

---

### 1.6 Postgres Functions / RPCs

| RPC | Migration | Purpose |
| --- | --- | --- |
| `get_personal_tasks(...)` | 0025 → 0026 (cursor) | Returns personal tasks for one user, keyset-paginated, sorted `due_at ASC NULLS LAST → priority (urgent=1,high=2,normal=3) → id ASC`. `SECURITY DEFINER`; the action verifies `auth.uid() = p_user_id`. **No split path** — page 1 and pages 2+ call the same RPC (the 3 cursor params are null for page 1). |
| `get_group_task_summaries(p_status, p_priority)` | 0020 → 0058 (flat) | Per-group aggregates: `subtask_total`, `subtask_completed`, `assignee_ids[]`. Visibility = creator OR subtask-assignee (no role branching). |
| `add_task_remark_with_status(p_task_id, p_author_id, p_content, p_status_change)` | 0035 (+0051) | **Atomic** insert into `task_remarks` + optional `tasks.status` update in one round-trip. Internally authorizes the caller; raises `unauthorized`/`task_not_found`. The optional status UPDATE fires the audit trigger. |
| `create_lead_gia_task(...)` | 0054 → 0138 | **Atomic** two-INSERT: creates a lead follow-up task (`task_category='personal'`, **`module='gia'`**) **and** its `task_gia_meta` row in one transaction (prevents orphaned, invisible tasks). **THE sole writer of `module='gia'` + a `task_gia_meta` row** (single-writer invariant). Signature unchanged in 0138. |
| `update_lead_status(...)` | 0031 → 0060 → 0138 | Lead status RPC; its **nurturing branch** auto-creates a 3-months-out follow-up task — also collapsed in 0138 to `task_category='personal'` + `module='gia'` + a `task_gia_meta` row (mirrors `create_lead_gia_task`). The second sanctioned writer of `module='gia'`. |
| `get_gia_tasks(p_user_id, p_role, p_domain)` | 0055 → 0056 → 0138 | All **lead follow-up** tasks for the caller, joined to lead identity fields. Scoping is now via the **`INNER JOIN task_gia_meta`** alone (the retired `task_category='gia_followup'` predicate was dropped in 0138). Agent → own assigned; manager+ → all in domain (`p_domain` cast to `app_domain` inside the body). Active tasks first, then `due_at ASC NULLS LAST`, then `created_at ASC`. EXECUTE revoked from `authenticated` in 0102 — called via admin client. |
| `log_task_changes()` | 0021 | The `tasks_audit` trigger function (see §1.5). |

---

## 2. Backend Application Layer

### 2.1 Reads — `src/lib/services/tasks-service.ts`

| Function | Returns | Backed by | Cache |
| --- | --- | --- | --- |
| `getPersonalTasks(userId, filters?)` | `{ tasks, hasMore, nextCursor }` | `get_personal_tasks` RPC | Redis **page-1 only** (`task:personal:page1:{userId}`, 30s); cursor/filtered pages hit DB direct |
| `getGroupTasks(filters?, {userId})` | `TaskGroupRow[]` (group + counts + ≤4 assignee avatars) | `get_group_task_summaries` RPC + batch profile fetch | React `cache()` + Redis **unfiltered only** (`task:group-list:{userId}`, 120s) |
| `getGroupSubtasks(groupId, userId)` | `SubtaskWithAssignee[]` | direct select `group_id = … AND task_category = 'group_subtask'`, `due_at ASC NULLS LAST` | React `cache()` (per-request) |
| `getTaskById(taskId)` | `TaskWithMessages \| null` | select + `getTaskRemarks` | none |
| `getTaskRemarks(taskId)` | `TaskRemarkWithAuthor[]` (`created_at ASC`) | select + batch authors | React `cache()` |
| `getTaskGroupById(groupId)` | `TaskGroup \| null` | select `.single()` (RLS gates cross-domain → null) | none |
| `getPersonalTaskTags(userId)` | `string[]` (deduped, sorted) | select `tags` on active personal tasks (GIN partial index) | none |
| `getGiaTasksForUser(userId, role, domain)` | `GiaTask[]` (task + lead identity) | `get_gia_tasks` RPC via admin client | Redis (`task:gia:{userId}:{role}:{domain}`, 60s) |
| `getAllLeadTasks(leadId)` | `Task[]` (active before terminal, then `due_at ASC`) | select via `task_gia_meta!inner` | none |

> **Lead-task readers scope by `task_gia_meta` (meta-presence), NOT a category** — `getAllLeadTasks` (dossier card) `!inner`-joins `task_gia_meta`; `getGiaTasksForUser` wraps the `get_gia_tasks` RPC whose `INNER JOIN task_gia_meta` does the scoping. **`getGiaTasksForUser` / `get_gia_tasks` are KEPT despite the Gia tab being removed** (see §3.2) — now consumed by **Elaya's read tool** (`lib/elaya/tools/registry.ts`) + the dossier reader path, never a tab. `tasks-service.ts` is read-only; all writes go through `actions/tasks.ts` or the lead RPCs.

**Key types:**
```ts
type PersonalTaskCursor   = { due_at: string | null; id: string };
type PersonalTasksResult  = { tasks: Task[]; hasMore: boolean; nextCursor: PersonalTaskCursor | null };
type TaskGroupRow         = TaskGroup & { subtask_count: number; completed_count: number; assignee_previews: AssigneeSlim[] };
type SubtaskWithAssignee  = WithAssignee<Task, AssigneeSlim | null>;
type TaskRemarkWithAuthor = WithAuthor<TaskRemark, AssigneeSlim | null>;
type GiaTask              = Task & { lead_id; lead_first_name; lead_last_name; lead_phone; lead_slug; lead_domain };
```

### 2.2 Mutation cores — `src/lib/services/task-mutations.ts`

Shared, context-free write bodies (Elaya Phase 2 substrate). Each takes an explicit `MutationActor` (**reused from `lead-mutations.ts`, never redefined** — R-01; never derives identity from the session — the caller is the trust boundary, Q-13). Direct writes via the admin client — **no RPC**, unlike the lead cores. Called by server actions today; ready for future Elaya write tools.

- **`canMutateTask(client, caller, task)`** — the authorization gate (mirrors `tasks` UPDATE RLS): admin/founder always; or `assigned_to === caller.id` / `created_by === caller.id`; or manager whose domain matches the task's group domain. Lives here (moved from the action layer so a non-action caller can import it) but is **run by the CALLER before any core** — the cores stay ungated (Q-13). Takes the Supabase client (session client from an action, admin from a tool).
- **`createPersonalTaskCore`** → inserts a `personal` task with **`module: 'core'`** (admin client). If assignee ≠ actor, fires `task_assigned` notification. If `due_at` set, schedules a reminder. Dels assignee's `personal:page1` + actor's dashboard-agent-tasks Redis.
- **`createGroupTaskCore`** → inserts a `task_groups` row. Privileged callers may pick the domain; others locked to their own. Dels creator's `group-list`.
- **`createSubtaskCore`** → inserts a `group_subtask` task with `group_id` and **`module: 'core'`**. Resolves the assignee avatar for client prepend. Fires `task_assigned` if assignee ≠ actor; schedules reminder if due. Dels **both** creator's and assignee's `group-list` (so the assignee sees the parent group).
- **`updateTaskStatusCore`** → updates `status` (+ `completed_at` on `completed`). Cancels the reminder on a terminal status. **Cache dels are driven by a caller-supplied `taskCtx = { taskCategory, hasGiaMeta }`:** keyed on `actor.userId` (deliberately, **not** `assigned_to`) — dels `personalPage1` when personal, and **`giaList` when `hasGiaMeta`** (meta-presence, **not** a category check). A lead follow-up is BOTH `personal` AND `hasGiaMeta`, so it dels **both** keys. The core never queries `task_gia_meta` — the caller fetches it and passes the bool.
- **`updateTaskCore`** → partial update (title/description/priority/status/assignee/due). On a `due_at` change: cancel the old reminder + schedule a new one. No Redis del (intentional).
- **`deleteTaskCore`** → **named invariant:** cancel the Trigger.dev reminder **before** the DB delete (cancel failure non-fatal). DB delete cascades to `task_remarks`. Then the same `taskCtx`-driven cache dels as `updateTaskStatusCore` (`personalPage1` + `giaList` on `hasGiaMeta`).

> **Three named invariants preserved exactly:** (a) the status/delete cache branches key on `actor.userId`, NOT `assigned_to`; the `giaList` del fires on the caller-supplied **`hasGiaMeta`** flag (meta-presence) since the 0138 collapse, NOT a category check; (b) `createSubtaskCore` keeps BOTH the assignee notify and the dual group-cache del; (c) `deleteTaskCore` cancels the reminder BEFORE the DB delete.

### 2.3 Server actions — `src/lib/actions/tasks.ts`

All Zod-validated first line, all `requireProfile()` / `getCurrentProfile()`-gated, all return `{ data, error }`. **The six write actions delegate their write body + side-effects to a shared core in `task-mutations.ts`**; the action keeps Zod → auth → per-resource gate (`canMutateTask`, passed the session client) → `actorFromProfile(caller)` → core → `revalidatePath`.

| Action | Zod schema | Auth / notes |
| --- | --- | --- |
| `createPersonalTaskAction` | `CreatePersonalTaskSchema` | `requireProfile()`; cross-user assign requires manager+ and an **active** assignee |
| `createGroupTaskAction` | `CreateGroupTaskSchema` | `requireProfile(['agent','manager','admin','founder'])`; non-privileged locked to own domain; `revalidatePath('/tasks')` |
| `createSubtaskAction` | `CreateSubtaskSchema` | `requireProfile()`; verifies group exists; agent must match group domain; assignee must be active; `revalidatePath('/tasks')` |
| `updateTaskStatusAction` | `UpdateTaskStatusSchema` | parallel `getCurrentProfile()` + task fetch (`…, task_category, task_gia_meta(task_id)`) → `canMutateTask`; no-op short-circuit if status unchanged; derives `hasGiaMeta` from the `task_gia_meta` join and passes `taskCtx` to the core |
| `updateTaskAction` | `UpdateTaskSchema` | `getCurrentProfile()` + task fetch → `canMutateTask`; `dueAtChanged` flag = presence of `due_at` key (drives reschedule) |
| `deleteTaskAction` | `DeleteTaskSchema` | `requireProfile()`; fetches `task_gia_meta(task_id)` → derives `hasGiaMeta` for `taskCtx`; agent → own created+assigned only; manager+ → unrestricted; preserves cancel-before-delete |
| `updateChecklistAction` | `UpdateChecklistSchema` | `getCurrentProfile()` → `canMutateTask`; writes `attachments`; deliberately not audited; **not cored** |
| `updateTaskTagsAction` | `UpdateTaskTagsSchema` | `getCurrentProfile()` → `canMutateTask`; ≤10 tags × 50 chars; **not cored** |
| `addTaskRemarkAction` | `AddTaskRemarkSchema` | `requireProfile()`; verifies task visibility; calls `add_task_remark_with_status` RPC (atomic remark + optional status); **not cored** |
| `suppressTaskRemarkAction` | `SuppressTaskRemarkSchema` (field `messageId`) | `requireProfile(['admin','founder'])`; writes only `is_suppressed`/`suppressed_by`/`suppressed_at` (admin client); idempotent; **not cored** |
| `deleteGroupTaskAction` | `DeleteGroupTaskSchema` | `requireProfile(['admin','founder'])`; cascades to subtasks; `revalidatePath('/tasks')`; **not cored** |

> **Lead follow-up creation is NOT in this file** — it goes through **`createLeadTaskAction` in `lib/actions/leads.ts`** → `create_lead_gia_task` RPC (the single-writer path). Never add a user-scoped `.insert()` for a lead follow-up or a `group_subtask`.

**Read wrappers** (so client components avoid importing server-only services — A-15): `getGroupSubtasksAction`, `getPersonalTasksAction`, `getPersonalTaskTagsAction`, `getTaskGroupByIdAction`, `getTaskRemarksAction`.

### 2.4 Zod schemas — `src/lib/validations/task-schemas.ts`

Shared enums: `PriorityEnum = ['urgent','high','normal']`, `StatusEnum = ['to_do','in_progress','in_review','completed','error','cancelled']`. (No category enum — category is set by the write path, never user-supplied.)

- **`CreatePersonalTaskSchema`** — `title` (1–255, `sanitizeText`), `description` (opt, sanitized → null), `priority` (default `normal`), `due_at` (ISO offset, nullable), `assigned_to` (uuid, opt), `tags` (≤10 × 1–50 chars, sanitized).
- **`CreateGroupTaskSchema`** — `title`, `description`, `priority`, `due_at`, `domain` (required).
- **`CreateSubtaskSchema`** — `group_id` (uuid), `title`, `description`, `priority`, `due_at`, `assigned_to` (uuid, **required**).
- **`UpdateTaskSchema`** — `taskId` + all task fields optional; `due_at` nullable.
- **`UpdateTaskStatusSchema`** — `taskId` + `status`.
- **`AddTaskRemarkSchema`** — `taskId`, `content` (1–2000, sanitized), `statusChange` (opt).
- **`UpdateChecklistSchema`** — `taskId` + `items: ChecklistItem[]` (`{ id, text 1–500, checked }`).
- **`UpdateTaskTagsSchema`** — `taskId` + `tags` (≤10 × 1–50).
- **`SuppressTaskRemarkSchema`** — `messageId` (uuid). **`DeleteTaskSchema`** — `taskId`. **`DeleteGroupTaskSchema`** — `groupId`.

### 2.5 Constants / enums

**`src/lib/constants/task-types.ts`** — `TASK_TYPES` / `TASK_TYPE_LABELS` (call/whatsapp_message/other, via `defineEnum`) + `TASK_STATUSES` / `TASK_STATUS_LABELS`.

**`src/lib/constants/task-constants.ts`:**
- `TASK_PRIORITY` — `{ urgent: danger, high: warning, normal: tertiary }` with `order` 1/2/3.
- `TASK_STATUS` — per-status `{ label, color, order, pillBg, pillText, remarkBg, remarkColor, remarkBorder }` (all CSS-var tokens, no hex).
- `TASK_CATEGORY` — **only `{ personal, group_subtask }`** (the `gia_followup` entry was removed in the 0138 collapse): label/color/dotColor.
- `TASK_REMARK_STATUS_LABELS` — verbose forms ("started work", "marked complete", …).
- `GROUP_TASK_ACCENT_COLORS` (10 swatches) and `GROUP_TASK_ICONS` (25 Lucide names) — **UI-only, not yet persisted** (no DB columns yet — open item).

---

## 3. Frontend Layer

### 3.1 Routes

- **`/tasks`** — `page.tsx` (thin server orchestrator: reads `?tab`, computes `validTabs`, guards via `getCurrentProfile()`, wraps in `TasksCreateProvider`) → `TasksAsync.tsx` (the only place DB fetches run) → `TasksShell.tsx` (client tab hub). `page.tsx` exports `TaskTab = 'personal' | 'group'`. `?tab=gia` falls back to `'personal'` server-side (no error, no blank page).
- **`/tasks/[id]`** — `page.tsx` → `WorkspaceAsync.tsx` (fetches `getTaskGroupById` + `getGroupSubtasks` in parallel; redirects to `/tasks?tab=group` if RLS denies) → `GroupTaskWorkspace.tsx`.
- **Loading:** `tasks/loading.tsx` + `TasksSkeleton.tsx` (personal/group variants, staggered shimmer) and `[id]/WorkspaceSkeleton.tsx`.

### 3.2 The Two Tabs

Rendered by **`TasksShell`** via a pill `TabSelector` (`indicatorLayoutId="tasks-page-tabs"`). Tab state is URL-driven (`?tab=`). The tab bar is derived from the server-validated `validTabs` array. Each tab keeps its own client-side filter state; switching tabs preserves each tab's filters.

| Tab | Component | Data source | View | Create modal |
| --- | --- | --- | --- | --- |
| **My Tasks** (all roles) | `MyTasksCalendarView` | `getPersonalTasks` (page-1 30s Redis) | Left calendar (280px, actionable-only dots) + right date-grouped list; rows = memoized `CalendarTaskRow` | `CreatePersonalTaskModal` |
| **Group Tasks** (all roles) | `GroupTasksTab` | `getGroupTasks` (120s Redis) | Accordion (one group expanded at a time); subtasks lazy-loaded on first expand; "Open" link → `/tasks/[id]` | `CreateGroupTaskModal` |

> **There is NO Gia tab.** It was removed in the 0138 collapse (2026-06-17). A lead follow-up is a `personal` task carrying a `task_gia_meta` row — **it appears in My Tasks like any other personal task**. The lead dossier card (`LeadTasksCard`) owns lead-task creation via `createLeadTaskAction → create_lead_gia_task`. The components **`GiaTasksTab` / `GiaTaskRow` / `GiaDaySection` / `CreateGiaTaskModal` are DELETED — never recreate them.** The legacy `PersonalTasksTab` was also deleted (2026-06-11, design-audit L-02); `MyTasksCalendarView` is the personal view.

### 3.3 Group Task Workspace (`/tasks/[id]`) — `GroupTaskWorkspace`

Full-page detail for one group. **List view** (flat, sorted priority then `due_at`) **and Board view** toggle, persisted to `localStorage` (`serene:tasks:workspace-view:{groupId}`):

```
Board columns: To Do · In Progress · In Review · Completed · Error/Cancelled (combined)
```

- **Realtime:** subscribes to `tasks` filtered by `group_id` (channel `workspace-subtasks-{groupId}-{mountId}`); merges INSERT/UPDATE into local state, no full refetch.
- Floating **"Add subtask"** FAB → inline panel (title + priority + `DatePicker showTime` + assignee picker) → `createSubtaskAction`.
- Subtask click → `getTaskRemarksAction` → opens `SubTaskModal`. No drag-and-drop; status changes happen inside the modal.

### 3.4 The Task Detail Modal — `SubTaskModal` (loaded via `next/dynamic`)

The canonical detail modal for personal tasks **and** group subtasks (a lead follow-up is just a `personal` task with a meta row, so it opens through the same modal — surfaced in My Tasks and on the lead dossier card, never a separate Gia tab). Two-zone CSS grid (`38% / 62%`, stacks to one column `<md`):

- **Zone A (left):** title + description (+ inline edit mode), **checklist** (`attachments`; first 5 shown + "Show N more"; drag-to-reorder via `@dnd-kit`; always interactive), inline **status** pill-dropdown (6 options) + **priority** pill-dropdown, inline **deadline** picker + **assignee** dropdown, metadata footer, edit-mode Save/Cancel.
- **Zone B (right):** `TaskRemarksPanel` — the remarks timeline + composer.
- Centered overlay, backdrop `var(--overlay-bg)` (no blur), scale 0.96→1 entrance; **`AnimatePresence` lives at the call site** for the exit animation.
- **Delete authorization** in-UI: personal → `created_by === caller AND assigned_to === caller` (or admin/founder); group subtask → any caller with access (or admin/founder).
- Saving title/description/checklist calls `updateTaskAction` / `updateChecklistAction` and does **not** post a remark; status/priority changes fire optimistic actions.

### 3.5 Remarks — `TaskRemarksPanel`

- Seeded from `initialRemarks` (no mount fetch). Subscribes to `task_remarks` by `task_id` (channel `task-remarks-{taskId}-{mountId}`; `mountId` from `useId()` prevents Strict-Mode double-mount collisions; `seenIds` ref dedups).
- Timeline oldest→newest, auto-scroll to bottom. Each remark: avatar + name + timestamp + optional status chip (`TASK_REMARK_STATUS_LABELS` with semantic colors).
- Composer: textarea + 6 toggleable status-change chips → `addTaskRemarkAction` (optimistic at 0.6 opacity, confirmed on Realtime echo, rolled back + toast on error).
- Suppressed remarks render as italic "This remark was removed." Empty state: Playfair italic "No updates yet."

### 3.6 Creation Modals

- **`CreatePersonalTaskModal`** — title · due (Today/Tomorrow/Next week presets + picker) · priority chips · tags (≤10, Enter/comma) · collapsible notes. Composes `TaskFormFields`.
- **`CreateGroupTaskModal`** (`next/dynamic`, behind `useMountOnFirstOpen`) — two-column live-preview + form: title · description · domain (`<select>`) · accent-color swatch (10) · icon picker (25) · priority · due (with time) · add-members search. **`accent_color`, `icon_key`, and members are UI-only** (no DB columns / no `task_group_members` table yet — open item).
- **`AssigneePickerModal`** — nested modal (`--z-modal-nested`, above `SubTaskModal`), portaled to body; domain tabs + client-side search + single select.

> **`CreateGiaTaskModal` is DELETED.** Lead follow-up creation lives on the lead dossier (`createLeadTaskAction`), not a task-page modal.

### 3.7 Shared form fields — `src/components/ui/TaskFormFields.tsx`

The one library every task-create form composes (never re-inlined — dry-audit H-3): `FieldLabel`, `FieldError`, `FormChip`, `PriorityChipRow` (`chip`/`dot` variants), `DueDateField` + `resolveDueAt` (IST end-of-day via `toISTEndOfDay`), `TaskTypeField`.

### 3.8 Atomic components & hooks

- `TaskCompletionCircle` — 24px toggle (hollow → check), pairs with `useTaskCompletionToggle`.
- `TaskStatusIcon` — canonical status glyph (Clock/PlayCircle/RefreshCw/CheckCircle2/AlertCircle/XCircle), colors from `TASK_STATUS`.
- `AddTaskButton` (`MotionButton`, label changes per tab), `TasksCreateContext` (broadcasts the create trigger from the header button to the active tab), `TasksFilters` (per-tab `FilterBar` config — **all filtering is client-side** via `task-client-filters.ts`).
- **`useTaskCompletionToggle`** — optimistic completed↔to_do toggle with rollback. Used by both tabs + the workspace.

### 3.9 Filters (all client-side)

| Tab | Filter dimensions |
| --- | --- |
| My Tasks | search (title+desc) · status (multi) · priority (multi) · tags (multi, seeded from `initialTags`) |
| Group Tasks | search (group title) · status · priority · domain (admin/founder only) · progress (all/in-progress/complete/no-subtasks) |

---

## 4. Assignment Model

**No round-robin** — assignment is **manual and role-gated.**

- **Personal task:** creator self-assigns, or a manager+ assigns to any active user (cross-domain allowed). Assignee must exist and be `is_active`.
- **Group subtask:** the creator sets `assigned_to` explicitly at creation (cross-domain allowed). If an **agent** creates the subtask, the group must be in the agent's domain.
- **Lead follow-up:** created by SLA/Revival automation or the lead dossier; assigned to the lead's owning agent via `create_lead_gia_task` / `createLeadTaskCore` (lead layer), not hand-assigned in the task UI.
- **Reassignment:** through `updateTaskAction` (`assigned_to` field) or the `SubTaskModal` assignee dropdown / `AssigneePickerModal`, gated by `canMutateTask`.

---

## 5. Notifications

Four task notification events, each gated by the per-user notification-control plane (migration 0133, "Seam A" via `createNotification`'s `notificationKey`). `createNotification` also fans out Web Push (`dispatchPush`) for every event with zero call-site edits.

| Event | Fired by | Recipient | Type / key | Channels |
| --- | --- | --- | --- | --- |
| **task_assigned** | `createPersonalTaskCore`, `createSubtaskCore` (when assignee ≠ actor) | the assignee | `task_assigned` | in-app + Web Push |
| **task_due** | `sendTaskReminderTask` at `due_at` | the assignee | `task_due` | in-app + Web Push (all categories) |
| **task_due_reminder** (WhatsApp, lead follow-ups only) | `sendTaskReminderTask` → `sendTaskDueReminderNotification` | the agent | Gupshup template; logged `task_due_reminder` | WhatsApp (policy TASK-01A, `module='gia'` + active status) |
| **task_overdue_manager** | `checkTaskOverdueTask` at `due + threshold` | domain managers | `task_overdue_manager` | in-app + WhatsApp (policy TASK-01B) |

`notifications.type` CHECK and `whatsapp_notification_logs.type` CHECK were expanded in 0017 and 0113 to carry these plus the SLA-breach types. `task_assigned`/`task_due` are mutable per-user controls; the WhatsApp escalations ride the SLA policy active/channel toggles.

---

## 6. Trigger.dev Jobs — `src/trigger/task-reminders.ts`

- **`sendTaskReminderTask`** (id `send-task-reminder`, ≤3 retries) — fires at `due_at`. Idempotency key + tag `task-reminder-{taskId}`. Sends the in-app `task_due` notification (all categories). If the task is a lead follow-up (`module='gia'`) + TASK-01A active: sends the WhatsApp reminder **and arms** the overdue check.
- **`checkTaskOverdueTask`** (id `check-task-overdue`, ≤3 retries) — fires at `due_at + threshold`. **Clearing events** (exit silently): status `completed`/`cancelled`, `due_at` moved, or lead activity after due. Else stamps `overdue_at` **exactly once** (`UPDATE … WHERE overdue_at IS NULL`) and escalates to domain managers (in-app + WhatsApp).
- **`scheduleTaskReminder(taskId, dueAt, assignedTo)`** — no-op if `dueAt ≤ now`; idempotent via tag. Called by `createPersonalTaskCore`, `createSubtaskCore`, `updateTaskCore` (on due change).
- **`cancelTaskReminder(taskId)`** — cancels all DELAYED/QUEUED runs for the tag (due reminder AND pending overdue check — same tag); idempotent. Called by `deleteTaskCore`, `updateTaskStatusCore` (terminal status), `updateTaskCore` (due change). **Cancel-before-delete is a named invariant.**

---

## 7. Caching

| Read | Type | Key | TTL | Invalidated by |
| --- | --- | --- | --- | --- |
| `getPersonalTasks` (page 1, unfiltered) | Redis | `task:personal:page1:{userId}` | 30s | personal create/status/delete (keyed on the affected user) |
| `getGroupTasks` (unfiltered) | Redis | `task:group-list:{userId}` | 120s | group + subtask create (creator **and** assignee) |
| `getGiaTasksForUser` | Redis | `task:gia:{userId}:{role}:{domain}` | 60s | lead-task status/delete on **meta-presence** (`hasGiaMeta`) — so Elaya's reads stay fresh; TTL-only backstop |
| `getGroupSubtasks`, `getTaskRemarks` | React `cache()` | per-request | — | — |

> The three Redis keys are `task:personal:page1`, `task:group-list`, `task:gia` (in `src/lib/constants/redis-keys.ts`). The older `task:subtasks` / `task:remarks` keys were removed in a 2026-06 cache cleanup; `getGroupSubtasks`/`getTaskRemarks` now memoise per-request via React `cache()` only. **Lead-task (`task:gia`) invalidation is meta-presence-driven** — `updateTaskStatusCore`/`deleteTaskCore` del it when the touched task is a lead follow-up (`personal` + a `task_gia_meta` row, detected via the caller's `hasGiaMeta` flag, never a category check). New lead tasks appear within the 60s TTL (creation goes through `createLeadTaskAction` → `create_lead_gia_task`).

---

## 8. End-to-End Workflows

**Personal task:** create (`CreatePersonalTaskModal` → `createPersonalTaskAction` → `createPersonalTaskCore`, `module='core'`) → optional `task_assigned` notify + reminder scheduled → appears in My Tasks calendar → progress via `SubTaskModal` status pill or completion circle (`updateTaskStatusAction`) → remarks accumulate → `completed` sets `completed_at`, cancels the reminder, drops it from the active view.

**Group + subtask:** create group (`CreateGroupTaskModal` → `createGroupTaskAction`) → open workspace → add subtasks (`createSubtaskAction`, each assigned, `module='core'`) → each assignee sees the parent group (dual cache-del) + gets a `task_assigned` notify → subtasks progress through the board columns via the modal → `get_group_task_summaries` rolls up `subtask_total`/`completed`.

**Lead follow-up:** SLA cadence / Lead Revival / lead dossier (`createLeadTaskAction`) → `create_lead_gia_task` RPC creates a `personal` task with `module='gia'` + `task_gia_meta` row **atomically** → reminder armed → at due, in-app + (TASK-01A) WhatsApp reminder to the agent → if still open at due+threshold, `overdue_at` stamped once and managers escalated (TASK-01B). **Shows in the My Tasks tab** (as a personal task) and on the lead dossier card — there is no separate Gia surface. Elaya's read tool can list these via `get_gia_tasks`.

**Remarks & accountability:** every status change can ride a remark (`add_task_remark_with_status`, atomic). Remarks are append-only and Realtime; admins/founders can only **suppress** (soft-hide), never delete. The `tasks_audit` trigger independently logs title/description/status/priority/due/assignee changes to `task_audit_log` (manager+ readable).

---

## 9. Open Items / TODOs

- `CreateGroupTaskModal` **accent color**, **icon**, and **member chips** are UI-only — no `accent_color`/`icon_key` columns on `task_groups` and no `task_group_members` table yet.
- INSERT/DELETE RLS (0094) exists as defence-in-depth but app writes still go through `adminClient` + `canMutateTask`.
- `task_module` reserves `'sia'` for a future ticket module (sole writer will be `create_lead_sia_task`); nothing writes it yet.

### Deleted — never recreate
- `task_category = 'gia_followup'` (collapsed in 0138 — a lead task is `personal` + a `task_gia_meta` row + `module='gia'`).
- `GiaTasksTab`, `GiaTaskRow`, `GiaDaySection`, `CreateGiaTaskModal` (Gia tab removed, 0138).
- `PersonalTasksTab` (deleted 2026-06-11; `MyTasksCalendarView` is the personal view).
- The `task:subtasks` / `task:remarks` Redis keys (2026-06 cache cleanup).

---

## 10. File Map

**DB:** `supabase/migrations/` — 0003 (tasks, task_gia_meta), 0017 (OS Tasks: task_groups, category/priority/status, group_id), 0020/0058 (summaries RPC + flat visibility), 0021 (audit log + trigger), 0022 (task_remarks), 0023 (checklist `attachments`), 0024 (tags), 0025/0026 (perf indexes + `get_personal_tasks` cursor), 0035 (remark+status RPC), 0054/0055/0056 (lead-task RPCs), 0057 (task_type `other`), 0086 (status default fix), 0094 (insert/delete RLS), 0102 (gia RPC EXECUTE revoke), 0113 (overdue + notification types), 0133 (notification controls), **0138 (collapse `gia_followup` category → 2 structural values; `module` free-text → `task_module` enum; repoint `create_lead_gia_task` / `update_lead_status` / `get_gia_tasks` off the retired literal)**.

**Services:** `tasks-service.ts` (reads), `task-mutations.ts` (write cores + `canMutateTask`).
**Actions:** `lib/actions/tasks.ts` (+ `lib/actions/leads.ts` `createLeadTaskAction` for lead follow-ups).
**Validations:** `lib/validations/task-schemas.ts`.
**Constants:** `lib/constants/task-types.ts`, `lib/constants/task-constants.ts`, `lib/constants/redis-keys.ts`.
**Jobs:** `src/trigger/task-reminders.ts`.
**Routes:** `src/app/(dashboard)/tasks/{page,TasksAsync,TasksShell,TasksSkeleton,loading}.tsx`, `tasks/[id]/{page,WorkspaceAsync,WorkspaceSkeleton}.tsx`.
**Components:** `src/components/tasks/` — `MyTasksCalendarView`, `GroupTasksTab`, `GroupTaskWorkspace`, `SubTaskModal`, `TaskRemarksPanel`, `AssigneePickerModal`, `CreatePersonalTaskModal`, `CreateGroupTaskModal`, `TaskCompletionCircle`, `TaskStatusIcon`, `AddTaskButton`, `TasksCreateContext`, `TasksFilters`; plus `src/components/ui/TaskFormFields.tsx`.
**Hooks:** `src/hooks/useTaskCompletionToggle.ts`.
**Docs:** `docs/pages/tasks.md` (spec + deep dive), `docs/architecture/database.md`, `src/app/(dashboard)/tasks/CLAUDE.md`, `src/components/tasks/CLAUDE.md`.
