# Settings: Page Spec

> **Purpose:** spec for the `/settings` route family: the hub (the lead-routing roster of pool members, plus admin/founder link cards) and its six sub-routes: `/settings/follow-up-engine`, `/settings/lead-revival`, `/settings/tickets`, `/settings/teach-elaya`, `/settings/elaya-playbooks`, `/settings/elaya-requests`.
> **Audience:** engineers. · **Source-of-truth scope:** the hub page, the roster (`AgentSettingsTable`, `agent-routing-service.ts`, `actions/agent-routing.ts`), `SettingsLinkCard`, and the Follow-up Engine panel UI (`SlaPoliciesPanel`). The other sub-routes are summarised here and owned elsewhere: `/settings/tickets` by `./tickets.md`; the Teach Elaya hub, playbooks and requests by `../modules/elaya.md`; lead revival by `../modules/revival.md`. SLA business rules: `../modules/gia.md` § SLA Engine. Per-user notification preferences live on `/profile` (`./profile.md`), not here.
> **Last verified:** 2026-09-26 against `src/app/(dashboard)/settings/**`, `src/components/settings/{AgentSettingsTable,SettingsLinkCard,SlaPoliciesPanel,TeachElayaHub}.tsx`, `src/components/layout/Sidebar.tsx`, `src/lib/services/agent-routing-service.ts`, `src/lib/actions/agent-routing.ts`, `src/lib/constants/route-permissions.ts`, `src/lib/utils/route-access.ts`, `src/components/ui/TimePicker.tsx`, and migrations 0002, 0059, 0124, 0210.

## 1. Purpose

`/settings` is two things on one page:

1. **The lead-routing roster.** One row per pool member (agents and managers,
   `ROUTING_POOL_ROLES`, migration 0124) with three switches on their
   `gia.agent_routing_config` row: in the round-robin pool or not (`is_active`), a shift window
   (`shift_start` / `shift_end`), and work days (`shift_days`, 0059; `null` inherits the global
   `BUSINESS_HOURS`).
2. **A hub for admin and founder.** Four `SettingsLinkCard`s open the config pages:

| Sub-route | What it configures | Gate | Owning doc |
| --------- | ------------------ | ---- | ---------- |
| `/settings/follow-up-engine` | Gia's SLA timers, cadences and escalations (`gia.sla_policies`), as situation cards | admin, founder, tech workbench | this doc, §4 |
| `/settings/tickets` | Sia ticket SLA policies and escalation ladders, status labels and tags, the intake lessons | admin, founder, tech workbench | `./tickets.md` |
| `/settings/teach-elaya` | The hub with four doors to teaching Elaya: Training, Playbooks, Requests, Exam | manager and above | `../modules/elaya.md` |
| `/settings/lead-revival` | The nightly revival sweep's silence thresholds and daily caps (`gia.revival_policies`) | admin, founder, tech workbench | `../modules/revival.md` |

Two more pages hang off Teach Elaya rather than the hub: `/settings/elaya-playbooks` (admin,
founder, tech workbench; back button to Teach Elaya) and `/settings/elaya-requests` (same gate).
Every sub-route has its own `loading.tsx`, a `BackButton` header and its own page title.

## 2. Who sees it

| Caller | `/settings` hub | Link cards | Config sub-routes | Teach Elaya |
| ------ | --------------- | ---------- | ----------------- | ----------- |
| admin, founder | yes, roster of every domain | yes | yes | yes |
| tech workbench (agent or manager) | yes, roster of `tech` only | no | yes (writes refused) | yes |
| manager in a Gia domain | yes, own domain's roster | no | redirected to `/settings` | yes |
| manager in finance, marketing, business | yes, own domain's roster | no | redirected to `/settings` | yes |
| concierge (any role) | no: `/settings` left the concierge route map on 2026-09-25 | | | no |
| agent, guest | redirected to `/dashboard` | | | |

- The hub gates with `hasManagerPageAccess` (manager, or anyone `hasElevatedPageAccess` admits).
  The link cards render only for a literal admin or founder.
- The follow-up engine, lead revival, tickets, playbooks and requests pages gate with
  `hasElevatedPageAccess` and send anyone else to `/settings`. Teach Elaya gates with
  `hasManagerPageAccess`.
- `/settings` is in the route map of the Gia domains and of finance, marketing, tech and business.
  It was removed from concierge because the page held only the Gia routing roster and doors a
  queen or genie could not use. For a finance, marketing or business manager the roster is their
  own domain's agents and managers; the routing pool means nothing outside Gia, so the page is
  reachable but idle for them.
- The tech workbench widens page access only. The config actions call
  `requireProfile(['admin','founder'])`, so a tech account can open the editors but its saves are
  refused. A tech manager can edit the tech roster (the routing actions accept a manager in their
  own domain).
- **Managers manage their own domain's roster.** The roster read uses the admin client because
  RLS would block cross-row reads; the page passes `profile.domain` for a manager and the actions
  re-check the target's domain (§8.5). A manager appears in their own roster and edits their own
  row like any other.

**Sidebar.** The Configuration section renders for `hasManagerPageAccess` and lists, each through
`isNavVisible`: **Ad Creatives** (`/admin/ad-creatives`, literal admin/founder), **Teach Elaya**
(`/settings/teach-elaya`, `GraduationCap`), **Settings** (`/settings`, active on every
sub-route). The old "Elaya Training" item is gone: Training is a door on Teach Elaya. The founder's
curated sidebar (`FOUNDER_NAV_PREFIXES`) does not list Settings; founders reach it by URL or the
command palette.

## 3. Data sources

| Layer | Key items |
| ----- | --------- |
| Services | `agent-routing-service.ts`: `getAgentRosterByDomain` (admin client; profiles, then `gia.agent_routing_config` read separately and joined in code), `setAgentShift`, `setRoutingActive` (plus `getAgentRoutingConfig` / `getAgentRoutingConfigAdmin` for other callers). `sla-service.ts`: `getAllSlaPolicies`, `updateSlaPolicy`, `createSlaPolicy`. `revival-service.ts`: `getAllRevivalPolicies`, `updateRevivalPolicy` |
| Actions | `agent-routing.ts`: `setAgentShiftAction`, `toggleAgentRouting`. `sla-policies.ts`: `updateSlaPolicyAction`, `createSlaPolicyAction`. `revival.ts`: `updateRevivalPolicyAction`. Ticket, playbook and request actions: see the owning docs |
| Validation | `agent-routing-schema.ts` (`SetAgentShiftSchema`), `sla-policy-schema.ts`, `revival-schema.ts` |
| Tables | `gia.agent_routing_config`, `gia.sla_policies`, `gia.revival_policies` (all moved from `public` to `gia` by 0210, read through `giaDb()`) |
| Consumers | shift data feeds the SLA engine's `buildAgentShiftOverride` (§8.10); `is_active` feeds round-robin eligibility; `sla_policies` is read on every engine run; `revival_policies` on every nightly sweep |

## 4. Components

**On `/settings`:** `AgentSettingsTable` (client; one card row per pool member; optimistic
toggles) with its inline `WorkDayPicker`, the shared `TimePicker`, a `Toggle` for pool
membership, and a `beforeList` slot. The page passes the admin/founder link-card grid through
`beforeList`, so the order is title → filter bar → link cards → roster (the list-page contract,
2026-07-06). `SettingsLinkCard` (`src/components/settings/SettingsLinkCard.tsx`): a paper nav card
with a string-keyed icon registry (`timer`, `ticket`, `book`, `sparkles`), a title, a description
and a chevron.

**Follow-up Engine** (`/settings/follow-up-engine` → `SlaPoliciesPanel`). The page loads
`getAllSlaPolicies()` and renders the panel, or `<EmptyState>` "No follow-up rules yet" when there
are none. Since the 2026-06-24 redesign the panel groups policies **by situation, not by rule**:

- `buildSituations()` makes one card per situation. The A/B/C escalation steps for one lead status
  collapse into one card ("Lead sitting in 'Touched'"); each cadence gets its own card ("Call ended
  in 'No answer'", "Lead lingering in 'Nurturing'"); the task-due rules become "Follow-up task is
  due" and "Follow-up task is overdue".
- Inside a card the steps read as sentences, sorted by wait: "After [N] min → Notify the agent /
  Alert the manager / Escalate to a founder", each with an on/off toggle. The wait is the only
  inline field (blur-to-save when changed, with a `formatDuration` hint). Cadence cards show that
  they create a task and have no wait field.
- Channels and the hours basis (agent shift, business hours, clock time) sit behind a per-card
  "Advanced: channels & timing" disclosure (`CollapseReveal`). Cadence cards have none.
- **Rule codes (SLA-01A, CAD-…) are never shown.**
- Toggling a step is how you choose who is alerted: recipients are separate policy rows by design.
- Saves are optimistic and revert with a toast on error. Writes: `updateSlaPolicyAction` (Zod →
  `requireProfile(['admin','founder'])` → the admin-client update, since the table has no write
  RLS → `revalidatePath('/settings/follow-up-engine')`). The engine reads policies per run, so an
  on/off or channel change applies on the next fire; a wait change applies to timers armed after
  it.

**"Add a rule"** (the panel header toggle). An inline form lets an admin author a notification rule
without a developer: **Watches** (`trigger_kind`: lead status, call outcome, task due), **Value**
(`trigger_value`; the options re-derive from the kind), **Notifies** (agent, manager, founder),
**Threshold** (hidden for an outcome), **Hours basis**, **Channels**. `createSlaPolicyAction`
mirrors the update action with two safeguards:

- **The code is generated, never typed.** The action mints an inert `USR-<id>` and asserts it has
  no reserved `SLA-`, `CAD-` or `TASK-` prefix. A `CAD-` code would silently become a
  self-re-arming daily task generator (`isCadenceCode`). `auto_task` stays false: a user rule
  notifies, it never creates tasks.
- **The value is checked against the kind on the server** (`CreateSlaPolicySchema` refine):
  status → a real `LeadStatus`, outcome → a real `CallOutcome`, task_due → `gia_followup`. That
  last token is the SLA rule-catalog value on `sla_policies.trigger_value` (0111), not the retired
  `task_category` value of the same name (0138). A value that could never fire is refused.

There is no delete: switch a rule off with its toggle.

**Lead Revival** (`/settings/lead-revival` → `RevivalPoliciesPanel`). Exactly three rows, one per
trigger status (touched, in discussion, nurturing; `cold` is never a trigger), each with Silence
(days, 0 to 365), Daily cap per agent (0 to 500) and Active. Numbers save on blur, the toggle at
once; all optimistic with a toast revert, through `updateRevivalPolicyAction`. The panel keeps its
four-column table on a phone (left as is in the 2026-09-26 mobile pass). Everything else:
`../modules/revival.md`.

**Tickets** (`/settings/tickets`): `TicketSlaPoliciesPanel`, `TicketLabelsPanel`,
`IntakeLessonsPanel`. See `./tickets.md`.

**Teach Elaya** (`/settings/teach-elaya` → `TeachElayaHub`): four doors, each saying what it does
and who edits it. **Training** (`/admin/elaya-training`, the customer-facing content library;
managers curate their own domain, admin and founder every domain), **Playbooks**
(`/settings/elaya-playbooks`, admin and founder; `ElayaPlaybooksPanel` with the "Speak a playbook"
draft and the Try-it trace), **Requests** (`/settings/elaya-requests`, admin and founder;
`ElayaRequestsPanel`, the improvement requests she raises when told she was wrong), **Exam** (no
link: "runs from the engineering side today"). Contracts: `../modules/elaya.md`.

## 5. States

- **Loading:** `settings/loading.tsx` and one `loading.tsx` per sub-route, each in its page's shape.
- **Empty:** `AgentSettingsTable` renders `<EmptyState>`: "No agents in the roster yet." or "No
  agents match your filters." The follow-up engine and lead revival pages render a framed
  `<EmptyState>` when their policy list is empty.
- **Error:** every optimistic toggle or edit rolls back with a toast on `{ error }`. A shift save
  error shows a toast and keeps the local value.

## 6. Invariants

Deep dive §8.13. The short list: shift fields are advisory for assignment (only the SLA engine
reads them); `is_active = false` removes a person from the pool at once; one config row per pool
member, created by trigger; times are stored `HH:MM` 24-hour; `shift_days` is stored as JS
day-of-week (0 = Sunday) and shown Monday-first; a manager only touches their own domain's rows.

## 7. Open items

- `/settings` stays reachable for finance, marketing, tech and business managers, where the Gia
  routing roster means nothing. Consider dropping `/settings` from those route maps the way it was
  dropped for concierge, or giving those domains something to configure.
- `RevivalPoliciesPanel` keeps a sideways table on a phone; it needs a card-per-policy layout.
- Tech workbench accounts open every config editor but cannot save (by design of the workbench;
  it can confuse a tester).

---

## 8. Deep dive

### 8.1 Routes

| Route | Files | Loads |
| ----- | ----- | ----- |
| `/settings` | `page.tsx`, `loading.tsx` | `getAgentRosterByDomain(isPrivileged ? '*' : profile.domain)` |
| `/settings/follow-up-engine` | `page.tsx`, `loading.tsx` | `getAllSlaPolicies()` |
| `/settings/lead-revival` | `page.tsx`, `loading.tsx` | `getAllRevivalPolicies()` |
| `/settings/tickets` | `page.tsx`, `loading.tsx` | ticket SLA policies, queendoms, settings, lessons, scoreboard |
| `/settings/teach-elaya` | `page.tsx`, `loading.tsx` | nothing (static hub) |
| `/settings/elaya-playbooks` | `page.tsx`, `loading.tsx` | the playbooks + a chat seed for the Try-it box |
| `/settings/elaya-requests` | `page.tsx`, `loading.tsx` | the improvement requests |

All under `src/app/(dashboard)/settings/`. Code-adjacent notes: `src/app/(dashboard)/settings/CLAUDE.md`.

**The hub page** (`page.tsx`):

```text
getCurrentProfile()
  no profile            → redirect /login
  !hasManagerPageAccess → redirect /dashboard
  isPrivileged = role is admin or founder (literal)
  roster = getAgentRosterByDomain(isPrivileged ? '*' : profile.domain)
  <h1>Settings.</h1> + PageControls (bell)
  <AgentSettingsTable initialRoster callerRole callerDomain
      beforeList={isPrivileged ? <four SettingsLinkCards> : null} />
```

One blocking fetch, no Suspense split. The sub-route pages follow the same shape with a
`BackButton` ("Back to Settings", or "Back to Teach Elaya" for playbooks and requests) left of the
`<h1>`, which keeps the page-title dot.

### 8.2 History

- **2026-05-30:** a tab shell with an Agent Roster tab and an Agent Shifts tab. Collapsed into one
  table: the pool switch and the shift are the same people and the same row.
- **2026-06-02 (0059):** `shift_days` and the `WorkDayPicker`.
- **2026-06-16 (0124):** managers joined the routing pool and the roster.
- **2026-06-24:** the SLA and revival panels moved off the page to their own sub-routes; the
  Follow-up Engine became situation cards.
- **2026-07-06:** the link cards moved below the filter bar (`beforeList`).
- **2026-09-15:** `/settings/tickets`.
- **2026-09-21 / 09-22:** Playbooks, then the Teach Elaya hub (Training moved under it).
- **2026-09-25:** Requests (a fourth door); `/settings` left the concierge route map.

### 8.3 Data model: `gia.agent_routing_config`

First created by `20260526000002_agent_routing_config.sql` (0002); `shift_days` added by 0059;
moved from `public` to `gia` by 0210.

| Column | Type | Null | Default |
| ------ | ---- | ---- | ------- |
| `id` | uuid | no | `gen_random_uuid()` |
| `agent_id` | uuid | no | UNIQUE FK → `public.profiles(id)` ON DELETE CASCADE |
| `is_active` | boolean | no | `true` |
| `shift_start` | time | yes | |
| `shift_end` | time | yes | |
| `shift_days` | integer[] | yes | `NULL` |
| `updated_at` | timestamptz | no | `now()` |

- **`shift_days`:** JS day-of-week values (0 = Sunday … 6 = Saturday). `NULL` means "use
  `BUSINESS_HOURS`". At least one day when set (Zod and the UI enforce it; there is no DB CHECK).
- **Auto-creation:** `handle_agent_routing_config()` fires AFTER INSERT OR UPDATE on
  `public.profiles` and inserts `(agent_id, is_active = true)` when the role is agent or manager,
  on insert or when a role changes into one of those. `ON CONFLICT (agent_id) DO NOTHING`. 0124
  backfilled rows for existing managers.
- **Semantics:** `is_active` is immediate pool membership (round-robin reads it, together with
  `profiles.is_active` and `is_on_leave`). The shift columns are **advisory for assignment**: only
  the SLA engine reads them; `get_next_round_robin_agent` never does, and no DB rule enforces "in
  shift".
- **RLS:** SELECT for any signed-in user; UPDATE for manager, admin, founder; no app INSERT (the
  trigger inserts); no DELETE (switch off with `is_active`, clear a window with nulls).

### 8.4 Service: `agent-routing-service.ts`

Exports (five): `getAgentRoutingConfig`, `getAgentRoutingConfigAdmin`, `getAgentRosterByDomain`,
`setAgentShift`, `setRoutingActive`. (`getRoutingConfigsByDomain` and `getActiveRoutingConfigs`
no longer exist.) Every query on the config table goes through `giaDb()`.

**`getAgentRosterByDomain(domain | '*')`** (admin client; the caller enforces the domain):

1. Read `public.profiles` for `role IN ROUTING_POOL_ROLES`, optionally `domain = …`, ordered by
   domain then name.
2. Read `gia.agent_routing_config` for those ids in a second query. PostgREST cannot embed across
   schemas (PGRST200), so the old `agent_routing_config!inner` embed became two reads joined in
   code (2026-09-18).
3. Keep only people who have a config row (the old inner-join rule) and map to `AgentRosterRow`:
   profile columns (`id`, `full_name`, `avatar_url`, `job_title`, `domain`, `is_active`,
   `is_on_leave`) plus `routing_is_active`, `routing_config_id`, `shift_start`, `shift_end`,
   `shift_days`. A failed config read logs and returns `[]`.

**`setAgentShift(agentId, start, end, days)`** writes all three shift fields in one update (admin
client; a manager cannot UPDATE another person's row under RLS). Nulls clear.
**`setRoutingActive(agentId, isActive)`** writes `is_active` with the session client (RLS applies).
**`getAgentRoutingConfigAdmin`** is the admin-client twin used where no session exists: the SLA
code in `lib/actions/sla.ts` (webhook and Trigger.dev contexts) and `performance-service.ts`.

### 8.5 Actions: `agent-routing.ts`

**`setAgentShiftAction(input)`**

1. `SetAgentShiftSchema.safeParse` (Rule 02).
2. `requireProfile(['manager','admin','founder'])` (A-18).
3. Manager only: `getProfileById(agentId)`; the target's domain must equal the caller's, else
   `formErrors.unauthorized`. A manager's own row passes.
4. `setAgentShift(...)`, then `revalidatePath('/settings')`. Returns `ActionResult`; never throws.

**`toggleAgentRouting(formData)`**

1. Inline `toggleRoutingSchema`: `agent_id` (uuid), `is_active` (`formData.get('is_active') ===
   'true'`).
2. `requireProfile(['manager','admin','founder'])`.
3. Manager only: the same-domain check (security audit F-2, 2026-06-11), backed by RLS.
4. `setRoutingActive(...)`; revalidates `/admin/users`, `/admin/users/[id]`, `/settings`.

### 8.6 Validation: `SetAgentShiftSchema`

```ts
agentId:    uuid
shiftStart: /^([01]\d|2[0-3]):([0-5]\d)$/ | null
shiftEnd:   same regex | null
shiftDays:  z.array(z.number().int().min(0).max(6)).min(1, "Select at least one work day.")
              .nullable().optional()
```

When both times are set, `shiftEnd > shiftStart` (string compare), else "Shift end must be after
shift start." on `shiftEnd`. `null` or missing days means "inherit". The table blocks a
half-filled window before calling the action ("Set both times to save").

### 8.7 TimePicker

`src/components/ui/TimePicker.tsx`, shared with `DatePicker`'s embedded time panel through
`TimePickerWheelPanel`. The contract that matters here:

- **Strings only, never `Date`:** the value is `HH:MM` 24-hour (Postgres `time`); seconds are
  stripped by `normalizeTimeHHMM` (`lib/utils/dates.ts`), used on load and on every pick.
- **Typed entry (2026-08-08):** a compact input above the wheels accepts `9`, `930`, `9:30`,
  `9.30`, `21:30`, `9:30 pm`; commits on Enter or blur; an invalid entry reverts; Escape cancels
  without closing.
- **Wheels:** hour 1 to 12, minute 0 to 59, an AM/PM toggle; item height is measured at runtime so
  zoom and OS text size still snap correctly.
- **Panel:** portaled to `document.body` at `--z-modal-nested`, flips up or left when it would
  overflow.

The roster passes `disabled` while saving, a fixed width, and an `aria-label` per field.

### 8.8 WorkDayPicker

Defined at the top of `AgentSettingsTable.tsx` (not a `ui/` primitive). Seven pills in Monday-first
order (`[1,2,3,4,5,6,0]`), labels Mo … Su. `DEFAULT_WORK_DAYS = [1,2,3,4,5,6]` is the display
default when `shift_days` is `null`. Clicking the only selected day does nothing, so the set can
never be empty. Each pill has `aria-pressed` and an `aria-label`. A change saves at once.

### 8.9 AgentSettingsTable

Client component. Props: `initialRoster`, `callerRole`, `callerDomain`, `beforeList?`.

- **State:** the roster (optimistic pool flips), a per-person shift map `{ start, end, days, error
  }` seeded through `normalizeTimeHHMM`, filter state (search, domain, pool), and two in-flight
  sets (`pendingIds` for pool toggles, `savingIds` for shift saves).
- **Filter bar:** `FilterBar` with search (name and job title), a Pool filter (in / out), and a
  Domain filter for admin/founder when more than one domain is present. Client-side, no refetch.
- **Row** (a `motion.div` card): avatar, name, job title, an On leave pill, the inline shift
  hint or error; a domain badge for admin/founder; Shift start and Shift end (`TimePicker`);
  Active hours (`computeActiveHours`, shown when both times are set); Work days; In pool
  (`Toggle`); and a Clear button when a time is set.
- **Save flow:** every valid pick or day toggle calls `validateAndSave` at once (never on blur).
  Both times empty → save `(null, null, null)`. One empty → "Set both times to save". Bad format →
  "Use HH:MM format". End not after start → "End must be after start". Valid →
  `setAgentShiftAction`. A server error toasts and keeps the local value.
- **Clear** resets the row to `{ "", "", DEFAULT_WORK_DAYS }` locally and saves `(null, null,
  null)`, so the person reverts to `BUSINESS_HOURS`.
- **Pool toggle:** optimistic flip, `toggleAgentRouting`, revert and toast on error.
- **Dimming:** rows in flight dim through Framer `animate={{ opacity }}`, not inline style, so the
  entrance and the dim share one motion channel; the hover lift is skipped while in flight.

### 8.10 The SLA engine and shifts

`src/lib/utils/sla.ts` is the only behavioural reader of the shift columns.
`buildAgentShiftOverride(start, end, days)` returns `null` when any of the three is missing, and
every caller then falls back to `BUSINESS_HOURS` (Monday to Saturday, 09:00 to 19:00 IST, Sunday
off). With all three it returns `{ startHour, startMinute, endHour, endMinute, workDays }`, which
`isOffDay`, `resolveStart`, `resolveEnd`, `isWithinBusinessHours` and `nextBusinessDeadline`
accept. The UI's "both times or none" rule means a half window never reaches the engine.

### 8.11 Access control summary

| Action | Gate |
| ------ | ---- |
| `setAgentShiftAction`, `toggleAgentRouting` | `requireProfile(['manager','admin','founder'])`; a manager only for a target in their own domain |
| `updateSlaPolicyAction`, `createSlaPolicyAction` | `requireProfile(['admin','founder'])` |
| `updateRevivalPolicyAction` | `requireProfile(['admin','founder'])` |
| Ticket settings, playbooks, requests | admin/founder in their actions (see the owning docs) |

| Caller | `getAgentRosterByDomain` argument |
| ------ | --------------------------------- |
| admin, founder | `'*'` (every pool member, every domain) |
| anyone else who reaches the hub (manager, tech workbench) | their own `profile.domain` |

### 8.12 Page title rules

Every settings page has `<h1 className="type-page-title m-0">` with the page-title dot. The hub
renders the `PageControls` bell in its title row; the sub-routes put a `BackButton` to the left of
the title. Metadata titles: "Settings", "Follow-up engine", "Lead revival", "Ticket settings",
"Teach Elaya", "Playbooks", "Elaya requests".

### 8.13 Known invariants

1. `getAgentRosterByDomain` uses the admin client and `ROUTING_POOL_ROLES`; the caller scopes the
   domain, never RLS.
2. `is_active` is immediate pool on/off. Shift times and days are advisory for assignment; only the
   SLA engine reads them.
3. `TimePicker` values are `HH:MM` 24-hour strings, never `Date`.
4. `shift_days` stores JS day-of-week values; Monday-first is display only; `null` inherits, an
   empty array is invalid.
5. `setAgentShift` writes all three shift fields in one update; clearing writes three nulls.
6. `normalizeTimeHHMM` on load and on every pick.
7. The work-day set can never be empty (UI guard + Zod `.min(1)`).
8. Row dimming uses Framer `animate`, not inline opacity.
9. A failed pool toggle reverts local state.
10. Actions: Zod first, `{ data, error }`, never throw, profile-based auth (Rules 02, 09, 10).
11. No DELETE on `agent_routing_config`, no app INSERT (the trigger inserts).
12. Settings mutations do not refetch the page: local state plus `revalidatePath` for the next
    navigation.
13. The `TimePicker` panel portals to `document.body`.
14. Never import `agent-routing-service` in a client component; use the actions.
15. `buildAgentShiftOverride` returns `null` on any missing shift field, and every SLA caller falls
    back to `BUSINESS_HOURS`.
16. Follow-up Engine rule codes are generated (`USR-…`), never typed, and never shown.
