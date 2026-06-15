# Settings — Page Spec

> **Purpose:** spec for `/settings` — the agent-roster configuration page (routing pool, shift windows, work days) + the follow-up engine panel (admin/founder).
> **Audience:** engineers. · **Source-of-truth scope:** the settings route, `agent-routing-service.ts`, `agent-routing.ts` actions, the roster table. SLA business rules: `../modules/gia.md` § SLA Engine.
> **Last verified:** 2026-06-09 full pass; 2026-06-11 restructure (F-2 manager-domain check reflected).

## 1. Purpose

Configures three things on one `agent_routing_config` row per agent: round-robin pool
membership (`is_active`), shift windows (`shift_start`/`shift_end`), and work days
(`shift_days`, migration 0059 — `null` inherits the global `BUSINESS_HOURS`). One route, one
client table, single server fetch (no URL params, no Suspense split).

## 2. Who sees it

manager / admin / founder (agents and guests → `redirect('/dashboard')`). Managers see and
edit only their own domain's roster (service uses adminClient because RLS would block
cross-row reads; the action layer enforces the domain). Since 2026-06-11 (security F-2),
`toggleAgentRouting` verifies the target agent's domain for manager callers — same check as
`setAgentShiftAction`.

## 3. Data sources

| Layer | Key items |
| ----- | --------- |
| Service | `agent-routing-service.ts` — `getAgentRosterByDomain` (joined profiles+config, adminClient), `setAgentShift`, `setRoutingActive` |
| Actions | `agent-routing.ts` — `toggleAgentRouting` (F-2 domain check), `setAgentShiftAction` |
| Validation | `agent-routing-schema.ts` (`SetAgentShiftSchema`) |
| Consumers | shift data feeds the SLA engine's `buildAgentShiftOverride` (Deep dive §10) and ingestion round-robin eligibility |

## 4. Components

`AgentSettingsTable` (client; optimistic toggles) with inline `WorkDayPicker` ·
`TimePicker` (`src/components/ui/` primitive — wheel columns, measured item height) ·
`Toggle` for pool membership · `SlaPoliciesPanel` (admin/founder only, below the roster).

### Follow-up Engine panel (`SlaPoliciesPanel`, 2026-06-12; "New rule" authoring 2026-06-15)

One row per `sla_policies` rule, grouped **Lead status / Call outcome / Follow-up cadences /
Task due** (the group list is exhaustive — the "Call outcome" group exists so a user-authored
non-cadence `outcome` rule has a home; seeded `CAD-01x` outcome rules stay under cadences).
Editable on each row: threshold minutes (blur-save + `formatDuration` hint; hidden for outcome
cadences, which tick daily), hours basis select, channel checkboxes (CAD rows show
"Creates a task" — channels stay `{}`), active toggle (optimistic, revert + toast).
Identity fields (code, trigger, recipient, auto_task) are read-only — **toggling the
manager/founder rows active IS the recipient checklist** (recipients are separate rows
by design). Reads: `getAllSlaPolicies` (session client; 0111 RLS admin/founder SELECT).
Writes: `updateSlaPolicyAction` (`actions/sla-policies.ts`) — Zod →
`requireProfile(['admin','founder'])` → admin-client update (no write RLS by design) →
`revalidatePath('/settings')`. The engine reads policies per job run: active/channel
edits apply on the next fire; threshold edits apply to newly armed timers only.

#### "New rule" authoring (2026-06-15)

The panel header carries a **New rule** toggle → an inline form lets an admin/founder author a
policy over the trigger catalog **without a developer**. Five operational fields + channels:
**Watches** (`trigger_kind`: status / outcome / task_due), **Value** (`trigger_value` — options
re-derive from the kind so a rejectable value can't be picked), **Notifies** (`recipient_role`),
**Threshold (min)** (hidden for outcome), **Hours basis** (`hours_mode`), **Channels**. On success
the server-returned row prepends and renders in its group. A new policy arms automatically — the
engine reads `getSlaPolicies()` per run, so the next matching lead picks it up with no deploy.

Writes: **`createSlaPolicyAction`** (`actions/sla-policies.ts`) — mirrors `updateSlaPolicyAction`
(Zod → `requireProfile(['admin','founder'])` → admin-client `createSlaPolicy` insert →
`revalidatePath('/settings')`). Two structural safeguards:

- **The code is system-generated, never user-set.** The action mints an inert `USR-<id>` (the
  schema has no `code` field) and asserts it carries no reserved `SLA-`/`CAD-`/`TASK-` prefix
  before the write. A `CAD-` code would silently become a self-re-arming daily task generator
  (`isCadenceCode`); `USR-` is provably inert. `auto_task` stays false (a user rule is a
  notification rule, not a cadence).
- **`trigger_value` is validated against `trigger_kind` server-side** (`CreateSlaPolicySchema`
  refine): status → a real `LeadStatus`, outcome → a real `CallOutcome`, task_due →
  `gia_followup`. A value that can never fire (→ `STALE_FIRE` forever) is rejected by the action,
  not just the dropdown.

No delete path — switch a rule off via its active toggle.

## 5. States

- **Loading:** `settings/loading.tsx` (PageSkeletons composition).
- **Empty:** `<EmptyState>` when the domain has no agents.
- **Error:** optimistic toggle rolls back + toast on `{ error }`.

## 6. Invariants

Deep dive §13 — shift fields are advisory (ingestion reads them; the DB does not enforce);
`is_active=false` removes from the pool instantly; one config row per agent (UNIQUE,
auto-created by trigger); times are IST; `shift_days` is Mon-first in UI but stored as JS
day-of-week (0=Sun).

## 7. Open items

None recorded.

---

## 8. Deep dive

> Section numbering preserved from the original intelligence document.

### 1. Module Overview

The settings page configures three things on a single `agent_routing_config` row per agent:

1. **Gia lead-assignment pool membership** — `is_active`.
2. **Per-agent shift windows** — `shift_start` / `shift_end`.
3. **Per-agent work days** — `shift_days` (added migration 0059; `null` = inherit global `BUSINESS_HOURS`).

One route, one client table component.

| Item | Value |
| ------ | ------ |
| Route | `GET /settings` → `src/app/(dashboard)/settings/page.tsx` |
| UI | `src/components/settings/AgentSettingsTable.tsx` (contains the inline `WorkDayPicker` sub-component) |
| Access | `agent` / `guest` → `redirect("/dashboard")`. `manager` / `admin` / `founder` only. |
| Data load | Single server fetch: `getAgentRosterByDomain(rosterDomain)` → `initialRoster` prop. No URL params, no Suspense split. |

#### Sidebar — Configuration section

- Section label: **Configuration** (`NavSection`).
- Visible when `isManager` (`manager` \| `admin` \| `founder`).
- Items from `getConfigurationNav(isPrivileged)`:
  - **Ad Creatives** — `/admin/ad-creatives`, `Film` icon — **admin/founder only** (`isPrivileged`), listed first when present.
  - **Settings** — `/settings`, `Settings` icon — **manager, admin, founder**.
- Position: after Analytics nav block, before Admin section (admin/founder).

---

### 2. Architectural History

**Original (2026-05-30):** Tab shell + two tabs.

| Deleted file | Role |
| -------------- | ------ |
| `src/app/(dashboard)/settings/SettingsShell.tsx` | `'use client'` shell; URL `?tab=roster\|shifts`; `router.replace` + `useTransition`; switched between tabs. |
| `src/components/settings/AgentRosterTab.tsx` | Card grid; domain filter pills; **In Pool** `Toggle` via `toggleAgentRouting`; optimistic updates. |
| `src/components/settings/AgentShiftsTab.tsx` | Table layout; `<input type="time">`; blur-to-save shifts; `computeActiveHours`; clear shift. |

**Collapse rationale:** Roster (pool toggle) and shifts (time window) are the same agents and same `agent_routing_config` row — a tab split added navigation cost without separating data or permissions.

**Current:** `page.tsx` → `AgentSettingsTable` only. Filter bar + card rows (not a `<table>`). Shifts use `TimePicker`; work days use `WorkDayPicker`; **save fires on each valid pick / day toggle, not on blur** (the `<input type="time">` + blur model from `AgentShiftsTab` is gone).

**Work Days addition (2026-06-02, migration 0059):** Added the `shift_days` column and the `WorkDayPicker` control. Each agent can override the global work-week (Mon–Sat) with a personal day set; `null` inherits `BUSINESS_HOURS`. This is read by the SLA engine via `buildAgentShiftOverride`.

---

### 3. Data Model — `agent_routing_config`

**First migration:** `supabase/migrations/20260526000002_agent_routing_config.sql` (inventory **0002**).
`shift_start` and `shift_end` are defined there as optional `time` columns.
`shift_days` was **added later** by `supabase/migrations/20260602000059_agent_shift_days.sql` (inventory **0059**).
The table is also referenced by `20260527000007_round_robin_fn.sql` (the round-robin function) and `CLAUDE.md`.

| Column | Type | Nullable | Default |
| -------- | ------ | ---------- | --------- |
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `agent_id` | `uuid` | NO | — (UNIQUE FK → `profiles.id` ON DELETE CASCADE) |
| `is_active` | `boolean` | NO | `true` |
| `shift_start` | `time` | YES | — |
| `shift_end` | `time` | YES | — |
| `shift_days` | `integer[]` | YES | `NULL` |
| `updated_at` | `timestamptz` | NO | `now()` |

**`shift_days` semantics (migration 0059 `COMMENT`):** JS day-of-week array (`0=Sun…6=Sat`). `NULL` = use global `BUSINESS_HOURS`. Min 1 element when set (enforced in Zod + UI, **not** by a DB CHECK). Stored as raw JS day-of-week values; the UI displays Mon-first (`[1,2,3,4,5,6,0]`) — display order is purely cosmetic.

**Auto-creation trigger:** `handle_agent_routing_config()` on `AFTER INSERT OR UPDATE ON profiles`. Inserts `(agent_id, is_active=true)` when `role = 'agent'` (INSERT, or UPDATE where role becomes `agent`). `ON CONFLICT (agent_id) DO NOTHING` — idempotent. `shift_*` columns are left at their defaults (`shift_days` = `NULL`).

#### Semantics

- **`is_active`:** Immediate pool membership. `false` removes the agent from round-robin eligibility on the next assignment read. Not time-based.
- **`shift_start` / `shift_end` / `shift_days`:** **Advisory for assignment.** Stored for ops/UI and consumed by the **SLA engine** (`src/lib/utils/sla.ts`), not by the round-robin assignment function. `get_next_round_robin_agent` filters on `is_active` (and `profiles.is_active` / `is_on_leave`), never on shift columns. No DB trigger or CHECK enforces "in shift" for assignment.

#### RLS

- SELECT: all authenticated (`auth.uid() IS NOT NULL`).
- INSERT: **trigger only** — no app INSERT policy.
- UPDATE: `manager` \| `admin` \| `founder` via `get_user_role()`.
- DELETE: none (deactivate via `is_active`; clear a window by writing `null`s).

---

### 4. Service Layer — `agent-routing-service.ts`

Full export list: `getAgentRoutingConfig`, `getAgentRoutingConfigAdmin`, `getRoutingConfigsByDomain`, `getActiveRoutingConfigs`, `getAgentRosterByDomain`, `setAgentShift`, `setRoutingActive`.

#### `getAgentRosterByDomain(domain: AppDomain | '*')`

- **Join:** `profiles` ← `agent_routing_config!inner` (only agents with a config row).
- **Filter:** `.eq('role', 'agent')`; if `domain !== '*'`, `.eq('domain', domain)`.
- **Client:** `createAdminClient()` — RLS blocks managers from cross-profile joins; **callers must enforce domain** at page/action layer (`page.tsx` passes `caller.domain` or `'*'`).
- **Sort:** `domain` ASC, `full_name` ASC.
- **Returns:** `AgentRosterRow[]` (mapped flat):

| Field | Source |
| ----- | ------ |
| Profile columns | `id`, `full_name`, `avatar_url`, `job_title`, `domain`, `is_active`, `is_on_leave` from `profiles` |
| Routing columns | `routing_is_active`, `routing_config_id`, `shift_start`, `shift_end`, `shift_days` from `agent_routing_config` |

Defaults on a missing/empty embedded config: `routing_is_active ?? true`, `routing_config_id ?? ''`, `shift_start ?? null`, `shift_end ?? null`, `shift_days ?? null`.

#### `setAgentShift(agentId, shiftStart, shiftEnd, shiftDays)`

- **Client:** `adminClient` (manager cannot UPDATE another agent's config under RLS).
- **Updates:** `shift_start`, `shift_end`, `shift_days` in one write. Passing `null` for a field clears it. The clear-all path writes `(null, null, null)`.
- **Returns:** `{ data: AgentRoutingConfig \| null, error: string \| null }`.
- **Note:** the `.update(...)` is cast through `as any` (eslint-disabled) because the generated Supabase types lagged the `shift_days` column at the time of writing.

#### `setRoutingActive(agentId, isActive)`

- **Client:** `createClient()` (session) — RLS `routing_config_update` applies.
- **Updates:** `is_active` only.
- **Returns:** same shape as above.

#### `getAgentRoutingConfigAdmin(agentId)`

- `adminClient` variant of `getAgentRoutingConfig`. Used by `lib/actions/sla.ts` to fetch shift config in webhook/Trigger.dev contexts where no user session exists.

Also exported (not used on the settings page directly): `getAgentRoutingConfig`, `getRoutingConfigsByDomain`, `getActiveRoutingConfigs`.

---

### 5. Actions — `agent-routing.ts`

#### `setAgentShiftAction(input: unknown)`

1. `SetAgentShiftSchema.safeParse(input)` — first line (Rule 02). On failure, returns the first Zod issue message (or `formErrors.generic`).
2. `getCurrentProfile()` — must be `manager` \| `admin` \| `founder`, else `formErrors.unauthorized`.
3. **Manager gate (S-06):** only when `caller.role === "manager"` — `getProfileById(agentId)` → `agentProfile.domain === caller.domain`, else `formErrors.unauthorized`.
4. `setAgentShift(agentId, shiftStart, shiftEnd, shiftDays ?? null)`.
5. `revalidatePath("/settings")`.
6. Returns `ActionResult<AgentRoutingConfig>`; never throws.

#### `toggleAgentRouting(formData: FormData)`

1. Inline schema (`toggleRoutingSchema`): `agent_id` (uuid, error code `agent_id_invalid`), `is_active` (boolean; `formData.get("is_active") === "true"`).
2. Same role check as above (no per-agent domain check in this action — RLS on UPDATE covers it).
3. `setRoutingActive(agent_id, is_active)`.
4. **Revalidates:** `/admin/users`, `/admin/users/${agent_id}`, `/settings` (call order in code; cosmetic).

---

### 6. Validation — `SetAgentShiftSchema`

```ts
agentId:    uuid
shiftStart: /^([01]\d|2[0-3]):([0-5]\d)$/ | null
shiftEnd:   same regex | null
shiftDays:  z.array(z.number().int().min(0).max(6)).min(1, "Select at least one work day.")
              .nullable().optional()
```

- **Cross-field refine:** when both `shiftStart` and `shiftEnd` are non-null, `shiftEnd > shiftStart` (string compare on `HH:MM`). Failure: `{ message: "Shift end must be after shift start.", path: ["shiftEnd"] }`.
- **`shiftDays`:** optional + nullable. `null` (or omitted) = inherit global `BUSINESS_HOURS`. When provided as an array it must have ≥ 1 element (`"Select at least one work day."`) and each value must be `0–6`.
- **Nullable pairs:** both times `null` clears the window; one null + one set fails the time refine only when both are set — the client blocks partial saves before the action (`"Set both times to save"`).

Type export: `SetAgentShiftInput = z.infer<typeof SetAgentShiftSchema>`.

---

### 7. TimePicker Component

`src/components/ui/TimePicker.tsx` — shared with `DatePicker` embed via `TimePickerWheelPanel`.

#### Props

| Prop | Type | Notes |
| ------ | ------ | -------- |
| `value` | `string \| null` | `HH:MM` 24-hour (PostgreSQL `time`); seconds stripped via `normalizeTimeHHMM` |
| `onChange` | `(string \| null) => void` | Fires on every wheel/toggle change while open |
| `placeholder?` | string | default `"Set time…"` |
| `disabled?` | boolean | Agent table passes `disabled={isSaving}` |
| `style?` | `CSSProperties` | Agent table sets `width: "104px"` |
| `aria-label?` | string | Agent table sets `Shift start/end for {name}` |

#### Trigger

- **Size:** `height: 32`, `minWidth: 88`, `width: 100%` in cell.
- **Chrome:** `--theme-paper-subtle` bg; `Clock` 13px; label `displayLabel` → `"9:00 AM"` or placeholder.
- **Focus/open:** border `--theme-accent`, `box-shadow: var(--shadow-focus)`.

#### Panel

- **Portal:** `createPortal(..., document.body)` + `position: fixed` — escapes card/stacking contexts (settings rows no longer clip the panel).
- **Position:** `getBoundingClientRect` on open (with `visualViewport` offset correction); flip **up** if insufficient space below; flip **left** if panel would overflow viewport right.
- **Z-index:** `var(--z-modal-nested)`.
- **Columns:** hour wheel `1–12`, minute wheel `0–59` (all minutes, scroll-snap), `:` separator, **AmpmToggle** below wheels.
- **WheelColumn:** scroll-snap; auto-scroll to selected index; `ResizeObserver` measures real item height at runtime (falls back to `ITEM_HEIGHT = 40` until it fires) so zoom / OS text-size changes still snap to the correct index.

#### Serialisation contract (critical)

- **No `Date` objects** — string-only; timezone-safe.
- **Internal state:** 12-hour `{ hour, minute, meridiem }`.
- **`parse("HH:MM")`:** uses `normalizeTimeHHMM` first; `h24 >= 12` → PM; `h24 % 12 === 0` → hour `12` (midnight/noon).
- **`serialise(h, m, meridiem)` → `"HH:MM"`:** AM: hour 12 → 0; PM: hour 12 → 12, else `hour + 12`.
- **`normalizeTimeHHMM`:** `src/lib/utils/dates.ts` — `^([01]\d|2[0-3]):([0-5]\d)` from `"09:00:00"` → `"09:00"`. Used in TimePicker and in AgentSettingsTable (initial `shifts` map + each `handleTimeChange`).

#### Draft state / AM-PM toggle

- `draft` is set **only when the panel opens** (`wasOpenRef` guard) — not on every `value` prop change while open. Avoids the AM/PM control re-mounting during hour/minute scroll.
- **`AmpmToggle`** uses static pressed styles, no Framer `layoutId` (a shared-layout spring caused cross-column flicker — fixed 2026-05-31).

---

### 8. WorkDayPicker Component

Inline sub-component defined at the top of `src/components/settings/AgentSettingsTable.tsx` (not a `src/components/ui/` primitive).

#### Constants

- `DAY_DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0]` — Mon→Sat→Sun render order.
- `DAY_LABELS = { 0:"Su", 1:"Mo", 2:"Tu", 3:"We", 4:"Th", 5:"Fr", 6:"Sa" }`.
- `DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5, 6]` — Mon–Sat; the UI display default when `shift_days` is `null`.

#### Props (WorkDayPicker)

| Prop | Type | Notes |
| ----- | ----- | ----- |
| `days` | `number[]` | currently selected JS day-of-week values |
| `onChange` | `(days: number[]) => void` | fires on every toggle |
| `disabled?` | `boolean` | table passes `disabled={isSaving}` |

#### Behaviour

- Renders 7 pill buttons in `DAY_DISPLAY_ORDER`. Each pill `26×26px`, `--radius-xs`, `--text-2xs`.
- **Selected:** `--theme-accent-surface` bg + `--theme-accent` border + `--theme-accent` text + `--weight-semibold`.
- **Unselected:** transparent bg + `--theme-paper-border` border + `--theme-text-tertiary` text + `--weight-normal`.
- **Last-day guard:** clicking the only selected pill is a no-op (`days.length === 1` → return). The set can never reach zero days.
- `aria-pressed` + `aria-label` (`Select/Deselect {label}`) per pill. `transition` on background/border-color/color only (no layout-affecting properties).
- On change, `handleDaysChange` calls `validateAndSave` immediately (same debounce-free save pattern as the time pickers).

---

### 9. AgentSettingsTable

`'use client'`. Props: `initialRoster`, `callerRole`, `callerDomain`.

#### Local state

- `roster` — seeded from `initialRoster`; mutated optimistically by the pool toggle.
- `shifts: Record<string, ShiftState>` where `ShiftState = { start: string; end: string; days: number[]; error: string | null }`. Seeded from `initialRoster`: `start/end` via `normalizeTimeHHMM(...) ?? ""`, `days` via `agent.shift_days ?? DEFAULT_WORK_DAYS`.
- `search`, `domainFilter`, `poolFilter` — client-side filter state.
- `pendingIds` (pool toggles in flight), `savingIds` (shift saves in flight). Both are `Set<string>`.

#### Row layout (all roles)

Flex card per agent (`motion.div`), not an HTML table.

| Zone | Content |
| ------ | --------- |
| Agent | `Avatar` `sm`, `--radius-sm`; name (`--weight-semibold`); job title; inline shift error / "Set both times to save" hint; **On Leave** pill if `is_on_leave` |
| Domain | badge — **admin / founder only** (`isPrivileged`) |
| Shift Start | `label-micro` + `TimePicker` **104px** wide |
| Shift End | same |
| Active | `computeActiveHours` (shown only when both times set) or `—` |
| Work Days | `label-micro` + `WorkDayPicker` |
| In Pool | label + `Toggle` `sm` |
| Clear | `Button` `danger` `xs` 28×28 + `X` when either shift time set; else 28px spacer |

The shift controls (Start, End, Active, Work Days) share one `flex-wrap` group; a `flex: 1 1 0` spacer pushes In Pool + Clear to the right.

#### Role-specific

- **Domain badge:** `admin` / `founder` only (`isPrivileged`).
- **Domain filter:** `FilterDropdown` when `showDomainFilter && presentDomains.length > 1` — client-side over `roster`, no refetch. `showDomainFilter = isPrivileged`.
- **Pool filter:** `FilterDropdown` (`POOL_FILTER_ITEMS`: in pool / out of pool).
- **Search:** `SearchBar` (size `sm`) on name + job title.
- Filter bar header: `SlidersHorizontal` icon + active-count badge (`activeCount` = number of engaged filters) + agent count on the right (`{n} agent(s)`).

#### Empty state

Playfair italic heading (`--font-serif`, italic). Two messages keyed on `roster.length`:

- `roster.length === 0` → "No agents in the roster yet." / "Agents appear here once they are added to your domain."
- otherwise → "No agents match your filters." / "Try adjusting your search or filters."

#### Concurrent mutation prevention

| Set | Added | Removed | Effect |
| ----- | -------- | --------- | -------- |
| `pendingIds` | `handleToggle` start | after `toggleAgentRouting` | Toggle disabled; row `animate={{ opacity: 0.6 }}` |
| `savingIds` | `saveShift` start | after `setAgentShiftAction` | TimePickers + WorkDayPicker `disabled`; same opacity |

**Opacity via Framer `animate={{ opacity }}`** (`animate={{ opacity: (isSaving || isPending) ? 0.6 : 1, y: 0 }}`), not `style.opacity` — the entrance animation (`initial` opacity/y) and dimming share one motion channel. Hover lift (`translateY(-1px)` + `--shadow-2`) is skipped while saving/pending.

#### Assignment pool toggle

- `Toggle` → `handleToggle` → optimistic `routing_is_active` flip → `toggleAgentRouting(FormData)`.
- Error: revert that roster row + `toast.danger("Couldn't update pool status", …)`.

#### Shift / work-day save flow

- **Trigger:** `TimePicker` `onChange` → `handleTimeChange`; `WorkDayPicker` `onChange` → `handleDaysChange`. Both call `validateAndSave(agent, start, end, days)` — never on blur.
- Both times empty → `saveShift(id, null, null, null)` immediately (a day-only change with no times still clears to null on the server, matching "use BUSINESS_HOURS").
- One time empty → inline `"Set both times to save"` — no action.
- Regex fail → inline `"Use HH:MM format"`; `end <= start` → inline `"End must be after start"` — no action.
- Valid → `setAgentShiftAction({ agentId, shiftStart, shiftEnd, shiftDays })`.
- Server error → `toast.danger("Couldn't save shift", …)` (local state not auto-reverted).

#### Clear shift

- `Button variant="danger" size="xs"` (28×28, `X` icon) → `handleClear` → resets local state to `{ start:"", end:"", days: DEFAULT_WORK_DAYS, error:null }` + `saveShift(id, null, null, null)`.
- DB stores `null` for all three (times + days) → agent reverts to global `BUSINESS_HOURS`. The UI shows `DEFAULT_WORK_DAYS` as the display default even though the DB value is `null`.
- **Why Button:** tokenised hover/focus; avoids bespoke `onMouseEnter`/`onMouseLeave` on a raw control.

#### Avatar

- `Avatar size="sm"` + `style={{ borderRadius: "var(--radius-sm)" }}` — initials / colour fallback internal to the primitive.

#### `computeActiveHours(shiftStart, shiftEnd)`

- Parses `HH:MM` strings to minutes; `end - start`; if `<= 0` or incomplete → `"—"`.
- Else `"Xh Ym"` / `"Xh"` / `"Ym"` (display only in the **Active** column; rendered only when both times are set).

---

### 10. SLA Engine integration — `buildAgentShiftOverride`

`src/lib/utils/sla.ts` is the only consumer of the shift columns for behaviour (the assignment function ignores them).

- `buildAgentShiftOverride(shiftStart, shiftEnd, shiftDays)` returns `null` when **any** of the three is absent/empty (`!shiftStart || !shiftEnd || !shiftDays || shiftDays.length === 0`). Callers then fall back to global `BUSINESS_HOURS`.
- When all three are present it returns `{ startHour, startMinute, endHour, endMinute, workDays: shiftDays }`.
- `isOffDay`, `resolveStart`, `resolveEnd`, `isWithinBusinessHours`, `nextBusinessDeadline` all accept an optional `AgentShiftOverride` and fall back to `BUSINESS_HOURS` (Mon–Sat, 09:00–19:00 IST, `offDays: [0]`) when none is supplied.
- **Implication:** a partial shift config (e.g. days set but times cleared) yields `null` → the agent uses global hours. The settings UI enforces "both times or none" so a half-configured window never reaches the engine as a partial override.

---

### 11. Page component — `page.tsx`

```text
getCurrentProfile()
  → no profile: redirect /login
  → agent | guest: redirect /dashboard
  → isPrivileged = admin|founder
  → rosterDomain = isPrivileged ? '*' : profile.domain
  → roster = await getAgentRosterByDomain(rosterDomain)
  → <AgentSettingsTable initialRoster callerRole={profile.role} callerDomain={profile.domain} />
```

- Exports `metadata = { title: "Settings — Serene" }`.
- **`<h1 className="type-page-title m-0">`** + `<span className="page-title-dot">.</span>` — primary nav contract. No top-right CTA on this page (the header row is title-only).
- **No Suspense:** one blocking fetch; no streaming/async child; the page ships atomically.

---

### 12. Access Control Summary

| Role | `/settings` access | `getAgentRosterByDomain` domain arg |
| ------ | ------------------- | ------------------------------------- |
| `founder` | Yes | `'*'` (all agents) |
| `admin` | Yes | `'*'` |
| `manager` | Yes | `caller.domain` only |
| `agent` | Redirect `/dashboard` | — |
| `guest` | Redirect `/dashboard` | — |

| Action | Extra gate |
| ------ | ---------- |
| `setAgentShiftAction` | Manager only: target agent's `profiles.domain === caller.domain` |
| `toggleAgentRouting` | Role only (RLS on UPDATE) |

---

### 13. Known Invariants (must never be violated)

1. **`getAgentRosterByDomain` uses `adminClient`.** Domain scoping is enforced by the **caller** (`page.tsx` / actions), not RLS on the join.
2. **`is_active` is immediate** pool on/off; **shift times + days are advisory for assignment** — only the SLA engine reads them; round-robin never does.
3. **TimePicker output is `HH:MM` 24-hour** strings matching PostgreSQL `time` — never `Date`.
4. **`shift_days` stores raw JS day-of-week values (`0=Sun…6=Sat`).** UI display order (Mon-first) is cosmetic only. `null` = inherit `BUSINESS_HOURS`.
5. **`setAgentShift` writes all three shift fields in one update.** A non-null window requires both times; clearing writes `(null, null, null)`.
6. **`normalizeTimeHHMM` on load and on every pick** before parse/validate/save.
7. **Work-day set can never be empty.** UI last-day guard + Zod `.min(1)`. A `null` array means "inherit", an empty array is invalid.
8. **Row dimming uses Framer `animate={{ opacity }}`** for `pendingIds`/`savingIds` — not inline `style.opacity`.
9. **Pool toggle must revert local state** on `toggleAgentRouting` error.
10. **Server actions:** Zod first; `{ data, error }` never throw; profile-based auth (rule 09).
11. **No `DELETE` on `agent_routing_config`.** No app-layer INSERT (trigger only).
12. **Settings mutations do not refetch the page** — roster/shift local state + `revalidatePath` for next navigation only.
13. **TimePicker panel portals to `document.body`** — do not rely on parent `overflow` for panel visibility.
14. **Do not import `agent-routing-service` in client components** — use actions only (rule 05 / client bundle).
15. **`buildAgentShiftOverride` returns `null` on any missing shift field** — every SLA caller must fall back to `BUSINESS_HOURS` when it does.
