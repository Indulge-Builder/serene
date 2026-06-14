# Tasks

> **Purpose:** Operational tasks (personal / group / Gia follow-up) with composite-cursor pagination,
> Trigger.dev due + overdue reminders, an append-only remarks panel, and RPC-backed status tracking.

Back to [index](index.md). Conventions: [_conventions.md](_conventions.md).

---

## Entry points & data flow

- **Create** — `createPersonalTaskAction` / `createGroupTaskAction` / `createSubtaskAction`
  (`actions/tasks.ts`): Zod → `requireProfile()` → INSERT (admin client) → `scheduleTaskReminder()` (if
  `due_at`) → notify assignee. Subtask create **double-invalidates** (assignee's + creator's group lists —
  the flat-visibility model from migration 0058).
- **Read personal** — `getPersonalTasks(userId, filters)`: fully backed by the `get_personal_tasks` RPC.
  Composite cursor `{ due_at, id }`; sort `due_at ASC NULLS LAST → priority CASE → id ASC` on **every**
  page. **One code path** — no JS sort, no PostgREST `.order()` fallback (resolved 2026-05-29).
- **Read group** — `getGroupTasks(domain, role, userId, filters)`: pre-aggregated subtask counts + batch
  avatar fetch (no per-row child selects). Wrapped in `unstable_cache` with a domain-scoped key.
- **Reminders** (`trigger/task-reminders.ts`):
  - `sendTaskReminderTask` at `due_at` → in-app `task_due`; if Gia follow-up + WhatsApp channel active →
    WhatsApp template, then arms the overdue check.
  - `checkTaskOverdueTask` at `due_at + threshold` → clearing-event check (lead called/messaged since?);
    if not cleared, exactly-once `overdue_at` stamp via `markTaskOverdueOnce` (UPDATE WHERE
    `overdue_at IS NULL`) → escalate to domain managers (in-app + WhatsApp).
- **Status / remarks** — `add_task_remark_with_status` RPC inserts a remark + optionally updates status
  atomically. `suppressTaskRemarkAction` (admin/founder) sets only `is_suppressed`/`suppressed_by/_at`.

---

## Canonical helpers

- `scheduleTaskReminder(taskId, dueAt, assignedTo)` / `cancelTaskReminder(taskId)` (by tag
  `task-reminder-${taskId}`) — the Trigger.dev scheduler. Cancel runs **before** task delete.
- `getPersonalTasks` (one RPC path), `getGroupTasks`, `getTaskRemarks` (30s cache-aside), `canMutateTask`.

---

## Key tables

| Table | Holds |
|---|---|
| `tasks` | `status`, `priority`, `due_at`, `completed_at`, `overdue_at` (once), `assigned_to`, `created_by`, `task_category` (personal/group_subtask/gia_followup), `task_type` (call/whatsapp_message/other), `group_id`, `tags` text[], `attachments`/`checklist` jsonb |
| `task_groups` | `domain`, `title`, `created_by`; flat visibility (all domain agents see all groups) |
| `task_remarks` | append-only; `content` (sanitized), `status_change`, `is_suppressed`/`suppressed_by/_at` |
| `task_audit_log` | trigger-fired on task UPDATE; append-only old/new value snapshots |
| `task_gia_meta` | `task_id`↔`lead_id` link; `call_outcome` (`'revived'` is the revival badge key) |

---

## Invariants / gotchas

- **Composite cursor on a nullable sort column** — the cursor encodes both `due_at` and `id` so null-due
  rows aren't silently skipped on page 2+.
- **One RPC path** — page 1 and pages 2+ call `get_personal_tasks` with identical sort logic.
- **Exactly-once overdue stamp** — `markTaskOverdueOnce` is `UPDATE WHERE overdue_at IS NULL`; the job can
  retry safely.
- **Append-only remarks** — no UPDATE/DELETE on content; suppression is a 4-column write only.
- **Cancel reminder before delete** — if cancel throws, the delete aborts; the task always exists when the
  job runs.

---

## File map (spine)

| File | Role |
|---|---|
| `src/lib/services/tasks-service.ts` | Personal RPC cursor, group list, remarks, Gia tasks |
| `src/lib/actions/tasks.ts` | Create personal/group/subtask, status, remarks, suppress, delete |
| `src/trigger/task-reminders.ts` | `sendTaskReminderTask` (due) + `checkTaskOverdueTask` (overdue) |
| `src/components/tasks/SubTaskModal.tsx` | Task detail modal: remarks panel + status editor (dynamic) |
| `src/components/tasks/TaskRemarksPanel.tsx` | Remarks thread + composer + realtime channel |
| `src/components/tasks/GroupTasksTab.tsx` | Group list, filters, load-on-intent `SubTaskModal` |
| `src/components/tasks/CreatePersonalTaskModal.tsx` | Create form (composes `TaskFormFields`) |
| `src/components/tasks/CreateGroupTaskModal.tsx` | Group create with live preview |
| `src/components/tasks/MyTasksCalendarView.tsx` | Personal tasks calendar, infinite scroll |
| `src/components/tasks/AssigneePickerModal.tsx` | Nested modal: domain tabs + search, body-portaled |
