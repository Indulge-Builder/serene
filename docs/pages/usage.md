# Usage: Page Spec

> **Purpose:** spec for `/admin/usage`, the admin/founder view of how much *active* time each person spends in Serene, per person and per domain.
> **Audience:** engineers. · **Source-of-truth scope:** this route. The heartbeat → snapshot → rollup pipeline: `../architecture/caching.md` (`presence:*`) and `../integrations/trigger-dev.md`; the schema is migration 0126.
> **Last verified:** 2026-09-26 against `src/app/(dashboard)/admin/usage/{page,loading}.tsx`, `src/components/admin/usage/*`, `src/lib/services/usage-service.ts`, `src/lib/actions/usage.ts`, `src/trigger/usage-{snapshot,rollup}.ts`, `src/components/layout/{Sidebar,UsagePresence}.tsx`, and migrations 0126, 0223.

## 1. Purpose

Adoption monitoring: how much **active** time each teammate spends in Serene, today and over the
last 30 days, per person and per domain, so low adoption shows up and the usability problems behind
it can be fixed.

"Active" means the tab is visible **and** there was a real interaction in the last two minutes. The
gate is in the browser, in `<UsagePresence>` (mounted once in the dashboard layout): it beats every
60 seconds (`HEARTBEAT_MS`) only while both hold (`IDLE_MS = 120_000`). The Redis `presence:*` key
lives 150 seconds (`REDIS_TTL.PRESENCE`), so a person who stops beating drops out of the next
snapshot. Being signed in is never counted: people stay signed in around the clock.

## 2. Who sees it

- **Page gate:** `hasElevatedPageAccess` (admin, founder, or a tech workbench member); anyone else,
  including a missing session, goes to `/dashboard`.
- **Service re-gate:** `getAgentUsage` re-reads the caller and returns `null` for anyone who is not
  admin or founder. A tech workbench member therefore passes the page and sees "Usage data is
  unavailable right now."; their Refresh also fails (`getAgentUsageAction` requires admin/founder).
- **Sidebar:** "Usage" (`Activity`) in `ADMIN_NAV`, listed through `isNavVisible`. Admins and the
  tech workbench see it; **founders do not** (it is not in `FOUNDER_NAV_PREFIXES`) and reach it by
  URL.
- The title row carries the `PageControls` bell.

## 3. Data sources

| Layer | Key items |
| ----- | --------- |
| Service | `getAgentUsage(historyDays = 30)` in `usage-service.ts` (server-only): admin/founder re-gate, then the `get_agent_usage` RPC through the admin client for a `{ today, history }` envelope; `active_minutes` converted with `Number()`; `null` on a gate miss or an RPC error |
| Action | `getAgentUsageAction` (`actions/usage.ts`, `requireProfile(['admin','founder'])`) for Refresh. The same file's heartbeat action takes any signed-in role and does one Redis write (`recordPresence`), never a database write |
| RPC | `get_agent_usage(p_today_start, p_history_from)` (0126): `SECURITY DEFINER`, no caller-supplied scope; EXECUTE for `service_role` only. `today` is recomputed live (distinct minutes per person and domain since IST midnight); `history` reads `usage_daily` |
| Tables | `public.usage_heartbeats` (raw ticks, append-only, pruned after 30 days, never read by the page) and `public.usage_daily` (the per IST day, person, domain rollup). Both deny all by RLS; only the RPC reads them. 0223 adds the view `elaya_read.staff_usage_daily` over `usage_daily` for Elaya's read-only SQL |

**The pipeline:** the browser heartbeat → `recordPresence` (one `setex`, 150s) → every minute
`snapshot-usage-presence` appends the live set to `usage_heartbeats` (the only writer) → every 15
minutes `rollup-usage-today` and nightly (00:20 IST) `rollup-usage-nightly` upsert `usage_daily`
(idempotent: overwrite, never add). The page is seeded from `getAgentUsage`; Refresh re-reads, and
because today is recomputed live it reflects activity within about a minute.

## 4. Components

`src/components/admin/usage/`:

- **`UsageDashboard`** (client): holds the seeded report, the **Today | Last 30 days**
  `TabSelector`, and Refresh. The headline `StatTile` strip: "Active today" (`formatDuration` of the
  total) and "People active today" (distinct people).
- **`UsageTodayTable`**: today, per person.
- **`UsageHistoryChart`**: a stacked area chart per domain (Recharts), loaded with `next/dynamic` so
  it stays out of the route's first chunk, with a `ChartSkeleton` fallback.

## 5. States

- **Loading:** `admin/usage/loading.tsx` for the route; the history chart shows `ChartSkeleton`
  while its chunk loads; Refresh shows a spinner.
- **Empty** (all framed `<EmptyState>` with the `Activity` icon):
  - no report (a gate miss or an RPC error): "Usage data is unavailable right now." / "Try
    refreshing in a moment."
  - nobody active yet today: "No one active yet today." / "Active time appears here as team members
    work in Serene. A blank board through the working day is itself the signal worth chasing."
  - no history: "No history yet." / "Daily active-time history accumulates here from the first full
    day of tracking."
- **Error:** the page never throws; a failed Refresh shows `toast.danger` and keeps the last report.

## 6. Invariants

- Admin/founder is enforced in the service (and the Refresh action), whatever the page gate admits.
  Never relax the service re-gate.
- The page reads only `usage_daily` plus the live today recompute, never `usage_heartbeats`
  directly.
- The rollup is idempotent (primary key `(day, user_id, domain)`): re-rolling a day overwrites.
- "Active" is decided in the browser before a heartbeat is sent; no signed-in span is ever counted.

## 7. Open items

- Founders do not see Usage in their sidebar.
- The tech workbench reaches the page but always gets the "unavailable" state; either hide it for
  them or widen the service gate on purpose.
- On a fresh environment the 30-day tab fills in as `usage_daily` accrues.
