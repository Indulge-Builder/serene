# Mobile Ops — the founder's pocket operating system

Status: **BUILT (phases 0–5, 2026-07-06)** — see the changelog entry of that date for the full
file map. Owner-facing. This document is the build contract for the `/m` mobile layer. Read it
before writing a line of code in `src/components/mobile/` or `src/app/(member)/`.

> **Apply-to-prod note:** migrations `20260706000159_activity_events.sql` and
> `20260706000160_get_domain_task_summary.sql` were **applied + verified 2026-07-06**
> (`supabase db push`, after a one-time `migration repair` reconciling the MCP-apply history
> drift). Remaining follow-up: regenerate `database.ts` to retire the two documented
> `activity_events` interim casts.
>
> **Build-time decisions (differences from the plan below):**
>
> 1. §8 open question 1 — lead/deal writes emit `activity_events` DIRECTLY from the mutation
>    cores; task rows are DERIVED inside `emitTaskEvent` (created → task_created,
>    status→completed → task_completed) so task writes are never double-sourced.
> 2. §8 backfill — 30 days (the recommendation), in the migration.
> 3. §7 Dashboard deals-vs-target — renders the neu `ProgressCard`, NOT a wrapped Recharts
>    `DomainTargetMeter` (keeps Recharts out of the mobile chunk entirely).
> 4. §6 — `Carousel` gained an additive `hideControls` prop (arrows + dots + counter off);
>    `DomainSwiper` owns the neu header + dot pager. Desktop consumer untouched.
> 5. §10 — the SSE loop was extracted to `src/components/elaya/elaya-stream.ts`
>    (`streamElayaChat` + `TOOL_STATUS_LABELS`); `ElayaChatShell` and the mobile
>    `ElayaChatScreen` both pump it. The mobile chrome stayed; the demo composer's decorative
>    mic was dropped (dead control).
> 6. Roles — manager gets the same four rooms pinned to their own Gia domain; agent (and a
>    manager in a non-Gia domain) sees a calm coming-soon card. Their real room sets remain
>    later phases (§4).

---

## 1. Why this exists

The founder and leadership have every number in Serene already — but it is scattered across
`/dashboard`, `/tasks`, `/budget`, `/performance`, `/campaigns`. They do not want to walk five
pages to answer "how is Onboarding doing today." They want the month's most important things in
the hand, one thumb, fast.

The `/m` layer today is a **display-only mockup** (`src/components/mobile/`, fed entirely by
`demo-data.ts`). The shell — chrome, primitives, motion, `--neu-*` tokens — is production quality.
**We keep every pixel of the design.** We replace the demo data with real, domain-scoped reads and
wire the four rooms + Elaya into live surfaces.

**This plan builds the ADMIN experience end-to-end.** Manager and agent tab sets are registered as
stubs (Section 4) and built in later phases. The infrastructure (role-driven tab bar, domain-swipe
carousel, the activity stream, the data adapters) is shared and built once here.

---

## 2. The non-negotiables (how we stay production-grade)

These are the rules this build lives or dies by. They are the reason we survey before we type.

1. **Reuse first (R-01).** Almost every number these screens need is already computed by an
   existing service function. We add adapters and screens, not parallel query layers. Section 7 is
   the exhaustive reuse map — a widget that has an existing source **must** use it.
2. **Display-only screens (A-06).** Mobile screen components render; they never query. Data enters
   through Server Actions in `lib/actions/` (a `'use client'` surface can never import a service —
   A-15). Every screen is seeded by its RSC `page.tsx` and refreshes through an action.
3. **`--neu-*` tokens only.** The mobile layer never touches `--theme-*`. The one shared primitive
   we borrow from the dashboard (`Carousel`) gets a neu-token pass or `hideDots` (Section 6).
4. **One swipe engine.** Domain paging on all four screens composes the existing
   `src/components/ui/Carousel.tsx` — controlled, transform-based, axis-locked. We never fork a
   second transform track.
5. **The activity stream is one append-only table.** Not a UNION of live reads. Rationale in
   Section 8 — this is the "fast for a decade" decision.
6. **Changelog + docs (Rule 12).** Every phase lands a `docs/changelog.md` entry. This file is the
   living contract; update it when a decision changes.

---

## 3. The four rooms + Elaya (admin)

The tab bar stays exactly as designed: **4 tabs + the center Elaya knob**. The knob is the Elaya
page, not a tab. For the **admin** role the four rooms are:

| # | Room | Route | What it answers | Reuses |
| - | ---- | ----- | --------------- | ------ |
| 1 | **Dashboard** | `/m` | "How is each domain performing right now?" | `getLeadStatusSummary`, `getLeadsByCampaign`, `getDomainHealthMetrics`, `getDomainTargets`, budget gauge |
| 2 | **Tasks** | `/m/tasks` | "How is each domain / agent doing on their tasks?" | **NEW** `get_domain_task_summary` RPC (no schema change) |
| 3 | *(Elaya knob)* | `/m/elaya` | The compass — chat with Elaya | `/api/elaya/chat` SSE (the real brain) |
| 4 | **Budget** | `/m/budget` | "Where is the money going per domain?" | `getBudgetSummary` + `filterBudgetRowsByDomain`, deals-vs-target; **expense tracker = Coming Soon placeholder** |
| 5 | **Activity** | `/m/activity` | "Everything happening in a domain, live" | **NEW** `activity_events` table + Realtime |

> Route note: the current mockup uses `/m/requests`, `/m/activity`, `/m/profile`. We repurpose the
> tab set to `/m` (Dashboard), `/m/tasks`, `/m/budget`, `/m/activity`, plus `/m/elaya` (knob). The
> old `requests`/`profile` demo routes are retired from the tab bar (profile moves into the drawer,
> which already has it). Keep the demo screens in git history; do not delete until the real screens
> replace them.

Every one of the four rooms is **domain-swipeable**: swipe left/right pages between Onboarding,
Shop, House, Legacy (the `AppDomain` set). The active domain is one piece of state, lifted to the
screen and synced to the `Carousel` index.

---

## 4. The role-driven tab registry (build first — it unblocks everything)

Today `MobileTabBar` hardcodes a local `TABS` literal. We make it data-driven off a registry keyed
by role, mirroring how `DOMAIN_ROUTE_MAP` / `route-permissions.ts` already drive desktop nav.

**New file:** `src/lib/constants/mobile-rooms.ts`

```text
MobileRoom = { key, href, label, icon: LucideIcon }   // pure data, no component refs (dashboard-widgets.ts precedent)
MOBILE_ROOMS_BY_ROLE: Record<UserRole, MobileRoom[]>   // exactly 4 per role (the knob is separate)
getMobileRooms(role): MobileRoom[]                     // the resolver
```

- **admin / founder:** Dashboard · Tasks · Budget · Activity  ← built this phase
- **manager:** stubbed (same four is a fine v1 default; refine in a later phase)
- **agent:** stubbed (agent-relevant four — e.g. My Leads · My Tasks · (Elaya) · Activity — later phase)

`MobileTabBar` becomes: read the caller's role (threaded down from the `(member)/layout.tsx` profile
— see Section 5), call `getMobileRooms(role)`, render the 2 + knob + 2 layout it already has. The
**exactly-4 contract holds** — the registry is validated to 4 entries per role. The Elaya knob stays
hardcoded center (it is not a room).

Constraint kept: **never a fifth tab.** The registry enforces length 4; a type-level tuple
(`[MobileRoom, MobileRoom, MobileRoom, MobileRoom]`) makes a fifth a compile error.

---

## 5. Threading identity into the shell

`(member)/layout.tsx` already fetches `getCurrentProfile()` for the auth gate but drops it. We lift
it into a member context so the tab bar (role) and every screen (role + domain scope) can read it
without re-fetching.

**New:** `src/components/mobile/MobileSessionProvider.tsx` (`'use client'`) — a tiny context holding
`{ id, role, domain, full_name }` (the same `callerProfile` shape `AddLeadModal` already uses).
`(member)/layout.tsx` (RSC) fetches the profile once and wraps children in the provider. `useMobileSession()`
is the hook. No new fetch; no service import in a member file (the RSC does the read).

This is also where **admin/founder domain scope** resolves: admin sees all domains (the swipe pages
through all four); a future manager is pinned to their own domain (the carousel collapses to one).
The `resolveDomainParam` posture from `domain-scope.ts` is the reference — but mobile scope is
carousel state, not a URL param, so it lives in the provider / screen state.

---

## 6. The domain-swipe carousel (shared, built once)

**New:** `src/components/mobile/DomainSwiper.tsx` (`'use client'`) — the ONE domain-paging wrapper
every room composes. It owns:

- the active-domain state (or takes it controlled),
- an app-bar-adjacent **domain header** (icon + label + the pastel accent per domain, from a
  `DOMAIN_VERTICALS` lookup — Section 9),
- the `Carousel` composition: `items={visibleDomains}`, `index`, `onIndexChange`, `renderItem={domain => children(domain)}`.

Contract: `<DomainSwiper role={...} renderDomain={(domain) => <DashboardRoom domain={domain} />} />`.
For a single-domain (manager) role it renders the one domain with no swipe affordance.

**Carousel reuse note:** `src/components/ui/Carousel.tsx` is directly suitable (controlled,
transform-based, axis-locked, keyboard, `hideDots`). Its dots/arrows read a few `--theme-*` tokens.
For mobile we pass `hideDots` and supply a neu domain-pager indicator in `DomainSwiper` (small dots
in `--neu-*`), OR do a one-time token pass on `Carousel` to accept token overrides. **Decision: pass
`hideDots` + own the indicator in `DomainSwiper`** — zero risk to the desktop `FounderDrillDownDeck`
consumer. Do not fork the swipe engine.

---

## 7. Reuse map — every widget → its existing source

This is the R-01 ledger. Green = reuse as-is. Yellow = new aggregation, no schema change. Red = new
table.

### Dashboard room (`/m`) — per swiped domain

| Widget | Source (existing unless noted) |
| ------ | ------------------------------ |
| New leads received (count card) | `getLeadStatusSummary(role, domain).totals` (sum) — dashboard-service |
| Agent performance (per-agent: calls today, leads assigned, statuses, last note) | `getLeadStatusSummary(...).byAgent` (`AgentStatusBreakdown`) + the Today pulse pattern; last note via the `lead_activities` join already in `get_recent_lead_activity` |
| Campaign performance by lead status | `getLeadsByCampaign(role, domain)` → `CampaignStatusMix[]` — dashboard-service |
| Budget spent (domain) | `getBudgetSummary(from,to)` + `filterBudgetRowsByDomain(rows, domain)` — ad-spend-service |
| Deals-vs-target meter | `getDomainHealthMetrics([domain], monthFrom, monthTo).totalDeals` + `getDomainTargets()`; render existing `DomainTargetMeter` (needs a neu wrapper) |

**Net: zero new backend for Dashboard.** All five widgets have existing reads. Work = mobile
presentation + one action per screen that batches these (a `getMobileDashboardAction(domain)` that
`Promise.all`s the existing service fns — an orchestration action, not new queries).

### Tasks room (`/m/tasks`) — per swiped domain

| Widget | Source |
| ------ | ------ |
| Domain counts: created / completed / overdue | **NEW RPC** `get_domain_task_summary(p_domain)` — admin-member, Q-13 scope-param pattern (mirrors `get_group_task_summaries`). **No migration** — `tasks.assigned_to/status/due_at` + `task_groups.domain` already exist. Overdue = `due_at < now()` in SQL. |
| Per-agent breakdown (tap → detail) | Same RPC emits per-agent buckets (mirror `AgentStatusBreakdown` shape for tasks). New service fn `getDomainTaskSummary`. |
| Tap agent → full detail (route change) | New light route `/m/tasks/[agentId]` reusing `getPersonalTasks`/`getGiaTasksForUser` filtered by assignee. Reuses existing reads; only the mobile view is new. |

**Net: one new RPC + one service fn + one action. No schema change.**

### Budget room (`/m/budget`) — per swiped domain

| Widget | Source |
| ------ | ------ |
| Campaign / ad spend (domain) | `getBudgetSummary` + `filterBudgetRowsByDomain` — reuse |
| Deals vs monthly target | `getDomainHealthMetrics` + `getDomainTargets` — reuse |
| (optional) campaign perf by status | `getLeadsByCampaign` — reuse |
| **Tech-team expense tracker** | **NOT BUILT.** Render a calm `Coming Soon` placeholder card (neu `EmptyState`-style, serif italic). No table, no service, no schema. A later phase adds `tech_expenses`. |

**Net: zero new backend.** Reuses budget + target reads. The expense tracker is a placeholder only.

### Activity room (`/m/activity`) — per swiped domain

| Widget | Source |
| ------ | ------ |
| Live unified feed (calls, notes, task created/completed, status changes, deals) | **NEW `activity_events` table** — Section 8. Realtime, domain-scoped, one channel. |

---

## 8. The activity stream — one append-only table (the decade decision)

**Decision: a single append-only `activity_events` table, modeled exactly on `task_events`.** Not a
UNION-of-reads feed.

**Why this over merging existing reads.** A merged feed (`lead_activities` + `task_events` + `deals`,
k-way merged per refresh) works today and needs no new table — but it degrades as each source table
grows, needs three indexed range-reads + a merge on every poll, and only `task_events` is Realtime,
so the feed is half-live. A single append-only stream is **one indexed reverse-chronological read,
one Realtime channel, one RLS policy, one homogeneous row shape** — flat performance regardless of
how large the source tables get. That is the "fast in a decade" property the founder asked for. The
codebase already proves the pattern: `task_events` (migration 0144) is append-only, domain-stamped,
Realtime-on, and `OversightRail.tsx` already runs a domain-filtered subscription against it.

**The table** (`supabase/migrations/XXXX_activity_events.sql`) — clone `task_events`:

```text
activity_events
  id            uuid pk
  domain        app_domain NOT NULL        -- stamped on the row, no join (task_events precedent)
  actor_id      uuid null (references profiles)   -- null = system/webhook
  subject_type  text     -- 'lead' | 'task' | 'deal'
  subject_id    uuid null
  event_type    text     -- 'call_logged' | 'note_added' | 'status_changed'
                         --  | 'task_created' | 'task_completed' | 'deal_logged' | 'lead_assigned'
  title         text     -- denormalized snapshot (lead name / task title) so the feed needs no join
  meta          jsonb    -- outcome, from→to status, amount, etc.
  created_at    timestamptz default now()
  indexes: (domain, created_at desc), (subject_id, created_at desc)
  RLS: manager+ SELECT (agent sees own via actor_id/subject scope — mirror lead_activities);
       NO insert/update/delete policy ever (A-11) — admin-member emit only
  publication: ALTER PUBLICATION supabase_realtime ADD TABLE activity_events
```

**The emit seam** (`src/lib/services/activity-events.ts`) — `emitActivityEvent(input)`, best-effort,
admin-member, exactly like `emitTaskEvent`. We call it beside the writes that already exist — the
mutation **cores** are the single chokepoints, so this is a handful of one-line additions, never a
scattering:

- `lead-mutations.ts` cores (`addLeadCallNoteCore`, `addLeadNoteCore`, `updateLeadStatusCore`,
  `assignLeadCore`) → `call_logged` / `note_added` / `status_changed` / `lead_assigned`.
- `task-mutations.ts` cores (already call `emitTaskEvent`) → add `task_created` / `task_completed`
  beside the existing task-event emit. (Or: derive activity rows from `task_events` in the emit
  helper to avoid double-writing — decide at build time; the single-table read contract is what
  matters.)
- `recordDeal` / `createWalkInDeal` → `deal_logged`.

**The read** (`src/lib/services/activity-service.ts`) — `getActivityFeed(domain, cursor?)`, keyset
(`created_at, id`) reverse-chronological, admin-member (Q-13), domain-scoped. One bounded read.

**The live layer** — the mobile Activity screen subscribes to `activity_events` filtered
`domain=eq.<x>` (the `OversightRail` subscription, copied), prepending INSERTs. Domain swipe = swap
the channel filter. One channel per active domain.

**Backfill:** optional. v1 can start the stream from "now" (empty until events flow) or backfill
recent `lead_activities` + `task_events` + `deals` rows in the migration. Recommend a light backfill
of the last 30 days so the feed isn't empty on launch.

---

## 9. Adapters — the demo shapes become the view-model contract

The mockup's `demo-data.ts` types (`DemoVertical`, `DemoRequest`, etc.) are good view-models. We keep
them as the **contract** and build adapters from service data → these shapes, rather than rewrite the
primitives.

- **`DOMAIN_VERTICALS`** (new, in `mobile-rooms.ts` or a sibling): maps each `AppDomain` → `{ label,
  icon: LucideIcon, iconToken, micro }`. This replaces the demo `DEMO_VERTICALS` and is the lookup
  `DomainSwiper` and any tile reads. Icons/tokens are presentation and belong in this lookup, never in
  an API payload.
- Each room gets a small adapter (`toDashboardView`, `toTaskSummaryView`, …) turning the action
  result into the props the neu primitives already expect. Reuse `content.tsx` primitives
  (`StatusDot`, `ProgressCard`, `ToastPill`), `controls.tsx`, `fields.tsx`, `buttons.tsx`,
  `app-bars.tsx`, `overlays.tsx` **as-is** — they are pure and prop-driven.

---

## 10. Elaya knob → real chat

The mockup `ElayaChatScreen` is a canned `setTimeout` echo. Wire it to the **real** brain: it must
consume `POST /api/elaya/chat` (the sanctioned SSE endpoint) exactly like the desktop
`ElayaChatShell` does — `meta`/`delta`/`tool`/`done`/`error` frames, the daily cap, the 24h session.
Reuse the SSE consumption loop; keep the mobile chat UI (halo header, composer, suggestion chips).
Do **not** fork a second Elaya transport. The shared body is `EmbeddedElayaChat` / the SSE loop in
`ElayaChatShell` — extract the loop if needed so both the desktop shell and the mobile screen call one.

---

## 11. Build phases

Each phase is independently shippable and lands a changelog entry.

**Phase 0 — Infrastructure (unblocks all rooms)**
1. `MobileSessionProvider` + `useMobileSession` (Section 5); `(member)/layout.tsx` threads the profile.
2. `mobile-rooms.ts` registry + `getMobileRooms(role)` + `DOMAIN_VERTICALS` lookup (Sections 4, 9).
3. `MobileTabBar` → data-driven off the registry (keeps exactly-4 + knob).
4. `DomainSwiper` composing `Carousel` with `hideDots` + neu indicator (Section 6).
5. Retire the demo `requests`/`profile` tab routes from the bar (profile stays in the drawer).

**Phase 1 — Dashboard room** (zero new backend)
- `getMobileDashboardAction(domain)` orchestration action (`Promise.all` of existing reads).
- `DashboardRoom` screen + adapters; neu `DomainTargetMeter` wrapper.

**Phase 2 — Activity stream** (the one new table)
- Migration: `activity_events` (Section 8) + RLS + publication + light 30-day backfill.
- `activity-events.ts` emit seam wired into the mutation cores.
- `activity-service.ts` `getActivityFeed`; `getActivityFeedAction`.
- `ActivityRoom` screen with the Realtime subscription (domain-filtered).

**Phase 3 — Tasks room** (new aggregation, no schema)
- `get_domain_task_summary(p_domain)` RPC + `getDomainTaskSummary` service fn + action.
- `TasksRoom` screen (counts + per-agent breakdown) + `/m/tasks/[agentId]` detail route reusing
  existing task-list reads.

**Phase 4 — Budget room** (reuse + placeholder)
- `getMobileBudgetAction(domain)` (reuse budget + target reads).
- `BudgetRoom` screen; **tech-expense tracker = Coming Soon placeholder card**.

**Phase 5 — Elaya knob** (reuse SSE)
- Wire `ElayaChatScreen` to `/api/elaya/chat` (extract/share the SSE loop). Keep the mobile UI.

**Later phases (out of scope here):** manager + agent tab sets and their room variants; the real
tech-team expense tracker (`tech_expenses` table); customer auth (un-stub the persona).

---

## 12. What is genuinely NEW vs reused (the honest ledger)

| New | Reused (no new code) |
| --- | -------------------- |
| `activity_events` table + emit seam + service + Realtime screen | Every Dashboard number (5 widgets) |
| `get_domain_task_summary` RPC + service fn | Budget campaign spend + deals-vs-target |
| `mobile-rooms.ts` registry + `DOMAIN_VERTICALS` | `Carousel` swipe engine |
| `MobileSessionProvider` | Every mobile UI primitive (buttons/fields/controls/content/overlays/app-bars) |
| `DomainSwiper` wrapper | `DomainTargetMeter` (thin neu wrapper) |
| 4 orchestration actions + 4 room screens + adapters | `/api/elaya/chat` SSE brain |
| `/m/tasks/[agentId]` detail route | Task-list reads behind it |

**Backend genuinely new: one table, one RPC.** Everything else is orchestration over reads that
already exist. That is the whole point — the founder's numbers are already computed; we are giving
them a pocket, not a parallel data layer.

---

## 13. Open questions to confirm before Phase 2

1. **Activity emit vs derive:** emit `activity_events` rows directly from the lead/deal/task cores, or
   derive them from the existing `lead_activities` + `task_events` streams via a trigger/fan-in? Direct
   emit is simpler and matches `task_events`; a trigger avoids double-writes. Decide at Phase 2 start.
2. **Backfill depth:** 30 days (recommended) vs start-empty.
3. **Manager/agent room sets:** confirm the exact four rooms for each when those phases begin.
