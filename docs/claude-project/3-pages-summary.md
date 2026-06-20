# Serene — Pages Summary (Claude Project digest)

> Generated digest of the per-route specs in `docs/pages/` — 2026-06-20. Each spec's "Deep dive"
> holds the full invariant lists; attach the individual spec to a chat for page-level work.

All list pages follow the canonical layout: `<h1 class="type-page-title">Title<span
class="page-title-dot">.</span></h1>` + top-right CTA → paper filter strip (`<FilterBar>`) →
Suspense-wrapped async content. Loading files compose `PageSkeletons`; empty states compose
`<EmptyState>` (Playfair italic, never "No data available").

## /dashboard

Personalised bento grid of independently code-split widgets (`dashboard-widgets.ts` registers
10: 5 agent — `agent-tasks`, `agent-activity`, `agent-pending-calls`, `agent-new-leads`,
`elaya-presence`; 5 manager cohort — `manager-lead-status`, `manager-lead-volume`,
`manager-campaigns`, `manager-cold-leads`, `manager-budget`). One server-side
`get_dashboard_summary` RPC (React `cache()`) seeds first paint; a global URL-param date filter
scopes pipeline/campaign/volume by `leads.created_at` (IST). Agents: `agent-tasks` +
`agent-activity` (own data, date filter n/a). Managers: the 5-widget manager cohort plus
`agent-tasks` + `agent-activity` (7 total). Admin/founder: the full set. Domain scope is a
**single global selector** (`resolveDomainParam`; default = all-domains aggregated) — the old
per-widget domain picker tabs were **removed 2026-06-17**. Layout persists per user in localStorage
(`useDashboardLayout`); widget fetch lifecycle via `useWidgetData`; manager scope re-pinned
server-side (`effectiveWidgetDomain()`). Page never throws on RPC failure — renders zeroed data.

## /elaya

In-app chat with Elaya, the AI presence (all roles, `ALWAYS_ALLOWED_PREFIXES`; access is gated
per-principal in the tool layer, not the route). RSC seeds the 24h server-side conversation
window + last-50 transcript + remaining daily budget (deterministic greeting, no model call on
load) via the shared **`resolveElayaChatSeed(profile)`** helper (`elaya-service.ts`) — THE single
source of `ElayaChatShell`'s props; `ElayaChatShell` POSTs to `/api/elaya/chat` and consumes
**SSE** frames. **Second entry point:** a floating bottom-right `ElayaWidget` (mounted in the
dashboard layout, hidden on `/elaya`) opens a modal with the **same `ElayaChatShell`**
(`hideIdentity`), seeded by `getElayaChatSeedAction()` → the same helper (same conversation +
cap); it hides on `/elaya` so two live shells never double-count the cap. **Tools:** 6
read-only tools (Phase 1) **plus Phase 2 agentic writes** — `add_lead_note` + `create_lead_task`
execute inline, while `update_lead_status` + `reassign_lead` are **propose-only**, executed by a
pure-code confirmation resolver (`classifyConfirmation`, default `other`=cancel) that runs before
each turn; every write wraps the shared `lead-mutations.ts` core (cache/activity/SLA/notify
inherited) and lands in the `elaya_actions` ledger (proposed→executed/failed/dismissed). **Voice
input** via `DictationButton` (Deepgram Nova-2, Hinglish) → editable draft, never auto-send.
Daily cap **200/day** counted from IST midnight, **shared across channels** (in-app + WhatsApp),
enforced server-side. Layout: `serene-dossier-grid--340` (chat card + `ElayaIdentityCard`
breathing-glyph sidebar). Never render Elaya data without a tool round-trip.

## /leads (list)

The Gia pipeline list — display-only dense table; filters/search/pagination are server-side
URL params. `getLeadsByRole` (Redis 30s, version-counter invalidation); search via the
`leads.search_text` trigram column; status-count pills via `get_leads_status_counts`. Column
visibility/order per user (`useLeadColumnPreferences`, localStorage). `AddLeadButton` +
on-intent `AddLeadModal` (`createManualLead`); CSV/XLSX export is **client-side only**
(`lib/utils/export.ts` — never imported by server code), respecting current filter scope.
Page size fixed at 30. Agents see own, managers domain, admin/founder all. Open item:
archived leads invisible to phone search (RLS bakes in `archived_at IS NULL`).
**Revival review tab** (`?revival=true`): the same `LeadsTable` reused, scoped to leads with an
open `revival_candidates` row (unsure/overflow verdicts from the daily sweep — see Lead Revival),
under a `RevivalReviewBanner`; each row carries a `ReviveLeadButton` to dispatch the "Revived"
follow-up task. Revival is a layer over leads — it never mutates the lead status/columns.

## /leads/[id] (dossier)

The per-lead workspace. Slug-first lookup (UUID fallback), wave-1 blocking fetch for header +
status panel only, everything else streamed behind per-section Suspense; streamed children
fetch by `lead.id` UUID, **never the URL param**. Components: `StatusActionPanel`
(lifecycle CTAs + `CalledModal`/`WonDealModal`/resolution confirms), `LeadInfoCard` (inline
field edits), notes input + timeline, `LeadDealCard`, `LeadWhatsAppCard` (can initiate a
conversation via the `lead_initiation` template), `LeadTasksCard`. Won flow: `recordDeal`
inserts the `deals` row **before** the status flip. No access → `redirect('/leads')`.
Detail pages show a back link, no page-title dot. **Voice dictation** in note inputs
(`LeadNotesInput` + `CalledModal`): `DictationButton` → Deepgram Nova-2 (hi-Latn Hinglish)
transcribes to an **editable draft** that never auto-sends; audio is never stored.

## /deals

Every closed transaction (lead-won + walk-in). `getDealsByRole`, summary strip via
`get_deals_summary` (StatTile cells). Card-list mode (`DealCard` motion cards). Two write
paths: `recordDeal` (from dossier) and `createWalkInDeal` (`lead_id = null`, domain-locked
server-side for agents). `won_at` immutable; membership deals require duration; revenue always
reads `public.deals`. Agents own / managers domain / admin+founder all (+ domain filter).

## /tasks and /tasks/[id]

Tabbed hub: **Gia tab** (lead-linked follow-ups), **My Tasks** (personal, calendar view),
**Group Tasks** (cards → `/tasks/[id]` group workspace with list/board + Realtime).
One `tasks` table discriminated by `task_category`; status changes ride append-only
`task_remarks` (`add_task_remark_with_status`). Group visibility is data-driven: creator OR
assigned a subtask — no role/domain branching; agents never see colleagues' subtasks.
Create modals all compose `TaskFormFields`; `SubTaskModal` two-zone with `TaskRemarksPanel` +
`AssigneePickerModal` (nested-modal z-pair 61/62). Due reminders via Trigger.dev
(cancel-before-delete). Open item: group accent/icon/member chips are UI-only (no DB columns).

## /campaigns and /campaigns/[id]

Campaigns are **not** table rows — a campaign is a distinct `leads.utm_campaign` value; all
metrics derive from grouping `leads` (`archived_at IS NULL`). List = one card per
(utm_campaign, domain); detail = metrics strip + agent distribution + leads table + optional
ad-creative carousel. Three SECURITY DEFINER RPCs, always live (no Redis), client EXECUTE
revoked. Display names via `beautifyCampaignTitle()` — campaign identity is always the exact
string. manager/admin/founder only (managers domain-locked server-side); agents redirected.

## /performance

One URL, three role layouts. **Agent:** own core-four metrics, effort, outcome breakdown,
benchmarks — ONE self-scoped `get_agent_performance` RPC round trip. **Manager:** domain
roster + per-agent detail (`get_agent_roster_performance` pins managers to `get_user_domain()`
in SQL — forged params cannot widen scope). **Founder/admin:** Agents tab (all-domain roster)
+ Domains tab (health cards + comparative chart, revenue from `public.deals`). IST period
presets (today/this_week/this_month/prev_month/custom) via `lib/utils/ist.ts`. **Critical
date-field rule:** `leadsWon`/`conversionRate` by `status_changed_at`; `touchRate` by
`created_at` cohort — intentional asymmetry. `MetricCard` is deliberately bespoke.

## /budget

Founder/admin spend-vs-outcomes per campaign, fed **only** from CSV/XLSX uploads — never a Meta
API. manager (read) · admin/founder (read + upload) · agent/guest → `redirect('/dashboard')`.
`ad_spend_daily` (day grain, `UNIQUE(campaign_key, spend_date, source)`, RLS manager+ read) is
joined to lead counts (`created_at` cohort) and deals (`won_at`, by `deals.lead_id`) on the
shared `campaign_key` via the `get_budget_summary(from, to)` RPC (EXECUTE revoked, admin-client,
**no Redis** — always live, like `/campaigns`; CPL/CPD computed in `ad-spend-service.ts`, `null`
→ "—" at zero denominators). The Meta daily-breakdown parser (`ad-spend-parse.ts`) is
**client-side only** (dynamic `xlsx`, same rule as `export.ts`) and **rejects the entire file**
when any row's reporting-start ≠ reporting-end (a range-grain file would permanently double-count
— never soften to a per-row skip). `campaign_key` is always `normalizeCampaignKey()` (lowercase +
trim), matched in SQL as `lower(trim(utm_campaign))`. IST period presets reuse `PerformanceFilters`.

**Per-account recharge ledger (2026-06-20):** a second finance plane — `ad_account_recharges`
(migration 0139, manager+ read / admin/founder write, mirrors `ad_spend_daily`) records money sent
to each Meta ad account. The **Accounts** tab groups spend by ad account (DERIVED from the campaign
key — `resolveAccountFromCampaign`, the index-2 `TG_<Domain>_<Account>_…` segment, in
`lib/constants/ad-accounts.ts`; 3 live accounts `april`/`gmr`/`dubai` + a documented "Indulge New
Gen" placeholder) and shows recharged · spent · **balance** per account + a grand total, with an
**Unattributed** block for any campaign whose account can't be resolved (visible, never merged).
Balance is **INR-only** — non-INR recharges are recorded but excluded (footnoted). `method` is a
payment-method label, card-PAN-rejected at Zod + DB CHECK (no card data persists). Add Recharge is a
`Modal` form (admin/founder); history is a `Table<T>`. Upload copy clarified: weekly cadence works
(a multi-day daily-breakdown export uploads as one row per day, idempotent) — the grain guard
(rejects date-RANGE exports) is unchanged.

## /escalations

manager+ "what needs intervention right now" (agents/guests → `redirect('/dashboard')`; manager
pinned to own domain, admin/founder org-wide with a Domain column). Three sections built entirely
on artifacts the follow-up engine already produces — **no new tables, no jobs, no cache**
(`sla-service.ts` reads, session-derived scope, never URL params): **SLA breaches** (fired
`lead_sla_timers` within 7 days, re-checked so a lead that moved past the triggering status is
dropped; CAD cadence ticks excluded), **overdue tasks** (open gia_followup tasks with a non-null
`tasks.overdue_at` stamp), and **going cold** (the byte-equivalent `/leads?going_cold=true`
predicate — `last_activity_at` older than 5 days). Reads are **never cached** — an escalation
surface must never show a stale breach.

## /helpdesk

The Call Intelligence library (all roles, `ALWAYS_ALLOWED_PREFIXES`). RSC fetches the **full**
domain-scoped library once (`getHelpdeskLibrary(domain)` — Redis 1hr `{cases,hooks}` envelope →
Supabase) and hands it to `<HelpdeskSearch>` as `initialData`; **all filtering is client-side**
— never a per-keystroke server search. Domain shelf resolved via the shared `resolveDomainParam`
(admin/founder pick via the global DomainSelector; others read their own Gia shelf, default Gia
fallback). Tables `service_cases` + `conversation_hooks` (all-authenticated read / admin+founder
write); the same library powers the dossier `ServiceInterestCard`. The "+ Suggestion" CTA + the
in-modal Edit are admin/founder-only (cosmetic gate; the server re-checks role on every save).

## /whatsapp

Shared WhatsApp inbox: split-pane conversation list + thread, Realtime sync, optimistic
composer with rollback. One conversation per lead phone; inherits lead assignment/domain
rules (`can_access_wa_conversation` — coupled to leads RLS, review together). Unread counts
only via the `get_wa_unread_count` RPC. Resolve/reopen: manager+. Agent-initiated
conversations from the dossier open the 24h session window via the `lead_initiation` template.
Customer-facing bot columns dormant (`bot_active`/`is_bot` never set — the customer chatbot is
not built). But the **Elaya staff channel is live**: `tryHandleElayaWhatsAppMessage` routes a
recognised staff number to the same Elaya brain/tools/daily cap (one reply), leaving the lead
pipeline untouched for unknown numbers; inbound staff voice notes are transcribed (Deepgram).

## /settings

Agent-roster configuration over `agent_routing_config`: round-robin pool toggle
(`is_active` — instant removal from assignment pool), shift windows, work days (`shift_days`,
null = global business hours; stored as JS day-of-week, 0=Sun). manager/admin/founder
(managers limited to own domain; `toggleAgentRouting` verifies the target agent's domain for
manager callers). Optimistic toggles roll back on error. Shift fields are advisory — read by
ingestion + the SLA engine's shift overrides, not DB-enforced.

## /admin/users (+ /new, /[id])

Team management over `profiles`: browse, create (password or magic-link invite — both via the
`on_auth_user_created` trigger), edit fields, change role/domain (privileged, audited,
second-actor rule), soft-deactivate, toggle agent routing. List+create: admin/founder.
Detail: managers may **view** agents (profile form + routing toggle only — never the
authorization form or active toggle). Email immutable after creation. Detail pages compose
`SectionCard` + `BackButton`.

## /admin/ad-creatives

Admin/founder upload/manage campaign videos (`ad_creatives` + `ad-creatives` Storage bucket),
keyed by normalised `campaign_key` matching `leads.utm_campaign` (string equality, **no FK**;
multiple videos per campaign). Read-only surfaces: dossier video modal, campaign detail card,
campaign list carousel. **No Redis** for this service — freshness via `revalidatePath`
(the former cache was removed as a P-08 bug; do not re-add).

## /admin/usage

Admin/founder adoption dashboard (`redirect('/dashboard')` for anyone else; `getAgentUsage`
re-gates founder/admin in the service layer — defence in depth). Built over `usage_daily`
(migration 0126) via the `get_agent_usage` RPC, seeded server-side into `<UsageDashboard>`. The
daily rows are rolled up by the Trigger.dev usage jobs (1-min `usage-snapshot.ts` → `usage_heartbeats`;
15-min + nightly `usage-rollup.ts` → `usage_daily`). RSC returns `null` on failure — never throws.

## /admin/suggestions

Admin/founder staff suggestion/bug triage (`redirect('/dashboard')` otherwise; the service
re-gates). Reads the `suggestions` table (migration 0134); screenshots live in the **private**
`suggestions` Storage bucket (0135) — the row stores **paths**, never URLs, with short-lived
signed URLs minted server-side at read time. Resolving a suggestion fires a `suggestion_resolved`
notification (`notifications.type` extended in 0136). Anyone can *file* a suggestion via the
`AddSuggestionButton` (mounted on `/helpdesk`); triage is admin/founder-only.

## /error-log

Admin/founder read-only audit of `lead_raw_payloads` rows with `ingestion_error` set — every
webhook payload that failed auth/validation/insert, original payload preserved. Append-only,
never widened beyond the two audit roles (full PII). No replay action yet — manual fixes.

## /profile

Self-management for every role (`ALWAYS_ALLOWED_PREFIXES`): name/username/phone/job title,
avatar (≤2 MB → `avatars` bucket), theme (DB-stored on `profiles.theme` — follows the user
across devices; invalid → `earth`), password (browser Supabase client — documented exception).
Role/domain never self-editable. Email read-only (truth is `auth.users`). **Appearance** also
carries the **app-icon picker** (`IconSelector` over `profiles.app_icon`, default `icon-1`,
mirrors theme; rides the existing `updateProfile`) — an installed icon is OS-owned (needs
remove + re-add). **`InstallPrompt`** offers Add-to-Home-Screen (swaps the live manifest +
apple-touch-icon before `prompt()`; Chromium `beforeinstallprompt` / iOS nudge), and
**`PushNotificationSettings`** manages Web Push (VAPID) device subscriptions.

## Auth pages (/login, /forgot-password, /update-password)

The one canvas-dark surface — no paper tokens, no app chrome. `loginAction`
(`signInWithPassword` + `is_active` gate). Password reset is now an **OTP code** flow (not
magic-link): `requestPasswordResetAction` (`resetPasswordForEmail`, **no** `redirectTo`; the
email renders `{{ .Token }}` = a 6-digit code; never reveals account existence) →
`verifyResetOtpAction` (`verifyOtp` type `recovery`, which establishes the session) →
`updatePasswordAction` + `PasswordStrengthBar`. `/update-password` is two-step (CodeStep →
PasswordStep), gated only by an `?email` param (`MissingEmailCard` otherwise), no session at
arrival. This blocks corporate link-scanners from pre-burning the single-use token.
`GET /api/auth/callback` is now **dead code for reset** — only the PKCE/magic-link invite
landing still uses it. Button-level pending states (width-preserving), no skeletons; fields
never cleared on error.
