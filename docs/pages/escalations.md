# Escalations: Page Spec

> **Purpose:** spec for `/escalations`, the breach surface for Gia's follow-up engine: live SLA breaches, overdue lead follow-ups, and leads going cold. Managers and above see their domain or the company; an agent sees their own slipped work.
> **Audience:** engineers. · **Source-of-truth scope:** the escalations route and the three escalation reads in `sla-service.ts`. Engine business rules: `../modules/gia.md` § SLA Engine. The live-activity view beside it: `./oversight.md`.
> **Last verified:** 2026-09-26 against `src/app/(dashboard)/escalations/{page,loading}.tsx`, `src/components/escalations/EscalationSections.tsx`, `src/lib/services/{sla-service,gia-task-links}.ts`, `src/lib/constants/route-permissions.ts`, `src/lib/utils/route-access.ts`, `src/components/layout/Sidebar.tsx`.

## 1. Purpose

One page that answers "what needs someone to step in right now". It is built only on what the
follow-up engine already produces: the SLA timers in `gia.lead_sla_timers`, the once-only
`tasks.overdue_at` stamp (0113), and the going-cold rule shared with `/leads?going_cold=true`. No
tables, no jobs and no cache of its own.

## 2. Who sees it

| Caller | View |
| ------ | ---- |
| agent (Gia domain) | **self view**: only their own slipped work (`assignedTo = profile.id`); section titles in the second person ("Leads that slipped", "Your overdue follow-ups"); the first tile reads "Leads slipped"; no Agent column; their own chip in the Alerted column reads "You" |
| manager (Gia domain) | pinned to their own domain |
| admin, founder | the whole company by default, with a Domain column; the global domain selector (`resolveDomainParam`: `?domain=`, then the `serene-domain` cookie) narrows it. Additive filtering, not a security boundary |
| tech workbench | reaches the page. A tech agent gets the self view (empty); a tech manager is pinned to `tech`, which has no leads, so every section is empty |
| guest | redirected to `/dashboard` |
| concierge, finance, marketing, business | not in their route map; the layout sends them to `/dashboard` |

- **Route map:** `/escalations` is in the `DOMAIN_ROUTE_MAP` of the four Gia domains only. The page
  itself checks only the guest case (a literal role check, not a route-access helper).
- **Sidebar:** "Escalations" (`AlertTriangle`) in the Analytics section. Unlike the rest of the
  section it is listed for every role (with Performance), because agents have the self view. It is
  **not** in the founder's curated sidebar, so founders reach it by URL.
- **Title row:** "Escalations." and the `PageControls` bell (with the domain selector for
  admin/founder). No page-level action.

## 3. Data sources

| Layer | Key items |
| ----- | --------- |
| Service | `sla-service.ts`: `getEscalatedLeads(domain \| null, assignedTo?)`, `getOverdueGiaTasks(domain \| null, assignedTo?)`, `getGoingColdLeads(scope?: { domain?, assignedTo? })`. All three take the optional agent self-scope. Admin client with **session-derived** scope arguments (the page is the trust boundary); every Gia table through `giaDb()`; `mapRows` at the boundary. `getGoingColdLeads` also backs Elaya's `get_cold_leads` tool |
| Link reads | `gia-task-links.ts`: `getGiaLinksForTasks` (the overdue list) |
| Cache | **none, on purpose**: an escalation list must never show a stale breach |
| RSC | `page.tsx` resolves the scope, then `EscalationsAsync` runs the three reads in one `Promise.all` inside `Suspense` |

**What each list means:**

- **SLA breaches:** a status SLA timer that has **fired** in the last 7 days
  (`ESCALATION_WINDOW_DAYS`), **or** a **pending** timer whose `scheduled_fire_at` has already
  passed (the deadline is gone even if the Trigger.dev job has not run yet: the same test the job
  itself uses). Only non-archived leads that are not won, lost or junk. A row is kept only while the
  breached policy's `trigger_value` still equals the lead's current status (a lead that moved on is
  resolved, not live). Cadence fires (`CAD-…`) are routine and never listed. One row per lead with
  every breached rule, newest breach first; up to 500 timers scanned.
- **Overdue tasks:** `getOverdueGiaTasks` reads `public.tasks` for open tasks (to do, in progress,
  in review) whose `overdue_at` is set or whose `due_at` has passed, newest deadline first, up to
  1,000 (`OVERDUE_SCAN_CAP`); then `getGiaLinksForTasks` finds which are lead follow-ups (the
  `gia.task_gia_meta` row, read in chunks of 200, because PostgREST cannot embed across the schema
  line); then it drops non-lead tasks and archived leads, applies the domain filter, and keeps at
  most 100. The breach moment is `overdue_at`, else `due_at`.
- **Going cold:** exactly the `/leads?going_cold=true` rule: not terminal, and `last_activity_at`
  older than `goingColdCutoff()` (`lib/constants/leads`, now minus `COLD_LEAD_THRESHOLD_DAYS`, 5).
  A NULL `last_activity_at` (never contacted) is excluded; that is SLA-01A's job. Coldest first, up
  to 100.

## 4. Components

`src/components/escalations/EscalationSections.tsx` (client): `EscalatedLeadsSection`,
`OverdueTasksSection`, `GoingColdSection`. Each is a `SectionCard` with a count pill in its header,
wrapping `Table<T>`. Each shows the newest 50 rows with a "Show all N" reveal (`previewRows`, rule
P-03). Rows open the lead (`/leads/<slug or id>`). The going-cold card links "Open in Leads". Above
them, a strip of three `StatTile`s.

**Alerted column** (breaches only): `EscalatedLeadRow.recipients` rendered as `RecipientChips`, one
quiet pill per target (Agent, Manager, Founder, in that order), the union of `recipient_role`
across the lead's matched policies. In the self view the agent's own pill reads "You" on the accent
surface. Breaches only by design: going cold has no timer and no alert, and overdue tasks escalate
through the task-reminder jobs.

## 5. States

- **Loading:** `escalations/loading.tsx`; the body skeleton is shared with the page's Suspense
  fallback (`EscalationsSkeleton`).
- **Empty:** each section shows a hero `<EmptyState>` with the Serene mark:
  - Breaches: "Nothing is breaching right now." (self: "Nothing of yours is slipping.") / "When a
    lead crosses its SLA, it will surface here for you to act on."
  - Overdue: "No follow-up has slipped past due." (self: "Every follow-up of yours is on time.") /
    "An overdue follow-up task will appear here the moment it passes its deadline."
  - Going cold: "Every active lead has recent movement." (self: "Every one of your leads has recent
    movement.") / "Leads drifting quiet for too long will gather here before they go cold."
- **Error:** each read returns `[]` on error (logged `[sla-service]`), so the section shows its
  empty state; the page never throws.

## 6. Invariants

1. Never cached (no Redis, no `unstable_cache`).
2. The agent self-scope comes from the session only, never the URL. The admin/founder domain narrow
   rides `?domain=` or the cookie through `resolveDomainParam`; it filters, it never grants.
3. A breach row re-checks `trigger_value === lead.status` at read time.
4. `CAD-…` fires never appear as breaches.
5. The going-cold rule stays identical to the `/leads` filter through the one `goingColdCutoff()`
   helper (and its SQL twin `public.cold_lead_cutoff()`).
6. The task ↔ lead link is read through `gia-task-links.ts`, never an embed across schemas.

## 7. Open items

- Service caps: 500 timers scanned, 1,000 tasks scanned and 100 shown, 100 cold leads. Revisit if a
  domain's volume nears them.
- The founder's sidebar does not list Escalations.
- The tech workbench reaches the page but sees empty lists (its manager is pinned to `tech`).
- Decided and shipped: per-section preview with "Show all" (2026-07-03); the admin/founder domain
  filter is the global selector (2026-06-25), not a page dropdown.

## 8. See also

`/oversight` (`./oversight.md`) sits beside it in Analytics: the live-activity drill over
`task_events`. Escalations is the breach surface; Oversight is the work-in-progress surface.
