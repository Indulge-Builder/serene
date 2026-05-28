# Lib CLAUDE.md — stub. Update as patterns are established.

## Constants registry

| File | Purpose |
| ---- | ------- |
| `constants/roles.ts` | `USER_ROLES`, `ROLE_LABELS` |
| `constants/domains.ts` | `APP_DOMAINS`, `DOMAIN_LABELS` |
| `constants/lead-statuses.ts` | `LeadStatus` enums + badge config |
| `constants/call-outcomes.ts` | `CallOutcome` enums + labels |
| `constants/task-types.ts` | `TaskType` enums |
| `constants/task-constants.ts` | `TASK_PRIORITY`, `TASK_STATUS`, `TASK_CATEGORY` — labels, CSS token color names, sort order |
| `constants/campaign-domain-map.ts` | prefix → domain mapping |
| `constants/lead-columns.ts` | Column registry for the leads table — `LEAD_COLUMNS`, `LEAD_COLUMN_MAP`, `DEFAULT_COLUMN_ORDER`, `isValidLeadColumnId`. IDs are stable localStorage keys — never rename after shipping. |

## Services registry

| File | Purpose |
| ---- | ------- |
| `services/profiles-service.ts` | Profile DB queries |
| `services/leads-service.ts` | Lead DB queries — `getLeadsByRole`, `getLeadById`, etc. |
| `services/notifications-service.ts` | Notification reads/writes |
| `services/dashboard-service.ts` | Dashboard widget queries only — never extend leads-service |
| `services/performance-service.ts` | Performance page queries |
| `services/ad-creatives-service.ts` | `getAdCreativeForCampaign` |
| `services/tasks-service.ts` | OS Tasks queries — `getPersonalTasks`, `getGroupTasks`, `getGroupSubtasks`, `getTaskById`, `getTaskMessages` |

## Composite cursor pattern for nullable sort columns

**Problem:** Keyset pagination with `.gt('col', cursor)` silently drops all rows where `col IS NULL`. PostgreSQL evaluates `NULL > any_value` as NULL (falsy), so those rows never appear on page 2+.

**Rule:** Any keyset cursor over a nullable column must use a **composite cursor** encoding both the nullable column and a stable tiebreaker (typically `id`).

**Reference implementation:** `getPersonalTasks` in `services/tasks-service.ts`

```text
Sort:   ORDER BY due_at ASC NULLS LAST, id ASC
Cursor: PersonalTaskCursor = { due_at: string | null, id: string }

Continuation condition (4 cases):
  cursor.due_at IS NOT NULL:
    due_at > cursor.due_at               -- later deadline
    OR (due_at = cursor.due_at AND id > cursor.id)  -- same deadline, later row
    OR due_at IS NULL                    -- all no-deadline rows come after

  cursor.due_at IS NULL:
    due_at IS NULL AND id > cursor.id    -- within the NULL group, later id only
```

Expressed as a single `.or()` call in the Supabase query builder (not chained `.gt()/.eq()`).

**Rule:** Never use a single-column cursor on a nullable sort column. Always use a composite cursor.

## RPC pattern for aggregated list queries

When a list query requires per-row aggregates (counts, array_agg) that would otherwise demand an in-memory reduce over child rows, move the aggregation into a Postgres RPC function and call it from the service layer.

**Pattern: `getGroupTasks` (reference implementation)**

```text
1. supabase.rpc('get_group_task_summaries', { p_domain, p_status, p_priority })
   → returns pre-aggregated rows (counts as bigint, assignee_ids as uuid[])
2. Batch profile fetch for all unique assignee_ids across all rows
   → one .select().in('id', allIds) query
Total: 2 DB round-trips, zero subtask rows transferred to Node.
```

**Rules for any future RPC-based aggregation:**

- RPC function must be `SECURITY DEFINER SET search_path = public` (A-10).
- **SECURITY DEFINER bypasses RLS.** The function runs as the function owner (postgres), not as the calling user. RLS policies on accessed tables do not fire. Any access control that RLS normally enforces must be replicated explicitly in the WHERE clause using `get_user_role()` and `get_user_domain()`. Those helpers resolve correctly inside SECURITY DEFINER because they read from `auth.uid()`, which is set from the calling session's JWT, not the function owner's.
- Never accept a caller-supplied domain/role parameter and trust it for scoping. Derive the caller's domain from `get_user_domain()` inside the function body.
- Cast bigint COUNT fields to `Number()` before returning from the service (Q-09).
- Slice arrays (e.g. `assignee_ids.slice(0, 4)`) in the service layer, not in SQL.
- Because the generated Supabase types won't include the new RPC until regenerated, cast the client to `any` for the `.rpc()` call with an `// eslint-disable-next-line @typescript-eslint/no-explicit-any` comment above it.
- Add the RPC to `supabase/migrations/CLAUDE.md` migration inventory after the migration file is created.

## Actions registry

| File | Purpose |
| ---- | ------- |
| `actions/profiles.ts` | User/profile management |
| `actions/agent-routing.ts` | `toggleAgentRouting` |
| `actions/leads.ts` | Lead lifecycle actions |
| `actions/dashboard.ts` | Dashboard widget data refresh |
| `actions/notifications.ts` | `markNotificationReadAction`, `markAllReadAction` |
| `actions/tasks.ts` | OS Tasks actions — `createPersonalTaskAction`, `createGroupTaskAction`, `createSubtaskAction`, `updateTaskStatusAction`, `updateTaskAction`, `deleteTaskAction`, `addTaskMessageAction`, `suppressTaskMessageAction` |

## Trigger.dev jobs

| File | Purpose |
| ---- | ------- |
| `src/trigger/task-reminders.ts` | `scheduleTaskReminder(taskId, dueAt, assignedTo)`, `cancelTaskReminder(taskId)` |

**Rule:** `scheduleTaskReminder` is a no-op when `dueAt - 30min < now()`. It never errors on past dates.
**Rule:** `deleteTaskAction` cancels the Trigger.dev reminder **before** the DB delete. If cancel throws, the delete is aborted.
**Rule:** Tags (`task-reminder-${taskId}`) are used to locate and cancel runs — no run IDs stored in the DB.

## suppressTaskMessageAction — pattern and column restriction

`suppressTaskMessageAction` in `src/lib/actions/tasks.ts` is the ONLY path that may set `is_suppressed = true` on a `task_messages` row.

**Column restriction:** The RLS UPDATE policy (`task_messages_suppression_update`) permits admin/founder to update `task_messages` rows but does NOT restrict which columns change. PostgreSQL RLS has no column-level write restriction. The action enforces the restriction by only writing `{ is_suppressed, suppressed_by, suppressed_at }`. Never add code that writes `content`, `author_id`, or `task_id` through this action.

**Why adminClient:** The action uses `createAdminClient()` for the update because the user client would need the RLS UPDATE policy to fire — the admin client bypasses RLS. The application-layer auth check (`['admin', 'founder'].includes(caller.role)`) provides the security equivalent.

**Idempotent:** Calling the action on an already-suppressed message is a no-op (returns `{ data: { messageId }, error: null }` without issuing a DB write).

## task_audit_log trigger contract

`log_task_changes()` fires AFTER UPDATE on `tasks` FOR EACH ROW. It logs exactly six fields:
`title`, `description`, `status`, `priority`, `due_at`, `assigned_to`.

`changed_by` defaults to `auth.uid()`. Falls back to `NEW.assigned_to` when `auth.uid()` is NULL
(service-role context). Known imperfection: reassignment via service role shows the new assignee
as the changer. Do not add a `changed_by` parameter to tasks to compensate — not worth the complexity.

`task_audit_log` is append-only. No UPDATE or DELETE policies exist or will ever exist.

## createNotification() call sites

`createNotification()` from `src/lib/services/notifications-service.ts` must only be called from server actions.

Current call sites in `src/lib/actions/leads.ts`:
- `updateLeadStatus`: when `status === 'won'` — notifies all active managers/admins/founders in the lead's domain (`lead_won` type).
- `assignLead`: fires `lead_assigned` notification to the receiving agent (fire-and-forget, non-fatal `.catch(() => {})`).
- `createManualLead`: fires `lead_assigned` notification to the assigned agent when `assignedTo !== caller.id` (fire-and-forget).

**Rule:** Notification creation is always fire-and-forget in leads actions (non-fatal). If the notification fails, the lead action must still succeed. Wrap with `.catch(() => {})` when calling without `await`.

`src/lib/actions/notifications.ts`:
- `markNotificationReadAction(id)` — validates UUID, confirms ownership, calls service.
- `markAllReadAction()` — session-scoped, calls service. No input parameter.

`src/lib/actions/tasks.ts`:
- `createPersonalTaskAction`: fires `task_assigned` notification to assignee when `assigned_to ≠ auth.uid()` (fire-and-forget).
- `createSubtaskAction`: always fires `task_assigned` notification to assignee when `assigned_to ≠ auth.uid()` (fire-and-forget).
