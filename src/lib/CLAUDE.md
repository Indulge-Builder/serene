# Lib CLAUDE.md — stub. Update as patterns are established.

## Browser Supabase client — singleton contract

`src/lib/supabase/client.ts` exports a **module-level singleton**.
Calling `createClient()` twice returns the **same object reference**.

```ts
createClient() === createClient() // always true
```

One instance. One WebSocket connection. One channel registry across all components.

**Rule 05:** Never call `createBrowserClient(...)` directly. Always call `createClient()` from
`src/lib/supabase/client.ts`. This is the only browser client instantiation point in the entire app.

**Test reset:** `_resetClientForTests()` is exported but guard-gated to `NODE_ENV === 'test'`.
Never call it in application code.

## Realtime teardown — required pattern

When unsubscribing from a Supabase Realtime channel, always call:

```ts
supabase.removeChannel(channel)
```

**Never** use `channel.unsubscribe()` alone. `unsubscribe()` marks the channel closed but does
**not** deregister it from the client's internal channel list. With the singleton client, leaked
channels accumulate across navigations and component remounts.

**Correct cleanup pattern (P-06):**

```ts
useEffect(() => {
  const supabase = createClient();
  const channel = supabase.channel(`name:${userId}:${mountId}`)
    .on('postgres_changes', { … }, handler)
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}, [userId, mountId]);
```

**Channel name uniqueness:** In React Strict Mode, setup→teardown→setup fires twice in dev.
Use `useId()` as a mount suffix (`${baseChannel}:${mountId}`) so the second setup creates a
fresh channel rather than calling `.on()` on an already-subscribed one.

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
| `services/tasks-service.ts` | OS Tasks queries — `getPersonalTasks`, `getGroupTasks`, `getGroupSubtasks`, `getTaskById`, `getTaskRemarks` (ordered ASC, returns `TaskRemarkWithAuthor[]`). Also exports `TaskRemarkWithAuthor` — canonical type definition. |
| `services/sla-service.ts` | Gia SLA Engine DB queries — `getSlaTimersForLead`, `getSlaTimerForLeadAndRule`, `createSlaTimer`, `updateSlaTimerRunId`, `cancelSlaTimersForLeadInDb`, `markSlaTimerFired`, `getOpenGiaFollowupTask`, `getManagersByDomain`. All writes use adminClient (service-role). |
| `services/agent-routing-service.ts` | `getAgentRoutingConfig`, `getRoutingConfigsByDomain`, `getActiveRoutingConfigs`, `setRoutingActive`, `getAgentRosterByDomain` (joined profiles+config, adminClient), `setAgentShift` (adminClient) |

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

## unstable_cache key rule

When wrapping a service function in `unstable_cache`, the cache key **must** include every dimension that scopes the result. For domain-scoped queries, the caller's domain must be in the key — a manager in `concierge` must never receive a cached response intended for `finance`.

```ts
// ✅ Correct — domain in key
unstable_cache(() => queryFn(), ['some-tag', domain, JSON.stringify(filters)], { ... })

// ✗ Wrong — omits domain, cross-domain cache hit possible
unstable_cache(() => queryFn(), ['some-tag'], { ... })
```

**Reference implementation:** `getGroupTasks` in `services/tasks-service.ts`
- Cache tag: `'group-tasks'`
- TTL: 60s
- Revalidation sites: `createGroupTaskAction`, `createSubtaskAction` (both call `revalidateTag('group-tasks', { expire: 0 })` after successful insert)
- Note: `{ expire: 0 }` required as second arg in Next.js 16 (first arg only is a TS error)

## getPersonalTasks — fully RPC-backed (TD-003 resolved 2026-05-29)

`getPersonalTasks` is backed entirely by the `get_personal_tasks` RPC. **There is no split path.** Both page 1 (no cursor) and pages 2+ (with cursor) call the same RPC function. The PostgREST cursor path was retired in migration 0026.

Sort order is identical on every page: `due_at ASC NULLS LAST → priority CASE (urgent=1, high=2, normal=3) → id ASC`.

The three cursor RPC params (`p_cursor_id`, `p_cursor_due_at`, `p_cursor_has_due_at`) are all `null` for page 1. `p_cursor_has_due_at` disambiguates the null-cursor case: `true` = cursor row had a deadline; `false` = cursor row had no deadline (only remaining null-due_at rows returned).

**Rules that must never be violated:**
- No JavaScript `.sort()` on the result of `getPersonalTasks`.
- No PostgREST `.order()`, `.or()`, `.lte()`, `.in()` chain inside `getPersonalTasks`.
- No split-path `if (!cursor)` with different query strategies for cursor vs no-cursor pages.

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
| `actions/agent-routing.ts` | `toggleAgentRouting`, `setAgentShiftAction` |
| `actions/leads.ts` | Lead lifecycle actions |
| `actions/dashboard.ts` | Dashboard widget data refresh |
| `actions/notifications.ts` | `markNotificationReadAction`, `markAllReadAction` |
| `actions/tasks.ts` | OS Tasks actions — `createPersonalTaskAction`, `createGroupTaskAction`, `createSubtaskAction`, `updateTaskStatusAction`, `updateTaskAction`, `deleteTaskAction`, `addTaskRemarkAction`, `suppressTaskRemarkAction` |
| `actions/sla.ts` | Gia SLA Engine actions — `scheduleSlaTimersForLead`, `cancelSlaTimersForLead`, `refreshActivitySlaTimers`, `fireSlaBreachAction` (Trigger.dev only), `fireSlaBreachHandler` (internal) |

## Trigger.dev jobs

| File | Purpose |
| ---- | ------- |
| `src/trigger/task-reminders.ts` | `scheduleTaskReminder(taskId, dueAt, assignedTo)`, `cancelTaskReminder(taskId)` |
| `src/trigger/lead-sla.ts` | `scheduleLeadSlasTask(leadId, ruleCode, fireAt, assignedAgentId, domainManagerIds)`, `cancelLeadSlasByLeadTask(leadId)`, `fireLeadSlaTask` (Trigger.dev task — exported for scan) |

**Rule:** `scheduleTaskReminder` is a no-op when `dueAt - 30min < now()`. It never errors on past dates.
**Rule:** `deleteTaskAction` cancels the Trigger.dev reminder **before** the DB delete. If cancel throws, the delete is aborted.
**Rule:** Tags (`task-reminder-${taskId}`) are used to locate and cancel runs — no run IDs stored in the DB.

**`lead-sla.ts` three exports:**
- `scheduleLeadSlasTask` — schedules one delayed job per (leadId, ruleCode) pair. Idempotency key `lead-sla-${leadId}-${ruleCode}`. Tag `lead-sla-${leadId}`.
- `cancelLeadSlasByLeadTask` — lists all DELAYED/QUEUED runs for tag `lead-sla-${leadId}`, cancels each, then calls `cancelSlaTimersForLeadInDb`.
- `fireLeadSlaTask` — Trigger.dev task (internal); calls `fireSlaBreachAction` from `lib/actions/sla.ts`.

**Three hook points in `lib/actions/leads.ts`:**
1. `assignLead` + `createManualLead` — after assignment write: update `status_changed_at` + `last_activity_at`, call `scheduleSlaTimersForLead({ leadId, status: 'new', ... })`.
2. `updateLeadStatus` — after status write: update `status_changed_at`; if terminal → `cancelSlaTimersForLead`; else → `scheduleSlaTimersForLead` (cancel-then-reschedule).
3. `addLeadCallNote` — after note write: update `last_activity_at`; if auto-advanced new→touched → `scheduleSlaTimersForLead`; else → `refreshActivitySlaTimers` (SLA-02/03 only; SLA-01 never refreshed by activity).

## addTaskRemarkAction — pattern

`addTaskRemarkAction` is the ONLY path that inserts into `task_remarks`. It accepts:
- `taskId` (uuid) — the task to remark on
- `content` (string, 1–2000 chars, sanitized by Zod transform + explicit re-sanitize)
- `statusChange` (optional `TaskStatus`) — if provided, calls `updateTaskStatusAction` first and records the transition in `status_change` column

**Status change flow:** `updateTaskStatusAction` is called internally. Its logic is NOT duplicated. If the status update fails, the remark insert is aborted. `updateTaskStatusAction` does not insert a remark — no circular dependency.

**Access:** caller must be `assigned_to`, `created_by`, or `manager+`. Checked at action layer (belt-and-braces over RLS).

**Returns:** `ActionResult<TaskRemark>` — full remark row (not just an id).

## suppressTaskRemarkAction — pattern and column restriction

`suppressTaskRemarkAction` in `src/lib/actions/tasks.ts` is the ONLY path that may set `is_suppressed = true` on a `task_remarks` row.

**Column restriction:** The RLS UPDATE policy (`task_remarks_suppression_update`) permits admin/founder to update `task_remarks` rows but does NOT restrict which columns change. PostgreSQL RLS has no column-level write restriction. The action enforces the restriction by only writing `{ is_suppressed, suppressed_by, suppressed_at }`. Never add code that writes `content`, `author_id`, `task_id`, or `status_change` through this action.

**Why adminClient:** The action uses `createAdminClient()` for the update because the user client would need the RLS UPDATE policy to fire — the admin client bypasses RLS. The application-layer auth check (`['admin', 'founder'].includes(caller.role)`) provides the security equivalent.

**Idempotent:** Calling the action on an already-suppressed remark is a no-op (returns `{ data: { remarkId }, error: null }` without issuing a DB write).

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
