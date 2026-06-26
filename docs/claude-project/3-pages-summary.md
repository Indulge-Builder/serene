# Serene — Pages Summary (Claude Project digest)

> Digest of the per-route specs in `docs/pages/` + `docs/oversight.md` (through 2026-06-26). Each
> spec's "Deep dive" holds the full invariant lists — attach the individual `docs/pages/<route>.md`
> for page-level work.

All list pages follow the canonical layout: `<h1 class="type-page-title">Title<span
class="page-title-dot">.</span></h1>` + top-right CTA → paper filter strip (`<FilterBar>`) →
Suspense-wrapped async content. Loading files compose `PageSkeletons`; empty states compose
`<EmptyState>` (Playfair italic, never "No data available"). Detail pages get a back link, no
title-dot.

## /dashboard

Personalised **spatial bento grid** (react-grid-layout) of independently code-split widgets. Registry
`dashboard-widgets.ts`: agent widgets (`agent-tasks`, `agent-activity`, `agent-pending-calls`,
`agent-new-leads`, `elaya-presence`), manager cohort (`manager-lead-status`, `manager-lead-volume`,
`manager-campaigns`, `manager-cold-leads`, `manager-budget`). One server-side `get_dashboard_summary`
RPC (React `cache()`) seeds first paint; a global URL date filter scopes pipeline/campaign/volume by
`leads.created_at` (IST); snapshot counts (pending calls / new leads / going cold) are live and ignore
the date filter. Domain scope is a **single global selector** (`resolveDomainParam`; default =
all-domains aggregated) — per-widget domain tabs were removed 2026-06-17. Layout persists per user in
localStorage (`useDashboardLayout`, versioned key); widgets support **drag-to-resize** and an
**Add-widget menu** (re-add a removed widget in edit mode). `manager-budget` is the **ad-account fuel
gauge** (org-wide tank: recharged = full, spend = burned, remaining = fuel left; INR-only; admin/
founder only). Snapshot-count tiles carry a faint identity watermark. Page never throws on RPC
failure — renders zeroed data.

## /elaya

In-app chat with Elaya, the AI presence (all roles, `ALWAYS_ALLOWED_PREFIXES`; access is gated
per-principal in the tool layer, not the route). RSC seeds the 24h server-side conversation window +
last-50 transcript + remaining daily budget (deterministic greeting, no model call on load) via the
shared `resolveElayaChatSeed(profile)` helper — THE single source of `ElayaChatShell`'s props;
`ElayaChatShell` POSTs to `/api/elaya/chat` and consumes **SSE** frames. **Second entry point:** a
floating bottom-right `ElayaWidget` (mounted in the dashboard layout, hidden on `/elaya`) opens a
modal with the **same `ElayaChatShell`**, seeded via `getElayaChatSeedAction()` → the same helper
(same conversation + cap). **Tools:** 11 read tools + 11 write tools (read tools role-gated since
"Jarvis" Phase 4; full list and the propose→confirm model in `5-elaya-jarvis.md`). **Voice input** via
`DictationButton` (Deepgram Nova-2, Hinglish) → editable draft, never auto-send. **Per-user persona**
("how Elaya talks to me") edited from `/profile`, plus durable learned memory accumulated over time.
Daily cap **200/day** from IST midnight, **shared across channels** (in-app + WhatsApp),
enforced server-side. Layout: `serene-dossier-grid--340` (chat card + breathing-glyph identity
sidebar). Never render Elaya data without a tool round-trip.

## /leads (list)

The Gia pipeline list — display-only dense table; filters/search/pagination are server-side URL
params. `getLeadsByRole` (Redis 30s, version-counter invalidation); search via the `leads.search_text`
trigram column; status-count pills via `get_leads_status_counts`. Column visibility/order per user
(`useLeadColumnPreferences`, localStorage). `AddLeadButton` + on-intent `AddLeadModal`
(`createManualLead`); **bulk-edit** from table selection; CSV/XLSX export is **client-side only**
(`lib/utils/export.ts`). Page size 30. Agents see own, managers domain, admin/founder all. Toolbar is a
single non-wrapping scroll row on mobile. **Revival review tab** (`?revival=true`): the same
`LeadsTable`, scoped to leads with an open `revival_candidates` row, under a `RevivalReviewBanner`;
each row carries a `ReviveLeadButton`. Revival never mutates the lead status/columns.

## /leads/[id] (dossier)

The per-lead workspace. Slug-first lookup (UUID fallback; the slug generator was fixed 2026-06-25
after a 90%-corruption bug). Wave-1 blocking fetch for header + status panel only; everything else
streamed behind per-section Suspense; streamed children fetch by `lead.id` UUID, never the URL param.
Components: `StatusActionPanel` (lifecycle CTAs + `CalledModal`/`WonDealModal`/resolution confirms),
`LeadInfoCard` (inline field edits), notes input + timeline, `LeadDealCard`, `LeadWhatsAppCard` (can
initiate via the `lead_initiation` template), `LeadTasksCard`. Won flow: `recordDeal` inserts the
`deals` row **before** the status flip. No access → `redirect('/leads')`. **Voice dictation** in note
inputs (`LeadNotesInput` + `CalledModal`): editable draft, audio never stored.

## /deals

Every closed transaction (lead-won + walk-in). `getDealsByRole`, summary strip via `get_deals_summary`
(StatTile cells), card-list mode (`DealCard` motion cards showing domain + source + walk-in pill).
Two write paths: `recordDeal` (dossier) and `createWalkInDeal` (`lead_id = null`, domain-locked
server-side for agents); **both `revalidatePath('/deals')`** (fixed 2026-06-25). `deal_type` is
domain-derived (`DOMAIN_DEAL_CONFIG`), never client-picked; `won_at` immutable; membership deals need
duration, retail needs category. Cold landing **defaults to This Month**. Agents own / managers domain
/ admin+founder all (+ domain filter).

## /tasks and /tasks/[id]

Tabbed hub: **Gia tab** (lead-linked follow-ups), **My Tasks** (personal, calendar view that
**auto-loads the whole active schedule**), **Group Tasks** (cards → `/tasks/[id]` group workspace with
list/board + Realtime). One `tasks` table; lead follow-up = a personal task + a `task_gia_meta` link
row (the meta row IS the link since 0138); status changes ride append-only `task_remarks`. Group
visibility is data-driven (creator OR assigned a subtask — no role/domain branching). Create modals
all compose `TaskFormFields`; `SubTaskModal` two-zone with `TaskRemarksPanel` + `AssigneePickerModal`.
My-Tasks rows now show the **linked lead's name** (e.g. "Call · Sonu Singh", lead name links to the
dossier). **Completed-tasks history modal** in the page header (personal + group subtasks, role+domain
scoped: agent self, manager own-domain pick, admin/founder anyone). Due reminders via Trigger.dev
(cancel-before-delete).

## /oversight

Manager+ "what is my team doing right now, and where is work stuck?" — a read surface over task data
plus one new append-only event stream (`task_events`, 0144). Three tiers, one `card → open` grammar:
**Tier 1 Teams** (founder/admin) — one card per `app_domain` with open/overdue/completed task counts +
agent count + a live "present agents now" pulse; **Tier 2 Team detail** (managers land here, clamped to
own team) — per-agent cards + a live team activity rail; **Tier 3 Agent detail** — that agent's
personal + group tasks + metrics + a live rail scoped to the agent. Three SECURITY DEFINER scope-param
RPCs (`get_team_task_overview` / `get_team_agent_breakdown` / `get_agent_tasks_oversight`, EXECUTE
revoked → admin-client only). Manager isolation is enforced in **three layers** (action denies a
mismatched domain/agent, page redirect, SQL force-clamp of `p_caller_domain`) because the manager
`tasks` RLS is role-only. Events are emitted from the **task-mutation cores** (so Elaya's writes
inherit them), never UI. Live rails subscribe to `task_events` Realtime. Reads are never `auth.uid()`-
scoped (oversight must read *other* users' load). **Migration 0144 is in the working tree, not yet on
prod.** Full contract: `docs/oversight.md`.

## /campaigns and /campaigns/[id]

Campaigns are **not** table rows — a campaign is a distinct `leads.utm_campaign` value; all metrics
derive from grouping `leads` (`archived_at IS NULL`). List = one card per (utm_campaign, domain);
detail = metrics strip + agent distribution + leads table + optional ad-creative carousel. Three
SECURITY DEFINER RPCs, always live (no Redis), client EXECUTE revoked. Campaign names display **raw**
(the title beautifier was deleted). manager/admin/founder only (managers domain-locked server-side);
agents redirected.

## /performance

One URL, three role layouts. **Agent:** a lean single-page **self-scorecard** (redesigned 2026-06-25,
in the working tree) — Today pulse → period KPIs → a real activity-over-time trend
(`get_agent_performance_trend`, migration 0146, working tree) + live-pipeline line → call-outcome mix
→ recent activity → Elaya footer. Fabricated sparklines were removed; only Leads Won carries a real
daily series. **Manager:** domain roster + per-agent detail (`get_agent_roster_performance` pins
managers to `get_user_domain()` in SQL). **Founder/admin:** Agents tab (all-domain roster) + Domains
tab (default; health cards + comparative chart). The global domain selector now scopes the Domains tab;
the Agents/Domains tabs live in the filter strip. Domain stat cards are drillable to leads → dossier
and (for Deals/Revenue tiles) to a deals drill that **ties out to the card** (deals by `won_at`, not
leads by `created_at`). **Critical date-field rule:** `leadsWon`/`conversionRate` by `status_changed_at`;
`touchRate` by `created_at` cohort. `MetricCard` is deliberately bespoke.

## /escalations

manager+ (and now agents, self-scoped) "what needs intervention right now." Three sections built on
artifacts the follow-up engine already produces — **no new tables, no jobs, no cache**: **SLA breaches**
(computed **live** — a `fired` timer OR a `pending` timer whose `scheduled_fire_at` already passed, so
the surface is correct even when the Trigger.dev worker hasn't fired; re-checked so a lead that moved
past the triggering status drops), **overdue tasks** (stamped `overdue_at` OR `due_at` already past),
and **going cold** (`last_activity_at` older than 5 days). The breaches table shows "Stalled since"
(raw SLA rule codes removed) + an "Alerted" recipient-chip cluster (who the breach escalates to). The
global domain selector works here (via `resolveDomainParam`). Agents see a self-scoped mirror
(`selfView`, second-person copy, own "You" chip). Reads are **never cached** — an escalation surface
must never show a stale breach.

## /budget

**Admin/founder only** (managers excluded everywhere as of 2026-06-25). Spend-vs-outcomes per campaign,
fed **only** from CSV/XLSX uploads — never a Meta API. `ad_spend_daily` (day grain, RLS manager+ read)
is joined to lead counts (`created_at` cohort) and deals (`won_at`) on the shared `campaign_key` via
the `get_budget_summary(from, to)` RPC (EXECUTE revoked, admin-client, **no Redis** — always live;
CPL/CPD `null` → "—" at zero denominators). The Meta parser (`ad-spend-parse.ts`) is **client-side
only** and **rejects the entire file** when any row's reporting-start ≠ reporting-end (a range-grain
file would double-count). `campaign_key` is always `normalizeCampaignKey()` (lowercase+trim). Filter
bar carries a client-side campaign search; the Accounts|Campaigns tabs live in the filter bar.

**Per-account recharge ledger:** `ad_account_recharges` (0139, manager+ read / admin/founder write)
records money sent to each Meta ad account. The **Accounts** tab groups spend by ad account (DERIVED
from the campaign key via `resolveAccountFromCampaign`, the index-2 segment, in `ad-accounts.ts`) and
shows recharged · spent · **balance** per account + a grand total, with an **Unattributed** block for
any campaign whose account can't be resolved. Balance is **INR-only** (non-INR recharges recorded but
excluded, footnoted). `method` is a payment-method label, card-PAN-rejected at Zod + DB CHECK.

## /helpdesk

The Call Intelligence library (all roles, `ALWAYS_ALLOWED_PREFIXES`). RSC fetches the **full**
domain-scoped library once (`getHelpdeskLibrary(domain)` — Redis 1hr `{cases,hooks}` envelope) and
hands it to `<HelpdeskSearch>` as `initialData`; **all filtering is client-side**. Domain shelf resolved
via `resolveDomainParam`. Tables `service_cases` + `conversation_hooks` (all-authenticated read /
admin+founder write); the same library powers the dossier `ServiceInterestCard`. The "+ Suggestion" CTA
and the in-modal Edit are admin/founder-only (the server re-checks on save).

## /whatsapp

Shared WhatsApp inbox: split-pane conversation list + thread, Realtime sync, optimistic composer with
rollback, **inbound + outbound media** (image/video/PDF/audio — inbound media is durably copied to
private Supabase Storage). One conversation per lead phone; inherits lead assignment/domain rules
(`can_access_wa_conversation`). Unread counts via `get_wa_unread_count`. Resolve/reopen: manager+.
Agent-initiated conversations from the dossier open the 24h session via the `lead_initiation` template.
Customer-facing bot columns dormant (`bot_active`/`is_bot` never set — the customer chatbot is **not
built**). The **Elaya staff channel is live**: `tryHandleElayaWhatsAppMessage` routes a recognised
staff number to the same Elaya brain/tools/daily cap (one reply), leaving the lead pipeline untouched
for unknown numbers; inbound staff voice notes are transcribed (Deepgram).

## /settings (hub + sub-pages)

A **hub**: the agent roster (Team Shifts & Pool over `agent_routing_config` — pool toggle, shift
windows, work days) stays inline as the default surface; two admin/founder-only editors live on their
own routes, reached from link cards: **`/settings/follow-up-engine`** (the SLA/cadence/escalation
editor, redesigned as plain-language **situation cards** — raw rule codes never surfaced) and
**`/settings/lead-revival`** (the nightly-sweep policy editor). manager/admin/founder (managers limited
to own domain). Optimistic toggles roll back on error. Shift fields are advisory (read by ingestion +
the SLA shift overrides), not DB-enforced.

## /admin/users (+ /new, /[id])

Team management over `profiles`: browse, create (password or magic-link invite — both via the
`on_auth_user_created` trigger, which now also persists `job_title` from invite metadata, 0125), edit
fields, change role/domain (privileged, audited, second-actor rule), soft-deactivate, toggle agent
routing. List+create: admin/founder. Detail: managers may **view** agents (profile form + routing
toggle only). Email immutable after creation.

## /admin/usage

Admin/founder adoption dashboard (`redirect('/dashboard')` otherwise; `getAgentUsage` re-gates in the
service — defence in depth). Built over `usage_daily` (0126) via `get_agent_usage`. "Active" = tab
visible AND interaction in the last ~2 min, gated client-side; a Redis presence key feeds a 1-min
`usage-snapshot.ts` job → `usage_heartbeats`; a 15-min + nightly `usage-rollup.ts` recomputes
`usage_daily` (idempotent UPSERT, never counts login span). Headline "Active today" + per-agent table +
per-domain stacked-area history. RSC returns `null` on failure — never throws.

## /admin/suggestions

Admin/founder staff suggestion/bug triage (`redirect('/dashboard')` otherwise; the service re-gates).
Reads `suggestions` (0134); screenshots live in the **private** `suggestions` bucket (0135) — the row
stores **paths**, never URLs, with short-lived signed URLs minted server-side. Categories bug/idea/
other. Resolving fires a `suggestion_resolved` notification (0136). Anyone can *file* a suggestion (a
"Send feedback" composer in the sidebar footer / dashboard overlay / `/elaya` rail); triage is
admin/founder-only.

## /admin/ad-creatives

Admin/founder upload/manage campaign videos (`ad_creatives` + `ad-creatives` Storage bucket), keyed by
normalised `campaign_key` matching `leads.utm_campaign` (string equality, **no FK**; multiple per
campaign). Read-only surfaces: dossier video modal, campaign detail card, campaign list carousel. **No
Redis** for this service — freshness via `revalidatePath`.

## /error-log

Admin/founder read-only audit of `lead_raw_payloads` rows with `ingestion_error` set — every webhook
payload that failed auth/validation/insert, original payload preserved (full PII, two audit roles
only). Append-only. No replay action yet.

## /profile

Self-management for every role (`ALWAYS_ALLOWED_PREFIXES`): name/username/phone/job title, avatar (≤2
MB → `avatars` bucket), theme (`profiles.theme`), password (browser Supabase client — documented
exception). Role/domain never self-editable; email read-only. **Appearance** carries the **app-icon
picker** (`IconSelector` over `profiles.app_icon`, mirrors theme). **`ElayaPersonaSettings`** (the
"Elaya" card — language/tone/depth/length chips + a 600-char note; "how Elaya talks to me", takes
effect next message). **`InstallPrompt`** offers Add-to-Home-Screen; **`PushNotificationSettings`**
manages Web Push device subscriptions; a notification-preferences surface mutes non-transactional
categories per channel.

## Auth pages (/login, /forgot-password, /update-password)

The one canvas-dark surface — no paper tokens, no app chrome. `loginAction` (`signInWithPassword` +
`is_active` gate). Password reset is an **OTP code** flow: `requestPasswordResetAction`
(`resetPasswordForEmail`, **no** `redirectTo`; email renders a 6-digit `{{ .Token }}`; never reveals
account existence) → `verifyResetOtpAction` (`verifyOtp` type `recovery`, establishes the session) →
`updatePasswordAction` + `PasswordStrengthBar`. `/update-password` is two-step, gated only by an
`?email` param. This blocks corporate link-scanners from pre-burning the single-use token. Button-level
pending states (width-preserving), no skeletons; fields never cleared on error.
