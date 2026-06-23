# Usage — Page Spec

> **Purpose:** spec for `/admin/usage` — the admin/founder adoption-monitoring view of active time per agent and per domain.
> **Audience:** engineers. · **Source-of-truth scope:** this route. The heartbeat → snapshot → rollup pipeline lives in `../architecture/caching.md` (`presence:*`) and the Trigger.dev jobs; the schema is migration 0126.
> **Last verified:** 2026-06-24 against `src/app/(dashboard)/admin/usage/page.tsx`.

## 1. Purpose

Adoption monitoring: how much **ACTIVE** time each team member spends in Serene, per agent and
per domain — today plus 30 days of daily history. The goal is to surface low-adoption users so the
usability problems driving low usage can be fixed.

"Active" = the tab is visible **and** there was a real interaction in the last ~2 min — gated
client-side in `<UsagePresence>` (the dashboard-layout heartbeat: `HEARTBEAT_MS = 60_000` beat
cadence, `IDLE_MS = 120_000` is the "~2 min" idle cutoff). The `presence:*` key's `150s` TTL
(`REDIS_TTL.PRESENCE`) — comfortably above the 60s beat — is the mechanism that drops a stopped
beater out of the snapshot scan within ~1 tick once the tab goes hidden or idle. It is **not**
"logged in":
agents stay logged in around the clock, so a login span is meaningless and is never counted.

## 2. Who sees it

Admin and founder only. The page redirects all other roles to `/dashboard`; unauthenticated →
`/login`. The service re-gates independently (`getAgentUsage` re-reads the caller's profile via
`getCurrentProfile` and returns `null` for any non-admin/founder caller) — defence in depth
alongside the page's role check. `/admin/usage` is a first-class Sidebar entry — `{ href: "/admin/usage", label: "Usage", icon: Activity }` in `ADMIN_NAV` (`Sidebar.tsx`) — but `ADMIN_NAV` is itself admin/founder-gated, so non-privileged roles never see the link.

## 3. Data sources

| Layer | Key items |
| ----- | --------- |
| Service | `getAgentUsage(historyDays = 30)` in `usage-service.ts` (SERVER ONLY) — founder/admin-gated; calls the `get_agent_usage` RPC via the **admin client** for a `{ today, history }` envelope; `Number()`-coerces `active_minutes`; returns `null` on gate-miss or RPC error |
| RPC | `get_agent_usage(p_today_start, p_history_from)` (migration 0126) — `SECURITY DEFINER`, takes NO caller-supplied scope/role; EXECUTE revoked from `authenticated`, `service_role` only (Q-13 revoked tier). `today` is a live recompute (`COUNT(DISTINCT date_trunc('minute', captured_at))` per user+domain since IST midnight); `history` reads `usage_daily` |
| Tables | `usage_heartbeats` (raw append-only ticks, A-11 — never read by the dashboard, pruned > 30 days) + `usage_daily` (the per-(IST day, user, domain) rollup the dashboard reads). Both deny-by-default RLS — reached only via the RPC (migration 0126) |

**The data path:** Redis presence heartbeat (`recordPresence`, ONE `setex` at
`REDIS_TTL.PRESENCE = 150s`, no DB write) → 1-min snapshot job `snapshotUsagePresenceTask`
(appends `usage_heartbeats`, the only writer) →
15-min/nightly rollup `rollupUsageTodayTask`/`rollupUsageNightlyTask` (idempotent UPSERT into
`usage_daily`, overwrite never increment). The page is **RSC-seeded** from `getAgentUsage`; a
manual Refresh re-reads via `getAgentUsageAction` (today recomputes live, so it reflects activity
within ~1 snapshot interval without waiting for the 15-min rollup).

## 4. Components

- `UsageDashboard` (`components/admin/usage/UsageDashboard.tsx`) — `'use client'` shell; owns the
  seeded report state, the **Today | Last 30 days** `TabSelector`, and the Refresh button. Headline
  `StatTile` strip (default `card` variant): "Active today" (`formatDuration` of total minutes) +
  "People active today" (`formatCount` of distinct active `user_id`s).
- `UsageTodayTable` — the per-agent today table.
- `UsageHistoryChart` — the per-domain stacked Area chart (Recharts), `next/dynamic` so it stays
  out of the route's initial chunk (G-3), with a `ChartSkeleton` fallback.

## 5. States

- **Loading:** the history chart shows a `ChartSkeleton` while its chunk loads; Refresh shows a
  button spinner (`isPending`).
- **Empty (no report):** `getAgentUsage` → `null` (gate-miss or RPC error) renders the framed
  `<EmptyState>` "Usage data is unavailable right now."
- **Empty (no history yet):** the history view with zero rows renders the framed "No history yet."
  empty state.
- **Error:** the page never throws — `null` maps to the empty state; a failed Refresh fires
  `toast.danger` and keeps the last report.

## 6. Invariants

- Admin/founder is enforced in **two layers** (page redirect + service re-gate) — never relax either.
- The dashboard reads ONLY `usage_daily` (+ the live today recompute) — never the raw
  `usage_heartbeats` directly.
- The rollup is **idempotent** (PK `(day, user_id, domain)`): re-rolling a day overwrites, never
  accumulates — `active_minutes` is always the freshly counted distinct-minute total.
- "Active" is decided entirely by the client gate before a heartbeat fires; this view only displays
  the ticks the gate admitted. No login span is ever counted.

## 7. Open items

None tracked at the route level. The view is only as populated as the rollup history; on a fresh
deploy the "Last 30 days" tab fills in over time as `usage_daily` accrues.
