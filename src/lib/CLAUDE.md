# Lib CLAUDE.md — stub. Update as patterns are established

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
| `constants/domains.ts` | `APP_DOMAINS` (user mgmt), `GIA_DOMAINS` (Gia module), `DOMAIN_LABELS`, `GIA_DOMAIN_ENUM`, `APP_DOMAIN_ENUM` — see Q-17 in `docs/The_Rules.md` |
| `constants/lead-statuses.ts` | `LeadStatus` enums + badge config |
| `constants/call-outcomes.ts` | `CallOutcome` enums + labels |
| `constants/task-types.ts` | `TASK_TYPES`: `call`, `whatsapp_message`, `other` + `TASK_TYPE_LABELS` |
| `constants/lead-sources.ts` | `LEAD_SOURCES`, `LEAD_SOURCE_LABELS`, `LEAD_SOURCE_OPTIONS`, `getLeadSourceLabel()` — canonical lead source on `leads.utm_source` |
| `constants/task-constants.ts` | `TASK_PRIORITY`, `TASK_STATUS`, `TASK_CATEGORY` — labels, CSS token colours, sort order. `TASK_STATUS` also has `pillBg`/`pillText` and `remarkBg`/`remarkColor`/`remarkBorder` for pills and remark chips |
| `constants/campaign-domain-map.ts` | prefix → domain mapping |
| `constants/lead-columns.ts` | Column registry for the leads table — `LEAD_COLUMNS`, `LEAD_COLUMN_MAP`, `DEFAULT_COLUMN_ORDER`, `isValidLeadColumnId`. IDs are stable localStorage keys — never rename after shipping. |
| `constants/whatsapp.ts` | `WHATSAPP_API_VERSION`, `WHATSAPP_API_BASE`, `WHATSAPP_MESSAGE_TYPES`, `WHATSAPP_CONVERSATION_STATUS`, `WHATSAPP_SENDER_TYPE`, `WHATSAPP_DIRECTION`, `WHATSAPP_MESSAGE_STATUS`, `WHATSAPP_NOTIFICATION_TEMPLATES`, `WHATSAPP_MESSAGES_PAGE_SIZE`, `WHATSAPP_CONVERSATIONS_PAGE_SIZE`. Template IDs: `GUPSHUP_LEAD_ASSIGNMENT_TEMPLATE_ID`, `GUPSHUP_FOUNDER_LEAD_NOTIFICATION_TEMPLATE_ID`, `GUPSHUP_SLA_AGENT_TEMPLATE_ID`, `GUPSHUP_SLA_MANAGER_TEMPLATE_ID`, `GUPSHUP_LEAD_INITIATION_TEMPLATE_ID`. No secret env vars here — `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_WEBHOOK_SECRET` live in `process.env` only (S-11). |

## Services registry

| File | Purpose |
| ---- | ------- |
| `services/profiles-service.ts` | Profile DB queries |
| `services/leads-service.ts` | Lead DB queries — `getLeadsByRole`, `getLeadBySlug`, `getLeadById`, `getCampaignMetrics`, `searchLeadsForTask`, etc. **Redis cache-aside active** on `getLeadsByRole` (30s list + dossier warm for each row returned), `getLeadBySlug` (120s), `getLeadById` (120s), `getLeadFilterOptions` (300s), `getLeadNotesFull` (120s), `getLeadActivitiesFull` (120s), `getCampaignMetrics` (120s, pre-search), `getCampaignDetailMetrics` (120s), `getCampaignAgentDistribution` (120s). Key schema: `src/lib/constants/redis-keys.ts`. List key includes role + callerDomain + userId — cross-domain bleed impossible. Actions invalidate on write: `addLeadCallNote`, `updateLeadStatus`, `assignLead`, `addLeadNote`, `createManualLead` (prefix-scan del of all list pages for caller's scope). |
| `services/deals-service.ts` | `getDealsByRole`, `getDealsSummary` (RPC wrapper for `/deals`) |
| `services/notifications-service.ts` | Notification reads/writes |
| `services/dashboard-service.ts` | Dashboard data. Primary entry point: `getDashboardSummary(role, domain, userId)` — single RPC, memoised with React `cache()` per request (cannot use `unstable_cache` — `createClient()` reads `cookies()` which is forbidden inside `unstable_cache` closures). Do not split back into individual action calls for summary data. `getLeadVolumeByPeriod` is the only individual function still used (period toggle). **Redis cache-aside active** on `getLeadStatusSummary` (60s), `getLeadVolumeByPeriod` (120s), `getLeadVolumeByDomains` (120s), `getLeadsByCampaign` (120s). Key schema: `src/lib/constants/redis-keys.ts`. TTL-only invalidation — no explicit del in leads actions. |
| `services/performance-service.ts` | Performance page queries. **Redis cache-aside active** on all 6 service functions (key namespace `perf:`, TTL 30–120s): `_getCoreFourMetricsForRange` (60s), `getEffortMetrics` (30s), `getCallOutcomeBreakdown` (60s), `getTeamBenchmarks` (120s), `getAgentRosterPerformance` (120s), `getAgentDetailMetrics` (30s). Key schema: `src/lib/constants/redis-keys.ts` (`REDIS_KEYS.perf.*`, `PERF_*_TTL`). `domain` excluded from `perf:agent-detail` key — auth-only, does not filter query result. |
| `services/ad-creatives-service.ts` | `getAdCreativesForCampaign` (one campaign → `AdCreative[]`, newest first), `getAdCreativesForCampaigns` (batch → `Map<key, AdCreative[]>`), `getAllAdCreatives` (admin list, newest-first). A campaign may have multiple videos (migration 0058 dropped the UNIQUE on campaign_key). **Redis cache-aside active** on `getAdCreativesForCampaign` (300s) and `getAdCreativesForCampaigns` (300s per-key, batched DB on miss). `upsertAdCreative` / `deleteAdCreative` del `campaign:ad-creative:{key}` after write. |
| `services/tasks-service.ts` | OS Tasks — `getPersonalTasks`, `getGroupTasks`, `getGroupSubtasks(groupId, userId)`, `getTaskById`, `getTaskRemarks`, `getAllLeadTasks`, `getGiaTasksForUser`. Exports `TaskRemarkWithAuthor`. **Redis cache-aside active** on `getGiaTasksForUser` (60s), `getGroupTasks` unfiltered (120s, domain+role key), `getPersonalTasks` page-1 (30s), `getGroupSubtasks` (30s, userId-scoped), `getTaskRemarks` (30s). Key schema: `src/lib/constants/redis-keys.ts` (`REDIS_KEYS.task.*`). Invalidation: see `src/app/(dashboard)/tasks/CLAUDE.md` invalidation table. |
| `services/sla-service.ts` | Gia SLA Engine DB queries — `getSlaTimersForLead`, `getSlaTimerForLeadAndRule`, `createSlaTimer`, `updateSlaTimerRunId`, `cancelSlaTimersForLeadInDb`, `markSlaTimerFired`, `getOpenGiaFollowupTask`, `getManagersByDomain`. All writes use adminClient (service-role). |
| `services/agent-routing-service.ts` | `getAgentRoutingConfig`, `getRoutingConfigsByDomain`, `getActiveRoutingConfigs`, `setRoutingActive`, `getAgentRosterByDomain` (joined profiles+config, adminClient), `setAgentShift` (adminClient) |
| `services/lead-ingestion.ts` | Webhook lead ingestion pipeline. Also exports `createLeadFromWhatsApp(waId, phone): Promise<{leadId, assignedTo}>` — called by `whatsapp-ingestion.ts` when an inbound message arrives from an unknown number. Uses adminClient. |
| `services/whatsapp-api.ts` | **SERVER ONLY.** Gupshup/Meta Cloud API HTTP client. Exports: `sendTextMessage`, `sendTemplateMessage`, `sendMediaMessage`, `uploadMedia`, `getMediaDownloadUrl`, `verifyMetaSignature` (HMAC-SHA256 + `timingSafeEqual`), `sendLeadAssignmentNotification`, `sendFounderLeadNotification`, `sendSlaAgentNotification` (4 params: leadName, leadPhone, status, lastUpdatedAt — template `GUPSHUP_SLA_AGENT_TEMPLATE_ID`), `sendSlaManagerNotification` (recipientIds[], 5 params: leadName, leadPhone, agentName, status, lastUpdatedAt — template `GUPSHUP_SLA_MANAGER_TEMPLATE_ID`), `sendLeadInitiationMessage` (to, leadName, agentName — template `GUPSHUP_LEAD_INITIATION_TEMPLATE_ID`; **CAN THROW** — action layer catches; does NOT call logNotification), `WEBHOOK_VERIFY_TOKEN`, `BUSINESS_ACCOUNT_ID`. Internal `logNotification()` writes every template attempt to `whatsapp_notification_logs` (stores last-4 phone digits only, never full numbers). Fire-and-forget functions never throw to caller; `sendLeadInitiationMessage` is the sole exception. Never import in client components. **Audit (2026-06-01):** all 4 send functions verified — null phone guards present, parameter counts/order correct, logNotification called on both HTTP-error and fetch-throw paths (fix applied), no full phone numbers in logs, no notification awaited in hot path. Call sites: `src/lib/actions/leads.ts` (assignLead L318/L333, createManualLead L612/L621), `src/lib/actions/sla.ts` (fireSlaBreachHandler L362/L444), `src/app/api/webhooks/leads/route.ts` (L118/L127), `src/lib/services/whatsapp-ingestion.ts` (L127/L143). |
| `services/whatsapp-ingestion.ts` | **SERVER ONLY.** Inbound WhatsApp processing pipeline. Uses adminClient throughout. Exports: `parseWebhookPayload` (flattens nested Meta envelope), `processInboundMessage` (full 9-step pipeline, idempotent via wa_message_id dedup), `processStatusUpdate` (delivery receipt — the ONLY UPDATE on whatsapp_messages, uses adminClient, A-11 narrow exception), `resolveLeadByPhone`, `getOrCreateConversation` (SELECT → INSERT ON CONFLICT DO NOTHING → re-SELECT), `insertInboundMessage` (sanitizes content with sanitizeText). |
| `services/whatsapp-service.ts` | UI-facing WhatsApp queries. Uses session client — RLS handles access. Exports: `getConversations` (paginated, cursor = last_message_at), `getConversation`, `getConversationByLeadId` (single row by lead_id FK, returns null when none — used by lead dossier), `getMessages` (paginated ASC, joins sender profile), `getUnreadCount` (calls `get_wa_unread_count` RPC — per-agent LEFT JOIN unread count, returns 0 never null), `markConversationRead` (UPSERT into whatsapp_conversation_reads), `searchConversations` (ILIKE on name/phone, sanitized, max 20). |

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

## unstable_cache + cookies() — hard constraint

`unstable_cache` closures **cannot** call `cookies()` or `headers()`. Next.js throws at runtime:

> Route used `cookies()` inside a function cached with `unstable_cache()`. Accessing Dynamic data sources inside a cache scope is not supported.

`createClient()` from `src/lib/supabase/server.ts` calls `cookies()` internally. Therefore any service function that calls `createClient()` **cannot** be wrapped in `unstable_cache`.

**The correct alternative:** use React `cache()` from `'react'`. It deduplicates within a single RSC render pass (per-request memoisation) and has no restriction on dynamic data sources.

```ts
// ✅ Correct — createClient() calls cookies(); use React cache() instead
import { cache } from 'react';
export const myServiceFn = cache(async (arg: string) => {
  const supabase = await createClient();
  // ...
});

// ✗ Wrong — throws at runtime when createClient() is called inside the closure
import { unstable_cache } from 'next/cache';
export const myServiceFn = unstable_cache(async (arg: string) => {
  const supabase = await createClient(); // ← cookies() call → runtime error
  // ...
}, ['key']);
```

**Reference implementation:** `getDashboardSummary` in `services/dashboard-service.ts`.

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

## addLeadCallNote and updateLeadStatus — RPC-backed writes

Both actions call `SECURITY DEFINER` RPCs for all DB writes. Do not add sequential `await` DB calls to these actions.

- `addLeadCallNote` calls `add_lead_call_note` RPC (migration 0030) — 1 round-trip for: note insert + lead UPDATE + 2–3 activity inserts.
- `updateLeadStatus` calls `update_lead_status` RPC (migration 0031) — 1 round-trip for: lead UPDATE + activity insert + optional nurturing task + task_gia_meta.

**What stays in the action layer:** Zod validation, auth/access check, won notifications, SLA scheduling (Trigger.dev). These are application-layer concerns that cannot go inside a Postgres function.

## Actions registry

| File | Purpose |
| ---- | ------- |
| `actions/whatsapp.ts` | WhatsApp actions — `sendWhatsAppMessage`, `markConversationAsRead`, `resolveConversation`, `reopenConversation`, `getConversationsAction`, `getMessagesAction`, `searchConversationsAction`, `getConversationByLeadIdAction` (by lead UUID, returns `{ data, error }`, null data = no conversation — not an error), `initiateWhatsAppConversationAction` (creates conversation + sends initiation template; adminClient INSERT; returns `{ data: { conversation, message }, error }`; idempotent — returns existing conversation on race) |
| `actions/profiles.ts` | User/profile management |
| `actions/agent-routing.ts` | `toggleAgentRouting`, `setAgentShiftAction` |
| `actions/leads.ts` | Lead lifecycle — `addLeadCallNote`, `addLeadNote`, `updateLeadStatus`, `assignLead`, `createManualLead`, `createLeadTaskAction`, `recordDeal`, `updateLeadEmail`, `updateLeadDomain`, `updateLeadUtmSource`, `updatePersonalDetails`, `updateScratchpad`, `listAgentsForDomain`, `searchLeadsAction` |
| `actions/dashboard.ts` | Dashboard widget data refresh |
| `actions/ad-creatives.ts` | `upsertAdCreative`, `deleteAdCreative` (admin/founder only; adminClient writes; normalise campaign_key; revalidate /admin/ad-creatives + /campaigns) |
| `actions/notifications.ts` | `markNotificationReadAction`, `markAllReadAction` |
| `actions/tasks.ts` | OS Tasks actions — `createPersonalTaskAction`, `createGroupTaskAction`, `createSubtaskAction`, `updateTaskStatusAction`, `updateTaskAction`, `deleteTaskAction`, `addTaskRemarkAction`, `suppressTaskRemarkAction` |
| `actions/sla.ts` | Gia SLA Engine actions — `scheduleSlaTimersForLead`, `cancelSlaTimersForLead`, `refreshActivitySlaTimers`, `fireSlaBreachAction` (Trigger.dev only), `fireSlaBreachHandler` (internal) |

## Types registry

| File | Purpose |
| ---- | ------- |
| `types/database.ts` | Auto-generated Supabase row types. Regenerate with `supabase gen types typescript --local`. Never hand-edit. |
| `types/index.ts` | Shared app types not tied to a single DB table (e.g. `DashboardSummary`, `ActionResult`). |
| `types/whatsapp.ts` | Meta Cloud API payload shapes (`MetaWebhookPayload`, `MetaInboundMessage` discriminated union, `MetaStatusUpdate`, `MetaApiResponse`, `TemplateComponent`) + app-internal types (`WhatsAppConversation`, `WhatsAppMessage`, `SendMessageInput`). Types only — no runtime values. |

## Validations registry

| File | Purpose |
| ---- | ------- |
| `validations/profile-schema.ts` | Profile create/update/auth/deactivate/invite/avatar schemas |
| `validations/lead-schema.ts` | Lead schemas — includes `CreateManualLeadSchema.utm_source`, `UpdateLeadUtmSourceSchema`, `createLeadTask` / `recordDeal` |
| `validations/task-schemas.ts` | OS Tasks schemas (create personal/group/subtask, update, checklist, tags, remarks) |
| `validations/ad-creative-schema.ts` | `upsertAdCreativeSchema` (id optional → create/update), `deleteAdCreativeSchema` |
| `validations/whatsapp-schema.ts` | `MetaWebhookPayloadSchema` (permissive passthrough), `MetaStatusUpdateSchema`, `SendMessageSchema` (conversationId uuid + content 1–4096 chars), `ResolveConversationSchema`. Human-readable error messages — never Zod defaults. |

## Trigger.dev jobs

| File | Purpose |
| ---- | ------- |
| `src/trigger/task-reminders.ts` | `scheduleTaskReminder(taskId, dueAt, assignedTo)`, `cancelTaskReminder(taskId)` |
| `src/trigger/lead-sla.ts` | `scheduleLeadSlasTask(leadId, ruleCode, fireAt, assignedAgentId, domainManagerIds)`, `cancelLeadSlasByLeadTask(leadId)`, `fireLeadSlaTask` (Trigger.dev task — exported for scan) |

**Rule:** `scheduleTaskReminder` is a no-op when `dueAt <= now()`. It never errors on past dates. The Trigger.dev job fires at `dueAt`, not before.
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

## addTaskRemarkAction — RPC-backed (perf-02)

`addTaskRemarkAction` is the ONLY path that inserts into `task_remarks`. It accepts:

- `taskId` (uuid) — the task to remark on
- `content` (string, 1–2000 chars, sanitized by Zod transform + explicit re-sanitize)
- `statusChange` (optional `TaskStatus`) — if provided, the RPC handles both the tasks UPDATE and the INSERT atomically

**Implementation:** calls `add_task_remark_with_status` RPC (migration 0035, auth fix 00051) — 1 round-trip for both the optional status UPDATE and the task_remarks INSERT. **View = post:** the action gates on a user-scoped `tasks` SELECT (RLS); if the row is visible, the remark is allowed. The RPC trusts the action layer (service-role — `auth.uid()` is NULL inside the function).

**Access:** Zod validation + `getCurrentProfile()` in the action (A-09 layer 1). User-scoped `tasks` SELECT must return the row before the RPC runs (A-09 layer 2). The RPC does **not** call `auth.uid()` — it is NULL under `adminClient`.

**`updateTaskStatusAction` is NOT called from `addTaskRemarkAction`.** The status update is handled entirely inside the RPC. `updateTaskStatusAction` remains for direct, remark-free status changes.

**`log_task_changes()` trigger:** The UPDATE inside the RPC fires the audit trigger — status changes are still fully audited.

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
