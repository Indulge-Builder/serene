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
| `constants/themes.ts` | THE theme vocabulary (`THEME_KEYS`/`THEME_OPTIONS`/`ThemeKey`/`DEFAULT_THEME`/`isThemeKey()` via `defineEnum`) + the SSR theme mirror: `THEME_COOKIE` (`serene-theme`, read by the root layout to stamp `data-theme` on `<html>` server-side — the zero-flash mechanism) and `persistThemeCookie()` (client-only writer — ThemeInitializer on load, ThemeSelector on switch). `profiles.theme` stays the source of truth; never re-inline the five theme keys. |
| `constants/app-icons.ts` | THE PWA home-screen icon vocabulary (`ICON_KEYS`/`ICON_OPTIONS`/`ICON_LABELS`/`ICON_ENUM`/`IconKey`/`DEFAULT_ICON`/`isIconKey()` via `defineEnum` — built exactly like `themes.ts`) + **`iconSrc(value)`** (THE only key→path resolver: validates an UNKNOWN value against `ICON_KEYS`, returns `/<key>.webp` or the `DEFAULT_ICON` path — a raw query/cookie/DB value can NEVER become an arbitrary `src`; both `/api/manifest` and the apple-touch-icon call it, never build the path inline) + the SSR manifest mirror `APP_ICON_COOKIE` (`serene-app-icon`, read by the root layout's `generateMetadata` to point `<link rel="manifest">` at `/api/manifest?icon=<saved>` + the apple-touch-icon) and `persistAppIconCookie()` (client-only writer — IconInitializer on load, IconSelector on change, InstallPrompt on pick). One square `/public/icon-N.webp` per key (covers manifest 192/512 + maskable + apple-touch-icon). `profiles.app_icon` is the source of truth; adding an option = one `{ id, label }` line + a new CHECK migration. Mirrors `profiles.theme` end-to-end; rides the EXISTING `updateProfile` action (no new persist action). |
| `constants/domains.ts` | `APP_DOMAINS` (user mgmt), `GIA_DOMAINS` (Gia module), `DOMAIN_LABELS`, `GIA_DOMAIN_ENUM`, `APP_DOMAIN_ENUM` — see Q-17 in `docs/rules/The_Rules.md`. **`DOMAIN_ICONS`** (THE per-Gia-domain `LucideIcon`: onboarding→`UserRound`, house→`Home`, shop→`ShoppingBag`, legacy→`Trees`) + **`ALL_DOMAINS_ICON`** (`Globe`, the unscoped fallback) — `GIA_DOMAIN_FILTER_ITEMS` carry the icon so domain pickers render the glyph; the icon-only mobile `DomainSelector` trigger shows the active domain's icon. Never re-map a domain→icon inline. |
| `constants/lead-statuses.ts` | `LeadStatus` enums + badge config |
| `constants/revival.ts` | Lead Revival R1 vocabulary (pure data). `REVIVAL_TRIGGER_STATUSES` (`touched`/`in_discussion`/`nurturing` — **cold is NOT a trigger**) + `isRevivalTriggerStatus`; seed-parity defaults (`REVIVAL_DEFAULT_SILENCE_DAYS`, `REVIVAL_DEFAULT_DAILY_CAP` 25 — the live config is `revival_policies`, read per sweep run); `REVIVAL_TASK_MARKER` (`'revived'`, written to `task_gia_meta.call_outcome` — the badge key) + `REVIVED_TASK_TITLE`/`_DESCRIPTION`/`REVIVAL_TASK_TYPE`/`_PRIORITY`/`_DUE_BUSINESS_MINUTES`; sweep tuning (batch size, gate notes caps). |
| `constants/call-outcomes.ts` | `CallOutcome` enums + labels |
| `constants/task-types.ts` | `TASK_TYPES`: `call`, `whatsapp_message`, `other` + `TASK_TYPE_LABELS` |
| `constants/deal-types.ts` | `DEAL_TYPES`/`_LABELS`/`_OPTIONS`/`_ENUM` (`membership`/`retail`/`sale` via `defineEnum`), `DEAL_DURATIONS`/`_ENUM` (membership), `DEAL_CATEGORIES`/`_LABELS`/`_OPTIONS`/`_ENUM` (retail product categories) + **`DOMAIN_DEAL_CONFIG`** — THE Gia domain → `{ type, categories }` map (the `DOMAIN_INTERESTS` pattern): `onboarding→membership`, `shop→retail`+categories, `house`/`legacy`→`sale`. `dealTypeForDomain(d)` / `dealCategoriesForDomain(d)` resolvers. **`deal_type` is DERIVED from the deal's domain, never free-picked** (decision-log 2026-06-15) — this one constant drives the form, the `resolveDealShapeForDomain` action validation, the `DealsFilters` category items, and is mirrored by the migration-0122 CHECKs. Never re-hardcode the type/category lists (R-01). |
| `constants/lead-sources.ts` | `LEAD_SOURCES`, `LEAD_SOURCE_LABELS`, `LEAD_SOURCE_OPTIONS`, `getLeadSourceLabel()` — canonical lead source on `leads.source` (renamed from `utm_source` in the 0065 attribution refactor). Webhook leads store channel on `platform`; manual/dossier edits use `source`. |
| `constants/task-constants.ts` | `TASK_PRIORITY`, `TASK_STATUS`, `TASK_CATEGORY` — labels, CSS token colours, sort order. `TASK_STATUS` also has `pillBg`/`pillText` and `remarkBg`/`remarkColor`/`remarkBorder` for pills and remark chips |
| `constants/interests.ts` | Call Intelligence taxonomy — `SERVICE_CATEGORIES`/`_LABELS`/`_OPTIONS`/`_ENUM` via `defineEnum` (the 6 concierge categories) + `DOMAIN_INTERESTS` (valid `leads.service_interests` per domain; `text[]`, never an enum) + `getDomainInterests(domain)` (concierge fallback for unlisted domains) + `getServiceCategoryLabel(slug)` — THE label resolver for any interest/category slug (canonical labels for the 6, title-cased slug otherwise); used by helpdesk pills, CaseCard, and the Add Lead Interests chips |
| `constants/campaign-domain-map.ts` | prefix → domain mapping |
| `constants/lead-columns.ts` | Column registry for the leads table — `LEAD_COLUMNS`, `LEAD_COLUMN_MAP`, `DEFAULT_COLUMN_ORDER`, `isValidLeadColumnId`. IDs are stable localStorage keys — never rename after shipping. |
| `constants/whatsapp.ts` | `WHATSAPP_API_VERSION`, `WHATSAPP_API_BASE`, `WHATSAPP_MESSAGE_TYPES`, `WHATSAPP_CONVERSATION_STATUS`, `WHATSAPP_SENDER_TYPE`, `WHATSAPP_DIRECTION`, `WHATSAPP_MESSAGE_STATUS`, `WHATSAPP_NOTIFICATION_TEMPLATES`, `WHATSAPP_MESSAGES_PAGE_SIZE`, `WHATSAPP_CONVERSATIONS_PAGE_SIZE`. Outbound media: `WHATSAPP_OUTBOUND_MEDIA_MIME` (MIME→type allowlist) + `resolveOutboundMediaType(mime)` (→ image/video/document/audio or null) + `WHATSAPP_OUTBOUND_MEDIA_MAX_BYTES` (16MB) — THE single outbound-media allowlist (schema + composer client-validate + action all read it). Template IDs: `GUPSHUP_LEAD_ASSIGNMENT_TEMPLATE_ID`, `GUPSHUP_FOUNDER_LEAD_NOTIFICATION_TEMPLATE_ID`, `GUPSHUP_SLA_AGENT_TEMPLATE_ID`, `GUPSHUP_SLA_MANAGER_TEMPLATE_ID`, `GUPSHUP_LEAD_INITIATION_TEMPLATE_ID`, `GUPSHUP_TASK_DUE_REMINDER_TEMPLATE_ID`, `GUPSHUP_TASK_OVERDUE_MANAGER_TEMPLATE_ID`. No secret env vars here — `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_WEBHOOK_SECRET` live in `process.env` only (S-11). |

## Services registry

| File | Purpose |
| ---- | ------- |
| `services/profiles-service.ts` | Profile DB queries. `getActiveProfileByPhone(normalizedPhone)` — THE WhatsApp staff-identity lookup (Elaya routing gate; admin client — webhook context has no session; expects an already-`normalizeWaPhone`d E.164 number). `getAssignableUsers({ domain?, roles? })` — THE assignable-users query (dry-audit M-11): default all active non-guest users; `domain` scopes to one domain; `roles` restricts to a role set (lead/deal assignment pools pass `LEAD_ASSIGNABLE_ROLES = ['agent','manager']` from `constants/roles` — managers carry leads). Never fork another profiles query for assignability. React `cache()`-memoised per request behind the public wrapper (perf audit E-3) — the memo takes primitive args (`domain` + a sorted-comma-joined `rolesKey`) because `cache()` keys object/array args by reference; deliberately NOT Redis-cached (a 60s-stale list could offer a just-deactivated assignee). |
| `services/leads-service.ts` | Lead DB queries — `getLeadsByRole`, `getLeadBySlug`, `getLeadById`, `getCampaignMetrics`, `searchLeadsForTask`, etc. **Search (every path):** single ILIKE on the generated `leads.search_text` column (migration 0098, pg_trgm GIN-indexed) in `getLeadsByRole`, `getLeadsForExport`, `searchLeadsForTask` AND the `get_leads_status_counts` RPC — never reintroduce per-column OR-ILIKE chains (unindexed + drift from count pills). **totalCount (C-1):** derived as the sum of `get_leads_status_counts` rows (one predicate scan); the paginated query carries NO `{ count: 'exact' }` — never re-add it. `getLeadsByRole` hoists all filter values into one block consumed by both the query and the RPC so predicates cannot drift. **Redis cache-aside active** on `getLeadsByRole` (30s list; dossier row keys deliberately NOT warmed — the list query selects a column subset that would corrupt `getLeadById`/`getLeadBySlug` reads), `getLeadBySlug` (120s), `getLeadById` (120s), `getLeadFilterOptions` (300s), `getLeadNotesFull` (120s), `getLeadActivitiesFull` (120s). Key schema: `src/lib/constants/redis-keys.ts`. List key includes role + callerDomain + userId — cross-domain bleed impossible. **List read is ONE Upstash round trip (perf audit C-3):** a single MGET fetches the `leadListVersion` counter and the list entry together; the entry is a `{ v, result }` envelope and hits only when `v` matches the live counter — never reintroduce the version-read-then-list-read two-RTT shape, and never put the version back in the key. Actions invalidate on write via `invalidateLeadCaches` `lists` scope: `addLeadCallNote`, `updateLeadStatus`, `assignLead`, `addLeadNote`, `createManualLead` (version-counter INCR voids all cached pages for agent+manager scopes; admin/founder lists are 30s-TTL-only by design). **NOT cached (no Redis):** the campaign RPC functions `getCampaignMetrics`, `getCampaignDetailMetrics`, `getCampaignAgentDistribution` call their RPCs directly — always live. There is no `REDIS_KEYS.campaign.*` namespace; do not add campaign cache claims without adding the code first. **id-set reader (2026-06-24):** `fetchLeadsByIds` (private) is THE id-set → `LeadsResult`-rows logic (same column subset/assignee join/latest-note batch/role scope as `getLeadsByRole`); `getRevivalCandidateLeads` (revival review) AND the public `getLeadsByIds` (the first-touch bucket drill) both reuse it — never re-inline an id-set lead fetch (R-01). |
| `services/deals-service.ts` | `getDealsByRole`, `getDealsSummary` (RPC wrapper for `/deals`), `getLeadDeal(leadId)` (single `Deal` for the lead dossier's `LeadDealCard`; returns null when the lead has no deal) |
| `services/lead-cache.ts` | `invalidateLeadCaches(site, { leadId, slug, domain }, scope)` — THE lead Redis-invalidation helper. Scope flags: `row` (dual-key leadRowId + leadRowSlug), `notes`, `activities`, `lists` (version-counter INCRs for agent+manager), `dashboard` (all-time lead-status + campaigns slots). Always `await`-ed by callers before `revalidatePath`; Redis failure is non-fatal (warn). Dashboard volume keys are intentionally out of scope — read-side keys embed ISO `from:to`, TTL-only freshness (120s). Never hand-roll a `redis.del` block in a lead action. |
| `services/notifications-service.ts` | Notification reads/writes. **`createNotification` is THE notification fan-out chokepoint** — after the in-app row insert it calls `dispatchPush` (the Web Push second channel) so every existing call site (lead-assignment-notify, lead-mutations, sla, tasks, task-reminders) gets push for free with ZERO call-site edits. Push is best-effort: `dispatchPush` never throws and the in-app row (source of truth) stands regardless; the `await` keeps awaited callers' lambdas alive until the send settles. Never re-route push through individual call sites — the seam lives inside `createNotification`. |
| `services/push-service.ts` | **SERVER ONLY, NODE RUNTIME ONLY** (web-push is Node-only — throws under Edge; every `createNotification` caller is Node: server actions + Trigger.dev; there is no edge route). `dispatchPush(recipientId, payload)` — THE Web Push sender (migration 0120). Reads the recipient's `push_subscriptions` via the ADMIN client (cross-user read — RLS would scope to the caller), sends to all devices in parallel via `web-push`, and **prunes endpoints that answer 404/410** (dead — reinstall/token-rotation) in one batched delete (MANDATORY — without it the table fills with corpses and every fan-out slows). VAPID configured once, lazily; absent keys → logged no-op, never a throw into the notification path. Never throws. Client subscribe/unsubscribe writes go through `lib/actions/push.ts` (session client, owner-only RLS), never this file. `PushPayload` ({title, body?, url?}) is the JSON the SW `push` handler parses. |
| `services/transcription-service.ts` | **SERVER ONLY.** `transcribeAudio(audio, mimeType)` — THE Deepgram call site. Plain fetch, no SDK. Reusable speech-to-text infrastructure, not a notes gadget. **Three consumers, all reuse this ONE function — never add a second STT path:** (1) the notes voice button via `transcribeAudioAction` (`LeadNotesInput`/`CalledModal`), (2) the in-app Elaya mic via the same action (`ElayaChatShell` — transcript fills the composer as an editable draft, user reviews + sends manually), (3) Elaya's WhatsApp voice notes (`elaya-whatsapp.ts` downloads the Gupshup CDN url and calls `transcribeAudio` directly, server-to-server, no action). **Audio is transcribed in-memory and discarded — never persisted** (D-01 carve-out, Decision Log 2026-06-12). Throws on failure; the action layer (in-app) / the gate's try/catch (WhatsApp) maps to user copy. `DEEPGRAM_API_KEY` env var, server-only. Pass the actual recording/media MIME type through — Safari records mp4/aac, Chrome webm/opus, Gupshup voice notes arrive as ogg/opus; never hardcode it. |
| `services/dashboard-service.ts` | Dashboard data. Primary entry point: `getDashboardSummary(role, domain, userId)` — single RPC, memoised with React `cache()` per request (per-user result — `unstable_cache` would share it across users). Do not split back into individual action calls for summary data. **The four scope-param RPC wrappers (`getDashboardSummary`, `getAgentRecentActivity`, `getLeadStatusSummary`, `getLeadsByCampaign`) call their RPC via `createAdminClient()` — EXECUTE revoked from `authenticated` (migration 0102, audit F-1); scope args must stay session-derived (Q-13).** `getLeadVolumeByPeriod` is the only individual function still used (period toggle). **Redis cache-aside active** on `getLeadStatusSummary` (60s), `getLeadVolumeByPeriod` (120s), `getLeadVolumeByDomains` (120s), `getLeadsByCampaign` (120s). Key schema: `src/lib/constants/redis-keys.ts`. TTL-only invalidation — no explicit del in leads actions. |
| `services/performance-service.ts` | Performance page queries — RPC-backed since perf audit D-2 (migration 0101). `getAgentPerformanceSummary(period, from?, to?)` — ONE self-scoped `get_agent_performance` call returning core four + previous period + effort + outcomes + team benchmarks (React `cache()`-wrapped; the RPC reads `auth.uid()`/`get_user_domain()`, no identity params). `getAgentRosterPerformance(domain, from, to)` — ONE `get_agent_roster_performance` call, one pre-aggregated row per agent (manager pinned to own domain in SQL). `getAgentDetailMetrics` (3 parallel queries) and `getDomainHealthMetrics` (RPC 0066) unchanged. `getAgentTodayPulse(period, from?, to?)` — ONE self-scoped `get_agent_today_pulse` call (0108; IST day boundary computed via `lib/utils/ist` and passed as `p_today_start` — never re-fork IST math in SQL): calls-today new/old split + 14-day trend + period deals. `getAgentLeadActivityPage(agentId, cursor?, actionType?)` — keyset load-more over `lead_activities` scoped to the agent's leads; COMPOSITE cursor `(created_at, id)`; page 15 + hasMore. The typed `actionType` (`'all'`/`'call_logged'`/`'note_added'`/`'status_changed'`) is a top-level `.eq` ANDed with the cursor `.or()` (never folded into the `.or()` string); the select carries `leads.phone` + outcome (from `details->>'outcome'`) + note body (batched `lead_notes` correlation). `getAgentCallsPageForManager(agentId, cursor?)` (Phase 5) — THE "Recent calls" source: queries `lead_notes WHERE call_outcome IS NOT NULL` directly (one row per call, no `note_added` dupes), same composite keyset. **First-touch bucketing (2026-06-24):** `classifyFirstTouchPairs` is THE single first-touch classification pass (fetch raw pairs → resolve the agent's shift once → assign each pair to a business-minute bucket); both `getAgentFirstTouchScorecard` (counts) and `getAgentFirstTouchBucketLeadIds(agentId, from, to, bucketId)` (the lead-id list behind a clicked bar) read it, so a bar's count and its drill list can never diverge — never re-fork the bucketing. Rate math + null-vs-zero semantics live in the service mappers, not SQL. **No Redis** — the previously documented `perf:*` cache-aside namespace never existed in code (stale doc, corrected 2026-06-11); never reintroduce per-metric functions that ship cohort lead rows to Node. |
| `services/ad-spend-service.ts` | `/budget` queries — `getBudgetSummary(from, to)` calls the `get_budget_summary` RPC (0106; EXECUTE revoked per Q-13 → admin client; the role-gated page/action is the trust boundary) and computes CPL/CPD in the mapper (`null` at zero denominators — render "—", never ₹0); `getAccountRecharges(from, to)` (recharge ledger) + `buildAccountReport(rows, recharges)` (pure per-account report, INR-only balance); **`buildBudgetGaugeSummary(rows, recharges)`** — THE org-wide fuel-gauge roll-up (pure, layered OVER `buildAccountReport` so it can never disagree with `/budget`: recharged → spent → remaining + leadCount/dealCount/dealRevenue + CPL/ROAS/`consumed`/`hasNonInr`; INR-only; ALWAYS org-wide — recharges carry no domain). Backs the dashboard Campaign Budget gauge (seed in `dashboard/page.tsx`, refresh via `getBudgetGaugeWidgetAction`). `getExistingSpendKeys` backs the upload's inserted-vs-updated summary. **No Redis** — always-live like the campaign RPCs; freshness via `revalidatePath('/budget')` on upload. |
| `services/domain-targets-service.ts` | THE `domain_targets` access (migration 0105). `getDomainTargets()` — session-client read (RLS: all authenticated). `upsertDomainTarget(domain, value, setBy)` — admin-client upsert on `(domain, metric, period)`, called only from the admin/founder-gated `upsertDomainTargetAction`. |
| `services/usage-service.ts` | **SERVER ONLY.** THE agent active-time / adoption-tracking access (migration 0126). **Hot path:** `recordPresence(userId, entry)` — ONE `redis.setex(presence:{userId}, REDIS_TTL.PRESENCE, {domain,role,ts})`, **NO DB write** (fails open). **Snapshot job:** `listLivePresence()` (Upstash SCAN `presence:*` + MGET, skips raced-expiry nulls) + `insertUsageHeartbeats(rows)` (admin-client append, A-11). **Rollup job:** `rollupUsageForDays(istDays[])` — recomputes `active_minutes = COUNT(DISTINCT minute-bucket)` per `(IST day, user, domain)` and UPSERTs on the `(day,user_id,domain)` PK (**idempotent — overwrite, never increment**) + `pruneOldHeartbeats(days=30)` + the exported `istDateString(d)` (IST-calendar date string, reuses `IST_OFFSET_MS` — never re-fork). **Dashboard read:** `getAgentUsage(historyDays=30)` — **founder/admin gate lives HERE** (`getCurrentProfile` role check, rejects → null), calls `get_agent_usage` RPC via the **admin client** (Q-13 revoked-tier; the RPC trusts no caller role) for `{today (live recompute), history (usage_daily)}`, `Number()`-coerces `active_minutes` (Q-09). Interim admin-client `as any` cast on `.from`/`.rpc` until `database.ts` regen. |
| `services/ad-creatives-service.ts` | `getAdCreativesForCampaign` (one campaign → `AdCreative[]`, newest first), `getAdCreativesForCampaigns` (batch → `Map<key, AdCreative[]>`, single `.in('campaign_key', keys)` query), `getAllAdCreatives` (admin list, newest-first). A campaign may have multiple videos (migration 0058 dropped the UNIQUE on campaign_key). **No Redis cache-aside** — these are plain Supabase queries; freshness comes from `revalidatePath('/admin/ad-creatives')` + `revalidatePath('/campaigns')` in `upsertAdCreative` / `deleteAdCreative`. |
| `services/tasks-service.ts` | OS Tasks — `getPersonalTasks`, `getGroupTasks`, `getGroupSubtasks(groupId, userId)`, `getTaskById`, `getTaskRemarks`, `getAllLeadTasks`, `getGiaTasksForUser`. Exports `TaskRemarkWithAuthor`. **Lead-task readers scope via the `task_gia_meta` inner join (meta-presence), NOT a category** (the `gia_followup` category was collapsed in 0138 — a lead task is a `personal` task with a meta row): `getAllLeadTasks` (dossier card) `!inner`-joins `task_gia_meta`; `getGiaTasksForUser` wraps the `get_gia_tasks` RPC (whose `INNER JOIN task_gia_meta` scopes it). **`getGiaTasksForUser`/`get_gia_tasks` are KEPT despite the Gia tab being removed** — now consumed by Elaya's read tool (`lib/elaya/tools/registry.ts`) + the dossier reader path, never a tab. **Redis cache-aside active** on `getGiaTasksForUser` (60s — invalidated on meta-presence by `updateTaskStatusCore`/`deleteTaskCore` so Elaya's reads stay fresh), `getGroupTasks` unfiltered (120s, domain+role key), `getPersonalTasks` page-1 (30s), `getGroupSubtasks` (30s, userId-scoped), `getTaskRemarks` (30s). Key schema: `src/lib/constants/redis-keys.ts` (`REDIS_KEYS.task.*`). Invalidation: see `src/app/(dashboard)/tasks/CLAUDE.md` invalidation table. |
| `services/sla-service.ts` | Gia follow-up engine DB queries — `getSlaPolicies()` / `getSlaPolicy(code)` (THE `sla_policies` reads — admin client, **read per job run, never module-cached**; a threshold edit applies on the next fire), `getSlaTimersForLead`, `getSlaTimerForLeadAndRule`, `createSlaTimer`, `updateSlaTimerRunId`, `cancelSlaTimersForLeadInDb`, `markSlaTimerFired`, `getOpenGiaFollowupTask` (inner-join on `task_gia_meta.lead_id` — THE open-gia-task dedup guard for SLA auto-tasks AND cadence ticks), `getManagersByDomain`, `getActiveFounders` (SLA-01C), `getProfileFullName`, `getTaskWithGiaContext(taskId)` (task + linked lead for the task_due jobs), `getTaskWithAssignee(taskId)` (THE lead-agnostic twin — task + assigned agent's phone/first-name/full-name/domain/`reports_to`, NO `task_gia_meta` dependency; backs the -30m due-soon + at-due agent-overdue WhatsApp + the non-lead overdue-manager escalation that fire for EVERY task), `getAssigneeManagers({domain, reports_to})` (THE non-lead overdue escalation pool — the assignee's direct manager `reports_to` when active, else `getManagersByDomain(domain)`), `markTaskOverdueOnce(taskId, at)` (exactly-once `overdue_at` stamp — `UPDATE … WHERE overdue_at IS NULL`, returns whether THIS call wrote it), `hasLeadActivityAfter(leadId, ts)` (overdue clearing event). All writes use adminClient (service-role). **Settings panel:** `getAllSlaPolicies()` (session client — 0111 RLS admin/founder SELECT; includes inactive rows) + `updateSlaPolicy(code, patch)` (admin client; the gated action is the trust boundary — only threshold/channels/hours_mode/active are patchable). **Escalation page reads (/escalations, deliberately un-cached):** `getEscalatedLeads(domain\|null)` (LIVE breaches ≤7d whose rule still matches the lead's status — a `fired` timer **OR** a `pending` timer past its `scheduled_fire_at`, so the page never depends on the Trigger.dev fire-job having run; CAD fires excluded; grouped per lead; breach moment = `fired_at` else `scheduled_fire_at`), `getOverdueGiaTasks(domain\|null)` (open gia tasks past due — the 0113 `overdue_at` stamp **OR** a `due_at` already past, since the stamp job may not have run; breach moment = stamp else `due_at`), `getGoingColdLeads(domain\|null)` (the /leads going_cold predicate) — admin client with session-derived scope args, `mapRows` boundary. **These read live so a late/undeployed Trigger.dev worker never blanks the surface; the WhatsApp/in-app SLA *alerts* are still engine-driven and need the worker deployed.** |
| `services/agent-routing-service.ts` | `getAgentRoutingConfig`, `getRoutingConfigsByDomain`, `getActiveRoutingConfigs`, `setRoutingActive`, `getAgentRosterByDomain` (joined profiles+config, adminClient), `setAgentShift` (adminClient) |
| `services/intelligence-service.ts` | Call Intelligence reads. `getHelpdeskLibrary(domain)` — full `{ cases, hooks }` library for `/helpdesk`, **Redis cache-aside** under `REDIS_KEYS.helpdeskCases(domain)` (3600s; partial reads never cached; Redis failure falls through to a live read). `getCasesForLead(interests, city, domain)` — dossier card, ≤6 rows (`category IN interests OR tags @> [lower(city)]`, featured-first), deliberately NOT Redis-cached. `getHooksForCategories(categories, domain, limit=5)`. Session client throughout (read RLS is `USING (true)`). Invalidation lives in `actions/intelligence.ts`: every case/hook write awaits `redis.del(helpdeskCases(domain))` before `revalidatePath('/helpdesk')`. |
| `services/elaya-service.ts` | **SERVER ONLY.** Elaya conversation/message access (migration 0116). `getOrCreateActiveConversation(userId, expiryHours, originChannel?)` — THE 24h session-expiry resolver (server-side, never client; deliberately channel-agnostic on read — ONE active session per user across in-app + WhatsApp, `originChannel` only stamps a new row); `getOwnedConversation` (S-06 ownership check for supplied ids); `hasProcessedWaMessage(waMessageId)` (WhatsApp-channel idempotency — dedups on `meta->>wa_message_id`, fails open); `getConversationMessages` (session client — RLS double-enforces) / `getModelContextMessages` (last-10 verbatim window, admin client); `insertUserMessage` / `insertAssistantMessage` (append-only — INSERTs only, ever, A-11); `countUserMessagesToday` (IST midnight via `toISTMidnight`; fails CLOSED — a broken count never grants unlimited messages); `touchConversation`; `getUserContext`. **No Redis** — chat is always live. Writes via admin client (the authed chat route is the trust boundary, Q-13 convention). |
| `services/elaya-whatsapp.ts` | **SERVER ONLY.** Elaya's WhatsApp staff channel (2026-06-12). `tryHandleElayaWhatsAppMessage(phone, message)` — THE inbound routing gate, called by BOTH webhook branches before `processInboundMessage`: `normalizeWaPhone` → `getActiveProfileByPhone` match → full brain turn to completion (no streaming, `emit` no-op, `channel 'whatsapp'`) + one reply via `sendElayaWhatsAppReply`; no match → returns false and the lead pipeline runs untouched. Once a profile matches it returns true on EVERY path (failures included) — a staff message never mints a lead. Profile-vs-lead phone collision: profile wins, warn-logged. Writes ONLY `elaya_messages` (+ the `elaya_reply` audit row) — never `whatsapp_conversations`/`whatsapp_messages`/`leads`. Cap/session shared with in-app (one count, one active conversation per user). Dedup on Gupshup message id via `hasProcessedWaMessage`. Reply failures logged, never retried. **Voice notes (E4a):** `message.type === 'audio'` → `transcribeWhatsAppAudio` (fetch the Gupshup CDN url → `transcribeAudio`) BEFORE the cap/model/persist; voice is an input transform only — once transcribed, the cap, session, persist, brain, reply, and E3 confirmation gate are byte-identical to a typed message (a voice note = one capped message). Empty/non-speech transcript → graceful `REPLY_NO_SPEECH`, nothing persisted, no model call. Download/transcription failure throws to the gate's try/catch → `REPLY_UNAVAILABLE`, still handled. Image/video/document → `REPLY_TEXT_ONLY`. |
| `services/revival-service.ts` | **SERVER ONLY.** THE `revival_candidates` + `revival_policies` access (Lead Revival R1, admin client — mirrors elaya-actions-service; interim `as any` cast on `.from` until 0119 + `database.ts` regen). Config: `getActiveRevivalPolicies()` (per sweep run, never module-cached — sla_policies pattern), `getAllRevivalPolicies()` (settings), `updateRevivalPolicy(triggerStatus, patch)` (admin client; the gated action is the trust boundary). Silence finder: `findSilentLeadsForStatus(status, silenceDays)` — leads in `status` silent past the threshold with NO candidate of ANY status (the **judge-once** anti-join — a judged lead, incl. `dismissed`, is never re-judged, so dead leads don't re-enter the pool nightly; the partial UNIQUE index backstops the one-OPEN race); excludes archived + unassigned; bounded per run. Cap: `countAutoRevivesToday(agentId)` — native `.eq('assigned_to')` filter (NOT a leads embed — head:true drops it), fails CLOSED to Infinity. Ledger: `insertRevivalCandidate` (open/actioned/dismissed; `dismissed` is the gate's `dismiss` verdict written at creation — audit log, never surfaced in review; 23505 unique-violation swallowed = the one-open race guard), `markCandidateResolved(id, status, by)` (resolve-once `open →` flip, the A-11 carve-out), `getOpenCandidateForLead` (dossier), `getOpenCandidatesForCaller(sessionClient)` (the review-predicate read — RLS-scoped on the SESSION client). **Revival NEVER writes the leads row.** |
| `services/revival-gate.ts` | **SERVER ONLY.** THE note-AI gate (Lead Revival R1) — a SINGLE-SHOT **three-verdict** judgment (`revive`/`dismiss`/`unsure`) reusing the Elaya provider/PII layer wholesale (R-01 / D-01): `maskPii` → `resolveLlmForJob('routing')` (Haiku) → `adapter.complete()` with **NO tools** → JSON parse. NO second LLM integration, no `@anthropic-ai/sdk` import. **`judgeNotesForRevival(blob, status, maskingDepth)`** is the model-call core; **`judgeLeadForRevival({leadId, triggerStatus})`** is the DB-read wrapper (`getLeadNotesFull` → `buildRevivalNotesBlob` → core); the core is extracted so the verdict can be re-tested on arbitrary notes (`scripts/test-revival-gate.ts`, the regression check). The suppression bias lives in the system prompt: an explicit agent disqualifier (not-a-prospect / doesn't-need-us / affordability-dead / only-wanted-details / standing-unreachable-wall) → `dismiss` (the gate COMMITS on junk so it stops clogging `unsure`); the ambiguous middle (warm-but-stalled / soft-signal) → `unsure`; a warm lead is NEVER auto-dismissed. The parser honours only the three exact strings; anything else collapses to `unsure`. **Fails CLOSED to `unsure`** on empty notes / malformed / thrown — never auto-revives AND never auto-dismisses. |
| `services/lead-mutations.ts` | **SERVER ONLY.** THE shared, context-free body of the four action-shaped lead writes (Elaya Phase 2 / E3) — `addLeadNoteCore`, `createLeadTaskCore`, `updateLeadStatusCore`, `assignLeadCore` — plus **`reviveLeadCore`** (Lead Revival R1): wraps `createLeadTaskCore` (the E2 path — same RPC + reminder + cache del) + two post-creation marker writes ("Revived" title + `task_gia_meta.call_outcome='revived'` badge key); NEVER touches the leads row. Both `reviveLeadAction` (session) and the daily sweep (admin) call this one core (R-01). Each takes an explicit `MutationActor` (principal-derived identity, never a session) and wraps the existing SECURITY DEFINER RPC + every context-free side-effect (`invalidateLeadCaches` awaited per P-08, SLA schedule/cancel, won-notification fan-out, Trigger.dev reminder, dashboard-cache del). Both the `leads.ts` action (session caller) AND the Elaya write tool (admin client, no session) call the SAME core — so a tool-driven write inherits cache/activity/SLA/notify identically (R-01). `revalidatePath`/`after()` are request-context-only and stay in the CALLER (`assignLeadCore` returns the `notifyLeadAssigned` input rather than calling `after()` itself). Never re-implement a lead mutation outside a core. |
| `services/task-mutations.ts` | **SERVER ONLY.** THE shared, context-free body of the six action-shaped task writes (Elaya Phase 2 substrate, Brief 2) — `createPersonalTaskCore`, `createGroupTaskCore`, `createSubtaskCore`, `updateTaskStatusCore`, `updateTaskCore`, `deleteTaskCore`. Each takes an explicit `MutationActor` (**reused from `lead-mutations.ts`, never redefined** — R-01) and wraps the raw `tasks`/`task_groups` insert/update/delete (DIRECT writes via the admin client — NO RPC, unlike the lead cores) + every context-free side-effect (Trigger.dev `scheduleTaskReminder`/`cancelTaskReminder`, `createNotification` fan-out, the **awaited** Redis dels per P-08 — `void redis.del().catch()` converted to awaited try/catch-warn). Both the `tasks.ts` action (session caller) AND the future Elaya write tool (admin client, no session) call the SAME core — so a tool-driven task write inherits reminder/notify/cache identically (R-01). `revalidatePath` is request-context-only and stays in the CALLER. **`canMutateTask(client, caller, task)`** also lives here — the per-resource access GATE (A-09), moved verbatim from `actions/tasks.ts` so a non-action caller can import it; it now takes the Supabase client (session client from the action, admin from a tool) instead of calling `createClient()` internally. **The caller gates, the cores stay ungated (Q-13)** — `canMutateTask` is run by the caller BEFORE a core, never inside one. **Three named invariants preserved exactly:** (a) the status/delete cache branches key on `actor.userId` deliberately — NOT `assigned_to` (the pre-mortem note); since the gia_followup category collapse (0138) the `giaList` del fires on a caller-supplied **`hasGiaMeta`** flag (meta-presence), NOT a category check — a lead task is now `personal` + a `task_gia_meta` row, so it dels BOTH `personalPage1` and `giaList`; the cores stay context-free (never query `task_gia_meta` — the caller fetches `task_gia_meta(task_id)` and passes the bool); (b) `createSubtaskCore` keeps BOTH the assignee notify and the dual group-cache del; (c) `deleteTaskCore` cancels the Trigger.dev reminder BEFORE the DB delete (cancel failure non-fatal). `createPersonalTaskCore`/`createSubtaskCore` write `module: 'core'` (a standalone/group task is the core module; only `create_lead_gia_task` writes `module='gia'`). Never re-implement a task mutation outside a core. |
| `services/elaya-actions-service.ts` | **SERVER ONLY.** THE `elaya_actions` access layer (admin client — Q-13; mirrors `elaya-service.ts`). `insertExecutedAction` (low-risk terminal row), `insertProposedAction`, `getLatestProposedAction(conversationId, userId)` (the resolver's per-turn read, served by `idx_elaya_actions_pending`), `markActionResolved(id, status, resolvedBy, patchPayload?)` (proposed → executed/failed/dismissed — admin-client UPDATE, sanctioned system write, no user UPDATE policy), `supersedePriorProposals` (one live proposal per conversation). The trust + rollback ledger: every executed write appends who/tool/target/channel/before-after. No Redis. |
| `services/llm-providers-service.ts` | `getLlmJobConfig(jobType)` — THE `llm_providers` read (admin client, **read per request, never module-cached** — sla_policies pattern; a model/provider edit applies on the next message, no deploy) + `getDailyMessageCap()` / `getPiiMaskingDepth()` / `getSessionExpiryHours()` over `elaya_settings`. Adapter resolution lives in `lib/elaya/registry.ts`, not here. |
| `services/lead-ingestion.ts` | Webhook lead ingestion pipeline. Also exports `extractServiceInterests(formData, domain)` — best-effort `leads.service_interests` capture (never throws, never blocks the INSERT; drops unknown values against `DOMAIN_INTERESTS`; writes `text[]`, never an enum); called on both the webhook and WhatsApp insert paths. Also exports `createLeadFromWhatsApp(waId, phone): Promise<{leadId, assignedTo}>` — called by `whatsapp-ingestion.ts` when an inbound message arrives from an unknown number. Uses adminClient. |
| `services/whatsapp-api.ts` | **SERVER ONLY.** Gupshup/Meta Cloud API HTTP client. Exports: `sendTextMessage`, `sendGupshupMediaMessage` (outbound media by url — image/video/document/audio over `/wa/api/v1/msg` with `message:{type,originalUrl,caption?,filename?}`; caller passes a signed url; throws on HTTP error), `sendTemplateMessage`, `sendMediaMessage` (Meta-shaped, dormant), `uploadMedia`, `getMediaDownloadUrl`, `verifyMetaSignature` (HMAC-SHA256 + `timingSafeEqual`), `sendLeadAssignmentNotification`, `sendFounderLeadNotification`, `sendSlaAgentNotification` (4 params: leadName, leadPhone, status, lastUpdatedAt — template `GUPSHUP_SLA_AGENT_TEMPLATE_ID`), `sendSlaManagerNotification` (recipientIds[], 5 params: leadName, leadPhone, agentName, status, lastUpdatedAt — template `GUPSHUP_SLA_MANAGER_TEMPLATE_ID`), `sendLeadInitiationMessage` (to, leadName, agentName — template `GUPSHUP_LEAD_INITIATION_TEMPLATE_ID`; **CAN THROW** — action layer catches; logs every attempt as `type: 'lead_initiation'` since migration 0067), `sendTaskDueReminderNotification` (agentId, leadName, leadPhone, taskTitle, leadId? — gia tasks only, log type `task_due_reminder`), `sendTaskOverdueManagerNotification` (recipientIds[], agentName, leadName, taskTitle, dueTimeIst "4:00 PM" — `{{1}}` manager first name is per-recipient so params assemble inside the loop; log type `task_overdue_manager`), `sendTaskDueSoonAgentNotification` (agentId, agentPhone, agentFirstName, taskTitle, dueTimeIst — the **lead-agnostic** -30m "due soon" ping to the assigned agent, fires for EVERY task; params `{{1}}` agent first name `{{2}}` task title `{{3}}` due time IST; template `GUPSHUP_TASK_DUE_SOON_TEMPLATE_ID`; log type `task_due_soon`; gated by the `task_due` key), `sendTaskOverdueAgentNotification` (same signature/params — the at-due overdue ping to the assigned agent, EVERY task; template `GUPSHUP_TASK_OVERDUE_AGENT_TEMPLATE_ID`; log type `task_overdue_agent`; gated by `task_due`; both take a pre-resolved phone/first-name from the caller's `getTaskWithAssignee` context — no redundant profile fetch), `sendTaskOverdueManagerGenericNotification` (recipientIds[], agentName, taskTitle, dueTimeIst — the **task-shaped** manager escalation for a NON-lead overdue task; recipients = the assignee's manager(s) resolved by the caller via `getAssigneeManagers` (reports_to → domain); params `{{1}}` manager first name `{{2}}` agent name `{{3}}` task title `{{4}}` due time IST; template `GUPSHUP_TASK_OVERDUE_MANAGER_GENERIC_TEMPLATE_ID`; log type `task_overdue_manager_generic`; gated by `task_overdue_manager`), `WEBHOOK_VERIFY_TOKEN`, `BUSINESS_ACCOUNT_ID`. Also `sendElayaWhatsAppReply(to, text, recipientId)` — free-form session reply for Elaya's WhatsApp staff channel (NOT a template — the staff member just messaged us, so the session window is open); wraps `sendTextMessage` with the one-log-row-per-attempt `finally` contract (`type 'elaya_reply'`, migration 0117); never throws. **All ten template senders are thin wrappers over the internal `sendGupshupTemplate()` core** (dry-audit H-8) — it owns the `/template/msg` fetch, status/body/delivered capture, console line, and the one-log-row-per-attempt `finally { await logNotification }` contract; never call the Gupshup template endpoint outside it (see `src/lib/services/CLAUDE.md`). Internal `logNotification()` writes every template attempt to `whatsapp_notification_logs` (stores last-4 phone digits only, never full numbers). Fire-and-forget functions never throw to caller; `sendLeadInitiationMessage` is the sole exception (`throwOnError: true`). Never import in client components. **Audit (2026-06-01):** all 4 send functions verified — null phone guards present, parameter counts/order correct, logNotification called on both HTTP-error and fetch-throw paths (fix applied), no full phone numbers in logs, no notification awaited in hot path. Call sites: `src/lib/actions/leads.ts` (assignLead L318/L333, createManualLead L612/L621), `src/lib/actions/sla.ts` (fireSlaBreachHandler L362/L444), `src/app/api/webhooks/leads/route.ts` (L118/L127), `src/lib/services/whatsapp-ingestion.ts` (L127/L143). |
| `services/whatsapp-ingestion.ts` | **SERVER ONLY.** Inbound WhatsApp processing pipeline (LEAD pipeline — staff numbers are diverted to `elaya-whatsapp.ts` by the webhook routing gate before this runs). Uses adminClient throughout. Phone normalization via `normalizeWaPhone()` from `lib/utils/phone.ts` — shared with the Elaya gate, never fork it. Exports: `parseWebhookPayload` (flattens nested Meta envelope), `processInboundMessage` (full 9-step pipeline, idempotent via wa_message_id dedup), `processStatusUpdate` (delivery receipt — the ONLY UPDATE on whatsapp_messages, uses adminClient, A-11 narrow exception), `resolveLeadByPhone`, `getOrCreateConversation` (SELECT → INSERT ON CONFLICT DO NOTHING → re-SELECT), `insertInboundMessage` (sanitizes content with sanitizeText). |
| `services/whatsapp-media.ts` | **SERVER ONLY.** WhatsApp media durability (migration 0141 `whatsapp-media` private bucket). `storeInboundMedia(cdnUrl, mime, leadId, messageId)` — downloads a Gupshup time-limited CDN media url (32 MB cap, 0-byte guard, content-type sniff) and re-uploads to `whatsapp-media/{leadId}/{messageId}.{ext}` via the **admin client**, returns the durable storage PATH (never throws → null on failure so the caller falls back to the raw url). `storeOutboundMedia(bytes, mime, leadId, key)` — uploads a staff-attached file to the same bucket under `{leadId}/out-{key}.{ext}`, returns the path (Phase 2 outbound). `signMediaPath(pathOrUrl)` — mints a 1-hour signed url for a stored path (admin client); passes raw `http(s)` values through untouched (legacy/fallback rows). `mediaExtFromMime` helper + `WHATSAPP_MEDIA_BUCKET`/`WHATSAPP_MEDIA_SIGNED_URL_TTL_SECONDS` consts. Both inbound ingestion (`whatsapp-ingestion.ts`) and the read path (`getMessages` + `signWhatsAppMediaAction`) use this — never store a raw CDN url as the canonical `media_url`, never sign on the session client. |
| `services/whatsapp-service.ts` | UI-facing WhatsApp queries. Uses session client — RLS handles access. Exports: `getConversations` (paginated, cursor = last_message_at), `getConversation`, `getConversationByLeadId` (single row by lead_id FK, returns null when none — used by lead dossier), `getMessages` (paginated ASC, joins sender profile), `getUnreadCount` (calls `get_wa_unread_count` RPC — per-agent LEFT JOIN unread count, returns 0 never null), `markConversationRead(conversationId, agentId)` (UPSERT into whatsapp_conversation_reads — `agent_id` has NO DB default, the caller's verified profile id is mandatory), `searchConversations` (ILIKE on name/phone, sanitized, max 20). List/search rows carry a per-caller `unread_count` (0/1) via the internal `attachUnreadCounts` — one batched RLS-scoped reads query mirroring the `get_wa_unread_count` predicate. |

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

## tasks — write paths and RLS (migration 0094; category collapsed in 0138)

`tasks-service.ts` is read-only. All writes go through `src/lib/actions/tasks.ts` or lead RPCs.

**`task_category` is structure-only (2 values, migration 0138):** `personal` | `group_subtask`. A
**lead follow-up is a `personal` task that ALSO has a `task_gia_meta` row** — the meta row IS the
task→lead link; the category no longer encodes it. `tasks.module` is the `task_module` enum
(`'gia'`/`'sia'`/`'core'`). **THE SINGLE-WRITER INVARIANT:** `create_lead_gia_task` (+ the
`update_lead_status` nurturing branch) is the SOLE writer of a `task_gia_meta` row AND `module='gia'`,
always in one transaction; every other insert writes `module='core'` + no meta row. So meta-presence
/ `module='gia'` is the permanent lead-task signal — detect a lead task that way, never by category.

| Task kind | Write path | Client | Direct RLS INSERT/DELETE |
| --- | --- | --- | --- |
| `personal` (standalone, `module='core'`) | `createPersonalTaskAction` | `adminClient` today; `tasks_insert` allows user-scoped self-assign insert | `tasks_delete` (agent, `to_do`/`in_progress` only); `tasks_delete_privileged` (manager+) |
| `group_subtask` (`module='core'`) | `createSubtaskAction` | `adminClient` only | No INSERT policy — blocked on user client |
| lead follow-up (`personal` + `task_gia_meta` row + `module='gia'`) | `create_lead_gia_task` RPC, `update_lead_status` RPC (nurturing) | RPC / `adminClient` | No INSERT policy — blocked on user client |

**Rule:** Never add a user-scoped `.insert()` for a lead follow-up (the `personal`+meta+`module='gia'`
shape) or `group_subtask`. Lead-task creation must stay on `create_lead_gia_task` (the single-writer
RPC — keeps the meta row + `module` from ever drifting); group subtasks stay on SECURITY DEFINER RPCs
or service-role actions.

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
| `actions/whatsapp.ts` | WhatsApp actions — `sendWhatsAppMessage`, `markConversationAsRead`, `resolveConversation`, `reopenConversation`, `getConversationsAction`, `getMessagesAction`, `searchConversationsAction`, `getConversationByLeadIdAction` (by lead UUID, returns `{ data, error }`, null data = no conversation — not an error), `sendWhatsAppMediaMessage(formData)` (outbound media: Zod `SendMediaMessageSchema` → store in `whatsapp-media` → sign → `sendGupshupMediaMessage` → persist outbound row with `media_url`=path → return row w/ signed url), `signWhatsAppMediaAction` (signs a single storage path for a media message arriving via realtime while the panel is open — `getMessages` already signs on open), `initiateWhatsAppConversationAction` (creates conversation + sends initiation template; adminClient INSERT; returns `{ data: { conversation, message }, error }`; idempotent — returns existing conversation on race) |
| `actions/profiles.ts` | User/profile management + `getAssignableUsersAction(domain?)` — THE client-callable assignable-users read (returns canonical `AssignableUser` from `lib/types`; no domain → all active non-guest users; with domain → admin/founder get every active user, others agents only) |
| `actions/agent-routing.ts` | `toggleAgentRouting`, `setAgentShiftAction` |
| `actions/leads.ts` | Lead lifecycle — `addLeadCallNote`, `addLeadNote`, `updateLeadStatus`, `assignLead`, `createManualLead`, `createLeadTaskAction`, `recordDeal`, `updateLeadEmail`, `updateLeadDomain`, `updateLeadSource` (renamed from `updateLeadUtmSource` in the 0065 attribution refactor), `updateLeadCity`, `updateLeadInterests` (Phase 1.1b — same `assertLeadFieldEditAccess` gate; drops unknowns vs lead domain via `extractServiceInterests`; activity `lead_interests_updated {old, new}`; no-op edits skip write+activity), `updatePersonalDetails`, `searchLeadsAction`, `exportLeadsAction`. **`updateScratchpad` removed** — scratchpad dropped in migration 0061. **Four of these (`addLeadNote`, `updateLeadStatus`, `assignLead`, `createLeadTaskAction`) delegate their write body to a shared core in `services/lead-mutations.ts`** so Elaya's write tools (E3) run the identical mutation+side-effects; the action keeps Zod → `requireProfile()` → session `hasAccess` → core → `revalidatePath`/`after()`. `addLeadCallNote` is NOT cored (its cadence chain stays bespoke). |
| `actions/revival.ts` | Lead Revival R1 actions. `reviveLeadAction` — manual revive (Revive button, both mount points): Zod → `requireProfile()` → lead `hasAccess` (mirrors `updateLeadStatus`) → `reviveLeadCore` (the E2 task path + "Revived" marker) → resolve the candidate to `actioned` (supplied id, or any open candidate for the lead) → `revalidatePath`. NEVER changes the lead's status. `dismissRevivalCandidateAction` — review-tab "not now" (marks the candidate `dismissed`, no task). `updateRevivalPolicyAction` — `/settings` write: Zod → `requireProfile(['admin','founder'])` → `updateRevivalPolicy` (admin client) → `revalidatePath('/settings')`. |
| `actions/dashboard.ts` | Dashboard widget data refresh — 6 actions: `getAgentTasksSummaryAction`, `getAgentRecentActivityAction`, `getLeadStatusSummaryAction(from?, to?, targetDomain?)`, `getLeadsByCampaignAction(from?, to?, targetDomain?)`, `getLeadVolumeByDomainsAction`, `getLeadVolumeForDomainAction`. The status/campaign `*ForDomainAction` twins were collapsed into the optional-`targetDomain` actions (dry-audit H-5); `getLeadVolumeByRangeAction` deleted (zero call sites). Managers are always pinned to their own domain via the single `effectiveWidgetDomain()` helper regardless of the requested target. Volume stays two actions deliberately — `MultiDomainVolumeSummary` vs `LeadVolumeSummary` are different shapes. |
| `actions/ad-creatives.ts` | `upsertAdCreative`, `deleteAdCreative` (admin/founder only; adminClient writes; campaign_key via `normalizeCampaignKey()` from `lib/utils/campaigns.ts`; revalidate /admin/ad-creatives + /campaigns) |
| `actions/ad-spend.ts` | `uploadAdSpendAction` — Zod (`uploadAdSpendSchema`) → `requireProfile(['admin','founder'])` → server-side re-sanitize + `normalizeCampaignKey()` → upsert on `(campaign_key, spend_date, source)` → `{ inserted, updated, skipped }`. Idempotent: re-uploading the same export changes zero values. Rows arrive pre-parsed from the CLIENT-SIDE `lib/utils/ad-spend-parse.ts` (the range-grain whole-file rejection lives there). |
| `actions/performance.ts` | Performance actions — `getAgentSelfMetricsAction`, `getAgentDetailMetricsAction`, `getManagerRosterAction`, `getDomainHealthMetricsAction`, `getAgentPulseAction` (agent-only; self-scoped RPC), `getAgentRecentLeadActivityAction` (agent-only; cursor validated, agent id always from the verified profile), `upsertDomainTargetAction` (admin/founder; Zod → guard → `domain-targets-service`). **Phase 5 founder-deck drill-downs** — `getAgentCallsForManagerAction`, `getAgentActivityForManagerAction`, `getAgentLeadsScopedAction`, `getAgentDealsScopedAction`, all behind the shared `assertDrillAccess` (mirrors `getAgentDetailMetricsAction` authz: `requireProfile(['manager','admin','founder'])` → manager `domain === caller.domain` guard, fails CLOSED). Leads/deals reuse `getLeadsByRole`/`getDealsByRole` with `filters.agent_id` (the agent-caller branch ignores it = scope guard; manager+ branch honours it) — NO new service query; calls use the new `getAgentCallsPageForManager`. **`getAgentLeadsScopedAction` also takes optional `period/customFrom/customTo` (2026-06-20)** — when supplied it resolves the range like `getAgentDetailMetricsAction` and passes `date_from/date_to` into `getLeadsByRole` so the drill list's total equals the deck/detail Leads tile's period-scoped count; omitted → all-time (legacy). **`getFirstTouchBucketLeadsAction(agentId, domain, bucketId, period, …)` (2026-06-24)** — the drill behind a clicked First-Touch Speed bar (same `assertDrillAccess` gate): `getAgentFirstTouchBucketLeadIds` (reuses the scorecard's classification) → `getLeadsByIds` scoped by the caller's role/domain. No new query, no re-bucketing. **`getAgentLeadsByPredicateAction(agentId, domain, period, predicate, …)` (2026-06-24)** — the drill behind a clicked Lead-Pipeline segment OR Call-Outcome slice (`predicate` = a `status` OR an `outcome`; same gate): reuses `getLeadsByRole`'s indexed `status`/`last_call_outcome` predicates + `agent_id` + period; predicate validated against `LEAD_STATUSES`/`CALL_OUTCOMES`; returns a bounded flat `LeadListItemWithAssignee[]`. NO new query. (Outcome = distinct leads whose LATEST call was that outcome — not call events.) **`getDomainLeadsDrillAction(domain, kind, period, …)` (2026-06-24)** — the DOMAIN-scoped twin (founder Domains-tab card tiles; same `assertDrillAccess` gate): reuses `getLeadsByRole` with `filters.domain` + NO `agent_id` + period; `kind: 'all'` (no predicate) / `'calls'` (`last_call_outcome IN` all `CALL_OUTCOMES`) / `'won'` (`status='won'`). NO new query. |
| `actions/intelligence.ts` | Call Intelligence — `getHelpdeskLibraryAction` (any role; non-Gia domains read the `onboarding` library), `upsertServiceCaseAction` / `upsertConversationHookAction` (Zod first → `requireProfile(['admin','founder'])` → `sanitizeText` → session-client write so the 0110 RLS double-enforces → awaited helpdesk-key `redis.del` → `revalidatePath('/helpdesk')`) |
| `actions/notifications.ts` | `markNotificationReadAction`, `markAllReadAction` |
| `actions/usage.ts` | Agent usage / active-time tracking (migration 0126). `recordPresenceAction()` — THE heartbeat hot path, called by `<UsagePresence>` every 60s while active; `requireProfile()` (any role) → ONE `recordPresence` Redis SET; **no Zod input** (takes nothing — identity is the verified profile), **no DB write**. `getAgentUsageAction()` — the admin/founder dashboard read; `requireProfile(['admin','founder'])` → `getAgentUsage` (which ALSO re-gates in the service layer — defence in depth); returns `ActionResult<AgentUsageReport>`. |
| `actions/push.ts` | Web Push device subscriptions (migration 0120). `savePushSubscriptionAction(input)` — Zod → `requireProfile()` → upsert on `endpoint` (one row per device, re-binds owner on re-subscribe) via the SESSION client (owner-only RLS double-enforces). `removePushSubscriptionAction(endpoint)` — unsubscribe (delete own row, idempotent). The browser side is `hooks/usePushSubscription.ts`; the cross-user send + prune is `services/push-service.ts` (admin client). Never call `dispatchPush` from here — push fan-out lives inside `createNotification`. |
| `actions/tasks.ts` | OS Tasks actions — `createPersonalTaskAction`, `createGroupTaskAction`, `createSubtaskAction`, `updateTaskStatusAction`, `updateTaskAction`, `deleteTaskAction`, `addTaskRemarkAction`, `suppressTaskRemarkAction`. **The six write actions delegate their write body + side-effects to a shared core in `services/task-mutations.ts`** (Brief 2 substrate) so Elaya's future write tools run the identical mutation+reminder+notify+cache; the action keeps Zod → `requireProfile()`/`getCurrentProfile()` → per-resource gate (`canMutateTask`, now imported from `task-mutations.ts` and passed the session client) → `actorFromProfile(caller)` → core → `revalidatePath`. `addTaskRemarkAction` (its own status-RPC), `suppressTaskRemarkAction`, `deleteGroupTaskAction`, `updateChecklistAction`, `updateTaskTagsAction` are NOT cored. |
| `actions/transcription.ts` | `transcribeAudioAction(formData)` — THE client entry for speech-to-text. Zod (`TranscribeAudioSchema`) first, `requireProfile()` (any role), then `transcription-service`. Returns `{ data: { text }, error }`. **Writes nothing** — the transcript lands in the caller's composer as an editable draft and saves via the existing write path (e.g. `addLeadNote`, which owns sanitisation + cache invalidation). Never auto-submit a transcript. Recording side: `src/hooks/useAudioRecorder.ts`. |
| `actions/sla.ts` | Gia follow-up engine actions (config-driven since 0111 — every schedule/fire reads `sla_policies` per run) — `scheduleSlaTimersForLead`, `cancelSlaTimersForLead`, `refreshActivitySlaTimers`, `armCadenceForOutcome` (arms the daily CAD tick after a call note; chained AFTER schedule/refresh settle — their cancel-all would kill the fresh tick), `fireSlaBreachAction` (Trigger.dev only), `fireSlaBreachHandler` (internal — cadence path for `trigger_kind='outcome'` OR any CAD-prefixed code (`isCadenceCode`, 0114): status cadences like CAD-02A create the follow-up task and re-arm `threshold_minutes` ahead while the lead stays in the trigger status; founder rules notify via `sla_breach_founder` + the SLA manager template) |
| `actions/sla-policies.ts` | `updateSlaPolicyAction` — THE /settings follow-up-engine write path (deliberately separate from the sessionless engine file): Zod (`UpdateSlaPolicySchema`) → `requireProfile(['admin','founder'])` → `updateSlaPolicy` (admin client — 0111 has no write RLS by design) → `revalidatePath('/settings')`. Only threshold/channels/hours_mode/active are writable; rule identity never changes through the UI. |

## Types registry

| File | Purpose |
| ---- | ------- |
| `types/database.ts` | Auto-generated Supabase row types. Regenerate with `supabase gen types typescript --local`. Never hand-edit. |
| `types/index.ts` | Shared app types not tied to a single DB table (e.g. `DashboardSummary`, `ActionResult`). Also `WithAuthor<T>` / `WithAssignee<T>` / `WithActor<T>` (dry-audit L-3) — THE way to express "row + joined profile fields"; never hand-write a fresh `& { author: … }` intersection in a service. |
| `types/elaya.ts` | Hand-declared Elaya row types (`ElayaConversation`, `ElayaMessageRow`, `ElayaActionRow`, `LlmProviderRow`, `UserContextRow`, `ElayaToolCallRecord`) — TEMPORARY until `database.ts` is regenerated after migration 0116 is applied; shapes mirror the migration exactly. Types only — no runtime values. |
| `types/revival.ts` | Hand-declared Lead Revival row types (`RevivalCandidateRow`, `RevivalPolicyRow`, `RevivalVerdict`, `RevivalCandidateStatus`, `RevivalGateVerdict`) — TEMPORARY until `database.ts` is regenerated after migration 0119 is applied; shapes mirror the migration exactly. Types only. The vocabulary (`REVIVAL_TRIGGER_STATUSES`, defaults, task markers, sweep tuning) lives in `constants/revival.ts`. |
| `types/usage.ts` | Hand-declared usage / active-time tracking row types (`PresenceEntry` — the Redis presence envelope; `UsageDailyRow`; `AgentUsageToday`; `AgentUsageHistoryPoint`; `AgentUsageReport` = the `get_agent_usage` `{today, history}` envelope) — TEMPORARY until `database.ts` is regenerated after migration 0126; shapes mirror the migration exactly. Types only. |
| `types/whatsapp.ts` | Meta Cloud API payload shapes (`MetaWebhookPayload`, `MetaInboundMessage` discriminated union, `MetaStatusUpdate`, `MetaApiResponse`, `TemplateComponent`) + app-internal types (`WhatsAppConversation`, `WhatsAppMessage`, `SendMessageInput`). Types only — no runtime values. |

## Validations registry

| File | Purpose |
| ---- | ------- |
| `validations/profile-schema.ts` | Profile create/update/auth/deactivate/invite/avatar schemas |
| `validations/lead-schema.ts` | Lead schemas — `CreateManualLeadSchema.source` + `.service_interests` (string[] default `[]`, bounded/normalised here; vocabulary drop happens in the action against the resolved domain via `extractServiceInterests`), `UpdateLeadInterestsSchema` (dossier inline edit — same array contract), `UpdateLeadSourceSchema` (renamed from `UpdateLeadUtmSourceSchema` in the 0065 attribution refactor — field is now `source`, persisted to `leads.source`), `createLeadTask` / `recordDeal` |
| `validations/task-schemas.ts` | OS Tasks schemas (create personal/group/subtask, update, checklist, tags, remarks) |
| `validations/ad-creative-schema.ts` | `upsertAdCreativeSchema` (id optional → create/update), `deleteAdCreativeSchema` |
| `validations/ad-spend-schema.ts` | `uploadAdSpendSchema` — bounded array (≤5000) of pre-parsed day-grain spend rows + parser `skipped` count; the action re-normalises/re-sanitizes server-side |
| `validations/transcription-schema.ts` | `TranscribeAudioSchema` (Blob instance + non-empty + ≤ `MAX_VOICE_NOTE_BYTES` 3 MB + audio/webm/mp4 type check). Issue messages are internal codes mapped to `formErrors.audio*` / `transcriptionFailed` in the action — never shown raw. |
| `validations/push-schema.ts` | `SavePushSubscriptionSchema` (endpoint url + p256dh/auth keys + optional userAgent) / `RemovePushSubscriptionSchema` (endpoint). Mirrors the browser `PushSubscription.toJSON()` shape. Issue messages are internal codes mapped to `formErrors` in `actions/push.ts` — never shown raw (Q-04). |
| `validations/whatsapp-schema.ts` | `MetaWebhookPayloadSchema` (permissive passthrough), `MetaStatusUpdateSchema`, `SendMessageSchema` (conversationId uuid + content 1–4096 chars), `SendMediaMessageSchema` (conversationId uuid + optional caption ≤1024 + `file` Blob: non-empty, ≤16MB, MIME on the outbound allowlist via `resolveOutboundMediaType`), `ResolveConversationSchema`. Human-readable error messages — never Zod defaults. |
| `validations/intelligence-schemas.ts` | `ServiceCaseSchema` (title ≤120, ≤10 lowercase-slug tags, domain enum) + `ConversationHookSchema`. Human messages only. |
| `validations/sla-policy-schema.ts` | `UpdateSlaPolicySchema` — code regex + optional active/thresholdMinutes (0–43,200)/channels (`in_app`/`whatsapp`)/hoursMode; refine requires ≥1 editable field. Human messages only. |
| `validations/revival-schema.ts` | Lead Revival R1 schemas — `ReviveLeadSchema` (leadId uuid + optional candidateId uuid), `DismissRevivalCandidateSchema` (candidateId + leadId), `UpdateRevivalPolicySchema` (triggerStatus enum + optional silenceDays 0–365 / dailyCapPerAgent 0–500 / active; refine ≥1 editable field). Issue messages are internal codes mapped to `formErrors` in the action — never shown raw (Q-04). |
| `validations/elaya-schema.ts` | `ElayaChatRequestSchema` (message 1–4000 chars + optional conversationId uuid) for `POST /api/elaya/chat`. Issue messages are internal codes mapped to `formErrors.elaya*` in the route — never shown raw. Tool input schemas live with the tools in `lib/elaya/tools/registry.ts` (model-facing, not user-facing forms). |

## Trigger.dev jobs

| File | Purpose |
| ---- | ------- |
| `src/trigger/task-reminders.ts` | `scheduleTaskReminder(taskId, dueAt, assignedTo)`, `cancelTaskReminder(taskId)` (sweeps due reminder AND pending overdue check — same tag), `sendTaskReminderTask` (at due: in-app for all categories + TASK-01A WhatsApp & overdue-check arming for gia tasks), `checkTaskOverdueTask` (due+30 clock-min: clearing events → exactly-once `overdue_at` stamp → domain-manager in-app + WhatsApp) |
| `src/trigger/lead-sla.ts` | `scheduleLeadSlasTask(leadId, ruleCode, fireAt, assignedAgentId, domainManagerIds, opts?)` (`opts.idempotencySuffix` = IST date for cadence ticks), `cancelLeadSlasByLeadTask(leadId)`, `fireLeadSlaTask` (Trigger.dev task — exported for scan; policy read per fire) |
| `src/trigger/usage-snapshot.ts` | `snapshotUsagePresenceTask` — THE 1-minute active-presence snapshot (adoption tracking, migration 0126; cron `* * * * *`). Reads the live Redis `presence:*` keys (`listLivePresence`) and appends one `usage_heartbeats` row per active user (`insertUsageHeartbeats`, admin client). The ONLY writer of `usage_heartbeats` — the heartbeat request path is Redis-only. Idempotent: a same-minute duplicate collapses in the rollup's DISTINCT-minute count. |
| `src/trigger/usage-rollup.ts` | TWO scheduled tasks, both writing the SAME `usage_daily` via the SAME idempotent `rollupUsageForDays` core (Option 2). `rollupUsageTodayTask` — re-rolls **today (IST)** every 15 min (`*/15 * * * *`, `Asia/Calcutta`). `rollupUsageNightlyTask` — 00:20 IST (`20 0 * * *`, `Asia/Calcutta`): finalises the **prior IST day** (+ today as cheap insurance), then `pruneOldHeartbeats(30)` drops raw ticks > 30 days (`usage_daily` is never pruned). Recompute-and-UPSERT (overwrite, never increment) → re-running yields identical rows. IST dates via `istDateString` (usage-service) — never re-fork IST math. |
| `src/trigger/lead-revival.ts` | `sweepRevivalCandidatesTask` — THE daily silence-detection sweep (Lead Revival R1). The project's FIRST `schedules.task` (cron `0 2 * * *` / 07:30 IST) — everything prior is per-lead delayed jobs; this is the single periodic entry point, NOT a parallel scheduler. Per run: reads `revival_policies` → per status finds silent leads with no open candidate → runs the note-AI gate per lead → confident `revive` under the agent's daily cap → `reviveLeadCore` (Revived task) + `actioned` candidate; cap-overflow / `unsure` → `open` candidate (review tab). Idempotent (daily cron + one-open guard + the partial UNIQUE index). Dynamic-imports its server-only deps to stay out of the Trigger.dev module scan. |

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
3. `addLeadCallNote` — after note write: update `last_activity_at` + `last_call_outcome(_at)`; if auto-advanced new→touched → `scheduleSlaTimersForLead`; else → `refreshActivitySlaTimers` (SLA-02/03 only; SLA-01 never refreshed by activity). In both branches `armCadenceForOutcome` is chained `.then()` AFTER the schedule/refresh — never in parallel (the cancel-all would sweep the fresh cadence tick).

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
