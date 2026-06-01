# Settings Page — Full Intelligence Document

Last verified: 2026-06-01

## 1. Module Overview

The settings page configures **Gia lead-assignment pool membership** (`agent_routing_config.is_active`) and **per-agent shift windows** (`shift_start` / `shift_end`). One route, one client table component.

| Item | Value |
| ------ | ------ |
| Route | `GET /settings` → `src/app/(dashboard)/settings/page.tsx` |
| UI | `src/components/settings/AgentSettingsTable.tsx` |
| Access | `agent` / `guest` → `redirect("/dashboard")`. `manager` / `admin` / `founder` only. |
| Data load | Single server fetch: `getAgentRosterByDomain(rosterDomain)` → `initialRoster` prop. No URL params, no Suspense split. |

### Sidebar — Configuration section

- Section label: **Configuration** (`NavSection`).
- Visible when `isManager` (`manager` \| `admin` \| `founder`).
- Items from `getConfigurationNav(isPrivileged)`:
  - **Ad Creatives** — `/admin/ad-creatives`, `Film` icon — **admin/founder only** (`isPrivileged`), listed first when present.
  - **Settings** — `/settings`, `Settings` icon — **manager, admin, founder**.
- Position: after Analytics nav block, before Admin section (admin/founder).

---

## 2. Architectural History

**Original (2026-05-30):** Tab shell + two tabs.

| Deleted file | Role |
| -------------- | ------ |
| `src/app/(dashboard)/settings/SettingsShell.tsx` | `'use client'` shell; URL `?tab=roster\|shifts`; `router.replace` + `useTransition`; switched between tabs. |
| `src/components/settings/AgentRosterTab.tsx` | Card grid; domain filter pills; **In Pool** `Toggle` via `toggleAgentRouting`; optimistic updates. |
| `src/components/settings/AgentShiftsTab.tsx` | Table layout; `<input type="time">`; blur-to-save shifts; `computeActiveHours`; clear shift. |

**Collapse rationale:** Roster (pool toggle) and shifts (time window) are the same agents and same `agent_routing_config` row — a tab split added navigation cost without separating data or permissions.

**Current:** `page.tsx` → `AgentSettingsTable` only. Filter bar + card rows (not a `<table>`). Shifts use `TimePicker`; save fires on each valid pick, not on blur.

---

## 3. Data Model — `agent_routing_config`

**First migration:** `supabase/migrations/20260526000002_agent_routing_config.sql` (inventory **0002**).  
`shift_start` and `shift_end` are defined there as optional `time` columns — **no later migration adds or alters them**.  
`grep` across `supabase/migrations/` also references the table in `20260527000007_round_robin_fn.sql` and `CLAUDE.md` only.

| Column | Type | Nullable | Default |
| -------- | ------ | ---------- | --------- |
| `id` | `uuid` | NO | `gen_random_uuid()` |
| `agent_id` | `uuid` | NO | — (UNIQUE FK → `profiles.id` ON DELETE CASCADE) |
| `is_active` | `boolean` | NO | `true` |
| `shift_start` | `time` | YES | — |
| `shift_end` | `time` | YES | — |
| `updated_at` | `timestamptz` | NO | `now()` |

**Auto-creation trigger:** `handle_agent_routing_config()` on `AFTER INSERT OR UPDATE ON profiles`. Inserts `(agent_id, is_active=true)` when `role = 'agent'` (INSERT, or UPDATE where role becomes `agent`). `ON CONFLICT (agent_id) DO NOTHING` — idempotent.

### Semantics

- **`is_active`:** Immediate pool membership. `false` removes the agent from round-robin eligibility on the next assignment read. Not time-based.
- **`shift_start` / `shift_end`:** **Advisory only.** Stored for ops/UI; **no DB trigger or CHECK enforces “in shift” for assignment.** Round-robin (`get_next_round_robin_agent`) filters on `is_active`, not shift columns. Product docs state ingestion *may* read shifts; there is no Postgres enforcement constraint.

### RLS

- SELECT: all authenticated (`auth.uid() IS NOT NULL`).
- INSERT: **trigger only** — no app INSERT policy.
- UPDATE: `manager` \| `admin` \| `founder` via `get_user_role()`.
- DELETE: none (deactivate via `is_active`).

---

## 4. Service Layer — `agent-routing-service.ts`

### `getAgentRosterByDomain(domain: AppDomain | '*')`

- **Join:** `profiles` ← `agent_routing_config!inner` (only agents with a config row).
- **Filter:** `.eq('role', 'agent')`; if `domain !== '*'`, `.eq('domain', domain)`.
- **Client:** `createAdminClient()` — RLS blocks managers from cross-profile joins; **callers must enforce domain** at page/action layer (`page.tsx` passes `caller.domain` or `'*'`).
- **Sort:** `domain` ASC, `full_name` ASC.
- **Returns:** `AgentRosterRow[]` (mapped flat):

| Field | Source |
| ----- | ------ |
| Profile columns | `id`, `full_name`, `avatar_url`, `job_title`, `domain`, `is_active`, `is_on_leave` from `profiles` |
| Routing columns | `routing_is_active`, `routing_config_id`, `shift_start`, `shift_end` from `agent_routing_config` |

### `setAgentShift(agentId, shiftStart, shiftEnd)`

- **Client:** `adminClient` (manager cannot UPDATE another agent’s config under RLS).
- **Updates:** `shift_start`, `shift_end` (either/both `null` clears window).
- **Returns:** `{ data: AgentRoutingConfig \| null, error: string \| null }`.

### `setRoutingActive(agentId, isActive)`

- **Client:** `createClient()` (session) — RLS `routing_config_update` applies.
- **Updates:** `is_active` only.
- **Returns:** same shape as above.

Also exported (not used on settings page): `getAgentRoutingConfig`, `getRoutingConfigsByDomain`, `getActiveRoutingConfigs`.

---

## 5. Actions — `agent-routing.ts`

### `setAgentShiftAction(input: unknown)`

1. `SetAgentShiftSchema.safeParse(input)` — first line.
2. `getCurrentProfile()` — must be `manager` \| `admin` \| `founder`.
3. **Manager gate:** `getProfileById(agentId)` → `agentProfile.domain === caller.domain`.
4. `setAgentShift(agentId, shiftStart, shiftEnd)`.
5. `revalidatePath("/settings")`.
6. Returns `ActionResult<AgentRoutingConfig>`; Zod issue message or `formErrors.*` — never throws.

### `toggleAgentRouting(formData: FormData)`

1. Inline schema: `agent_id` (uuid), `is_active` (boolean; `formData.get("is_active") === "true"`).
2. Same role check as above (no per-agent domain check in action — RLS on UPDATE).
3. `setRoutingActive(agent_id, is_active)`.
4. **Revalidates:** `/settings`, `/admin/users`, `/admin/users/${agent_id}`.

---

## 6. Validation — `SetAgentShiftSchema`

```ts
agentId:    uuid
shiftStart: /^([01]\d|2[0-3]):([0-5]\d)$/ | null
shiftEnd:   same regex | null
```

- **Cross-field refine:** when both non-null, `shiftEnd > shiftStart` (string compare on `HH:MM`). Failure: `{ message: "Shift end must be after shift start.", path: ["shiftEnd"] }`.
- **Nullable pair:** both `null` clears shift; one null + one set fails refine only when both are set; client blocks partial saves before the action.

---

## 7. TimePicker Component

`src/components/ui/TimePicker.tsx` — shared with `DatePicker` embed via `TimePickerWheelPanel`.

### Props

| Prop | Type | Notes |
| ------ | ------ | -------- |
| `value` | `string \| null` | `HH:MM` 24-hour (PostgreSQL `time`); seconds stripped via `normalizeTimeHHMM` |
| `onChange` | `(string \| null) => void` | Fires on every wheel/toggle change while open |
| `placeholder?` | string | default `"Set time…"` |
| `disabled?` | boolean | |
| `style?` | `CSSProperties` | Agent table sets `width: "104px"` |
| `aria-label?` | string | |

### Trigger

- **Size:** `height: 32`, `minWidth: 88`, `width: 100%` in cell.
- **Chrome:** `--theme-paper-subtle` bg; `Clock` 13px; label `displayLabel` → `"9:00 AM"` or placeholder.
- **Focus/open:** border `--theme-accent`, `box-shadow: var(--shadow-focus)`.

### Panel

- **Portal:** `createPortal(..., document.body)` + `position: fixed` — escapes card/stacking contexts (settings rows no longer clip the panel).
- **Position:** `getBoundingClientRect` on open; flip **up** if insufficient space below; flip **left** if panel would overflow viewport right; `transform: translateY(-100%)` when flipped up.
- **Z-index:** `var(--z-modal-nested)`.
- **Columns:** hour wheel `1–12`, minute wheel `0–59` (all minutes, scroll-snap), `:` separator, **AmpmToggle** below wheels.
- **WheelColumn:** scroll-snap; auto-scroll to selected index on mount/selection; centered row uses accent colour + scale/opacity falloff.

### Serialisation contract (critical)

- **No `Date` objects** — string-only; timezone-safe.
- **Internal state:** 12-hour `{ hour, minute, meridiem }`.
- **`parse("HH:MM")`:** uses `normalizeTimeHHMM` first; `h24 >= 12` → PM; `h24 % 12 === 0` → hour `12` (midnight/noon).
- **`serialise(h, m, meridiem)` → `"HH:MM"`:** AM: hour 12 → 0; PM: hour 12 → 12, else `hour + 12`.
- **`normalizeTimeHHMM`:** `src/lib/utils/dates.ts` — `^([01]\d|2[0-3]):([0-5]\d)` from `"09:00:00"` → `"09:00"`. Used in TimePicker (`normalisedValue`, `parse`) and AgentSettingsTable (initial `shifts` map + each `handleTimeChange`).

### Draft state

- `draft` set **only when panel opens** (`wasOpenRef` guard) — not on every `value` prop change while open.
- **Why:** avoids AM/PM control re-mounting on parent re-render during hour/minute scroll.

### AM/PM toggle

- **`AmpmToggle`** — static pressed styles, no Framer `layoutId`.
- **Why not `TabSelector`:** shared-layout spring re-ran from the left on hour/minute updates → visible flicker across columns (fixed 2026-05-31).

---

## 8. AgentSettingsTable

`'use client'`. Props: `initialRoster`, `callerRole`, `callerDomain`.

### Row layout (all roles)

Flex card per agent (`motion.div`), not an HTML table.

| Zone | Content |
| ------ | --------- |
| Agent | `Avatar` `sm`, `--radius-sm`; name (`--weight-semibold`); job title; inline shift error/hint; **On Leave** pill if `is_on_leave` |
| Shift Start | `label-micro` + `TimePicker` **104px** wide |
| Shift End | same |
| Active | `computeActiveHours` or `—` |
| In Pool | label + `Toggle` `sm` |
| Clear | `Button` `danger` `xs` 28×28 + `X` when either shift set; else 28px spacer |

**Width history (2026-05-31):** Shift pickers **96px → 104px** so the 88px-min trigger fits; Active column tightened; In Pool column tightened. Current code sets `style={{ width: "104px" }}` on each `TimePicker`.

**`overflow: hidden`:** Removed from the old **table** wrapper because it clipped the pre-portal dropdown. Current **card list** has no table wrapper; panels use **body portal** — clipping is not an issue. Rounded corners are per-card (`--radius-lg`), not a single clipped container.

### Role-specific

- **Domain badge:** `admin` / `founder` only (`isPrivileged`).
- **Domain filter:** `FilterDropdown` when `showDomainFilter && presentDomains.length > 1` — client-side on `roster`, no refetch.
- **Pool filter:** `FilterDropdown` (in pool / out of pool).
- **Search:** `SearchBar` on name + job title.

### Concurrent mutation prevention

| Set | Added | Removed | Effect |
| ----- | -------- | --------- | -------- |
| `pendingIds` | `handleToggle` start | after `toggleAgentRouting` | Toggle disabled; row `animate={{ opacity: 0.6 }}` |
| `savingIds` | `saveShift` start | after `setAgentShiftAction` | TimePickers `disabled`; same opacity |

**Opacity via Framer `animate={{ opacity }}`**, not `style.opacity` — entrance animation (`initial` opacity/y) and dimming share one motion channel without fighting inline styles.

### Assignment pool toggle

- `Toggle` → `handleToggle` → optimistic `routing_is_active` flip → `toggleAgentRouting(FormData)`.
- Error: revert roster row + `toast.danger("Couldn't update pool status", …)`.

### Shift save flow

- **Trigger:** `TimePicker` `onChange` → `handleTimeChange` → `validateAndSave` (not blur).
- Both empty → `saveShift(id, null, null)` immediately.
- One empty → inline `"Set both times to save"` — no action.
- Regex / `end <= start` → inline errors — no action.
- Valid pair → `setAgentShiftAction({ agentId, shiftStart, shiftEnd })`.
- Server error → `toast.danger` only (local shift state not auto-reverted).

### Clear shift

- `Button variant="danger" size="xs"` → `handleClear` → local empty + `setAgentShiftAction(..., null, null)`.
- **Why Button:** tokenised hover/focus; avoids bespoke `onMouseEnter`/`onMouseLeave` on a raw control.

### Avatar

- `Avatar size="sm"` + `style={{ borderRadius: "var(--radius-sm)" }}` — initials/colour fallback internal to primitive.

### `computeActiveHours(shiftStart, shiftEnd)`

- Parses `HH:MM` strings to minutes; `end - start`; if `<= 0` or incomplete → `"—"`.
- Else `"Xh Ym"` / `"Xh"` / `"Ym"` (display only in **Active** column).

---

## 9. Page component — `page.tsx`

```text
getCurrentProfile()
  → no profile: redirect /login
  → agent | guest: redirect /dashboard
  → rosterDomain = admin|founder ? '*' : profile.domain
  → roster = await getAgentRosterByDomain(rosterDomain)
  → <AgentSettingsTable initialRoster callerRole callerDomain />
```

- **`<h1 className="type-page-title">`** + `<span className="page-title-dot">.</span>` — primary nav contract.
- **No Suspense:** one blocking fetch; no streaming/async child; page is small enough to ship atomically.

---

## 10. Access Control Summary

| Role | `/settings` access | `getAgentRosterByDomain` domain arg |
| ------ | ------------------- | ------------------------------------- |
| `founder` | Yes | `'*'` (all agents) |
| `admin` | Yes | `'*'` |
| `manager` | Yes | `caller.domain` only |
| `agent` | Redirect `/dashboard` | — |
| `guest` | Redirect `/dashboard` | — |

| Action | Extra gate |
| ------ | ---------- |
| `setAgentShiftAction` | Manager: target agent’s `profiles.domain === caller.domain` |
| `toggleAgentRouting` | Role only (RLS on UPDATE) |

---

## 11. Known Invariants (must never be violated)

1. **`getAgentRosterByDomain` uses `adminClient`.** Domain scoping is enforced by the **caller** (`page.tsx` / actions), not RLS on the join.
2. **`is_active` is immediate** pool on/off; **shift times are advisory** — no DB shift-enforcement for assignment.
3. **TimePicker output is `HH:MM` 24-hour** strings matching PostgreSQL `time` — never `Date`.
4. **`normalizeTimeHHMM` on load and on every pick** before parse/validate/save.
5. **Save requires both shift fields** for a non-null write; **both `null`** clears the window.
6. **Row dimming uses Framer `animate={{ opacity }}`** for `pendingIds`/`savingIds` — not inline `style.opacity`.
7. **Pool toggle must revert local state** on `toggleAgentRouting` error.
8. **Server actions:** Zod first; `{ data, error }` never throw; profile-based auth (rule 09).
9. **No `DELETE` on `agent_routing_config`.** No app-layer INSERT (trigger only).
10. **Settings mutations do not refetch the page** — roster/shift local state + `revalidatePath` for next navigation only.
11. **TimePicker panel portals to `document.body`** — do not rely on parent `overflow` for panel visibility.
12. **Do not import `agent-routing-service` in client components** — use actions only (rule 05 / client bundle).
