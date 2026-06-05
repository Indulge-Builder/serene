# Eia — Changelog

<!-- markdownlint-disable MD013 MD024 MD026 MD033 -->

All notable changes to the Eia platform are recorded here in reverse chronological order.

---

## 2026-06-05 — Webhook lead ingestion: fix WhatsApp notification not firing

### Bug fix — `void` fire-and-forget killed before completion on Vercel

- `src/app/api/webhooks/leads/route.ts` — changed `void notifyLeadAssigned(...)` to `await notifyLeadAssigned(...)` before `NextResponse.json(...)` is returned. On Vercel's serverless runtime, the function process is frozen/killed as soon as the HTTP response is sent; any unawaited `void` promises are silently dropped. Manual lead creation worked because it runs inside a Server Action (Next.js keeps the action alive until all awaited work completes). The webhook route is a plain route handler — it has no such guarantee, so the `notifyLeadAssigned` call (which spawns the Gupshup template sends) was being killed before it could dispatch. The `.catch()` wrapper is preserved so a notification failure never blocks the `201` response to the webhook caller.

---

## 2026-06-05 — Tasks page: deadline editing, delete fix, date range picker

### SubTaskModal — deadline editing in edit mode

- `SubTaskModalTaskUpdate` type extended with `due_at?: string | null` so parent list components receive deadline changes after save.
- `dueAt: string | null` display state added (mirrors pattern of `title`, `description`, `status`, `priority`). Read-only deadline row now reads from this state, not the immutable `task` prop — no refresh needed after save.
- `editDueAt: Date | null` edit state added; seeded from `dueAt` state on `enterEditMode`.
- `DatePicker showTime` rendered in place of the read-only span when edit mode is active. Clears/sets deadline with full date+time precision.
- `handleSaveBrief` includes `due_at` in `updateTaskAction` when changed, calls `setDueAt(newDueAtIso)` on success, emits `due_at` to parent via `onTaskUpdated`, and calls `router.refresh()` to sync RSC data.
- `useRouter` imported; `router.refresh()` added after every successful `handleSaveBrief` call (covers all field saves, not just deadline).

### GroupTasksTab — delete dialog and ⋯ dropdown portaling

- `⋯ dropdown` portaled to `document.body` via `createPortal`. `moreButtonRef` + `menuRect` state capture the button's `getBoundingClientRect()` at open time; panel positions with `position: fixed`. Fixes clipping caused by card `overflow: hidden`.
- Confirm delete dialog portaled to `document.body`. Fixes the backdrop (z-index 61) covering the dialog panel (z-index 60) — the Framer Motion card `transform` was creating a new containing block for `position: fixed` children, trapping the dialog inside the card's painted area.
- Confirm delete dialog backdrop changed from `--z-modal-overlay` (61) to `--z-overlay` (50); dialog panel stays at `--z-modal` (60). Backdrop now correctly sits below the dialog.

### GroupTaskWorkspace — delete dialog z-index fix

- Same z-index inversion fixed: backdrop `--z-modal-overlay` → `--z-overlay`.

### GroupTaskWorkspace — add-subtask due date picker

- `addDueAt` state changed from `string` (raw `YYYY-MM-DD`) to `Date | null`.
- Native `<input type="date">` in the add-subtask FAB panel replaced with `DatePicker showTime`.
- `DatePicker` imported.

### TasksFilters — Gia tab date range picker

- Two raw `<input type="date">` fields (From / To) replaced with the same "Range" trigger button + portal panel pattern used on the leads filter bar.
- Portal panel contains two `DatePicker` components with `minDate`/`maxDate` cross-constraints and a clear × button. Positioned via `getBoundingClientRect()` + `visualViewport` offset correction. Closes on outside pointer-down.
- `dateFromUrlParam` / `dateToUrlParam` from `filter-params.ts` used for `Date ↔ YYYY-MM-DD` conversion.
- Imports added: `useCallback`, `useEffect`, `useLayoutEffect`, `useRef`, `useState`, `createPortal`, `motion`, `AnimatePresence`, `DatePicker`, `dateFromUrlParam`, `dateToUrlParam`, `DROPDOWN_VARIANTS`.

---

## 2026-06-05 — Group task delete fix (portal escape)

**Bug:** Clicking "Delete group" on the group task list showed the confirm dialog as "washed out" and unresponsive. Root cause: `position: fixed` children rendered inside a Framer Motion `motion.div` card. The card's entrance animation applies a CSS `transform`, which creates a new stacking context **and** a new containing block for `position: fixed` descendants. The dialog was trapped inside the card's painted area — visually dimmed by the card's own background and its `pointer-events` were blocked.

**Secondary bug:** The ⋯ dropdown was clipped by the card's `overflow: hidden` when the row was collapsed.

**Fix:** Both the ⋯ dropdown menu and the confirm delete dialog are now portaled to `document.body` via `createPortal`. The dropdown records its trigger button's `getBoundingClientRect()` at open time and positions itself with `position: fixed` from `document.body`, bypassing all ancestor transforms and overflow clipping.

- `src/components/tasks/GroupTasksTab.tsx` — `moreButtonRef` + `menuRect` state added; ⋯ dropdown portaled to body with `fixed` positioning; confirm delete dialog portaled to body (was inline inside the card).

---

## 2026-06-05 — Deals promoted to first-class table

**Decision reversal:** The 2026-05-31 "no deals table" decision is reversed. `public.deals` is
now a first-class table. Reason: one lead has one terminal `won` and cannot hold repeat/renewal
deals; walk-in sales have no lead lifecycle at all. Both are now real requirements.

Decision Log entry added to `docs/master.md` and `The_Rules.md`.

### Migrations

- `20260605000072_create_deals_table.sql` — `public.deals` table (RLS enabled; three SELECT
  policies: agent/manager/admin-founder; no INSERT/UPDATE/DELETE for regular users; soft-delete
  only via `archived_at`). `won_at` is immutable after insert. `client_id` column reserved (FK
  deferred to clients module). Indexes: domain, assigned_to, won_at DESC, lead_id, contact_phone.
- `20260605000073_backfill_deals_from_won_leads.sql` — idempotent backfill; every
  `status='won' AND deal_amount IS NOT NULL` lead row copied to `deals`; NOT EXISTS guard
  prevents double-insert.
- `20260605000074_get_deals_summary_over_deals.sql` — `CREATE OR REPLACE` of
  `get_deals_summary` RPC; source table is now `public.deals`; structural WHERE collapses to
  `archived_at IS NULL`; date filters apply to `won_at` (was `status_changed_at`); two-domain
  parameter split (p_caller_domain / p_filter_domain) preserved.

### Application layer

- `src/lib/validations/deal-schema.ts` (new) — `RecordDealSchema` + `CreateWalkInDealSchema`;
  `lead-schema.ts` re-exports `RecordDealSchema` for back-compat.
- `src/lib/actions/deals.ts` (new) — `recordDeal` (lead → deal path, inserts deals row then
  delegates `updateLeadStatus('won')`), `createWalkInDeal` (no lead; agent domain-locked
  server-side), `listAgentsForDealDomain` (read action for NewDealModal picker).
- `src/lib/actions/leads.ts` — `recordDeal` now re-exported from `deals.ts`; old inline
  implementation removed.
- `src/lib/services/deals-service.ts` — rewritten to query `public.deals`; joins
  `lead(slug)` and `assignee(full_name)`; date filters now on `won_at`; search on
  `contact_name/contact_phone/contact_email`.
- `src/lib/types/database.ts` — `Deal` type + `DealWithRelations` (replaces `DealWithAssignee`).

### UI

- `src/components/deals/DealCard.tsx` — handles nullable `lead_id`; walk-in deals render as
  non-link card with "Walk-in" pill (no coloured edge border per Never-Do list); lead-sourced
  deals link to `/leads/${slug ?? lead_id}`; uses `won_at` for "Won {date}" line.
- `src/components/deals/NewDealModal.tsx` (new) — two-step modal (Contact → Details);
  composes `ui/modal.tsx`; agent domain/assignee locked server-side; `createWalkInDeal` action.
- `src/components/deals/AddDealButton.tsx` (new) — thin client wrapper holding modal open state.
- `src/app/(dashboard)/deals/page.tsx` — New Deal button added to page header (all roles
  except guest); `/deals` is no longer read-only.
- `src/app/(dashboard)/deals/DealsAsync.tsx` — updated to use `DealWithRelations`.

---

## 2026-06-05 — Tasks: fix deleteTaskAction aborting on Trigger.dev cancel failure

- `src/lib/actions/tasks.ts` `deleteTaskAction` — `cancelTaskReminder` is now wrapped in
  try/catch; a cancel failure (no runs found, SDK/network error) logs the error but no
  longer aborts the delete. A missed reminder cancel is recoverable; a broken delete UX
  is not. Adds a `console.log` of `task_category` after the auth check to aid debugging
  of cache invalidation issues.

---

## 2026-06-05 — Tasks: fix create modal opening on tab switch

- `src/hooks/useCreateTriggerModal.ts` — new hook; opens create modal only when
  `createTrigger` increments, not when a tab mounts with a stale counter left over
  from a prior header-button click.
- `MyTasksCalendarView`, `GroupTasksTab`, `PersonalTasksTab`, `TasksShell` — replaced
  `createTrigger > 0` mount effects with `useCreateTriggerModal`.

---

## 2026-06-05 — Profile: settings UX pass + avatars bucket migration

- `/profile` left column reworked: Personal Details migrated to canonical field anatomy
  (`.eia-input` + `.label-micro`, Required pill replaces `*`, two-part E.164 phone with
  +91 country-code prefix display and `normalizeToE164` on blur); Appearance now hosts the
  relocated notification-sound toggle (below swatches, separated by hairline); Security rebuilt
  with a live requirements checklist + confirm-match indicator (re-auth + browser-client-only
  flow unchanged; submit disabled until all requirements met and confirm matches).
  Notifications card and `NotificationPreferences.tsx` removed.
- New migration `20260605000071_avatars_storage_bucket.sql` provisions the public `avatars`
  bucket + own-object RLS policies (`avatars_public_read`, `avatars_insert_own`,
  `avatars_update_own`, `avatars_delete_own`). Fixes avatar upload failing where the bucket
  was never hand-created. `ProfileAvatarSection` now returns specific size/type/network error
  copy via `form-errors.ts` (new keys: `avatarTooLarge`, `avatarInvalidType`,
  `avatarUploadFailed`, `avatarProfileFailed`). New password error keys also added:
  `passwordCurrentIncorrect`, `passwordSameAsCurrent`, `passwordConfirmMismatch`,
  `passwordSessionExpired`.

---

## 2026-06-05 — FilterDropdown portal + Add Lead modal layout

- `src/components/ui/FilterDropdown.tsx` — `menuPortal` renders the menu via `createPortal` at `--z-modal-nested` (no modal-body clipping); `fullWidth` stretches the trigger; `hideCountBadge` for form selects. Repositions on scroll/resize/visualViewport. Long item lists cap at 240px with internal scroll so flip-up positioning stays consistent across triggers on the same row (fixes Assign-to opening above while Source/Domain open below).
- `src/components/leads/AddLeadModal.tsx` — Source, Domain, and Assign to on one 3-column row (2-column for agents: Source + read-only assignee chip). All dropdowns use `menuPortal` + `fullWidth`.

---

## 2026-06-05 — Profile details form hint copy removed

- `src/components/profile/ProfileDetailsForm.tsx` — removed helper text under Phone Number ("Stored as E.164 — India default.") and Username ("Lowercase, numbers, underscores only."). Email read-only hint unchanged.
- `src/app/(dashboard)/profile/page.tsx` — removed section card descriptions on Personal Details and Security.

---

## 2026-06-05 — Lead dossier notes card header simplified

- `src/components/leads/LeadNotesInput.tsx` — card header label renamed from "Team Notes" to "Notes"; "Visible to all" subtitle removed. Icon unchanged.

---

## 2026-06-05 — MessageBar primitive + WhatsApp composer alignment fix

**Problem:** The WhatsApp page composer and the lead dossier `LeadWhatsAppCard` composer both used inline textarea + send-button markup with `alignItems: flex-end` and `--leading-relaxed` line height. The 32px send button forced extra vertical space and the placeholder sat above centre.

**New file:**

- `src/components/ui/MessageBar.tsx` — canonical §5.11 message bar primitive. `alignItems: center` layout; 20px line height + 6px vertical padding so text and placeholder align with the 32px send button; 16px Send icon; auto-grow textarea; `default` and `nested` variants.

**Updated:**

- `src/components/whatsapp/ConversationPanel.tsx` — inline composer replaced with `<MessageBar variant="default" />`.
- `src/components/leads/LeadWhatsAppCard.tsx` — inline composer replaced with `<MessageBar variant="nested" />`.

---

## 2026-06-05 — Lead assignment side-effects consolidated into single orchestrator

**Problem:** Four entry points (webhook route, `assignLead`, `createManualLead`, WhatsApp ingestion) each independently implemented the same four side-effects: agent WhatsApp, founder WhatsApp, in-app `lead_assigned` notification, and SLA timer scheduling. They had already drifted — the webhook and WhatsApp paths were missing the in-app inbox row, the WhatsApp path had a redundant second `profiles` fetch, and `null` was reaching the `lead_id` column of WhatsApp founder alert log rows.

**New file:**

- `src/lib/services/lead-assignment-notify.ts` — `notifyLeadAssigned(input: LeadAssignedNotifyInput)`: orchestrates agent WhatsApp → founder WhatsApp → in-app notification → SLA timers in that order. Each side-effect is individually wrapped; one failure never prevents the others. Founder alert suppressed for duplicates (`isDuplicate: true`). In-app notification suppressed when `actorId === assignedTo` (no self-notify). SLA scheduling suppressed when `scheduleSla: false`. Accepts `leadStatus` and `assignedAt` for re-assignment paths that need non-`'new'` status.

**Rewired call sites:**

- `src/app/api/webhooks/leads/route.ts` — two inline `void send...()` blocks replaced with one `notifyLeadAssigned` call. Adds the previously missing in-app `lead_assigned` row for webhook-ingested leads.
- `src/lib/services/whatsapp-ingestion.ts` — inline WhatsApp + SLA block replaced with one `notifyLeadAssigned` call. The `lead_id` column in founder alert log rows is now always non-null (fixes null `lead_id` on WhatsApp founder alerts). The redundant second `profiles` fetch (for `assignedAgentName`) is retained as a single pre-orchestrator fetch so `agentName` can be passed in.
- `src/lib/actions/leads.ts` → `assignLead` — WhatsApp + founder + in-app + SLA block replaced with one `notifyLeadAssigned` call. The `profiles.select('full_name')` fetch that was already in the parallel `Promise.all` at step 3 supplies `agentName` — no second fetch needed.
- `src/lib/actions/leads.ts` → `createManualLead` — same consolidation; `actorId: caller.id` enables the self-notify suppression.
- `sendLeadAssignmentNotification` and `sendFounderLeadNotification` imports removed from `leads.ts` (no longer called directly).

**Bugs closed:**

1. Webhook-ingested leads never produced an in-app `lead_assigned` row — now fixed.
2. WhatsApp founder alert `lead_id` was null in `whatsapp_notification_logs` — now always non-null.
3. `assignLead` issued a second `profiles` SELECT for agent name after the parallel fetch at step 3 already had it — removed.

---

## 2026-06-05 — WhatsApp lead assignment template params updated

**Changed files:**

- `src/lib/services/whatsapp-api.ts` — `sendLeadAssignmentNotification` now sends three Gupshup template params on the same `GUPSHUP_LEAD_ASSIGNMENT_TEMPLATE_ID`: `{{1}}` agent first name (derived from profile `full_name`), `{{2}}` lead full name, `{{3}}` lead phone. Agent profile fetch extended to `phone, full_name`; `logNotification` now records `agent_name`.
- `src/lib/constants/whatsapp.ts` — param contract documented inline on `GUPSHUP_LEAD_ASSIGNMENT_TEMPLATE_ID`.

Call sites unchanged — they already pass lead full name as the second argument.

---

## 2026-06-05 — Lead ingestion: notification fixes + SLA wiring for WhatsApp leads

**Changes:**

- `src/lib/services/lead-ingestion.ts` — `IngestionResult` success shape gains `is_duplicate: boolean`; duplicate path returns `true`, fresh-lead path returns `false`. Also `createLeadFromWhatsApp` now returns `{ assignedAt, domain }` alongside `{ leadId, assignedTo }` so callers have everything needed for SLA scheduling without re-fetching.
- `src/app/api/webhooks/leads/route.ts` — `sendFounderLeadNotification` is now gated on `!result.is_duplicate`. On duplicate submissions the agent is still notified (existing behaviour), but the founder alert is suppressed — no new lead entered the system, nothing for the founder to act on.
- `src/lib/services/whatsapp-ingestion.ts` — three fixes:
  1. `sendLeadAssignmentNotification` and `sendFounderLeadNotification` now use `newLeadDomain` (returned from `createLeadFromWhatsApp`) instead of `lead.domain as string`, eliminating the unsafe cast introduced after migration 0041.
  2. `scheduleSlaTimersForLead` is now called (via dynamic import of `lib/actions/sla`) after a new WhatsApp lead is created and assigned. All leads — Meta webhook, manual, and WhatsApp — now follow the same SLA timer config.
  3. SLA scheduling is fire-and-forget non-fatal: errors are logged with `[whatsapp-ingestion]` prefix but never surface to the webhook response.

**Decision recorded (WhatsApp domain hardcoding):** All inbound WhatsApp leads are permanently assigned `domain = DEFAULT_LEAD_DOMAIN` (`"onboarding"`). This is intentional — WhatsApp leads carry no UTM/campaign data, so campaign-based domain resolution is impossible. If multi-domain WhatsApp routing is ever needed, `createLeadFromWhatsApp` must be extended to accept a `domain` parameter and the webhook routing logic updated accordingly. See note in `src/lib/services/lead-ingestion.ts`.

---

## 2026-06-04 — Dashboard date filter: stop duplicate POST storm

**Root cause:** Changing `dash_preset` navigates the page and re-fetches all cohort data on the server, but Lead Pipeline, Campaign Performance, and Lead Volume widgets also fired their own server actions on every `dateRange` change (plus 30s auto-poll on cohort widgets). That doubled work and spammed `POST /dashboard` in dev.

**Changed files:**
- `src/hooks/useDashboardCohortSync.ts` — apply RSC `initialData` when the date filter changes; no client fetch when the payload matches the active view
- `src/components/dashboard/widgets/ManagerLeadStatusWidget.tsx` — sync from `initialData.lead_status` for manager + default domain tab; client fetch only for org-wide / other domain tabs; removed 30s poll
- `src/components/dashboard/widgets/ManagerCampaignWidget.tsx` — same pattern for campaigns; admin default tab aligned to `DEFAULT_GIA_DOMAIN` (matches RSC `p_initial_domain`); removed 30s poll
- `src/components/dashboard/widgets/ManagerLeadVolumeWidget.tsx` — sync manager `lead_volume` and admin `lead_volume_multi` from RSC; client fetch only for single-domain drill-down tab

---

## 2026-06-04 — Lead Volume widget alignment + data correctness

**Root causes:** (1) RSC fetched volume on the server but the widget skipped the seed whenever `dateRange` was passed (always), forcing a redundant client fetch and a blank chart on first paint. (2) Volume queries used `created_at <= to` while Lead Pipeline uses `created_at < to` (half-open), so counts diverged for the same filter. (3) Bucket assignment dropped leads when the computed bucket key was missing from the pre-built map. (4) PostgREST’s 1000-row default cap silently truncated high-volume ranges.

**Changed files:**
- `src/lib/services/dashboard-service.ts` — shared `fetchVolumeLeads` (paginated), `buildBucketKeys` / `bucketKey`, `buildVolumeSeries`; intake window `gte(from)` + `lt(to)` aligned with pipeline RPCs
- `src/app/(dashboard)/dashboard/page.tsx` — admin/founder RSC seeds `lead_volume_multi` via `getLeadVolumeByDomains`
- `src/lib/types/index.ts` — `DashboardMultiDomainVolumeSummary` + `lead_volume_multi` on `DashboardSummary`
- `src/components/dashboard/widgets/ManagerLeadVolumeWidget.tsx` — `seedConsumedRef` pattern (matches Lead Pipeline); domain tab clears stale series; header shows total in range

---

## 2026-06-04 — Lead Pipeline per-agent stacked bars fix

**Root cause:** `agent_counts` in `get_dashboard_summary` / `get_lead_pipeline_refresh` used `COUNT(*)` on per-status subquery rows (number of status buckets, 1–7) instead of `SUM(cnt)` (actual lead count). Stacked bar widths divided by the wrong denominator, so segments exceeded 100% and the colour breakdown did not render correctly.

**Changed files:**
- `supabase/migrations/20260604000070_fix_pipeline_agent_total.sql` — `SUM(cnt)::int AS total` in `agent_counts` and `campaign_agg` for all three dashboard RPCs
- `src/lib/services/dashboard-service.ts` — `normalizeLeadStatusSummary()` coerces jsonb counts to numbers and recomputes each agent's `total` from `counts` (covers stale Redis until TTL)
- `src/components/dashboard/widgets/ManagerLeadStatusWidget.tsx` — `StackedBar` derives bar width denominator from segment counts

---

## 2026-06-04 — Global Dashboard Date Filter

Adds a single date filter at the top of `/dashboard`. Changing it re-scopes **Lead Pipeline**, **Lead Volume**, and **Campaign Performance** for the chosen window. **My Tasks** and **Recent Activity** always show live data and are unaffected.

**Date semantics:** all three filtered widgets filter by `leads.created_at` (intake/cohort date), i.e. "leads that came in during this window." This is the Critical Date-Field Rule invariant — see Decision Log entry in `The_Rules.md`.

**New files:**
- `src/lib/utils/date-range.ts` — pure IST date-range util: `DatePreset` union, `resolvePresetToRange()`, `rangeFromUrlParams()`, `DATE_PRESET_LABELS`
- `src/components/dashboard/DashboardDateFilter.tsx` — filter button with preset list (Today / This Week / This Month / This Quarter) + custom DatePicker range panel; writes `?dash_preset=&dash_from=&dash_to=` URL params

**Changed files:**
- `supabase/migrations/20260604000069_dashboard_date_filter.sql` — extends `get_dashboard_summary`, `get_lead_pipeline_refresh`, `get_campaign_pipeline_refresh` with nullable `p_date_from`/`p_date_to timestamptz` params (backwards-compatible DEFAULT NULL); date filter applied to `created_at` on `lead_status` + `campaigns` CTEs only; `agent_tasks`/`agent_activity` unaffected
- `src/lib/types/index.ts` — re-exports `DateRange`, `DatePreset` from `date-range.ts`
- `src/lib/constants/redis-keys.ts` — all four dashboard cache keys (`dashboardLeadStatus`, `dashboardLeadVolume`, `dashboardLeadVolumeMulti`, `dashboardCampaigns`) now include `:{from}:{to}` segment ('all' when no filter); different ranges produce different cache slots
- `src/lib/services/dashboard-service.ts` — `getDashboardSummary` accepts optional `dateRange`; `getLeadStatusSummary` + `getLeadsByCampaign` accept optional `dateRange`; `getLeadVolumeByPeriod` + `getLeadVolumeByDomains` replaced by `getLeadVolumeByRange` + `getLeadVolumeByDomains` (both accept `DateRange`); `getLeadVolumeForDomain` added; bucket granularity inferred from span (≤2d→hourly, ≤60d→daily, ≤1y→weekly, else monthly) — zero-filled buckets always present
- `src/lib/actions/dashboard.ts` — rewritten: `getLeadStatusSummaryAction`, `getLeadsByCampaignAction`, `getLeadStatusForDomainAction`, `getLeadsByCampaignForDomainAction` accept optional `from?/to?` strings (Zod-validated); `getLeadVolumeByRangeAction`, `getLeadVolumeByDomainsAction`, `getLeadVolumeForDomainAction` replace period-based actions (all accept ISO datetime from/to)
- `src/components/dashboard/DashboardWidgetSlot.tsx` — `dateRange?: DateRange` added to `WidgetProps`
- `src/components/dashboard/DashboardCanvas.tsx` — `DashboardDateFilter` rendered in header (manager/admin/founder only); `dateRange` prop threaded to all widgets
- `src/components/dashboard/widgets/ManagerLeadStatusWidget.tsx` — reads `dateRange` prop; refetches on `dateRange.from/to` change; passes range to all action calls
- `src/components/dashboard/widgets/ManagerLeadVolumeWidget.tsx` — local period tabs (Today/Week/Month/Quarter) removed; reads `dateRange` from props; default to "week" when no prop provided; domain tabs (admin/founder) retained
- `src/components/dashboard/widgets/ManagerCampaignWidget.tsx` — reads `dateRange` prop; refetches on `dateRange.from/to` change; passes range to all action calls
- `src/components/dashboard/widgets/AgentTasksWidget.tsx` — "Live" badge added to header
- `src/components/dashboard/widgets/AgentActivityWidget.tsx` — "Live" badge added to header
- `src/app/(dashboard)/dashboard/page.tsx` — reads `dash_preset`, `dash_from`, `dash_to` from `searchParams`; resolves `DateRange` server-side via `resolvePresetToRange`/`rangeFromUrlParams`; passes range to `getDashboardSummary` + `getLeadVolumeByRange`; default preset: `week`

---

## 2026-06-04 — Performance — page scroll layout aligned with Leads/Tasks

- `performance/page.tsx` — all role branches use canonical `<main className="flex-1 min-w-0 p-8">` (was inline padding + agent `maxWidth: 1280px`); title/filter rows use `mb-6` / `mb-4` Tailwind classes matching the list-page contract
- `ManagerPerformancePanel` — removed roster `maxHeight: 600px` + nested `overflowY: auto`; agent list grows with content and scrolls in the dashboard paper shell like other pages
- `PerformanceRosterEmptyState` + `ManagerPerformanceSkeleton` — dropped fixed `600px` min-heights; empty/skeleton right column uses `min(320px, 40vh)`
- `AgentPerformanceShell` — filter strip `mb-6` → `mb-4`

---

## 2026-06-04 — Performance — roster empty state replaces domain health grid

- `PerformanceRosterEmptyState` (`src/components/performance/PerformanceRosterEmptyState.tsx`) — Playfair italic prompt on `paper-subtle` with accent radial wash; shown when no agent is selected on manager/founder Agents tab
- `ManagerPerformancePanel` — removed `DomainHealthGrid` from null-selection right panel; `domainHealth` prop and client refetch of health metrics dropped
- `ManagerPerformanceAsync` — roster-only server fetch (domain metrics remain on founder Domains tab via `page.tsx` + `DomainOverviewPanel`)
- `getManagerRosterAction` — returns `AgentRosterRow[]` only; new `getDomainHealthMetricsAction` for `DomainOverviewPanel` period refetch
- `ManagerPerformanceSkeleton` — right column matches empty-state layout

---

## 2026-06-04 — Performance — Founder view enhancement: Domains tab + violation fixes

- **Migration 0068:** `get_domain_health_metrics` RPC extended — adds `total_calls_made` (SUM of call_count on cohort leads by `created_at`) and `total_revenue` (SUM of deal_value on won leads by `status_changed_at` — Critical Date-Field Rule invariant 1 honoured); `CREATE OR REPLACE` replaces 0066 in place
- `DomainHealthCard` type (`src/lib/types/index.ts`) — `totalCallsMade: number` and `totalRevenue: number` fields added
- `getDomainHealthMetrics` (`src/lib/services/performance-service.ts`) — maps `total_calls_made` and `total_revenue` from RPC row
- `formatCurrencyCompact` added to `src/lib/utils/numbers.ts` — compact currency (₹/$ prefix + K/M magnitude)
- **`DomainOverviewPanel`** (`src/components/performance/DomainOverviewPanel.tsx`) — new `'use client'` component for the founder Domains tab; props: `initialData`, `period`, `customFrom?`, `customTo?`; top section: 2×2 grid of domain cards (Total Leads, Total Calls, Total Revenue per GIA domain); domain label pill uses `DOMAIN_LINE_COLORS` dot; bottom: horizontal `BarChart` with metric toggle (Leads / Calls / Revenue); accent bar on period refetch; `getManagerRosterAction` for re-fetch on period change; skip-first-mount ref prevents double-fetch; all chart colours resolved via `useChartTokens()` — zero raw `var(--)` in Recharts fill
- **`FounderPerformanceShell`** converted from server to `'use client'` component; adds `activeTab: 'agents' | 'domains'` state (never URL); tab switcher ghost pills (active: accent-surface + semibold); `agentsSlot: React.ReactNode` prop carries the server-rendered `<Suspense><ManagerPerformanceAsync /></Suspense>` subtree; Domains tab renders `DomainOverviewPanel`
- `page.tsx` founder branch — fetches `initialDomainHealth` via `getDomainHealthMetrics(GIA_DOMAINS, from, to)` server-side; passes as prop to `FounderPerformanceShell`; passes `agentsSlot` with full `ManagerPerformanceAsync` Suspense boundary
- **`AgentDetailPanel` violation fixes:** `STAT_PALETTES` hex values → `var(--color-success/info/warning/neutral-light)` tokens (V-01); `DetailSkeleton` dead-code function removed; stat palette reduced 5→4; "Calls Today" label → **"Total Calls"** (`totalCallsMade` field); stat card comment updated
- **`PerformanceFilters` violation fixes:** active-count badge `fontSize: '10px'` → `var(--text-2xs)`; period dropdown: removed "All Time", added "Today"; order: Today · This Week · This Month · Previous Month · Custom (`all_time` type and service logic unchanged)
- `src/app/(dashboard)/performance/CLAUDE.md` — Founder view architecture updated, `DomainOverviewPanel` props/data flow documented, component map updated, "Total Calls" rename noted

---

## 2026-06-04 — Dashboard — Lead Pipeline domain tabs fit widget width

- `ManagerLeadStatusWidget` — domain picker uses full-width connected tabs with `flex: 1`, `minWidth: 0`, smaller padding, and ellipsis on long labels (matches Lead Volume widget pattern); prevents Onboarding / Indulge Legacy / All from overflowing the single-column widget

---

## 2026-06-04 — Performance — Domain health overview grid on initial load; null selectedId; filter wiring verified

- Migration 0066: `get_domain_health_metrics(p_domains, p_date_from, p_date_to)` RPC — one row per domain always (UNNEST driving source); five CTEs (cohort, closures, pipeline, calls); all `WHERE archived_at IS NULL`; `SECURITY DEFINER STABLE`; `GRANT EXECUTE TO authenticated`
- `DomainHealthCard` type added to `src/lib/types/index.ts` — `conversionRate: number | null` computed in service, never SQL
- `getDomainHealthMetrics(domains, dateFrom, dateTo)` added to `src/lib/services/performance-service.ts` — single RPC call; all bigint fields through `Number()`; reuses existing `GIA_DOMAINS` constant (no new constant file)
- `src/components/performance/DomainHealthGrid.tsx` — new pure presentational component; 2×2 grid for founder/admin, 1-col for manager single-domain; health pip + conversion badge with semantic colour tokens only; `DomainHealthGridSkeleton` exported inline
- `ManagerPerformanceAsync` — `getDomainHealthMetrics` called in parallel with `getAgentRosterPerformance` via `Promise.all`; `healthDomains = allDomains ? GIA_DOMAINS : [domain]`; `domainHealth` prop forwarded to `ManagerPerformancePanel`
- `ManagerPerformancePanel` — `selectedId` initial state changed from first-agent to `null`; right panel is exclusively `DomainHealthGrid` when `selectedId === null`, exclusively `AgentDetailPanel` when non-null; `AnimatePresence mode="wait"` keyed `"domain-overview"` / agent id; filter resets to `null` (not first agent) when selected agent leaves visible set; `customFrom`/`customTo` forwarded to `AgentDetailPanel`
- `ManagerPerformanceSkeleton` — right-side updated from agent-detail shimmer to 2×2 domain health card grid matching the new initial state
- `src/app/(dashboard)/performance/CLAUDE.md` — `DomainHealthGrid`, `getDomainHealthMetrics`, null-selectedId pattern, migration 0066 documented

---

## 2026-06-04 — Lead list instant refresh + dashboard 30s auto-poll

**Change 1 — `revalidatePath('/leads')` on all lead mutations**

Six server actions now tell Next.js to bust the `/leads` RSC segment in addition to the dossier page. Before this change, the agent's lead list stayed stale until manual navigation; mutations only revalidated the dossier (`/leads/[slug]`).

Actions that gained `revalidatePath('/leads')`:
- `addLeadCallNote` — status may advance (new→touched), call_count and last_call_outcome change
- `updateLeadStatus` — status changes
- `assignLead` — assigned_to changes
- `createManualLead` — new row appears in list
- `revalidateLeadDossier` helper (covers `updateLeadEmail`, `updateLeadDomain`, `updateLeadSource`, `updateLeadCity`)

`createLeadTaskAction` intentionally excluded — creating a task on a dossier does not change any list-visible field.

File: `src/lib/actions/leads.ts`

**Change 2 — 30s silent auto-poll on three dashboard widgets**

`AgentTasksWidget`, `ManagerLeadStatusWidget`, and `ManagerCampaignWidget` now poll their server action every 30 seconds using a `setInterval` inside a `useEffect`. No loading state is shown; data swaps in silently via `startTransition`. The interval is cancelled on unmount and re-created if the domain mode or userId dependency changes.

`AgentActivityWidget` is intentionally excluded — it already has a Supabase Realtime subscription on `lead_activities` that delivers inserts live. Polling would be redundant.

Pattern per widget: `setInterval` → `let cancelled = false` → `startTransition(async () => { fetch; if (!cancelled && data) setState })` → cleanup returns `clearInterval`. Same cancelled-flag pattern used by the existing mount-fetch `useEffect` (see 2026-05-28 post-ship fix).

Files: `src/components/dashboard/widgets/AgentTasksWidget.tsx`, `ManagerLeadStatusWidget.tsx`, `ManagerCampaignWidget.tsx`

---

## 2026-06-04 — Performance · Agent self-view redesign: smart period tabs + dual content tabs

**Period selector:** FilterDropdown removed. Replaced with flat chevron-style pill row: Today → This Week → This Month → Custom. Active button gets --theme-paper bg + --shadow-1. Custom reveals DatePicker fields inline via AnimatePresence.

**Content tabs:** "Overview" and "Today" sit above the content area. Today tab: hero Calls Today + Notes Today in large serif, call outcome donut, live pipeline cards (Won / In Discussion / Nurturing). Overview tab: always shows a today snapshot strip (calls/notes/won since midnight IST) then CoreFourGrid → EffortGrid → CallOutcomeBar for the selected period. When period = Today, tabs collapse to one view.

**Architecture:** Agent self-view is now fully client-driven via AgentPerformanceShell. No URL params, no Suspense boundary. page.tsx fetches this_month as initialData for instant first paint. Period changes dim with progress-bar via getAgentSelfMetricsAction.

**New:** today added to PerformancePeriod. getAgentSelfMetricsAction added to actions/performance.ts.

---

## 2026-06-04 — Redis cache audit: dead caches removed, version-counter invalidation

Complete overhaul of the Redis cache layer. 10 key families removed, 4 bugs fixed, list invalidation upgraded from O(N) SCAN to O(1) atomic INCR.

**Removed caches (TTL-only, no invalidation path — safer to hit DB):**
- `perf:*` — all 6 performance-service namespaces removed. Performance data is retrospective; DB queries have proper indexes; managers/founders don't refresh constantly. `redis` import + all 6 TTL constants deleted from `performance-service.ts`.
- `campaign:list/detail/distribution` — campaign analytics removed from `leads-service.ts`. Manager/admin use only; RPC queries are fast enough raw.
- `campaign:ad-creative` — removed from `ad-creatives-service.ts` and `ad-creatives.ts` action. `void redis.del` after upsert/delete was a bug pattern (CLAUDE.md §void-redis-del); simpler to drop the cache entirely.
- `task:group-list` — removed from `tasks-service.ts` (getGroupTasks) and `tasks.ts` action. Manager-only workbench, infrequent access.
- `task:subtasks` — removed from `tasks-service.ts` (getGroupSubtasks) and all action call sites. Workspace feature, low traffic.
- `task:remarks` — removed from `tasks-service.ts` (getTaskRemarks) and `addTaskRemarkAction` / `suppressTaskRemarkAction`. Low value, Realtime already refreshes the UI.

**Bug fixes in kept caches:**
- `assignLead`: was `void Promise.all([...]).catch()` — replaced with `await Promise.all` inside `try/catch`. Also added missing `leadRowSlug` del (Bug 3 from the audit plan) and two INCR calls.
- `revalidateLeadDossier` (covers `updateLeadEmail`, `updateLeadDomain`, `updateLeadSource`, `updateLeadCity`): was three separate `void redis.del().catch()` calls — replaced with a single `await Promise.all` + `leadRowSlug` del was already present but `leadActivities` was missing; now all three keys await correctly.
- `addLeadCallNote`: added two INCR calls for `agent` and `manager` list version (call notes can auto-advance status, changing list-visible `status` field).
- `updateLeadStatus`: added two INCR calls for `agent` and `manager` list version.

**Version counter pattern for lead list cache (replaces SCAN):**
- New key: `lead:list:v:{role}:{domain}` — persists without TTL. Every lead mutation does `INCR` on the relevant role+domain combos.
- `buildLeadListKey` now requires a `version: number` argument and embeds it as `:v{N}` suffix.
- `getLeadsByRole` reads the current version with a fast `GET` before building the cache key. Old versioned keys self-expire at LEAD_LIST_TTL (30s).
- `createManualLead`: the O(N) Redis SCAN loop is completely replaced with two `INCR` calls. 6 dashboard volume period keys now deleted in the same `Promise.all` (all periods × roles).

**`redis-keys.ts` cleanup:**
- Added `REDIS_KEYS.leadListVersion(role, domain)` builder.
- `REDIS_KEYS.leadList` now takes `version: number` as 5th arg.
- Removed: `REDIS_KEYS.perf.*`, `REDIS_KEYS.campaign.*`, `REDIS_KEYS.task.subtasks`, `REDIS_KEYS.task.remarks`, `REDIS_KEYS.task.groupList`, legacy `taskSubtasks` / `taskRemarks` flat aliases.
- Removed: `leadListKeyPrefix` export (SCAN pattern retired).
- Removed TTL constants: all 6 `PERF_*_TTL`, all 4 `CAMPAIGN_*_TTL`, `TASK_GROUP_LIST_TTL`, `REDIS_TTL.TASK_SUBTASKS`, `REDIS_TTL.TASK_REMARKS`.

**Files changed:** `src/lib/constants/redis-keys.ts`, `src/lib/services/performance-service.ts`, `src/lib/services/leads-service.ts`, `src/lib/services/ad-creatives-service.ts`, `src/lib/services/tasks-service.ts`, `src/lib/actions/leads.ts`, `src/lib/actions/tasks.ts`, `src/lib/actions/ad-creatives.ts`

---

## 2026-06-04 — Dashboard shell: flat canvas gutter matches sidebar (no wash below paper)

The margin strips around the floating paper card (top, right, and especially below the card) showed `.layout-canvas` grain + Earth radial gradients + `--shadow-paper` bleed — visually different from the flat sidebar even though both use `#0d0c0a` on Earth. Root cause: the paper used `height: calc(100dvh - 24px)` + margins inside a textured flex row, leaving dead canvas below the card when the row was taller than the paper box.

- `src/app/(dashboard)/layout.tsx` — outer shell uses `layout-shell` (flat `--theme-canvas`). Right column is a full-height canvas wrapper with `padding: 12px 12px 12px 0`; paper is `flex: 1` so it fills the column with no gap underneath.
- `src/app/globals.css` — `.layout-shell` added (flat canvas only). `.layout-canvas` kept for optional atmosphere elsewhere. `html`/`body` use `var(--theme-canvas)` so theme switches stay in sync.

---

## 2026-06-04 — Performance · Manager view: selected agent preserved across period/date filter changes

`ManagerPerformanceAsync` removed `key={period}` from `ManagerPerformancePanel`. Previously, every period change forced a full remount of the panel — resetting the selected agent back to the alphabetical first and wiping the user's selection. The agent roster now stays mounted across period changes; `AgentDetailPanel.useEffect` already re-fetches when `period`/`customFrom`/`customTo` change, so no data regression.

`AgentDetailPanel` now distinguishes agent-switch (full skeleton) from period-change (graceful dim). A `metricsAgentId` ref tracks which agent the live metrics belong to. On period change for the same agent: `setMetrics(null)` is NOT called, so the existing data stays visible at 45% opacity while the refetch is in flight. A thin 2px accent progress bar (`scaleX 0→1`, 900ms) appears at the top of the panel to signal the refresh. On agent switch: full skeleton as before.

**Two invariants now enforced:**

- `ManagerPerformancePanel` must never carry `key={period}` — period state flows through props, not remount.
- `AgentDetailPanel.metricsAgentId` ref must be reset to `null` on agent switch before the fetch fires, so the agent-switch skeleton path is always taken for a new agent regardless of in-flight state.

---

## 2026-06-04 — UI: SearchBar clear (×) vertical alignment; Leads date-range clear aligned to picker row

`SearchBar` clear control: outer flex anchor centers the hit target; Framer Motion `scale` no longer fights `translateY(-50%)`. Clear icon size follows `iconSize` per size variant; `right`/`paddingRight` use `--space-3` (§5.10). `LeadsFilters` date dropdown: panel `alignItems: flex-end`; clear button is `2.25rem` square (matches `DatePicker` trigger); removed `marginTop` hack on × and arrow.

---

## 2026-06-03 — Performance · AgentDetailPanel scorecards corrected: totalLeads (all-time assigned count), totalCallsMade (SUM call_count on cohort leads), callsToday verified — Phase 9

`AgentDetailMetrics` fields renamed: `newLeadsAttended` → `totalLeads` (all-time assigned leads, no period filter), `followUpsCompleted` → `totalCallsMade` (SUM(call_count) on leads created in the period, COALESCE 0). `callsToday` filter confirmed correct — `call_outcome IS NOT NULL` was already present. Service queries updated in `getAgentDetailMetrics`; `AgentDetailPanel` stat card labels updated to "Total Leads" and "Total Calls". `tsc --noEmit` passes with zero errors.

---

## 2026-06-03 — Leads search: 350ms keystroke debounce, SearchBar component wired, useDebounce hook created

Search in `LeadsFilters` now pushes to `?search=` automatically 350ms after the user stops typing — no Apply click required. `FilterDraft` no longer contains `search`. `SearchBar` from `src/components/ui/SearchBar.tsx` replaces the inline input. `useDebounce<T>` created at `src/hooks/useDebounce.ts` — the one and only debounce utility in the codebase.

---

## 2026-06-03 — Fix: `lead_id` now logged on all `agent_assignment` notification rows

`sendLeadAssignmentNotification` gained an optional 5th parameter `leadId?: string | null`. It is threaded into the `logNotification` call inside the `finally` block, so every `agent_assignment` row in `whatsapp_notification_logs` now carries a non-null `lead_id`.

All five call sites updated:

- `src/app/api/webhooks/leads/route.ts` → `result.leadId`
- `src/lib/services/whatsapp-ingestion.ts` → `newLeadId`
- `src/lib/services/lead-ingestion.ts` → `existing.id` (duplicate re-submission path)
- `src/lib/actions/leads.ts` `assignLead` → `leadId`
- `src/lib/actions/leads.ts` `createManualLead` → `leadId`

Parameter is optional (`?: string | null`) — any future call site that omits it compiles without error and logs `null` rather than crashing.

---

## 2026-06-03 — Fix: WhatsApp notification gaps — 6 issues from ecosystem audit (migration 0067)

Six gaps in the WhatsApp notification layer closed. Migration `20260603000067_extend_whatsapp_notification_log_types.sql` widens the `whatsapp_notification_logs.type` CHECK constraint to include `'sla_breach'` and `'lead_initiation'`.

**Fix 1 — Missing `leadId` in WhatsApp-origin founder alerts** (`src/lib/services/whatsapp-ingestion.ts`)
`createLeadFromWhatsApp` returns `leadId`. It is now passed as the 5th argument to `sendFounderLeadNotification`. All founder alert log rows written from WhatsApp-origin leads will have a non-null `lead_id`.

**Fix 2 — Redundant profile fetch in `assignLead`** (`src/lib/actions/leads.ts`)
The action previously fetched the agent profile twice — once implicitly inside `sendLeadAssignmentNotification`, and again explicitly to get the agent name for `sendFounderLeadNotification`. Both fetches are now a single `Promise.all` alongside the lead fetch at the start of the action, eliminating one DB round-trip per manual assignment.

**Fix 3 — Founder not notified when no agent is available**
Both Pipeline A (`src/app/api/webhooks/leads/route.ts`) and Pipeline B (`src/lib/services/whatsapp-ingestion.ts`) previously gated ALL notifications on `assigned_to` being non-null. `sendFounderLeadNotification` now fires unconditionally after a successful ingest/creation. When no agent is available, `agentName` is passed as `'Unassigned'`.

**Fix 4 — Duplicate re-submission: assigned agent not pinged** (`src/lib/services/lead-ingestion.ts`)
When `ingestLead` detects an active duplicate by phone, it now fires `sendLeadAssignmentNotification` to the existing lead's assigned agent (if set). The agent is alerted that the same person re-submitted. `sendFounderLeadNotification` is deliberately not fired on duplicates — the founder already received the original alert.

**Fix 5 — SLA notification type misclassified in logs** (`src/lib/services/whatsapp-api.ts`)
`sendSlaAgentNotification` was logging with `type: 'agent_assignment'` and `sendSlaManagerNotification` with `type: 'founder_alert'`. Both now use `type: 'sla_breach'`. Historical rows written before this migration cannot be reclassified (no reliable discriminator in stored response bodies).

**Fix 6 — Lead initiation has no audit trail** (`src/lib/services/whatsapp-api.ts`)
`sendLeadInitiationMessage` now wraps its Gupshup call in the standard `try/catch/finally` pattern with `logNotification({ type: 'lead_initiation', ... })` in the `finally` block. The function still re-throws on failure so the action layer can surface the error to the UI — this is the documented exception to the fire-and-forget pattern.

`src/lib/services/CLAUDE.md` updated: documents `sendLeadInitiationMessage` as the re-throw exception; documents the `'Unassigned'` fallback convention for `agentName`.
`src/lib/actions/CLAUDE.md` updated: founder alert now documented as unconditional (not gated on `assigned_to`); WhatsApp-ingestion added as 4th confirmed call site.
`src/lib/types/database.ts` updated: `whatsapp_notification_logs.type` union widened to match migration 0067.

---

## 2026-06-03 — Fix: founder alert silent failures now logged; all Gupshup responses and errors written to notification log

Restructured the inner fetch try/catch in all four template send functions in
`src/lib/services/whatsapp-api.ts` (`sendLeadAssignmentNotification`,
`sendFounderLeadNotification`, `sendSlaAgentNotification`, `sendSlaManagerNotification`)
to use a `finally` block for `logNotification`.

**Previous shape (buggy):** `logNotification` was called in two separate places — once in the
catch block with a `return`/`continue`, and once after the fetch on the success path. Any
exception thrown between those two points (e.g. by `res.text()`, or a future code path) would
exit the function with zero log rows written — completely silent.

**New shape:** `gupshupStatus`, `gupshupBody`, `delivered` are declared before the try with
zero-value defaults. The try block sets them from the response; the catch block sets them from
the error. The `finally` block calls `logNotification` exactly once per send attempt, with a
`.catch(() => {})` guard so a DB insert failure cannot propagate. Every exit path now produces
a log row.

`src/lib/services/CLAUDE.md` created documenting the finally-block as the canonical pattern
for all future template send functions.

---

## 2026-06-03 — Fix: founder WhatsApp alert lead_id logging corrected

`sendFounderLeadNotification` in `src/lib/services/whatsapp-api.ts` accepted no `leadId`
parameter, so every `whatsapp_notification_logs` row of type `founder_alert` was written with
`lead_id = null`. Added `leadId?: string | null` as a 5th parameter and threaded it into both
`logNotification` calls inside the function (fetch-error path and success path). All three call
sites updated to pass the correct `leadId`:

- `src/app/api/webhooks/leads/route.ts` — passes `result.leadId` from `ingestLead`
- `src/lib/actions/leads.ts` `assignLead` — passes `leadId` (schema-parsed UUID)
- `src/lib/actions/leads.ts` `createManualLead` — passes `leadId` (inserted row UUID)

No migration needed — `lead_id` is nullable on the table (by design for edge cases); this fix
ensures it is populated whenever the lead UUID is known. `src/lib/actions/CLAUDE.md` created
with the confirmed call-site pattern for future reference.

---

## 2026-06-03 — leads.city dedicated column (migration 0066)

`city` promoted from `personal_details JSONB` to a top-level `leads.city text` column.

- Migration 0066: `ALTER TABLE leads ADD COLUMN city text`; backfills existing rows from `personal_details->>'city'`; removes the `city` key from `personal_details` JSONB on all existing rows
- `src/lib/types/database.ts` — `city: string | null` added to `leads` Row/Insert/Update and `get_active_lead_by_phone` RPC return type
- `src/lib/validations/lead-schema.ts` — `UpdateLeadCitySchema` + `UpdateLeadCityInput` added
- `src/lib/actions/leads.ts` — `updateLeadCity` action: Zod → auth → adminClient UPDATE; `updatePersonalDetails` now skips the `city` key (never writes it to JSONB)
- `src/lib/services/lead-ingestion.ts` — webhook ingestion extracts `city` from `form_data` into the dedicated column (removes it from `form_data` to avoid duplication); `createLeadFromWhatsApp` sets `city: null` explicitly
- `src/components/leads/PersonalDetailsCard.tsx` — city field removed from JSONB fields array; managed as a separate state variable calling `updateLeadCity` in parallel with `updatePersonalDetails` on save
- `src/components/leads/LeadInfoCard.tsx` — `MapPin` icon imported; city `InfoRow` added after Phone in the contact grid

---

## 2026-06-03 — fix: createLeadFromWhatsApp now writes source: 'whatsapp' alongside attribution

`src/lib/services/lead-ingestion.ts` line 296: `source` was `null` in the `createLeadFromWhatsApp` INSERT object after the attribution refactor. `attribution: { platform: 'whatsapp' }` was present but `source` (the indexed flat column) was missing, causing every WhatsApp-originated lead to have `source = null` and making `WHERE source = 'whatsapp'` analytics queries return zero rows. Fixed by setting `source: 'whatsapp'` explicitly. These are two separate fields that must always be set together — `source` is the queryable analytics column; `attribution` is the platform-specific JSONB bag. No migration needed.

---

## 2026-06-03 — Domain-scoped route authorization — sidebar filtering + layout guard via canAccessRoute

Domain-gated navigation: non-Gia domains (tech, finance, concierge, marketing, b2b) now see only the routes their domain permits. Implemented via a pure `canAccessRoute` util, a `DOMAIN_ROUTE_MAP` constant, a server-side layout guard, and Sidebar filter. Admin/founder roles bypass all domain checks. `/dashboard` and `/profile` are always accessible to every authenticated user.

- `src/lib/constants/route-permissions.ts` — `ALWAYS_ALLOWED_PREFIXES` + `DOMAIN_ROUTE_MAP`
- `src/lib/utils/route-access.ts` — `canAccessRoute(profile, pathname)`
- `src/proxy.ts` — forwards `x-pathname` header to the dashboard layout
- `src/app/(dashboard)/layout.tsx` — server-side redirect when domain denies the route
- `src/components/layout/Sidebar.tsx` — nav items filtered per domain using `canAccessRoute`
- `src/components/layout/CLAUDE.md` — created; documents the pattern

---

## 2026-06-03 — Attribution refactor: 7 flat columns → source, medium, utm_campaign + attribution JSONB (migration 0065)

7 flat ad/attribution columns consolidated. The table now holds `source` (manual/dossier-editable channel), `medium` (fb|ig|…), `utm_campaign` (unchanged — has 4 indexes and drives campaign analytics), and `attribution jsonb` (all platform-specific extras: `platform`, `campaign_id`, `ad_name`, `adset_name`). Existing rows backfilled.

**Columns removed:** `platform`, `campaign_id`, `ad_name`, `utm_content`  
**Columns renamed:** `utm_source → source`, `utm_medium → medium`  
**Column added:** `attribution jsonb`  
**Index:** `idx_leads_utm_source` dropped; `idx_leads_source` created

- `supabase/migrations/20260603000065_attribution_refactor.sql` — migration
- `src/lib/types/database.ts` — `leads` Row/Insert/Update updated; `get_active_lead_by_phone` RPC return shape updated; `Lead` derived type updated (`attribution: Record<string,unknown>|null`); `LeadPlatform` deprecated (platform now in `attribution.platform`)
- `src/lib/leads/adapters.ts` — `NormalizedLeadPayload` updated (`source`, `medium`, `attribution`, removed flat ad fields); all three adapters updated; Meta builds `attribution={platform:'meta',campaign_id,ad_name,adset_name}` from `res3`; Google/website build minimal `attribution={platform}` objects; WEBSITE_STANDARD_KEYS pruned
- `src/lib/services/lead-ingestion.ts` — `leadPayloadSchema` updated; INSERT maps `source`, `medium`, `utm_campaign`, `attribution`; `createLeadFromWhatsApp` inserts `source:'whatsapp'` + `attribution:{platform:'whatsapp'}` (see fix entry below)
- `src/lib/services/leads-service.ts` — `LeadListItem` Pick updated (`source`, `medium`; removed `platform`); explicit SELECT list in `getLeadsByRole` updated; source filter changed from `.eq("platform",…)` to `.eq("source",…)`
- `src/lib/validations/lead-schema.ts` — `UpdateLeadUtmSourceSchema` renamed to `UpdateLeadSourceSchema` (field `utm_source → source`); `CreateManualLeadSchema.utm_source` renamed to `source`
- `src/lib/actions/leads.ts` — `updateLeadUtmSource` renamed to `updateLeadSource` (schema ref + DB field updated); `createManualLead` uses `source` field; activity details type changed `lead_utm_source_updated → lead_source_updated`
- `src/lib/constants/lead-columns.ts` — `platform` column entry removed (stored localStorage id silently dropped by validator on next load)
- `src/components/leads/LeadsTable.tsx` — `source` case reads `lead.source`; `medium` case reads `lead.medium`; `platform` case removed; unused `PLATFORM_LABELS`/`resolveLeadSource` imports cleaned up
- `src/components/leads/LeadInfoCard.tsx` — `resolvedSource = lead.source`; `SourceDropdownField` calls `updateLeadSource({source})`; medium row reads `lead.medium`; Platform + Ad name attribution InfoRows added (display-only, shown when `attribution` has values); `resolveLeadSource` import removed
- `src/components/leads/LeadActivityLog.tsx` — `note_added` handler now matches both `lead_source_updated` (new) and `lead_utm_source_updated` (legacy rows); reads `d.source ?? d.utm_source`
- `src/components/leads/LeadsFilters.tsx` — no change needed; was already using `source` URL param

---

## 2026-06-03 — Dashboard: domain line colours migrated to CSS tokens; quarter period exposed

- `src/styles/design-tokens.css` — nine `--domain-*` tokens added to `:root` (mid-tone hue-wheel palette: steel blue, amber, jade, orchid, terracotta, sea glass, soft violet, warm ochre, muted sage). All legible on every `--theme-paper` surface. No per-theme overrides needed.
- `src/lib/constants/domain-colors.ts` — new file; `DOMAIN_LINE_COLORS: Record<AppDomain, string>` mapping all nine domains to `var(--domain-*)` CSS variable strings.
- `src/components/dashboard/widgets/ManagerLeadVolumeWidget.tsx` — removed every hardcoded hex colour (`#F5A623`, `#4A90D9`, `#8B6FD4`, `#E05C4B`, `FALLBACK_COLORS`). Replaced with `resolvedDomainColors` state populated via `resolveColorMap(DOMAIN_LINE_COLORS)` with a MutationObserver re-resolve on theme switch. Added "Quarter" to `PERIODS` — the period tab now shows Month / Week / Today / Quarter. All service, action, and schema support was already present.
- `docs/design-dna.md` — §16.10 added documenting `--domain-*` tokens, `DOMAIN_LINE_COLORS`, and the mandatory `resolveColorMap` resolution pattern for Recharts strokes.
- `CLAUDE.md` — `domain-colors.ts` added to File Locations table.

---

## 2026-06-03 — Dashboard client: seed fix, rAF ticker, role filter in sanitizeStored, error resilience

- `src/app/(dashboard)/dashboard/page.tsx` — admin/founder now pass `p_initial_domain='onboarding'` to `getDashboardSummary`; `getLeadVolumeByPeriod` is skipped for admin/founder (`Promise.resolve(null)`); entire `Promise.all` wrapped in `try/catch` that logs `[dashboard/page]` and renders zeroed `initialData` on RPC failure (no redirect, no throw). `DashboardSummary.lead_volume` widened to `| null` in `src/lib/types/index.ts`.
- `src/components/dashboard/widgets/ManagerLeadStatusWidget.tsx` — admin/founder mount effect now checks `seed !== null && domainMode === DEFAULT_GIA_DOMAIN` and uses the seed directly, skipping `getLeadStatusForDomainAction`. Zero mount POSTs on initial paint when seed is present. Tab switches still fire the action.
- `src/components/dashboard/widgets/AgentActivityWidget.tsx` — ticker loop replaced: `setTimeout(tick, 16)` → `requestAnimationFrame(tick)`; `rafRef.current` typed as `number`; `visibilitychange` listener cancels rAF on `document.hidden = true` and restarts on visible — prevents CPU burn on inactive tabs during an 8-hour agent shift. All hover-pause, offset, and `willChange` logic unchanged.
- `src/hooks/useDashboardLayout.ts` — `sanitizeStored` now filters placements on both `isValidWidgetId(id)` AND `WIDGET_MAP[id].roles.includes(role)`. Placements failing the role check are silently dropped — an agent with manager widgets in localStorage loses them on next hydration.

---

## 2026-06-03 — LeadsFilters: draft → Apply pattern, two-row layout, layout-shift fix

`src/components/leads/LeadsFilters.tsx` rewritten. All filter controls now write into a local `FilterDraft` state; the URL is updated only when the user clicks Apply (one `router.push`). Search no longer pushes on every keystroke — the 500ms debounce is retired entirely. `isDirty` is a computed boolean (no `useState`). `committedCount` badge reflects URL state, not draft. Row 2 is `flexWrap: nowrap` so dropdown panels (absolutely positioned) never reflow the row when open. Domain change atomically clears `agent_id` and `campaign` in the same `setDraft` call. `docs/lead-page.md` invariant 7 updated; `src/components/leads/CLAUDE.md` updated with `FilterDraft` type, `draftFromParams` helper, `isDirty` computed rule, two-row layout contract, and `committedCount` vs draft distinction.

## 2026-06-03 — Dashboard refresh paths: RPCs, Redis cache-aside, and invalidation

- `supabase/migrations/20260603000064_dashboard_refresh_rpcs.sql` — two new STABLE SECURITY DEFINER RPCs: `get_lead_pipeline_refresh(p_role, p_domain)` returns `{totals, byAgent}` jsonb (identical shape to `DashboardLeadStatusSummary`); `get_campaign_pipeline_refresh(p_role, p_domain)` returns campaign mix array (identical shape to `DashboardCampaignStatusMix[]`). Both eliminate Node-side aggregation over full `leads` rows.
- `src/lib/services/dashboard-service.ts` — `getLeadStatusSummary`: replaced full-row select + Node aggregation with `.rpc('get_lead_pipeline_refresh', ...)`. `getLeadsByCampaign`: same, replaced with `.rpc('get_campaign_pipeline_refresh', ...)`. `getAgentTasksSummary`: added Redis cache-aside (`dashboard:agent-tasks:{userId}`, 30s TTL). Header comment updated with full Redis key inventory.
- `src/lib/constants/redis-keys.ts` — `REDIS_KEYS.dashboardAgentTasks(userId)` key added; `REDIS_TTL.DASHBOARD_AGENT_TASKS = 30` added.
- `src/lib/actions/leads.ts` — `updateLeadStatus`: adds `dashboard:lead-status:{domain}` and `dashboard:campaigns:{domain}` to the existing awaited `Promise.all` del before `revalidatePath`. `createManualLead`: adds new awaited `Promise.all` del for lead-status, campaigns, and four volume period keys (manager-scoped) before return.
- `src/lib/actions/tasks.ts` — `createPersonalTaskAction`, `updateTaskStatusAction`: each adds an awaited `try/catch` del of `dashboard:agent-tasks:{caller.id}` after existing cache invalidation. All dels use `caller.id` (server-verified profile), never a client-supplied value.
- `src/lib/actions/leads.ts` — `createLeadTaskAction`: adds awaited `try/catch` del of `dashboard:agent-tasks:{caller.id}`.

---

## 2026-06-03 — Lead dossier: WhatsApp conversation initiation — `sendLeadInitiationMessage` (whatsapp-api), `initiateWhatsAppConversationAction`; template `7aee2a33`; no migration; state-driven Realtime in `LeadWhatsAppCard`

## 2026-06-03 — Dashboard RPC: role-branch, p_initial_domain, get_agent_recent_activity

- `supabase/migrations/20260603000062_get_dashboard_summary_role_branch.sql` — drops 3-param overload; recreates `get_dashboard_summary(p_role, p_domain, p_user_id, p_initial_domain DEFAULT NULL)` with role-branch: `agent` role computes only `agent_tasks` + `agent_activity` CTEs and returns immediately with empty stubs for `lead_status` / `campaigns`; manager/admin/founder compute all 4 CTEs; `lead_status` + `campaigns` domain-scoping: manager → `p_domain`, admin/founder + `p_initial_domain` → that domain, admin/founder + NULL → no filter (all-org). Only one 4-param overload remains.
- `supabase/migrations/20260603000063_get_agent_recent_activity.sql` — new `get_agent_recent_activity(p_role, p_domain, p_user_id)` RPC; single `lead_activities LEFT JOIN leads` query with CASE role filter (admin/founder: all, manager: `leads.domain = p_domain`, agent: `actor_id = p_user_id`); returns jsonb array of 25; STABLE SECURITY DEFINER; GRANT EXECUTE to authenticated.
- `src/lib/services/dashboard-service.ts` — `getDashboardSummary` gains optional 4th param `initialDomain?: AppDomain`, passed as `p_initial_domain` to RPC (null when absent). `getAgentRecentActivity` rewritten to call `get_agent_recent_activity` RPC — eliminates the two-step `SELECT id FROM leads LIMIT 1000 → .in('lead_id', ids)` pattern; now a single RPC call for all three roles.
- `src/app/(dashboard)/CLAUDE.md` — new 4-param signature, role-branch behaviour, and `get_agent_recent_activity` RPC documented.

---

## 2026-06-03 — fix: activity history and notes empty on lead dossier for slug-based URLs

- `src/app/(dashboard)/leads/[id]/page.tsx` — `getLeadNotesFull` and `getLeadActivitiesFull` were called with the URL slug string (`id`) instead of `lead.id` (UUID). Both functions query by `lead_id` UUID foreign key, so passing a slug returned empty arrays and the Activity History card always showed "No activity yet." regardless of actual history. Fixed both calls to use `lead.id`.

---

## 2026-06-03 — fix: activity timeline — field-edit events and duplicate submissions now visible

- `src/components/leads/LeadActivityLog.tsx` — three bugs fixed:
  1. **Over-broad filter:** `note_added` rows with a `details.type` sub-key (field-edit events) are no longer dropped. Only bare `note_added` rows (call-paired) are filtered. `updateLeadEmail`, `updateLeadDomain`, and `updateLeadUtmSource` activities now appear in the timeline.
  2. **Missing `describeActivity` cases:** Added handlers for `lead_email_updated` ("Email updated"), `lead_domain_updated` ("Domain changed to …" via `DOMAIN_LABELS`), `lead_utm_source_updated` ("Source changed to …" via `getLeadSourceLabel`), and `duplicate_submission` ("Duplicate submission detected"). All previously returned `''` and rendered as blank or invisible entries.
  3. **Icon function:** `activityIcon` now takes the full `LeadActivityWithActor` rather than just `action_type`; `note_added` field-edit rows show a `Pencil` icon, `duplicate_submission` shows a `Copy` icon.

---

## 2026-06-03 — Lead dossier: embedded WhatsApp chat card (`LeadWhatsAppCard`) — reuses `MessageBubble`, `sendWhatsAppMessage`, Realtime pattern from `ConversationPanel`; `getConversationByLeadId` added to `whatsapp-service.ts`; `getConversationByLeadIdAction` added to `whatsapp.ts`; fetched in existing `Promise.all` on the dossier page; channel name `wa-messages-${conversationId}-${mountId}` with `useId()` StrictMode guard

## 2026-06-03 — fix: lead dossier Source field blank for webhook leads — `LeadInfoCard` now resolves display via `resolveLeadSource(utm_source, platform)` (matches `LeadsTable`); `adaptMeta` intentionally leaves `utm_source` null since channel lives on `platform`

- `src/lib/constants/lead-sources.ts` — `resolveLeadSource()` helper exported.
- `src/components/leads/LeadInfoCard.tsx` — Source row and inline editor use resolved value.
- `src/components/leads/LeadsTable.tsx` — source column uses `resolveLeadSource()` (no behaviour change).

## 2026-06-02 — remove: private scratchpad concept removed from every layer — migration 0061 drops `leads.private_scratchpad` column and `get_lead_scratchpad` function; `AgentScratchpad.tsx` deleted; `updateScratchpad` action and `UpdateScratchpadSchema` removed; `assignLead` no longer clears scratchpad on reassignment; `database.ts` types updated; `docs/lead-page.md` updated (§2a, §2c RPCs, §7e, §8 access control, invariant 22 removed and renumbered)

## 2026-06-02 — perf: leads list query — explicit column SELECT replaces select(*); form_data, personal_details, deal columns, SLA columns excluded from list path

- `src/lib/services/leads-service.ts` — `getLeadsByRole` now selects 18 explicit columns instead of `*`; dossier warming removed (partial objects must not be stored under `leadRowId`/`leadRowSlug` keys — would corrupt `getLeadById`/`getLeadBySlug` reads); `LeadListItem` and `LeadListItemWithAssignee` types exported; `LeadsResult.leads` typed as `LeadListItemWithAssignee[]`.
- `src/components/leads/LeadsTable.tsx` — prop type updated from `LeadWithAssignee[]` to `LeadListItemWithAssignee[]`.

---

## 2026-06-02 — feat: Meta attribution — utm_medium (placement) and utm_content (adset_name) now captured from adaptMeta; platform and medium columns added to leads table; utm_source no longer hardcoded in webhook adapter

- `src/lib/leads/adapters.ts` — `adaptMeta`: `utm_medium` set from `res3?.platform` (sanitized); `utm_content` set from `res3?.adset_name` (sanitized); `utm_source` removed — no longer hardcoded as `'meta'` since `platform` already identifies the source.
- `src/lib/constants/lead-sources.ts` — `PLATFORM_LABELS` map (`meta/google/website/whatsapp`), `META_MEDIUM_LABELS` map (`fb/ig/msg/an`), and `getMetaMediumLabel(medium)` helper added.
- `src/lib/constants/lead-columns.ts` — `platform` and `medium` column definitions added (both default hidden, not locked); `LeadColumnId` union extended.
- `src/components/leads/LeadsTable.tsx` — `platform` renders as accent-subtle pill via `PLATFORM_LABELS`; `medium` renders plain text via `getMetaMediumLabel()`; both show `—` when null.
- `src/components/leads/LeadInfoCard.tsx` — read-only "Medium" `InfoRow` (Signal icon) added below Source on the lead dossier card; uses `getMetaMediumLabel()`.

---

## 2026-06-02 — fix: leads — updateLeadStatus + addLeadCallNote now del leadRowSlug(slug) alongside leadRowId; slug key was the only key hit on normal dossier loads

- `src/lib/actions/leads.ts` — `updateLeadStatus` and `addLeadCallNote`: `REDIS_KEYS.leadRowSlug(slug)` added to the `Promise.all` del block when `slug` is non-null. Previous code deleted only `leadRowId(leadId)`, which is only hit on UUID-fallback loads — slug-based dossier URLs (`/leads/name-XXXX`) never read that key, so the stale row persisted for the full 120s TTL on every `router.refresh()`. `addLeadNote` confirmed correct — its RPC does not mutate the lead row, so no row key del is needed there.
- `/CLAUDE.md` — lead row dual-key invariant added to the `void redis.del` pattern note.

---

## 2026-06-02 — fix: addLeadCallNote — revalidatePath moved after await redis.del block; ordering now consistent with CLAUDE.md invariant

- `src/lib/actions/leads.ts` — `addLeadCallNote`: `revalidatePath` call moved to after the `try { await Promise.all([redis.del(…)]) } catch` block. No logic change — ordering only. `updateLeadStatus` and `addLeadNote` were already correct and not touched.

---

## 2026-06-02 — docs: CLAUDE.md — void redis.del anti-pattern codified as named invariant with correct await pattern

- `/CLAUDE.md` — new named invariant added to `## Pattern Notes`: `void redis.del().catch()` in server actions is a bug; documents the race between fire-and-forget del and `revalidatePath`; correct `try { await Promise.all(…) } catch` pattern shown with actual token names from the leads action; references `updateLeadStatus`, `addLeadCallNote`, `addLeadNote` as canonical implementations.

---

## 2026-06-02 — fix: leads — explicit redis.del on updateLeadStatus, addLeadCallNote, addLeadNote; dossier stale-data window eliminated

- `src/lib/actions/leads.ts` — `addLeadCallNote`, `updateLeadStatus`, `addLeadNote`: fire-and-forget `void Promise.all(…).catch(() => {})` replaced with `try { await Promise.all(…) } catch (e) { console.warn(…) }`. Keys deleted match the RPC's write surface: `updateLeadStatus` → row + activities; `addLeadCallNote` → row + notes + activities; `addLeadNote` → notes + activities. Dashboard keys (`dashboardLeadStatus`, `dashboardLeadVolume`, `dashboardCampaigns`) remain TTL-only — intentional.
- `src/app/(dashboard)/leads/CLAUDE.md` — Redis invalidation section added: key inventory, TTL table, per-mutation del matrix, dashboard TTL-only exception documented.

---

## 2026-06-02 — fix: ReasonModal — RadioGroup replaces FilterDropdown (overflow fix), textarea restored, 'Other' option added

- `src/lib/constants/lead-resolution-reasons.ts` — `other: 'Other'` added as the last entry in both `JUNK_REASONS` and `LOST_REASONS`; `RESOLUTION_REASON_LABELS` updated.
- `src/components/leads/StatusActionPanel.tsx` — `ReasonModal`: `FilterDropdown` removed (was clipping inside modal `overflow:hidden`); replaced with `RadioGroup variant='default'` (no portal, no overflow dependency). Textarea restored per design-dna §7.4 (min-height 80px, resize vertical, auto-grow via `scrollHeight`, `var(--leading-relaxed)` line-height, focus ring). `selectedReason === 'other'` → textarea required, confirm button disabled until `noteText.trim().length > 0`. `p_reason` composition: `other` → freetext; else → label + optional `" — note"`. `useRef` added for textarea auto-grow.
- `src/app/(dashboard)/leads/CLAUDE.md` — RadioGroup-inside-modal pattern documented; FilterDropdown-inside-modal prohibition noted.

---

## 2026-06-02 — feat: leads.resolution_reason + ReasonModal FilterDropdown + addLeadCallNote revalidatePath

- `supabase/migrations/20260602000060_leads_resolution_reason.sql` — `leads.resolution_reason TEXT` column added; partial index `idx_leads_resolution_reason` on junk/lost non-archived rows; `CREATE OR REPLACE FUNCTION update_lead_status` surgically extended: `p_reason` is now persisted to the column when non-null (junk/lost), and cleared to NULL on revive (`in_discussion`); `GRANT EXECUTE` preserved.
- `src/lib/constants/lead-resolution-reasons.ts` — `JUNK_REASONS` (5 options: wrong_number, spam_bot, duplicate, out_of_area, test_lead) and `LOST_REASONS` (5 options: chose_competitor, budget, unresponsive, wrong_service, not_ready) exported; `RESOLUTION_REASON_LABELS` combined map for activity log display.
- `src/components/leads/StatusActionPanel.tsx` — `ReasonModal` internal component: old raw `<select>` + `ChevronDown` overlay replaced with `FilterDropdown multi={false}`, matching the `CalledModal` outcome selector pattern exactly; receives `status: 'junk' | 'lost'` prop to switch between reason lists; both call sites updated with the new prop.
- `src/lib/actions/leads.ts` — `addLeadCallNote`: lead fetch now includes `slug`; `revalidatePath('/leads/${slug ?? id}')` called after successful RPC (fixes stale dossier after CalledModal submits). `updateLeadStatus`: same slug fetch + `revalidatePath` added after RPC succeeds and `result.changed` is true. Pattern follows `createLeadTaskAction`.

---

## 2026-06-02 — perf: remove seed prefetch from ManagerPerformanceAsync — GET request simplified

## 2026-06-02 — fix: AgentDetailPanel seed guard + async fetch pattern — skeleton-stuck bug resolved

## 2026-06-02 — fix: DatePicker + TimePicker — zoom-responsive panel positioning (visualViewport correction, measured flip thresholds, dynamic WheelColumn item height) — Phase UI

## 2026-06-02 — feat: agent shift days — per-agent work-day override for SLA deadline computation

- `supabase/migrations/20260602000059_agent_shift_days.sql` — `shift_days integer[] DEFAULT NULL` added to `agent_routing_config`. NULL = use global BUSINESS_HOURS. Min 1 element when set.
- `src/lib/types/database.ts` — `AgentRoutingConfig.shift_days: number[] | null` and `AgentRosterRow.shift_days: number[] | null` added.
- `src/lib/utils/sla.ts` — `AgentShiftOverride` interface + `buildAgentShiftOverride()` exported. All four exported functions (`isWithinBusinessHours`, `nextBusinessDeadline`, `businessMinutesBetween`, `advanceToNextBusinessStart`) accept optional `shift?: AgentShiftOverride` trailing parameter. Omitting the parameter is zero-breaking — falls back to BUSINESS_HOURS identically.
- `src/lib/actions/sla.ts` — `scheduleSlaTimersForLead` and `refreshActivitySlaTimers` now fetch the agent's routing config once per call, build a shift override, and pass it to `nextBusinessDeadline` for A-rules only (SLA-01A, SLA-02A, SLA-03A, SLA-04A). Manager rules (SLA-01B, SLA-02B, SLA-03B, SLA-04B) always use global BUSINESS_HOURS — deliberate asymmetry.
- `src/lib/services/agent-routing-service.ts` — `getAgentRosterByDomain` select includes `shift_days`; `setAgentShift` gains `shiftDays: number[] | null` third parameter.
- `src/lib/validations/agent-routing-schema.ts` — `SetAgentShiftSchema` extended with `shiftDays: z.array(...).min(1).nullable().optional()`.
- `src/lib/actions/agent-routing.ts` — `setAgentShiftAction` passes `shiftDays` to `setAgentShift`.
- `src/components/settings/AgentSettingsTable.tsx` — `ShiftState` gains `days: number[]`; `WorkDayPicker` inline sub-component (7 pills, Mon→Sat→Sun display order, last-day guard); `handleDaysChange` + `handleClear` updated; clear sends `shiftDays: null` to DB.
- `src/app/(dashboard)/settings/CLAUDE.md` — `WorkDayPicker` pattern, `shift_days` null contract, and updated grid columns documented.

**SLA asymmetry rule:** agent-rule deadlines (A-rules) use the agent's personal shift. Manager escalation deadlines (B-rules) always use global BUSINESS_HOURS — a manager's window is domain-wide, not personal.

---

## 2026-06-02 — design: deals — summary strip and card amounts use Geist Mono (metrics voice)

- `src/components/deals/DealsSummaryStrip.tsx` — stat values switched from Playfair to `var(--font-mono)` with `tabular-nums` per design-system §Technical voice (metrics).
- `src/components/deals/DealCard.tsx` — deal amount uses `var(--font-mono)` + `tabular-nums`; lead name stays Playfair italic.

---

## 2026-06-02 — design: auth — brand header reads "Indulge OS"; subtitle removed

- `src/app/(auth)/login/login-form.tsx`, `forgot-password/forgot-password-form.tsx`, `update-password/update-password-form.tsx`, `update-password/page.tsx` — title changed from "Eia" to "Indulge OS"; "Indulge Global" subtitle removed from all cards.
- `src/app/(auth)/forgot-password/page.tsx`, `update-password/page.tsx` — document `title` metadata updated to "Indulge OS".
- `src/app/(auth)/CLAUDE.md` — unified brand header spec updated.

---

## 2026-06-02 — design: auth — remove accent drop-shadow from logo on all auth pages

- `src/app/(auth)/login/login-form.tsx`, `forgot-password/forgot-password-form.tsx`, `update-password/update-password-form.tsx`, `update-password/page.tsx` — removed `filter: drop-shadow(...)` from `/logo.webp` brand header so the mark renders at full brightness with no glow overlay.

---

## 2026-06-02 — fix: auth — is_active check moved into loginAction; deactivated users never receive a session cookie

- `src/lib/actions/auth.ts` — after successful `signInWithPassword`, calls `getCurrentProfile()`; if `profile.is_active === false`, immediately calls `supabase.auth.signOut()` and returns `{ error: formErrors.accountDeactivated }`. Dashboard layout gate retained as defence-in-depth.
- `src/lib/validations/form-errors.ts` — `accountDeactivated` key added: "Your account has been deactivated. Please contact your administrator."
- `src/app/(auth)/CLAUDE.md` — `is_active` gate section updated to document the two-layer defence (loginAction + dashboard layout).

---

## 2026-06-02 — design: auth pages — dark card redesign, unified branding, Eye/EyeOff on all password fields, strength bar on /update-password, is_active gate on dashboard layout, session-aware root redirect

- `src/app/(auth)/layout.tsx` — removed noise texture div (SVG data URI, parse cost not worth it) and both `.eia-auth-line-1/2` divs; added `backgroundColor: var(--theme-canvas)` on root div to prevent white flash; kept both orb divs and both radial glow divs.
- `src/app/globals.css` — removed `.eia-auth-line-1` and `.eia-auth-line-2` CSS definitions; added `.eia-auth-card` (dark card shell: `--theme-sidebar-hover-bg` bg, `--theme-sidebar-border` border, `--radius-xl`, `--shadow-3`), `.eia-input-auth` (canvas-surface input for dark card forms; focus ring via `--theme-accent` border + `--theme-accent-surface` glow), `.eia-auth-link` (accent link at 65% opacity at rest, full accent on hover).
- `src/app/(auth)/login/login-form.tsx` — full rebuild: `.eia-auth-card` card, unified brand header (LiaGlyph 32px breathing + "Eia" Playfair text-3xl + "Indulge Internal" label), `.eia-input-auth` on both fields, Eye/EyeOff on password field, dark-surface danger banner (`--color-danger-dark-*` tokens), `.eia-auth-link` on forgot link, `maxWidth: 26rem`; removed `/logo.webp` and `Image` import entirely.
- `src/app/(auth)/forgot-password/forgot-password-form.tsx` — same card + input + header treatment; dark danger banner; success state text in `--theme-sidebar-text`; all links use `.eia-auth-link`.
- `src/app/(auth)/update-password/update-password-form.tsx` — same card + input + header treatment; Eye/EyeOff shared across both password fields (one `showNew` state); new-password field is controlled so `PasswordStrengthBar` can read it; strength bar placed below new-password field; dark danger banner.
- `src/app/(auth)/update-password/page.tsx` — `InvalidLinkCard` converted to `.eia-auth-card` dark treatment; back-to-sign-in link uses `.eia-auth-link`; `maxWidth: 26rem`.
- `src/components/ui/PasswordStrengthBar.tsx` — new reusable UI primitive; extracted from `PasswordChangeForm`; props: `password: string`; 4-segment bar with danger/warning/info/success colours; returns null when empty.
- `src/components/profile/PasswordChangeForm.tsx` — inline strength bar logic replaced with `<PasswordStrengthBar password={next} />`.
- `src/app/page.tsx` — converted to async server component; calls `createClient()` → `getUser()`; authenticated users redirect to `/dashboard`, unauthenticated to `/login`.
- `src/app/(dashboard)/layout.tsx` — added `if (!profile.is_active) redirect('/login')` after profile fetch; closes gap where deactivated user with valid cookie could access dashboard.
- `src/app/(auth)/CLAUDE.md` — created: dark card pattern, new CSS classes, unified brand header spec, error banner dark tokens, Eye/EyeOff rule, `is_active` gate rationale, `PasswordStrengthBar` reference.
- `CLAUDE.md` — `PasswordStrengthBar` noted under auth-specific primitives.

---

## 2026-06-02 — perf: tasks — updateTaskStatusAction and deleteTaskAction invalidate personalPage1 / giaList / groupSubtasks cache on write

- `src/lib/actions/tasks.ts` — `updateTaskStatusAction`: added `task_category` to the SELECT already fetched for `canMutateTask`; replaced single-branch `group_subtask` del with three-branch fire-and-forget invalidation: `personal` → `task:personal:page1:{callerId}`, `gia_followup` → `task:gia:{callerId}:{role}:{domain}`, `group_subtask` → `task:subtasks:{groupId}:{callerId}`.
- `src/lib/actions/tasks.ts` — `deleteTaskAction`: added `task_category` to the SELECT already fetched for the auth check; replaced single-branch `group_subtask` del with the same three-branch pattern, applied after the DB DELETE succeeds (Trigger.dev cancel still runs before the delete per invariant 15).
- Pre-mortem accepted: Gia list del uses `caller.id` / `caller.role` / `caller.domain`, not `task.assigned_to`. When a manager deletes an agent's Gia task, the manager's cache slot is cleared (correct — manager may have the Gia tab open); the agent's slot expires at 60s TTL. No additional DB fetch required.

---

## 2026-06-02 — perf: tasks — Redis cache-aside on tab-load functions + missing invalidations wired

- `src/lib/constants/redis-keys.ts` — `REDIS_KEYS.task` namespace added with five key builders: `subtasks`, `remarks`, `giaList`, `groupList`, `personalPage1`; flat legacy aliases retained for existing callers. TTL constants `TASK_GIA_TTL = 60`, `TASK_GROUP_LIST_TTL = 120`, `TASK_PERSONAL_PAGE1_TTL = 30` added.
- `src/lib/services/tasks-service.ts` — Redis cache-aside added to three critical-path tab-load functions: `getGiaTasksForUser` (60s, key includes userId+role+domain), `getGroupTasks` unfiltered (120s, key is domain+role — shared slot per role×domain pair; filtered calls bypass cache), `getPersonalTasks` page-1 only (30s, key is userId; pages 2+ bypass cache entirely — cursor params must all be null AND no active filters).
- `src/lib/services/tasks-service.ts` — `getGroupTasks` signature extended with optional `cacheHint?: { domain: string; role: string }` second param — used for key construction only, never passed to the RPC.
- `src/app/(dashboard)/tasks/TasksAsync.tsx` — `getGroupTasks({}, { domain: callerDomain, role: callerRole })` — forwards caller identity as cache hint.
- `src/lib/actions/tasks.ts` — `createPersonalTaskAction` now dels `task:personal:page1:{assignedTo}` after insert; `createGroupTaskAction` now dels `task:group-list:{domain}:{role}` after insert.
- Pre-existing invalidations (confirmed already present): `createSubtaskAction` dels `taskSubtasks`; `addTaskRemarkAction` dels `taskRemarks`; `suppressTaskRemarkAction` dels `taskRemarks`.
- `src/app/(dashboard)/tasks/CLAUDE.md` — Redis cache section added: key table, TTL values, page-1-only rule for personal tasks, full invalidation table.
- `src/lib/CLAUDE.md` — `tasks-service.ts` services registry row updated to reflect all 5 cached functions.

---

## 2026-06-02 — ux: leads — row prefetch on hover + optimistic status updates in StatusActionPanel

- `src/components/leads/LeadsTable.tsx` — `onMouseEnter` on each table row calls `router.prefetch('/leads/${slug ?? id}')` using the existing `useRouter` instance; no new hook call per row.
- `src/components/leads/StatusActionPanel.tsx` — `useOptimistic(lead.status)` added; `fireStatusUpdate` sets `optimisticStatus` before the action and `throw new Error(result.error)` on failure to trigger automatic revert (actions return `{ data, error }` and never throw natively — the explicit throw is what signals `useOptimistic` to revert); `fireDeal` same pattern with `'won'`; all JSX render references to `lead.status` replaced with `optimisticStatus`; "Called" button `onClick` checks `lead.status === 'new'` (server truth) and fires its own `startTransition(() => setOptimisticStatus('touched'))` before opening the modal — parent owns the decision, `CalledModal` is unaware.
- `src/components/leads/CalledModal.tsx` — `initialStatus` and `onAutoAdvance` props removed; modal is now stateless with respect to the auto-advance.
- `src/app/(dashboard)/leads/CLAUDE.md` — prefetch-on-hover pattern and optimistic status pattern (including throw-on-error revert contract) documented.

---

## 2026-06-02 — fix: Gupshup lead-assignment WhatsApp template ID

- `src/lib/constants/whatsapp.ts` — `GUPSHUP_LEAD_ASSIGNMENT_TEMPLATE_ID` → `193e330d-e7ee-48e0-9cd4-f3808b50fc80`. Template params unchanged: `{{1}}` lead name, `{{2}}` lead phone (or `'not provided'`).
- `docs/whatsapp-page.md` — template table updated to match.

---

## 2026-06-01 — perf: campaigns — Redis cache-aside on getCampaignMetrics (120s, pre-search), getCampaignDetailMetrics (120s), getCampaignAgentDistribution (120s), getAdCreativesForCampaign (300s), getAdCreativesForCampaigns per-key strategy (300s); ad-creative Redis del on upsert/delete. 2026-06-01. Phase performance.

- `src/lib/constants/redis-keys.ts` — `REDIS_KEYS.campaign` namespace (list, detail, distribution, ad-creative key builders) + `CAMPAIGN_*_TTL` constants (120s / 300s).
- `src/lib/services/leads-service.ts` — cache-aside on `getCampaignMetrics` (RPC result before search; key uses `effectiveDomain ?? 'all'`), `getCampaignDetailMetrics` (null cached via `{ payload }` wrapper), `getCampaignAgentDistribution`.
- `src/lib/services/ad-creatives-service.ts` — cache-aside on `getAdCreativesForCampaign`; `getAdCreativesForCampaigns` per-key `Promise.all` get + single batched `.in()` on misses.
- `src/lib/actions/ad-creatives.ts` — `redis.del(campaign:ad-creative:…)` after successful upsert/delete.
- `src/app/(dashboard)/campaigns/CLAUDE.md` — Redis section documenting TTLs, search-post-cache pattern, invalidation.

---

## 2026-06-01 — perf: performance page — eliminate 6x duplicate action calls, parallelize queries, Redis cache-aside

- `src/components/performance/AgentDetailPanel.tsx` — added `lastFetchKeyRef` (`useRef<string>('')`) dedup guard: duplicate fires for same params return early; server-seeded `initialData` skips the mount round-trip entirely (mirrors dashboard perf-01 pattern).
- `src/lib/services/performance-service.ts` — parallelised 11 sequential Supabase queries across 3 functions via `Promise.all`: `_getCoreFourMetricsForRange` (4 queries), `getEffortMetrics` (4 queries), `getTeamBenchmarks` (3 queries after agentIds resolves). Removed unused `responseData` query from `getAgentDetailMetrics` (was fetched but `void`-ed — 1 PgBouncer slot freed per call).
- `src/lib/services/performance-service.ts` — Redis cache-aside added to 6 service functions: `_getCoreFourMetricsForRange` (60s), `getEffortMetrics` (30s), `getCallOutcomeBreakdown` (60s), `getTeamBenchmarks` (120s), `getAgentRosterPerformance` (120s), `getAgentDetailMetrics` (30s). Key namespace `perf:`. Cache miss falls through to DB; Redis failure never blocks. `domain` intentionally excluded from `perf:agent-detail` key (auth-only, does not filter query result).
- `src/lib/constants/redis-keys.ts` — added `REDIS_KEYS.perf` namespace (6 key builder functions) + 6 TTL constants (`PERF_CORE_FOUR_TTL`, `PERF_EFFORT_TTL`, `PERF_OUTCOME_TTL`, `PERF_BENCHMARKS_TTL`, `PERF_ROSTER_TTL`, `PERF_AGENT_DETAIL_TTL`).

---

## 2026-06-01 — lead dossier Gia Tasks: show due time on task rows

- `src/lib/utils/dates.ts` — `formatTaskDueAt()` (`h:mm a, d MMM`, IST) shared by lead dossier and `/tasks` Gia tab.
- `src/components/leads/LeadTasksCard.tsx` — due stamp uses `formatTaskDueAt` (was date-only `dd MMM`).
- `src/components/tasks/GiaTaskRow.tsx` — imports shared formatter; overdue text uses `--color-danger-text`.

---

## 2026-06-01 — fix: Recharts width(-1)/height(-1) console warnings on /performance

- `src/components/performance/CallOutcomeBar.tsx` — donut `ResponsiveContainer` now uses explicit `180×180` pixel dimensions instead of `width/height="100%"` (Recharts 3 defaults `initialDimension` to -1 before ResizeObserver measures the parent).
- `src/components/performance/CoreFourGrid.tsx` — sparkline wrapper gets `minWidth: 0` + positive `initialDimension` so flex KPI cards measure correctly on first paint.

---

## 2026-06-01 — perf: leads Redis key isolation + createManualLead list invalidation + CLAUDE.md registry update. 2026-06-01. Phase performance.

---

## 2026-06-01 — perf: leads Redis cache-aside (list 30s, row/notes/activities 120s, filter-options 300s) + pageSize 50→30 + dossier warm from list load. 2026-06-01. Phase performance.

---

## 2026-06-01 — perf: Redis cache-aside layer — tasks (subtasks 30s, remarks 30s) + dashboard (lead-status 60s, volume 120s, campaigns 120s). Key schema in src/lib/constants/redis-keys.ts. Phase performance.

---

## 2026-06-01 — perf: hoist agents+tags to SSR in TasksAsync, cache() on getGroupSubtasks+getTaskRemarks — eliminates ~2.2s of redundant client action calls per /tasks session. Phase performance.

---

## 2026-06-01 — Fix: WhatsApp-originated leads not sending assignment notifications

- `src/lib/services/whatsapp-ingestion.ts` — `processInboundMessage` was discarding the `assignedTo` return value from `createLeadFromWhatsApp`, so agents and founders never received a WhatsApp notification when a new lead entered via an inbound WhatsApp message. Fixed by destructuring `{ leadId, assignedTo }` and firing `sendLeadAssignmentNotification` (to agent) and `sendFounderLeadNotification` (to all founders) after re-fetching the full lead row. Both calls are fire-and-forget with `.catch()` — a notification failure never blocks message processing.

---

## 2026-06-01 — WA notification wiring audit (phase WA)

- `src/lib/services/whatsapp-api.ts` — full notification wiring audit: null guards verified, param order verified against §7 template table, `logNotification` now called on both success and fetch-throw paths (network error previously went unlogged), no full phone numbers in logs, all fire-and-forget calls have `.catch()` with `[whatsapp-api]` prefix, no notification awaited in hot path; SLA breach path verified (agent fires before manager per rule split, no-agent edge case exits cleanly); `src/lib/CLAUDE.md` updated with verified call site inventory.
- `src/lib/services/whatsapp-api.ts` — `isGupshupDelivered(httpOk, body)` helper added: Gupshup returns HTTP 200 with `{"status":"error","message":"..."}` on template ID mismatches and inactive numbers; `delivered` now derived from body parse (`status === 'error'` → false) rather than `res.ok` alone; non-JSON bodies fall through to trust `httpOk`; all four send functions updated; error log lines now include raw body fragment for observability. Confirmed `responseBody` is `await res.text()` at all four call sites — `JSON.parse` receives a string, not a pre-parsed object.

---

## 2026-06-01 — Design system reference manual

- `docs/design-system.md` — full design system reference manual generated; 2026-06-01; housekeeping.

---

## 2026-06-01 — Deals module intelligence document

- `docs/deals-page.md` — full deals module intelligence document generated; 2026-06-01; housekeeping.

---

## 2026-06-01 — Auth, session & profile intelligence document

- `docs/auth-pages.md` — auth, session, and profile module intelligence document generated; 2026-06-01; housekeeping.

---

## 2026-06-01 — Ad creatives module intelligence document

- `docs/ad-creatives-page.md` — full ad creatives module intelligence document generated; 2026-06-01; housekeeping.

---

## 2026-06-01 — User management module intelligence document

- `docs/user-management-page.md` — full user management module intelligence document generated; 2026-06-01; housekeeping.

---

## 2026-06-01 — Settings module intelligence document

- `docs/settings-page.md` — full settings module intelligence document generated; 2026-06-01; housekeeping.

---

## 2026-06-01 — Campaigns module intelligence document

- `docs/campaigns-page.md` — full campaigns module intelligence document generated; 2026-06-01; housekeeping.

---

## 2026-06-01 — Performance module intelligence document

- `docs/performance-page.md` — full performance module intelligence document generated; 2026-06-01; housekeeping.

---

## 2026-06-01 — WhatsApp module intelligence document

- `docs/whatsapp-page.md` — full WhatsApp module intelligence document generated; 2026-06-01; housekeeping.

---

## 2026-06-01 — Tasks module intelligence document

- `docs/tasks-page.md` — full tasks module intelligence document generated; 2026-06-01; housekeeping.

---

## 2026-06-01 — Dashboard module intelligence document

- `docs/dashboard-page.md` — full dashboard module intelligence document generated; 2026-06-01; housekeeping.

---

## 2026-06-01 — Leads module intelligence document

- `docs/lead-page.md` — full leads module intelligence document generated; 2026-06-01; housekeeping.

---

## 2026-06-01 — Sidebar: Ad Creatives under Configuration

- `src/components/layout/Sidebar.tsx` — Ad Creatives moved from Admin to Configuration (above Settings); still visible only to admin/founder.

---

## 2026-06-01 — Ad Creatives admin page layout (design contract)

- `src/app/(dashboard)/admin/ad-creatives/page.tsx` — removed `maxWidth: 960px`; full-width `flex-1 p-8` shell matches Team/Campaigns list pages.
- `src/components/admin/AdCreativesManager.tsx` — canonical three-row layout (header + filter strip + card list); `MotionButton` primary CTA; `SearchBar` filter with active-count badge and result count; card hover (`translateY(-1px)` + `--shadow-2`); Playfair empty states (V-09); Edit/Delete actions match `UsersTable` bordered buttons; ad name shown as primary title when set.
- `src/components/admin/AdCreativeFormModal.tsx` — field labels use `label-micro` (V-10); campaign dropdown shows `beautifyCampaignTitle()`.

---

## 2026-06-01 — Lead source on `utm_source` (not `form_data` / `platform`)

- `src/lib/constants/lead-sources.ts` — canonical list: meta, google, website, whatsapp, referral, ypo, events; `LEAD_SOURCE_OPTIONS`, `getLeadSourceLabel()`.
- Manual lead create (`createManualLead`, `AddLeadModal`) — source written to `leads.utm_source`; no `form_data.manual_source`.
- `src/lib/actions/leads.ts` — `updateLeadPlatform` replaced by `updateLeadUtmSource`.
- `src/components/leads/LeadInfoCard.tsx` — dossier field renamed **Source**; edits `utm_source` via inline select.
- `src/lib/validations/lead-schema.ts` — `CreateManualLeadSchema.utm_source`, `UpdateLeadUtmSourceSchema`.

---

## 2026-06-01 — Remove ComboboxDropdown; LeadInfoCard uses FilterDropdown

- Deleted `src/components/ui/ComboboxDropdown.tsx` — searchable combobox was a duplicate of `FilterDropdown`.
- `src/components/leads/LeadInfoCard.tsx` — domain, platform, assignee: `InfoRow`-matched trigger + simple themed option menu on click (not `FilterDropdown`).

---

## 2026-06-01 — Lead dossier: per-field inline edit on LeadInfoCard

- `src/components/leads/LeadInfoCard.tsx` — removed card-wide click-to-edit mode. Name and phone stay read-only. Email (inline input), domain, source (`utm_source`), and assignee each save on their own. Added **Last modified** (`lead.updated_at`). Assignee-style hover affordance on all editable fields.
- `src/lib/actions/leads.ts` — `updateLeadInfo` replaced by `updateLeadEmail`, `updateLeadDomain` (manager+), `updateLeadUtmSource`; shared `assertLeadFieldEditAccess` + dossier `revalidatePath`.
- `src/lib/validations/lead-schema.ts` — per-field Zod schemas for the three update actions.
- `src/app/(dashboard)/leads/[id]/page.tsx` — `canEditLeadFields` (includes in-domain managers) and `canEditDomain` props.

---

## 2026-06-01 — Task due notifications fire at due time (not 30 min early)

- `src/trigger/task-reminders.ts` — `scheduleTaskReminder` delays the Trigger.dev job until `dueAt` exactly; notification copy updated to "Task due now". Past due dates remain a no-op.
- `src/components/leads/CalledModal.tsx` — helper/validation aligned: future due time required; no 30-minute lead window.

---

## 2026-06-01 — CalledModal: due date required for Log Update + Task

- `src/components/leads/CalledModal.tsx` — **Log Update + Task** requires due date &amp; time; helper copy explains in-app notification at due time. Task create errors surface instead of being swallowed after the call note is saved.

---

## 2026-06-01 — Lead dossier: Gia tasks list updates without manual refresh

- `src/lib/actions/leads.ts` — `createLeadTaskAction` calls `revalidatePath` on the lead dossier URL (slug or id) so `router.refresh()` serves fresh tasks.
- `src/components/leads/LeadTasksCard.tsx` — syncs `initialTasks` when the async child refetches; `handleTaskCreated` dedupes by id and calls `router.refresh()` after optimistic prepend.

---

## 2026-06-01 — CalledModal cleanup + Gia task types narrowed to Call / WhatsApp / Other

- `src/components/leads/CalledModal.tsx` — phone icon moved into modal title ("Log a call"); removed helper/subtitle copy; removed "Next step" section header; footer Cancel removed (header × closes); follow-up fields kept for Log Update + Task.
- `src/components/ui/Dialog.tsx`, `src/components/ui/modal.tsx` — `title` prop accepts `React.ReactNode` (enables icon + label headers).
- `src/lib/constants/task-types.ts` — `TASK_TYPES` is now `call`, `whatsapp_message`, `other`; labels shortened to Call / WhatsApp / Other; `email` and `general_follow_up` removed from UI surfaces.
- `src/lib/types/database.ts` — `TaskType` union updated to match.
- `src/lib/validations/lead-schema.ts` — `CreateLeadTaskSchema.taskType` enum aligned.
- `src/components/tasks/GiaTaskRow.tsx` — icon map updated (`other` → `MoreHorizontal`).
- `src/lib/actions/tasks.ts`, `src/lib/actions/sla.ts`, `src/components/tasks/CreatePersonalTaskModal.tsx`, `src/components/tasks/PersonalTasksTab.tsx`, `src/components/tasks/MyTasksCalendarView.tsx` — default/synthetic `task_type` set to `other`.
- `supabase/migrations/20260531000057_task_type_other.sql` — backfills `email` and `general_follow_up` rows to `other`; `update_lead_status` nurturing auto-task uses `other`.

---

## 2026-06-01 — Performance page redesign: 4-in-a-row KPI row, sparkline charts, donut outcome breakdown

- `src/components/performance/CoreFourGrid.tsx` — **completely rebuilt**. 4 KPI cards now render in a single flex row (not a 2×2 grid). Each card: accent-icon chip top-right, Playfair serif number, mini `AreaChart` sparkline (Recharts) filling the remaining width, TrendingUp/Down delta with directional context (higher/lower is better per metric), benchmark line in a bottom border strip. Sparkline colours: accent / info / warning / success per metric. `useChartTokens()` resolves series colours so sparklines are fully theme-reactive.
- `src/components/performance/EffortGrid.tsx` — **rebuilt**. 4 compact cards in a flex row. Each has: icon chip with semantic colour (success/accent/info/warning), value in `--text-2xl`, animated horizontal fill bar (calls logged and notes written normalised against each other), description micro-text. Framer Motion fill bar animates from 0% on mount.
- `src/components/performance/CallOutcomeBar.tsx` — **rebuilt**. Replaces the flat segmented bar with a two-zone layout: left legend (coloured pill rows, count + %, total footer) + right `PieChart` donut (Recharts) with a centre label showing top outcome %. Donut cell colours resolved via `resolveVar()` for Recharts SVG fill compatibility.
- `src/app/(dashboard)/performance/PerformanceAsync.tsx` — adds `SectionLabel` dividers ("Key Performance Indicators", "Effort & Pipeline", "Call Outcomes") between each tier; layout is now `flex-col gap-5` with a label+content block per section.
- `src/app/(dashboard)/performance/PerformanceSkeleton.tsx` — **rebuilt** to mirror the new layout: 4 KPI skeletons with sparkline placeholder, 4 compact skeletons with fill bar, 1 wide donut+legend skeleton.
- `src/app/(dashboard)/performance/page.tsx` — agent view `maxWidth` widened from `960px` → `1280px` to give the 4-card KPI row adequate breathing room.

---

## 2026-06-01 — Multiple ad videos per campaign + carousel (Phase 8)

A campaign can now have many ad videos. All three video surfaces (campaign preview modal, campaign detail card, lead dossier modal) show a looping carousel with prev/next arrows + a counter, newest first.

- **Migration 0058:** drops the UNIQUE constraint on `ad_creatives.campaign_key` (one row per video now). Normalisation CHECK + lookup index preserved. **USER must run the SQL** (linked remote — `ALTER TABLE public.ad_creatives DROP CONSTRAINT IF EXISTS ad_creatives_campaign_key_key;`).
- `src/lib/services/ad-creatives-service.ts` — `getAdCreativeForCampaign` (singular, `.single()`) **renamed** → `getAdCreativesForCampaign` returns `AdCreative[]` (newest first). `getAdCreativesForCampaigns` batch now returns `Map<campaignKey, AdCreative[]>`.
- `src/components/campaigns/AdCreativeCarousel.tsx` — new reusable looping carousel: one `AdCreativePlayer` at a time, prev/next arrows (wrap), dot indicators + "n / total", optional per-video ad_name/notes (`showMeta`). `key={current.id}` forces clean remount per video so each autoplays. Single video → no arrows.
- `src/components/campaigns/CampaignPreviewModal.tsx` — prop `adCreative` → `adCreatives: AdCreative[]`; left column renders the carousel; duplicate ad_name/notes blocks removed (carousel owns them).
- `src/components/campaigns/CampaignAdCard.tsx` — prop `adCreative` → `adCreatives`; single-column carousel (max 320px), "N ads" count in header; `null` when empty.
- `src/components/campaigns/CampaignCard.tsx` + `CampaignListAsync.tsx` — pass `adCreatives` array from the `Map<key, AdCreative[]>`.
- `src/app/(dashboard)/campaigns/[id]/page.tsx` — `getAdCreativesForCampaign` (array) → `<CampaignAdCard adCreatives={…} />`.
- `src/app/(dashboard)/leads/[id]/page.tsx` — `getAdCreativesForCampaign` (array) → `LeadInfoCard adCreatives`.
- `src/components/leads/LeadInfoCard.tsx` — `adCreative` → `adCreatives: AdCreative[]`; `AttributionStrip` campaign trigger fires when `length > 0`; ad-name row matches `adCreatives.some(c => c.ad_name === lead.ad_name)`.
- `src/components/leads/CampaignVideoModal.tsx` — `adCreative` → `adCreatives`; renders `AdCreativeCarousel`; subtitle shows count when > 1.
- Admin UI unchanged — each upload already creates a new row, so adding N videos to one campaign now simply yields N rows (no UNIQUE collision).

---

## 2026-06-01 — Ad creatives admin: upload + manage UI (Phase 8)

Admin/founder can now upload campaign videos and manage `ad_creatives` rows from a dedicated page — previously the table was read-only with no write path.

- **Manual step (once):** create a public Supabase Storage bucket `ad-creatives` (authenticated write). Mirrors the `avatars` bucket setup. Not in a migration (buckets are created in the dashboard, same as avatars).
- `src/lib/validations/ad-creative-schema.ts` — `upsertAdCreativeSchema` (id optional → create vs update; campaign_key, video_url required+url, thumbnail_url/ad_name/notes optional) + `deleteAdCreativeSchema`; human-readable error codes.
- `src/lib/services/ad-creatives-service.ts` — `getAllAdCreatives()` added (newest-first list for the admin view; returns [] on error).
- `src/lib/actions/ad-creatives.ts` — `upsertAdCreative` (Zod → admin/founder guard → normalise campaign_key lowercase+trim → sanitizeText on ad_name/notes → adminClient INSERT or UPDATE; 23505 → friendly "already exists") + `deleteAdCreative` (admin/founder guard); both `revalidatePath('/admin/ad-creatives')` + `revalidatePath('/campaigns')`.
- `src/components/admin/AdCreativeFormModal.tsx` — `'use client'` modal composing `ui/modal.tsx`; video upload to `ad-creatives` bucket via browser client (mirrors `ProfileAvatarSection`), then `getPublicUrl` → `upsertAdCreative`; campaign dropdown (locked on edit); 100 MB / video-mime guard; live `<video>` preview.
- `src/components/admin/AdCreativesManager.tsx` — `'use client'` list with thumbnail + beautified title + edit/delete; optimistic local state (no refetch on save/delete); `window.confirm` before delete; Framer Motion staggered card entrance.
- `src/app/(dashboard)/admin/ad-creatives/page.tsx` — server orchestrator; admin/founder gate; parallel `getAllAdCreatives` + `getCampaignMetrics` (campaign names → dropdown, normalised + deduped).
- `src/components/layout/Sidebar.tsx` — "Ad Creatives" link (Film icon) added to `ADMIN_NAV` (gated to admin/founder via existing `isPrivileged`).

---

## 2026-06-01 — Campaign ad creative: preview modal on list page + inline card on detail page (Phase 8)

- `src/lib/utils/campaigns.ts` — `beautifyCampaignTitle(raw)` extracted; both consumers import from here; zero inline split/join occurrences remain.
- `src/lib/services/ad-creatives-service.ts` — `getAdCreativesForCampaigns(campaignNames[])` batch function; single `WHERE campaign_key = ANY(...)` query; returns `Map<campaignKey, AdCreative>`; never called in a loop.
- `src/components/campaigns/AdCreativePlayer.tsx` — reusable `'use client'` video primitive; `useEffect` cleanup calls `video.pause(); video.src = ''` to prevent audio bleed on navigation; `aspect-ratio: 9/16`, `max-height: 480px`, `object-fit: contain`.
- `src/components/campaigns/CampaignPreviewModal.tsx` — `'use client'` modal composing `ui/modal.tsx`; two-column layout when creative present (40% video / 60% info); single-column when absent; 2×3 metric grid; "Open Campaign →" navigates then closes; beautifyCampaignTitle for display.
- `src/components/campaigns/CampaignCard.tsx` — `adCreative?: AdCreative | null` prop; `previewOpen` state; `onClick` → modal (not direct router.push); modal rendered at JSX tail.
- `src/components/campaigns/CampaignListAsync.tsx` — calls `getAdCreativesForCampaigns` once after `getCampaignMetrics`; passes per-card creative from map; zero N+1.
- `src/components/campaigns/CampaignAdCard.tsx` — `'use client'`; composes `SectionCard`; `AdCreativePlayer` left (40%) + notes column right; Framer Motion entrance `opacity 0→1, y 8→0, 350ms ease-out-expo`; returns `null` when `adCreative` is null.
- `src/app/(dashboard)/campaigns/[id]/page.tsx` — `getAdCreativeForCampaign` awaited (parallel with no other blocking call); `beautifyCampaignTitle` imported from util; `<CampaignAdCard>` rendered between header and metrics strip.

---

## 2026-05-31 — Hotfix: get_gia_tasks 42703 when leads.slug missing

- `supabase/migrations/20260531000055_get_gia_tasks.sql` — `ALTER TABLE leads ADD COLUMN IF NOT EXISTS slug text` guard before the RPC (depends on migration 0045 for generator/trigger; column must exist for the SELECT).
- `supabase/migrations/20260531000056_get_gia_tasks_slug_prereq.sql` — repairs databases where 0055 ran before 0045: adds `slug` + partial unique index, backfills when `generate_lead_slug` exists, recreates `get_gia_tasks`.
- `supabase/migrations/20260530000045_lead_slug.sql` — idempotent `ADD COLUMN` / index; bulk backfill removed (was failing with `23505` on duplicate slugs) — backfill stays in 0046 collision-safe loop.
- `src/lib/services/tasks-service.ts` — logs `error.message` on `getGiaTasksForUser` failure (empty `{}` in console was hiding the Postgres detail).

---

## 2026-05-31 — Tasks page: Gia Tasks tab for GIA_DOMAINS agents + CreateGiaTaskModal (Phase 11)

Agents and managers in `GIA_DOMAINS` (`onboarding`, `house`, `shop`, `legacy`) now see a **Gia Tasks** tab as the first tab on `/tasks`. Non-Gia callers are unaffected.

- `supabase/migrations/20260531000055_get_gia_tasks.sql` — `get_gia_tasks(p_user_id, p_role, p_domain app_domain)` RPC; agent role scopes to `assigned_to = p_user_id`; manager+ scopes to `leads.domain = p_domain`; returns task columns + joined lead identity; `p_domain` typed `app_domain` (prevents `42883` post-migration-0041); STABLE SECURITY DEFINER.
- `src/lib/services/tasks-service.ts` — `getGiaTasksForUser(userId, role, domain)` wraps RPC via server client; exports `GiaTask` type (Task + lead identity fields).
- `src/lib/services/leads-service.ts` — `searchLeadsForTask(query, role, domain, userId)` added; ILIKE on first_name/last_name/phone; scoped by role; returns max 8 `LeadSearchResult`.
- `src/lib/validations/lead-schema.ts` — `SearchLeadsSchema` + `SearchLeadsInput` added.
- `src/lib/actions/leads.ts` — `searchLeadsAction` added: Zod → `getCurrentProfile()` → `searchLeadsForTask` scoped by caller; returns `{ data, error }`.
- `src/app/(dashboard)/tasks/page.tsx` — `TaskTab` type exported; `GIA_DOMAINS`-aware `validTabs` computed server-side; `?tab=gia` for non-Gia callers falls back to `validTabs[0]`; `AddTaskButton` receives `validTabs` prop.
- `src/app/(dashboard)/tasks/TasksAsync.tsx` — `gia` branch calls `getGiaTasksForUser`; `GiaTask[]` passed to `TasksShell`.
- `src/app/(dashboard)/tasks/TasksShell.tsx` — `giaTasks` + `giaCreateOpen` state; renders `GiaTasksTab` + `CreateGiaTaskModal` (with `AnimatePresence`) on `tab=gia`; task count shown in filter bar for Gia tab.
- `src/app/(dashboard)/tasks/TasksSkeleton.tsx` — `'gia'` added to `tab` prop union; `GiaTabSkeleton` with three date-grouped block skeletons.
- `src/components/tasks/AddTaskButton.tsx` — `validTabs: TaskTab[]` prop added; label map: `gia → 'Gia Task'`, `personal → 'My Task'`, `group → 'Group Task'`.
- `src/components/tasks/GiaDaySection.tsx` — date-group heading; label-micro style; 1px paper-border bottom rule.
- `src/components/tasks/GiaTaskRow.tsx` — completion circle + task-type icon (`var(--theme-accent)`) + lead name link (`/leads/[slug ?? id]`) + type label + due time; overdue in `var(--color-danger)`; completed at 0.5 opacity + strikethrough.
- `src/components/tasks/GiaTasksTab.tsx` — groups tasks by date bucket (local-clock keys, same pattern as `MyTasksCalendarView`); Framer Motion staggered section entrance; Playfair italic empty state; `TaskCompletionCircle` + `useTaskCompletionToggle` reused.
- `src/components/tasks/CreateGiaTaskModal.tsx` — composes `modal.tsx`; lead search (300ms debounce → `searchLeadsAction`); task type radio list; priority chips; `DatePicker showTime`; notes textarea; reuses `createLeadTaskAction` — no new action.
- `src/components/tasks/CLAUDE.md` — created with full component inventory for all tasks components.
- `src/app/(dashboard)/tasks/CLAUDE.md` — Gia tab architecture, domain-aware tab validation, RPC contract, `searchLeadsAction` scope rules documented.
- `docs/task-blueprint.md` — §1 routes/layout table updated; §15 new "Gia tab on /tasks" subsection; display surfaces table updated with `getGiaTasksForUser`.
- `supabase/migrations/CLAUDE.md` — migration 0055 entry added.

---

## 2026-05-31 — Lead dossier: Follow-up Tasks card moved above Team Notes

- `src/app/(dashboard)/leads/[id]/page.tsx` — `LeadTasksAsync` moved from page footer into the right column, above `LeadNotesInput`; bottom-of-page tasks block removed.
- `src/components/leads/LeadTasksCard.tsx` — compact body: `bodyPadding={false}`, scrollable list capped at `min(220px, 28vh)` so Team Notes and scratchpad keep their flex share.
- `src/components/leads/LeadTasksCardSkeleton.tsx` — padding and max-height aligned with the card.

---

## 2026-05-31 — Lead dossier task card — full task list + manual task creation (Phase 11)

Lead dossier now shows all Gia follow-up tasks (was: next task only) and allows manual task creation from the dossier.

- `supabase/migrations/20260531000054_create_lead_gia_task.sql` — `create_lead_gia_task` RPC: two-INSERT transaction (tasks + task_gia_meta) prevents orphaned rows; SECURITY DEFINER; GRANT to authenticated.
- `src/lib/services/tasks-service.ts` — `getAllLeadTasks(leadId)` added; starts from `tasks` (not `task_gia_meta`) with `!inner` join; active-first sort (JS secondary sort).
- `src/lib/validations/lead-schema.ts` — `CreateLeadTaskSchema` + `CreateLeadTaskInput` added.
- `src/lib/actions/leads.ts` — `createLeadTaskAction`: Zod → auth → lead access check → `create_lead_gia_task` RPC via adminClient → fire-and-forget `scheduleTaskReminder`; title derived from `TASK_TYPE_LABELS` (never hardcoded).
- `src/components/leads/CreateLeadTaskModal.tsx` — task type radio list, priority chips, `DatePicker showTime`, optional description textarea; calls `createLeadTaskAction`.
- `src/components/leads/LeadTasksCard.tsx` — client component; `SectionCard` shell; `TaskCompletionCircle` + `useTaskCompletionToggle`; prepends new task locally on create; overdue dates in `var(--color-danger)`; Playfair italic empty state.
- `src/components/leads/LeadTasksAsync.tsx` — async server component; only place calling `getAllLeadTasks`.
- `src/components/leads/LeadTasksCardSkeleton.tsx` — two-row skeleton (80%/60% widths).
- `src/app/(dashboard)/leads/[id]/page.tsx` — `LeadDossierTasksAsync` replaced with `<Suspense fallback={<LeadTasksCardSkeleton />}><LeadTasksAsync /></Suspense>`.

---

## 2026-05-31 — Notification sound

Synthesised C6/E6 chime via Web Audio API. No audio files. Fires on Realtime INSERT only (not on initial seed). 1500ms debounce gate. Autoplay-safe — silently skips when AudioContext is suspended. localStorage preference (`eia:notifications:sound:v1`, default on). Settings toggle added to profile Notification Preferences section.

---

## 2026-05-31 — Notification system redesign

Bell dot spring entrance (once on arrival, never loops), panel 400ms ease-out-expo entrance / 250ms exit, `--shadow-4` + `--theme-paper` surface, unread/read visual distinction (paper-subtle + shadow-1 vs transparent), item stagger at mount only (Realtime items skip stagger), GPU-only animations throughout.

---

## 2026-05-31 — Gia · Deals page

**Feature.** Deals page (`/deals`) — won leads with a non-null `deal_amount`, visible for all roles. Includes role-scoped list, summary strip, server-side filters, and pagination.

- `supabase/migrations/20260531000052_get_deals_summary.sql` — `get_deals_summary` RPC (SECURITY DEFINER STABLE): aggregate `total_deals`, `total_revenue`, `membership_count`, `retail_count`; same role/filter constraints as the list query.
- `src/lib/types/database.ts` — `DealFilters` type added (no `status` field — structural constraint).
- `src/lib/services/deals-service.ts` — `getDealsByRole` (role-scoped, pagination, single query + count), `getDealsSummary` (RPC wrapper); `DealWithAssignee`, `DealsResult`, `DealsSummary` types.
- `src/components/deals/DealsFilters.tsx` — search (500ms debounce), deal-type single-select, domain (admin/founder), agent (manager+), date range (applied to `status_changed_at`); `buildFilterParams` + `resetKeys: ['page']`.
- `src/components/deals/DealCard.tsx` — `motion.div` card; left (Playfair name + phone + domain badge), centre (deal-type + duration chips), right (Playfair accent amount + won date + agent). Links to `/leads/[slug ?? id]`.
- `src/components/deals/DealsSummaryStrip.tsx` — four stat cells (Total Deals, Total Revenue, Memberships, Retail); Playfair accent values; reuses `formatCount` + `formatCurrency`.
- `src/app/(dashboard)/deals/DealsAsync.tsx` — async server component; `Promise.all` for list + summary; renders `DealsSummaryStrip` + `DealCard` list + `LeadsPagination`.
- `src/app/(dashboard)/deals/DealsSkeleton.tsx` — 4 stat chip skeletons + 5 card row skeletons; stagger 0/80/160/240/320ms.
- `src/app/(dashboard)/deals/page.tsx` — thin orchestrator; calls `getLeadFilterOptions` once for agent dropdown; `parseFilters` enforces no `status` param; manager domain locked at service layer.
- `src/app/(dashboard)/deals/CLAUDE.md` — three invariants, `DealFilters` no-status rule, RPC param contract.
- `src/components/layout/Sidebar.tsx` — Deals nav item (`Trophy`, `/deals`) added to `MAIN_NAV` below Leads; visible for all roles.

**Phase:** Post-Lead-Hardening (Gia Deals).

---

## 2026-05-31 — Docs · task-blueprint aligned to current Tasks UI

**Docs.** `docs/task-blueprint.md` updated to match shipped Tasks: Leads-style page header + `AddTaskButton` / `TasksCreateProvider`; filter strip with **My Tasks / Group Tasks** accent tabs and `TasksFilters` (client-side via `task-client-filters.ts`); **MyTasksCalendarView** as the personal tab (calendar + date sections); `TaskCompletionCircle` / `useTaskCompletionToggle`; remark RPC auth (migration 00051); `SubTaskModal` parent callbacks. `PersonalTasksTab` documented as legacy/unmounted.

**Changed files:** `docs/task-blueprint.md`

---

## 2026-05-31 — Tasks · subtask modal syncs group list without refresh

**Tasks.** Status/priority/title changes in `SubTaskModal` only updated modal-local state — the expanded group card on `/tasks` and the workspace list/board stayed stale until a full page refresh. `onTaskUpdated` / `onTaskDeleted` callbacks now propagate successful writes to `GroupTasksTab` (subtask rows + `completed_count` / `subtask_count` on the group header) and `GroupTaskWorkspace` (list/board + refetch on close).

**Changed files:** `src/components/tasks/SubTaskModal.tsx`, `src/components/tasks/GroupTasksTab.tsx`, `src/components/tasks/GroupTaskWorkspace.tsx`

---

## 2026-05-31 — Tasks · personal task creation shows correct assignee

**Tasks.** `createPersonalTaskAction` already defaulted `assigned_to` to the creator on insert, but optimistic list rows used empty `assigned_to` / `created_by` placeholders and `SubTaskModal` on My Tasks never received an `assignee` prop — new tasks looked unassigned and the completion circle could be disabled until refresh. Action now returns `assignedTo` + `createdBy`; create/quick-add synthetic tasks use those values; `resolvePersonalTaskAssignee` feeds the modal from `task.assigned_to`.

**Changed files:** `src/lib/actions/tasks.ts`, `src/lib/utils/task-client-filters.ts`, `src/components/tasks/CreatePersonalTaskModal.tsx`, `src/components/tasks/PersonalTasksTab.tsx`, `src/components/tasks/MyTasksCalendarView.tsx`

---

## 2026-05-31 — Tasks · task remark posting fixed (RPC auth)

**Tasks.** Progress messages in `SubTaskModal` failed because `add_task_remark_with_status` ran via service role while the RPC gated on `auth.uid()` (always NULL). Migration `20260531000051`: RPC trusts the action layer; **view = post** — `addTaskRemarkAction` only posts if the user-scoped client can `SELECT` the task (tasks RLS). Agents now see tasks they created or are assigned to (`tasks_agent_select` adds `created_by`). `task_remarks` SELECT/INSERT mirror the same rule.

**Changed files:** `supabase/migrations/20260531000051_task_remark_rpc_auth_fix.sql` (new), `src/lib/actions/tasks.ts`, `src/lib/CLAUDE.md`

---

## 2026-05-31 — Tasks · SubTaskModal action item composer always visible

**Tasks.** Action Items no longer require entering edit mode to add rows. `ActionItemAddRow` sits at the bottom of the checklist with a dashed checkbox, focus wash, and accent **Add** chip on Enter or button press. Outside edit mode, new items persist immediately via `updateChecklistAction`; in edit mode they still batch with Save. Composer hidden when `canToggleTaskComplete` is false.

**Changed files:** `src/components/tasks/SubTaskModal.tsx`

---

## 2026-05-31 — Tasks · subtask row hover (circle only)

**Tasks.** Subtask row hover highlights only `TaskCompletionCircle` with a single `--theme-accent` border (removed Avatar-style double ring `box-shadow`). Group Tasks expanded rows no longer fade in or restyle the Open eye pill on row hover. Group task card header row hover highlights only `IconBox` — the Open workspace pill stays static (no border/background/color shift).

**Changed files:** `src/components/tasks/TaskCompletionCircle.tsx`, `src/components/tasks/GroupTasksTab.tsx`

---

## 2026-05-31 — Performance · default agent matches sidebar list order

**Performance.** The open agent on load was `roster[0]` from `getAgentRosterPerformance` (top performer by `leadsWon`). The sidebar lists agents A–Z (by domain on founder/admin). `getFirstAgentInPerformanceRosterList` + `buildPerformanceRosterGroups` in `performance-roster-display.ts` now drive `initialAgentId`, filter resets, and single-domain roster sort so the default selection is always the first row shown.

**Changed files:** `src/lib/utils/performance-roster-display.ts` (new), `src/app/(dashboard)/performance/ManagerPerformanceAsync.tsx`, `src/components/performance/ManagerPerformancePanel.tsx`

---

## 2026-05-31 — components/CLAUDE.md · side-edge accent strip rule documented

**Docs.** `src/components/CLAUDE.md` now has an explicit **Side-edge accent strips — forbidden** section. Rule: never use a coloured border on a single edge (`borderLeft`, `borderTop`, `borderRight`, `borderBottom`) as a category or status indicator. Use `PriorityBadge`, status pills (`TASK_STATUS`), semantic dots, icons, or count pills instead. Structural `1px --theme-paper-border` dividers between zones are fine — the ban is on semantic colour on one edge only. Reference implementation: `GroupTaskWorkspace` board column headers and list rows.

**Changed files:** `src/components/CLAUDE.md`

---

## 2026-05-31 — Tasks · tab selector left + accent variant

**Tasks.** Filter strip: `TabSelector` moved from right to left (before filters). New `TabSelector` `accent` variant — active tab uses `--theme-accent` fill + `--theme-accent-fg` label (replaces muted pill wash on the paper filter bar). `indicatorLayoutId="tasks-page-tabs"`.

**Changed files:** `src/app/(dashboard)/tasks/TasksShell.tsx`, `src/components/ui/TabSelector.tsx`, `src/app/(dashboard)/tasks/CLAUDE.md`

---

## 2026-05-31 — Group task workspace · no side-edge accent borders

**Tasks.** `GroupTaskWorkspace` list rows and board cards no longer use `borderLeft` priority strips; board column headers no longer use `borderTop` status accents. Priority uses `PriorityBadge` (list) or dot (board); column headers use a 6px status dot. Never-Do rule added (CLAUDE.md, `.cursorrules`, `The_Rules.md`, `components/CLAUDE.md`): no single-edge coloured borders as category/status indicators — use pills, dots, icons, or badges.

**Changed files:** `src/components/tasks/GroupTaskWorkspace.tsx`, `CLAUDE.md`, `.cursorrules`, `docs/The_Rules.md`, `src/components/CLAUDE.md`

---

## 2026-05-31 — My Tasks · calendar + date-grouped layout

**Tasks.** Personal tasks tab replaced with a two-panel calendar view. Left panel: sticky `Calendar` component (reused from `ui/Calendar.tsx`) with task-dot indicators per day; summary strip (due today / overdue / upcoming counts); quick-add trigger. Right panel: tasks grouped by date — TODAY (empty state: Playfair italic "Hooray.") → future dates ascending → OVERDUE → NO DATE. Clicking a calendar date scrolls to the matching section. Sticky section headers with colored dot + count pill. Priority left border (urgent → danger, high → warning, normal → paper-border). All existing behaviour preserved: completion toggle, SubTaskModal, quick-add row, CreatePersonalTaskModal, cursor pagination, filter support.

`TasksSkeleton` personal variant updated to match the new two-column layout.

**Changed files:** `src/components/tasks/MyTasksCalendarView.tsx` (new), `src/app/(dashboard)/tasks/TasksShell.tsx`, `src/app/(dashboard)/tasks/TasksSkeleton.tsx`

---

## 2026-05-31 — My Tasks calendar · day hover uses accent ring

**Tasks.** Calendar day cells (shared `ui/Calendar`) no longer use `paper-subtle` fill on hover; unselected days show the accent ring. Selected days keep accent fill. My Tasks date-section rows drop row background hover — completion circle ring only.

**Changed files:** `src/components/ui/Calendar.tsx`, `src/components/tasks/MyTasksCalendarView.tsx`

---

## 2026-05-31 — Performance · agent roster hover uses avatar ring only

**Performance.** Manager agent roster rows no longer use `paper-subtle` background or border on hover; hover mirrors selection via accent avatar ring, semibold name, and accent lead count (selected state unchanged).

**Changed files:** `src/components/performance/ManagerPerformancePanel.tsx`

---

## 2026-05-31 — Leads table · row hover highlights status pill

**Leads.** Table rows no longer use `paper-subtle` background on hover; the lead status pill gets the accent ring (same pattern as avatar / task completion circle). Toolbar summary pills unchanged.

**Changed files:** `src/components/leads/LeadsTable.tsx`

---

## 2026-05-31 — Tasks · row hover uses accent ring (no row fill)

**Tasks.** Group task headers highlight the icon box ring on hover (no row background). Subtasks and personal task rows highlight `TaskCompletionCircle` on hover — same accent ring as WhatsApp/avatar `selected`, no `paper-subtle` row fill. Applied in Group Tasks tab, workspace list, personal list, and calendar view.

**Changed files:** `src/components/tasks/TaskCompletionCircle.tsx`, `src/components/tasks/GroupTasksTab.tsx`, `src/components/tasks/GroupTaskWorkspace.tsx`, `src/components/tasks/PersonalTasksTab.tsx`, `src/components/tasks/MyTasksCalendarView.tsx`

---

## 2026-05-31 — WhatsApp · conversation list period filter

**WhatsApp.** Filter icon on the Conversations card header opens a period menu (Today, This Week, This Month, Custom + All). Filters server-side on `last_message_at` (IST presets via `whatsapp-period` utils); URL params `period`, `from`, `to`; list refetches on change; search respects the same range.

**Changed files:** `src/lib/constants/whatsapp-period.ts`, `src/lib/utils/whatsapp-period.ts`, `src/lib/services/whatsapp-service.ts`, `src/lib/actions/whatsapp.ts`, `src/lib/validations/whatsapp-schema.ts`, `src/components/whatsapp/WhatsAppConversationPeriodFilter.tsx`, `src/components/whatsapp/ConversationList.tsx`, `src/components/whatsapp/WhatsAppShell.tsx`, `src/app/(dashboard)/whatsapp/page.tsx`

---

## 2026-05-31 — WhatsApp · search in its own rail card

**WhatsApp.** Conversation search sits in a dedicated bordered card (`shadow-1`, padded bar only — no section header) above the conversations list; loading skeleton updated.

**Changed files:** `src/components/whatsapp/ConversationList.tsx`, `src/app/(dashboard)/whatsapp/loading.tsx`

---

## 2026-05-31 — WhatsApp · conversation row hover uses avatar ring only

**WhatsApp.** Conversation list rows no longer show paper-subtle background or border on hover; hover mirrors selection via accent avatar ring, semibold name, and accent trailing time.

**Changed files:** `src/components/whatsapp/ConversationRow.tsx`

---

## 2026-05-31 — WhatsApp · conversation list matches Performance agent roster

**WhatsApp.** Left-rail participant list uses the same card + row pattern as the Performance manager agent roster: bordered `shadow-1` panel with uppercase section label, `motion.button` rows (avatar ring when selected, staggered entrance), single-line name + mono trailing (relative time or “Resolved”). Loading skeleton aligned to the new layout.

**Changed files:** `src/components/whatsapp/ConversationList.tsx`, `src/components/whatsapp/ConversationRow.tsx`, `src/app/(dashboard)/whatsapp/loading.tsx`

---

## 2026-05-31 — WhatsApp · active conversation avatar ring

**WhatsApp.** Selected conversation row no longer uses accent background fill or left border; active state matches Performance agent roster — accent ring on the avatar via `Avatar selected`.

**Changed files:** `src/components/whatsapp/ConversationRow.tsx`

---

## 2026-05-31 — Tasks · completion circle (personal + group subtasks)

**Tasks.** Radio-style completion circle on personal task rows and group subtask rows (Group Tasks tab + workspace). Click toggles `completed` ↔ `to_do` via `updateTaskStatusAction` with optimistic UI; shared `TaskCompletionCircle`, `useTaskCompletionToggle`, and `canToggleTaskComplete` auth helper.

**Changed files:** `src/components/tasks/TaskCompletionCircle.tsx`, `src/hooks/useTaskCompletionToggle.ts`, `src/lib/utils/task-complete-auth.ts`, `src/components/tasks/PersonalTasksTab.tsx`, `src/components/tasks/GroupTasksTab.tsx`, `src/components/tasks/GroupTaskWorkspace.tsx`

---

## 2026-05-31 — SubTaskModal · two-zone grid layout (brief left, activity right)

## 2026-05-31 — Tasks · status & priority pill layout

**Tasks.** Group subtask rows: title left, aligned meta cluster (status + priority pills + assignee + due) on the right; pills share height and padding. SubTaskModal header: matching pill triggers with `TaskStatusIcon` on status.

**Changed files:** `src/components/tasks/GroupTasksTab.tsx`, `src/components/tasks/SubTaskModal.tsx`

---

## 2026-05-31 — Group tasks · inline subtask assignee + picker centering

**Tasks.** Inline “Add subtask” on Group Tasks tab defaults assignee to the creator (save works without opening the picker); `AssigneePickerModal` centered via flex shell so Framer Motion no longer clips the dialog.

**Changed files:** `src/components/tasks/GroupTasksTab.tsx`, `src/components/tasks/AssigneePickerModal.tsx`

---

## 2026-05-31 — Group tasks · priority-tinted expanded subtasks

**Tasks.** Removed per-subtask priority background fills on expanded Group Tasks rows — clean list on `--theme-paper-subtle` with hover to paper only.

**Changed files:** `src/components/tasks/GroupTasksTab.tsx`

---

## 2026-05-31 — TaskRemarksPanel · minimal composer

**Tasks.** Activity composer: placeholder “Write a progress.” (Playfair italic); textarea vertically aligned with 32px send control via matched line-height and padding.

**Changed files:** `src/components/tasks/TaskRemarksPanel.tsx`, `src/components/tasks/SubTaskModal.tsx`

---

## 2026-05-31 — SubTaskModal · Action Items on personal tasks

**Tasks.** Action Items checklist (attachments) now shown in `SubTaskModal` for personal tasks as well as group subtasks — toggle in view mode, edit/reorder in edit mode.

**Changed files:** `src/components/tasks/SubTaskModal.tsx`

---

## 2026-05-31 — SubTaskModal · two-zone grid layout (brief left, activity right)

**Tasks.** SubTaskModal restructured as a 2×2 CSS grid: row 1 aligns Zone A (title, description, status, priority) with Zone B (edit/delete/close icons); row 2 pairs Zone A scroll body with `TaskRemarksPanel` so messages start level with details — no full-width header rule. `TaskRemarksPanel` gains `embedded` prop for softer message cards and composer padding in zone B. Group-task breadcrumb pill removed from the Zone A header.

**Changed files:** `src/components/tasks/SubTaskModal.tsx`, `src/components/tasks/TaskRemarksPanel.tsx`

---

## 2026-05-31 — SubTaskModal · semantic header icon colours

**Tasks.** SubTaskModal header actions (edit, delete, close) each use design-token semantic colours at rest: `--theme-accent` gold for edit (not accent-muted), danger light/text for delete, tertiary on paper-subtle for close.

**Changed files:** `src/components/tasks/SubTaskModal.tsx`

---

## 2026-05-31 — WhatsApp · split layout (title left, messages full height)

**WhatsApp.** and the conversation list stay in the left rail with standard `p-8` top/left inset + `mb-6` under the title. The right message pane starts at the **top of the screen** (not below the title). `ConversationPanel` contact header uses `padding: var(--space-8)` top/sides so avatar and name have the same breathing room as other primary pages.

**Changed files:** `src/app/(dashboard)/whatsapp/page.tsx`, `src/app/(dashboard)/whatsapp/loading.tsx`, `src/components/whatsapp/WhatsAppShell.tsx`, `src/components/whatsapp/ConversationPanel.tsx`, `src/components/whatsapp/ConversationList.tsx`, `src/components/whatsapp/ConversationRow.tsx`

---

## 2026-05-31 — WhatsApp · seamless left-panel search

Removed the hard rules around the conversation search so it sits flush under the title: no 1px divider before the list, and `SearchBar` `variant="soft"` (transparent border at rest, accent ring on focus only).

**Changed files:** `src/components/whatsapp/ConversationList.tsx`, `src/components/ui/SearchBar.tsx`

---

## 2026-05-31 — TimePicker · premium scroll wheel (shared across app)

Rebuilt `TimePicker.tsx` as the single source of truth for time selection.

**Wheel UX:** iOS-style dead-scroll columns for hours (1–12) and minutes (00–59, every minute — no 5/15-min steps). Centre selection band with top/bottom fade masks; items scale and fade by distance from centre; snap + smooth settle on scroll end.

**Exports:** `TimePicker` (standalone trigger + popover), `TimePickerWheelPanel` (`variant="embedded"` for DatePicker side panel, `standalone` for popover body).

**Consistency:** `DatePicker` `showTime` now composes `TimePickerWheelPanel` — duplicate scroll/toggle code removed from `DatePicker.tsx`. Agent settings `TimePicker` callers pick up the new wheel automatically.

**Changed files:** `src/components/ui/TimePicker.tsx`, `src/components/ui/DatePicker.tsx`

---

## 2026-05-31 — DatePicker · portal + viewport flip inside modals

Fixed: opening the due-date picker in **New Task** (and other modals) required scrolling the modal body to see the full calendar — the popover was `position: absolute` inside the dialog's `overflow: auto` body.

**New behaviour:** popover renders via `createPortal` to `document.body` with `position: fixed`, viewport-aware flip (up/down + left/right), and `--z-modal-nested` so it stacks above modal chrome. When `showTime` is set, calendar and time picker sit **side-by-side** (date left, time right) so panel height matches date-only mode (~320px) instead of stacking ~480px tall.

**Changed files:** `src/components/ui/DatePicker.tsx`

---

## 2026-05-31 — Tasks · Group task row redesign + SubTaskModal status/priority in Zone A

**Group task row (`GroupTasksTab.tsx`):** Replaced identity-block header with flat card design — `rounded-2xl` paper card with `--shadow-1` border; collapsed header row with `ChevronRight` (rotates 90° when expanded), 32×32 accent-tinted `IconBox`, Playfair 15px title, gold "Workspace" pill, member avatars (max 4), 128px progress bar with % label, "X/Y done" count, and `DueDateChip`; subtask rows with status badge, title, 24×24 initials circle, priority badge, due chip, and eye button revealed on hover. All hex violations fixed: `SUBTASK_STATUS_PASTEL` replaced with CSS token pairings; `color-mix()` used for alpha accent tints.

**`task-constants.ts` fixes:** `TASK_PRIORITY.high.color` corrected from phantom `--theme-warning` → `var(--color-warning)`. `TASK_STATUS` pill pairings fixed for `in_review`, `completed`, `error` — switched from saturated fills (dark-on-dark) to `-light` bg + `-text` pairing.

**SubTaskModal — status/priority moved to Zone A:** Status and priority controls removed from modal header. Both now appear in the Key Variables section (section 4) of Zone A as interactive inline selectors — icon + label left, interactive pill right; dropdowns open **upward** (`bottom: calc(100% + var(--space-1))`) to avoid clipping.

**Changed files:** `src/components/tasks/GroupTasksTab.tsx`, `src/lib/constants/task-constants.ts`, `src/components/tasks/SubTaskModal.tsx`

---

## 2026-05-31 — Live Lead Activity widget · role-scoped visibility

Fixed: admin/founder saw "No activity yet" on the dashboard Live Lead Activity widget because the underlying query filtered by `actor_id = userId` (their own account — they never log calls themselves).

**New behaviour:** admin/founder see all `lead_activities` (cross-domain); manager sees activities on leads in their domain; agent sees only their own activity (unchanged).

**Changed files:**

- `supabase/migrations/20260531000050_dashboard_activity_role_scoped.sql` — rewrites the `agent_activity` CTE in `get_dashboard_summary` with a role-aware `CASE` filter
- `src/lib/services/dashboard-service.ts` — `getAgentRecentActivity` now accepts `role` + `domain` params for the widget refresh-button path
- `src/lib/actions/dashboard.ts` — `getAgentRecentActivityAction` passes verified `profile.role` + `profile.domain`
- `src/components/dashboard/widgets/AgentActivityWidget.tsx` — Realtime subscription removes `actor_id` filter for admin/founder so live updates arrive for all activity

---

## 2026-05-31 — Sidebar · Performance under Analytics

Moved Performance from main nav into the Analytics section (above Campaigns). Agents see Analytics with Performance only; manager/admin/founder see Performance + Campaigns.

**Changed files:** `src/components/layout/Sidebar.tsx`

---

## 2026-05-31 — Tasks filter bar · tab-aware client-side filters

Added standard paper filter strip below My Tasks / Group Tasks tabs. Create button moved to page header (Leads pattern) via `AddTaskButton` + `TasksCreateProvider`. `TasksFilters` swaps controls by tab: **My Tasks** — search, tags, status, priority; **Group Tasks** — search, status, priority, domain (admin/founder), progress (in progress / complete / no subtasks). All filtering is client-side via `lib/utils/task-client-filters.ts` — no extra server fetches; tag list still loads once when personal tab is active. Personal tag pill row removed from `PersonalTasksTab` (moved to filter bar).

**Changed files:** `src/components/tasks/TasksFilters.tsx` (new), `src/lib/utils/task-client-filters.ts` (new), `src/app/(dashboard)/tasks/TasksShell.tsx`, `PersonalTasksTab.tsx`, `GroupTasksTab.tsx`, `src/app/(dashboard)/tasks/CLAUDE.md`

---

## 2026-05-31 — Settings filter bar · search, domain, pool

Replaced domain pill tabs with standard paper filter strip: `SlidersHorizontal` + active-count badge, `SearchBar` (name/title), `FilterDropdown` domain (admin/founder, domains present in roster), pool status select (all / in pool / out of pool), agent count. Client-side filtering via `useMemo`. Empty state copy matches Team page pattern.

**Changed files:** `src/components/settings/AgentSettingsTable.tsx`, `src/app/(dashboard)/settings/CLAUDE.md`

---

## 2026-05-31 — Admin Team filter bar · sliders icon

Team page filter strip gains `SlidersHorizontal` + accent active-filter badge (search, role, domain), matching leads filter chrome.

**Changed files:** `src/components/admin/UsersTable.tsx`

---

## 2026-05-31 — Campaigns filter bar · domain selector + DRY with leads

Campaigns filter row aligned with leads: `FilterDropdown` domain (admin/founder, `GIA_DOMAIN_FILTER_ITEMS`), `SearchBar` (500ms debounce, URL `search`, filters `campaign_name` in service), `DatePicker` date range, sliders icon + active-count badge, clear filters. Shared URL helpers extracted to `lib/utils/filter-params.ts` (`buildFilterParams`, `dateFromUrlParam`, `dateToUrlParam`); `LeadsFilters` refactored to consume them. `parseGiaDomainParam()` used in `campaigns/page.tsx`.

**Changed files:** `src/lib/utils/filter-params.ts` (new), `src/components/campaigns/CampaignFilters.tsx`, `src/components/leads/LeadsFilters.tsx`, `src/lib/types/database.ts`, `src/lib/services/leads-service.ts`, `src/app/(dashboard)/campaigns/page.tsx`, `src/app/(dashboard)/campaigns/CLAUDE.md`

---

## 2026-05-31 — Performance filter bar · aligned with leads/campaigns (DRY)

Replaced `PerformancePeriodSelector` + `PerformanceClearButton` with unified `PerformanceFilters`: sliders icon, active-count badge, `SearchBar` (manager/founder/admin, 500ms debounce, URL `search`), period `FilterDropdown`, custom date pickers, clear filters. Uses `buildFilterParams` from `lib/utils/filter-params.ts`. Agent roster filters by name client-side in `ManagerPerformancePanel`. Filter strip uses same paper/border classes as leads and campaigns. Agent self-view omits search.

**Changed files:** `src/components/performance/PerformanceFilters.tsx` (new), deleted `PerformancePeriodSelector.tsx`, `ManagerPerformancePanel.tsx`, `src/app/(dashboard)/performance/page.tsx`, `src/app/(dashboard)/performance/CLAUDE.md`

---

## 2026-05-31 — Performance roster · remove selected agent left accent bar

Selected agent card no longer renders the 3px left accent stripe or accent surface fill; selection shown via semibold name, accent lead count, and avatar ring only. Fixed sticky hover fill when switching agents — hover uses React state (`showHover = hovered && !isSelected`) instead of imperative `style` mutation that skipped clear on mouse leave while selected.

**Changed files:** `src/components/performance/ManagerPerformancePanel.tsx`

---

## 2026-05-31 — Performance page · domain filter removed from filter bar

Founder/admin filter bar no longer shows `FounderDomainTabs` / `?domain=` URL state. Period + custom dates only. Cross-domain roster unchanged (`allDomains={true}`); domain narrowing stays on the agent list via `ManagerPerformancePanel` popover (sliders icon). `FounderDomainTabs.tsx` deleted. `getDomainsWithLeads` no longer called from `page.tsx` for tab population.

**Changed files:** `src/app/(dashboard)/performance/page.tsx`, `FounderPerformanceShell.tsx`, `src/components/performance/PerformancePeriodSelector.tsx`, `src/app/(dashboard)/performance/CLAUDE.md` (deleted `FounderDomainTabs.tsx`)

---

## 2026-05-31 — Leads table · toolbar status pills use lead-status tokens

Table header status summary pills no longer use retired generic variants (`neutral` / `accent` / `success` / `danger`). Each non-zero status on the current page renders a pill with `LEAD_STATUS_BADGE` → `.status-pill--lead-*` and design-token `--status-*` colours. Per-status counts replace the old aggregated Active/Lost groupings.

**Changed files:** `src/components/leads/LeadsTable.tsx`

---

## 2026-05-31 — Leads page · domain filter (admin/founder)

Domain filter added to the leads filter bar as a `FilterDropdown` (same pattern as Source/Campaign). URL param `domain`; validated via `parseGiaDomainParam()`. Items from `GIA_DOMAIN_FILTER_ITEMS`. Server: `getLeadsByRole` applies `.eq('domain', …)` for admin/founder when set; managers unchanged. `getLeadFilterOptions` scopes campaign + agent lists when a domain is selected. Changing domain clears `agent_id` and `campaign`.

**Changed files:** `src/lib/constants/domains.ts`, `src/lib/types/database.ts`, `src/lib/services/leads-service.ts`, `src/components/leads/LeadsFilters.tsx`, `src/components/leads/LeadsTableAsync.tsx`, `src/app/(dashboard)/leads/page.tsx`, `src/app/(dashboard)/leads/CLAUDE.md`

---

## 2026-05-31 — Gia domain registry (`GIA_DOMAINS`) + canonical labels

Split platform domains from Gia module domains. `APP_DOMAINS` remains the full enum for user management (profiles, admin create/edit). `GIA_DOMAINS` is the four active sales domains: `onboarding`, `house`, `shop`, `legacy`. Canonical display names via `DOMAIN_LABELS` only — **Onboarding**, **Indulge House**, **Indulge Shop**, **Indulge Legacy** (`legacy` label updated from "Legacy"). Removed all local `FEATURED_DOMAINS` / `DOMAIN_SHORT` maps from dashboard widgets and campaigns filter. Gia pickers (leads, campaigns, performance, dashboard widgets, group task domain select) now import `GIA_DOMAINS` only. Rule **Q-17** added to `docs/The_Rules.md`.

**Changed files:** `src/lib/constants/domains.ts`, `docs/The_Rules.md`, `src/lib/validations/lead-schema.ts`, `src/lib/validations/profile-schema.ts`, `src/lib/actions/dashboard.ts`, `src/components/dashboard/widgets/ManagerLead*.tsx`, `ManagerCampaignWidget.tsx`, `src/components/campaigns/CampaignFilters.tsx`, `src/components/leads/AddLeadModal.tsx`, `src/components/performance/FounderDomainTabs.tsx`, `ManagerPerformancePanel.tsx`, `src/app/(dashboard)/performance/page.tsx`, `src/components/tasks/CreateGroupTaskModal.tsx`, `AssigneePickerModal.tsx`, `src/lib/CLAUDE.md`, `src/components/CLAUDE.md`

---

## 2026-05-31 — Performance page · Filter bar clear button

Added a "Clear" button at the far right of the performance filter bar. Visible only when any filter deviates from the default state (period ≠ `this_month`, or domain set, or custom from/to dates present). Clicking it navigates to `/performance` with no params, resetting all filters to defaults. Animates in/out with `scale + opacity`. Hover state goes danger-coloured to signal destructive intent. Present across all three role views (agent, manager, founder/admin).

**Changed files:** `src/components/performance/PerformancePeriodSelector.tsx` (added `PerformanceClearButton` export), `src/app/(dashboard)/performance/page.tsx`

---

## 2026-05-31 — Performance page · Filter bar — period and domain as dropdowns

Period selector and domain selector in the performance filter bar replaced from `TabSelector` pill tabs to `FilterDropdown` dropdowns, consistent with the leads page filter row.

- `PerformancePeriodSelector` — now renders a `FilterDropdown` with `Calendar` icon and single-select behaviour. Custom date pickers still appear inline when "Custom" is selected.
- `FounderDomainTabs` — renamed conceptually; now renders a `FilterDropdown` with `Building2` icon and single-select behaviour. Domain ordering preserved.
- Separator `<span>` between the two removed from `page.tsx` (not needed between two compact dropdowns).
- Both components preserve all existing URL-param write behaviour unchanged.

**Changed files:** `src/components/performance/PerformancePeriodSelector.tsx`, `src/components/performance/FounderDomainTabs.tsx`, `src/app/(dashboard)/performance/page.tsx`

---

## 2026-05-31 — Performance page · Roster panel redesign

Roster left panel overhauled for clarity and domain awareness.

- **Header**: "Team / Conv." labels replaced with "Agents" + a `SlidersHorizontal` filter icon (shown only in founder/admin all-domains mode). Filter icon highlights when a domain filter is active.
- **Domain filter popover**: clicking the filter icon opens an inline popover listing all domains that have agents. Selecting a domain filters the list client-side (no refetch). "All domains" resets the filter. Active selection gets a `Check` icon and accent colour.
- **Grouping**: in all-domains mode (founder/admin) agents are grouped by domain in canonical order (onboarding → shop → house → legacy → …). A subtle section label appears between groups. When filtered to one domain, the section label is suppressed.
- **Sorting**: within each domain group, agents are sorted A-Z by full name. The previous performance-rank sort is removed.
- **Card**: rank number removed. Conversion rate removed. Right side now shows only the total leads count (mono, accent-coloured when selected) based on the selected time period.
- **Stagger cap**: entrance animation stagger capped at 280ms so large rosters don't feel slow.
- **Scroll**: roster list scrollable (`maxHeight: 600px`) so it doesn't push the page when there are many agents.

**Changed file:** `src/components/performance/ManagerPerformancePanel.tsx`

---

## 2026-05-31 — Performance page · Founder/admin all-domains agent roster

For founder and admin roles, the left agent roster now shows all agents across every domain (onboarding, shop, house, legacy, concierge, etc.) rather than only agents from the currently-selected domain tab. Each agent card displays a domain badge so origin is still visible at a glance. The right detail panel fetches metrics globally for the selected agent (no domain restriction). Manager view is unchanged — still scoped to their own domain.

**Changed files:**

- `src/lib/types/index.ts` — `AgentRosterRow` gains `domain: AppDomain` field
- `src/lib/services/performance-service.ts` — `getAgentRosterPerformance` accepts `AppDomain | null`; null = all domains. `getAgentDetailMetrics` domain param made optional (`AppDomain | null`)
- `src/lib/actions/performance.ts` — `getAgentDetailMetricsAction` accepts `domain: AppDomain | null`; manager guard still enforces own-domain
- `src/app/(dashboard)/performance/ManagerPerformanceAsync.tsx` — new `allDomains?: boolean` prop; passes null domain to roster/detail when true
- `src/app/(dashboard)/performance/FounderPerformanceShell.tsx` — passes `allDomains={true}` to `ManagerPerformanceAsync`
- `src/components/performance/ManagerPerformancePanel.tsx` — new `allDomains?: boolean` prop; passes `showDomain` to `AgentCard`; domain badge per card in all-domains mode
- `src/components/performance/AgentDetailPanel.tsx` — domain prop widened to `AppDomain | null`; header label falls back to `agent.domain` when no domain override

---

## 2026-05-31 — Performance page · Fix zero scores bug

All performance metrics (`leadsWon`, `conversionRate`, `touchRate`) were showing zero because they filtered leads by `created_at` within the selected period. In production, agents work leads created in prior periods — e.g. a lead from March marked won in May would never appear in "This Month" stats.

**Root cause:** `_getCoreFourMetricsForRange`, `getAgentRosterPerformance`, `getTeamBenchmarks`, and `getAgentDetailMetrics` all used `created_at >= from AND created_at <= to` for won/lost queries.

**Fix (`src/lib/services/performance-service.ts`):**

- `leadsWon`: now filters by `status_changed_at` (when the lead _became_ won), not `created_at`
- `conversionRate`: now filters closed leads (won + lost) by `status_changed_at`
- `touchRate`: intentionally kept on `created_at` — it measures what % of new-period leads were touched (cohort metric)
- `getAgentRosterPerformance`: split into two queries — cohort total via `created_at`, won/lost via `status_changed_at`
- `getAgentDetailMetrics`: added a separate won-leads query by `status_changed_at`; pipeline breakdown still uses the `created_at` cohort

---

## 2026-05-31 — Leads · Won deal capture flow

When marking a lead as Won, the user now goes through a two-step modal instead of a single confirm. Step 1 selects deal type (Membership or Retail). Step 2 captures duration (Membership only: 3 Months / 6 Months / 1 Year) and deal amount (₹). The deal is written atomically before the status is changed to Won.

**`supabase/migrations/20260531000049_leads_deal_duration.sql`**

- Adds `deal_duration text` column to `leads` (nullable)
- Adds `leads_deal_type_check` CHECK constraint (`membership | retail`) if absent
- Adds `leads_deal_duration_check` CHECK constraint (`3_months | 6_months | 1_year | NULL`)

**`src/lib/constants/deal-types.ts`** _(new)_

- `DEAL_TYPES`, `DealType`, `DEAL_TYPE_LABELS`
- `DEAL_DURATIONS`, `DealDuration`, `DEAL_DURATION_LABELS`

**`src/lib/types/database.ts`**

- `deal_duration: string | null` added to leads Row / Insert / Update
- `Lead` type now has `deal_type: DealType | null` and `deal_duration: DealDuration | null` (narrowed from `string | null`)

**`src/lib/validations/lead-schema.ts`**

- `RecordDealSchema` + `RecordDealInput` — validates deal_type, deal_duration (required when membership), deal_amount (positive, ≤ 100M)

**`src/lib/actions/leads.ts`**

- `recordDeal` — Zod → auth → access check → UPDATE deal fields → calls `updateLeadStatus('won')`

**`src/components/leads/WonDealModal.tsx`** _(new)_

- Two-step modal: type selection slide → details slide (duration chips + amount input)
- Composes `ui/modal.tsx`. Zero hardcoded colours. All tokens.

**`src/components/leads/StatusActionPanel.tsx`**

- Won button now opens `WonDealModal` instead of a plain `ConfirmModal`
- `fireDeal()` handler calls `recordDeal` action

---

## 2026-05-31 — Dashboard · widget resize control (height + width)

Users can now resize any dashboard widget while in Edit Layout mode. Clicking the size label in the edit overlay opens a popover with four height tiers and a half/full width toggle. Preferences are persisted per-user in localStorage alongside the existing layout order.

**`src/lib/constants/dashboard-widgets.ts`**

- `WIDGET_HEIGHT_BY_SIZE` — single source of truth for widget container heights (`sm: 200px`, `md: 300px`, `lg: 420px`, `xl: 540px`)
- `WIDGET_SIZE_LABELS` — display labels for each tier (Compact / Standard / Tall / Full)

**`src/hooks/useDashboardLayout.ts`**

- `WidgetPlacement` extended with `colSpan: WidgetColSpan` (previously fixed to widget definition, now user-adjustable per placement)
- `resizePlacement(widgetId, size, colSpan)` added — atomically persists both height tier and column span
- `sanitizeStored` upgraded to hydrate `colSpan` from stored data (falls back to widget definition default for older stored layouts)
- `addWidget`, `reorderWidgets` updated to include `colSpan` in every placement they construct

**`src/components/dashboard/DashboardWidgetSlot.tsx`**

- `WidgetProps` gains optional `size?: WidgetSize` — passed down so each widget can set its container height from `WIDGET_HEIGHT_BY_SIZE[size]`
- `onResize` prop added — fires `resizePlacement` from the canvas
- `ResizePopover` — new inline component; renders a size-label trigger button + dropdown panel with four height rows (showing pixel value) and half/full width toggle; closes on outside click or Escape; zero `backdrop-filter`, zero hardcoded hex

**`src/components/dashboard/DashboardCanvas.tsx`**

- `SortableWidget` now reads `size` and `colSpan` from the placement record (not the widget definition) — user overrides take effect immediately
- `onResize` wired through canvas → sortable widget → slot

**`src/components/dashboard/WidgetSkeleton.tsx`**

- Switched from local `SIZE_MIN_HEIGHTS` to `WIDGET_HEIGHT_BY_SIZE` so skeleton and widget sizes are always in sync

**All 5 widgets** (`AgentTasksWidget`, `AgentActivityWidget`, `ManagerLeadStatusWidget`, `ManagerLeadVolumeWidget`, `ManagerCampaignWidget`)

- Accept optional `size` prop; container height driven by `WIDGET_HEIGHT_BY_SIZE[size]` instead of hardcoded pixel values

---

## 2026-05-31 — Performance · agent profile card redesign

UI-only redesign of the agent detail panel and roster list on the manager/founder performance page. Zero business logic or data changes.

**`AgentDetailPanel.tsx`** (`src/components/performance/AgentDetailPanel.tsx`)

- **Identity zone** — flat header replaced with a dedicated card: `Avatar size="lg"` with accent ring + live-state pip (success dot), Playfair name, accent-surface domain badge, and conversion rate numeral right-anchored with colour-coded tone (success/warning/danger).
- **Key metrics grid** — horizontal stat strip replaced with a `3-column CSS grid` of `StatAtom` cells. Calls Today / New Leads / Follow-ups in the first row at `--text-xl`; Leads Won and Revenue in the second row at `--text-2xl` on `--theme-accent-surface` accent backgrounds to signal the two primary outcomes. All values in Playfair Light.
- **Pipeline bar** — bar height reduced to `10px` with `--radius-full` overflow for a refined pill look; legend converted from raw text pairs to compact rounded chip pills (`--theme-paper-subtle + --theme-paper-border`), each showing status name + count + percentage.
- **Loading skeletons** — per-section `AnimatePresence mode="wait"` replaces the single opacity-dimming approach; skeletons match the real layout shape exactly so no layout shift occurs on data arrival.
- **Error state** — inline danger card (`--color-danger-light` bg + border) replacing raw `<p>` text.
- **`SectionCard` local wrapper** — titled content card for pipeline and deal-breakdown sections. Chrome: `--theme-paper + --shadow-1 + --radius-lg`, matching established section-card conventions.

**`ManagerPerformancePanel.tsx`** (`src/components/performance/ManagerPerformancePanel.tsx`)

- **`AgentCard`** — converted from plain `<button>` to `motion.button` with `x: -8 → 0` staggered entrance (40ms per row). Active left indicator: 3px × 20px `--theme-accent` pill at the left edge (matches sidebar active-pill convention). Conversion rate rendered as a mono numeral (colour-coded) rather than a filled pill badge — cleaner at small sizes.
- **`RosterHeader`** — new two-column micro-label row ("TEAM" left, "CONV." right) above the roster with a `--theme-paper-border` hairline separator.
- **Panel exit animation** — `AnimatePresence` transition extended with `y: -4` exit to complement the `y: 6` entrance (was opacity-only).

---

## 2026-05-31 — Dashboard · bento grid layout redesign

- `DashboardCanvas.tsx` — 2-column rigid grid replaced with a 12-column CSS bento grid (`repeat(12, 1fr)`). Half-width widgets (`colSpan: 1`) occupy 6 columns; full-width widgets (`colSpan: 2`) occupy all 12. Below 820 px all widgets collapse to full-width (single column). Drag-to-reorder updated to `rectSortingStrategy` (was `verticalListSortingStrategy`) for correct 2D grid dragging.
- `dashboard-widgets.ts` — `WidgetColSpan` type added; `colSpan` field added to `WidgetDefinition`; `agent-tasks`, `agent-activity`, `manager-lead-status`, `manager-lead-volume` → `colSpan: 1`; `manager-campaigns` → `colSpan: 2` (chart needs full width).
- `DashboardWidgetSlot.tsx` — `colSpan: WidgetColSpan` prop added; root container given `height: 100%` so widgets fill their bento cell.
- `WidgetSkeleton.tsx` — switched from fixed `height` to `minHeight` + `height: 100%` so the skeleton fills the cell rather than being a fixed box.
- `AgentActivityWidget.tsx` — removed hardcoded `VIEWPORT_HEIGHT = 220` constant; ticker viewport now uses `flex: 1` + `minHeight: 160px` to fill remaining widget height; `viewportRef` added so the scroll tick reads the actual measured height.
- `ManagerCampaignWidget.tsx` — outer container `height: 100%`; chart container gains `flex: 1` and `minHeight: 260px`; chart height bumped from 260 to 300 px (benefits from full-canvas width).
- `ManagerLeadVolumeWidget.tsx` — outer container `minHeight: 340px` + `height: 100%`; chart container uses `flex: 1` + `minHeight: 180px`; `ResponsiveContainer` height changed from `180` to `"100%"` so the chart expands with available vertical space; `ChartEmpty` uses `height: 100%`.
- `ManagerLeadStatusWidget.tsx`, `AgentTasksWidget.tsx` — `height: 100%` added so cards stretch to match the tallest sibling in the same grid row.

---

## 2026-05-31 — UI · micro-animation pass — interactive components

GPU-only micro-animations added to six small UI components. All animations use `transform` and `opacity` exclusively — no layout properties touched. `willChange: 'transform'` set only on elements that move. Zero impact on initial render or data-fetching paths.

**`BackButton`** (`src/components/ui/BackButton.tsx`)

- Converted from plain `<Link>` to `motion(Link)`. Mounts with `x: -6 → 0, opacity: 0 → 1` (150ms, ease-out-expo).
- Hover: whole button nudges `x: -2` + `scale 1.05`; inner arrow nudges an additional `x: -1` (layered directional signal).
- Tap: `scale 0.93` spring. `willChange: 'transform'` on the link element.

**`ChecklistItem`** (`src/components/ui/ChecklistItem.tsx`)

- Square ↔ CheckSquare icon crossfades via `AnimatePresence mode="wait"` — `scale 0.6 → 1, opacity 0 → 1` (150ms, ease-out-expo) on both enter and exit. Never two icons in DOM simultaneously.
- Tap: `motion.button` `whileTap scale 0.85` spring on the toggle button.

**`InfoRow` copy button** (`src/components/ui/InfoRow.tsx`)

- Copy ↔ Check icon crossfades via `AnimatePresence mode="wait"` — `scale 0.5 → 1` (150ms). Confirms the copy action with a satisfying pop.
- Tap: `whileTap scale 0.8` on the copy button itself.

**`EditButton`** (`src/components/ui/EditButton.tsx`)

- Converted to `motion.button`. Pencil icon rotates `0 → -8°` on hover (150ms, ease-out-expo) — suggests "ready to edit".
- Tap: `whileTap scale 0.88`.
- Props interface narrowed: explicit `onClick, onMouseEnter, onMouseLeave, onFocus, onBlur, disabled, className` — avoids `...rest` spread conflict with Framer Motion prop types.

**`ListRow`** (`src/components/ui/ListRow.tsx`)

- Chevron wraps in `motion.span`; animates `x: 0 → 2` on hover (150ms) — directional nudge signals the row is navigable.
- Background hover state moved from imperative `style.setProperty` to reactive `hovered` state — consistent with the rest of the library.

**`SearchBar`** (`src/components/ui/SearchBar.tsx`)

- Clear × button wrapped in `AnimatePresence`; fades + scales in (`scale 0.7 → 1`) when text is present, out when cleared or tapped.
- Tap: `whileTap scale 0.8`.

**`MotionButton` — first real consumers wired**

- `AddLeadButton.tsx` — switched from `Button` to `MotionButton` + `MOTION_BUTTON_DEFAULTS` (spring tap `scale 0.97`). Primary CTA pressed repeatedly by agents.
- `TasksShell.tsx` — "+ My Task / + Group Task" header button switched to `MotionButton` + `MOTION_BUTTON_DEFAULTS`.
- All other `Button` callers (form submits, modal footers, auth pages) remain on plain `Button` — tap animation is unnecessary and would add Framer bundle cost on those pages.

**Architecture rule confirmed:** `Button` (CSS hover, zero Framer cost) is correct for form submits and modal actions. `MotionButton` is correct for standalone primary CTAs that users tap repeatedly. Never merge them.

---

## 2026-05-31 — Leads · Called modal outcome picker

- `CalledModal.tsx` — native `<select>` for call outcome replaced with `FilterDropdown` (single-select), matching the filter bar and task tag pickers.

---

## 2026-05-31 — Performance · unified filter bar + custom date range

- `page.tsx` — filter bar unified across all roles: period selector + (founder/admin) domain tabs rendered in a single `--theme-paper` strip, replacing the two-zone layout (domain tabs below period selector). Custom date params `?from=` and `?to=` parsed from URL and threaded through to all async components.
- `PerformancePeriodSelector.tsx` — "Custom" tab added; selecting it reveals two inline `DatePicker` components (From → To) with `AnimatePresence` slide-in; pickers write `?from=&to=` URL params; switching away from Custom clears both params; domain param preserved when switching periods.
- `FounderDomainTabs.tsx` — now rendered inside the filter bar alongside the period selector, separated by a `1px --theme-paper-border` divider; `?from=`/`?to=` params preserved when switching domains.
- `FounderPerformanceShell.tsx` — domain fetching + tab rendering removed (moved to `page.tsx`); shell now a thin passthrough that delegates to `ManagerPerformanceAsync` with resolved `domain`, `period`, and optional `customFrom`/`customTo`.
- `ManagerPerformanceAsync.tsx` — accepts optional `customFrom`/`customTo` string props; uses these directly as date range when `period === 'custom'`, falling back to `getPeriodDateRange` otherwise.
- `performance-service.ts` — `PerformancePeriod` extended with `'custom'`; `getPeriodDateRange('custom')` falls back to `this_month` (safe fallback — custom dates are always passed directly by callers); `getPreviousPeriodDateRange('custom')` returns `null` (no meaningful prior period).

---

## 2026-05-31 — Performance · agent roster redesign

- `ManagerPerformancePanel.tsx` — `AgentCard` fully redesigned:
  - Removed generic `3px solid var(--theme-accent)` left-border selection indicator.
  - Selected state now uses `--theme-accent-surface` background + subtle accent-tinted border (`color-mix`), matching the system's card selection pattern.
  - Added `rank` prop — mono numeric rank rendered left of avatar, accented on selection.
  - Avatar downsized from `md` (40px) to `sm` (32px) — list is a navigation aid, not a profile display.
  - Conversion rate pill moved to right-aligned column, separated from the name/leads stack — cleaner scan left-to-right.
  - `onMouseEnter/Leave` handlers add hover state without disrupting the selected card.
  - "Team / N agents" header block and "Agent / Rate" column label row removed — clean card list without a table-like header.
  - Rank number `<span>` given `lineHeight: 1; alignSelf: center` — correctly centered vertically with avatar.
  - Panel width reduced to 280px with `padding: var(--space-2)` inner padding for edge-to-edge card layout.

---

## 2026-05-31 — WhatsApp · title and composer gap fixes

- `WhatsAppShell.tsx` — heading renamed to "WhatsApp" with `<span className="page-title-dot">.</span>` blinking dot + `type-page-title` class (Playfair, matches all primary nav pages). Shell changed from `height: calc(100dvh - 56px)` to `height: 100%` — the `dvh` calculation was evaluated inside the scrollable paper card, causing the composer to float mid-page instead of pinning to the bottom edge.
- `ConversationPanel.tsx` — removed "Enter to send · Shift+Enter for new line" hint `<p>` below the composer.
- `app/(dashboard)/whatsapp/page.tsx` — wrapped `WhatsAppShell` in a `flex: 1; overflow: hidden; min-height: 0` container so the paper card's height constraint propagates down and the shell fills exactly to the bottom.

---

## 2026-05-31 — WhatsApp · design system alignment

- `WhatsAppShell.tsx` — left panel header: Playfair italic "Messages" heading replaces generic sans-serif "WhatsApp" span; left panel background corrected to `--theme-paper`; right panel background corrected to `--theme-paper-subtle`.
- `ConversationRow.tsx` — `Avatar` component replaces raw unread dot; avatar overlaid with accent dot badge when unread; name/timestamp use proper type tokens; resolved badge now flex-shrink safe.
- `ConversationPanel.tsx` — `Avatar` added to header zone; contact name uses Playfair italic; resolved composer banner copy uses Playfair italic; `Avatar` imported from `src/components/ui/Avatar`.
- `MessageBubble.tsx` — inbound messages now show sender avatar (`Avatar size="xs"`) + sender name row above bubble; bot label styled with `--theme-accent` and `--weight-medium`; hardcoded `rgba(0,0,0,0.06)` in `MediaPlaceholder` replaced with `--theme-paper-border`; outbound bubbles gain `--shadow-1`; inbound bubbles use `--theme-paper` background (elevated from paper-subtle).
- `EmptyConversationState.tsx` — icon container uses `--theme-paper` + `--shadow-1` + border (grounded card style matching system empty states); copy tightened to on-brand language.
- `loading.tsx` — skeleton left panel updated to `--theme-paper` background; avatar-style 32×32 rounded squares replace the small unread dot circles; right panel updated to `--theme-paper-subtle`.

---

## 2026-05-31 — Performance · period selector — active tab restored

- `PerformancePeriodSelector.tsx` — reverted from `FilterDropdown` to `TabSelector` (pill). The dropdown always showed a generic “Time Period” label with a `1` badge and no visible active period; tabs show the selected range with the pill indicator again. `indicatorLayoutId="performance-period-tabs"` avoids shared-layout clashes with founder domain tabs.
- `FilterDropdown.tsx` — single-select: re-clicking the active option no longer clears selection (menu closes only; **Clear** still deselects).

---

## 2026-05-31 — UI · TabSelector pill — soft pastel active chip

- `design-tokens.css` — `--theme-tab-pill-active-bg`, `--theme-tab-pill-active-border`, `--theme-tab-pill-active-text` (accent-muted washed into paper surfaces; Earth reads as soft brown on cream).
- `TabSelector.tsx` — pill variant active chip no longer uses dark `--theme-canvas`; uses new tokens + `--shadow-1`. Affects all pill consumers (Lead Volume period tabs, TasksShell, PerformancePeriodSelector, etc.).

---

## 2026-05-31 — Dashboard · Lead Pipeline + Campaign Performance — domain tab selector

- `ManagerLeadStatusWidget.tsx`, `ManagerCampaignWidget.tsx` — domain picker switched from `variant="pill"` to `variant="connected"` to match `ManagerLeadVolumeWidget` (segmented tray, equal-width tabs, primary active text).

---

## 2026-05-31 — Dashboard · Lead Pipeline widget — Overall label

- `ManagerLeadStatusWidget.tsx` — domain-wide stacked bar now has an **Overall** row label (name + lead count) matching the per-agent bar layout above the status legend.

---

## 2026-05-31 — Dashboard · Lead Volume widget — merged domain footer

- `ManagerLeadVolumeWidget.tsx` — domain tab row and per-domain totals strip merged into one connected tab bar below the chart: domain label + period total (`--font-mono`, `--text-sm`, `formatCount`). Chart Recharts legend unchanged. Period tabs stay in the header row.

---

## 2026-05-31 — Dashboard · Lead Volume widget — header total removed

- `ManagerLeadVolumeWidget.tsx` — period aggregate count removed from the widget header; title row is Playfair title + period tabs only. Per-domain totals strip gains a non-clickable **Total** label summing all four featured domains.

---

## 2026-05-31 — Dashboard · Lead Volume widget — domain picker + multi-line chart

Enhanced the `ManagerLeadVolumeWidget` with domain filtering and a 4-line cross-domain chart.

- **Period tabs reordered:** This Month (left) | This Week (default, middle) | Today (right). Uses `Tabs` + `TabsList` + `TabsTrigger` compound API with `indicatorLayoutId="lead-volume-period"` — replaced the previous `TabSelector` backwards-compat wrapper.
- **Domain picker** (admin/founder only): connected tab row — All | Onboarding | Shop | House | Legacy. Uses the same compound API with `indicatorLayoutId="lead-volume-domain"`. Manager role sees no picker (locked to own domain).
- **Multi-line chart** ("All" mode): 4 `<Line>` components, one per featured domain, each coloured from `useChartTokens`. Custom `MultiLineTooltip` shows all 4 domain values on hover. Recharts `<Legend>` with short domain labels below the chart. Per-domain totals strip at the bottom — clicking a domain name drills into it.
- **Single-line chart** (specific domain selected or manager role): same as before, one line for the selected domain.
- `src/lib/services/dashboard-service.ts` — `getLeadVolumeByDomains(domains, period)` added: single query fetching `created_at + domain` for the 4 featured domains, bucketed into per-domain time series. Returns `MultiDomainVolumeSummary { domains, totals, series }`.
- `src/lib/actions/dashboard.ts` — `getLeadVolumeByDomainsAction(period, domains)` added (manager/admin/founder); `getLeadVolumeForDomainAction(period, targetDomain)` added for single-domain drill-down — passes `role='manager'` to `getLeadVolumeByPeriod` to force the domain filter regardless of caller role.
- **Bug fixed:** previous `getLeadVolumeByPeriodAction` ignored its `_domain` param and always used `profile.domain`, so domain tab drill-downs returned all-domain data. New `getLeadVolumeForDomainAction` passes the target domain explicitly.
- **Bug fixed:** `useRef` guard on the mount `useEffect` broke under React Strict Mode — the ref survived the dev double-mount cycle but the `cancelled` flag did not, so `setLoaded(true)` was never called. Replaced with the standard single-flag pattern.

---

## 2026-05-31 — Group Tasks · identity block redesign + subtask row cleanup

- `GroupTasksTab.tsx` — `IdentityBlock` fully redesigned: replaced the hard-coloured 60px accent-filled panel with a soft 52px column using `var(--theme-paper-subtle)` background, a 1px `--theme-paper-border` right edge, and a 3px left accent line. Icon reduced from 22px white-on-solid to 16px at 70% opacity in the accent colour — subordinate, not dominant. `ProgressRing` now draws on the paper surface: track uses `var(--theme-paper-border)`, fill uses the accent colour (switches to `--color-success-text` at 100%), zero-progress ring renders at 30% opacity. Count label moved below the ring in `--theme-text-tertiary`. Overall feel is grounded, soft, and theme-reactive rather than a hard branded block.
- `GroupTasksTab.tsx` — completion circle removed from subtask rows entirely. Subtask row layout is now: pastel `SubtaskStatusBadge` (left) → title (grows, 13px `--weight-medium` `--theme-text-secondary`) → assignee chip (20px avatar + first name, right). No toggle affordance on the row — subtask status is changed inside `SubTaskModal`.

---

## 2026-05-31 — Tasks · SubTaskModal remarks composer

- `TaskRemarksPanel.tsx` — removed status-change pill row below the message bar ("moved to To Do", "started work", etc.). Remarks post text only; existing timeline status chips on older remarks are unchanged.

---

## 2026-05-31 — TimePicker · AM/PM flicker fix

- `src/components/ui/TimePicker.tsx` — replaced `TabSelector` (Framer `layoutId` spring pill) with static `AmpmToggle` on the AM/PM row. The shared-layout indicator was re-animating from the left when hour/minute picks triggered parent re-renders, which looked like a tab sliding across the scroll columns. Draft now seeds only on panel open, not on every `value` prop update while the panel stays open.

---

## 2026-05-31 — TimePicker · settings page fixes

- `src/lib/utils/dates.ts` — `normalizeTimeHHMM()` strips optional seconds from PostgreSQL `time` values (`09:00:00` → `09:00`).
- `src/components/ui/TimePicker.tsx` — panel portals to `document.body` with `position: fixed` (no longer clipped by stacked settings cards); viewport flip up/down + left; draft state while open; all values normalised through `normalizeTimeHHMM` before parse/display.
- `src/components/settings/AgentSettingsTable.tsx` — shift times normalised on load and on each pick so validation/save accepts DB `time` strings.

---

## 2026-05-31 — Settings · AgentSettingsTable row/column layout fix

- Grid column widths corrected: Shift Start/End `96px → 104px` (gives TimePicker room), Active Hours `120px → 96px`, In Pool `120px → 88px` (toggle is 32px wide, no label in cell).
- `overflow: hidden` removed from table container — was clipping TimePicker dropdown panels. Replaced with `borderRadius` on header (top corners) and last row (bottom corners) directly, preserving the rounded card appearance without a clipping context.
- Toggle `label` prop removed from row cells — column header "In Pool" already communicates it; inline "Active"/"Inactive" label was redundant.
- `TimePicker` trigger: `width: 100%` + `minWidth: 88` so it stretches to fill its grid cell. Container `flexDirection: column` added to support full-width stretch.

---

## 2026-05-31 — New component · TimePicker (`src/components/ui/TimePicker.tsx`)

Standalone time-only picker replacing `<input type="time">` throughout the codebase.

- **Props:** `value: string | null` (HH:MM 24-hour, matching PostgreSQL `time`), `onChange: (string | null) => void`, `placeholder?`, `disabled?`, `style?`, `aria-label?`
- **Trigger:** 88×32 button matching the paper-subtle input aesthetic — Clock icon + formatted time label ("9:00 AM"). Accent border + focus shadow on open/focus. Width matches the old `<input type="time">` slot exactly.
- **Panel:** `DROPDOWN_VARIANTS` Framer Motion popover. Horizontal flip detection (same pattern as DatePicker — `getBoundingClientRect` on open, `right: 0` when near viewport edge). Hour scroll column (1–12) + minute scroll column (0–55 in 5-minute steps) + AM/PM connected TabSelector.
- **ScrollColumn:** local copy of the same scroll-column pattern from `DatePicker.tsx` — selected item auto-scrolls into view on mount and on selection change. Selected cell: `--theme-accent-surface` bg + `--theme-accent` text.
- **Serialisation:** `parse("HH:MM") → TimeState` (12h display), `serialise(h, m, meridiem) → "HH:MM"` (24h for DB). Minute snapped to nearest 5-minute step. No Date objects involved — string-only, timezone-safe.
- **`AgentSettingsTable`** — both `<input type="time">` replaced with `<TimePicker>`. `timeInputStyle` object removed. `updateField` + `handleBlur` removed; replaced with `handleTimeChange` (updates shift state + calls `validateAndSave` immediately on each pick) and extracted `validateAndSave` function.

---

## 2026-05-31 — Settings · AgentSettingsTable primitives migration + hardening

- `AgentSettingsTable.tsx` — adopted `Avatar` (sm, borderRadius override to --radius-sm) replacing bespoke 32×32 div with manual initials/image logic; `getInitials()` local function removed (Avatar handles semantic colour fallback + initials internally). Clear-shift button replaced with `Button variant="danger" size="xs"` — eliminates imperative `onMouseEnter/onMouseLeave` DOM mutation for hover states. Row opacity for saving/pending state moved from conflicting inline `style.opacity` into Framer Motion `animate={{ opacity }}` — resolves the race between entrance animation and dimming transition. Unused `APP_DOMAINS` import removed.

---

## 2026-05-31 — Group Tasks · subtask visual hierarchy + assignee chip

- `GroupTasksTab.tsx` — `SubtaskStatusBadge` internal component added with a fully independent pastel palette (`SUBTASK_STATUS_PASTEL`) — six distinct colour sets not tied to `--theme-accent`, so they remain vivid across all five Eia themes: slate (to_do), amber (in_progress), indigo (in_review), emerald (completed), rose (error), cool-grey (cancelled). Badge placed on the **left** of each subtask row (not the right). `in_progress` status dot animates via `eia-subtask-pulse` keyframe (2s ease-in-out, scale + opacity). Subtask title styled at `13px`, `--weight-medium`, `--theme-text-secondary`, `letter-spacing: -0.01em` — visually subordinate to the group task title. Left indent via `padding-left: var(--space-10)` to reinforce the hierarchy. Assignee display changed from bare `Avatar` icon to a proper chip: Avatar (20×20) + first name in `12px --weight-medium --theme-text-secondary`, with `marginLeft: var(--space-2)` and `opacity: 0.45` when the subtask is completed.
- `src/styles/design-tokens.css` — `@keyframes eia-subtask-pulse` added: `0%/100%` → scale 1, opacity 1; `50%` → scale 0.72, opacity 0.45.

---

## 2026-05-31 — Group Tasks · CreateGroupTaskModal full UX redesign

- `CreateGroupTaskModal.tsx` — complete rewrite. Removed: two-column preview layout, accent colour swatches (no DB column), icon picker (no DB column), member search stub. Replaced with a single-screen layout: group details (title, description, domain, priority, due date) + inline subtask drafts section. Each draft row has title input, priority dots, assignee inline picker, and due date. Subtasks are created via `createSubtaskAction` in `Promise.allSettled` immediately after `createGroupTaskAction` on submit. Props extended: `callerRole` and `callerDomain` required (manager domain auto-locked, domain select hidden). `AssigneeInlinePicker` added as internal component — compact inline dropdown composing `Avatar` + search. Priority shown as 20px dot buttons per draft row for density. `DatePicker` used for group-level and per-subtask due dates. Agents fetched via `listAgentsForDomain` when domain is selected; drafts cleared on domain change.
- `GroupTasksTab.tsx` — `CreateGroupTaskModal` call site updated to pass `callerRole` and `callerDomain`.

---

## 2026-05-31 — Tasks page · primitives migration + visual audit

- `PersonalTasksTab.tsx` — quick-add due date `<input type="date">` replaced with `<DatePicker>`; `quickDueAt` state changed from `string` to `Date | null`; `due_at` action calls updated to `quickDueAt.toISOString()` directly; reset changed from `''` to `null`. Tag filter bar (bespoke inline pill buttons + Clear link) replaced with `<FilterDropdown multi>` — items built from `availableTags`. `X` re-added to lucide imports (still used by quick-add cancel button). `FilterDropdown` and `DatePicker` imports added.
- `TasksShell.tsx` — raw `<button>` with inline styles replaced with `<Button variant="primary" size="sm">`; `Button` import added; `Plus` rendered as inline child (Button has no `leftIcon` prop). `borderRadius: --radius-sm` violation corrected (Button applies `--radius-md` per spec).

---

## 2026-05-31 — Dashboard · AgentActivityWidget: auto-scrolling live ticker, speed tuned

- Scroll speed reduced to `0.11px/frame` (~6.6px/s at 60fps) — slow enough to read without stopping
- Previous value was `0.4` (too fast), intermediate `0.15` (still fast), settled on `0.11`

---

## 2026-05-31 — Dashboard · AgentActivityWidget: auto-scrolling live ticker, limit 25, note_added filtered

- **Migration 0048** (`20260531000048_dashboard_activity_limit_25.sql`): bumps `agent_activity` LIMIT 10 → 25 in `get_dashboard_summary` RPC; `getAgentRecentActivity` service function also bumped to 25
- "Recent Activity" eyebrow label removed; subtitle changed to "Live Lead Activity."
- Fixed-height ticker viewport (`220px`), overflow hidden, fade masks top + bottom using `--theme-paper` gradient
- Inner list scrolls via `translateY` on a `setTimeout` loop (`FRAME_INTERVAL = 16ms`); wraps to 0 when last row scrolls out
- Pauses on `mouseenter`, resumes on `mouseleave`
- New Realtime event: resets offset to 0 instantly so new item appears at top, then resumes
- `note_added` filtered in all three paths: seed, refresh fetch, Realtime handler
- State cap: 25 rows (`ACTIVITY_CAP`); `ROW_HEIGHT = 48px` constant drives wrap calculation

---

## 2026-05-31 — Dashboard · AgentTasksWidget: unified all-category task list with animated category dots

Widget renamed from "Gia · My Tasks" to "My Tasks". Now shows all active tasks assigned to the agent across all 3 categories (`personal`, `group_subtask`, `gia_followup`) instead of only gia lead tasks due today.

- **Migration 0047** (`20260531000047_dashboard_agent_tasks_all_categories.sql`): replaces the `agent_tasks` CTE in `get_dashboard_summary` RPC — LEFT JOINs `task_gia_meta`+`leads` for gia context, `task_groups` for group context; active statuses `to_do/in_progress/in_review`; sort: overdue → priority → due_at; limit 30; `newLeadsCount` removed
- `DashboardAgentTask` type rewritten: now carries `title`, `task_category`, `priority`, `status`, `context_label`, `lead_id`
- `DashboardSummary.agent_tasks` is now `DashboardAgentTask[]` directly (no longer wrapped in `DashboardAgentTasksSummary`)
- `getAgentTasksSummary()` in `dashboard-service.ts` rewritten to match new shape (3-category join, client-side sort mirror)
- `TASK_CATEGORY` constants extended with `dotColor` CSS token per category
- `AgentTasksWidget`: animated pulsing dot per category identifier (scale+opacity, GPU-only, `eia-cat-dot-pulse` keyframe, staggered delays 0s/0.4s/0.8s); priority chip (urgent/high only); status chip (in_progress/in_review only); context label italic below title; category legend footer; "new leads" footer removed

---

## 2026-05-31 — Leads · LeadsFilters: migrated to FilterDropdown + DatePicker primitives

`LeadsFilters.tsx` fully rewritten. Removed three inline sub-components (`MultiSelectDropdown`, `SingleSelectDropdown`, `DateRangeFilter`) and the `<style>` keyframe injection. Replaced with:

- `FilterDropdown multi={true}` for Status and Outcome
- `FilterDropdown` (single-select) for Source, Campaign, Agent — `selected` bridged as `[value]`/`value ?? null`
- Two `DatePicker` components (date-only) for the date range, with `minDate`/`maxDate` cross-constraints
- `dateFromParam` / `dateToParam` helpers for IST-safe round-trip between `YYYY-MM-DD` URL params and `Date` objects (avoids `new Date('2026-05-31')` UTC midnight parse)
- Search input gains `eia-input` className so `::placeholder` resolves correctly via global CSS rule
- Search input `borderRadius` corrected to `--radius-md` (matching FilterDropdown trigger)
- Removed `formatDate` re-export (no consumer was importing it from here)
- All animation now via Framer Motion `DROPDOWN_VARIANTS` inside `FilterDropdown` — inline `@keyframes ddEnter` removed

---

## 2026-05-31 — Tasks · CreatePersonalTaskModal: migrated specific-date picker to DatePicker component

`CreatePersonalTaskModal.tsx` — replaced the raw `<input type="datetime-local">` behind a manual toggle with `<DatePicker showTime value={dueDate} onChange={handleDatePickerChange} />`. `dueSpecific: string` state replaced with `dueDate: Date | null`. `showDatePicker` boolean toggle and `ChevronDown` button removed. `ChevronDown` import removed. `getResolvedDueAt()` now reads `dueDate.toISOString()` instead of `new Date(dueSpecific).toISOString()`. Preset chip handler clears `dueDate` (was `dueSpecific + showDatePicker`). DatePicker handles its own open/close toggle internally — no wrapper toggle needed. IST end-of-day logic for presets is unchanged.

---

## 2026-05-30 — Profile · UI: `/profile` widened to canonical detail-page layout

UI-only change. No backend, action, schema, or RLS change. No business logic touched — every server action call site and Supabase upload path is byte-identical.

**`src/app/(dashboard)/profile/page.tsx`:**

- Layout switched from the old 672px centred narrow shell to the canonical wide detail-page pattern (`max-width: 1280px`, two-column grid `minmax(0, 1fr) 340px`). Now matches `/admin/users/[id]` exactly.
- Left column: `Personal Details`, `Appearance`, `Security`, `Notifications` — each `SectionCard` gained a one-line `description` explaining the section's purpose.
- Right sticky sidebar (340px): new `Identity` `SectionCard` (avatar tile, name, email, job-title, role + domain status pills, "Member since" meta strip on `--theme-paper-subtle` divider) and `Session` `SectionCard` containing the sign-out form.
- Added `.type-eyebrow` "Account" label above the page title — matches the established detail-page header pattern.
- Sign-out button migrated from a raw inline `<button>` to `Button variant="secondary" size="sm"` (Q-12 reuse). `LogOut` icon dropped — `Button.iconLeft` accepts a `LucideIcon` component reference which cannot cross the server→client component boundary in this server-component page; text-only is fine since the form context and section title already establish the action.

**`src/components/profile/ProfileAvatarSection.tsx`:**

- Reduced from a horizontal `avatar + identity text + role/domain pills + member-since` composite to just the upload tile (96×96, `--radius-md`, hover camera overlay, spinner, inline error).
- Identity text + pills + member-since now live at the page level inside the `Identity` sidebar card.
- Removed the local `Pill` helper — the page uses the canonical `.status-pill` utility from `design-tokens.css`.
- Upload logic (`createClient`, `updateProfileAvatar`, 2 MB validation, cache-busting) is byte-identical.

**Files modified:** `src/app/(dashboard)/profile/page.tsx`, `src/components/profile/ProfileAvatarSection.tsx`.

---

## 2026-05-30 — Admin · UI: Team / user-management redesign + two new shared primitives (`SectionCard`, `BackButton`)

**Pages redesigned (UI only — no backend, action, schema, or RLS change):**

- `/admin/users` (Team list) — wrapper card switched from `--shadow-paper` (levitating) to `1px --theme-paper-border + --shadow-1` (flat, grounded). Aligns with `AgentSettingsTable` in `/settings`.
- `/admin/users/[id]` (User detail) — full redesign. `max-width: 1280px` (Wide zone, DESIGN-DNA §3.4). Two-column grid `minmax(0, 1fr) 340px`: left stacks `Profile Details` + `Authorization` `SectionCard`s; right is a sticky `Identity` sidebar with `Avatar size="xl"`, name, email, job-title, role/domain status pills, plus the existing `UserStatusControls` toggles below a hairline. Drops the redundant "TEAM MEMBER" eyebrow — `BackButton` already establishes context.
- `/admin/users/new` (New User) — full redesign. Wide 1280px two-column grid. Left: `SectionCard "Member Details"` containing `<CreateUserForm mode={mode} />`. Right: sticky `SectionCard "Onboarding Method"` containing the relocated `TabSelector` (variant `connected`, "Set password" / "Send invite link") and a mode-aware tips block (Password mode: temporary password + role/domain; Invite mode: magic-link + role/domain). Drops the page subtitle (redundant after the tabs moved up).
- `/profile` — migrated from its private `ProfileSection` shell to the new shared `SectionCard` (visual output identical). Dead `ProfileSection` definition removed.

**`CreateUserForm.tsx` refactor:** removed internal `useState`/`TabSelector` for mode. Now controlled — accepts `mode: "password" | "invite"` prop. Exports `CreateUserMode` type. Internal info-banner inside invite mode removed (its message now lives in the right-column tips block).

**`EditProfileForm.tsx` + `EditAuthorizationForm.tsx`:** dropped their own outer `padding` and `borderTop` separators — `SectionCard` body padding owns it. Labels in `EditProfileForm` migrated to the canonical `label-micro` style (`--text-2xs / widest / tertiary`) — now matches `EditAuthorizationForm` and `CreateUserForm`.

**`UserStatusControls.tsx`:** horizontal padding aligned to `--space-6` (was `--space-8`) — flush with the `SectionCard` body grid.

**Cancel button:** `CreateUserForm` Cancel switched from a raw `<a>` to `<Link><Button variant="secondary"></Link>` (Q-12 — reuse the canonical primitive).

**New shared primitives:**

- `src/components/ui/SectionCard.tsx` — canonical card shell for single-record detail pages. Props: `title`, `description?`, `headerRight?`, `bodyPadding?` (default `true`), `children`. Header strip `--theme-paper-subtle` + `label-micro` title; body padded `--space-6` by default. Flat chrome: `1px --theme-paper-border + --shadow-1` — never `--shadow-paper`. Used by `/profile`, `/admin/users/[id]`, `/admin/users/new`, and `NewUserClient`.
- `src/components/ui/BackButton.tsx` — 36×36 circular icon-only back link. Props: `href`, `label` (drives `aria-label` + `title`). Server-component-safe. Sits inline to the left of the page `<h1>` with `gap: var(--space-4)`. Replaces 5 inline back-link implementations: `/admin/users/new`, `/admin/users/[id]`, `/leads/[id]`, `/campaigns/[id]`, `tasks/[id]` (GroupTaskWorkspace).

**Other migrations driven by `BackButton`:**

- `leads/[id]/page.tsx` — header `<h1>` upgraded from a hand-rolled `var(--font-serif)` inline style to the canonical `.type-page-title` + `.page-title-dot` classes. Phone number subtitle preserved.
- `campaigns/[id]/page.tsx` — back link upgraded from a raw `← Campaigns` `<a>` (no Next.js Link prefetching) to `BackButton`.
- `GroupTaskWorkspace.tsx` — title row collapsed: back button + title + meta pills now sit on one flex row (was a stacked back-link / title row layout). Vertical real estate saved.

**Wrapper for client state lift:** `src/components/admin/NewUserClient.tsx` — `'use client'` two-column layout. Owns `mode` state for `CreateUserForm` and the parallel `TabSelector` on the right. Required because the page is a Server Component but the form mode is client state shared across columns.

**Files added:**

- `src/components/ui/SectionCard.tsx`
- `src/components/ui/BackButton.tsx`
- `src/components/admin/NewUserClient.tsx`

**Files modified:** `src/app/(dashboard)/admin/users/page.tsx`, `src/app/(dashboard)/admin/users/[id]/page.tsx`, `src/app/(dashboard)/admin/users/new/page.tsx`, `src/app/(dashboard)/profile/page.tsx`, `src/app/(dashboard)/leads/[id]/page.tsx`, `src/app/(dashboard)/campaigns/[id]/page.tsx`, `src/components/tasks/GroupTaskWorkspace.tsx`, `src/components/admin/CreateUserForm.tsx`, `src/components/admin/EditProfileForm.tsx`, `src/components/admin/EditAuthorizationForm.tsx`, `src/components/admin/UserStatusControls.tsx`.

---

## 2026-05-30 — Campaigns: detail page title beautified — `campaigns/[id]/page.tsx` now derives a display-only `campaignTitle` by splitting the raw campaign key on `_` and whitespace and joining with `·` (e.g. `TG_House_Meta+Leads_Goa+Resort` → `TG · House · Meta · Leads · Goa · Resort`). Decode step also strips `%2B` defensively (case-insensitive) before the `+→space` swap, so a double-encoded link from the address bar no longer shows literal `%2B` in the heading. The un-beautified `campaignName` is still the value passed to all DB lookups (`getCampaignDetailMetrics`, `getCampaignAgentDistribution`, `getLeadsByRoleCached`) — only the H1 changes.

## 2026-05-30 — ComboboxDropdown ui primitive shipped — LeadInfoCard inline combobox migrated. Phase UI. New file `src/components/ui/ComboboxDropdown.tsx` (single-select searchable picker, viewport-flip, kbd nav Escape/Arrow/Enter, DROPDOWN_VARIANTS, no hardcoded hex). `renderTrigger` prop lets LeadInfoCard.AssigneeCombobox keep its InfoRow-styled trigger (label-above-value with dashed accent underline on hover) — visual identical to pre-migration; panel + search + list now live in the primitive. Inline panel/list/search/handlers removed from LeadInfoCard (~190 lines deleted).

## 2026-05-30 — UI: Calendar.tsx gains optional taskDots prop — per-day 4px dot below the day number (absolute, zIndex:1, scale 0→1 / 150ms EASE_SPRING). --theme-accent at 0.7 opacity for 1–2 tasks, 1.0 for 3+; --color-danger when hasUrgent. Cell height switches from aspectRatio:1 to 44px only when taskDots provided. Local-date YYYY-MM-DD keying (IST-safe, never toISOString). taskDots=undefined renders byte-identical to legacy. Today dot suppressed when a task dot occupies the same cell.

## 2026-05-30 — UI: DatePicker.tsx gains optional showTime prop — renders Hours (1–12) / Minutes (00,15,30,45) scroll columns with ":" separator and AM/PM TabSelector (variant="connected", indicatorLayoutId="datepicker-ampm") inside the same panel, separated by 1px --theme-paper-border. Selected cell bg --theme-accent-surface + --radius-xs. Trigger label switches to "dd MMM yyyy, h:mm a" when showTime + value present. All commits routed through toUTC(). showTime=false behaviour byte-identical to legacy (zero consumer impact — no callers today).

## 2026-05-30 — UI: FilterDropdown.tsx enhancements — trigger border now accent when open (was only when active); ChevronDown rotation transition switched from --duration-base/--ease-spring to --duration-fast/--ease-in-out per spec; checkbox unselected bg now --theme-paper (was transparent); footer Clear link added (right-aligned --text-xs --theme-text-tertiary, hover --theme-accent, fires onChange([])) with 1px --theme-paper-border separator above; visible only when selected.length > 0. No prop API change.

## 2026-05-30 — UI: TabSelector.tsx spec audit — confirmed pill (paper-subtle tray, --theme-canvas chip + --theme-sidebar-border + --shadow-2, --theme-canvas-text active label on z-index:1 inner span) and connected (paper-subtle tray, --theme-paper chip + --shadow-1) variants match spec; SPRING_CONFIG on both motion.span indicators (no hardcoded stiffness/damping); count badge uses --theme-accent-surface/--theme-accent; zero hardcoded hex. No border-bottom variant exists in code or consumers — not added (would be structural). Inline // ✓ spec comments added.

## 2026-05-30 — UI: Button.tsx spec audit against design-dna.md §5.01 — border-radius corrected to --radius-sm (was --radius-md); primary gains --shadow-accent-glow rest + --shadow-accent-lift + translateY(-1px) on hover; secondary gains --shadow-1 + accent-muted border hover; ghost text colour fixed to --theme-text-primary + paper-subtle hover bg; danger/success kept soft-default (intentional drift from spec saturated default — preserves 9 existing consumers); pointer-events:none added to disabled state; whileTap stays in MotionButton per zero-bundle-cost rule.

## 2026-05-30 — UI: SearchBar default placeholder shortened to "Search"; placeholder colour wired via .eia-input class so ::placeholder resolves to --theme-text-tertiary; clear button gains hover→text-primary with var(--transition-hover).

## 2026-05-30 — Lead slug collision fix (migration 0046): generate_lead_slug now appends -2/-3 on collision; backfill re-run ordered by created_at ASC.

---

## 2026-05-30 — URL cleanup: lead slugs (migration 0045), campaign + encoding, performance ?domain= audit.

- Migration 0045: `leads.slug` column, `generate_lead_slug()` function, `trg_lead_slug` trigger, `idx_leads_slug` partial unique index; back-fills all existing rows with non-null phone. Slug format: `priya-sharma-9182`. Immutable after insert.
- `getLeadBySlug(slug)` added to `leads-service.ts`. `leads/[id]/page.tsx` tries slug first, falls back to UUID. `LeadsTable` href uses `lead.slug ?? lead.id`.
- Campaign URLs: `CampaignCard` now encodes spaces as `+` (no `encodeURIComponent`); `campaigns/[id]/page.tsx` decodes `+` back to spaces. Address bar shows `TG_House_Meta+Leads_Goa+Resort` instead of `%20`-encoded form.
- Performance page `?domain=` audit: Finding B — param is intentional for founder/admin multi-domain tab selector (`FounderDomainTabs`). Manager path never reads `?domain=`. Server validates the value against live DB before use. No code change required.

---

## 2026-05-30 — Tasks: status-change chips implemented in TaskRemarksPanel compose area — A-4 resolved.

---

## 2026-05-30 — Tasks: inline [0.16,1,0.3,1] easing replaced with EASE_OUT_EXPO across 5 components — F-1 resolved.

---

## 2026-05-30 — Tasks: Load more button rendered in PersonalTasksTab — A-1 resolved.

---

## 2026-05-30 — Tasks: currentUserName threaded GroupTasksTab → GroupRow → SubTaskModal — A-2 resolved.

---

## 2026-05-30 — Design tokens: --overlay-bg and --overlay-bg-light added; hardcoded RGBA backdrops replaced in SubTaskModal and AssigneePickerModal — B-2 + B-3 resolved.

---

## 2026-05-30 — TabSelector — `border-bottom` variant removed; `pill` is now the only default

- `src/components/ui/TabSelector.tsx` — `TabSelectorVariant` type narrowed to `'pill' | 'connected'`; all `border-bottom` conditional branches removed from `TabsList`, `TabsTrigger`, and the underline indicator block; `isBorderBottom` variable deleted; `marginBottom: 0` hardcoded (was conditional)
- `src/components/performance/FounderDomainTabs.tsx` — `variant="border-bottom"` → `variant="pill"` (domain tabs now match the Tasks page tab style)
- `src/components/CLAUDE.md` — variant list updated; component sweep table corrected

---

## 2026-05-30 — Performance page — DRY audit + alignment: 10 violations fixed across 4 files — Phase 10 hardening

- `CoreFourGrid.tsx` — inline `[0.16, 1, 0.3, 1]` → `EASE_OUT_EXPO`; `duration: 0.25` → `EXIT_DURATION`; `fontSize: "10px"` (×2) → `var(--text-2xs)`
- `EffortGrid.tsx` — same motion + font violations fixed; imports `EXIT_DURATION`, `EASE_OUT_EXPO` from `lib/constants/motion`
- `CallOutcomeBar.tsx` — same motion + font violations fixed
- `ManagerPerformancePanel.tsx` — inline `[0.16, 1, 0.3, 1]` + `duration: 0.2` → `EASE_OUT_EXPO` + `BASE_DURATION`
- No architecture (PN-001), DRY (Q-12), or P-07 violations found; `pnpm tsc --noEmit` passes clean
- `src/app/(dashboard)/performance/CLAUDE.md` — hardening log added; canonical import paths table added

---

## 2026-05-30 — Settings page — unified single-page redesign; assignment + shifts merged into one table

- `src/app/(dashboard)/settings/page.tsx` — removed tab shell and URL param logic; page now follows the standard header pattern (`h1.type-page-title` with blinking dot, `flex items-center justify-between`); fetches `getAgentRosterByDomain` directly and renders `AgentSettingsTable`
- `src/components/settings/AgentSettingsTable.tsx` — new unified `'use client'` component replacing the two-tab system; one row per agent with avatar, name, job title, domain (admin/founder only), shift start input, shift end input, computed active hours, assignment pool toggle (`Toggle`), and clear-shift button (`X` icon); domain filter pills for admin/founder when multiple domains present; `pendingIds` + `savingIds` sets prevent concurrent mutations per agent; shift save fires on `onBlur` with full validation (both required, HH:MM format, end > start); optimistic toggle with revert on error
- `src/app/(dashboard)/settings/SettingsShell.tsx` — deleted (tab shell no longer needed)
- `src/components/settings/AgentRosterTab.tsx` — deleted (merged into `AgentSettingsTable`)
- `src/components/settings/AgentShiftsTab.tsx` — deleted (merged into `AgentSettingsTable`)
- `src/app/(dashboard)/settings/CLAUDE.md` — updated to reflect single-page architecture, new component map, and column layout per role

---

## 2026-05-30 — Performance page — layout redesign: domain tabs top, period filter bar, default domain onboarding

- `src/components/performance/PerformancePeriodSelector.tsx` — replaced custom `TabSelector` pill row with `FilterDropdown` (single-select, from `src/components/ui/FilterDropdown.tsx`); wrapped in a filter bar row with `SlidersHorizontal` icon; no custom dropdown code
- `src/app/(dashboard)/performance/page.tsx` — period selector now rendered inside a leads-style filter bar card (`var(--theme-paper)`, border, `--radius-md`) for all three role views (agent, manager, founder/admin); founder/admin: filter bar sits above domain tabs
- `src/components/performance/FounderDomainTabs.tsx` — added `DOMAIN_TAB_ORDER` constant prescribing tab sequence: Onboarding → Shop → House → Legacy → Concierge → Finance → Marketing → Tech → B2B; `sortedDomains` sorts the live domain list against this order before building `TabItem[]`
- `src/app/(dashboard)/performance/FounderPerformanceShell.tsx` — default domain changed from `domains[0]` (alphabetical fallback) to `onboarding`; gracefully falls back to first available domain if `onboarding` has no data for the selected period

---

## 2026-05-30 — Audit: Task system architecture audit complete

- `docs/task-system-audit-2026-05-30.md` — read-only verification audit of the full task system (services, actions, validations, constants, Trigger.dev, components, migrations, auth layer); `pnpm tsc --noEmit` — 0 errors; 1 Critical finding (A-4: status change chips absent from `TaskRemarksPanel`), 2 High findings (A-1: Load More button not rendered; A-2: `currentUserName` not threaded to group subtask `SubTaskModal`; B-2: hardcoded RGBA backdrop in `SubTaskModal`), and 8 Medium/Low findings; TD-001 and TD-002 confirmed open; new debt item TD-004 added (console.error in `task-reminders.ts`)

---

## 2026-05-30 — Hotfix: get_campaign_metrics 42883 after domain enum migration

- `supabase/migrations/20260530000044_fix_campaign_metrics_domain_type.sql` — `CREATE OR REPLACE FUNCTION get_campaign_metrics`: migration 0041 changed `leads.domain` from `text` to `app_domain` enum; the RPC parameter `p_domain` was still declared as `text`, causing PostgreSQL `42883` (`operator does not exist: app_domain = text`) on every `/campaigns` load — the service caught the error and silently returned `[]`, showing no campaigns. Fix: change `p_domain` parameter type to `app_domain`; `domain::text` cast added to the SELECT list to preserve the `RETURNS TABLE (domain text)` contract. Old `(text, timestamptz, timestamptz)` overload dropped to avoid ambiguity.

---

## 2026-05-30 — Hotfix: get_dashboard_summary 42883 after domain enum migration

- `supabase/migrations/20260530000043_fix_dashboard_summary_domain_type.sql` — `CREATE OR REPLACE FUNCTION get_dashboard_summary`: migration 0041 changed `leads.domain` from `text` to `app_domain` enum; the RPC parameter `p_domain` was still declared as `text`, causing PostgreSQL `42883` (`operator does not exist: app_domain = text`) on every `/dashboard` load. Fix: change `p_domain` parameter type to `app_domain`. Old `(text, text, uuid)` overload dropped to avoid ambiguity.

---

## 2026-05-30 — Hotfix: get_group_task_summaries 42883 after domain enum migration

- `supabase/migrations/20260530000042_fix_group_task_summaries_domain_type.sql` — `CREATE OR REPLACE FUNCTION get_group_task_summaries`: migration 0041 changed `task_groups.domain` from `text` to `app_domain` enum; the RPC still compared `tg.domain = get_user_domain()::text`, which resolves to `app_domain = text` — no operator exists, causing PostgreSQL `42883` for any manager loading the tasks page. Fix: remove the `::text` cast (both sides are now `app_domain`). Added `tg.domain::text` cast in the SELECT list to preserve the `RETURNS TABLE (domain text)` signature consumed by the service layer.

---

## 2026-05-30 — Performance page — roster sorted by top performer; first agent detail pre-fetched server-side (zero-flash initial load) — Phase 10 polish

- `src/lib/services/performance-service.ts` — `getAgentRosterPerformance` now sorts the result array before returning: primary `leadsWon DESC` (null→0), secondary `conversionRate DESC` (null→-Infinity so zero-closed agents sort to the bottom, never the top). Pure in-memory JS sort — zero extra DB round-trips.
- `src/app/(dashboard)/performance/ManagerPerformanceAsync.tsx` — extended to fetch `getAgentDetailMetrics(roster[0].id, …)` server-side after the roster resolves. Guard: skipped when roster is empty. `key={period}` added to `ManagerPerformancePanel` so period changes force a clean remount and never reuse stale seed data.
- `src/components/performance/ManagerPerformancePanel.tsx` — accepts `initialAgentId` and `initialDetailMetrics` props; seeds `useState(selectedId)` from `initialAgentId`; threads both props to `AgentDetailPanel` (only for the matching agent — passes `undefined` for all other agent selections).
- `src/components/performance/AgentDetailPanel.tsx` — accepts `initialData?: AgentDetailMetrics` and `initialAgentId?: string`; seeds `useState(metrics)` from `initialData`; first line of the fetch `useEffect` skips the server action when `agent.id === initialAgentId && initialData` — exact mirror of the dashboard perf-01 pattern. Refresh button remains and calls the action unconditionally.

---

## 2026-05-30 — Domain normalization: leads/task*groups/wa_logs typed as app_domain enum; TG_Global remapped to onboarding; 6 agent profiles corrected; indulge*\* values purged

- `supabase/migrations/20260530000041_normalize_lead_domain.sql` — 7-step single-transaction migration: (1) UPDATE profiles agent rows concierge→onboarding; (2) UPDATE leads for all indulge\_\*/concierge→canonical enum values; (3) UPDATE whatsapp_notification_logs.domain; (4) DO block audits both tables, RAISE WARNING + remap any unexpected value to 'onboarding'; (5) DROP all 15 RLS policies referencing leads.domain or task_groups.domain — direct (`leads_manager_select`, `leads_update`, `task_groups_select`, `task_groups_update`) or via sub-SELECT (`lead_activities_select`, `lead_notes_select`, `lead_sla_timers_agent_select`, `lead_sla_timers_manager_select`) or via `can_access_wa_conversation()` (`wa_conversations_agent_select`, `wa_conversations_manager_select`, `wa_conversations_admin_founder_select`, `wa_conversations_update`, `wa_messages_agent_select`, `wa_messages_manager_select`, `wa_messages_admin_founder_select`); (6) ALTER TABLE leads/task_groups/whatsapp_notification_logs domain TYPE app_domain; (7) RECREATE all 15 policies + CREATE OR REPLACE `can_access_wa_conversation()` — all `::text` casts on `get_user_domain()` removed since both sides are now `app_domain`
- `src/lib/constants/campaign-domain-map.ts` — already clean (TG_Global → 'onboarding', DEFAULT_LEAD_DOMAIN = 'onboarding'); no change required
- `src/components/leads/LeadInfoCard.tsx` — already imports DOMAIN_LABELS from `lib/constants/domains.ts`; no local label map; no change required
- `docs/The_Gia.md` — section 1 domain-scoping sentence updated; section 2 domain column type/comment updated; section 5 agent assignment rule updated; WhatsApp lead default domain updated from `indulge_concierge` to `onboarding`
- `docs/workflow.md` — Stage 3, 4, and 8 updated to reflect `onboarding` as the canonical default domain

---

## 2026-05-30 — Docs: task-blueprint.md full rewrite to match shipped task system

- `task-blueprint.md` — regenerated from source (2026-05-30): Suspense-split page architecture (`TasksAsync`, `WorkspaceAsync`); `get_personal_tasks` RPC-only path (TD-003 resolved); `add_task_remark_with_status` RPC (migration 0035); performance optimizations (remarks pre-fetch, lazy completed load, local prepend, hoisted assignableUsers); `TaskStatusIcon` + extended `TASK_STATUS` tokens; nurturing Gia task fix (migration 0039); resolved TD-001/TD-003; updated component map, flows, auth matrix, migration index

---

## 2026-05-30 — Leads: Inline lead reassignment on dossier page (manager/admin/founder)

- `src/components/leads/LeadInfoCard.tsx` — "Assigned to" field now renders as an inline combobox for manager/admin/founder; at rest it is visually identical to all other `InfoRow` fields (plain text, no border/box); on hover a dashed accent underline and a faint `ChevronDown` appear as an affordance; clicking opens a search-enabled dropdown anchored below the value; selecting an agent calls `assignLead`, updates the name optimistically with a `Check` tick, and closes; `canReassign?: boolean` and `agents?: Agent[]` props added; `currentAssigneeName` local state syncs optimistic update without page reload; `AssigneeCombobox` sub-component added (close on Escape + outside click, search filters agents client-side, avatar initial chip, selected state highlighted in accent)
- `src/app/(dashboard)/leads/[id]/page.tsx` — `canReassign` derived from role (`manager | admin | founder`); `getAgentsForDomain(lead.domain)` added to the existing `Promise.all` (skipped for agents — resolves to `[]`); both passed as props to `LeadInfoCard`
- `src/lib/actions/leads.ts` — no changes; existing `assignLead` action used as-is (Zod → auth → role guard → DB update + activity log + WhatsApp notifications + SLA reschedule)

---

## 2026-05-30 — Leads: Right column height aligned to left column; Team Notes + Scratchpad fill evenly

- `src/app/(dashboard)/leads/[id]/page.tsx` — right column wrapper gets `alignSelf: 'stretch'` so it matches the full height of the left column (ends where `PersonalDetailsCard` ends)
- `src/components/leads/LeadNotesInput.tsx` — `flex: 1` on card root so it fills half the right column; textarea `minHeight` set to `80px` as a floor only
- `src/components/leads/AgentScratchpad.tsx` — `flex: 1` on card root so it fills the remaining half; textarea `minHeight` reduced to `80px` as a floor, `flex: 1` does the actual growing

---

## 2026-05-30 — leads.domain normalized to app*domain enum; TG_Global remapped to onboarding; indulge*\* values purged

- Migration 0041: `UPDATE leads` to remap `concierge` → `onboarding`, `indulge_concierge` → `onboarding`, `indulge_shop` → `shop`, `indulge_legacy` → `legacy`, `indulge_house` → `house`, `indulge_b2b` → `b2b`; audit DO block guards against any remaining non-enum values; `ALTER TABLE leads ALTER COLUMN domain TYPE app_domain USING domain::app_domain`
- `src/lib/constants/campaign-domain-map.ts` — `TG_Global` remapped from `'concierge'` to `'onboarding'`; `DEFAULT_LEAD_DOMAIN` changed from `'concierge'` to `'onboarding'`; WhatsApp lead default updates automatically via this constant
- `src/components/leads/LeadInfoCard.tsx` — local `DOMAIN_LABELS` map removed; now imports shared `DOMAIN_LABELS` from `src/lib/constants/domains.ts` (single source of truth; Q-12)
- `src/lib/types/database.ts` — `Lead.domain` narrowed from `string` to `AppDomain` in the hand-written `Lead` composite type

---

## 2026-05-30 — Docs: DESIGN-DNA.md, changelog.md, The_Gia.md markdown structure fix (no data changes)

- `docs/DESIGN-DNA.md` — fixed improper markdown that broke parsers/linters: Section 2 global tokens CSS wrapped in a css code fence with `/* */` comments restored (was raw `/_` hacks); theme/section `#` headings demoted to `##` for valid hierarchy; ASCII diagrams and layout tree blocks wrapped in text fences; bare code fences tagged; markdownlint passes (0 errors); all hex values and token assignments verified unchanged
- `docs/changelog.md` — blank lines added around headings and lists (MD022/MD032); markdownlint-disable for line-length, duplicate date headings, trailing heading punctuation, and inline HTML; markdownlint passes (0 errors); no entry text changed
- `docs/The_Gia.md` — same structural pass: `###` subtitle → `##`; bare fences tagged `text`; blank lines around headings/lists; Decision Log table normalized to compact pipe style; markdownlint passes (0 errors); no spec content changed

## 2026-05-30 — Leads: LeadInfoCard inline edit, journey dwell format, Won button colour

- `src/lib/validations/lead-schema.ts` — `UpdateLeadInfoSchema` + `UpdateLeadInfoInput` added (leadId, first_name, last_name?, phone → E.164, email?; phone/email surface field-specific error messages)
- `src/lib/actions/leads.ts` — `updateLeadInfo` action: Zod → auth → access check (same gate as scratchpad) → admin UPDATE on leads (first_name, last_name, phone, email) → note_added activity log entry
- `src/components/leads/LeadInfoCard.tsx` — converted to click-to-edit pattern matching `PersonalDetailsCard`; `canEdit` prop added; active state shows inline inputs for first_name, last_name, phone, email; system fields (domain, platform, assigned_to, call_count, received) remain read-only always; accent border + shadow-focus ring when active; Save/Cancel footer; "Click any field to edit contact details." hint when idle; `EditField` inline helper added
- `src/app/(dashboard)/leads/[id]/page.tsx` — `canEdit={canEditScratchpad}` passed to `LeadInfoCard`
- `src/components/leads/LeadJourneyTimeline.tsx` — `formatDwell` now returns human-readable strings ("2 days", "3 hrs", "45 min") instead of abbreviated ("2d", "3h", "45m"); active stage shows "X days here" / "X hrs here"; sub-minute dwell returns null (not shown)
- `src/components/leads/StatusActionPanel.tsx` — Won/Level Up success variant now uses solid `--color-success` fill with `--theme-text-inverse` (white) text + green glow shadow; same fix applied to the Mark as Won confirm button (was dark-on-dark before)

## 2026-05-30 — Leads: Junk leads can now be revived back to In Discussion

- `src/components/leads/StatusActionPanel.tsx` — added `'revive'` to `ActiveModal` type; added `revive` button variant (amber/warning tokens); rendered `Revive Lead` button (Zap icon) when `status === 'junk'`; added `ConfirmModal` for revive that fires `updateLeadStatus('in_discussion')`; `ConfirmModal` now accepts `'revive'` as a third `confirmVariant`; no changes to the action or RPC layers — `updateLeadStatus` already accepts `in_discussion` as a target and SLA scheduling fires correctly on re-entry
- Full call/note/activity history is preserved on revival; the lead resumes the journey from In Discussion

## 2026-05-30 — Leads: Team Notes card added to lead dossier right column

- Migration 0040 (`supabase/migrations/20260530000040_rpc_add_lead_plain_note.sql`): `add_lead_plain_note(p_lead_id, p_author_id, p_content, p_now)` RPC — note INSERT + lead `last_activity_at` UPDATE + `note_added` activity log in one transaction; SECURITY DEFINER; GRANT EXECUTE to authenticated
- `src/lib/validations/lead-schema.ts` — `AddLeadNoteSchema` + `AddLeadNoteInput` added (leadId uuid, content 1–2000 chars, sanitized)
- `src/lib/actions/leads.ts` — `addLeadNote` action: Zod → auth → access check → `add_lead_plain_note` RPC; same access rules as scratchpad
- `src/components/leads/LeadNotesInput.tsx` — new `'use client'` card; info-toned header (`--color-info-dark-*` tokens); textarea with ⌘+Enter shortcut; Post note button with `useTransition`; `canAdd` prop (same access gate as `canEditPersonalDetails` on the dossier page); visible to all roles but editable only by assigned agent, manager, admin, founder
- `src/app/(dashboard)/leads/[id]/page.tsx` — `LeadNotesInput` wired into right column below `AgentScratchpad`; right column now a flex column with `gap-6`

---

## 2026-05-30 — Fix: nurturing auto-task creation was silently failing; `update_lead_status` RPC (migration 0039) now includes `title` (NOT NULL, was missing) and `task_category = 'gia_followup'` (was defaulting to 'personal') in the tasks INSERT

## 2026-05-30 — WA: SLA breach WhatsApp notifications wired; agent template 54d5dd55 (4 params: leadName, leadPhone, status, lastUpdatedAt), manager template 682fd320 (5 params: +agentName); fires alongside in-app notifications in fireSlaBreachHandler; agent assignment template updated to 3bcebeb0

## 2026-05-30 — WA: whatsapp_notification_logs table (migration 0038); every template notification attempt logged with status, delivery result, and 4-digit phone suffix

## 2026-05-30 — WA: founder lead notification wired (template d5828042); fires on assignLead, createManualLead, and lead ingestion webhook

## 2026-05-30 — WA: agent lead assignment notification via Gupshup template (ID: 5df612fe); hooked into assignLead, createManualLead, and lead ingestion webhook

## 2026-05-30 — WA: extract sender name from Gupshup webhook payload; pass through to lead creation

## 2026-05-30 — WA: add wa_messages_outbound_insert RLS policy; fix silent insert failure logging in sendWhatsAppMessage

## 2026-05-30 — WA webhook: replace void async IIFE with after() — fixes Vercel function termination before DB writes

## 2026-05-30 — WA: Gupshup v1 wired — x-gupshup-secret auth, dual-format inbound parser, Gupshup v1 outbound send

- `src/app/api/webhooks/whatsapp/route.ts` — auth migrated from `Authorization` header to `x-gupshup-secret` checked with `timingSafeEqual`; dual-format POST handler: Gupshup v2 (`body.type === 'message'`) and dormant Meta v3 (`body.object === 'whatsapp_business_account'`) paths; `message-event` and `billing-event` acknowledged with 200 and no processing
- `src/lib/services/whatsapp-api.ts` — `sendTextMessage` replaced with Gupshup v1 implementation (`POST https://api.gupshup.io/wa/api/v1/msg`, `apikey` header, `application/x-www-form-urlencoded`); startup guard updated to require `GUPSHUP_API_KEY`, `GUPSHUP_APP_NAME`, `GUPSHUP_PARTNER_NUMBER`, `GUPSHUP_WEBHOOK_SECRET`; Meta env vars (`PHONE_NUMBER_ID`, `ACCESS_TOKEN`) made optional (dormant functions retained for future use); `metaFetch` helper retained for dormant Meta functions
- `src/app/api/webhooks/CLAUDE.md` — created: Gupshup auth pattern, dual-format parser spec, outbound send spec, env var inventory

## 2026-05-30 — WA: Remove Gupshup BSP layer; revert to pure Meta Cloud API architecture

## 2026-05-30 — WA webhook: GET health / Gupshup URL verify

- `src/app/api/webhooks/whatsapp/route.ts` — non–Meta-challenge GET requests return plain `OK` (200) instead of 403; Meta `hub.mode=subscribe` challenge flow unchanged

---

## 2026-05-30 — WA webhook: Gupshup POST `Authorization` token check

- `src/app/api/webhooks/whatsapp/route.ts` — Gupshup branch validates `authorization` header against `GUPSHUP_WEBHOOK_TOKEN` before reading body; 401 plain `Unauthorized` on mismatch
- `.env.example` — `GUPSHUP_WEBHOOK_TOKEN` added

---

## 2026-05-30 — Fix: exclude `/api/webhooks` from Next.js proxy session refresh

- `src/proxy.ts` — early return for `/api/webhooks/*` before `updateSession()`; matcher negative lookahead adds `api/webhooks`; delegates session refresh to `updateSession` from `lib/supabase/middleware.ts` (removes duplicate Supabase client setup)

---

## 2026-05-30 — WA-Gupshup: Gupshup BSP adapter — inbound parser + outbound send + webhook route BSP switch — Phase WA Foundation

## 2026-05-30 — WA-UI: WhatsApp page + 6 components (shell, list, panel, bubbles, composer, empty state) — Phase WA UI

- `src/lib/actions/whatsapp.ts` — new file: `sendWhatsAppMessage`, `markConversationAsRead`, `resolveConversation`, `reopenConversation` + read-action wrappers (`getConversationsAction`, `getMessagesAction`, `searchConversationsAction`) for client-component access
- `src/components/whatsapp/EmptyConversationState.tsx` — right-panel placeholder when no conversation is selected; Framer Motion entrance; accent icon
- `src/components/whatsapp/MessageBubble.tsx` — inbound (paper-subtle) / outbound (accent-surface) bubbles; delivery status icons (sent/delivered/read/failed); media placeholder card; bot label above bot messages
- `src/components/whatsapp/ConversationRow.tsx` — list item with unread dot, lead name, phone, relative timestamp, resolved badge; active left-border accent state
- `src/components/whatsapp/ConversationList.tsx` — left panel body; `SearchBar` + 300ms debounced `searchConversationsAction`; IntersectionObserver-based load-more (P-05); end-state copy "That's everything."
- `src/components/whatsapp/ConversationPanel.tsx` — three-zone layout (header / message list / composer); Realtime subscription on `whatsapp_messages` with `useId()+mountId` channel name (StrictMode-safe); optimistic send + echo dedup via `seenIds` ref; date-group separators; delivery status Realtime UPDATE handler; Resolve/Reopen buttons (manager/admin/founder only); resolved banner replaces composer; character count warning at 3000+
- `src/components/whatsapp/WhatsAppShell.tsx` — two-panel shell; Realtime on `whatsapp_conversations` (INSERT → prepend, UPDATE → re-sort); cursor-based pagination via `getConversationsAction`; unread badge in left header
- `src/app/(dashboard)/whatsapp/page.tsx` — Server Component; fetches initial conversations + unread count in `Promise.all`; passes `callerProfile` to shell
- `src/app/(dashboard)/whatsapp/loading.tsx` — two-panel skeleton matching shell layout; uses `.skeleton` CSS class
- `src/components/layout/Sidebar.tsx` — WhatsApp nav item added (`MessageCircle` icon, `/whatsapp` href); positioned between Tasks and Performance

---

## 2026-05-30 — Performance page — remove period label above page title

- `src/app/(dashboard)/performance/page.tsx` — removed uppercase period label (`This Week`, etc.) above `<h1>` on agent, manager, and founder/admin views; period filter remains in `PerformancePeriodSelector` tabs

---

## 2026-05-30 — WA-4b: get_wa_unread_count RPC migration + getUnreadCount() wired to RPC

- Migration 0036: `get_wa_unread_count()` RPC — per-agent unread WhatsApp conversation count; LEFT JOIN `whatsapp_conversation_reads` on `agent_id = auth.uid()`; counts open conversations where `last_read_at IS NULL OR last_message_at > last_read_at`; gated by `can_access_wa_conversation()`; RETURNS integer; STABLE SECURITY DEFINER; GRANT EXECUTE to authenticated
- `src/lib/services/whatsapp-service.ts` — `getUnreadCount()` replaced approximation COUNT query with `supabase.rpc('get_wa_unread_count')`; approximation comment removed
- `supabase/migrations/CLAUDE.md` — migration 0036 added to inventory
- `src/lib/CLAUDE.md` — `getUnreadCount` entry updated to reflect RPC

---

## 2026-05-30 — Fix: restore named type aliases in database.ts after Supabase CLI regen (WA-4)

Supabase CLI regenerated `src/lib/types/database.ts`, stripping all hand-written named type aliases and causing 188 TypeScript errors across 78 files. Fixed by appending a "Derived type aliases" section to `database.ts` only — no other files modified.

- **Enum types** extracted from `Database['public']['Enums']`: `UserRole`, `AppDomain`
- **String unions** hand-written: `LeadStatus`, `CallOutcome`, `LeadPlatform`, `TaskType`, `TaskStatus`, `TaskPriority`, `TaskCategory`, `NotificationType` (includes `sla_breach_agent`, `sla_breach_manager`)
- **Row types** via indexed access with narrowing overrides: `Profile` (theme literal), `LeadNote` (call_outcome narrowed to `CallOutcome | null`), `LeadRawPayload` (payload widened to `Record<string, unknown>`), `Task` (status/priority/category/type narrowed, attachments typed as `ChecklistItem[]`), `Lead` (status/outcome/platform/form_data narrowed), `Notification` (type narrowed to `NotificationType`)
- **Generated block patches**: `notifications.Row/Insert/Update.type` narrowed to `NotificationType`; `lead_raw_payloads.Insert/Update.payload` widened to accept `Record<string, unknown>`; `tasks.Row.attachments` widened to `Json | ChecklistItem[]` (enables `as Task` cast in leads-service without touching that file)
- **Hand-written composites**: `ChecklistItem`, `ProfileAuditLog`, `AgentRoutingConfig`, `AgentRosterRow`, `TaskMessage`, `LeadFilters`, `CampaignFilters`, `CampaignMetrics`, `CampaignDetailMetrics`, `AgentDistributionRow`
- `pnpm tsc --noEmit --skipLibCheck` → zero errors

---

## 2026-05-30 — Performance page — manager & founder views (agent roster panel, detail panel, founder domain tabs) — Phase 10

- `src/lib/services/performance-service.ts` — `getAgentRosterPerformance(domain, dateFrom, dateTo)`: 3 flat queries, JS aggregation, `AgentRosterRow[]` with null-guarded conversionRate and totalDealAmount; `getAgentDetailMetrics(agentId, domain, dateFrom, dateTo)`: single Promise.all of 5 queries, callsToday uses IST midnight boundary via existing getPeriodDateRange helper; `getDomainsWithLeads(dateFrom, dateTo)`: single DISTINCT query for founder tab rendering
- `src/lib/types/index.ts` — `AgentRosterRow`, `AgentDetailMetrics` types added
- `src/lib/actions/performance.ts` — `getAgentDetailMetricsAction`: Zod + auth + manager-domain guard; agentId must belong to caller's domain (manager) or any domain (founder/admin)
- `src/app/(dashboard)/performance/page.tsx` — agent-only redirect removed; role branching: agent → existing PerformanceAsync (unchanged), manager → ManagerPerformanceAsync, founder/admin → FounderPerformanceShell, guest → /dashboard; manager domain always from profile.domain, never URL
- `src/app/(dashboard)/performance/ManagerPerformanceAsync.tsx` — async server component; Suspense child; Promise.all([getAgentRosterPerformance, periodDates]); passes agentRoster to ManagerPerformancePanel
- `src/app/(dashboard)/performance/FounderPerformanceShell.tsx` — server component; fetches getDomainsWithLeads; reads domain from searchParams (defaults to first); renders FounderDomainTabs + ManagerPerformanceAsync — zero layout duplication
- `src/app/(dashboard)/performance/ManagerPerformanceSkeleton.tsx` — two-column; left: 4 agent card skeletons staggered 0/80/160/240ms §11.4; right: header + stat strip + two bar skeletons
- `src/components/performance/ManagerPerformancePanel.tsx` — 'use client'; two-column layout; agent roster left (Avatar lg, name, conversion rate pill colour-coded success/warning/danger); selected state: var(--theme-accent) 3px left border + var(--theme-paper-subtle) bg; Framer Motion layoutId on selection indicator; first agent pre-selected on mount
- `src/components/performance/AgentDetailPanel.tsx` — 'use client'; fetches via getAgentDetailMetricsAction on agentId change with useTransition; header: Avatar xl + Playfair Display name + domain badge; Bloomberg-style 5-col stat strip (Calls Today · New Leads · Follow-ups · Won · Revenue) with var(--theme-paper-border) vertical dividers; deal type breakdown as horizontal pills (var(--theme-paper-subtle) bg, --radius-full); pipeline status bar reusing CallOutcomeBar with status colours §16.4; call outcome bar reusing CallOutcomeBar; AnimatePresence + key={agentId} dissolve on agent switch, var(--duration-200)
- `src/components/performance/FounderDomainTabs.tsx` — 'use client'; thin TabSelector wrapper; useTransition on all pushes; domain labels from DOMAINS constant; pushes ?domain=X to URL
- `src/app/(dashboard)/performance/CLAUDE.md` — updated: ManagerPerformanceAsync, FounderPerformanceShell, FounderDomainTabs, AgentRosterRow, AgentDetailMetrics, domain-from-profile rule (manager) vs domain-from-URL rule (founder), callsToday IST contract

---

## 2026-05-30 — Perf: addTaskRemarkAction RPC — 6 sequential awaits → 1 round-trip — Phase 2

The most common power-user interaction (status change + remark) previously serialised 6 DB round-trips: two `getCurrentProfile()` calls, two `tasks SELECT` calls, one `tasks UPDATE`, one `task_remarks INSERT`. Under ~200ms of compounded latency.

**Fix:** new `add_task_remark_with_status` RPC (migration 0035, SECURITY DEFINER). The RPC performs an inline auth check via `auth.uid()`, conditionally updates `tasks.status` (which still fires the `log_task_changes()` audit trigger), and inserts the `task_remarks` row — all in one transaction. `addTaskRemarkAction` now calls this RPC via `adminClient.rpc(...)` and returns the full remark row. `updateTaskStatusAction` is unchanged and still used for remark-free status changes.

- `supabase/migrations/20260530000035_rpc_add_task_remark_with_status.sql` — new RPC; RETURNS `task_remarks`; SECURITY DEFINER; GRANT EXECUTE to authenticated
- `src/lib/actions/tasks.ts` — `addTaskRemarkAction` rewritten to call RPC; 6 sequential awaits replaced with 1 `.rpc()` call; error mapping for `task_not_found` and `unauthorized` exception codes
- `supabase/migrations/CLAUDE.md` — migration 0035 added to inventory
- `src/lib/CLAUDE.md` — `addTaskRemarkAction` pattern note updated with RPC details

---

## 2026-05-30 — Perf: initialRemarks threaded into TaskRemarksPanel — mount POST eliminated

Every `SubTaskModal` open previously triggered a `getTaskRemarksAction` POST inside a `TaskRemarksPanel` mount `useEffect`, causing a blank timeline until the response arrived.

**Pattern change:** call sites (`PersonalTasksTab`, `GroupTasksTab`, `GroupTaskWorkspace`) now call `getTaskRemarksAction(taskId)` at row-click time, store the result in `selectedTaskRemarks` state (`null` while in-flight), and gate the `<AnimatePresence>` render on `selectedTaskRemarks !== null`. The modal only mounts once remarks are available. `TaskRemarksPanel` seeds its `remarks` state directly from `initialRemarks` and re-seeds on `taskId` change via `useEffect`. The mount `useEffect` fetch is removed entirely. Realtime subscription and `seenIds` deduplication are unchanged.

- `src/components/tasks/TaskRemarksPanel.tsx` — `initialRemarks: TaskRemarkWithAuthor[]` restored to props; state seeded from prop; mount fetch `useEffect` removed; `seenIds` seeded from `initialRemarks` on `taskId` change
- `src/components/tasks/SubTaskModal.tsx` — `initialRemarks: TaskRemarkWithAuthor[]` added to `SubTaskModalProps`; passed through to `TaskRemarksPanel`
- `src/components/tasks/PersonalTasksTab.tsx` — `selectedTaskRemarks` state added; `handleRowClick` fires `getTaskRemarksAction` before setting `taskModalOpen`; modal gated on `selectedTaskRemarks !== null`; cleared on close
- `src/components/tasks/GroupTaskWorkspace.tsx` — same pattern as `PersonalTasksTab`; `handleOpenModal` fires `getTaskRemarksAction`; `handleModalClose` clears remarks
- `src/components/tasks/GroupTasksTab.tsx` — same pattern; `handleOpenSubtask` helper added

**Pre-mortem addressed:** `selectedTaskRemarks === null` acts as a skeleton gate — modal never mounts with stale or missing data. Re-open of the same task re-fetches (stale `initialRemarks` is worse than a brief gate). The one extra round-trip on click is better than the current post-paint blank timeline.

---

## 2026-05-30 — Perf: auth + task fetch parallelised in 4 task mutation actions

`updateTaskStatusAction`, `updateTaskAction`, `updateChecklistAction`, and `updateTaskTagsAction` in `src/lib/actions/tasks.ts` each previously issued `getCurrentProfile()` then a tasks SELECT sequentially. The two are fully independent (profiles table vs tasks table). All four actions now run them via `Promise.all`, saving one network round-trip on every task mutation.

- `canMutateTask` signature and return type unchanged — it receives a pre-fetched task as before
- `getTaskById` not used here (it now returns remarks too after 2-A fix); each action retains its own lean SELECT with only the columns it needs
- Step 3 (group domain check inside `canMutateTask`) remains sequential — it depends on `task.group_id` from the task fetch
- `pnpm tsc --noEmit` passes with zero new errors

---

## 2026-05-30 — Perf: getTaskById parallelised — task fetch + remarks fetch now concurrent

`getTaskById` in `src/lib/services/tasks-service.ts` previously issued 3 sequential DB round-trips (task SELECT, then remarks SELECT, then profiles batch). The task SELECT and the `getTaskRemarks` call are fully independent — neither result depends on the other. They now run via `Promise.all`, reducing wall-clock latency for task modal open by one network round-trip.

- `getTaskRemarks` internals unchanged (profiles batch remains sequential inside; separate optimisation)
- `getGroupSubtasks` profiles batch not parallelised — it is correctly sequential (batch needs assignee ids derived from the subtasks result)
- `pnpm tsc --noEmit` passes with zero errors

---

## 2026-05-30 — Refactor: TaskStatusIcon + canonical TASK_STATUS colour tokens

Deduplicated task status icons and colour maps across the tasks UI:

- `src/components/tasks/TaskStatusIcon.tsx` — single Lucide switch for all six `TaskStatus` values; colour from `TASK_STATUS[status].color`
- `src/lib/constants/task-constants.ts` — `TASK_STATUS` extended with `pillBg`/`pillText` (solid pills) and `remarkBg`/`remarkColor`/`remarkBorder` (light remark chips); all values CSS variables, no hex
- Removed local `STATUS_CONFIG`, `STATUS_CHIP_COLORS`, `STATUS_ICONS`, and inline `StatusIcon` from `GroupTasksTab`, `GroupTaskWorkspace`, `SubTaskModal`, `TaskRemarksPanel`
- `src/components/CLAUDE.md` — documents `TaskStatusIcon` as the canonical status icon

---

## 2026-05-30 — WA-3: whatsapp-api.ts + whatsapp-ingestion.ts + whatsapp-service.ts — Phase WA Foundation

- `src/lib/services/lead-ingestion.ts` — `createLeadFromWhatsApp(waId, phone)` added: inserts lead with `platform='whatsapp'`, domain=concierge, round-robin assignment, logs `lead_created` + `agent_assigned` activities
- `src/lib/services/whatsapp-api.ts` — Meta Cloud API HTTP client: `sendTextMessage`, `sendTemplateMessage`, `sendMediaMessage`, `uploadMedia`, `getMediaDownloadUrl`, `verifyMetaSignature` (HMAC-SHA256 + `timingSafeEqual`); module-load env var guard; SERVER ONLY
- `src/lib/services/whatsapp-ingestion.ts` — Inbound pipeline: `parseWebhookPayload`, `processInboundMessage` (9-step, idempotent), `processStatusUpdate` (adminClient delivery receipt), `resolveLeadByPhone`, `getOrCreateConversation` (race-safe ON CONFLICT), `insertInboundMessage`; SERVER ONLY
- `src/lib/services/whatsapp-service.ts` — UI queries: `getConversations`, `getConversation`, `getMessages`, `getUnreadCount`, `markConversationRead`, `searchConversations`; session client, RLS enforced
- `src/lib/CLAUDE.md` — service registry updated with all four service files

---

## 2026-05-30 — WA-2: WhatsApp types, constants, Zod schemas — Phase WA Foundation

- `src/lib/types/whatsapp.ts` — Meta Cloud API payload shapes (discriminated union on `MetaInboundMessage.type`, `MetaStatusUpdate`, `MetaApiResponse`, `TemplateComponent`) + app-internal types (`WhatsAppConversation`, `WhatsAppMessage`, `SendMessageInput`)
- `src/lib/constants/whatsapp.ts` — `WHATSAPP_API_VERSION`, `WHATSAPP_API_BASE`, message types, status/direction/sender-type vocabularies, notification template names, page sizes. No secret env vars.
- `src/lib/validations/whatsapp-schema.ts` — `MetaWebhookPayloadSchema` (permissive passthrough), `MetaStatusUpdateSchema`, `SendMessageSchema` (uuid + 1–4096 chars), `ResolveConversationSchema`; all with human-readable errors
- `src/lib/CLAUDE.md` — types, validations, and whatsapp constants registry entries added

---

## 2026-05-30 — WA-1: whatsapp_conversations + whatsapp_messages + whatsapp_conversation_reads migrations — Phase WA Foundation

Three migrations establishing the WhatsApp data layer:

- Migration 0032 (`whatsapp_conversations`): one row per lead/phone; `wa_id` (E.164 without +) and `lead_id` both UNIQUE; `bot_active/bot_paused_by/bot_paused_at` columns for AI chatbot toggle; `can_access_wa_conversation()` SECURITY DEFINER helper; RLS mirrors leads table exactly; Realtime enabled
- Migration 0033 (`whatsapp_messages`): append-only with one narrow exception — delivery receipt status updates (`status`, `status_at`) via service-role client; `wa_message_id` partial unique index (WHERE NOT NULL) to allow optimistic NULL rows; same RLS domain-scoping; no DELETE policy; Realtime enabled
- Migration 0034 (`whatsapp_conversation_reads`): per-agent read position for unread badge counts; UNIQUE(conversation_id, agent_id); agents read/write own rows only

---

## 2026-05-30 — Fix: replace GroupRow setSubtasksLoaded refetch with local append after subtask creation

---

## 2026-05-30 — Fix: hoist assignableUsers fetch from GroupRow to GroupTasksTab — single DB call for all groups

---

## 2026-05-30 — Fix: eliminate PersonalTasksTab mount re-fetch and quick-add full-reload — Phase 2

---

## 2026-05-30 — Fix: task remarks not stored / double message / "Unknown" author

Three bugs in the messaging system, all fixed together:

**Root causes:**

1. `TaskRemarksPanel` seeded `remarks` state from `initialRemarks` prop at mount. Since all call sites passed `initialRemarks={[]}`, the panel always opened empty — even though messages were in the DB.
2. On send, the panel waited for a Realtime echo to confirm the optimistic row. If the echo arrived but `incoming.author_id !== currentUserId` (e.g. stale closure), the optimistic row was never replaced — a second "Unknown" row was appended instead.
3. The optimistic row stayed half-opacity forever when the Realtime echo was the only confirmation path.

**Fix:**

- `TaskRemarksPanel` is now self-sufficient: fetches its own remarks from DB on mount via `getTaskRemarksAction`. The `initialRemarks` prop is removed entirely — no parent needs to pre-load remarks.
- On action success, `result.data` (the confirmed DB row) immediately replaces the optimistic row. Realtime echo then hits `seenIds` and is dropped. No double-append possible.
- Added `isLoading` state with "Loading…" empty state during the initial fetch.
- Removed `initialRemarks` from `SubTaskModalProps`, `GroupTaskWorkspace`, `PersonalTasksTab`, `GroupTasksTab` call sites.
- Added `getTaskRemarksAction` to `src/lib/actions/tasks.ts` (auth-gated server action wrapping `getTaskRemarks`).

---

## 2026-05-29 — Eliminated sequential DB round-trips in addLeadCallNote and updateLeadStatus (Phase perf-02)

`addLeadCallNote`: 9 sequential DB awaits (note insert + lead UPDATE + 3 activity inserts + second lead UPDATE + auth/access reads) collapsed to 1 RPC call.
`updateLeadStatus`: 5 sequential DB awaits (lead UPDATE + activity insert + nurturing task + task_gia_meta + optional won query) collapsed to 1 RPC call.
`assignLead`: post-update SELECT eliminated — lead status/domain now read before the UPDATE.
`getCallerProfile` local duplicate removed — replaced with `getCurrentProfile` import from `profiles-service.ts` (TD-001 resolved).

**Migrations:**

- `supabase/migrations/20260529000030_rpc_add_lead_call_note.sql` — `add_lead_call_note(p_lead_id, p_author_id, p_content, p_call_outcome, p_now)` RPC; SECURITY DEFINER; single transaction: note insert + lead UPDATE (call_count, last_call_outcome, last_activity_at, conditional status+status_changed_at) + call_logged activity + note_added activity + conditional status_changed activity (new→touched only); returns jsonb with `note_id`, `new_call_count`, `did_auto_advance`, `assigned_to`, `domain`, `old_status`
- `supabase/migrations/20260529000031_rpc_update_lead_status.sql` — `update_lead_status(p_lead_id, p_actor_id, p_status, p_reason, p_now)` RPC; SECURITY DEFINER; single transaction: early-return `{ changed: false }` when status unchanged; lead UPDATE + status_changed activity + conditional nurturing task + task_gia_meta; returns jsonb with `changed`, `old_status`, `new_status`, `assigned_to`, `domain`, `first_name`, `last_name`

**Action layer (`src/lib/actions/leads.ts`):**

- `addLeadCallNote` — steps 4–9 replaced with single `admin.rpc('add_lead_call_note', ...)` call; SLA side-effects remain fire-and-forget in action layer
- `updateLeadStatus` — steps 4–7 replaced with single `admin.rpc('update_lead_status', ...)` call; won notifications and SLA side-effects remain in action layer
- `assignLead` — added pre-update `SELECT status, domain` before the UPDATE; removed post-update SELECT entirely (zero post-update round-trips)
- `getCallerProfile` local function removed; all actions now use `getCurrentProfile` from `@/lib/services/profiles-service` (TD-001 resolved)

---

## 2026-05-29 — Dashboard waterfall eliminated — RSC consolidation + single cached RPC (Phase perf-01)

5 individual client-initiated server action calls on dashboard mount replaced with one cached RSC fetch.
GET /dashboard now delivers widgets with data on first paint — zero POST calls on initial load.

**Migration:**

- `supabase/migrations/20260529000029_get_dashboard_summary.sql` — `get_dashboard_summary(p_role, p_domain, p_user_id)` RPC; SECURITY DEFINER; single jsonb response with 4 keys: `agent_tasks`, `agent_activity`, `lead_status`, `campaigns`; role-based filtering inside CTEs mirrors exact service function logic; all COUNT fields cast `::int`; GRANT EXECUTE to authenticated

**New type:**

- `src/lib/types/index.ts` — `DashboardSummary` + 7 constituent types (`DashboardAgentTask`, `DashboardAgentTasksSummary`, `DashboardAgentActivity`, `DashboardLeadStatusCount`, `DashboardAgentStatusBreakdown`, `DashboardLeadStatusSummary`, `DashboardCampaignStatusMix`); shape exactly matches RPC jsonb output

**Service:**

- `src/lib/services/dashboard-service.ts` — `getDashboardSummary(role, domain, userId)` with React `cache()` (per-request memoisation); `unstable_cache` cannot be used here — `createClient()` calls `cookies()` which Next.js forbids inside `unstable_cache` closures; React `cache()` deduplicates within a single RSC render pass

**Page (RSC):**

- `src/app/(dashboard)/dashboard/page.tsx` — calls `getDashboardSummary()` once after `getCurrentProfile()`; passes result as `initialData` to `DashboardCanvas`

**Widget layer:**

- `WidgetProps` extended with `initialData?: DashboardSummary` (in `DashboardWidgetSlot.tsx`)
- `DashboardCanvas` threads `initialData` through `SortableWidget` → `DashboardWidgetSlot` → widget component
- `AgentTasksWidget`, `AgentActivityWidget`, `ManagerLeadStatusWidget`, `ManagerCampaignWidget` — skip mount fetch when `initialData` present; seed state directly; refresh buttons remain for user-initiated refetch
- `ManagerLeadVolumeWidget` — unchanged; period selector requires interactive fetch; no initial data seeding (volume data intentionally excluded from RPC — too period-dependent)
- All widgets now type-import from `@/lib/types` (Dashboard\* types); old service-layer types remain for refresh actions

**Invariants:**

- `getDashboardSummary` uses React `cache()` — deduplicated per request, per argument tuple (role+domain+userId); different users always get separate memoised results within their own request
- `ManagerLeadVolumeWidget` is the only widget that fires a server action on initial render
- Refresh buttons on `AgentTasksWidget`, `ManagerLeadStatusWidget`, `ManagerCampaignWidget` still call individual server actions (targeted, user-initiated only)

---

## 2026-05-29 — Settings page: Agent Roster + Shifts

New `/settings` route for manager/admin/founder — lead assignment configuration surface.

**No migration required.** `shift_start` and `shift_end` columns already existed on `agent_routing_config` (confirmed present in type definition).

**New type:**

- `src/lib/types/database.ts` — `AgentRosterRow` type: joined profile + routing config row returned by `getAgentRosterByDomain`

**Service extension:**

- `src/lib/services/agent-routing-service.ts` — `getAgentRosterByDomain(domain | '*')`: joins `profiles + agent_routing_config!inner`, adminClient, returns `AgentRosterRow[]`, ORDER BY domain ASC / full_name ASC
- `src/lib/services/agent-routing-service.ts` — `setAgentShift(agentId, shiftStart, shiftEnd)`: adminClient UPDATE on `agent_routing_config`

**Validation:**

- `src/lib/validations/agent-routing-schema.ts` — `SetAgentShiftSchema`: agentId uuid, shiftStart/shiftEnd regex `/^([01]\d|2[0-3]):([0-5]\d)$/` nullable, cross-field refine (end > start)

**Action extension:**

- `src/lib/actions/agent-routing.ts` — `setAgentShiftAction`: Zod → auth → manager domain check (getProfileById) → setAgentShift; revalidates `/settings`
- `src/lib/actions/agent-routing.ts` — `toggleAgentRouting`: now also revalidates `/settings` (added alongside admin/users revalidation)

**Page:**

- `src/app/(dashboard)/settings/page.tsx` — server component; agent/guest → redirect `/dashboard`; fetches `getAgentRosterByDomain`; page h1 with `page-title-dot`
- `src/app/(dashboard)/settings/SettingsShell.tsx` — `'use client'`; URL-param tab state (`?tab=roster|shifts`); `useTransition` + `router.replace`; renders `AgentRosterTab` or `AgentShiftsTab`

**Tab components:**

- `src/components/settings/AgentRosterTab.tsx` — agent card grid; domain filter pill bar (admin/founder only); `Toggle` for routing pool; optimistic update + toast.danger on error; `pendingIds` disable in-flight cards
- `src/components/settings/AgentShiftsTab.tsx` — table layout; `<input type="time">` for shift windows; blur-to-save when both fields valid; inline error for end≤start; inline hint when only one field filled; Clear button; `setAgentShiftAction`; `computeActiveHours` display

**Sidebar:**

- `src/components/layout/Sidebar.tsx` — "Settings" nav item (`Settings` lucide icon, `/settings`), visible to manager/admin/founder; under new "Configuration" section label

**CLAUDE.md updates:**

- `src/app/(dashboard)/settings/CLAUDE.md` — created
- `src/lib/CLAUDE.md` — services registry + actions registry updated

---

## 2026-05-29 — Gia SLA Engine (Phase 9)

Event-driven SLA enforcement for the Gia lead module. 8 SLA rules, IST business-hours math, auto-task creation on breach, two new notification types.

**Migrations:**

- `supabase/migrations/20260529000027_lead_sla_columns.sql` — adds `status_changed_at` + `last_activity_at` columns to `leads` (backfilled from `created_at`); extends `notifications` type CHECK to include `sla_breach_agent` + `sla_breach_manager`; documents `sla_breach` as valid `lead_activities.action_type`
- `supabase/migrations/20260529000028_lead_sla_timers.sql` — `lead_sla_timers` table with `lead_id`, `rule_code`, `scheduled_fire_at`, `trigger_run_id`, `status`, `fired_at`, `cancelled_at`; RLS scoped by role; no INSERT/UPDATE/DELETE policy for regular users — service role only; partial index on `status = 'pending'`

**Constants + utils:**

- `src/lib/constants/sla.ts` — `BUSINESS_HOURS` (IST, Mon–Sat, 09:00–19:00); `SLA_RULES` typed map of all 8 rule codes → config (statusTrigger, businessMinutes, recipient); `SLA_AUTO_TASK_TITLES` for agent rules; `getRulesForStatus()`, `getActivityRefreshRules()` helpers
- `src/lib/utils/sla.ts` — `nextBusinessDeadline(from, businessMinutes)`, `isWithinBusinessHours(ts)`, `businessMinutesBetween(start, end)`; all math anchored in Asia/Kolkata (IST)

**SLA rules:**

- `SLA-01A/B`: New lead — 15min (agent) / 30min (manager)
- `SLA-02A/B`: Touched lead — 1440min/24h (agent) / 2160min/36h (manager)
- `SLA-03A/B`: In-discussion lead — 1440min/24h (agent) / 2160min/36h (manager)
- `SLA-04A/B`: Active/nurturing lead — 5760min/4 biz-days (agent + manager)

**Types:**

- `src/lib/types/database.ts` — `SlaTimerStatus`, `LeadSlaTimer` types; `lead_sla_timers` Database table entry; `NotificationType` extended with `sla_breach_agent` + `sla_breach_manager`; `Lead` extended with `status_changed_at` + `last_activity_at`

**Trigger.dev:**

- `src/trigger/lead-sla.ts` — `fireLeadSlaTask` (Trigger.dev task; stale-fire guard; calls `fireSlaBreachAction`); `scheduleLeadSlasTask` (delayed job with idempotency key `lead-sla-${leadId}-${ruleCode}`, tag `lead-sla-${leadId}`); `cancelLeadSlasByLeadTask` (tag-based batch cancel)

**Service:**

- `src/lib/services/sla-service.ts` — `getSlaTimersForLead`, `getSlaTimerForLeadAndRule`, `createSlaTimer`, `updateSlaTimerRunId`, `cancelSlaTimersForLeadInDb`, `markSlaTimerFired`, `getOpenGiaFollowupTask`, `getManagersByDomain`

**Actions:**

- `src/lib/actions/sla.ts` — `scheduleSlaTimersForLead`, `cancelSlaTimersForLead`, `refreshActivitySlaTimers`, `fireSlaBreachAction` (Zod-validated Trigger.dev callback), `fireSlaBreachHandler` (8-step breach logic: stale-fire guard → call_count guard → recipient resolution → notification → auto-task dedup → activity log → timer mark fired)

**Hook points in `leads.ts`:**

- `assignLead` + `createManualLead` — after assignment: update `status_changed_at` + `last_activity_at`, schedule SLA-01 timers
- `updateLeadStatus` — after status write: update `status_changed_at`; terminal → cancel only; non-terminal → cancel + reschedule
- `addLeadCallNote` — after note write: update `last_activity_at`; auto-advanced new→touched → full SLA reset; else → refresh SLA-02/03 only

**UI:**

- `src/components/notifications/NotificationItem.tsx` — exhaustive switch extended: `sla_breach_agent` → `AlertTriangle` + `--color-warning-text`; `sla_breach_manager` → `AlertTriangle` + `--color-danger-text`

---

## 2026-05-29 — Group workspace page: Suspense streaming + WorkspaceSkeleton — perf

- `src/app/(dashboard)/tasks/[id]/page.tsx` — stripped to thin orchestrator; zero data-fetching; back link rendered immediately outside Suspense boundary
- `src/app/(dashboard)/tasks/[id]/WorkspaceAsync.tsx` — new async server component; `Promise.all([getTaskGroupById, getGroupSubtasks])`; null-group redirect lives here (not in page); passes serialisable plain objects to `GroupTaskWorkspace`
- `src/app/(dashboard)/tasks/[id]/WorkspaceSkeleton.tsx` — group header + view-toggle + 5 subtask row skeletons; stagger 0/80/160/240/320ms; `var(--theme-paper-subtle)` shimmer

---

## 2026-05-29 — Task system: getPersonalTasks unified onto single RPC (TD-003 resolved — priority sort consistent across all pages) — perf

- `supabase/migrations/20260529000026_get_personal_tasks_cursor.sql` — extends `get_personal_tasks` RPC with three cursor params (`p_cursor_id`, `p_cursor_due_at`, `p_cursor_has_due_at`); 4-case WHEN cursor WHERE clause handles all keyset pagination scenarios; sort order (`due_at ASC NULLS LAST → priority CASE → id ASC`) now identical on every page; drops old 6-param overload first to avoid creating a second overload
- `src/lib/services/tasks-service.ts` — split-path logic removed entirely; single unified RPC call path for both page 1 and pages 2+; no PostgREST query chain; no JS sort

---

## 2026-05-29 — Task system: DB index repair + query optimisation + Suspense streaming — Perf

Two-prompt performance hardening pass across the full task system stack.

### Prompt 1 — DB index repair + service query optimisation

- `supabase/migrations/20260529000025_task_performance_indexes.sql` — dropped and replaced `idx_tasks_assigned_to` and `idx_tasks_module` (both had `WHERE status = 'pending'` — invalid since migration 0017; fully inert); new conditions use `WHERE status NOT IN ('completed','cancelled','error')`; added `idx_tasks_agent_active` composite `(assigned_to, task_category, due_at ASC NULLS LAST)` covering the most frequent agent read; added `idx_tasks_tags_active` covering index `(assigned_to) INCLUDE (tags)` scoped to active personal tasks only; added `get_personal_tasks` RPC sorting `due_at ASC NULLS LAST → priority CASE (urgent=1,high=2,normal=3) → id ASC` at DB level (PostgREST cannot express `ORDER BY CASE`)
- `src/lib/services/tasks-service.ts` — `getPersonalTasks` JS `.sort()` removed; no-cursor path now calls `get_personal_tasks` RPC; cursor path retains PostgREST query; `getPersonalTaskTags` scoped to active tasks only (`.not('status','in','("completed","cancelled","error")')`); `getGroupTasks` wrapped in `unstable_cache` (60s TTL, cache tag `'group-tasks'`, domain in cache key — prevents cross-domain cache bleed)
- `src/lib/actions/tasks.ts` — `revalidateTag('group-tasks', { expire: 0 })` added to `createGroupTaskAction` and `createSubtaskAction` post-insert

### Prompt 2 — Tasks page Suspense streaming + deferred completed tasks

- `src/app/(dashboard)/tasks/page.tsx` — restructured as thin orchestrator; zero data-fetching in page body; `<Suspense fallback={<TasksSkeleton tab={tab}>}><TasksAsync /></Suspense>`
- `src/app/(dashboard)/tasks/TasksAsync.tsx` — new async server component; direct `<Suspense>` child; fetches active tab data only; passes serialisable plain objects to `TasksShell`
- `src/app/(dashboard)/tasks/TasksSkeleton.tsx` — two variants (personal: 3 priority headers + 5 rows each; group: 4 group cards); stagger 0/80/160/240/320ms per §11.4; `var(--theme-paper-subtle)` shimmer — zero hardcoded colour
- `src/components/tasks/PersonalTasksTab.tsx` — completed tasks no longer fetched on mount; `hasLoadedCompleted` ref set before action call fires (prevents double-fetch on rapid accordion toggle); loads lazily on first completed section expand only

---

## 2026-05-29 — Earth canvas: grain texture + radial washes

Earth canvas: grain texture + espresso/olive/umber radial washes. Base `#0d0c0a`. `.layout-canvas` class introduced.

- `src/styles/design-tokens.css` — `--theme-canvas` and `--theme-sidebar-bg` updated to `#0d0c0a` in `:root` and `[data-theme="earth"]`; Earth-specific `--theme-canvas-grain-opacity` and `--theme-canvas-gradient-*` tokens added (other themes omit these → flat canvas)
- `src/app/globals.css` — `html`/`body` base colour `#0d0c0a` to prevent load flash; `.layout-canvas` class with grain SVG data URI + theme-scoped gradient layers
- `src/app/(dashboard)/layout.tsx` — inline canvas background migrated to `.layout-canvas min-h-screen`
- `CLAUDE.md` + `.cursorrules` — File Locations, Theme Quick Reference, and Earth canvas enhancement phase entry
- `docs/design-dna.md` — Earth token map, §3.1 shell diagram, §3.5 canvas texture, §6.6 texture spec updated to `.layout-canvas`

---

## 2026-05-29 — Page title dot: blinking accent period on all primary nav pages

Introduced `eia-page-dot-blink` keyframe and `.page-title-dot` utility class as the standard for all primary navigation page titles. All existing pages retrofitted. Rule codified in CLAUDE.md, .cursorrules, and design-tokens.css.

- `src/styles/design-tokens.css` — `@keyframes eia-page-dot-blink` (2.4s ease-in-out, opacity 1 → 0.2 → 1); `.page-title-dot { color: var(--theme-accent); animation: eia-page-dot-blink 2.4s ease-in-out infinite; }`; `.type-page-title` comment updated to reference dot requirement
- `src/app/(dashboard)/tasks/page.tsx` — existing inline dot replaced with `type-page-title` + `page-title-dot` classes
- `src/app/(dashboard)/leads/page.tsx` — dot added
- `src/app/(dashboard)/performance/page.tsx` — dot added; inline styles replaced with `type-page-title`
- `src/app/(dashboard)/campaigns/page.tsx` — dot added
- `src/app/(dashboard)/campaigns/[id]/page.tsx` — dot added; inline styles replaced with `type-page-title`
- `src/app/(dashboard)/profile/page.tsx` — dot added; inline styles replaced with `type-page-title`
- `src/app/(dashboard)/error-log/page.tsx` — dot added; inline styles replaced with `type-page-title`
- `src/app/(dashboard)/admin/users/page.tsx` — page-level `<h1>` added (previously absent); dot added; Add Member button moved to page header row
- `CLAUDE.md` + `.cursorrules` — "Page title dot" rule added to Component Quick Reference

**Rule:** Every primary navigation page `<h1>` ends with `<span className="page-title-dot">.</span>`. Use `className="type-page-title"` on the `<h1>`. Detail pages with back links (leads/[id], campaigns/[id], admin/users/[id]) are exempt.

---

## 2026-05-29 — TabSelector pill: dark canvas chip fill

Visual upgrade — zero structural changes. Active tab now renders as a dark canvas chip on the light tray, matching the sidebar/canvas aesthetic. All five themes correct — both `--theme-canvas` and `--theme-canvas-text` are theme-scoped tokens.

- `src/components/ui/TabSelector.tsx` — pill `motion.span`: `background` changed from `--theme-accent-surface` to `--theme-canvas`; `border` changed from `--theme-paper-border` to `--theme-sidebar-border`; `box-shadow` upgraded from `--shadow-1` to `--shadow-2`. Active text: changed from `--theme-accent` to `--theme-canvas-text`, moved onto an inner `<span style="position:relative; z-index:1">` content wrapper so the colour transition (`color var(--duration-fast) var(--ease-in-out)`) applies to the label only and doesn't colour the absolute pill element. Button root colour set to `transparent` for pill variant. `border-bottom` and `connected` variants, `TabsContent`, `TabsProps`, `TabsList`, `TabSelector` wrapper — all unchanged.
- `src/components/CLAUDE.md` — `TabSelector` row updated: pill canvas fill, `--theme-canvas-text` active label, z-index content span requirement documented.

---

## 2026-05-29 — TabSelector: compound component upgrade

TabSelector upgraded to compound component architecture. Controlled/uncontrolled support, `indicatorLayoutId`, `animatedContent`, and `forceMount` scroll preservation. `TabSelector` flat-prop wrapper retained for full backwards compatibility — all existing consumers unchanged.

- `src/components/ui/TabSelector.tsx` — exports `Tabs` (root), `TabsList`, `TabsTrigger`, `TabsContent` as named compound components. `TabsContext` provides `value`, `onValueChange`, `layoutId`, `animatedContent`, `variant` — children read from context, eliminating prop drilling. Controlled/uncontrolled pattern: `value` + `defaultValue` + `onValueChange`. `TabsContent` uses `display:none` (not unmount) to preserve scroll position per tab — `forceMount` behaviour. Inner `motion.div` rendered conditionally so `AnimatePresence mode="wait"` works correctly. Spring indicator uses `SPRING_CONFIG` from `motion.ts` — no hardcoded `stiffness`/`damping`. All three variants (`pill`, `border-bottom`, `connected`) preserved. `TabSelector` flat-prop wrapper composes the compound API internally — zero changes needed at existing call sites.
- `src/lib/constants/motion.ts` — `SPRING_CONFIG` added: `{ type: 'spring', stiffness: 400, damping: 30 }`. Shared by all tab indicator animations. No hardcoded spring values in components.
- `src/components/CLAUDE.md` — compound API documented: `Tabs` props, `indicatorLayoutId` collision warning, `forceMount` + Realtime subscription audit requirement, `AnimatePresence` behaviour.

---

## 2026-05-29 — BarChart `colorMap` prop added. ManagerCampaignWidget adopted wrapper. Flag 4 cleared.

- `src/components/ui/charts/useChartTokens.ts` — `resolveColorMap(map: Record<string, string>)` exported. Resolves CSS variable strings (e.g. `"var(--color-info)"`) to computed hex/rgb values via `getComputedStyle`. Required because SVG `fill`/`stroke` attributes do not resolve CSS custom properties in all browsers (notably older Safari). Re-export pattern is identical to what `useChartTokens` does internally.
- `src/components/ui/charts/BarChart.tsx` — `colorMap?: Record<string, string>` prop added. Values are resolved via `resolveColorMap` on mount and re-resolved on `data-theme` attribute change (same `MutationObserver` approach as `useChartTokens`). `colorMap[key] ?? positionalColor` fill logic — partial maps are valid; unmatched keys fall back to positional tokens. Built-in Recharts `<Legend>` is suppressed when `colorMap` is provided (caller owns the legend). Additional passthrough props added: `margin`, `barCategoryGap`, `xAxisProps`, `yAxisProps`, `tooltipProps`, `gridProps` — removes the need for split rendering (some Recharts primitives in wrapper, some inline).
- `src/components/dashboard/widgets/ManagerCampaignWidget.tsx` — inline Recharts import replaced with `ui/charts/BarChart`. `CHART_SERIES` static constant (7 statuses, labels from `LEAD_STATUS_LABELS`) defined above the component. `colorMap={STATUS_COLORS}` passed as bridge — `STATUS_COLORS` stays in the feature folder (domain knowledge). `stacked` prop preserves stacked layout. Inline legend unchanged — reads `STATUS_COLORS` directly, same source as `colorMap`; legend and bars always in sync. Zero `<Cell>` in migrated code — fill is on `<Bar>` via wrapper.
- `docs/component-sweep-flags.md` — Flag 4 marked resolved.
- `src/components/CLAUDE.md` — `BarChart` row updated with `colorMap` prop contract and `STATUS_COLORS` pattern. `resolveColorMap` documented on `useChartTokens` row.

---

## 2026-05-29 — InfoRow micro-sweep complete. Flag 7 cleared.

InfoRow micro-sweep complete. 10 replacements across 2 files. Flag 7 cleared.

- `src/components/leads/LeadInfoCard.tsx` — 8 contact-field rows migrated from local `DatumRow`/`DatumValue` to `InfoRow`. `DatumRow`, `DatumValue`, and `DATUM_ICON_STYLE` deleted (no other file imported them). Full Name row uses `style={{ gridColumn: '1 / -1' }}` on `InfoRow` root — verified `style` pass-through lands on root element, not inner wrapper.
- `src/components/tasks/SubTaskModal.tsx` — Deadline and Assigned To key-variable rows migrated to `InfoRow` with icon + `React.ReactNode` values (mono date, italic empty state, Avatar composite).
- `docs/component-sweep-flags.md` — Flag 7 marked resolved. 10 unsafe candidates documented (forms, dt/dd grid, attribution strip, metric cards, edit-mode fields).
- `src/components/CLAUDE.md` — `InfoRow` row updated: `value` accepts `React.ReactNode`; `style`/`className` root pass-through documented. Reference implementation updated from deleted `DatumRow` to `InfoRow`.

---

## 2026-05-29 — Tasks UI: contextual header button + SubTaskModal polish + bug fixes

- `src/app/(dashboard)/tasks/TasksShell.tsx` — `createTrigger: number` state added; header row now flex `space-between` with tabs on the left and a contextual `+ My Task` / `+ Group Task` accent button on the right; button label switches live with the active tab; button hidden on Group tab for agents (mirrors server-side auth guard); `useState`, `Plus` (lucide) imported.
- `src/components/tasks/PersonalTasksTab.tsx` — toolbar div (New Task button) removed; `createTrigger?: number` prop added; `useEffect` opens modal when `createTrigger > 0`; unused `Plus` import removed.
- `src/components/tasks/GroupTasksTab.tsx` — toolbar div (New Group Task button) removed; `createTrigger?: number` prop added; `useEffect` opens modal when `createTrigger > 0`.
- `src/components/tasks/SubTaskModal.tsx` — three non-existent CSS tokens fixed throughout: `--theme-surface` → `var(--theme-paper)` (4×), `--theme-surface-secondary` → `var(--theme-paper-subtle)` (8×), `--theme-border` → `var(--theme-paper-border)` (20×); `--theme-overlay` backdrop → `rgba(0,0,0,0.5)`; `backdropFilter: blur` removed (not a sanctioned surface); panel centering shifted to `left: 240px` so modal centers in the content area, not the full viewport including sidebar; `currentUserName` prop added and threaded to `TaskRemarksPanel`.
- `src/components/tasks/TaskRemarksPanel.tsx` — status-change pill row above composer removed (6 pills, grid layout, `ALL_STATUSES`, `TASK_STATUS` import, injected `<style>`, `statusChange` state, `handleStatusToggle`); panel header ("Updates" label) removed; message list redesigned as floating `var(--theme-paper)` cards with `var(--shadow-1)` per message; Zone B background transparent with two ambient CSS-only orbs (`trp-orb-a` / `trp-orb-b`) — GPU-only `transform + opacity` animation, `will-change`, `pointer-events: none`, `aria-hidden`; composer upgraded to `var(--theme-paper)` + `var(--shadow-2)` floating card; `seenIds` ref (seeded from `initialRemarks`) added as primary Realtime dedup guard — prevents Strict Mode double-mount from appending the same row twice regardless of content match; echo dedup changed from content-match to `author_id === currentUserId + any pending optimistic row` (content-match was broken because `sanitizeText` alters strings server-side); `TASK_STATUS` import removed.
- `src/components/tasks/GroupTaskWorkspace.tsx` — `currentUserName` prop now passed to `SubTaskModal`.

---

## 2026-05-29 — `MotionButton` wrapper shipped. `Button` converted to `forwardRef`. Flag 6 infrastructure complete.

- `src/components/ui/Button.tsx` — converted from plain function to `React.forwardRef`. Required by Framer Motion's `motion()` factory. Zero API changes — all existing call sites unaffected. `ref` forwarded to underlying `<button>`.
- `src/components/ui/MotionButton.tsx` — `motion(Button)` wrapper. Accepts all `ButtonProps` plus Framer Motion props (`whileHover`, `whileTap`, `animate`, `initial`, `exit`, `layoutId`). Exports `MOTION_BUTTON_DEFAULTS` for standard press-down feel: `whileTap: { scale: 0.97 }`, spring transition with `INSTANT_DURATION` (100ms). Zero Button internals duplicated.
- Full audit of `src/`: confirmed 1 actual `motion.button` instance (not 6 — original flag conflated raw `<button>` with `motion.button`). That instance (`GroupTasksTab` "Add subtask" trigger) is a full-width layout button that cannot map to `Button` variant props — documented as open sub-flag in `docs/component-sweep-flags.md`.
- `docs/component-sweep-flags.md` — Flag 6 marked partially resolved; sub-flag documented.
- `src/components/CLAUDE.md` — `MotionButton` and `Button` (forwardRef note) rows updated.

---

## 2026-05-29 — `TabSelector`: `connected` variant added. `CreateUserForm` adoption complete. Flag 3 cleared.

- `src/components/ui/TabSelector.tsx` — `connected` added to `TabSelectorVariant` union (`'pill' | 'border-bottom' | 'connected'`). Container: `border: 1px solid var(--theme-paper-border)`, `--radius-md`, `--theme-paper-subtle` bg, `2px` inset padding. Active tab: `motion.span layoutId="tab-connected"` slides via same spring (stiffness 400, damping 30) shared by all three variants. Active tab bg is `--theme-paper` + `--shadow-1`. Active text is `--theme-text-primary`; inactive is `--theme-text-secondary`. Tabs `flex: 1` inside connected container. `SPRING_TRANSITION` constant extracted at module level — all three `motion.span` indicators now share it.
- `src/components/admin/CreateUserForm.tsx` — inline 25-line mode-switcher (two raw `<button>` elements) removed. `TabSelector` imported. `MODE_TABS` constant (static `TabItem[]`) added above component. Call site: `<TabSelector variant="connected" tabs={MODE_TABS} activeTab={mode} onChange={(id) => setMode(id as ...)} />`. `useState<"password" | "invite">` preserved unchanged — no logic touched.
- `docs/component-sweep-flags.md` — Flag 3 marked resolved.
- `src/components/CLAUDE.md` — `TabSelector` row updated with `connected` variant description.

---

## 2026-05-29 — `AvatarStack` component shipped. `GroupTasksTab` adoption complete. Flag 1 cleared.

- `src/components/ui/AvatarStack.tsx` — new display-only component. Props: `users: AvatarStackUser[]`, `max?: number` (default 4), `size?: AvatarSize` (default `sm`), `overlap?: number` (default 8px). Separator ring on each avatar: `box-shadow: 0 0 0 2px var(--theme-paper)` — no layout shift. Overflow pill: `+N`, `--radius-full`, paper-subtle background, same `size` dimensions. Hover spread: Framer Motion `whileHover` + per-item `x` variant (`i * overlap/2`) — zero margin/padding animation (rule compliant). Overflow pill also spreads on hover.
- `src/components/ui/Avatar.tsx` — `box-shadow` composition fix: `callerShadow` and `selectedShadow` are comma-joined so `AvatarStack`'s separator ring and `selected` accent ring coexist. Neither overwrites the other. `style.boxShadow` destructured before spread; `restStyle` applied without conflict.
- `src/components/tasks/GroupTasksTab.tsx` — inline `AvatarStack` function (48 lines) removed. Import updated to `ui/AvatarStack`. `avatarExtra` computation removed. Call site maps `assignee_previews → AvatarStackUser[]` (`full_name → name`, `avatar_url → imageUrl`).
- `docs/component-sweep-flags.md` — Flag 1 marked resolved.
- `src/components/CLAUDE.md` — `AvatarStack` row added; `Avatar` row updated with composition rule note.

---

## 2026-05-29 — Avatar: `selected` prop + accent ring. ManagerLeadVolumeWidget: chart colour wired to `useChartTokens`. Flags 2 + 5 cleared.

- `src/components/ui/Avatar.tsx` — `selected?: boolean` added to `AvatarProps`. When `true`: `box-shadow: 0 0 0 2px var(--theme-paper), 0 0 0 4px var(--theme-accent)` ring rendered via CSS `box-shadow` (not `border`) — zero layout shift, ring paints outside the element. Animates via `transition: box-shadow var(--transition-interactive)`. No Framer Motion. No size change. Unblocks `AssigneePickerModal` migration (Flag 2 cleared).
- `src/components/dashboard/widgets/ManagerLeadVolumeWidget.tsx` — `useChartTokens()` called inside the component. `Line` `stroke` and `activeDot.fill` now use `chartColors[0]` (runtime-resolved `--theme-accent` hex via `getComputedStyle`). Fixes SVG attribute color resolution across browsers (SVG does not resolve CSS custom properties natively in all engines). Chart repaints on theme switch via the hook's `MutationObserver`. (Flag 5 cleared.)
- `docs/component-sweep-flags.md` — Flags 2 and 5 marked resolved with resolution notes.
- `src/components/CLAUDE.md` — `Avatar` row updated with `selected` prop description and ring pattern.

---

## 2026-05-29 — Component sweep — 33 safe inline UI patterns replaced with `src/components/ui/` library

Adoption sweep across all of `src/`. Zero functional changes. `pnpm tsc --noEmit` passes with zero errors after all replacements. 7 items flagged in `docs/component-sweep-flags.md`.

**Replacements made (33 total across 20 files):**

- `Spinner` adopted in: `CalledModal`, `AgentScratchpad`, `PersonalDetailsCard`, `ProfileAvatarSection` — all `Loader2` inline spinners removed
- `Button` adopted in: `login-form`, `forgot-password-form`, `update-password-form`, `CreateUserForm`, `EditAuthorizationForm`, `EditProfileForm`, `ProfileDetailsForm`, `PasswordChangeForm`, `CalledModal`, `StatusActionPanel`, `AddLeadModal`, `AddLeadButton`, `PersonalDetailsCard`, `AgentTasksWidget`, `ManagerLeadStatusWidget`, `ManagerCampaignWidget` — all inline primary `<button>` elements removed
- `Toggle` adopted in: `NotificationPreferences`, `UserStatusControls` — custom `<button role="switch">` removed, helper functions `toggleStyle`/`thumbStyle` deleted
- `Avatar` adopted in: `TaskRemarksPanel`, `SubTaskModal`, `PersonalTasksTab`, `CreateGroupTaskModal`, `GroupTaskWorkspace`, `GroupTasksTab`, `UsersTable` — all local `getInitials()` helpers removed
- `SearchBar` adopted in: `UsersTable` — inline search `<input>` with manual icon positioning removed
- `Table` adopted in: `UsersTable` — raw `<table>/<thead>/<tbody>/<tr>/<td>` removed
- `TabSelector` (pill) adopted in: `ManagerLeadVolumeWidget`, `PerformancePeriodSelector` — inline period toggle buttons removed
- `TabSelector` (border-bottom) adopted in: `TasksShell` — custom underline tab bar with `onMouseEnter`/`onMouseLeave` imperative style mutations removed

**Flagged (7 items — not touched):** `AvatarStack` (no ui component), `AssigneePickerModal` selected avatar state, `CreateUserForm` connected-tab visual, `ManagerCampaignWidget` Recharts (7 semantic colors), `ManagerLeadVolumeWidget` Recharts (`--theme-accent` vs `--chart-1`), task icon-only `motion.button` instances (6 files), InfoRow candidates (not individually verified). See `docs/component-sweep-flags.md`.

---

## 2026-05-29 — Rule Q-12: mandatory codebase search before creating any code unit

- `docs/The_Rules.md` — Q-12 added to Section 6 (Code Quality): before creating any component, hook, util, or service function, search the codebase for an existing equivalent first; search by behaviour not filename; creating a duplicate is a violation regardless of whether names differ; applies to components, hooks, utils, service functions, constants, Zod schemas.
- `docs/The_Rules.md` — Section 8 (Never-Do List) updated: `NEVER create a component, hook, util, or service without first searching the codebase for an existing equivalent — search by behaviour, not filename (Q-12)`.
- `CLAUDE.md` + `.cursorrules` — new "Before Writing Any Code — Mandatory Sequence" block added above "When in Doubt": three-step order (read authority files → search by behaviour → write code). Replaces the implicit assumption that agents search before building.

---

## 2026-05-29 — UI-Foundation post-ship: useChartTokens MutationObserver + Table boundary docs

- `src/components/ui/charts/useChartTokens.ts` — `MutationObserver` added on `document.documentElement` watching `data-theme` attribute mutations. On every theme switch, `resolveTokens()` fires and all chart colours update immediately. No caller needs to pass `themeKey` in production — the hook is self-contained. `themeKey` prop kept as SSR/test escape hatch only. Observer cleaned up on unmount (`observer.disconnect()`).
- `src/components/ui/Table.tsx` — JSDoc added to `TableColumn<T>` clarifying the intended use boundary: Table<T> is for secondary/admin tables (audit logs, reporting grids). It is explicitly not intended to replace bespoke feature tables (LeadsTable, future task table) that need custom toolbars, column pickers, and drag-to-reorder. Prevents future misuse.
- `src/components/CLAUDE.md` — Three architectural decisions locked: (1) visual test surface = `/dev/components` route (no Storybook), (2) `useChartTokens` is MutationObserver-driven, (3) `Table<T>` vs bespoke feature table boundary.

---

## 2026-05-29 — Phase UI-Foundation — Component library shipped

Full display-only, token-compliant, theme-aware UI component library. All components live in `src/components/ui/`. All colours are CSS variables — zero hardcoded hex in any `.tsx` file. Zero business logic. Zero DB calls. `pnpm tsc --noEmit` passes with zero errors.

**New files:**

- `src/lib/constants/motion.ts` — shared Framer Motion constants (`ENTER_DURATION`, `EXIT_DURATION`, `EASE_OUT_EXPO`, `EASE_IN_EXPO`, `EASE_SPRING`, `EASE_IN_OUT`, `MODAL_VARIANTS`, `DROPDOWN_VARIANTS`, `FADE_VARIANTS`). All animation components import from here — never re-declare inline.
- `src/components/ui/Spinner.tsx` — three sizes (sm/md/lg); reuses `eia-spin` keyframe; canvas variant.
- `src/components/ui/Button.tsx` — five variants (primary/secondary/ghost/danger/success); four sizes; loading state; iconLeft/iconRight slots; `--theme-accent-fg` on primary (V-02 compliant).
- `src/components/ui/Avatar.tsx` — five sizes; square `--radius-md`; initials fallback with 6 semantic colour pairs from name hash (colour variety guaranteed); `loading="lazy"` (P-04).
- `src/components/ui/SearchBar.tsx` — controlled; Lucide Search icon; clear button; focus ring `--shadow-focus`; three sizes; `--theme-accent` border on focus.
- `src/components/ui/InfoRow.tsx` — label/value pair; optional icon; optional copy-to-clipboard; horizontal/stacked; border-bottom divider.
- `src/components/ui/TabSelector.tsx` — spring pill (Framer Motion `layoutId`); pill and border-bottom variants; count badge; `activeTab`/`onChange` API.
- `src/components/ui/Dialog.tsx` — Eia overlay (`--theme-canvas` at 0.72 opacity); `--theme-paper` surface; `--shadow-4`; `--radius-xl`; Framer Motion `AnimatePresence`; five sizes (sm/md/lg/xl/full); `--duration-enter`/`--duration-exit`; `EASE_OUT_EXPO`/`EASE_IN_EXPO`.
- `src/components/ui/FilterDropdown.tsx` — trigger with icon + label + chevron + active count badge; `--theme-paper` menu; `--shadow-3`; multi-select (checkbox) and single-select modes; `DROPDOWN_VARIANTS`.
- `src/components/ui/Table.tsx` — generic `TableColumn<T>` / `TableProps<T>`; sticky header option; `--theme-paper-subtle` header bg; selected row `--theme-accent-surface`; `virtualized` prop; dev-only `console.warn` when `rowCount > 100 && !virtualized` (P-03).
- `src/components/ui/ListRow.tsx` — left slot (avatar/icon), primary text, secondary text, right slot, optional chevron; `--theme-paper` bg; hover `--theme-paper-subtle`; `--radius-md`.
- `src/components/ui/ProgressBar.tsx` — auto-intent (value<33→danger, 33–66→warning, >66→success); `intent` override prop; Framer Motion fill animation (`--ease-spring`, `--duration-slow`); label slot.
- `src/components/ui/Toggle.tsx` — sm/md sizes; spring thumb animation; label + description slot; `--theme-accent` on track when checked.
- `src/components/ui/ChecklistItem.tsx` — `CheckSquare2`/`Square` icons; checked state: label strikethrough + `--color-success` icon.
- `src/components/ui/Checklist.tsx` — ordered list of `ChecklistItem`; `ProgressBar` at top; composes both without duplication.
- `src/components/ui/RadioGroup.tsx` — default and card variants; card fills `--theme-accent-surface` when selected; filled circle indicator.
- `src/components/ui/Calendar.tsx` — month grid; Framer Motion slide between months (`--ease-spring`); today underline dot; selected filled `--theme-accent`; range highlight `--theme-accent-surface`.
- `src/components/ui/DatePicker.tsx` — trigger + popover mounting `Calendar`; `DROPDOWN_VARIANTS`; focus ring `--shadow-focus`.
- `src/components/ui/EditButton.tsx` — icon-only Pencil button; ghost default; accent on hover; "Edit" tooltip; composes hover states without re-implementing Button internals.
- `src/components/ui/Accordion.tsx` — `ChevronDown` rotating 180° (`--ease-spring`); `AnimatePresence` height animate; single/multiple type; border `--theme-paper-border`; trigger bg `--theme-paper-subtle` when open.
- `src/components/ui/Modal.tsx` — semantic wrapper around `Dialog.tsx`; standard type exposes title/description/footer slots; `type="lia"` enforces exactly two actions (Approve + Dismiss) with `LiaGlyph` breathing; `maxWidth` prop for backward compat with existing callers.
- `src/components/ui/charts/useChartTokens.ts` — resolves 6 series colours + grid/axis/tooltip tokens from `getComputedStyle` at runtime; `themeKey` dep triggers re-resolve on theme switch; fallback values = Earth theme resolved values (only used SSR / before mount).
- `src/components/ui/charts/ChartSkeleton.tsx` — skeleton block matching chart dimensions; reuses `.skeleton` class (`eia-skeleton-pulse`).
- `src/components/ui/charts/LineChart.tsx` — Recharts `LineChart`; all colours via `useChartTokens`; `loading` → `ChartSkeleton`.
- `src/components/ui/charts/BarChart.tsx` — Recharts `BarChart`; stacked option; top-radius-only bars per §16.4; `Cell` per bar.
- `src/components/ui/charts/PieChart.tsx` — Recharts `PieChart`; token colours; legend.
- `src/components/ui/charts/DonutChart.tsx` — Recharts `PieChart` with `innerRadius`; optional `centerLabel` slot.
- `src/components/ui/charts/AreaChart.tsx` — Recharts `AreaChart`; gradient fill via `linearGradient` (token colour, not hex); stacked option.
- `src/components/ui/charts/ButterflyChart.tsx` — Recharts `BarChart` `layout="vertical"` with negative left series; axis formatter strips minus sign.

**Sign-off passed:**

- `pnpm tsc --noEmit` → 0 errors
- `grep` for `text-gray|bg-white|bg-black|text-white|#[hex]` in `src/components/ui/**/*.tsx` → 0 results
- Every component exports a named TypeScript interface for its props
- `Avatar` fallback: 6 semantic colour pairs derived from name hash — guaranteed variety
- `ProgressBar` auto-intent: 20→danger, 50→warning, 80→success ✓
- Charts: all colours resolved via `useChartTokens` at runtime — zero hardcoded hex passed to Recharts props ✓
- `Dialog` enter = `ENTER_DURATION` (400ms), exit = `EXIT_DURATION` (250ms) — matches tokens ✓
- `Table` logs dev-only `console.warn` when `rowCount > 100 && !virtualized` ✓
- No new Framer Motion keyframes — reuses `eia-spin`, `eia-skeleton-pulse` from `design-tokens.css` ✓
- No component imports from feature folders ✓
- No `useState` for data fetching in any component ✓

---

## 2026-05-29 — SubTaskModal: fix transparent background (bogus tokens)

- `src/components/tasks/SubTaskModal.tsx` — three non-existent CSS tokens replaced throughout: `--theme-surface` → `var(--theme-paper)` (4 occurrences), `--theme-surface-secondary` → `var(--theme-paper-subtle)` (8 occurrences), `--theme-border` → `var(--theme-paper-border)` (20 occurrences); `--theme-overlay` (backdrop) → `rgba(0,0,0,0.5)` matching `ui/modal.tsx` canonical; `backdropFilter: blur(4px)` removed from backdrop per NEVER rule (blur only sanctioned on TopBar, mobile sidebar overlay, command palette).

---

## 2026-05-29 — Task tags: DB persistence + tag filter

- `supabase/migrations/20260529000024_task_tags.sql` — `tags text[] NOT NULL DEFAULT '{}'` added to `tasks`; GIN index `idx_tasks_tags_gin` (partial: `task_category='personal'`) for array containment queries.
- `src/lib/types/database.ts` — `Task.tags: string[]` added; `Insert` type updated to make `tags` optional.
- `src/lib/validations/task-schemas.ts` — `CreatePersonalTaskSchema` now includes `tags: z.array(...).max(10).default([])`; new `UpdateTaskTagsSchema` + `UpdateTaskTagsInput` exported.
- `src/lib/services/tasks-service.ts` — `PersonalTaskFilters.tags?: string[]` added; `getPersonalTasks` applies `.contains('tags', filters.tags)` when tags are provided; new `getPersonalTaskTags(userId)` returns sorted distinct tags for a user.
- `src/lib/actions/tasks.ts` — `createPersonalTaskAction` now writes `tags` to DB; new `updateTaskTagsAction` (full replace, auth-gated); new `getPersonalTaskTagsAction` read action.
- `src/components/tasks/CreatePersonalTaskModal.tsx` — "Saved locally only (DB column pending)" stub removed; `tags` now passed to `createPersonalTaskAction` and included in `syntheticTask`; `useCallback` dep array updated.
- `src/components/tasks/PersonalTasksTab.tsx` — `availableTags` + `selectedTags` state added; tags loaded in parallel with tasks on mount; tag filter bar renders when tags exist (pill toggles, "Clear" link); `tasksByPriority` grouping filters by `selectedTags` client-side; empty state copy adapts to tag-filtered state.

---

## 2026-05-29 — Tasks ecosystem design polish

- `src/app/(dashboard)/tasks/page.tsx` — page `<h1>` converted from Tailwind `type-page-title` class to full inline token composition; accent period `<span style="color: var(--theme-accent)">.</span>` added per design-dna §03.
- `src/app/(dashboard)/tasks/TasksShell.tsx` — tab bar: tabs renamed "My Tasks" / "Group Tasks"; tab height set to 40px; `display: inline-flex` + `align-items: center` for correct vertical centering; font-weight upgraded to `--weight-medium` on inactive tabs; hover transition narrowed to `color + background` only; `transition: all` removed.
- `src/components/tasks/PersonalTasksTab.tsx` — "New Task" button: `--radius-md` → `--radius-sm` (§5.01 buttons always `--radius-sm`), fixed height 36px, opacity hover → `--theme-accent-hover` background per §5.01 state spec; completion circle and arrow button: `width/height '24px'` → `var(--space-6)`; assignee avatar: `'20px'` → `var(--space-5)`; task-count pill: `'1px'` padding → `var(--space-px)`; quick-add date input `'3px'` padding → `var(--space-1)`; assignee button `'28px'` → `var(--space-7)`; initials `'9px'` fontSize → `var(--text-2xs)`; cancel button `'24px'` → `var(--space-6)`.
- `src/components/tasks/GroupTasksTab.tsx` — "New Group Task" button: same fixes as above (radius, height, hover); AvatarStack: `'22px'` → `var(--space-6)`, `'8px'` fontSize → `var(--text-2xs)` throughout; group description `marginTop: '2px'` → `var(--space-px)`; "Open" link gap `'3px'` → `var(--space-1)`; group + subtask status pills: `'3px'/'2px'` padding → token equivalents, `'11px'` fontSize → `var(--text-xs)`, `'4px'` gap → `var(--space-1)`, `box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.06)` added per §07 (pill shadow rule); subtask assignee avatar: `'20px'` → `var(--space-5)`, `'7px'` fontSize → `var(--text-2xs)`; add-subtask picker button `'26px'` → `var(--space-7)`, `'8px'` fontSize → `var(--text-2xs)`, save button `'2px'` padding → `var(--space-1)`; group empty state: card border + shadow added per §04 + §05.
- `src/components/tasks/CreateGroupTaskModal.tsx` — `max-w-3xl` → `max-w-2xl`; preview column 280px → 200px; two-column gap `--space-8` → `--space-6`; V-01 violations: `rgba(255,255,255,0.85)` swatch ring → CSS border/outline pattern; `'8px'/'9px'` fontSize → `var(--text-2xs)`; `'3px'` padding → token equivalents; `var(--space-9)` (non-existent) → `var(--space-8)`; icon buttons given fixed `height: 32` instead of bare padding; textarea `resize: none` → `resize: vertical`; `margin: '0 0'` on divider removed.

---

## 2026-05-29 — SubTaskModal + task attachments (checklist)

- `supabase/migrations/20260529000023_task_attachments.sql` — `ADD COLUMN attachments jsonb NOT NULL DEFAULT '[]'` to `tasks`; CHECK constraint `tasks_attachments_is_array` validates JSON array type; intentionally excluded from `log_task_changes()` trigger (auditing checklist toggles would flood `task_audit_log`).
- `src/lib/types/database.ts` — `ChecklistItem` type (`{ id, text, checked }`) added and exported; `Task.attachments: ChecklistItem[]` added.
- `src/lib/validations/task-schemas.ts` — `UpdateChecklistSchema` + `UpdateChecklistInput` added.
- `src/lib/actions/tasks.ts` — `updateChecklistAction` added: Zod → auth → RLS (user client) → application-layer canMutateTask → adminClient UPDATE; returns `ChecklistItem[]`.
- `src/components/tasks/SubTaskModal.tsx` — new `'use client'` component replacing `TaskModal.tsx`. Centered overlay (not bottom sheet). `max-width: 1100px`, `height: 90vh`. Scale entrance 0.96→1. Header: breadcrumb + status/priority inline dropdowns (optimistic) + edit pencil + ⋯ delete menu + ×. Zone A (38%): title, notes/objective, checklist with `@dnd-kit/sortable` in edit mode, key variables, metadata. Zone B (62%): `TaskRemarksPanel` with `composerPlaceholder` prop. Edit mode save calls `updateTaskAction` only — never inserts a remark. `AnimatePresence` must wrap conditional at call site.
- `src/components/tasks/TaskRemarksPanel.tsx` — `composerPlaceholder?: string` prop added (default `"Add an update…"`); textarea uses prop value.
- `src/components/tasks/TaskModal.tsx` — **deleted**. All call sites updated to `SubTaskModal`.
- `src/components/tasks/GroupTaskWorkspace.tsx`, `GroupTasksTab.tsx`, `PersonalTasksTab.tsx` — `TaskModal` import replaced with `SubTaskModal`; `AnimatePresence` wrapping added at call sites; props updated to new shape.
- `src/components/CLAUDE.md`, `src/app/(dashboard)/CLAUDE.md`, `supabase/migrations/CLAUDE.md` — updated to reflect SubTaskModal and migration 0023.

---

## 2026-05-29 — CreateGroupTaskModal

- `src/lib/constants/task-constants.ts` — `GROUP_TASK_ACCENT_COLORS` (10 muted hex colours with id/hex/label) and `GROUP_TASK_ICONS` (25 Lucide icon names as id/label pairs) added; both with TODO comments noting the DB columns they need.
- `src/components/tasks/CreateGroupTaskModal.tsx` — new `'use client'` modal composing `ui/modal.tsx` (`max-w-3xl`); two-column layout (280px preview + form, collapses to single-column at ≤640px); live preview card updates on every keystroke; fields: Title, Description, Domain (APP_DOMAINS select), Accent Colour swatches, Icon grid (dynamic Lucide lookup), Priority chips, Due Date, Add Members; accent_color/icon_key/memberIds are UI-only — no DB columns yet, NOT passed to `createGroupTaskAction`; member search stubs to empty until `searchProfilesAction` exists; `useTransition` + `isPending` guard; `onCreated` receives synthetic `TaskGroup` on success.
- `src/components/tasks/GroupTasksTab.tsx` — `groupRows` local state (initialized from `initialRows`); "New Group Task" toolbar button added (visible to manager/admin/founder only); `handleGroupCreated` converts `TaskGroup` → `TaskGroupRow` and prepends; empty-state copy updated to mention the button; `CreateGroupTaskModal` wired.
- `src/components/CLAUDE.md` — `CreateGroupTaskModal` contract section added.

---

## 2026-05-29 — CreatePersonalTaskModal

- `src/components/tasks/CreatePersonalTaskModal.tsx` — new `'use client'` modal composing `ui/modal.tsx`; fields: Title (autofocus, auto-grow 1→3 lines), Due date (Today/Tomorrow/Next week preset chips + specific `datetime-local` toggle; presets use IST end-of-day via explicit UTC+5:30 offset), Priority (Urgent/High/Normal single-select chips from `TASK_PRIORITY`; Normal is default/fallback), Tags (free-text chip input, Enter/comma to add, max 10; UI-only — `tasks.tags` column does not exist yet), Notes (collapsed "+ Add notes" toggle); client-side Zod validation before action call; `useTransition` + `isPending` guard; on success: `onCreated(syntheticTask)` fires so parent can prepend without re-fetch; on error: `toast.danger`, modal stays open.
- `src/components/tasks/PersonalTasksTab.tsx` — "New Task" header button now opens `CreatePersonalTaskModal` (was: inline quick-add row). Quick-add row is unchanged and independent. `onCreated` handler prepends the returned task to `activeTasks` state — no re-fetch needed. `createModalOpen` state added.
- `src/components/CLAUDE.md` — `CreatePersonalTaskModal` contract section added.

---

## 2026-05-29 — Group Task Workspace (`/tasks/[id]`)

- `src/lib/services/tasks-service.ts` — `getTaskGroupById(groupId): Promise<TaskGroup | null>` added; server Supabase client; RLS enforces domain-scoped access; null means no access or not found.
- `src/lib/actions/tasks.ts` — `getTaskGroupByIdAction(groupId)` added; thin wrapper; returns `ActionResult<TaskGroup>`.
- `src/app/(dashboard)/tasks/[id]/page.tsx` — new Server Component; fetches `getTaskGroupById` + `getGroupSubtasks` in parallel; null group → `redirect('/tasks?tab=group')` (no 404); passes data as props to `GroupTaskWorkspace`.
- `src/components/tasks/GroupTaskWorkspace.tsx` — new `'use client'` component; List view (priority DESC + due_at ASC) + Board view (5 columns: To Do, In Progress, In Review, Completed, Error/Cancelled); view persisted to `localStorage` at `eia:tasks:workspace-view:${groupId}` (default `'list'`, hydrated after mount — no SSR mismatch); Realtime subscription `workspace-subtasks-${groupId}-${mountId}`; click row/card → `TaskModal`; status changes re-sync via `getGroupSubtasksAction` on modal close; floating `+ Add subtask` FAB (title + assignee + priority + due date; `createSubtaskAction`; re-fetches on success); no drag-and-drop; no inline complete.
- `src/components/tasks/GroupTasksTab.tsx` — "Open" link added to each group header row; `Link href="/tasks/${group.id}"` with `e.stopPropagation()` on click/keydown to prevent accordion expand.
- `src/app/(dashboard)/CLAUDE.md` — Group Task Workspace route documented.
- `src/components/CLAUDE.md` — `GroupTaskWorkspace` contract section added.

---

## 2026-05-29 — PersonalTasksTab full redesign: priority sections + completion circles

- `src/lib/services/tasks-service.ts` — `PersonalTaskFilters.limit?: number` added (capped at 500 in service; default `PERSONAL_TASKS_PAGE_SIZE`); `getPersonalTasks` now derives `pageSize` from `filters.limit`, uses it for both the DB `.limit()` and the `hasMore` / `page.slice()` logic.
- `src/components/tasks/PersonalTasksTab.tsx` — **full rewrite**. Removed: filter bar (status pills, priority pills, due date range), cursor-stack pagination, `quickPriority` state. Added: three active priority sections (URGENT / HIGH / NORMAL) + COMPLETED section (collapsed by default, last 20); section collapse via `useRef` (never `useState`) so optimistic updates don't collapse sections; completion circle (24px) per row — own tasks clickable, assigned-to-other dashed non-interactive; optimistic status map keyed by `taskId` with rollback on error; due date chip (`var(--color-danger-text)` overdue / `var(--color-warning-text)` today / tertiary future); quick-add `useTransition` guard preserved from Problem 7; priority defaults to `'normal'` in quick-add; data fetched via parallel `Promise.all` on mount with `limit: 500` for active and `limit: 20` for completed.
- `src/components/CLAUDE.md` — `PersonalTasksTab` contract section added.

---

## 2026-05-29 — TaskModal redesign: TaskRemarksPanel replaces TaskChatPanel

- `src/components/tasks/TaskRemarksPanel.tsx` — new client component; replaces `TaskChatPanel`; timeline (oldest→newest, auto-scroll to bottom on mount/new remark); status chip per remark when `status_change` is set (colour-coded using `TASK_REMARK_STATUS_LABELS` + `STATUS_CHIP_COLORS`); suppressed-remark italic placeholder; Playfair italic empty state; compose area with textarea (auto-height, max 3 lines), 6 status-change toggle pills (3-col desktop, 2-col mobile via `.task-remarks-status-pills`), "Post update" button; `useTransition + isPending` guard; optimistic insert at 0.6 opacity confirmed on Realtime echo; channel name `task-remarks-${taskId}-${mountId}` (Strict Mode safe); exports `TaskRemarkWithAuthor` (re-exported from `tasks-service`).
- `src/components/tasks/TaskModal.tsx` — imports `TaskRemarksPanel`; `initialMessages` prop renamed to `initialRemarks`; both desktop and mobile sheet use `TaskRemarksPanel`.
- `src/components/tasks/TaskChatPanel.tsx` — **deleted**.
- `src/components/tasks/PersonalTasksTab.tsx` — import updated to `TaskRemarksPanel`; prop renamed `initialRemarks`.
- `src/components/tasks/GroupTasksTab.tsx` — prop renamed `initialRemarks`.
- `src/components/CLAUDE.md` — TaskModal and TaskRemarksPanel contracts updated; TaskChatPanel section removed.

---

## 2026-05-29 — Service + action layer for task_remarks

- `src/lib/validations/task-schemas.ts` — `AddTaskRemarkSchema` updated: `content` capped at 2000 chars; `statusChange: StatusEnum.optional()` field added.
- `src/lib/services/tasks-service.ts` — `getTaskMessages` replaced by `getTaskRemarks(taskId): Promise<TaskRemarkWithAuthor[]>`; queries `task_remarks` ordered ASC (oldest first); batch-resolves author profiles in one query (no N+1); `TaskRemarkWithAuthor` exported as the canonical type definition; `TaskWithMessages.messages` updated to `TaskRemarkWithAuthor[]`; `getTaskById` calls `getTaskRemarks`.
- `src/lib/actions/tasks.ts` — `addTaskMessageAction` replaced by `addTaskRemarkAction`: Zod → auth → task visibility check (assigned_to / created_by / manager+) → optional `updateTaskStatusAction` call (status logic not duplicated) → INSERT via adminClient; returns `ActionResult<TaskRemark>`. `suppressTaskMessageAction` replaced by `suppressTaskRemarkAction`: Zod → admin/founder guard → existence check (S-06) → idempotent suppression write; returns `ActionResult<{ remarkId }>`.
- `src/lib/constants/task-constants.ts` — `TASK_REMARK_STATUS_LABELS: Record<TaskStatus, string>` added; covers all 6 status values with past-tense labels for the timeline UI.
- `src/components/tasks/TaskChatPanel.tsx` — imports `addTaskRemarkAction`; imports and re-exports `TaskRemarkWithAuthor` from `tasks-service` (single canonical definition); `author` in optimistic insert now includes `id` field; deprecated `TaskMessageWithAuthor` alias removed.
- `src/lib/CLAUDE.md` — services/actions registry updated; `addTaskRemarkAction` and `suppressTaskRemarkAction` contract sections added.

---

## 2026-05-29 — Migration 0022: task_messages → task_remarks rename

- `supabase/migrations/20260529000022_task_remarks.sql` — Part A: `DROP TABLE task_messages CASCADE` (pre-production table, no data to preserve; CASCADE removes RLS policies, index, and Realtime publication entry automatically). Part B: creates `task_remarks` with all columns from `task_messages` plus `status_change text` (nullable, CHECK values mirror `tasks.status` CHECK — coupled, must stay in sync). RLS SELECT/INSERT mirror migration 0019 visibility rule (assigned_to, created_by, manager+); suppression UPDATE policy for admin/founder (row-level, column restriction enforced at action layer). `idx_task_remarks_task_id` on `(task_id, created_at ASC)` — ASC for oldest-first timeline. Realtime enabled on `task_remarks`.
- `src/lib/types/database.ts` — `TaskMessage` type removed; `TaskRemark` type added (adds `status_change: TaskStatus | null`); `task_messages` Database block removed; `task_remarks` Database block added with updated FK names.
- `src/lib/services/tasks-service.ts` — `getTaskMessages` now queries `task_remarks` with `ascending: true`; return type updated to `TaskRemark[]`; `TaskWithMessages.messages` updated accordingly.
- `src/lib/actions/tasks.ts` — `addTaskMessageAction` inserts into `task_remarks`; `suppressTaskMessageAction` reads/writes `task_remarks`; delete task comment updated.
- `src/lib/validations/task-schemas.ts` — `AddTaskMessageSchema` → `AddTaskRemarkSchema`; `SuppressTaskMessageSchema` → `SuppressTaskRemarkSchema`; input types renamed accordingly.
- `src/components/tasks/TaskChatPanel.tsx` — exports `TaskRemarkWithAuthor` (primary); `TaskMessageWithAuthor` kept as deprecated alias; Realtime channel renamed `task-remarks-${taskId}-${mountId}`; table filter updated to `task_remarks`; optimistic insert gains `status_change: null`.
- `src/components/tasks/TaskModal.tsx` — imports `TaskRemarkWithAuthor`; `initialMessages` prop type updated.
- `src/components/tasks/PersonalTasksTab.tsx` — imports `TaskRemarkWithAuthor`; `selectedTaskMessages` state renamed `selectedTaskRemarks` with correct type.
- `supabase/migrations/CLAUDE.md` — migration 0022 added to inventory; `task_remarks` append-only contract documented; `status_change` coupling warning added.
- `src/lib/CLAUDE.md` — service/action registry entries updated; `suppressTaskMessageAction` contract updated to reference `task_remarks`.
- `src/components/CLAUDE.md` — `TaskModal` and `TaskChatPanel` props updated; channel name and export updated.

---

## 2026-05-29 — Heap OOM fix: singleton browser client, Realtime teardown, dashboard hydration, tasks dual-fetch

- `src/lib/supabase/client.ts` — singleton pattern: module-level `_client` variable; `createClient()` returns same reference on every call; one WebSocket connection and channel registry across all components; `_resetClientForTests()` escape hatch gated to `NODE_ENV === 'test'`.
- `src/components/dashboard/widgets/AgentActivityWidget.tsx` — Fix A: cleanup changed from `channel.unsubscribe()` to `supabase.removeChannel(channel)` to fully deregister from the singleton client's channel list. Fix B: channel name now includes `useId()` mount suffix (`agent-activity:${userId}:${mountId}`) to prevent Strict Mode double-mount from calling `.on()` on an already-subscribed channel.
- `src/hooks/useNotifications.ts` — audited; already uses `supabase.removeChannel(channel)` correctly; no change needed.
- `src/hooks/useDashboardLayout.ts` — hydration `useEffect` now calls `setStored` only when the persisted layout differs from the default already set synchronously; prevents full widget tree unmount/remount on every navigation.
- `src/components/dashboard/DashboardCanvas.tsx` — removed `isHydrated` skeleton gate; widgets render immediately with default layout; no layout shift on hydration because defaults and stored layout are often identical; `WidgetSkeleton` and `DEFAULT_LAYOUT_BY_ROLE` imports removed.
- `src/app/(dashboard)/tasks/page.tsx` — reads `searchParams.tab` and fetches only the active tab's data; inactive tab receives a zero-value sentinel; halves server work and RSC payload on every `/tasks` navigation.
- `src/lib/CLAUDE.md` — singleton contract and Realtime teardown pattern documented.
- `src/app/(dashboard)/CLAUDE.md` — hydration rule and tasks single-fetch rule updated.

## 2026-05-28 — Migration 0021: task_messages suppression + task_audit_log

- `supabase/migrations/20260528000021_task_suppression_audit.sql` — Part A: adds `is_suppressed` (bool NOT NULL DEFAULT false), `suppressed_by` (uuid FK → profiles ON DELETE SET NULL), `suppressed_at` (timestamptz) columns to `task_messages`; adds `task_messages_suppression_update` RLS UPDATE policy for admin/founder (row-level only — column restriction at action layer). Part B: creates `task_audit_log` append-only table (id, task_id, changed_by, field_name, old_value, new_value, changed_at) with `idx_task_audit_log_task_id` index; RLS SELECT for manager/admin/founder; no INSERT/UPDATE/DELETE policies; `log_task_changes()` SECURITY DEFINER trigger fires AFTER UPDATE on tasks, logs six fields (title, description, status, priority, due_at, assigned_to).
- `src/lib/types/database.ts` — `TaskMessage` type updated with suppression fields; `TaskAuditLog` type added; `task_messages` Database entry updated (Insert/Update types narrowed); `task_audit_log` Database entry added.
- `src/lib/validations/task-schemas.ts` — `SuppressTaskMessageSchema` + `SuppressTaskMessageInput` added.
- `src/lib/actions/tasks.ts` — `suppressTaskMessageAction` added: Zod → admin/founder guard → message existence check (S-06) → idempotent suppression write via adminClient.
- `src/components/tasks/TaskChatPanel.tsx` — suppressed messages render as "This message was removed." (tertiary italic, same row height); original content never shown for any role; optimistic inserts carry `is_suppressed: false`.

---

## 2026-05-28 — PersonalTasksTab: replace unbounded append with page-replace pagination (Fix — P-03)

Option A chosen: `@tanstack/virtual` was not in `package.json`; no new dependency added.

- `src/components/tasks/PersonalTasksTab.tsx` — `handleLoadMore` (append) removed; replaced with `handleNextPage` (replaces task list, pushes previous cursor onto `cursorStack`) and `handlePrevPage` (pops `cursorStack`, re-fetches that page); DOM is always max 50 rows; "Load more" button replaced with Previous/Next pagination footer showing current page number; filter-change `useEffect` resets to page 1 when `cursorStack.length > 0` so client-side filters apply against the first page (full dataset entry point) rather than a mid-stack page

---

## 2026-05-28 — TaskChatPanel: fix Realtime "cannot add callbacks after subscribe()" (Fix)

Root cause: `createBrowserClient` (Supabase SSR) is a singleton — same client instance on every call. The Supabase JS client reuses channel objects by name from an internal registry. React 18 StrictMode double-invokes effects: mount → cleanup → mount again. The first cleanup called `removeChannel` (async, not awaited), but by the time the second mount ran, the channel by the same name was still present in the registry in `SUBSCRIBED` or `LEAVING` state. Calling `.on()` on it threw `"cannot add postgres_changes callbacks after subscribe()"`.

Fix: `useId()` produces a stable, mount-scoped nonce that is unique across mounts. The channel name becomes `task-messages-${taskId}-${mountId}`, making each mount's channel name distinct. StrictMode's first cleanup fully removes its channel; the second mount creates a new channel under a different name and never collides with the prior one.

- `src/components/tasks/TaskChatPanel.tsx` — `useId` added to React import; `mountId = useId()` ref added; channel name changed from `` `task-messages-${taskId}` `` to `` `task-messages-${taskId}-${mountId}` ``

---

## 2026-05-28 — GroupTasksTab / PersonalTasksTab: fix server module in client bundle (Fix)

Root cause: both `'use client'` components imported value symbols directly from `src/lib/services/tasks-service.ts`, which calls `createClient()` from `src/lib/supabase/server.ts`, which imports `next/headers`. Next.js rejects any client bundle that transitively reaches `next/headers`.

Rule A-03: all DB queries go through `lib/services/`; but the service layer is server-only. Client components must use server actions as the boundary — never import service modules directly.

- `src/lib/actions/tasks.ts` — `getGroupSubtasksAction(groupId)` and `getPersonalTasksAction(filters?)` added; both call the service, verify session, and return `ActionResult<T>`; `userId` is derived from `getCurrentProfile()` server-side so the client never needs to supply it
- `src/components/tasks/GroupTasksTab.tsx` — `import { getGroupSubtasks } from '…/tasks-service'` replaced with `import { …, getGroupSubtasksAction } from '…/actions/tasks'`; call site updated; `cancelled` flag added (matches widget pattern)
- `src/components/tasks/PersonalTasksTab.tsx` — `import { getPersonalTasks } from '…/tasks-service'` removed; `getPersonalTasksAction` imported from actions; all three call sites (`handleNextPage`, `handlePrevPage`, filter-reset `useEffect`) updated

---

## 2026-05-28 — Migrations 0018/0019/0020: fix app_domain = text type error (Fix)

Root cause: `get_user_domain()` returns `app_domain` (enum). `task_groups.domain` is `text`. PostgreSQL will not implicitly cast enum → text — `ERROR 42883: operator does not exist: app_domain = text`. All three migrations built in the same session carried the same uncast comparison. The correct pattern (already in migration 0003) is `get_user_domain()::text`.

- `supabase/migrations/20260528000018_task_groups_rls_domain.sql` — `get_user_domain() = domain` → `get_user_domain()::text = domain` in both SELECT and UPDATE policies (3 occurrences); type-note comment added
- `supabase/migrations/20260528000019_task_messages_rls_creator.sql` — `tg.domain = get_user_domain()` → `tg.domain = get_user_domain()::text` in both SELECT and INSERT policies (2 occurrences); type-note comment added
- `supabase/migrations/20260528000020_group_task_summaries_rpc.sql` — `tg.domain = get_user_domain()` → `tg.domain = get_user_domain()::text` (1 occurrence)

All three files were edited in-place: they had never successfully applied to the database (each failed at the type-mismatch error before any DDL committed).

---

## 2026-05-28 — AssigneePickerModal: fix z-index arithmetic V-05 violation (Fix)

- `src/styles/design-tokens.css` — `--z-modal-overlay: 61` and `--z-modal-nested: 62` added to the z-index scale; nested modal layering now has named tokens instead of arithmetic
- `src/components/tasks/AssigneePickerModal.tsx` — `calc(var(--z-modal) + 10)` → `var(--z-modal-overlay)`; `calc(var(--z-modal) + 11)` → `var(--z-modal-nested)`; file-header comment updated
- `src/components/CLAUDE.md` — AssigneePickerModal entry updated to reference new token names

No `--color-*` violations were found in `src/components/tasks/` — those tokens are legitimately defined in `design-tokens.css` (section 7) and are correct per the Surface Contract. The actual violation was V-05 (z-index arithmetic), not V-01.

---

## 2026-05-28 — PersonalTasksTab: fix duplicate task creation on fast Enter (Fix)

- `src/components/tasks/PersonalTasksTab.tsx` — `useTransition` now destructures `isPending`; `handleQuickAddSave` guards with `if (isPending) return` as first statement, making all subsequent Enter presses a no-op until the transition completes; `isSavingQuickAdd` boolean state removed entirely; title input gains `disabled={isPending}` + `opacity: isPending ? 0.6 : 1`; Save button uses `isPending` for `disabled`, `cursor`, `opacity`, and label text ("Saving…")

---

## 2026-05-28 — getPersonalTasks: fix NULL due_at cursor pagination bug (Fix)

- `src/lib/services/tasks-service.ts` — `PersonalTaskFilters.cursor` changed from `string | null` to composite `PersonalTaskCursor = { due_at: string | null, id: string } | null`; `PersonalTasksResult.nextCursor` updated to the same composite type; `getPersonalTasks` now sorts by `due_at ASC NULLS LAST, id ASC` and uses a `.or()` condition covering all four cases of the composite continuation predicate; tasks with no deadline (`due_at IS NULL`) are now visible on every page after the first
- `src/components/tasks/PersonalTasksTab.tsx` — `cursor` state typed as `PersonalTaskCursor | null`; `PersonalTaskCursor` imported from service
- `src/lib/CLAUDE.md` — composite cursor pattern documented under a new "Composite cursor pattern for nullable sort columns" section

---

## 2026-05-28 — get_group_task_summaries: fix SECURITY DEFINER domain bypass (Security)

### What was wrong

Migration 0020's initial `get_group_task_summaries` RPC accepted `p_domain text` as a caller-supplied parameter and used it in `WHERE tg.domain = p_domain`. The comment incorrectly stated "the function does NOT bypass RLS — it runs as the calling user's session." Both claims were wrong: SECURITY DEFINER always runs as the function owner (postgres), which bypasses RLS entirely. Any authenticated caller could pass any domain value and receive results from that domain — the RLS domain guard was effectively off.

### What changed

- `supabase/migrations/20260528000020_group_task_summaries_rpc.sql` rewritten (migration had not yet run in production): `p_domain` parameter removed; WHERE clause now replicates the `task_groups_select` policy from migration 0018 explicitly using `get_user_role()` and `get_user_domain()` (agent: created_by = auth.uid(); manager: domain = get_user_domain(); admin/founder: all); comment corrected to accurately describe SECURITY DEFINER behaviour
- `src/lib/services/tasks-service.ts` — `getGroupTasks` signature changed from `(domain: string, filters?)` to `(filters?)` — domain is no longer accepted or forwarded; scoping is fully server-enforced
- `src/app/(dashboard)/tasks/page.tsx` — call site updated from `getGroupTasks(profile.domain)` to `getGroupTasks()`
- `src/app/(dashboard)/CLAUDE.md` — updated to reflect the new signature and explain why domain is not passed
- `src/lib/CLAUDE.md` — RPC pattern rules updated: documents that SECURITY DEFINER bypasses RLS, that access control must be replicated in the WHERE clause, and that caller-supplied domain parameters must never be trusted for scoping

### Verified

- `pnpm tsc --noEmit` passes with zero errors
- Domain scoping is now enforced inside the RPC body, not by a caller-supplied parameter
- Comment accurately describes SECURITY DEFINER semantics

---

## 2026-05-28 — getGroupTasks: replace in-memory aggregation with Postgres RPC (Performance)

`getGroupTasks` previously fetched all subtask rows for every group in the domain and aggregated counts in Node. At scale (500 groups × 50 subtasks = 25 000 rows) this would transfer 25 000 rows to render a count badge and 4 avatars.

**Modified files:**

- `supabase/migrations/20260528000020_group_task_summaries_rpc.sql` — `get_group_task_summaries(p_status, p_priority)` RPC; GROUP BY on `task_groups` LEFT JOIN `tasks`; returns `subtask_total`, `subtask_completed`, `assignee_ids uuid[]` per group; `SECURITY DEFINER SET search_path = public`; access control replicated in WHERE clause
- `src/lib/services/tasks-service.ts` — `getGroupTasks` rewritten: one RPC call + one batch profile fetch = exactly 2 DB round-trips; zero subtask rows transferred; `subtask_total`/`subtask_completed` cast with `Number()` (Q-09); `assignee_ids` sliced to max 4 in service layer; `GroupTaskSummaryRaw` internal type defined; `any` cast on `.rpc()` because generated types predate the migration
- `src/lib/CLAUDE.md` — RPC aggregation pattern documented for future reference

**Verified:** `pnpm tsc --noEmit` passes; `getGroupTasks` makes exactly 2 DB round-trips; no subtask rows fetched; `GroupTasksTab` component unchanged.

---

## 2026-05-28 — Trigger.dev reminder race window: documented as closed by SDK idempotency guarantee (A-12)

### Modified files

- `src/trigger/task-reminders.ts` — added a detailed comment block at the top of the file documenting the Trigger.dev v3 idempotency key deduplication guarantee for DELAYED runs; confirms the list-snapshot race described in A-12 is structurally impossible because `tasks.trigger()` with an idempotency key matching an existing DELAYED run returns the existing run handle (`isCached: true`) rather than creating a second distinct run; evidence cited from `@trigger.dev/core@4.4.6` apiClient types (line 55) and SDK shared.js (lines 1063–1110); no code change to scheduling or cancellation logic required; no migration required

### Decision log

- Approach chosen: document guarantee (not store-run-ID-in-DB), because the SDK evidence confirms deduplication makes a second concurrent DELAYED run with the same idempotency key impossible. The store-run-ID path would have required migration 0020 + adminClient write in scheduleTaskReminder — complexity not warranted when the race window does not exist.

---

## 2026-05-28 — Tech debt register created; TD-001 logged for leads.ts

### New files

- `docs/tech-debt.md` — tech debt register; tracks pre-existing violations identified but not fixed in the current session; each item has file, rule, what, fix, and logged date

### TD-001 logged

- `src/lib/actions/leads.ts` — inline `getCallerProfile()` is a Rule A-03 / Rule 04 duplicate of `getCurrentProfile()` from `profiles-service.ts`; inline comment added at the violation site referencing TD-001; fix path documented (delete inline fn, import canonical, replace 8 call sites); must be resolved when `leads.ts` is next touched for any reason

---

## 2026-05-28 — tasks.ts: replace local getCallerProfile duplicate with canonical getCurrentProfile (Rule 03/04)

### Modified files

- `src/lib/actions/tasks.ts` — removed local `getCallerProfile()` inline definition (was duplicating `getCurrentProfile` from `profiles-service.ts`); replaced with `import { getCurrentProfile } from '@/lib/services/profiles-service'`; all 7 call sites updated to `getCurrentProfile()`; `createClient` import retained because `canMutateTask` still uses it for the manager domain lookup (user-scoped client, not admin)

---

## 2026-05-28 — Security fix: updateTaskStatusAction + updateTaskAction missing application-layer auth (A-09/S-06)

### Modified files

- `src/lib/actions/tasks.ts` — added `canMutateTask(caller, task)` helper that explicitly enforces the same access rules as the tasks RLS UPDATE policy (agent: `assigned_to OR created_by`; manager: same OR group subtask in caller's domain via `task_groups` join; admin/founder: unrestricted); wired into `updateTaskStatusAction` (step 4 — was entirely absent) and `updateTaskAction` (step 4 — replaced the agent-only check that left managers unguarded); both actions now fetch `group_id` in their task select to support the manager domain check; both fetches still use the user client (RLS layer 1) before the `adminClient` write

---

## 2026-05-28 — Security fix: task_messages RLS creator visibility + manager domain scope (A-09)

### Migration 0019

- `supabase/migrations/20260528000019_task_messages_rls_creator.sql` — drops the A-09-violating `task_messages_select` and `task_messages_insert` policies from migration 0017; replaces both with three-tier visibility: (1) assignee or creator of the task — any role, always visible; (2) manager whose domain matches the parent `task_groups.domain` for `group_subtask` tasks; (3) admin/founder unrestricted; fixes two bugs: task creator locked out of own chat thread, and manager cross-domain message leak

---

## 2026-05-28 — Security fix: task_groups RLS domain enforcement (A-09)

### Migration 0018

- `supabase/migrations/20260528000018_task_groups_rls_domain.sql` — drops the A-09-violating `task_groups_select` and `task_groups_update` policies from migration 0017; replaces both with domain-scoped versions: `created_by = auth.uid() OR get_user_role() IN ('admin', 'founder') OR (get_user_role() = 'manager' AND get_user_domain() = domain)`; managers can no longer read or mutate task_groups rows belonging to a different domain

---

## 2026-05-28 — Tasks Page (Personal + Group tabs)

### New files

- `src/app/(dashboard)/tasks/page.tsx` — Server Component; fetches `getPersonalTasks` + `getGroupTasks` in `Promise.all`; passes data as props to `TasksShell`; guest → redirect `/dashboard`
- `src/app/(dashboard)/tasks/TasksShell.tsx` — `'use client'` tab shell; two tabs: "Personal" + "Group"; active tab persisted to `?tab=personal|group` URL param via `useSearchParams` + `useTransition` + `router.push`; browser back/forward works
- `src/components/tasks/PersonalTasksTab.tsx` — filter bar (Status multi-select pills, Priority multi-select pills, due date range); quick-add inline row (priority selector + title input + due date + assignee picker, Enter=save, Esc=cancel); task list rows with 3px priority left border, title, due date, status pill; click row → `TaskModal`; "Load more" cursor pagination; `AssigneePickerModal` portaled to `document.body`; Playfair italic empty state
- `src/components/tasks/GroupTasksTab.tsx` — accordion group list; one group expanded at a time (no conflicting Framer Motion); group row: title, priority border, status pill, due date, subtask count + progress%, member avatar stack (max 4 + overflow); subtask rows: title + status pill + assignee avatar; subtask add row at bottom of expanded group with assignee picker; click subtask → `TaskModal`; `AssigneePickerModal` portaled to `document.body`

### Modified files

- `src/lib/services/tasks-service.ts` — `getPersonalTasks` now returns `PersonalTasksResult = { tasks, hasMore, nextCursor }`; LIMIT 50 + 1 (detects `hasMore` without COUNT query); cursor pagination via `due_at > cursor`; new exports: `PersonalTasksResult`, `PERSONAL_TASKS_PAGE_SIZE`
- `src/components/layout/Sidebar.tsx` — "Tasks" nav item added (`CheckSquare`, `/tasks`); position: between Leads and Performance in `MAIN_NAV`

### Contracts established

- `getPersonalTasks` always returns `PersonalTasksResult` — never `Task[]` alone
- `hasMore` is detected by fetching `LIMIT + 1` rows — never a separate COUNT query
- Accordion: `expandedGroupId` state is a single `string | null` — guarantees only one group expanded at a time
- `AssigneePickerModal` always portals to `document.body` when rendered inside a scroll container (never inline)
- Tasks page data is fetched server-side on load — `TasksShell` does not re-fetch on tab switch

### Sign-off

- ✓ `pnpm tsc --noEmit` passes with zero errors
- ✓ `?tab=` URL param persists on browser back/forward
- ✓ `getPersonalTasks` uses cursor pagination — no unbounded SELECT
- ✓ `AssigneePickerModal` portals to `document.body`
- ✓ Only one group task row expanded at a time (accordion)
- ✗ Tasks not fetched client-side on tab switch — data is passed from the Server Component

---

## 2026-05-28 — Task Modal + Chat Panel (Prompt 3)

### New files

- `src/components/tasks/TaskModal.tsx` — two-column task detail modal (55% details / 45% chat); inline title + description editing with 400ms debounce, flushed synchronously on close; 6-state segmented status control (2-col grid at ≤480px to prevent overflow); 3-pill priority selector; assignee avatar + meta fields; Framer Motion entrance 200ms ease-out-expo; mobile full-screen bottom sheet with swipe-down-to-dismiss; no `<form>` tag, no internal data fetching
- `src/components/tasks/TaskChatPanel.tsx` — scrollable message list with auto-scroll; Realtime subscription on `task_messages` filtered by `task_id`, channel `task-messages-${taskId}`; optimistic inserts confirmed on Realtime echo, rolled back + `toast.danger` on error; growing textarea (1–3 lines), Enter to send, Shift+Enter newline; Playfair italic empty state; exports `TaskMessageWithAuthor` type
- `src/components/tasks/AssigneePickerModal.tsx` — nested modal (`z-index: var(--z-modal) + 11`); domain tabs (only populated domains shown); client-side search; avatar + role badge per user row; single select + Confirm; exports `AssignableUser` type

### Contracts established

- `TaskChatPanel` channel name must always be `task-messages-${taskId}` — never bare `task-messages`
- `TaskModal` never fetches its own data — receives `task`, `assignee`, `initialMessages` as props
- Debounced inline edits (title/description) are always flushed synchronously in `flushAndClose` before unmounting — no silent data loss on quick close

### Sign-off

- ✓ `pnpm tsc --noEmit` passes with zero errors
- ✓ Realtime channel uses `taskId` in name
- ✓ Debounced saves flush on modal close
- ✓ All colours reference CSS token vars — zero hex values
- ✓ Mobile status grid uses 2-col at ≤480px
- ✗ No `<form>` tags used anywhere in the three components

---

## 2026-05-28 — OS Tasks: service + action layer

### New files

- `src/lib/constants/task-constants.ts` — `TASK_PRIORITY`, `TASK_STATUS`, `TASK_CATEGORY` typed const objects; labels, colors as CSS token names (never hex), sort order
- `src/lib/validations/task-schemas.ts` — `CreatePersonalTaskSchema`, `CreateGroupTaskSchema`, `CreateSubtaskSchema`, `UpdateTaskSchema`, `UpdateTaskStatusSchema`, `AddTaskMessageSchema`, `DeleteTaskSchema` + inferred input types; priority/status as inline `z.enum`; all text fields run through `sanitizeText`
- `src/lib/services/tasks-service.ts` — `getPersonalTasks`, `getGroupTasks`, `getGroupSubtasks`, `getTaskById`, `getTaskMessages`; `getGroupTasks` uses a single flat query + in-memory aggregation to avoid N+1; batch profile fetch for assignee avatars; composite types: `TaskGroupRow`, `SubtaskWithAssignee`, `TaskWithMessages`, `AssigneeSlim`
- `src/trigger/task-reminders.ts` — `scheduleTaskReminder(taskId, dueAt, assignedTo)` one-time delayed job; `cancelTaskReminder(taskId)` finds and cancels by tag (`task-reminder-${taskId}`); past-date guard: no-op when `dueAt - 30min < now()`; `sendTaskReminderTask` exported for Trigger.dev scan
- `src/lib/actions/tasks.ts` — `createPersonalTaskAction`, `createGroupTaskAction`, `createSubtaskAction`, `updateTaskStatusAction`, `updateTaskAction`, `deleteTaskAction`, `addTaskMessageAction`; all actions: Zod first, `{ data, error }` return, no throws; `deleteTaskAction` cancels Trigger.dev reminder **before** DB delete — if cancel throws, delete is aborted

### Package added

- `@trigger.dev/sdk@4.4.6` — async job scheduling for task reminders; one-time delayed jobs via `tasks.trigger()` with `delay: Date`; cancellation via `runs.cancel()` using tag-based run discovery

### Updated docs

- `src/lib/CLAUDE.md` — services registry, actions registry, Trigger.dev jobs section, `createNotification` call sites for tasks

### Pre-mortem invariants met

- `getGroupTasks`: zero N+1 — one group query + one subtask query + one profile query, then O(subtasks) aggregation in memory
- `scheduleTaskReminder`: no-op guard when `dueAt - 30min <= now()`; never errors on past dates
- `deleteTaskAction`: Trigger.dev cancel precedes DB delete; cancel failure aborts delete
- All `TASK_STATUS` colors reference CSS token names (`var(--theme-accent)` etc.) — no hex values

---

## 2026-05-28 — Migration 0017: OS Tasks schema (task_groups, task_messages, tasks core upgrade)

### Migration `20260528000017_os_tasks.sql`

**Part A — tasks core table extended:**

- `title text NOT NULL` added; existing rows backfilled with `'(untitled)'`
- `description text` added (nullable)
- `priority text NOT NULL DEFAULT 'normal'` added; CHECK `IN ('urgent','high','normal')`
- `task_category text NOT NULL DEFAULT 'personal'` added; CHECK `IN ('personal','group_subtask','gia_followup')`; backfilled: rows with a `task_gia_meta` match → `'gia_followup'`, others → `'personal'`
- `group_id uuid` added; FK → `task_groups(id) ON DELETE CASCADE`; nullable
- Status enum migrated: `'pending'` → `'to_do'`, `'done'` → `'completed'`; new CHECK: `to_do | in_progress | in_review | completed | error | cancelled`
- New indexes: `idx_tasks_category`, `idx_tasks_group_id`, `idx_tasks_priority`

**Part B — `task_groups` table created:**

- Full RLS: SELECT (owner or manager+), INSERT (any authed), UPDATE (owner or manager+), DELETE (admin/founder)
- `update_updated_at()` trigger reused (not recreated)
- Indexes: `idx_task_groups_domain` (partial), `idx_task_groups_created_by`

**Part C — `task_messages` table created (append-only):**

- No UPDATE or DELETE RLS policies — enforced at policy level (rule A-11)
- SELECT/INSERT RLS mirrors tasks visibility via indexed EXISTS subquery (no full table scan)
- Realtime enabled: `ALTER PUBLICATION supabase_realtime ADD TABLE task_messages`

**Part D — notifications type expanded:**

- `task_assigned` added to `notifications_type_check` CHECK constraint

### TypeScript (`src/lib/types/database.ts`)

- `TaskStatus` updated: `to_do | in_progress | in_review | completed | error | cancelled`
- `TaskPriority` type added: `urgent | high | normal`
- `TaskCategory` type added: `personal | group_subtask | gia_followup`
- `Task` type extended: `title`, `description`, `priority`, `task_category`, `group_id` added
- `TaskGroup` type added
- `TaskMessage` type added
- `NotificationType` extended: `task_assigned` added
- `Database` tables: `task_groups` and `task_messages` entries added; `tasks` Insert type updated

### Components

- `src/components/notifications/NotificationItem.tsx` — `task_assigned` case added to exhaustive switch (maps to `CheckSquare` icon); `task_due` was already present; Q-11 still satisfied

---

## 2026-05-28 — assertNever moved to shared util

- `src/lib/utils/assert-never.ts` — created. Single export, three lines. `assertNever(x: never): never` is now the canonical exhaustive-switch helper for the entire codebase. Use it as the final return of any `switch` over a union type — TypeScript errors at build time if any case is unhandled.
- `src/components/notifications/NotificationItem.tsx` — inline `assertNever` definition removed. Now imports from `@/lib/utils/assert-never`. `default: return Bell` branch removed — the switch is fully exhaustive over `NotificationType`.
- `docs/The_Rules.md` — Q-11 added: exhaustive switches must use `assertNever` from `lib/utils/assert-never.ts`. No `default` branch on union-type switches.

---

## 2026-05-28 — Phase 9 post-ship: toast store hardening + exhaustive notification icon map

- `src/lib/toast.ts` — `_update()` now patches items in `_queue` as well as `_toasts`. A `toast.resolve(id)` called while the loading toast is still queued (3 other toasts visible) no longer silently drops the patch — the resolved state is carried into the item when it promotes to visible. `subscribeQueue` removed from public API; `"queue"` renamed to `"_queue_internal"` to prevent external listeners from registering without cleanup.
- `src/components/ui/toast-provider.tsx` — `useEffect` made explicit: `unsubscribe` assigned to a named const before return, plus `setToasts(toastStore.getToasts())` on mount to sync any toasts fired before the provider mounted (hot reload edge case).
- `src/components/notifications/NotificationItem.tsx` — `default: return Bell` branch replaced with `return assertNever(type)`. Adding a new `NotificationType` to `database.ts` without updating the icon map now fails at build time, not silently at runtime.

---

## 2026-05-28 — Phase 9 — Toast system + Persistent notification inbox shipped

### Part A — Toast System (ephemeral, client-only, no DB)

- `src/lib/toast.ts` — singleton store with pub/sub via `EventTarget` (no React dependency, no zustand). Exports `toast.success/danger/warning/info/loading/lia/resolve/dismiss/dismissAll`. `danger` duration = 0 (never auto-dismisses). `loading` duration = 0 (lives until `resolve()`). `resolve()` patches in-place by same id — no flicker.
- `src/components/ui/toast-item.tsx` — single toast card. Section 13.2 anatomy. 3px living bar via `eia-toast-bar-breathe` CSS keyframe (fires once; `lia` type uses continuous `eia-lia-breathe`). Warning depletion bar via new `toast-deplete` CSS keyframe (linear timing — intentional). Icon crossfade on loading→resolved via `AnimatePresence mode="wait"`. Hover/focus pauses dismiss timer; leaving resumes remaining time.
- `src/components/ui/toast-provider.tsx` — subscribes to toast store. Max 3 in DOM, queue the rest. Section 13.6 stagger: scale 1.0/0.95/0.90, translateY 0/−8px/−14px. Desktop: bottom-right. Mobile: bottom full-width, clears 80px nav.
- `src/hooks/useToast.ts` — thin re-export of `toast` singleton for React consumers.
- `src/app/(dashboard)/layout.tsx` — `<ToastProvider />` added after `<Sidebar />`, outside scroll container.
- `src/styles/design-tokens.css` — `toast-deplete` keyframe added (Section 15, after existing animations).

### Part B — Persistent Notification Inbox (DB + Realtime + Bell UI)

- Migration `20260528000016_notifications.sql` — `notifications` table; `recipient_id` FK → `profiles(id)` ON DELETE CASCADE; `action_url` CHECK constraint rejects absolute URLs; partial index on unread; full index on all; RLS: SELECT own only, UPDATE own only (mark read), no INSERT policy (service-role only), no DELETE; `ALTER PUBLICATION supabase_realtime ADD TABLE notifications`.
- `src/lib/types/database.ts` — `NotificationType`, `Notification` types added.
- `src/lib/services/notifications-service.ts` — `getUnreadNotifications`, `getNotifications`, `markNotificationRead`, `markAllNotificationsRead` (server client); `createNotification` (admin/service-role client only).
- `src/lib/actions/notifications.ts` — `markNotificationReadAction(id)`, `markAllReadAction()`. Both begin with Zod. Both return `{ data, error }`.
- `src/hooks/useNotifications.ts` — THE single owner of notification state. Seeds from server prop. Realtime subscription filtered strictly at channel level by `recipient_id=eq.${userId}`. Optimistic updates for markRead/markAllRead. Unsubscribes on unmount.
- `src/components/notifications/NotificationBell.tsx` — bell icon, single unread dot (never a number badge), wraps panel.
- `src/components/notifications/NotificationPanel.tsx` — dropdown 380px, scrollable list 420px max, empty state Playfair italic, header + mark-all-read, entrance 150ms ease-out-expo.
- `src/components/notifications/NotificationItem.tsx` — unread dot (always rendered, transparent when read), type icon, title/body/timestamp (`formatRelativeTime`). Validates `action_url` as relative path before `router.push`.
- `src/lib/utils/dates.ts` — `formatRelativeTime()` added.
- `src/components/layout/Sidebar.tsx` — stub bell replaced with `<NotificationBell>`. Accepts `initialNotifications` prop.
- `src/app/(dashboard)/layout.tsx` — fetches `getNotifications(profile.id)` and passes as `initialNotifications` to Sidebar.
- `src/lib/actions/leads.ts` — `createNotification` wired: `updateLeadStatus` → `won` notifies domain managers; `assignLead` → notifies receiving agent; `createManualLead` → notifies assigned agent when different from caller.
- `src/components/CLAUDE.md` — Toast system and Notification components documented.
- `src/components/notifications/CLAUDE.md` — created.
- `src/lib/CLAUDE.md` — `createNotification()` call sites and action patterns documented.

---

## 2026-05-28 — Performance page — fix: all_time delta arrows verified as "—", agentCount and mean-of-means documented

- `src/lib/services/performance-service.ts` — comments added: unweighted mean-of-means is intentional (each agent counts equally regardless of lead volume); `agentCount` is roster-based not activity-based; both design decisions documented with guidance on how to change them if ever needed
- `src/app/(dashboard)/performance/CLAUDE.md` — same two contracts documented: averaging method and agentCount distinction
- Verified (no code change needed): `all_time` period renders `"—"` on all four delta arrows. Chain: `getPreviousPeriodDateRange('all_time') → null` → `getPreviousPeriodCoreMetrics` returns `null` without querying → `CoreFourGrid` receives `previous={null}` → all four `delta:` entries short-circuit to `null` → `MetricCard` renders `"—"` in `--theme-text-tertiary`

---

## 2026-05-28 — Number formatting cleanup — formatCompact/formatPercent applied across 5 widget and campaign components — 2026-05-28

- `src/components/dashboard/widgets/AgentTasksWidget.tsx` — `tasks.length` and `newLeadsCount` wrapped with `formatCompact()`
- `src/components/dashboard/widgets/ManagerLeadStatusWidget.tsx` — `grandTotal`, `t.count` (legend), `agent.total` (per-agent row) wrapped with `formatCompact()`
- `src/components/dashboard/widgets/ManagerLeadVolumeWidget.tsx` — `total` stat display wrapped with `formatCompact()`; `tickFormatter={(v) => formatCompact(v)}` added to `<YAxis>`
- `src/components/dashboard/widgets/ManagerCampaignWidget.tsx` — `tickFormatter={(v) => formatCompact(v)}` added to `<YAxis>`
- `src/components/campaigns/CampaignCard.tsx` — `{count}` in `MetricPill` wrapped with `formatCompact(count)`

---

## 2026-05-28 — Campaign detail: metrics strip (6 stat cards + agent distribution) — Phase 8

- Migration `20260528000015_campaign_detail_metrics.sql` — `get_campaign_detail_metrics` RPC (status/outcome counts + `avg_hours_to_first_touch` via lateral join to `lead_activities`); `get_campaign_agent_distribution` RPC (single `GROUP BY assigned_to` join to `profiles` — never N+1)
- `src/lib/utils/numbers.ts` — `formatCompact`, `formatPercent`, `formatCount`, `formatCurrency` fully implemented per design-dna §8.2 (were stubs previously)
- `src/lib/types/database.ts` — `CampaignDetailMetrics` (extends `CampaignMetrics` + `avg_hours_to_first_touch: number | null`) and `AgentDistributionRow` types added
- `src/lib/services/leads-service.ts` — `getCampaignDetailMetrics(campaignName, filters)` and `getCampaignAgentDistribution(campaignName, filters)` added; both cast `bigint → Number()` per Q-09; both silently return null/[] on RPC error
- `src/components/campaigns/CampaignMetricsStrip.tsx` — server component; 6 stat cards (Total Leads, Won + conv. rate, Active Pipeline, Junk Rate, RNR, Avg. First Touch); division-by-zero guarded on all rate fields; all colours CSS tokens
- `src/components/campaigns/AgentDistributionBar.tsx` — `'use client'`; stacked bar `h-2 radius-full`; Framer Motion `layoutId` + `animate={{ width }}` per segment (never CSS width transition); legend with colour dots + name + count; hidden when `distribution.length <= 1`
- `src/components/campaigns/CampaignMetricsStripSkeleton.tsx` — 6 skeleton stat cards per §11.3; stagger 0→320ms per §11.4
- `src/app/(dashboard)/campaigns/[id]/page.tsx` — two independent Suspense boundaries (metrics + table stream separately); `CampaignMetricsAsync` runs `Promise.all([getCampaignDetailMetrics, getCampaignAgentDistribution])` in parallel; `campaignName` decoded once and used identically for both RPCs and the leads query (no mismatch)
- `src/app/(dashboard)/campaigns/CLAUDE.md` — updated: detail page architecture, two new RPCs, Promise.all contract, division-by-zero guard, agent distribution bar rule

---

## 2026-05-28 — Campaign analytics command center — list + detail pages, get_campaign_metrics RPC, two indexes — Phase 8

- Migration `20260528000014_campaign_analytics.sql` — two partial indexes (`idx_leads_campaign_domain`, `idx_leads_campaign_status`); `get_campaign_metrics` SQL function (STABLE SECURITY DEFINER) using conditional `COUNT(*) FILTER (WHERE ...)` aggregates — one round trip regardless of campaign count; `p_domain`, `p_date_from`, `p_date_to` params
- `src/lib/types/database.ts` — `CampaignMetrics` type added; `CampaignFilters` type added
- `src/lib/services/leads-service.ts` — `getCampaignMetrics(role, callerDomain, filters)` added; manager domain constraint enforced before RPC call; RPC column names mapped to clean `CampaignMetrics` shape; `bigint` → `number` cast
- `src/components/campaigns/CampaignFilters.tsx` — `'use client'`; Domain (single select, hidden for manager), Date range; `useTransition` on all navigations; Clear button when any filter active
- `src/components/campaigns/CampaignCard.tsx` — interactive card per §5.04; hover `--shadow-2 + translateY(-1px)`; left: campaign name + domain badge; right: 7 metric pills (total/won/in_discussion/nurturing/lost/junk/rnr); Framer Motion staggered entrance §11.4; `router.push('/campaigns/[encodedName]')` on click
- `src/components/campaigns/CampaignListSkeleton.tsx` — 5 skeleton rows; card shell + name/domain-pill + 7 metric-pill skeletons; stagger 0/80/160/240/320ms §11.4
- `src/components/campaigns/CampaignListAsync.tsx` — async server component; direct child of Suspense; calls `getCampaignMetrics`; Playfair italic empty state
- `src/app/(dashboard)/campaigns/page.tsx` — server component; agent/guest → redirect `/dashboard`; manager domain pre-locked; `<CampaignFilters>` + `<Suspense><CampaignListAsync /></Suspense>`
- `src/app/(dashboard)/campaigns/[id]/page.tsx` — server component; `id` = `encodeURIComponent(utm_campaign)`; `decodeURIComponent` on params; calls `getLeadsByRoleCached` with `{ campaign: decodedName }`; renders existing `<LeadsTable>` + `<LeadsPagination>`
- `src/components/layout/Sidebar.tsx` — "Campaigns" nav item added (`TrendingUp` icon, `/campaigns` route); visible for manager + admin + founder; "Analytics" section label added
- `src/app/(dashboard)/campaigns/CLAUDE.md` — created: RPC pattern, campaign id encoding contract, domain-lock rule, URL param keys

---

## 2026-05-28 — Performance page — team benchmarks layer (domain avg. touch rate, response time, conversion rate; agentCount guard; accent pip for above-average metrics) — Phase 9

- `src/lib/services/performance-service.ts` — `TeamBenchmarks` type exported; `getTeamBenchmarks(callerDomain, period)` added: 1 query for peer agent IDs, 3 flat queries scoped to `assigned_to IN (agentIds)` (never N queries); `agentCount < 2` guard returns all nulls; `leadsWon` intentionally excluded
- `src/app/(dashboard)/performance/PerformanceAsync.tsx` — sixth call added to `Promise.all`; `domain` prop added (server-side from `profile.domain`, never a URL param); `benchmarks` passed to `CoreFourGrid`
- `src/app/(dashboard)/performance/page.tsx` — `domain={profile.domain}` passed to `PerformanceAsync`
- `src/components/performance/CoreFourGrid.tsx` — `TeamBenchmarks` type imported; `benchmarks: TeamBenchmarks | null` prop added; benchmark line renders below delta per card (absent not "—" when null); accent pip on above-average metrics; response time uses inverse comparison (lower is better)
- `src/app/(dashboard)/performance/PerformanceSkeleton.tsx` — two extra skeleton lines added to Touch Rate, Avg Response Time, Conversion Rate cards; Leads Won card unchanged
- `src/app/(dashboard)/performance/CLAUDE.md` — updated with `getTeamBenchmarks` signature, `TeamBenchmarks` type, agentCount guard rule, benchmark null contract (absent vs "—")

---

## 2026-05-28 — Performance page — agent self-view (Core Four metrics, effort layer, call outcome breakdown, period selector) — Phase 8

- Migration `20260528000013_performance_indexes.sql` — three partial indexes: `idx_lead_activities_actor_status`, `idx_lead_notes_author_outcome`, `idx_leads_assigned_status_created`
- `src/lib/services/performance-service.ts` — new dedicated service; `getCoreFourMetrics`, `getEffortMetrics`, `getCallOutcomeBreakdown`, `getPreviousPeriodCoreMetrics`, `getPeriodDateRange`, `getPreviousPeriodDateRange`, `_getCoreFourMetricsForRange`; IST-correct period boundaries; null contract for `avgResponseTimeMinutes` and `conversionRate`
- `src/lib/utils/dates.ts` — `formatDuration(minutes: number | null)` added: null → "—", < 60m → "48m", ≥ 60m → "2h 34m"
- `src/app/(dashboard)/performance/page.tsx` — agent-only server component; non-agent roles redirect to `/dashboard`; reads `searchParams.period`; Suspense boundary around `PerformanceAsync`; `PerformanceMotivationalFooter` (Playfair italic, Lia's voice)
- `src/app/(dashboard)/performance/PerformanceAsync.tsx` — async server component; direct child of Suspense; calls all 5 service functions in `Promise.all`
- `src/app/(dashboard)/performance/PerformanceSkeleton.tsx` — 2×2 Tier-1 + 4 compact Tier-2 + 1 wide Tier-3; stagger 0/80/160/240ms per §11.4
- `src/components/performance/PerformancePeriodSelector.tsx` — `'use client'`; URL param only; `useTransition` on all pushes; tab-style ghost buttons
- `src/components/performance/CoreFourGrid.tsx` — `'use client'`; 2×2 grid; Playfair serif primary values; unicode delta arrows (↑ ↓); success/danger text colours; null → "—"
- `src/components/performance/EffortGrid.tsx` — `'use client'`; 4-col compact cards; live-state dots on in_discussion (info) and nurturing (warning); sans-serif numbers
- `src/components/performance/CallOutcomeBar.tsx` — `'use client'`; horizontal segmented bar; all CSS variable colours; Playfair italic empty state per V-09
- `src/components/layout/Sidebar.tsx` — Performance nav item added (BarChart2, below Leads)
- `src/app/(dashboard)/performance/CLAUDE.md` — created

---

## 2026-05-28 — Dashboard widgets — fix: startTransition called during render

- `src/components/dashboard/widgets/AgentTasksWidget.tsx` — initial data fetch moved from render-phase guard (`if (!loaded && !isPending)`) into `useEffect`; `cancelled` flag prevents state update on unmounted component
- `src/components/dashboard/widgets/ManagerLeadStatusWidget.tsx` — same fix applied
- `src/components/dashboard/widgets/ManagerCampaignWidget.tsx` — same fix applied

Root cause: `startTransition` is a side effect and cannot be called during the render phase. React throws "Cannot call startTransition while rendering." All three widgets now use the same `useEffect` + `startTransition` pattern already present in `AgentActivityWidget` and `ManagerLeadVolumeWidget`.

---

## 2026-05-28 — Dashboard widget system: canvas, registry, useDashboardLayout hook, 5 Gia widgets (agent tasks, agent activity, manager status, manager volume, manager campaigns) — Phase 7

- `src/lib/constants/dashboard-widgets.ts` — widget registry: 5 entries with id, label, description, roles, domains, defaultSize, module; `DEFAULT_LAYOUT_BY_ROLE` per role; `WIDGET_MAP`, `isValidWidgetId`
- `src/hooks/useDashboardLayout.ts` — localStorage layout hook; key `eia:dashboard:layout:${userId}:v1`; validates ids against registry; hydrates after mount; returns layout + CRUD operations
- `src/components/dashboard/WidgetSkeleton.tsx` — size-aware shimmer skeleton
- `src/components/dashboard/DashboardWidgetSlot.tsx` — Suspense boundary; static `React.lazy` import map; 150ms min skeleton; edit mode chrome
- `src/components/dashboard/DashboardCanvas.tsx` — 2-col grid; `@dnd-kit/sortable` drag; edit mode toggle; hydration-safe full-canvas skeleton
- `src/lib/services/dashboard-service.ts` — dedicated dashboard queries; never mixed into `leads-service.ts`
- `src/lib/actions/dashboard.ts` — 5 server actions; all re-verify via `getCurrentProfile()`
- `src/components/dashboard/widgets/AgentTasksWidget.tsx` — overdue + today tasks + new leads count
- `src/components/dashboard/widgets/AgentActivityWidget.tsx` — Realtime subscription filtered by actor_id; Framer Motion slide-in on new items; subscription cleaned up on unmount
- `src/components/dashboard/widgets/ManagerLeadStatusWidget.tsx` — stacked bar pipeline + per-agent breakdown
- `src/components/dashboard/widgets/ManagerLeadVolumeWidget.tsx` — Recharts LineChart; period toggle; all colours CSS vars
- `src/components/dashboard/widgets/ManagerCampaignWidget.tsx` — Recharts stacked BarChart per utm_campaign
- `src/app/(dashboard)/dashboard/page.tsx` — replaced placeholder with `<DashboardCanvas>`
- `src/app/(dashboard)/CLAUDE.md` — created: full widget system documentation
- `recharts@3.8.1` — added (Q-05: first chart package; dashboard widgets only; Recharts not imported at page level — only inside widget components that use it)

---

## 2026-05-28 — Gia — Campaign ad video preview modal — Phase 6

Click `utm_campaign` on the lead dossier to play the Meta ad creative that generated the lead. If no creative row exists the field renders as plain static text — zero visual change.

- Migration 0012: `ad_creatives` table — `campaign_key` (UNIQUE, normalised via CHECK constraint), `video_url`, `thumbnail_url`, `ad_name`, `notes`; RLS: SELECT open to all authenticated, INSERT/UPDATE/DELETE admin/founder only; `idx_ad_creatives_campaign_key` index
- `src/lib/types/database.ts` — `AdCreative` type added; `ad_creatives` table added to `Database.public.Tables`
- `src/lib/services/ad-creatives-service.ts` — `getAdCreativeForCampaign(campaignName)`: normalises input (toLowerCase + trim), queries `ad_creatives` by `campaign_key`, returns `AdCreative | null`, never throws
- `src/components/leads/CampaignVideoModal.tsx` — new modal composing `ui/modal.tsx`; `max-w-2xl`; native `<video>` with `autoPlay muted playsInline controls`; video.play() via ref after mount with silent `NotAllowedError` catch; Framer Motion entrance from `ui/modal.tsx` (350ms ease-out-expo)
- `src/components/leads/LeadInfoCard.tsx` — converted to `'use client'`; accepts `adCreative?: AdCreative | null` prop; `AttributionTrigger` sub-component added; campaign field renders as interactive trigger (cursor-pointer, hover → `--theme-accent` + underline, 150ms transition) when creative exists; `ad_name` field also interactive when `adCreative.ad_name === lead.ad_name`; `CampaignVideoModal` rendered conditionally
- `src/app/(dashboard)/leads/[id]/page.tsx` — `getAdCreativeForCampaign(lead.utm_campaign)` added to existing `Promise.all` block; skipped (returns null) when `lead.utm_campaign` is null; result passed as `adCreative` prop to `LeadInfoCard`

---

## 2026-05-28 — Gia — Won action restored on lead dossier (In Discussion)

`StatusActionPanel` — Won button + confirm modal when status is `in_discussion`; calls existing `updateLeadStatus('won')`. Restores spec behaviour removed during the Level Up refactor.

---

## 2026-05-28 — Gia — Leads table Assigned To column shows agent name

`getLeadsByRole` now joins `profiles!leads_assigned_to_fkey(full_name)` in the same query; `LeadWithAssignee` type added. `LeadsTable` Assigned To cell renders `assignee.full_name` instead of the raw UUID.

---

## 2026-05-28 — Layout — Sidebar logo: remove domain module label

Removed the italic module name (Gia, Hia, Sia, etc.) below the sidebar logo. Deleted unused `DOMAIN_MODULE_NAMES` from `src/lib/constants/domains.ts`.

---

## 2026-05-28 — Gia — Fix getNextLeadTask broken filter (Phase 6)

Inverted join direction in `getNextLeadTask` — now starts from `tasks` with `!inner` on `task_gia_meta` to filter by `lead_id`. Previous version started from `task_gia_meta` and used dot-notation (`.eq('tasks.status', ...)`, `.order('tasks.due_at', ...)`) which PostgREST / Supabase JS client silently drops, causing the status filter and ordering to be no-ops and `.limit(1)` to return an arbitrary row. Native column filters (`status`, `due_at`) are now applied directly on the root `tasks` table. Return type `Task | null` and `LeadDossierTasksAsync` unchanged.

---

## 2026-05-28 — Gia — Fix N+1 queries on lead dossier (Phase 6)

Repaired `Relationships` arrays in `database.ts` for `lead_notes`, `lead_activities`, `tasks`, and `task_gia_meta` — all were `[]` despite FK constraints existing in Postgres. Collapsed `getLeadNotesFull`, `getLeadActivitiesFull`, and `getNextLeadTask` from 5 sequential round trips to 3 parallel single-query joins using inline FK disambiguators. `getProfileNameMap` is no longer called from any lead service function (marked for future removal). Updated `LeadNoteWithAuthor` (`author.full_name`) and `LeadActivityWithActor` (`actor?.full_name`) types and all consumers (`LeadNotesSection`, `LeadActivityLog`). `pnpm tsc --noEmit` passes with zero errors.

---

## 2026-05-28 — Gia — Status pills moved from page header into LeadsTable toolbar row

2026-05-28 — Gia — Status pills moved from page header into LeadsTable toolbar row

---

## 2026-05-28 — Gia — Leads page header: serif title + status summary pills

2026-05-28 — Gia — Leads page header: serif title + status summary pills (eyebrow removed per product)

---

## 2026-05-28 — Gia — LeadInfoCard contact fields redesign

LeadInfoCard contact fields redesigned — labelled datum row pattern with consistent icon rail, mono phone, micro-label typography; 2026-05-28, Phase 6.

---

## 2026-05-28 — Gia — Leads: server-side search, pagination, phone text index

Leads — server-side search (ilike across name/phone/email), pagination (50/page, URL-param driven), migration 0011 phone text index; 2026-05-28, Phase 6.

### Files added

- `supabase/migrations/20260528000011_lead_search_index.sql` — `idx_leads_phone_text` on `leads(phone text_pattern_ops) WHERE archived_at IS NULL`; enables ILIKE substring search without sequential scan.
- `src/components/leads/LeadsPagination.tsx` — `'use client'` component; "Showing X–Y of Z leads" count; Prev/Next buttons with `ChevronLeft`/`ChevronRight`; `useTransition` on all navigation; `pointer-events: none` on disabled state (not just `opacity`); rendered only when `totalCount > pageSize`.

### Files modified

- `src/lib/types/database.ts` — `LeadFilters.search: string | null` added.
- `src/lib/services/leads-service.ts` — `getLeadsByRole` return type changed from `Lead[]` to `LeadsResult = { leads, totalCount }`. Count obtained via `{ count: 'exact', head: false }` on the same query builder — one round trip. Search applied as `.or(first_name.ilike.%term%,...,email.ilike.%term%)` after role constraints, before `.range()`. Term trimmed and lowercased in service.
- `src/components/leads/LeadsFilters.tsx` — search input added to filter bar (Section 5.10 spec); 500ms debounce via `useEffect`+`setTimeout`, no library; clear X button; `search` counted in active filter badge; `buildParams` deletes `page` on every change → automatic page-1 reset; `clearAll` clears search local state and URL simultaneously.
- `src/components/leads/LeadsTable.tsx` — all client-side search code removed (`useState`, `useMemo`, `Search` icon, search input, `filtered` variable). Table is now display-only — it renders what the server returned.
- `src/components/leads/LeadsTableAsync.tsx` — destructures `{ leads, totalCount }` from `getLeadsByRole`; renders `LeadsTable` + `LeadsPagination` (conditional on `totalCount > pageSize`); `search` filter included in `hasActiveFilters` check.
- `src/components/leads/LeadsTableSkeleton.tsx` — skeleton rows increased from 5 to 50 (matches `pageSize`); prevents layout height jump between skeleton and real content during pagination navigation.
- `src/app/(dashboard)/leads/page.tsx` — `parseFilters` now includes `search: getString('search')`.
- `src/app/(dashboard)/leads/CLAUDE.md` — updated with server-side search spec, `LeadsResult` return shape, pagination render condition, 500ms debounce rule, and page-reset contract.

---

## 2026-05-28 — Gia — Leads filter: Suspense-split architecture + server-side URL-param filters

Leads filter — Suspense-split architecture, server-side URL-param filters (status, outcome, source, campaign, agent, date range), migration 0010 indexes; 2026-05-28, Phase 6.

### Files added

- `supabase/migrations/20260528000010_lead_filter_indexes.sql` — three partial indexes on `leads`: `idx_leads_utm_source`, `idx_leads_utm_campaign`, `idx_leads_last_call_outcome` (all `WHERE archived_at IS NULL`). `IF NOT EXISTS` on indexes only — no RLS changes.
- `src/lib/constants/lead-sources.ts` — `LEAD_SOURCES`, `LeadSource`, `LEAD_SOURCE_LABELS` constants. Values: `meta | google | website`. No inline literals in components.
- `src/components/leads/LeadsFilters.tsx` — `'use client'` filter bar. Reads/writes URL params only. Six controls: Status (multi), Outcome (multi), Source (single), Campaign (single, server prop), Agent (single, server prop, absent for `agent` role), Date range. Active filter badge. `useTransition` on all `router.push` calls. Never fetches data.
- `src/components/leads/LeadsTableAsync.tsx` — async server component. Calls `getLeadsByRole` with `LeadFilters`. Renders `<LeadsTable>`. No UI of its own. Direct child of `<Suspense>` in `page.tsx`.
- `src/app/(dashboard)/leads/CLAUDE.md` — documents the three-component split, `LeadFilters` type location, `showAgentFilter` contract, `date_to` end-of-day rule, `getLeadFilterOptions` call location, and `page`/`pageSize` pagination readiness.

### Files modified

- `src/lib/types/database.ts` — `LeadFilters` type added (status, last_call_outcome, agent_id, source, campaign, date_from, date_to, page, pageSize).
- `src/lib/services/leads-service.ts` — `getLeadsByRole` extended to accept `LeadFilters`; builds a single chained Supabase query; `.range()` always applied (never conditional); agent role constraint enforced before `LeadFilters.agent_id`; `date_to` end-of-day transform (`T23:59:59.999Z`) in service, not component. New `getLeadFilterOptions(role, domain)` returns `{ campaigns, agents }` — called once at page level.
- `src/components/leads/LeadsTable.tsx` — accepts `hasActiveFilters` prop; internal `statusFilter` state removed (server-side now); Framer Motion entrance `initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}` per Section 11.5 (250ms, 100ms delay, ease-out-expo); empty state updated to "Nothing matches these filters." (Section 8.6).
- `src/components/leads/LeadsTableSkeleton.tsx` — rebuilt to spec: 5 rows (Section 11.3), staggered pulse per Section 11.4 (0/80/160/240/320ms), column widths match spec.
- `src/app/(dashboard)/leads/page.tsx` — restructured as thin orchestrator: fetches `filterOptions` once, parses `searchParams` into `LeadFilters`, renders `<LeadsFilters>` (stable) + `<Suspense><LeadsTableAsync /></Suspense>`.

---

## 2026-05-28 — Gia — LeadInfoCard AttributionStrip

LeadInfoCard: UTM section redesigned as AttributionStrip with accent-tone treatment and campaign repatriated — 2026-05-28, Phase 6

---

## 2026-05-28 — Gia — Leads table column visibility picker + drag-to-reorder

### New packages (Q-05)

- `@dnd-kit/core` `@dnd-kit/sortable` `@dnd-kit/utilities` — drag-to-reorder in the column picker. Selected over `react-beautiful-dnd` (unmaintained) and hand-rolled pointer listeners (no accessible keyboard support). `@dnd-kit` is now the **canonical drag library for all of Eia** (see rule Q-07).

### Files added

- `src/lib/constants/lead-columns.ts` — column registry: 11 columns, each with a stable `id` (localStorage key — never rename after shipping), `label`, `defaultVisible`, `locked`. `status` and `name` are locked always-visible.
- `src/hooks/useLeadColumnPreferences.ts` — `useLeadColumnPreferences(userId)` reads/writes `localStorage` at `eia:leads:columns:${userId}:v1`; validates stored ids against registry on load (unrecognised ids silently dropped); locked columns always enforced in `visibleColumns`; hydrates after mount (no SSR mismatch). Returns `{ visibleColumns, columnOrder, toggleColumn, reorderColumns, resetToDefaults }`. This hook is the **canonical pattern** for per-user table column preferences across Eia (see rule Q-08).
- `src/components/leads/LeadColumnPicker.tsx` — popover panel (not a modal); `@dnd-kit/sortable` for visible-column drag-to-reorder; locked rows show `Lock` icon and are excluded from the drag context; hidden columns shown below a divider, non-draggable; "Reset to defaults" footer; 200ms `opacity/y` entrance animation matching dropdown spec from design-dna.md §5.09.

### Files modified

- `src/components/leads/LeadsTable.tsx` — accepts `userId` prop; "Columns" ghost button (`Columns` lucide icon, `w-4 h-4`, stroke `1.5`) opens picker before filter controls; table renders only `orderedVisible` columns in stored order via a `LeadCell` switch covering all 11 ids; no Supabase re-query on toggle — purely presentational.
- `src/app/(dashboard)/leads/page.tsx` — passes `profile.id` as `userId` to `LeadsTable`.

### Conventions locked in

- Rule Q-07 added to `The_Rules.md`: `@dnd-kit` is the only drag library permitted in Eia.
- Rule Q-08 added to `The_Rules.md`: column preference hooks always follow the `useLeadColumnPreferences` signature and `eia:[module]:columns:${userId}:v1` key format.

## 2026-05-28 — Gia — Add Lead modal: removed E.164 hint and intent chips; added Source field (WhatsApp, Website, Meta, Google, Referral, YPO, Events) stored in form_data.manual_source

---

## 2026-05-28 — Gia — Add Lead modal: manual lead creation with phone dedup, domain enforcement, and agent assignment

---

## 2026-05-28 — Documentation

README.md created at repo root — project overview, phase status, stack, RBAC, planned modules. 2026-05-28.

---

## 2026-05-27 — Phase 6 complete

### `ui/Modal` primitive + modal refactor

- `src/components/ui/modal.tsx` — chrome-only Modal primitive: backdrop (`fixed inset-0`, `rgba(0,0,0,0.5)`, `backdrop-blur-sm`, `z-[--z-overlay]`), container (`bg var(--theme-paper)`, `radius-lg`, `shadow-3`, `z-[--z-modal]`), header, body slot, footer slot; Framer Motion `AnimatePresence` — enter `{ opacity:0, y:10, scale:0.98 }→{ opacity:1, y:0, scale:1 }` at 350ms `ease-out-expo`, exit `{ opacity:0, scale:0.97 }` at 150ms; Escape key listener; backdrop click → `onClose`; `role="dialog"` + `aria-modal="true"` + `aria-labelledby` via `useId()`; zero hardcoded colour values
- `CalledModal`, `ConfirmModal`, `ReasonModal` refactored to compose `Modal`; own chrome deleted; hardcoded `#fff`/`#ffffff` violations replaced with CSS tokens
- `src/components/CLAUDE.md` updated with props contract and the rule that every future modal composes the primitive

Props: `open: boolean`, `onClose: () => void`, `title: string`, `children: React.ReactNode`, `footer: React.ReactNode`, `maxWidth?: string` (default `max-w-lg`)

---

## 2026-05-27

### Personal details card on lead dossier

#### Personal details enrichment (Migration 0009)

- `personal_details JSONB` column added to `leads` — stores agent-collected enrichment keyed by field name; existing RLS covers it; no extra policies needed
- `Lead.personal_details: Record<string, string> | null` added to `database.ts`
- `UpdatePersonalDetailsSchema` added to `lead-schema.ts` — five fields (company, occupation, interests, city, notes); each passes through `sanitizeText()`
- `updatePersonalDetails` server action in `leads.ts` — Zod → auth → two-layer access check → merge into existing JSONB (preserves prior keys, strips empty strings)
- `PersonalDetailsCard` — inline card on the dossier left column; dormant read-only view until user clicks a field; 2-col grid (Company, Occupation, Interests, City) + full-width Details textarea; Save + Cancel footer appears only when active; follows `AgentScratchpad` card pattern
- Card is visible to all roles with dossier access; editable by assigned agent, manager (domain), admin, founder

---

### Post-Phase 5 hardening

#### Atomic round-robin agent assignment (Migration 0007)

- Replaced three-query application-layer round-robin with a single `get_next_round_robin_agent()` SECURITY DEFINER function
- `SELECT FOR UPDATE SKIP LOCKED` on `agent_routing_config` — two concurrent webhook calls cannot pick the same agent
- O(agents) not O(leads) — `MAX(assigned_at) GROUP BY` subquery, not a full table scan
- Two-step fallback for agents without a routing config row
- Added `idx_leads_assigned_to_assigned_at` partial index

#### Lead deduplication by phone (Migration 0008)

- Phone is the dedup key. Active lead (`new | touched | in_discussion | nurturing`) → log `duplicate_submission` activity, return existing lead, no new row created
- Terminal lead (`lost | junk | won`) → create new lead, set `previous_lead_id` FK to predecessor
- `get_active_lead_by_phone()` SECURITY DEFINER function with `idx_leads_phone_active` partial index
- `previous_lead_id` self-referential FK added to `leads` table (`ON DELETE RESTRICT`)
- `duplicate_submission` registered as valid `action_type` on `lead_activities`
- `Lead.previous_lead_id` and `duplicate_submission` added to `database.ts` types
- `IngestionResult` union extended with `duplicate: boolean` flag

#### Activity log — assignee name resolution

- `LeadActivityWithActor` type extended with `assignee_name: string | null`
- `getLeadActivitiesFull()` now batch-resolves `details.assigned_to` UUIDs alongside `actor_id` in a single `getProfileNameMap` call — zero extra DB queries
- `LeadActivityLog` component: `lead_created` now reads "Lead entered the system"; `agent_assigned` now reads "Assigned to [Name]"

---

## 2026-05-27 — Phase 5 complete

### Profile page + theme system

- `GET /profile` — server component; 6 card sections (avatar, details, theme, password, notifications)
- `ProfileAvatarSection` — click-to-upload via Supabase Storage `avatars` bucket; initials fallback; role/domain badges
- `ThemeSelector` — 5 swatches; instant DOM switch + async DB persist; no flash on load
- `PasswordChangeForm` — re-authenticates before `updateUser`; live 4-step strength bar
- `NotificationPreferences` — stubbed; "Coming soon"
- Inline `<script>` in dashboard layout sets `data-theme` synchronously before paint
- Sidebar footer → `<Link href="/profile">` with active-state styling

---

## 2026-05-27 — Raw payload logging

- Migration 0004: `lead_raw_payloads` table — immutable JSONB log; `lead_id` backfilled after insert; admin/founder only
- Migration 0005: `ingestion_error` column on `lead_raw_payloads` — marks failed ingestions for the error log
- `lead-ingestion.ts` — logs raw payload as step 1; logging failure is non-fatal
- `adapters.ts` — `adaptMeta` handles three payload shapes: Meta native, Pabbly, flat top-level keys; multi-key fallback for phone/email/ad fields
- `GET /error-log` — admin/founder page showing all errored raw payloads

---

## 2026-05-27 — Phase 4 complete

### Lead dossier + full lifecycle

- `GET /leads/[id]` — server component; parallel fetches; page-level access gate mirrors action-level
- `LeadInfoCard` — contact fields, UTM params, domain/platform/intent
- `StatusActionPanel` — Called/Won/Nurturing/Lost/Junk actions; owns CalledModal + ConfirmModal + ReasonModal
- `CalledModal` — call outcome dropdown + required note; auto-advances `new → touched`
- `AgentScratchpad` — debounced auto-save (1s); assigned agent + admin only
- `LeadNotesSection` — chronological notes timeline with author names + call outcome badges
- `LeadJourneyTimeline` — visual 4-stage path (`new → touched → in_discussion → won`); dwell times; resolution badge
- `LeadActivityLog` — append-only activity history; newest first
- `LeadDossierTasksAsync` — async server component; next pending task; overdue state highlighted

---

## 2026-05-27 — Phase 3 complete

### Gia module: lead ingestion, assignment, lead list

- Migration 0003: `leads`, `lead_activities`, `lead_notes`, `tasks`, `task_gia_meta` with full RLS
- Webhook `POST /api/webhooks/leads` — Bearer auth + in-memory rate limiting
- `ingestLead()` — validate → sanitize → resolve domain → round-robin assign → insert → log activities
- `LeadsTable` — client-side status filter + search; role-aware (agent/manager/admin/founder)
- Sidebar: Leads nav link added

---

## 2026-05-27 — Phase 2 complete

### User management + agent routing

- `agent_routing_config` table; auto-created on `role=agent` via trigger
- `toggleAgentRouting` server action (manager/admin/founder)
- `inviteUser` action — magic-link invite via `inviteUserByEmail`
- `UsersTable` — client-side filters (role, domain, search)
- `EditProfileForm`, `EditAuthorizationForm`, `UserStatusControls`
- `GET /admin/users/[id]` — user detail page

---

## 2026-05-26 — Phase 1 complete

### Profiles system + user creation

- Migration 0001: `user_role` and `app_domain` enums
- Migration 0002: `profiles` table; RLS; `get_user_role()` / `get_user_domain()`; `on_auth_user_created` trigger; `profile_audit_log`
- `createUser`, `updateProfile`, `updateUserAuthorization`, `toggleUserActive` server actions
- Dashboard layout; Sidebar; TopBar
- `GET /admin/users` — user list
- `GET /admin/users/new` — create user form

---

## 2026-05-26 — Phase 0 complete

### Foundation

- Next.js 16 App Router scaffolded; Supabase connected; Tailwind v4; shadcn/ui
- `design-tokens.css` — all CSS variables; five themes (Earth, Air, Water, Fire, Cosmos)
- Supabase client files: `client.ts`, `server.ts`, `middleware.ts`
- Auth pages: login, forgot-password, update-password
- Shared utilities: `sanitize.ts`, `phone.ts`, `dates.ts`, `numbers.ts`, `chart-tokens.ts`, `scroll.ts`
