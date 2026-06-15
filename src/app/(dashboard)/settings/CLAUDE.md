# Settings Page CLAUDE.md

## Route

`GET /settings` — manager / admin / founder only. Agent or guest → redirect `/dashboard`.

## File Map

```
src/app/(dashboard)/settings/
  page.tsx              — server component; auth guard; Promise.all of getAgentRosterByDomain + (admin/founder) getAllSlaPolicies; renders AgentSettingsTable + SlaPoliciesPanel

src/components/settings/
  AgentSettingsTable.tsx — unified table: one row per agent with assignment toggle + shift start/end + active hours
  SlaPoliciesPanel.tsx   — follow-up engine editor (admin/founder only): one row per sla_policies rule; threshold blur-save, hours-basis select, channel checkboxes, active toggle (optimistic) — writes via updateSlaPolicyAction. PLUS a "New rule" form (header toggle) that authors a policy over the trigger catalog — writes via createSlaPolicyAction (both in actions/sla-policies.ts). Recipient choice on seeded rows = toggling the per-recipient rows active; seeded-rule identity fields read-only. Groups are exhaustive (Lead status / Call outcome / Follow-up cadences / Task due) so a user-authored outcome rule has a home. Full spec: docs/pages/settings.md §4
```

## Architecture

Single page. No tabs. Agent roster table for manager+; the SLA panel renders below it for
admin/founder only. Each agent row in `AgentSettingsTable` exposes:
- **Shift Start** — `<TimePicker>` (`src/components/ui/TimePicker.tsx`); saves immediately on each pick when both fields are valid
- **Shift End** — `<TimePicker>`; saves immediately on each pick when both fields are valid
- **Active Hours** — computed client-side from start/end strings; displays as "Xh Ym"
- **In Pool toggle** — `Toggle` component; optimistic update via `toggleAgentRouting`
- **Clear button** — appears when any shift field is set; fires `setAgentShiftAction(id, null, null)`

## Data Flow

- `page.tsx` fetches `getAgentRosterByDomain(domain)` once at load.
- `domain = '*'` for admin/founder — all agents across all domains.
- `domain = caller.domain` for manager — only their domain.
- The fetched `AgentRosterRow[]` is passed as `initialRoster` to `AgentSettingsTable`.
- No re-fetches from the server — mutations use server actions + optimistic/local updates.

## Filter bar

Standard paper strip (same chrome as Team / Leads): sliders icon + active-count badge, `SearchBar` (name + job title), `FilterDropdown` domain (admin/founder only, when roster spans multiple domains), pool status select (all / in pool / out of pool), agent count on the right.

- All filtering is client-side over `initialRoster` — no URL params, no re-fetch.
- Managers always see the bar (search + pool); domain dropdown is hidden (roster is already domain-scoped).

## AgentSettingsTable — toggleAgentRouting

- Reuses `toggleAgentRouting` from `lib/actions/agent-routing.ts`.
- Optimistic: toggle flips immediately; reverts on error + `toast.danger`.
- `pendingIds` set disables the toggle while the action is in-flight.

## AgentSettingsTable — setAgentShiftAction

- `<input type="time">` — browser value is always `HH:MM`; stored as PostgreSQL `time`.
- Save fires on `onBlur` of either field when both fields are filled and valid.
- If only one field filled: inline hint "Set both times to save" — no action fired.
- If `shiftEnd ≤ shiftStart`: inline error "End must be after start" — no action fired.
- Both fields empty + blur = clear the shift (fires action with `null, null, null`).
- Clear button: appears when at least one field is set; fires `setAgentShiftAction(id, null, null, null)`.

## WorkDayPicker

`WorkDayPicker` is an inline sub-component defined at the top of `AgentSettingsTable.tsx`.
It renders 7 pill buttons in Mon→Sat→Sun display order (`[1,2,3,4,5,6,0]`).

- Each pill is 26×26px, `--radius-xs`, `--text-2xs`.
- Selected: `--theme-accent-surface` bg + `--theme-accent` border + accent colour text + semibold.
- Unselected: transparent bg + `--theme-paper-border` + tertiary text.
- **Last-day guard:** clicking the only selected pill is a no-op (cannot reach zero selected days).
- Days are stored as JS day-of-week values (0=Sun…6=Sat) — display order is purely cosmetic.
- On change, `handleDaysChange` calls `validateAndSave` immediately (same debounce-free save pattern as time pickers).

## shift_days — null means "use global BUSINESS_HOURS"

- DB column: `integer[] DEFAULT NULL` on `agent_routing_config`.
- `null` = agent uses global BUSINESS_HOURS work days (Mon–Sat by default).
- Non-null array = agent's personal work days override (min 1 element enforced in Zod + UI).
- Clear button sends `shiftDays: null` to the DB — the UI resets to `DEFAULT_WORK_DAYS` ([1,2,3,4,5,6]) as the display default, but DB stores `null`.
- `buildAgentShiftOverride` in `src/lib/utils/sla.ts` returns `null` when `shift_days` is null; callers fall back to BUSINESS_HOURS.

## Shift time contract

- Stored as PostgreSQL `time` — timezone-naive. Never parse to Date (timezone corruption).
- Display as-is from the DB string (e.g. "09:00").
- Zod schema: `/^([01]\d|2[0-3]):([0-5]\d)$/` — strict HH:MM format.
- Active hours computed client-side from the two strings.

## Grid columns

| Role              | Columns |
|-------------------|---------|
| manager           | Agent · Shift Start · Shift End · Active Hours · Work Days · In Pool · Clear |
| admin / founder   | Agent · Domain · Shift Start · Shift End · Active Hours · Work Days · In Pool · Clear |

## SlaPoliciesPanel — "New rule" authoring (2026-06-15)

The panel's `SectionCard` header carries a **New rule** toggle (admin/founder). Open → an inline
`CreateRuleForm` (a sub-component in the same file, like `WorkDayPicker` in `AgentSettingsTable`)
with five operational fields + channels:

- **Watches** (`trigger_kind`: status / outcome / task_due) — drives the value dropdown.
- **Value** (`trigger_value`) — options re-derive from the kind (`LEAD_STATUSES` →
  `LEAD_STATUS_LABELS`, `CALL_OUTCOMES` → `CALL_OUTCOME_LABELS`, task_due → `gia_followup`). The
  dropdown can never offer a value the action would reject.
- **Notifies** (`recipient_role`: agent / manager / founder).
- **Threshold (min)** — hidden for `outcome` (those tick daily; `threshold_minutes` is unused).
- **Hours basis** (`hours_mode`, reuses `HOURS_MODE_OPTIONS`).
- **Channels** (`in_app` / `whatsapp`).

Writes via **`createSlaPolicyAction`** (`actions/sla-policies.ts`) — mirrors `updateSlaPolicyAction`
exactly. On success the server-returned row prepends to local state and renders in its group.

**The code is system-generated, never user-set.** `createSlaPolicyAction` mints an inert
`USR-<id>` and asserts it carries no reserved `SLA-`/`CAD-`/`TASK-` prefix before the write — the
schema (`CreateSlaPolicySchema`) accepts no `code` field at all. A `CAD-` code would make the rule
a self-re-arming daily task generator (`isCadenceCode`); `SLA-04` has a call_count branch. `USR-`
is clear of both. `trigger_value` is validated **against** `trigger_kind` server-side (real
status / outcome / `gia_followup`) — a value that can never fire (→ `STALE_FIRE` forever) is
rejected by the action, not just the dropdown. No delete path — switch off via the active toggle.

The panel's group list is **exhaustive**: Lead status · Call outcome · Follow-up cadences · Task
due. The "Call outcome rules" group exists so a user-authored non-cadence `outcome` rule (which
isn't an `isCadenceCode` row) has a home; seeded `CAD-01x` outcome rules stay under cadences.

## SLA arming is decoupled from agent assignment (2026-06-15)

A lead created with **no agent** still arms its manager (`SLA-01B`) and founder (`SLA-01C`)
escalation timers — the engine no longer assumes an agent end-to-end (`ScheduleSlaSchema.assignedTo`
is `.uuid().nullable()`; `notifyLeadAssigned` arms SLA on `scheduleSla` alone, not on `assignedTo`;
`resolveAgentShift(null)` falls back to `BUSINESS_HOURS`). The agent rule (`SLA-01A`) self-skips at
fire when `assigned_to` is null. The Trigger.dev idempotency key carries no agent, so a later
assignment that re-arms the same rule dedupes against the unassigned timer (no double-arming). See
`docs/modules/gia.md §4` and the changelog (2026-06-15).

## Security (A-09 two-layer)

- Page redirects agent/guest server-side.
- `setAgentShiftAction`: manager checked against `getProfileById(agentId).domain === caller.domain`.
- `toggleAgentRouting`: existing action; RLS covers it.
- `getAgentRosterByDomain`: `adminClient` bypasses RLS for the cross-profile join; domain filtering enforced in service code.
