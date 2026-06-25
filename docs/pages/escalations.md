# Escalations — Page Spec

> **Purpose:** spec for `/escalations` — the manager+ breach surface for the Gia follow-up engine (live SLA breaches, overdue follow-up tasks, going-cold leads).
> **Audience:** engineers. · **Source-of-truth scope:** the escalations route + the escalation reads in `sla-service.ts`. Engine business rules: `../modules/gia.md` §4.
> **Last verified:** 2026-06-25 (shipped 2026-06-12; agent self-view added 2026-06-25).

## 1. Purpose

One page that answers "what needs intervention right now". Built entirely on artifacts the
follow-up engine already produces — fired `lead_sla_timers`, the exactly-once
`tasks.overdue_at` stamp (migration 0113), and the going-cold predicate shared with
`/leads?going_cold=true`. No new tables, no new jobs, no cache.

## 2. Who sees it

All roles except guest (`guest` → `redirect('/dashboard')`). **Scope by role:**

- **agent** → a **self-scoped** view of their OWN slipped work (`assignedTo = profile.id`):
  the leads they let stall, the follow-ups they ran past due, their leads going cold. The
  Agent column is dropped (every row is the viewer), titles/empty-copy go second-person, and a
  serif-italic reflective intro frames it as a self-coaching mirror, not a scoreboard. Added
  2026-06-25 by giving `getEscalatedLeads`/`getOverdueGiaTasks` an optional `assignedTo` arg
  (the one `getGoingColdLeads` already had).
- **manager** → pinned to their own domain.
- **admin / founder** → org-wide, with a Domain column.

Route prefix `/escalations` is in `DOMAIN_ROUTE_MAP` for the **Gia domains only** — the layout
guard is domain-based, so a non-Gia agent (finance/tech/…) can neither see the nav link nor reach
the URL. The page enforces only the guest gate. Sidebar: Analytics section — `/escalations` is an
all-roles exception alongside `/performance` (was `isManager`-only before the agent view).

The header row holds the title left and — when `TOP_BAR_ENABLED` (`lib/constants/feature-flags`,
currently `true`) — a `<PageControls>` cluster right (notifications + theme; seeded with
`getNotifications(profile.id)`, `isPrivileged={false}`). This is the only control surface on the
page; there is no page-level action CTA.

## 3. Data sources

| Layer | Key items |
| ----- | --------- |
| Service | `sla-service.ts` — `getEscalatedLeads(domain\|null, assignedTo?)`, `getOverdueGiaTasks(domain\|null, assignedTo?)`, `getGoingColdLeads(scope?: { domain?; assignedTo? })`. **All three carry an optional agent self-scope** (`assignedTo`): the page passes `profile.id` for agents (own slipped leads/tasks), `null` for manager+; `getGoingColdLeads`'s scope object also serves the Elaya `get_cold_leads` tool (added 2026-06-20). Admin client with **session-derived** scope args (the gated page is the trust boundary, `getAgentRosterByDomain` pattern); `mapRows` typed boundary |
| Cache | **None, deliberately** — an escalation surface must never show stale breaches |
| RSC | `page.tsx` role-gates, then `EscalationsAsync` runs the three reads in `Promise.all` inside `Suspense` |

Semantics:

- **SLA breaches** — `lead_sla_timers` rows `status='fired'` within the last 7 days
  (`ESCALATION_WINDOW_DAYS`), inner-joined to non-terminal, non-archived leads, kept only
  when the fired rule is a status policy whose `trigger_value` still equals the lead's
  current status (a lead that moved on is resolved, not live). CAD-prefixed fires are
  routine cadence ticks and are excluded. Grouped one row per lead with all breached codes.
- **Overdue tasks** — open (`to_do`/`in_progress`/`in_review`) lead-follow-up tasks with a
  non-null `overdue_at`. The lead-task signal is **`task_gia_meta` meta-presence** (a `task_gia_meta!inner`
  join), not a category: migration 0138 collapsed `task_category` to two structure-only values
  (`personal` / `group_subtask`), so a lead follow-up is now a `personal` task that also carries a
  `task_gia_meta` row + `module='gia'`. There is no `gia_followup` category filter. Archived leads are
  excluded; newest overdue first.
- **Going cold** — the exact `/leads?going_cold=true` predicate: non-terminal,
  `last_activity_at` strictly older than the going-cold cutoff (`goingColdCutoff()` from
  `lib/constants/leads`, a rolling `now − COLD_LEAD_THRESHOLD_DAYS` window where
  `COLD_LEAD_THRESHOLD_DAYS = 5`), coldest first. NULL `last_activity_at` (never-contacted) is
  excluded via `lt()` — those are SLA-01A's job, not the going-cold preset.

## 4. Components

`EscalationSections.tsx` (`src/components/escalations/`) — three client section cards
(`EscalatedLeadsSection`, `OverdueTasksSection`, `GoingColdSection`), each a paper card
header (label-micro title + count pill) wrapping `Table<T>` (the sanctioned secondary
table). Rows navigate to the lead dossier (`/leads/${slug ?? id}`). Summary strip: three
`StatTile variant="card"`. Going-cold header carries an "Open in Leads" deep link.

**Alerted column (breaches card only):** the SLA-breaches table carries an **Alerted** column
rendering `EscalatedLeadRow.recipients` (`SlaRecipientRole[]`) as a `RecipientChips` cluster —
one quiet pill per escalation target (Agent / Manager / Founder, each glyphed, agent→founder
order). The recipients are the union of `recipient_role` across the lead's matched status breach
policies (so a nurturing breach shows Agent + Manager from SLA-04A/04B). In the agent `selfView`
the agent's pill is the accent-tinted **"You"**; all chips are tokenised (paper-subtle vs
accent-surface), no hardcoded colour. The column is breaches-only by design — going-cold is a
derived predicate with no fired timer / no alert, and overdue-task escalation runs on the separate
task-reminder mechanism.

## 5. States

- **Loading:** `escalations/loading.tsx` (PageSkeletons composition; body skeleton shared
  with the page's Suspense fallback as `EscalationsSkeleton`).
- **Empty:** `<EmptyState variant="inline">` per section ("Nothing is breaching right
  now." / "No follow-up has slipped past due." / "Every active lead has recent movement.").
- **Error:** service reads return `[]` on error (logged with `[sla-service]` prefix) —
  sections render their empty states; the page never throws.

## 6. Invariants

1. Reads are **never cached** (no Redis, no `unstable_cache`).
2. Scope args are session-derived only — never from URL params.
3. Breach rows must re-check `trigger_value === lead.status` at read time; never list a
   fired timer for a lead that has moved on.
4. CAD-prefixed fires never appear as breaches.
5. The going-cold predicate must stay byte-equivalent to the `/leads` filter. The cutoff is the
   single DRY'd `goingColdCutoff()` helper (`lib/constants/leads`, 2026-06-23) — change
   `COLD_LEAD_THRESHOLD_DAYS` (and its SQL twin `public.cold_lead_cutoff()`) there and this page
   follows for free; a re-inlined `new Date(Date.now() − …)` or a forked status set is a bug.

## 7. Open items

- No per-section pagination (limits: 500 timers scanned / 100 tasks / 100 cold leads) —
  revisit if a domain's breach volume ever approaches the caps.
- Admin/founder domain filter dropdown (currently org-wide only) — add if founders ask.
