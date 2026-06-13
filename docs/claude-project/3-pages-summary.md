# Serene — Pages Summary (Claude Project digest)

> Generated digest of the 14 specs in `docs/pages/` — 2026-06-11. Each spec's "Deep dive"
> holds the full invariant lists; attach the individual spec to a chat for page-level work.

All list pages follow the canonical layout: `<h1 class="type-page-title">Title<span
class="page-title-dot">.</span></h1>` + top-right CTA → paper filter strip (`<FilterBar>`) →
Suspense-wrapped async content. Loading files compose `PageSkeletons`; empty states compose
`<EmptyState>` (Playfair italic, never "No data available").

## /dashboard

Personalised bento grid of independently code-split widgets. One server-side
`get_dashboard_summary` RPC (React `cache()`) seeds first paint; a global URL-param date filter
scopes pipeline/campaign/volume by `leads.created_at` (IST). Agents: `agent-tasks` +
`agent-activity` (own data, date filter n/a). Manager: all six widgets, domain-scoped.
Admin/founder: all six + domain picker tabs. Layout persists per user in localStorage
(`useDashboardLayout`); widget fetch lifecycle via `useWidgetData`; manager scope re-enforced
server-side (`effectiveWidgetDomain()`). Page never throws on RPC failure — renders zeroed data.

## /leads (list)

The Gia pipeline list — display-only dense table; filters/search/pagination are server-side
URL params. `getLeadsByRole` (Redis 30s, version-counter invalidation); search via the
`leads.search_text` trigram column; status-count pills via `get_leads_status_counts`. Column
visibility/order per user (`useLeadColumnPreferences`, localStorage). `AddLeadButton` +
on-intent `AddLeadModal` (`createManualLead`); CSV/XLSX export is **client-side only**
(`lib/utils/export.ts` — never imported by server code), respecting current filter scope.
Page size fixed at 30. Agents see own, managers domain, admin/founder all. Open item:
archived leads invisible to phone search (RLS bakes in `archived_at IS NULL`).

## /leads/[id] (dossier)

The per-lead workspace. Slug-first lookup (UUID fallback), wave-1 blocking fetch for header +
status panel only, everything else streamed behind per-section Suspense; streamed children
fetch by `lead.id` UUID, **never the URL param**. Components: `StatusActionPanel`
(lifecycle CTAs + `CalledModal`/`WonDealModal`/resolution confirms), `LeadInfoCard` (inline
field edits), notes input + timeline, `LeadDealCard`, `LeadWhatsAppCard` (can initiate a
conversation via the `lead_initiation` template), `LeadTasksCard`. Won flow: `recordDeal`
inserts the `deals` row **before** the status flip. No access → `redirect('/leads')`.
Detail pages show a back link, no page-title dot.

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

## /whatsapp

Shared WhatsApp inbox: split-pane conversation list + thread, Realtime sync, optimistic
composer with rollback. One conversation per lead phone; inherits lead assignment/domain
rules (`can_access_wa_conversation` — coupled to leads RLS, review together). Unread counts
only via the `get_wa_unread_count` RPC. Resolve/reopen: manager+. Agent-initiated
conversations from the dossier open the 24h session window via the `lead_initiation` template.
Bot columns dormant (no AI chatbot yet); `is_bot` never set today.

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

## /error-log

Admin/founder read-only audit of `lead_raw_payloads` rows with `ingestion_error` set — every
webhook payload that failed auth/validation/insert, original payload preserved. Append-only,
never widened beyond the two audit roles (full PII). No replay action yet — manual fixes.

## /profile

Self-management for every role (`ALWAYS_ALLOWED_PREFIXES`): name/username/phone/job title,
avatar (≤2 MB → `avatars` bucket), theme (DB-stored on `profiles.theme` — follows the user
across devices; invalid → `earth`), password (browser Supabase client — documented exception).
Role/domain never self-editable. Email read-only (truth is `auth.users`).

## Auth pages (/login, /forgot-password, /update-password)

The one canvas-dark surface — no paper tokens, no app chrome. `loginAction` (+ `is_active`
gate), `requestPasswordResetAction` (never reveals account existence), `updatePasswordAction`
+ `PasswordStrengthBar`. `GET /api/auth/callback` exchanges the Supabase code (invite +
reset landings). Button-level pending states (width-preserving), no skeletons; fields never
cleared on error.
