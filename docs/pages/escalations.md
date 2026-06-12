# Escalations — Page Spec

> **Purpose:** spec for `/escalations` — the manager+ breach surface for the Gia follow-up engine (live SLA breaches, overdue follow-up tasks, going-cold leads).
> **Audience:** engineers. · **Source-of-truth scope:** the escalations route + the escalation reads in `sla-service.ts`. Engine business rules: `../modules/gia.md` §4.
> **Last verified:** 2026-06-12 (shipped).

## 1. Purpose

One page that answers "what needs intervention right now". Built entirely on artifacts the
follow-up engine already produces — fired `lead_sla_timers`, the exactly-once
`tasks.overdue_at` stamp (migration 0113), and the going-cold predicate shared with
`/leads?going_cold=true`. No new tables, no new jobs, no cache.

## 2. Who sees it

manager / admin / founder (agents and guests → `redirect('/dashboard')`). Manager is pinned
to their own domain; admin/founder see org-wide with a Domain column. Route prefix
`/escalations` is in `DOMAIN_ROUTE_MAP` for the Gia domains (the layout guard is
domain-based; the page itself enforces the role gate, same split as `/budget`). Sidebar:
Analytics section, behind the existing `isManager` gate.

## 3. Data sources

| Layer | Key items |
| ----- | --------- |
| Service | `sla-service.ts` — `getEscalatedLeads(domain\|null)`, `getOverdueGiaTasks(domain\|null)`, `getGoingColdLeads(domain\|null)`; admin client with **session-derived** scope args (the gated page is the trust boundary, `getAgentRosterByDomain` pattern); `mapRows` typed boundary |
| Cache | **None, deliberately** — an escalation surface must never show stale breaches |
| RSC | `page.tsx` role-gates, then `EscalationsAsync` runs the three reads in `Promise.all` inside `Suspense` |

Semantics:

- **SLA breaches** — `lead_sla_timers` rows `status='fired'` within the last 7 days
  (`ESCALATION_WINDOW_DAYS`), inner-joined to non-terminal, non-archived leads, kept only
  when the fired rule is a status policy whose `trigger_value` still equals the lead's
  current status (a lead that moved on is resolved, not live). CAD-prefixed fires are
  routine cadence ticks and are excluded. Grouped one row per lead with all breached codes.
- **Overdue tasks** — open (`to_do`/`in_progress`/`in_review`) gia_followup tasks with a
  non-null `overdue_at`, joined to their lead via `task_gia_meta`.
- **Going cold** — the exact `/leads?going_cold=true` predicate: non-terminal,
  `last_activity_at` older than `COLD_LEAD_THRESHOLD_DAYS` (5), coldest first.

## 4. Components

`EscalationSections.tsx` (`src/components/escalations/`) — three client section cards
(`EscalatedLeadsSection`, `OverdueTasksSection`, `GoingColdSection`), each a paper card
header (label-micro title + count pill) wrapping `Table<T>` (the sanctioned secondary
table). Rows navigate to the lead dossier (`/leads/${slug ?? id}`). Summary strip: three
`StatTile variant="card"`. Going-cold header carries an "Open in Leads" deep link.

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
5. The going-cold predicate must stay byte-equivalent to the `/leads` filter — if
   `COLD_LEAD_THRESHOLD_DAYS` or the status set changes there, this page follows for free
   (shared constant), but a predicate fork is a bug.

## 7. Open items

- No per-section pagination (limits: 500 timers scanned / 100 tasks / 100 cold leads) —
  revisit if a domain's breach volume ever approaches the caps.
- Admin/founder domain filter dropdown (currently org-wide only) — add if founders ask.
