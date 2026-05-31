# Settings Page CLAUDE.md

## Route

`GET /settings` — manager / admin / founder only. Agent or guest → redirect `/dashboard`.

## File Map

```
src/app/(dashboard)/settings/
  page.tsx              — server component; auth guard; fetches getAgentRosterByDomain; renders AgentSettingsTable directly (no shell)

src/components/settings/
  AgentSettingsTable.tsx — unified table: one row per agent with assignment toggle + shift start/end + active hours
```

## Architecture

Single page. No tabs. Each agent row in `AgentSettingsTable` exposes:
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
- Both fields empty + blur = clear the shift (fires action with `null, null`).
- Clear button: appears when at least one field is set; fires `setAgentShiftAction(id, null, null)`.

## Shift time contract

- Stored as PostgreSQL `time` — timezone-naive. Never parse to Date (timezone corruption).
- Display as-is from the DB string (e.g. "09:00").
- Zod schema: `/^([01]\d|2[0-3]):([0-5]\d)$/` — strict HH:MM format.
- Active hours computed client-side from the two strings.

## Grid columns

| Role              | Columns |
|-------------------|---------|
| manager           | Agent · Shift Start · Shift End · Active Hours · In Pool · Clear |
| admin / founder   | Agent · Domain · Shift Start · Shift End · Active Hours · In Pool · Clear |

## Security (A-09 two-layer)

- Page redirects agent/guest server-side.
- `setAgentShiftAction`: manager checked against `getProfileById(agentId).domain === caller.domain`.
- `toggleAgentRouting`: existing action; RLS covers it.
- `getAgentRosterByDomain`: `adminClient` bypasses RLS for the cross-profile join; domain filtering enforced in service code.
