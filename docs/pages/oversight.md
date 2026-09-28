# Oversight: Page Spec

> **Purpose:** spec for `/oversight` (the manager / admin / founder drill into work in progress) and its two detail tiers, `/oversight/[domain]` and `/oversight/[domain]/[agentId]`. A read surface over the task data plus one append-only event stream, `task_events`.
> **Audience:** engineers. · **Source-of-truth scope:** the `/oversight` route tree, the three oversight RPCs (migration 0144), `oversight-service.ts`, the components in `src/components/oversight/`, and the `task_events` emit contract. Schema narrative: `../architecture/database.md`; the task model it reads: `./tasks.md`; code-adjacent notes: `src/app/(dashboard)/oversight/CLAUDE.md`.
> **Last verified:** 2026-09-26 against `src/app/(dashboard)/oversight/**`, `src/components/oversight/*`, `src/lib/services/{oversight-service,task-events,task-mutations}.ts`, `src/lib/utils/route-access.ts`, `src/lib/constants/route-permissions.ts`, `src/components/layout/Sidebar.tsx`, and migrations 0144, 0159, 0202, 0210.

## 1. Purpose

`/oversight` answers one question for a manager or founder: **what is my team (or every team)
doing right now, and where is work stuck?** It is a three-tier drill with the same *card → open*
grammar at every tier:

- **Tier 1, Teams** (admin / founder): one card per domain that has an active agent, with open,
  overdue, in-review and recently completed counts, the agent count, and a live "present now"
  count. A card opens Tier 2.
- **Tier 2, Team** (a manager lands here, pinned to their own domain): one card per agent with
  their counts and an "online now" dot, plus the team's live activity rail. An agent card opens
  Tier 3.
- **Tier 3, Agent**: that agent's tasks (personal and group), their metrics, and a live rail for
  that agent.

It never changes a task, a lead or any row. The only write the feature adds is one `task_events`
row per task mutation, emitted from the mutation cores, never from the UI.

## 2. Who sees it

| Caller | What happens |
| ------ | ------------ |
| admin, founder | Tier 1; drills to any team and agent |
| manager (Gia domain) | `/oversight` redirects to `/oversight/<own domain>`; asking for another domain in the URL redirects to their own; Tier 3 only for agents in their domain |
| tech workbench (agent or manager) | passes the page gate. A tech **manager** is pinned like any manager (to `tech`, which has no agents). A tech **agent** is not redirected and gets the Tier 1 all-teams view (see §7) |
| agent, guest (outside tech) | redirected to `/dashboard` |
| concierge, finance, marketing, business | not in their route map: the layout sends them to `/dashboard` |

- **Route map:** `/oversight` is in the `DOMAIN_ROUTE_MAP` of the four Gia domains. Admin and
  founder bypass the map; the tech workbench reaches it too.
- **Page gate:** all three tiers call `hasManagerPageAccess` (manager, or anyone
  `hasElevatedPageAccess` admits). There is no separate agent check: the manager branch is the
  only one that pins.
- **Sidebar:** "Oversight" (`Telescope`) in the Analytics section, shown when
  `hasManagerPageAccess` and `isNavVisible` agree. It is in the founder's curated sidebar.

## 3. Data sources

| Layer | Key items |
| ----- | --------- |
| Service | `oversight-service.ts` (admin client for every read): `getTeamTaskOverview(caller)` → `get_team_task_overview`, `getTeamAgentBreakdown(caller, domain)` → `get_team_agent_breakdown`, `getAgentTasksOversight(caller, agentId)` → `get_agent_tasks_oversight` (the metrics are derived from the returned rows), `getTeamEvents(domain, limit)` and `getAgentEvents(agentId, limit)` (the rail seeds, 30 by default) |
| Actions | **none.** `src/lib/actions/oversight.ts` was deleted in the 2026-07-02 dead-code purge; the pages call the service directly in their server components |
| Presence | `listLivePresence()` (`usage-service.ts`, the only live presence reader) for the Tier 1 and Tier 2 "present now" overlays |
| Tables | `public.task_events` (0144; still in `public`), read through the RPCs and the seeds; Realtime on the same table for the rails |
| Emit | `task-events.ts`: `resolveTaskDomain()` + `emitTaskEvent()`, called from the `task-mutations.ts` cores, `addTaskRemarkAction` and the overdue job |

## 4. Components

`src/components/oversight/`:

| Component | Tier | Role |
| --------- | ---- | ---- |
| `TeamOverviewGrid` | 1 | the team cards |
| `AgentBreakdownGrid` | 2 | the agent cards |
| `AgentTaskList` | 3 | the agent's tasks |
| `AgentOversightMetricsRow`, `OversightStatRow` | 2, 3 | the stat tiles (`StatTile`) |
| `OversightRail.tsx` (`OversightTeamRail`, `OversightAgentRail`) | 2, 3 | the live rails |

`src/app/(dashboard)/oversight/OversightSkeleton.tsx` is the shared body skeleton (each tier's
`loading.tsx` and its Suspense fallback). Tier 1 carries the page-title dot; Tiers 2 and 3 carry a
`BackButton` left of the title (Tier 2: back to Teams, or back to the dashboard for a manager; Tier
3: back to the team). Every tier renders the `PageControls` bell (with the domain selector for
admin/founder).

## 5. States

- **Loading:** a `loading.tsx` per tier (header + `OversightSkeleton`), added 2026-09-16 because
  Next re-shows only the nearest loading boundary above the segment that changed.
- **Empty** (all `<EmptyState>`):
  - Tier 1: framed, `Users` icon, "No teams to oversee yet." / "Teams appear here once a domain has
    an active agent."
  - Tier 2: framed, `Users`, "No agents on this team yet." / "Active agents in this domain will
    appear here."
  - Tier 3: framed, `ClipboardList`, "Nothing on this agent's board." / "Open and recently-closed
    tasks will show here."
  - Rails: inline with the Serene mark, "Quiet for now." / "Moves across the teams stream in here
    as they happen."
- **Not found:** an unknown domain in the URL, a malformed parameter, a missing agent, or an agent
  whose domain is not the URL's → `notFound()`.

## 6. Invariants

- A manager only ever sees their own team: the page redirects (Tier 1, and any other domain in the
  URL), and the RPCs re-apply the clamp in SQL.
- **One aggregation query per tier.** Never a per-card or per-agent database call.
- The oversight readers take an explicit agent or domain, never `auth.uid()`: one user reads
  another's load. `getPersonalTasks` and `get_group_task_summaries` are caller-scoped and must never
  back oversight.
- `task_events` is append-only: no INSERT, UPDATE or DELETE policy for any app role; writes come
  only from the cores and the overdue job, through the admin client.
- The event's domain is resolved **at emit time** (§8.3); a task reassigned across teams
  legitimately has events in two domains. Do not "fix" it.

## 7. Open items

- **A tech workbench agent gets the admin view.** The page gate admits every workbench member, only
  `role === 'manager'` is pinned, and the RPCs treat any role other than `manager` as unclamped. So
  a tech agent sees every team and every agent's tasks. Decide whether the workbench should reach
  oversight at all, or clamp on "not admin/founder" instead of "manager".
- A tech agent's rails seed through the admin client but receive no live inserts (the
  `task_events` SELECT policy is manager+), so the rail looks frozen for them.
- Tier 1 and Tier 2 count **agents only**. Managers carry leads and tasks (0124) but never appear as
  a card.
- There is no uuid check on `[agentId]`; a malformed id falls through to `notFound()` after the
  profile read.

---

## 8. Deep dive

### 8.1 Tiers and navigation

| Tier | Route | Reads |
| ---- | ----- | ----- |
| 1 Teams | `/oversight` | `getTeamTaskOverview` → `get_team_task_overview(p_role, p_domain)` |
| 2 Team | `/oversight/[domain]` | `getTeamAgentBreakdown` → `get_team_agent_breakdown(p_role, p_caller_domain, p_domain)`; `getTeamEvents` for the rail seed |
| 3 Agent | `/oversight/[domain]/[agentId]` | `getAgentTasksOversight` → `get_agent_tasks_oversight(p_agent, p_role, p_caller_domain)`; `getAgentEvents` for the seed |

- `[domain]` is decoded inside `try/catch` (a malformed value → `notFound()`, Q-10) and checked with
  `isAppDomain`.
- Tier 3 reads the agent's profile once (admin client) for the header and checks that the agent's
  domain is the URL's domain.
- Card → drill is a plain `<Link>`.

### 8.2 The `task_events` stream (0144)

One append-only table is the spine of every live surface. The readers are point-in-time
aggregates; the rail needs a push feed, and a remarks stream could not back it (a status change
with no remark writes no remark).

| Column | Type | Notes |
| ------ | ---- | ----- |
| `id` | uuid | PK |
| `task_id` | uuid | FK → `tasks(id)` ON DELETE CASCADE |
| `domain` | `app_domain` NOT NULL | the task's domain at emit time (§8.3) |
| `actor_id` | uuid | who caused it; NULL for the cron |
| `subject_id` | uuid | the task's assignee at emit time (the Tier 3 agent) |
| `event_type` | `task_event_type` | `created`, `status_changed`, `reassigned`, `remark_added`, `overdue` |
| `task_title` | text | a snapshot, so the rail renders without a join |
| `meta` | jsonb | e.g. `{ from, to }`, `{ priority, task_type }`, `{ due_at }` |
| `created_at` | timestamptz | |

Indexes: `idx_task_events_domain_created` (Tier 2 rail), `idx_task_events_subject_created` (Tier
3). RLS: SELECT for manager, admin, founder; **no INSERT, UPDATE or DELETE policy, ever**. In the
Realtime publication. The `b2b` → `business` rename (0202) did not rewrite rows. 0159's activity
view reads it.

**Emit points** (the cores, never the UI):

| Core / job | `event_type` | `meta` |
| ---------- | ------------ | ------ |
| `createPersonalTaskCore`, `createSubtaskCore` | `created` | `{ priority, task_type }` |
| `updateTaskStatusCore` (and `updateTaskCore` when status changes) | `status_changed` | `{ from, to }` |
| `updateTaskCore` when the assignee changes | `reassigned` | `{ from, to }` |
| `addTaskRemarkAction` | `remark_added` | `{ status_change? }` |
| `check-task-overdue` on the once-only `overdue_at` stamp | `overdue` | `{ due_at }` |

`emitTaskEvent` (`src/lib/services/task-events.ts`) is one admin-client insert, awaited but
best-effort: a failure logs `[task-events]` and never fails the mutation. It skips the insert when
no domain could be resolved (never a NULL domain). The same helper also writes the matching
`activity_events` row (`task_created`, `task_completed`) for the mobile Activity room.

### 8.3 Derived domain

`tasks` has no `domain` column. The event's domain, and the Tier 1 and Tier 2 buckets, come from:

- a **group subtask** → `task_groups.domain`;
- a **personal task** (lead follow-up or not) → the **assignee's** `profiles.domain`.

The assignee's domain is deliberate: oversight is about who is doing the work, so a task reassigned
to another team counts under the person now responsible. `resolveTaskDomain(client, { groupId,
assignedTo })` in `task-events.ts` does this lookup once, and the cores call it before
`emitTaskEvent` (one place for the rule). The RPCs apply the same `COALESCE(group domain, assignee
domain)` at read time. A task created in `onboarding` and reassigned to a `shop` agent has its
`created` event under onboarding and its later events under shop: correct.

### 8.4 The three RPCs

All `STABLE SECURITY DEFINER`, with EXECUTE revoked from `PUBLIC`, `anon` and `authenticated` and
granted to `service_role` only (the 0102 pattern). The service calls them through the admin client
with **session-derived** arguments. Their `search_path` is `public, gia` since 0210.

- **`get_team_task_overview(p_role, p_domain)`:** one row per domain with at least one active agent
  (from `profiles`, so the roster drives the cards): `agent_count`, `open_count` (to do, in
  progress, in review), `overdue_count` (`overdue_at` set and not closed), `in_review_count`,
  `completed_count` (completed in the last 30 days). `p_role = 'manager'` → only `p_domain`.
- **`get_team_agent_breakdown(p_role, p_caller_domain, p_domain)`:** one row per active agent in the
  domain with the same four counts. For a manager it uses `p_caller_domain` whatever `p_domain`
  says. Tier 2 deliberately has no separate group-task query.
- **`get_agent_tasks_oversight(p_agent, p_role, p_caller_domain)`:** the agent's task rows (personal
  and group; lead identity through a LEFT JOIN on the task-lead link), active first, then `due_at`,
  then `created_at`. For a manager it adds "the agent's domain equals `p_caller_domain`"; an
  out-of-domain agent returns no rows. The service derives the metric counts from the rows.

Counts are converted with `Number()` in the service (Q-09).

### 8.5 The scope clamp

The manager SELECT policy on `tasks` is role-only (no domain), so oversight never relies on RLS for
team isolation. Three layers do it:

1. **The page:** a manager hitting Tier 1, or a Tier 2 / Tier 3 URL for another domain, is
   redirected to `/oversight/<own domain>`. Tier 3 also `notFound()`s an agent outside the URL's
   domain.
2. **The session-derived arguments:** `p_role = caller.role`, `p_caller_domain = caller.domain`.
3. **The SQL:** each RPC re-applies the manager clamp, so a programming mistake above cannot widen a
   manager.

The weak spot is the definition of "clamped": only `manager` is. See §7 for the tech agent case.

### 8.6 The live rails

Two exports of `OversightRail.tsx`, each seeded by the server page and then fed by Realtime on
`task_events` (P-06):

- **`OversightTeamRail`** (Tier 2): seed `getTeamEvents(domain)`; channel
  `oversight-team-<domain>-${mountId}`, `filter: domain=eq.<domain>`.
- **`OversightAgentRail`** (Tier 3): seed `getAgentEvents(agentId)`; channel
  `oversight-agent-<agentId>-${mountId}`, `filter: subject_id=eq.<agentId>`.

New events are prepended. Teardown is `supabase.removeChannel(channel)`. The subscription uses the
session client, so RLS (manager+) and the filter both bound it; a manager's page never mounts a rail
for another team (it redirects first). The rail is display-only; a lead-task event may link to the
lead.

**Presence:** Tier 1 reads `listLivePresence()` once and overlays a count of present agents per
domain; Tier 2 overlays an "online now" dot per agent from the same set.

### 8.7 Sign-off criteria (binding)

**Must:** a manager sees only their own team at every tier (and is redirected, not served, when
asking for another); a founder drills 1 → 2 → 3 across all teams; Tier 3 shows one person's tasks to
another person (the readers are not `auth.uid()`-scoped); the rail updates on a status change made
without a remark; one aggregation query per tier.

**Must not:** an oversight reader scoped by `auth.uid()`; a per-card or per-agent query; a
hardcoded colour; a manager receiving another team's data; any UPDATE or DELETE policy on
`task_events`.

### 8.8 Reuse ledger (R-01)

| Need | Reused |
| ---- | ------ |
| Number formatting | `formatCount`, `formatCompact` |
| Tiles and cards | `StatTile`, the list-page card grammar |
| Empty states | `<EmptyState>` |
| Loading | `PageSkeletons` + `OversightSkeleton` |
| Domain vocabulary | `APP_DOMAINS`, `DOMAIN_LABELS`, `DOMAIN_ICONS` |
| Presence | `listLivePresence()` |
| Emit points | the `task-mutations.ts` cores + `check-task-overdue` |
| Back affordance | `<BackButton>` |
| Page gate | `hasManagerPageAccess` |
| RPC scoping | the 0102 REVOKE + admin-client pattern |

Net new (2026-06-24): `task_events` + `task_event_type`, the three RPCs, the route tree and its
components, `oversight-service.ts`, `task-events.ts`, and the route-map entry.
