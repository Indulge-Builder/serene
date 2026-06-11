# Lib CLAUDE.md — actions · services · constants · validations · types

> Rule IDs cited below (A/S/P/Q/R-…) resolve in `docs/rules/The_Rules.md` — its Section 0
> "Reuse First" makes every "THE x" entry in these registries the only implementation
> allowed to exist (R-02).

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
| `constants/define-enum.ts` | `defineEnum([{ id, label }])` — THE factory for simple string-enum constants (dry-audit L-7): derives `values` / `labels` / `options` / `zodEnum` from one source array so they cannot drift. Used by `lead-sources`, `deal-types`, `task-types`, `call-outcomes`. For DB-union enums, annotate the exports (`TaskType[]`, `Record<TaskType, string>`) to keep exhaustiveness. Richer config tables (`TASK_PRIORITY`/`TASK_STATUS` colour shapes, lead-status badges, domain subsets) deliberately stay hand-written. |
| `constants/roles.ts` | `USER_ROLES`, `ROLE_LABELS` |
| `constants/domains.ts` | `APP_DOMAINS` (user mgmt), `GIA_DOMAINS` (Gia module), `DOMAIN_LABELS`, `GIA_DOMAIN_ENUM`, `APP_DOMAIN_ENUM` — see Q-17 in `docs/rules/The_Rules.md` |
| `constants/lead-statuses.ts` | `LeadStatus` enums + badge config |
| `constants/call-outcomes.ts` | `CallOutcome` enums + labels |
| `constants/task-types.ts` | `TASK_TYPES`: `call`, `whatsapp_message`, `other` + `TASK_TYPE_LABELS` |
| `constants/lead-sources.ts` | `LEAD_SOURCES`, `LEAD_SOURCE_LABELS`, `LEAD_SOURCE_OPTIONS`, `getLeadSourceLabel()` — canonical lead source on `leads.source` (renamed from `utm_source` in the 0065 attribution refactor). Webhook leads store channel on `platform`; manual/dossier edits use `source`. |
| `constants/task-constants.ts` | `TASK_PRIORITY`, `TASK_STATUS`, `TASK_CATEGORY` — labels, CSS token colours, sort order. `TASK_STATUS` also has `pillBg`/`pillText` and `remarkBg`/`remarkColor`/`remarkBorder` for pills and remark chips |
| `constants/campaign-domain-map.ts` | prefix → domain mapping |
| `constants/lead-columns.ts` | Column registry for the leads table — `LEAD_COLUMNS`, `LEAD_COLUMN_MAP`, `DEFAULT_COLUMN_ORDER`, `isValidLeadColumnId`. IDs are stable localStorage keys — never rename after shipping. |
| `constants/whatsapp.ts` | `WHATSAPP_API_VERSION`, `WHATSAPP_API_BASE`, `WHATSAPP_MESSAGE_TYPES`, `WHATSAPP_CONVERSATION_STATUS`, `WHATSAPP_SENDER_TYPE`, `WHATSAPP_DIRECTION`, `WHATSAPP_MESSAGE_STATUS`, `WHATSAPP_NOTIFICATION_TEMPLATES`, `WHATSAPP_MESSAGES_PAGE_SIZE`, `WHATSAPP_CONVERSATIONS_PAGE_SIZE`. Template IDs: `GUPSHUP_LEAD_ASSIGNMENT_TEMPLATE_ID`, `GUPSHUP_FOUNDER_LEAD_NOTIFICATION_TEMPLATE_ID`, `GUPSHUP_SLA_AGENT_TEMPLATE_ID`, `GUPSHUP_SLA_MANAGER_TEMPLATE_ID`, `GUPSHUP_LEAD_INITIATION_TEMPLATE_ID`. No secret env vars here — `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_WEBHOOK_SECRET` live in `process.env` only (S-11). |

## Services registry

| File | Purpose |
| ---- | ------- |
| `services/profiles-service.ts` | Profile DB queries. `getAssignableUsers({ domain?, agentsOnly? })` — THE assignable-users query (dry-audit M-11): default all active non-guest users; `domain` scopes to one domain; `agentsOnly` restricts to agents. Never fork another profiles query for assignability. React `cache()`-memoised per request behind the public wrapper (perf audit E-3) — the memo takes primitive args (`domain, agentsOnly`) because `cache()` keys object args by reference; deliberately NOT Redis-cached (a 60s-stale list could offer a just-deactivated assignee). |
| `services/leads-service.ts` | Lead DB queries — `getLeadsByRole`, `getLeadBySlug`, `getLeadById`, `getCampaignMetrics`, `searchLeadsForTask`, etc. **Search (every path):** single ILIKE on the generated `leads.search_text` column (migration 0098, pg_trgm GIN-indexed) in `getLeadsByRole`, `getLeadsForExport`, `searchLeadsForTask` AND the `get_leads_status_counts` RPC — never reintroduce per-column OR-ILIKE chains (unindexed + drift from count pills). **totalCount (C-1):** derived as the sum of `get_leads_status_counts` rows (one predicate scan); the paginated query carries NO `{ count: 'exact' }` — never re-add it. `getLeadsByRole` hoists all filter values into one block consumed by both the query and the RPC so predicates cannot drift. **Redis cache-aside active** on `getLeadsByRole` (30s list; dossier row keys deliberately NOT warmed — the list query selects a column subset that would corrupt `getLeadById`/`getLeadBySlug` reads), `getLeadBySlug` (120s), `getLeadById` (120s), `getLeadFilterOptions` (300s), `getLeadNotesFull` (120s), `getLeadActivitiesFull` (120s). Key schema: `src/lib/constants/redis-keys.ts`. List key includes role + callerDomain + userId — cross-domain bleed impossible. **List read is ONE Upstash round trip (perf audit C-3):** a single MGET fetches the `leadListVersion` counter and the list entry together; the entry is a `{ v, result }` envelope and hits only when `v` matches the live counter — never reintroduce the version-read-then-list-read two-RTT shape, and never put the version back in the key. Actions invalidate on write via `invalidateLeadCaches` `lists` scope: `addLeadCallNote`, `updateLeadStatus`, `assignLead`, `addLeadNote`, `createManualLead` (version-counter INCR voids all cached pages for agent+manager scopes; admin/founder lists are 30s-TTL-only by design). **NOT cached (no Redis):** the campaign RPC functions `getCampaignMetrics`, `getCampaignDetailMetrics`, `getCampaignAgentDistribution` call their RPCs directly — always live. There is no `REDIS_KEYS.campaign.*` namespace; do not add campaign cache claims without adding the code first. |
| `services/deals-service.ts` | `getDealsByRole`, `getDealsSummary` (RPC wrapper for `/deals`), `getLeadDeal(leadId)` (single `Deal` for the lead dossier's `LeadDealCard`; returns null when the lead has no deal) |
| `services/lead-cache.ts` | `invalidateLeadCaches(site, { leadId, slug, domain }, scope)` — THE lead Redis-invalidation helper. Scope flags: `row` (dual-key leadRowId + leadRowSlug), `notes`, `activities`, `lists` (version-counter INCRs for agent+manager), `dashboard` (all-time lead-status + campaigns slots). Always `await`-ed by callers before `revalidatePath`; Redis failure is non-fatal (warn). Dashboard volume keys are intentionally out of scope — read-side keys embed ISO `from:to`, TTL-only freshness (120s). Never hand-roll a `redis.del` block in a lead action. |
| `services/notifications-service.ts` | Notification reads/writes |
| `services/dashboard-service.ts` | Dashboard data. Primary entry point: `getDashboardSummary(role, domain, userId)` — single RPC, memoised with React `cache()` per request (per-user result — `unstable_cache` would share it across users). Do not split back into individual action calls for summary data. **The four scope-param RPC wrappers (`getDashboardSummary`, `getAgentRecentActivity`, `getLeadStatusSummary`, `getLeadsByCampaign`) call their RPC via `createAdminClient()` — EXECUTE revoked from `authenticated` (migration 0102, audit F-1); scope args must stay session-derived (Q-13).** `getLeadVolumeByPeriod` is the only individual function still used (period toggle). **Redis cache-aside active** on `getLeadStatusSummary` (60s), `getLeadVolumeByPeriod` (120s), `getLeadVolumeByDomains` (120s), `getLeadsByCampaign` (120s). Key schema: `src/lib/constants/redis-keys.ts`. TTL-only invalidation — no explicit del in leads actions. |
| `services/performance-service.ts` | Performance page queries — RPC-backed since perf audit D-2 (migration 0101). `getAgentPerformanceSummary(period, from?, to?)` — ONE self-scoped `get_agent_performance` call returning core four + previous period + effort + outcomes + team benchmarks (React `cache()`-wrapped; the RPC reads `auth.uid()`/`get_user_domain()`, no identity params). `getAgentRosterPerformance(domain, from, to)` — ONE `get_agent_roster_performance` call, one pre-aggregated row per agent (manager pinned to own domain in SQL). `getAgentDetailMetrics` (3 parallel queries) and `getDomainHealthMetrics` (RPC 0066) unchanged. Rate math + null-vs-zero semantics live in the service mappers, not SQL. **No Redis** — the previously documented `perf:*` cache-aside namespace never existed in code (stale doc, corrected 2026-06-11); never reintroduce per-metric functions that ship cohort lead rows to Node. |
| `services/ad-creatives-service.ts` | `getAdCreativesForCampaign` (one campaign → `AdCreative[]`, newest first), `getAdCreativesForCampaigns` (batch → `Map<key, AdCreative[]>`, single `.in('campaign_key', keys)` query), `getAllAdCreatives` (admin list, newest-first). A campaign may have multiple videos (migration 0058 dropped the UNIQUE on campaign_key). **No Redis cache-aside** — these are plain Supabase queries; freshness comes from `revalidatePath('/admin/ad-creatives')` + `revalidatePath('/campaigns')` in `upsertAdCreative` / `deleteAdCreative`. |
| `services/tasks-service.ts` | OS Tasks — `getPersonalTasks`, `getGroupTasks`, `getGroupSubtasks(groupId, userId)`, `getTaskById`, `getTaskRemarks`, `getAllLeadTasks`, `getGiaTasksForUser`. Exports `TaskRemarkWithAuthor`. **Redis cache-aside active** on `getGiaTasksForUser` (60s), `getGroupTasks` unfiltered (120s, domain+role key), `getPersonalTasks` page-1 (30s), `getGroupSubtasks` (30s, userId-scoped), `getTaskRemarks` (30s). Key schema: `src/lib/constants/redis-keys.ts` (`REDIS_KEYS.task.*`). Invalidation: see `src/app/(dashboard)/tasks/CLAUDE.md` invalidation table. |
| `services/sla-service.ts` | Gia SLA Engine DB queries — `getSlaTimersForLead`, `getSlaTimerForLeadAndRule`, `createSlaTimer`, `updateSlaTimerRunId`, `cancelSlaTimersForLeadInDb`, `markSlaTimerFired`, `getOpenGiaFollowupTask`, `getManagersByDomain`. All writes use adminClient (service-role). |
| `services/agent-routing-service.ts` | `getAgentRoutingConfig`, `getRoutingConfigsByDomain`, `getActiveRoutingConfigs`, `setRoutingActive`, `getAgentRosterByDomain` (joined profiles+config, adminClient), `setAgentShift` (adminClient) |
| `services/lead-ingestion.ts` | Webhook lead ingestion pipeline. Also exports `createLeadFromWhatsApp(waId, phone): Promise<{leadId, assignedTo}>` — called by `whatsapp-ingestion.ts` when an inbound message arrives from an unknown number. Uses adminClient. |
| `services/whatsapp-api.ts` | **SERVER ONLY.** Gupshup/Meta Cloud API HTTP client. Exports: `sendTextMessage`, `sendTemplateMessage`, `sendMediaMessage`, `uploadMedia`, `getMediaDownloadUrl`, `verifyMetaSignature` (HMAC-SHA256 + `timingSafeEqual`), `sendLeadAssignmentNotification`, `sendFounderLeadNotification`, `sendSlaAgentNotification` (4 params: leadName, leadPhone, status, lastUpdatedAt — template `GUPSHUP_SLA_AGENT_TEMPLATE_ID`), `sendSlaManagerNotification` (recipientIds[], 5 params: leadName, leadPhone, agentName, status, lastUpdatedAt — template `GUPSHUP_SLA_MANAGER_TEMPLATE_ID`), `sendLeadInitiationMessage` (to, leadName, agentName — template `GUPSHUP_LEAD_INITIATION_TEMPLATE_ID`; **CAN THROW** — action layer catches; logs every attempt as `type: 'lead_initiation'` since migration 0067), `WEBHOOK_VERIFY_TOKEN`, `BUSINESS_ACCOUNT_ID`. **All five template senders are thin wrappers over the internal `sendGupshupTemplate()` core** (dry-audit H-8) — it owns the `/template/msg` fetch, status/body/delivered capture, console line, and the one-log-row-per-attempt `finally { await logNotification }` contract; never call the Gupshup template endpoint outside it (see `src/lib/services/CLAUDE.md`). Internal `logNotification()` writes every template attempt to `whatsapp_notification_logs` (stores last-4 phone digits only, never full numbers). Fire-and-forget functions never throw to caller; `sendLeadInitiationMessage` is the sole exception (`throwOnError: true`). Never import in client components. **Audit (2026-06-01):** all 4 send functions verified — null phone guards present, parameter counts/order correct, logNotification called on both HTTP-error and fetch-throw paths (fix applied), no full phone numbers in logs, no notification awaited in hot path. Call sites: `src/lib/actions/leads.ts` (assignLead L318/L333, createManualLead L612/L621), `src/lib/actions/sla.ts` (fireSlaBreachHandler L362/L444), `src/app/api/webhooks/leads/route.ts` (L118/L127), `src/lib/services/whatsapp-ingestion.ts` (L127/L143). |
| `services/whatsapp-ingestion.ts` | **SERVER ONLY.** Inbound WhatsApp processing pipeline. Uses adminClient throughout. Exports: `parseWebhookPayload` (flattens nested Meta envelope), `processInboundMessage` (full 9-step pipeline, idempotent via wa_message_id dedup), `processStatusUpdate` (delivery receipt — the ONLY UPDATE on whatsapp_messages, uses adminClient, A-11 narrow exception), `resolveLeadByPhone`, `getOrCreateConversation` (SELECT → INSERT ON CONFLICT DO NOTHING → re-SELECT), `insertInboundMessage` (sanitizes content with sanitizeText). |
| `services/whatsapp-service.ts` | UI-facing WhatsApp queries. Uses session client — RLS handles access. Exports: `getConversations` (paginated, cursor = last_message_at), `getConversation`, `getConversationByLeadId` (single row by lead_id FK, returns null when none — used by lead dossier), `getMessages` (paginated ASC, joins sender profile), `getUnreadCount` (calls `get_wa_unread_count` RPC — per-agent LEFT JOIN unread count, returns 0 never null), `markConversationRead` (UPSERT into whatsapp_conversation_reads), `searchConversations` (ILIKE on name/phone, sanitized, max 20). |

## Typed row boundary — `mapRows` (Q-18 — no new `as Record<string, unknown>` in services)

Joined selects and RPCs not yet in the generated `Database` type come back untyped.
Declare a row type for the query shape and cross the boundary once via
`mapRows<TRow, TOut>(data, fn)` from `src/lib/utils/rows.ts` (dry-audit L-6) — the
mapper body is then fully typed. Reference: `WaConversationRow` / `WaMessageRow` in
`whatsapp-service.ts`, `DomainHealthRpcRow` in `performance-service.ts`. Plain
`JSON.parse` of external HTTP bodies (`whatsapp-api.ts`) and unknown webhook payload
sanitisation (`lead-ingestion.ts`) are *not* row mappers — those casts stay.

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

## unstable_cache key rule (Q-16)

When wrapping a service function in `unstable_cache`, the cache key **must** include every dimension that scopes the result. For domain-scoped queries, the caller's domain must be in the key — a manager in `concierge` must never receive a cached response intended for `finance`.

## unstable_cache + cookies() — hard constraint (P-09)

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

**Reference implementation:** `getAgentPerformanceSummary` in `services/performance-service.ts`
(session client inside React `cache()` — its RPC reads `auth.uid()`, so the session client is
mandatory). `getDashboardSummary` was the original reference but moved to the admin client in
migration 0102; its `cache()` wrap remains for per-request dedup, not the cookies constraint.

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

## tasks — write paths and RLS (migration 0094)

`tasks-service.ts` is read-only. All writes go through `src/lib/actions/tasks.ts` or lead RPCs.

| Category | Write path | Client | Direct RLS INSERT/DELETE |
| --- | --- | --- | --- |
| `personal` | `createPersonalTaskAction` | `adminClient` today; `tasks_insert` allows user-scoped self-assign insert | `tasks_delete` (agent, `to_do`/`in_progress` only); `tasks_delete_privileged` (manager+) |
| `group_subtask` | `createSubtaskAction` | `adminClient` only | No INSERT policy — blocked on user client |
| `gia_followup` | `create_lead_gia_task` RPC, `update_lead_status` RPC (nurturing) | RPC / `adminClient` | No INSERT policy — blocked on user client |

**Rule:** Never add a user-scoped `.insert()` for `gia_followup` or `group_subtask`. Gia and group subtasks must stay on SECURITY DEFINER RPCs or service-role actions.

**Deals:** No INSERT/DELETE RLS policies (intentional). All writes use `adminClient` in `recordDeal` / `createWalkInDeal` — see `COMMENT ON TABLE public.deals` in migration 0094.

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
- Never accept a caller-supplied domain/role parameter and trust it for scoping **while the RPC is client-callable**. Two sanctioned tiers (audit F-1, Q-13): **self-scoped** — derive scope from `auth.uid()` / `get_user_role()` / `get_user_domain()` inside the body; keeps `GRANT EXECUTE TO authenticated` and is called on the session client (e.g. `get_leads_status_counts`, `get_agent_performance`, `get_group_task_summaries`). **Revoked** — the RPC takes scope params (`p_role`/`p_domain`/`p_user_id`) or returns whatever slice it is asked for; EXECUTE is REVOKEd from `PUBLIC, anon, authenticated` (migration 0102 pattern) and the service calls it via `createAdminClient()` with session-derived args only — the calling page/action is the trust boundary. A scope-param RPC with a live `authenticated` GRANT is a Q-13 violation.
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
| `actions/_auth.ts` | `requireProfile(roles?)` — THE session/role guard (Rule 09 / A-18; no `"use server"` — internal helper, not an endpoint). Returns `{ ok: true, profile }` or `{ ok: false, result }` where `result` is `{ data: null, error: formErrors.unauthorized }`, assignable to any `ActionResult<T>`. Every session-based action starts with it. **Exceptions:** `sla.ts` (Trigger.dev, no session — uses `createAdminClient()`); `auth.ts` `loginAction` (reads the profile for the `is_active` check, not authorization); the four `tasks.ts` actions that fetch profile + task in one parallel `Promise.all` (intentional — do not serialize them through the guard). |
| `actions/whatsapp.ts` | WhatsApp actions — `sendWhatsAppMessage`, `markConversationAsRead`, `resolveConversation`, `reopenConversation`, `getConversationsAction`, `getMessagesAction`, `searchConversationsAction`, `getConversationByLeadIdAction` (by lead UUID, returns `{ data, error }`, null data = no conversation — not an error), `initiateWhatsAppConversationAction` (creates conversation + sends initiation template; adminClient INSERT; returns `{ data: { conversation, message }, error }`; idempotent — returns existing conversation on race) |
| `actions/profiles.ts` | User/profile management + `getAssignableUsersAction(domain?)` — THE client-callable assignable-users read (returns canonical `AssignableUser` from `lib/types`; no domain → all active non-guest users; with domain → admin/founder get every active user, others agents only) |
| `actions/agent-routing.ts` | `toggleAgentRouting`, `setAgentShiftAction` |
| `actions/leads.ts` | Lead lifecycle — `addLeadCallNote`, `addLeadNote`, `updateLeadStatus`, `assignLead`, `createManualLead`, `createLeadTaskAction`, `recordDeal`, `updateLeadEmail`, `updateLeadDomain`, `updateLeadSource` (renamed from `updateLeadUtmSource` in the 0065 attribution refactor), `updateLeadCity`, `updatePersonalDetails`, `searchLeadsAction`, `exportLeadsAction`. **`updateScratchpad` removed** — scratchpad dropped in migration 0061. |
| `actions/dashboard.ts` | Dashboard widget data refresh — 6 actions: `getAgentTasksSummaryAction`, `getAgentRecentActivityAction`, `getLeadStatusSummaryAction(from?, to?, targetDomain?)`, `getLeadsByCampaignAction(from?, to?, targetDomain?)`, `getLeadVolumeByDomainsAction`, `getLeadVolumeForDomainAction`. The status/campaign `*ForDomainAction` twins were collapsed into the optional-`targetDomain` actions (dry-audit H-5); `getLeadVolumeByRangeAction` deleted (zero call sites). Managers are always pinned to their own domain via the single `effectiveWidgetDomain()` helper regardless of the requested target. Volume stays two actions deliberately — `MultiDomainVolumeSummary` vs `LeadVolumeSummary` are different shapes. |
| `actions/ad-creatives.ts` | `upsertAdCreative`, `deleteAdCreative` (admin/founder only; adminClient writes; normalise campaign_key; revalidate /admin/ad-creatives + /campaigns) |
| `actions/notifications.ts` | `markNotificationReadAction`, `markAllReadAction` |
| `actions/tasks.ts` | OS Tasks actions — `createPersonalTaskAction`, `createGroupTaskAction`, `createSubtaskAction`, `updateTaskStatusAction`, `updateTaskAction`, `deleteTaskAction`, `addTaskRemarkAction`, `suppressTaskRemarkAction` |
| `actions/sla.ts` | Gia SLA Engine actions — `scheduleSlaTimersForLead`, `cancelSlaTimersForLead`, `refreshActivitySlaTimers`, `fireSlaBreachAction` (Trigger.dev only), `fireSlaBreachHandler` (internal) |

## Types registry

| File | Purpose |
| ---- | ------- |
| `types/database.ts` | Auto-generated Supabase row types. Regenerate with `supabase gen types typescript --local`. Never hand-edit. |
| `types/index.ts` | Shared app types not tied to a single DB table (e.g. `DashboardSummary`, `ActionResult`). Also `WithAuthor<T>` / `WithAssignee<T>` / `WithActor<T>` (dry-audit L-3) — THE way to express "row + joined profile fields"; never hand-write a fresh `& { author: … }` intersection in a service. |
| `types/whatsapp.ts` | Meta Cloud API payload shapes (`MetaWebhookPayload`, `MetaInboundMessage` discriminated union, `MetaStatusUpdate`, `MetaApiResponse`, `TemplateComponent`) + app-internal types (`WhatsAppConversation`, `WhatsAppMessage`, `SendMessageInput`). Types only — no runtime values. |

## Validations registry

| File | Purpose |
| ---- | ------- |
| `validations/profile-schema.ts` | Profile create/update/auth/deactivate/invite/avatar schemas |
| `validations/lead-schema.ts` | Lead schemas — `CreateManualLeadSchema.source`, `UpdateLeadSourceSchema` (renamed from `UpdateLeadUtmSourceSchema` in the 0065 attribution refactor — field is now `source`, persisted to `leads.source`), `createLeadTask` / `recordDeal` |
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
- `createSubtaskAction`: always fires `task_assigned` notification to assignee when `assigned_to ≠ auth.uid()` (fire-and-forget). Also invalidates `task:group-list:{callerId}` AND `task:group-list:{assignedTo}` (when different) so the assignee's group list refreshes to show the parent group they've just been given visibility into (migration 0058 flat-visibility model).
