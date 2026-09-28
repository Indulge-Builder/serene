# Tasks: Page Spec

> **Purpose:** spec for `/tasks` (the My Tasks / Group Tasks hub) and `/tasks/[id]` (the group workspace): the whole task system, including lead follow-ups, tasks spun off a Sia ticket, and repeat reminders.
> **Audience:** engineers. · **Source-of-truth scope:** the task system (tables, RPCs, services, cores, actions, tabs, modals, flows, invariants). Schema narrative: `../architecture/database.md`; reminder-job mechanics: `../integrations/trigger-dev.md`; the `task_events` stream and the oversight readers: `./oversight.md`; tickets (the source of ticket tasks): `./tickets.md`.
> **Last verified:** 2026-09-26 against `src/app/(dashboard)/tasks/**`, `src/components/tasks/*`, `src/components/ui/TaskFormFields.tsx`, `src/lib/services/{tasks-service,task-mutations,gia-task-links,task-events,ticket-mutations}.ts`, `src/lib/actions/tasks.ts`, `src/lib/utils/task-client-filters.ts`, `src/lib/constants/redis-keys.ts`, `src/lib/constants/route-permissions.ts`, `src/trigger/task-reminders.ts`, `src/lib/elaya/tools/write-registry.ts`, and migrations 0138, 0144, 0145, 0149, 0160, 0195, 0210, 0223, 0232.

## 1. Purpose

One `public.tasks` table carries **two structural categories**, set by `task_category`:
**personal** (one person's to-do) and **group_subtask** (a row under a `task_groups` parent).
`task_category` describes structure only. It never says whether a task belongs to a lead.

- **A lead follow-up** is a `personal` task that **has a `gia.task_gia_meta` row**: that row *is*
  the task → lead link. `tasks.module` (the native `task_module` enum: `gia`, `sia`, `core`)
  records where a task came from. **Single-writer invariant:** a `task_gia_meta` row exists iff
  the task is a lead follow-up, and `module = 'gia'` iff that row exists. `create_lead_gia_task`
  (and the nurturing branch of `update_lead_status`) is the only writer of both, always together.
  Every other insert writes `module = 'core'` and no meta row. Detect a lead task by the meta row,
  never by category. Since the schema move (0210) the meta row lives in schema `gia` and the task
  in `public`, so the link is always read through `src/lib/services/gia-task-links.ts` (§8.3a).
- **A ticket task** is a `personal` task created from a Sia ticket's Tasks card. It gets a
  `public.task_ticket_meta` row (0195), the tag `ticket` and the description `<ticket no> ·
  <ticket title>`, and otherwise behaves like any personal task: same core, same reminders, same
  My Tasks calendar. Its `module` stays `core`; nothing writes `module = 'sia'` today.
- **Repeat reminders** (0232): a task can nudge its assignee again and again ("remind Karan every
  3 hours"), every 30 minutes to 24 hours, for at most 3 days. Only Elaya sets them today (§8.9).

Every task keeps an append-only `task_remarks` thread; a status change can ride a remark through
`add_task_remark_with_status`. **Every mutation also writes one `task_events` row** (0144): the
feed behind the `/oversight` live rails. The cores emit it through `emitTaskEvent`
(`services/task-events.ts`), best-effort and non-fatal; the same helper also writes the matching
`activity_events` row (`task_created`, `task_completed`) for the mobile Activity room. Contract:
`./oversight.md`.

## 2. Who sees it

- `/tasks` is in **every** domain's `DOMAIN_ROUTE_MAP` entry, including concierge (Tasks is one of
  the eight rooms of the concierge nav, 2026-09-25) and finance, marketing, tech and business. It
  is not in `ALWAYS_ALLOWED_PREFIXES`. It is in the founder's curated sidebar.
- The page redirects a missing profile to `/login` and a guest to `/dashboard`.
- Row visibility is RLS: an agent sees tasks they are assigned to or created; manager, admin and
  founder see every task (the manager SELECT policy is role-only, not domain-scoped). Group
  visibility is data-driven: the creator, or anyone assigned a subtask in the group (0058). An
  agent never sees a colleague's subtasks inside a shared group.

Full operation × role matrix: Deep dive §8.17.

## 3. Data sources

| Layer | Key items |
| ----- | --------- |
| Services (reads) | `tasks-service.ts`: `getPersonalTasks` (the cursor RPC; Redis page 1), `getCompletedTasks` (history, keyset), `getGroupTasks` (Redis 120s) and its admin twin `getGroupTasksForUser` (Elaya), `getGroupSubtasks`, `getTaskRemarks`, `getTaskGroupById`, `getPersonalTaskTags`, `getGiaTasksForUser` (Elaya's `get_my_tasks`), `getAllLeadTasks` (the dossier task card), `getDomainTaskSummary` (the mobile Tasks room) |
| Link reads | `gia-task-links.ts`: `getTaskIdsForLead`, `getGiaLinksForTasks`, `isLeadTask`: THE only reads across `public.tasks` ↔ `gia.task_gia_meta` |
| Cores (writes) | `task-mutations.ts`: `createPersonalTaskCore`, `createGroupTaskCore`, `createSubtaskCore`, `updateTaskStatusCore`, `updateTaskCore`, `deleteTaskCore`, `setTaskNudgeCore`, plus `canMutateTask` and `isAssigneeActive`. Actions and Elaya's write tools call the same cores. `ticket-mutations.ts` `createTicketTaskCore` wraps `createPersonalTaskCore` |
| Actions | `tasks.ts`: create personal / group / subtask, update status, update task, update checklist, delete task, delete group, add remark, the reads, `getCompletedTasksAction`. All `{ data, error }` |
| RPCs | `get_personal_tasks`, `get_group_task_summaries` (+ `get_group_task_summaries_for_user`, 0149), `get_gia_tasks`, `add_task_remark_with_status`, `create_lead_gia_task`, `get_domain_task_summary` (0160) |
| Jobs | `src/trigger/task-reminders.ts`: `send-task-due-soon`, `send-task-reminder`, `check-task-overdue`, `send-task-nudge` (`../integrations/trigger-dev.md`) |
| Cache | Redis `task:*` and `dashboard:agent-tasks:*` (§8.4c; `../architecture/caching.md`) |

## 4. Components

`TasksCreateProvider` + `CondensingPageHeader` (title "Tasks", with `CompletedTasksButton`,
`AddTaskButton` and the `PageControls` bell) · `TasksAsync` (the RSC seed) · `TasksShell` (tabs,
filters, count) · `TasksFilters` (a client-state `<FilterBar>`) · the two tabs:
`MyTasksCalendarView` and `GroupTasksTab` · `GroupTaskWorkspace` (`/tasks/[id]`, list or board,
Realtime) · `SubTaskModal` + `TaskRemarksPanel` + `AssigneePickerModal` + `TaskStatusIcon` +
`TaskCompletionCircle` · the create modals (`CreatePersonalTaskModal`, `CreateGroupTaskModal`),
both composing `src/components/ui/TaskFormFields.tsx` · `CompletedTasksButton` +
`CompletedTasksModal` (the history). Component contracts: `src/components/tasks/CLAUDE.md` (partly
stale, §7). Full inventory: Deep dive, end.

The Gia tab (`GiaTasksTab`, `GiaTaskRow`, `GiaDaySection`, `CreateGiaTaskModal`) was deleted on
2026-06-17. Lead follow-ups show in the My Tasks calendar and on the lead's task card. `?tab=gia`
falls back to `personal`.

## 5. States

- **Loading:** `tasks/loading.tsx` and `tasks/[id]/loading.tsx` (the same `WorkspaceSkeleton` the
  workspace's Suspense uses); `TasksSkeleton` per tab inside the page's Suspense. Opening a task
  shows `LoadingVeil` (a scrim with the spinning mark) while its remarks load, because the modal
  mounts only once they arrive.
- **Empty:** `<EmptyState>` everywhere (the 2026-09-25 one anatomy). My Tasks with nothing: a
  framed "A clear slate…" empty; a filtered view with nothing: framed; a calendar day with nothing:
  the inline "Hooray.". Group tab: framed; an expanded group with no subtasks: inline "No subtasks
  yet.". Workspace list: framed. Completed modal: inline. Remarks: inline "No updates yet.".
- **Error:** `{ error }` → toast; optimistic inserts roll back (remarks, status, checklist).
- **Delete:** confirmed deletes are optimistic with an **Undo** toast; the server delete runs only
  when the toast times out (§8.13).

## 6. Invariants

Deep dive §8.19. The short list: remarks are append-only (suppression is the only UPDATE the RLS
allows); `task_remarks.status_change` mirrors `tasks.status`; the audit trigger never logs
`attachments`; reminders are idempotent by key and swept by tag; the single-writer rule for lead
follow-ups; the `public` ↔ `gia` link is read only through `gia-task-links.ts`, never a
PostgREST embed; `getPersonalTasks` output is never re-sorted in JS; Realtime channel names carry
a mount nonce.

## 7. Open items

- **Repeat reminders have no UI.** Only Elaya's `create_personal_task` and `update_task` set them.
  There is no server action and nothing on the task modal shows that a task repeats.
- **Ticket tasks look like any task.** Nothing in My Tasks marks a task as coming from a ticket
  beyond the `ticket` tag and the description. A failed `task_ticket_meta` insert is only logged.
  `module = 'sia'` exists in the enum but nothing writes it.
- `CreateGroupTaskModal`'s accent colour and icon are UI-only (no `task_groups` columns yet).
- A failed `cancelTaskReminder` does not stop a delete (`deleteTaskCore` logs and continues), so a
  reminder run can outlive its task and fail quietly.
- Stale code-adjacent notes: `src/components/tasks/CLAUDE.md` (no `onDeferDelete`, still lists a
  `composerPlaceholder` prop), `src/app/(dashboard)/tasks/CLAUDE.md` (still lists `task:subtasks`
  and `task:remarks` keys), and the `getAllLeadTasks` code comment (still describes the old
  `task_gia_meta!inner` embed).
- Reminders armed from the website depend on a valid `TRIGGER_SECRET_KEY` on Vercel; on
  2026-09-21 it was found invalid, so due reminders armed from the site were silently not
  scheduled. It works again: the 2026-09-26 engine health check shows reminders and SLA timers
  firing (`../integrations/trigger-dev.md`).

---

## 8. Deep dive

### 8.1 Data model

#### 8.1a `public.tasks`

| Column | Type | Null | Default | Notes |
| ------ | ---- | ---- | ------- | ----- |
| `id` | uuid | no | `gen_random_uuid()` | PK |
| `assigned_to` | uuid | no | | FK → `profiles(id)` |
| `created_by` | uuid | no | | FK → `profiles(id)` |
| `module` | `task_module` | no | `'core'` | `gia` = lead follow-up (iff a `task_gia_meta` row), `sia` = reserved, `core` = everything else (0138) |
| `task_type` | text | no | | `call`, `whatsapp_message`, `other` (0057) |
| `title` | text | no | | |
| `description` | text | yes | | |
| `status` | text | no | `'to_do'` | CHECK, six values: `to_do`, `in_progress`, `in_review`, `completed`, `cancelled`, `error`. Default fixed from a stale `'pending'` in 0086 |
| `priority` | text | no | `'normal'` | `urgent`, `high`, `normal` |
| `task_category` | text | no | `'personal'` | `personal`, `group_subtask` (0138 dropped `gia_followup`) |
| `group_id` | uuid | yes | | FK → `task_groups(id)` ON DELETE CASCADE |
| `due_at` | timestamptz | yes | | |
| `completed_at` | timestamptz | yes | | set when status becomes `completed` |
| `overdue_at` | timestamptz | yes | | stamped exactly once by `check-task-overdue` (0113); not a status |
| `attachments` | jsonb | no | `'[]'` | the checklist; CHECK it is an array (0023) |
| `tags` | text[] | no | `'{}'` | GIN partial index (0024) |
| `nudge_every_minutes` | integer | yes | | 0232; CHECK 30 to 1440; NULL = no repeat |
| `nudge_until` | timestamptz | yes | | 0232; stop repeating after this |
| `nudge_count` | integer | no | `0` | 0232; how many repeats went out |
| `created_at` / `updated_at` | timestamptz | no | `now()` | |

**Indexes:** `idx_tasks_assigned_to` `(assigned_to, due_at)` on open rows; `idx_tasks_module`
`(module, assigned_to)` on open rows; `idx_tasks_agent_active` `(assigned_to, task_category,
due_at)` on open rows; `idx_tasks_category`; `idx_tasks_group_id`; `idx_tasks_priority`;
`idx_tasks_tags_gin` (personal only); `idx_tasks_tags_active`; `idx_tasks_group_assignee`
`(group_id, assigned_to)` on subtasks (0058).

**Triggers:** `tasks_updated_at` (BEFORE UPDATE); `tasks_audit` (AFTER UPDATE,
`log_task_changes()`), which watches only `title`, `description`, `status`, `priority`, `due_at`,
`assigned_to`. It never logs `attachments` (a checklist tick would flood the log), `tags`, the
category, the group, `module`, the timestamps or the nudge columns.

**RLS** (every role check wrapped in `(SELECT get_user_role())` since 0088, evaluated once per
statement):

| Policy | Command | Rule |
| ------ | ------- | ---- |
| `tasks_agent_select` | SELECT | agent and (`assigned_to = auth.uid()` or `created_by = auth.uid()`) (0051) |
| `tasks_manager_admin_founder_select` | SELECT | manager, admin, founder (all rows) |
| `tasks_update` | UPDATE | agent on own assignment; manager+ all |
| `tasks_insert` | INSERT | `created_by = auth.uid() AND assigned_to = auth.uid() AND task_category = 'personal'` (0094) |
| `tasks_delete` | DELETE | agent: own personal task, `to_do` or `in_progress` (0094) |
| `tasks_delete_privileged` | DELETE | manager, admin, founder (0094) |

No migration after 0156 changed these policies. The app writes through the admin client in the
cores, with the action enforcing what RLS would (`canMutateTask`, role checks, the view-equals-post
gate); the INSERT and DELETE policies are defence in depth. A lead follow-up cannot be inserted
directly at all: no policy can also write its `gia.task_gia_meta` row and `module = 'gia'`, which
only `create_lead_gia_task` does.

#### 8.1b `public.task_groups`

Columns: `id`, `title`, `description`, `priority`, `status` (the same six values), `due_at`,
`created_by`, `domain` (`app_domain`; `b2b` became `business` in 0202), `created_at`,
`updated_at`. RLS (0058, flat): SELECT and UPDATE for the creator or anyone assigned a subtask in
the group; INSERT for any signed-in user; DELETE for the creator only. No `get_user_role()` or
`get_user_domain()` in these policies. Realtime is not enabled on this table.

#### 8.1c `public.task_remarks`

Columns: `id`, `task_id` (CASCADE), `author_id`, `content` (sanitised by the action),
`status_change` (a CHECK that must mirror `tasks.status` exactly), `is_suppressed`,
`suppressed_by`, `suppressed_at`, `created_at`.

RLS: SELECT and INSERT when the caller can see the task (assignee, creator, or manager+), INSERT
only as yourself; UPDATE (suppression) for admin/founder; **no DELETE policy, ever**. The action
that used suppression was removed on 2026-07-02; any future one may write only the three
suppression columns, enforced in the action (RLS cannot restrict columns). Realtime is enabled.

#### 8.1d `public.task_audit_log`

`id`, `task_id` (CASCADE), `changed_by`, `field_name`, `old_value`, `new_value`, `changed_at`.
Written only by the trigger. SELECT for manager, admin, founder.

#### 8.1e `gia.task_gia_meta`

`task_id` (PK, FK → `public.tasks` CASCADE), `lead_id` (FK → `gia.leads`), `call_outcome`. Moved
to `gia` by 0210 with its SELECT policy intact. **This row is the task → lead link.** Because the
task lives in `public` and the link in `gia`, PostgREST cannot embed one in the other (PGRST200):
every read goes through `gia-task-links.ts` (§8.3a). The Elaya analyst's `elaya_read.tasks` view
(0223) left-joins it for the same reason.

#### 8.1f `public.task_ticket_meta`

`task_id` (PK, FK → `public.tasks` CASCADE), `ticket_id` (FK → `sia.tickets` CASCADE), created by
0195 on the `task_gia_meta` pattern. RLS: SELECT when the caller may reach the ticket's queendom.
Written only by `createTicketTaskCore` (admin client).

#### 8.1g Notifications from tasks

The reminder pipeline fires for **every** open task, not only lead follow-ups (config-driven by the
TASK-01A and TASK-01B `sla_policies`; mechanics in `../integrations/trigger-dev.md`).

| In-app type | Created by | Recipient | `action_url` |
| ----------- | ---------- | --------- | ------------ |
| `task_assigned` | `createPersonalTaskCore`, `createSubtaskCore` when the assignee is not the actor; plus the WhatsApp "assigned to you" template (`sendTaskAssignedNotification`, 0153). Also every repeat nudge (§8.9) | assignee | `/tasks` |
| `task_due` | `send-task-reminder` at `due_at` | assignee | `/tasks` |
| `task_overdue_manager` (lead task) | `check-task-overdue` at `due_at` + TASK-01B `threshold_minutes`, with no clearing event | the lead's domain managers | `/leads/[id]` |
| `task_overdue_manager` (other task) | the same job, non-lead branch | the assignee's manager | `/tasks` |

WhatsApp pings also go to the assignee 30 minutes before the deadline (`send-task-due-soon`) and at
it, for every open task with a phone. `notifications.action_url` must be relative (CHECK
`NOT LIKE 'http%'`). Whether each one reaches a person is their choice on `/profile`
(`task_assigned`, `task_due`, `task_overdue_manager` categories).

### 8.2 Database RPCs

All live in `public`. Since 0210 their `search_path` is `public, gia`, so a function body can name
the moved tables. None is called through `giaDb()`.

#### 8.2a `get_personal_tasks` (0025, 0026; return widened in 0145)

The sort PostgREST cannot express, plus a composite keyset cursor: `due_at ASC NULLS LAST` →
priority (urgent 1, high 2, normal 3) → `id ASC`, on every page.

- **Returns** the full `tasks` row plus four nullable lead columns (`lead_id`, `lead_first_name`,
  `lead_last_name`, `lead_slug`) through a LEFT JOIN on `task_gia_meta` → `leads`, so My Tasks can
  name a follow-up's lead.
- **Parameters:** `p_user_id` (the owner; the RPC has no `auth.uid()` inside, so the caller must
  pass the right id), `p_status`, `p_priority`, `p_tags` (`@>`), `p_due_before`, `p_limit`
  (default 51 = page + 1), `p_cursor_id`, `p_cursor_due_at`, `p_cursor_has_due_at` (all null =
  page 1).
- `STABLE SECURITY DEFINER`.

Because it scopes only on `p_user_id`, a sessionless caller (Elaya on WhatsApp) may pass the admin
client (`getPersonalTasks(userId, filters, injectedClient)`).

#### 8.2b `get_group_task_summaries` (0020, fixed 0042, rewritten 0058)

Filters on the group row (`p_status`, `p_priority`); returns every `task_groups` column plus
`subtask_total`, `subtask_completed`, `assignee_ids`. Visibility: creator or subtask assignee,
from the caller's JWT. The service slices `assignee_ids` to four and batch-loads their profiles.
**`get_group_task_summaries_for_user`** (0149) is the admin-callable twin with an explicit user id,
used by Elaya through `getGroupTasksForUser`.

#### 8.2c `get_gia_tasks` (0055, 0056)

Lead follow-ups for a user (agent: assigned to them; manager and up: the lead's domain), joined to
lead fields, active first. EXECUTE was revoked from `authenticated` in 0102, so the service calls
it with the admin client. **Its only caller today is Elaya's `get_my_tasks` tool**
(`getGiaTasksForUser`); the lead dossier uses `getAllLeadTasks`.

#### 8.2d `add_task_remark_with_status` (0035, fixed 0051)

One transaction: an optional `tasks.status` update (stamping `completed_at`, firing the audit
trigger), then the `task_remarks` insert. It has no `auth.uid()` gate; `addTaskRemarkAction` first
reads the task with the session client (if RLS shows it, the caller may post), then calls the RPC
with the admin client.

#### 8.2e `create_lead_gia_task` (0054, updated 0138)

**The sole writer of a lead follow-up**: the `personal` task with `module = 'gia'` and its
`task_gia_meta` row, in one transaction. The nurturing branch of `update_lead_status` is the only
other place that writes either.

#### 8.2f `get_domain_task_summary` (0160)

Per-agent open and overdue counts for one domain, called through `callAdminRpc` by
`getDomainTaskSummary()` for the mobile Tasks room (`../modules/mobile-ops.md`).

### 8.3 Services: `tasks-service.ts`

| Function | Reads | Cache | Used by |
| -------- | ----- | ----- | ------- |
| `getPersonalTasks(userId, filters?, injectedClient?)` | `get_personal_tasks` | Redis page 1 only (`task:personal:page1:{userId}:v2`, 30s), unfiltered | `TasksAsync`, `getPersonalTasksAction`, Elaya |
| `getCompletedTasks` | keyset `completed_at DESC NULLS LAST, id DESC`, `COMPLETED_TASKS_PAGE_SIZE = 30` | none | `getCompletedTasksAction` |
| `getGroupTasks(filters?, cacheHint?)` | `get_group_task_summaries` + batch profiles | React `cache()` + Redis `task:group-list:{userId}` 120s (unfiltered) | `TasksAsync` |
| `getGroupTasksForUser(userId)` | `get_group_task_summaries_for_user` (admin) | none | Elaya |
| `getGroupSubtasks(groupId, userId)` | PostgREST + batch assignees | React `cache()` only | `getGroupSubtasksAction`, `WorkspaceAsync` |
| `getTaskRemarks(taskId)` | PostgREST ascending + batch authors | React `cache()` only | `getTaskRemarksAction` |
| `getTaskGroupById` | one row, RLS | none | the workspace |
| `getPersonalTaskTags(userId)` | active personal tasks, distinct tags | none | `getPersonalTaskTagsAction` |
| `getGiaTasksForUser(userId, role, domain)` | `get_gia_tasks` (admin) | Redis `task:gia:{u}:{role}:{domain}` 60s | Elaya `get_my_tasks` |
| `getAllLeadTasks(leadId)` | `getTaskIdsForLead` (gia), then `tasks` `.in('id', ids)`, sorted active-first in JS | none | the dossier's task card |
| `getDomainTaskSummary(domain)` | `get_domain_task_summary` | none | the mobile Tasks room |

`PERSONAL_TASKS_PAGE_SIZE = 50`; `filters.limit` may raise it to at most 500. On an RPC error the
reads log and return an empty result. `getTaskById` no longer exists.

#### 8.3a `gia-task-links.ts`: the one read across the schema line

| Function | Does | Callers |
| -------- | ---- | ------- |
| `getTaskIdsForLead(client, leadId, { callOutcome? })` | lead → its task ids (optionally only those with a given call outcome) | `getAllLeadTasks`, the SLA dedup guard (`sla-service`), the revival guard (`revival-service`) |
| `getGiaLinksForTasks(client, taskIds)` | task ids → the lead link and the lead row, chunked by 200 | `getOverdueGiaTasks` (escalations), the dashboard agent-tasks widget |
| `isLeadTask(client, taskId)` | one task: is it a lead follow-up? A query error answers **true** (the flag only adds a spare Redis delete) | `updateTaskStatusAction`, `deleteTaskAction`, Elaya's `update_task_status` and `delete_task` |

Never re-add a `task_gia_meta(...)` embed on a `public.tasks` query. On 2026-09-17 to 09-19 that
embed made every status change and every delete fail with "Task not found" (the read errored with
PGRST200 and came back empty) until `isLeadTask` replaced it.

### 8.4 Server actions and cores

#### 8.4a `tasks.ts`

The write actions keep the request-context shell (Zod → `requireProfile` → the per-resource gate
→ `actorFromProfile(caller)` → the core → `revalidatePath`); the cores own the write and every side
effect (reminder, notification, Redis, `task_events`). Elaya's write tools call the same cores:
`create_personal_task`, `create_group_task`, `create_subtask`, `update_task_status`, `update_task`,
and `delete_task` (propose-only).

| Action | Gate | Core / write | Side effects |
| ------ | ---- | ------------ | ------------ |
| `createPersonalTaskAction` | session; manager+ to assign someone else, who must be active (any domain is allowed) | `createPersonalTaskCore` (`module='core'`) | `task_assigned` in-app + WhatsApp when assignee ≠ actor; reminder when due; Redis; `created` event |
| `createGroupTaskAction` | any non-guest; domain locked to your own unless admin/founder | `createGroupTaskCore` | awaited delete of `task:group-list:{callerId}`; `revalidatePath('/tasks')` |
| `createSubtaskAction` | group exists; domain check for agents | `createSubtaskCore` (`group_subtask`, `module='core'`) | notification, reminder, deletes both people's group lists, `created` event |
| `updateTaskStatusAction` | `Promise.all([requireProfile, the task (no embed), isLeadTask])` → `canMutateTask` | `updateTaskStatusCore` | no-op if unchanged; cancels the reminder on a terminal status; Redis (below); `status_changed` event |
| `updateTaskAction` | profile + task → `canMutateTask` | `updateTaskCore` | reschedules the reminder when `due_at` changes; `status_changed` / `reassigned` events |
| `deleteTaskAction` | `requireProfile`, then `Promise.all([task, isLeadTask])`; an agent must be both creator and assignee | `deleteTaskCore` | tries `cancelTaskReminder` first (a failure is logged, the delete goes on); cascades remarks; Redis |
| `updateChecklistAction` | `canMutateTask` | direct `attachments` update (not a core) | excluded from the audit trigger |
| `addTaskRemarkAction` | view equals post (session read of the task) | `add_task_remark_with_status` via the admin client | a `remark_added` event (no Redis delete) |
| `deleteGroupTaskAction` | `requireProfile(['admin','founder'])` | delete `task_groups` (cascades subtasks and remarks) | `revalidatePath('/tasks')` |
| `getCompletedTasksAction` | `requireProfile()` + a trust boundary: agent → self; manager → self or a same-domain person; admin/founder → anyone (the manager SELECT RLS is not domain-scoped, so this gate does it) | `getCompletedTasks` | |
| `getGroupSubtasksAction`, `getPersonalTasksAction`, `getPersonalTaskTagsAction`, `getTaskRemarksAction` | session | reads | |

`canMutateTask` (in `task-mutations.ts`, so non-action callers can import it): admin/founder
always; the assignee or the creator; a manager for a group subtask in their domain. The cores are
ungated (Q-13): the caller is the trust boundary.

#### 8.4b `leads.ts`: `createLeadTaskAction`

Delegates to `createLeadTaskCore` (`services/lead-mutations.ts`), the same core Elaya uses: Zod →
`requireProfile()` → the lead read and access check (agent: assigned; manager: domain;
admin/founder: all) → title from `TASK_TYPE_LABELS` → assignee `lead.assigned_to ?? caller.id` →
`create_lead_gia_task` + reminder + cache → `revalidatePath('/leads/<slug or id>')`.

#### 8.4c Redis

| Key (`REDIS_KEYS`) | String | TTL | Deleted by |
| ------------------ | ------ | --- | ---------- |
| `task.personalPage1(u)` | `task:personal:page1:{u}:v2` | 30s | create personal; status and delete of a personal task (keyed on the actor) |
| `task.giaList(u, role, domain)` | `task:gia:{u}:{role}:{domain}` | 60s | status and delete of a lead task (`hasGiaMeta`) |
| `task.groupList(u)` | `task:group-list:{u}` | 120s | create group, create subtask (creator and assignee) |
| `dashboardAgentTasks(u)` | `dashboard:agent-tasks:{u}` | 30s | every status change (not on delete) |

The status and delete cores key their deletes on **the actor**, not the assignee: a manager's own
slot clears, the agent's expires with its TTL. The lead-task branch keys on the caller-supplied
`hasGiaMeta` flag; the cores never read `task_gia_meta` themselves. Every delete is awaited inside a
try/catch-warn (P-08). The old `task:subtasks` and `task:remarks` keys are gone.

### 8.5 Client filters: `src/lib/utils/task-client-filters.ts`

Exports: `PersonalTaskFiltersState`, `GroupTaskFiltersState`, `EMPTY_PERSONAL_TASK_FILTERS`,
`EMPTY_GROUP_TASK_FILTERS`, `TASK_STATUS_FILTER_ITEMS`, `MY_TASKS_STATUS_FILTER_ITEMS` (without
completed and cancelled, which My Tasks never lists), `TASK_PRIORITY_FILTER_ITEMS`,
`GROUP_PROGRESS_FILTER_ITEMS`, `filterGroupRows`, `personalFiltersActiveCount`,
`groupFiltersActiveCount`, `domainsInGroupRows`, `resolvePersonalTaskAssignee`.

My Tasks filters inside `MyTasksCalendarView` (search on title, description and the lead's name;
tags must all match; status; priority). Group Tasks filters through `filterGroupRows`. Filters are
client-side on purpose: each tab's data loads once through the RSC seed, and a filter change never
calls the server. Each tab keeps its own filter state in `TasksShell`, so switching tabs keeps both.

### 8.6 The `/tasks` page

- **`page.tsx`:** no data fetching in the page body beyond `getCurrentProfile()` and the
  `searchParams` parse. `validTabs = ['personal', 'group']` for every role; any other `?tab` (the
  old `gia` included) falls back to `personal`. The header is a `CondensingPageHeader` (sticky;
  condenses after 24px of scroll by paint only) holding `CompletedTasksButton` (icon-only below
  md), `AddTaskButton` ("My Task" or "Group Task" by tab) and the bell. Content sits in
  `<Suspense fallback={<TasksSkeleton tab />}>`.
- **`TasksCreateProvider`:** a counter the header button bumps; each tab listens through the
  shared `useCreateTriggerModal` hook and opens its create modal.
- **`TasksAsync`:** fetches only the active tab (`getPersonalTasks` or `getGroupTasks({})`) and
  passes plain objects to `TasksShell`.
- **`TasksShell`:** the `TabSelector` (My Tasks, Group Tasks), `TasksFilters`, the result count
  label, and the tab panel. It loads personal tags through `getPersonalTaskTagsAction` on the
  personal tab.
- **`TasksFilters`:** My Tasks: search, tags, status, priority. Group Tasks: search, status,
  priority, domain (admin/founder; options from the loaded groups via `domainsInGroupRows`),
  progress. Below md the bar takes its own full row under the tabs.

### 8.7 My Tasks: `MyTasksCalendarView`

- **Layout:** a sticky 280px calendar with dots, a summary strip and quick-add on the left; date
  sections on the right. On a phone the list comes first.
- **Sections:** Today → later dates → Overdue → No due date. Completed tasks leave the list.
- **Calendar dots mark actionable days only:** one predicate (`isTaskActionable`, which honours an
  optimistic toggle) drives both the dots and what a click lists, so a dot never opens an empty
  day. Dot keys use the local date, never `toISOString().slice(0,10)`.
- **Auto-drain (2026-06-25):** page 1 comes from the RSC seed; an effect then fetches every further
  page while `hasMore` (depending only on the cursor, with a ref guard), so the dots and sections
  cover the whole active set.
- **Lead follow-ups** show the lead's name as a chip (from the 0145 columns) and are searchable by
  it.
- **Completion:** `TaskCompletionCircle` + `useTaskCompletionToggle` → `updateTaskStatusAction`
  (`completed` ↔ `to_do`), rolled back with a toast on error.
- **Opening a task:** `LoadingVeil` while `getTaskRemarksAction` runs; `SubTaskModal` mounts only
  when the remarks are in. The modal chunk is warmed after hydration.

### 8.8 Group Tasks: `GroupTasksTab`

- One accordion card per group: progress bar, up to four avatars, **Open** → `/tasks/[id]`.
- Expanding a group lazily loads its subtasks (`getGroupSubtasksAction`); the assignable users are
  loaded once for the whole tab (`initialAgents`), never per group. On touch, group headers act on
  the first tap.
- The ⋯ menu is portaled by hand (it escapes the card's `overflow: hidden` and the entrance
  transform); the delete confirmation is a `ConfirmDialog`.
- Any non-guest can create a group (there is no manager-only gate). Domain is locked to your own
  unless admin/founder.
- `onTaskUpdated` / `onTaskDeleted` / `onDeferDelete` patch the rows and counts without a refresh.

### 8.9 Repeat reminders (nudges, 0232)

The founder asked Elaya to "remind Karan every 3 hours"; a task had one due moment and one
reminder, so she could not. Now:

- **Columns:** `nudge_every_minutes` (30 to 1440), `nudge_until`, `nudge_count` on `tasks`.
- **`setTaskNudgeCore(taskId, { everyMinutes, forMinutes })`** clamps the interval to 30 minutes to
  24 hours and the window to between one interval and 3 days, resets the count, and arms the first
  run (`scheduleTaskNudge`). `createPersonalTaskCore` accepts an optional `nudge`.
- **`send-task-nudge`** (`src/trigger/task-reminders.ts`) runs, stops unless the task is still
  `to_do` or `in_progress` and the window is live, sends the same pair as a first assignment (the
  in-app `task_assigned` notification and the WhatsApp assigned template), counts it, and arms the
  next run. Runs carry the idempotency key `task-nudge-<id>-<until>-<seq>` and the task's reminder
  tag, so `cancelTaskReminder` (on completion or delete) stops the chain; setting a new repeat
  starts a fresh chain because `until` is in the key.
- **Only Elaya sets it:** `create_personal_task` and `update_task` take `remindEveryHours` (0.5 to
  24) and `remindForHours` (0.5 to 72, default 24). Both tools report which channels reached the
  assignee and whether they have a phone, so she says so instead of "done" when a person cannot be
  reached.

### 8.10 Tasks from a Sia ticket

On a ticket page the Tasks card (`TicketTasksCard`) has a small form (title, who, priority, due via
the shared `DueDateField`). `createTicketTaskCore` (`ticket-mutations.ts`) runs
`createPersonalTaskCore` (reminder, notification, cache: identical to any task) with tag `ticket`
and description `<ticket no> · <title>`, inserts the `task_ticket_meta` row, and writes a
`subtask_created` event on the ticket's timeline. The task then lands in the assignee's My Tasks
like any other. Ticket side: `./tickets.md`.

### 8.11 Create modals

**`CreateGroupTaskModal`:** title, description, domain (hidden when locked), priority, due date,
accent colour swatches and an icon grid (UI-only, not stored), and optional inline subtask drafts
(title, priority, assignee, due; the row stacks below sm and its assignee picker is portaled). The
drafts are created with `createSubtaskAction` after the group insert. The new group is prepended
locally.

**`CreatePersonalTaskModal`:** title (autofocus except on touch), due presets and a `DatePicker`,
priority chips, tags (up to 10), notes. The presets resolve through `resolveDueAt()` in
`src/components/ui/TaskFormFields.tsx`, which uses `toISTEndOfDay` from `lib/utils/ist.ts` (end of
the IST day). The action returns `{ taskId, assignedTo, createdBy }`, and the synthetic row uses
those, not optimistic guesses.

Both compose `TaskFormFields` (`FieldLabel`, `FieldError`, `FormChip`, `PriorityChipRow`,
`DueDateField` + `resolveDueAt`, `TaskTypeField`).

### 8.12 The group workspace: `/tasks/[id]`

- **`page.tsx`** (metadata title "Task group") → `WorkspaceAsync`: `Promise.all([getTaskGroupById,
  getGroupSubtasks])`; a missing group → `redirect('/tasks?tab=group')`. The `BackButton` is inside
  `GroupTaskWorkspace`.
- **View:** list or board, stored per group in `localStorage` (`serene:tasks:workspace-view:<id>`),
  read after mount so the server render never mismatches. List: priority, then `due_at`. Board: five
  columns (To Do, In Progress, In Review, Completed, Error/Cancelled merged), no drag between
  columns. On a phone the list row is the tab's two-line row.
- **Realtime:** `workspace-subtasks-${groupId}-${mountId}` merges INSERT and UPDATE.
- **Add subtask:** a floating button that sits above the Elaya button (`.serene-above-elaya-fab`),
  opening a panel (a `Dialog` sheet "New subtask" below md) with title, assignee, priority and a
  `DatePicker` due date → `createSubtaskAction`.

### 8.13 `SubTaskModal`

- **Shell:** `95vw`, `max-w` 1100px, `90dvh` (max 820px) on md and up; **a bottom sheet** below md
  (full width, `max-h` 90dvh, rounded top, safe-area padding, no backdrop blur).
- **Two zones (38% / 62%):** A = title, description, Action Items checklist, deadline, assignee,
  metadata (on a phone reordered: details, metadata, checklist); B = `TaskRemarksPanel` embedded.
- **Header:** status and priority dropdowns in the semantic tokens, edit, delete, close.
- **Edit mode (zone A):** save → `updateTaskAction` (title, description, `due_at` when changed)
  and `updateChecklistAction` when the checklist changed; no remark; `router.refresh()` after.
- **Checklist:** add a row outside edit mode, tick optimistically (full-array replace). A mouse and
  touch sensor pair; Move up / down on touch.
- **Delete:** a group subtask needs manager+; a personal task needs you as creator and assignee.
  After the confirm the modal calls **`onDeferDelete(taskId)`**: the parent removes the row, shows
  an Undo toast, and calls `deleteTaskAction` only when the toast times out (Undo cancels it). A
  caller without `onDeferDelete` falls back to an immediate delete. The browser never calls
  `cancelTaskReminder`; the core does.
- `AnimatePresence` is required at the call site; the modal mounts only when its remarks are
  loaded.

### 8.14 `TaskRemarksPanel`

Props: `taskId`, `currentUserId`, `currentUserName`, `initialRemarks` (no mount fetch), `embedded`.
The composer placeholder is a constant (the `composerPlaceholder` prop is gone). Posting: an
optimistic row at reduced opacity → `addTaskRemarkAction` → replace from the result → the Realtime
echo is dropped through `seenIds` (primary) and `optimisticIds`. Channel
`task-remarks-${taskId}-${mountId}`. A suppressed remark reads "This remark was removed.". The
composer posts content only (no status chips). It sticks to the bottom only while the reader is
there; the blur orbs render on fine pointers only; Enter is a newline on touch.

### 8.15 `AssigneePickerModal`

A nested picker above `SubTaskModal`: backdrop `--z-modal-overlay` (61), panel `--z-modal-nested`
(62), above the modal's `--z-modal` (60). Fixed positioning (no portal). Domain tabs for the Gia
domains that have people; client-side search on the pre-loaded users; single select.
`AssignableUser` = `Pick<Profile, 'id' | 'full_name' | 'avatar_url' | 'role' | 'domain'>`.

### 8.16 Flows

| Flow | Path |
| ---- | ---- |
| Create a personal task | header button → `CreatePersonalTaskModal` → `createPersonalTaskAction` → prepend with the returned ids |
| Quick-add | calendar sidebar or inline row → `createPersonalTaskAction` → prepend |
| Complete / reopen | `TaskCompletionCircle` → `updateTaskStatusAction` → rollback + toast on error |
| Create a group | `CreateGroupTaskModal` → `createGroupTaskAction` (+ `createSubtaskAction` per draft) → prepend |
| Create a subtask | group row or workspace button → `createSubtaskAction` → append |
| Open a task | row → `LoadingVeil` + `getTaskRemarksAction` → `SubTaskModal` |
| Edit | pencil → save → `updateTaskAction` (+ `updateChecklistAction`) |
| Remark (+ status) | composer → `addTaskRemarkAction` → the RPC |
| Delete | confirm → row removed + Undo toast → on timeout `deleteTaskAction` → `deleteTaskCore` (cancel reminder, then delete, cascading remarks) |
| Reminder fires | `dueAt − 30 min` → `send-task-due-soon` (WhatsApp); `dueAt` → `send-task-reminder` (in-app `task_due`, the at-due WhatsApp, and for lead tasks the lead-shaped reminder + arming the overdue check); `dueAt + TASK-01B threshold` → `check-task-overdue` (clearing checks, the once-only `overdue_at` stamp, the manager escalation, an `overdue` event) |
| Repeat nudge | Elaya sets it → `setTaskNudgeCore` → `send-task-nudge` re-arms itself until done or the window ends |
| Lead follow-up created | the dossier task card → `createLeadTaskAction`; or `add_lead_call_note` / `update_lead_status` (nurturing). All through `create_lead_gia_task`. Shown in My Tasks, on the dossier card (`getAllLeadTasks`) and the dashboard widget |
| Ticket task created | the ticket's Tasks card → `createTicketTaskCore` → My Tasks |

### 8.17 Access control summary

| Operation | Agent | Manager | Admin / founder |
| --------- | ----- | ------- | --------------- |
| Create a personal task | for yourself | for anyone | for anyone |
| Create a group task | yes (own domain) | yes (own domain) | yes (any domain) |
| Create a subtask | yes (domain check) | yes | yes |
| Complete own assignment | yes | yes | yes |
| Edit / checklist / remark | as assignee or creator | + group subtasks in own domain | yes |
| Delete a personal task | as creator and assignee | yes | yes |
| Delete a subtask | no | yes | yes |
| Delete a group | own groups (RLS) | own groups | via `deleteGroupTaskAction` |
| See a group | as creator or subtask assignee (0058) | same | same |
| Completed history | own | own or same-domain person | anyone |
| Audit log (DB) | no | yes | yes |
| Set a repeat reminder | through Elaya only | through Elaya only | through Elaya only |

### 8.18 Migration index

| # | File | Summary |
| - | ---- | ------- |
| 0003 | `20260527000003_leads.sql` | first `tasks`, `task_gia_meta`, base RLS |
| 0016 | `…_notifications.sql` | `notifications` incl. `task_due`; relative `action_url` |
| 0017 | `…_os_tasks.sql` | `task_groups`, the status set |
| 0020 | `…_group_task_summaries_rpc.sql` | `get_group_task_summaries` |
| 0021 | `…_task_suppression_audit.sql` | suppression columns, `task_audit_log` + trigger |
| 0022 | `…_task_remarks.sql` | `task_remarks` replaces `task_messages` |
| 0023 / 0024 | `…_task_attachments.sql`, `…_task_tags.sql` | checklist JSONB; `tags` + GIN |
| 0025 / 0026 | `…_task_performance_indexes.sql`, `…_get_personal_tasks_cursor.sql` | indexes; `get_personal_tasks` with the cursor |
| 0035 / 0051 | `…_rpc_add_task_remark_with_status.sql`, `…_task_remark_rpc_auth_fix.sql` | the remark RPC; agent `created_by` SELECT |
| 0041 / 0042 | `…_normalize_lead_domain.sql`, `…_fix_group_task_summaries_domain_type.sql` | `task_groups.domain` → `app_domain` |
| 0054 / 0055 / 0056 | `…_create_lead_gia_task.sql`, `…_get_gia_tasks.sql`, `…_get_gia_tasks_slug_prereq.sql` | the lead-task writer and reader |
| 0057 | `…_task_type_other.sql` | `task_type` call / whatsapp_message / other |
| 0058 | `…_task_groups_flat_visibility.sql` | creator-or-assignee group visibility; `idx_tasks_group_assignee` |
| 0086 | `…_fix_tasks_status_default.sql` | default `'to_do'` |
| 0088 | `…_rls_initplan_hoist.sql` | role checks evaluated once per statement (logic unchanged) |
| 0094 | `…_explicit_insert_delete_policies.sql` | `tasks_insert`, `tasks_delete`, `tasks_delete_privileged` |
| 0113 | `20260612000113_task_overdue_and_notification_types.sql` | `overdue_at`; the task notification and log types |
| 0138 | `20260617000138_collapse_gia_category_module_enum.sql` | `gia_followup` category dropped; `module` → `task_module` enum; the single-writer rule |
| 0142 / 0153 | `…_task_agent_reminder_log_types.sql`, `…_task_assigned_log_type.sql` | WhatsApp log types for the task pings |
| 0144 | `20260624000144_oversight_task_events.sql` | `task_events` + the oversight RPCs |
| 0145 | `20260625000145_personal_tasks_lead_identity.sql` | `get_personal_tasks` returns the lead's name |
| 0149 | `20260625000149_elaya_sessionless_rpc_twins.sql` | `get_group_task_summaries_for_user` (admin twin) |
| 0160 | `20260706000160_get_domain_task_summary.sql` | the mobile Tasks room summary |
| 0195 | `20260915000195_sia_tickets.sql` | `public.task_ticket_meta` |
| 0202 | `20260916000202_rename_b2b_to_business.sql` | `b2b` → `business` (affects `task_groups.domain`, `task_events`) |
| 0210 | `20260917000210_gia_schema.sql` | `task_gia_meta` (and the Gia tables) → schema `gia`; routine search paths widened to `public, gia` |
| 0223 | `20260919000223_elaya_read_catalog.sql` | `elaya_read.tasks` / `task_groups` views for Elaya's read-only SQL |
| 0232 | `20260921000232_task_nudges.sql` | the repeat-reminder columns |

### 8.19 Known invariants

1. `page.tsx` fetches nothing but the profile and the params; data lives in `TasksAsync` behind
   Suspense.
2. `TasksAsync` hands `TasksShell` plain serialisable objects only.
3. `getPersonalTasks` order comes from the RPC on every page; never `.sort()` it in JS. It returns
   `{ tasks, hasMore, nextCursor }`, with `hasMore` from `LIMIT page + 1`, never a COUNT.
4. `getGroupTasks` uses React `cache()` plus Redis (user-scoped key, unfiltered calls only), never
   `unstable_cache` (it reads cookies).
5. Filters are client-side (`task-client-filters.ts`); a filter change never refetches. Each tab
   keeps its own filter state.
6. `task_remarks` is append-only: no DELETE policy, ever; suppression is the only UPDATE.
7. `task_remarks.status_change` must mirror the `tasks.status` CHECK; extend both together.
8. `log_task_changes()` watches exactly six fields; never add `attachments`.
9. Reminders are idempotent by key (`task-reminder-<id>`; nudges `task-nudge-<id>-<until>-<seq>`)
   and all carry the task's reminder tag, so one cancel sweeps them.
10. View equals post: `addTaskRemarkAction` reads the task through RLS before the admin-client RPC.
11. Every task write goes through a `task-mutations.ts` core (or `create_lead_gia_task`), with the
    caller enforcing what RLS would.
12. Single-writer: `task_gia_meta` + `module = 'gia'` exist iff the task is a lead follow-up,
    written only by `create_lead_gia_task` / `update_lead_status`. Detect a lead task by the meta
    row, never a category.
13. The `public.tasks` ↔ `gia.task_gia_meta` link is read only through `gia-task-links.ts`. Never an
    embed across the schema line.
14. The cores never query `task_gia_meta`; the caller passes `hasGiaMeta`. Cache deletes key on the
    actor, awaited in a try/catch-warn.
15. Every mutation emits one `task_events` row from the core, never from an action or the UI.
16. `GroupTasksTab` loads assignable users once for the tab.
17. `AnimatePresence` at the call site of `SubTaskModal`.
18. Realtime channel names include a `useId()` mount nonce.
19. Leads filter on the server by URL; tasks filter on the client. Do not mix the two patterns.

### Constants

`task-constants.ts`: `TASK_PRIORITY`, `TASK_STATUS` (with pill and remark tokens), `TASK_CATEGORY`,
`TASK_REMARK_STATUS_LABELS`, `GROUP_TASK_ACCENT_COLORS`, `GROUP_TASK_ICONS`. `GIA_DOMAINS`
(onboarding, house, shop, legacy) and `DOMAIN_LABELS` from `domains.ts`.

### Component inventory (`src/components/tasks/`)

| File | Role |
| ---- | ---- |
| `AddTaskButton.tsx` | header button; bumps the create counter |
| `AssigneePickerModal.tsx` | nested assignee picker |
| `CompletedTasksButton.tsx` + `CompletedTasksModal.tsx` | the completed-tasks history (keyset, 30 a page) |
| `CreateGroupTaskModal.tsx` | group + optional subtask drafts |
| `CreatePersonalTaskModal.tsx` | personal task create (lead follow-ups are created on the dossier) |
| `GroupTaskWorkspace.tsx` | `/tasks/[id]` |
| `GroupTasksTab.tsx` | the Group Tasks tab |
| `MyTasksCalendarView.tsx` | the My Tasks tab |
| `SubTaskModal.tsx` | the task detail modal |
| `TaskCompletionCircle.tsx` | the 24px completion control |
| `TaskRemarksPanel.tsx` | the remarks thread |
| `TaskStatusIcon.tsx` | the status icon |
| `TasksCreateContext.tsx` | the create-counter provider |
| `TasksFilters.tsx` | the filter strip |
| `CLAUDE.md` | component contracts (partly stale, §7) |

Shared outside the folder: `src/components/ui/TaskFormFields.tsx`,
`src/hooks/useTaskCompletionToggle.ts`, `src/hooks/useCreateTriggerModal.ts`,
`src/components/ui/LogoSpinner.tsx` (`LoadingVeil`), `CondensingPageHeader`.
