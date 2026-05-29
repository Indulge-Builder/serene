# Settings Page CLAUDE.md

## Route

`GET /settings` — manager / admin / founder only. Agent or guest → redirect `/dashboard`.

## File Map

```
src/app/(dashboard)/settings/
  page.tsx         — server component; auth guard; fetches getAgentRosterByDomain; passes to SettingsShell
  SettingsShell.tsx — 'use client'; tab state via URL param (?tab=roster|shifts); renders AgentRosterTab or AgentShiftsTab

src/components/settings/
  AgentRosterTab.tsx — agent card grid; routing pool toggle (toggleAgentRouting); optimistic update
  AgentShiftsTab.tsx — shift time table; blur-on-save; setAgentShiftAction
```

## Tabs

| Tab value | Label      | URL param       |
| --------- | ---------- | --------------- |
| `roster`  | Assignment | `?tab=roster`   |
| `shifts`  | Shifts     | `?tab=shifts`   |

Default (no param): `roster`.

## Data Flow

- `page.tsx` fetches `getAgentRosterByDomain(domain)` once at load.
- `domain = '*'` for admin/founder — all agents across all domains.
- `domain = caller.domain` for manager — only their domain.
- The fetched `AgentRosterRow[]` is passed as `initialRoster` to both tabs.
- No tab re-fetches from the server — mutations use server actions + optimistic updates.

## Domain filter

- Shown only to admin/founder (multiple domains possible).
- Manager's domain filter is hidden — they only ever see one domain.
- The filter is purely presentational — it filters the `initialRoster` array client-side.

## AgentRosterTab — toggleAgentRouting

- Reuses `toggleAgentRouting` from `lib/actions/agent-routing.ts` — same action as `UserStatusControls`.
- Optimistic: card state flips immediately; reverts on error + `toast.danger`.
- `pendingIds` set disables the toggle while the action is in-flight.

## AgentShiftsTab — setAgentShiftAction

- `<input type="time">` — browser value is always `HH:MM`; stored directly as PostgreSQL `time`.
- Save fires on `onBlur` of either field when both fields are filled and valid.
- If only one field filled: inline hint "Set both times to save" — no action fired.
- If `shiftEnd ≤ shiftStart`: inline error "End must be after start" — no action fired.
- Both fields empty + blur = clear the shift (fires action with `null, null`).
- Clear button: appears when at least one field is set; fires `setAgentShiftAction(id, null, null)`.

## Shift time contract

- Stored as PostgreSQL `time` — timezone-naive. Never parse to Date (timezone corruption).
- Display as-is from the DB string (e.g. "09:00").
- Zod schema: `/^([01]\d|2[0-3]):([0-5]\d)$/` — strict HH:MM format.
- Active hours computed client-side from the two strings — formula: (eh*60+em) - (sh*60+sm).

## Security (A-09 two-layer)

- Page redirects agent/guest server-side.
- `setAgentShiftAction`: manager checked against `getProfileById(agentId).domain === caller.domain`.
- `toggleAgentRouting`: existing action; no additional domain check needed (RLS covers it).
- `getAgentRosterByDomain`: `adminClient` bypasses RLS for the cross-profile join; domain filtering enforced in service code.
