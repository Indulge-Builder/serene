# Performance

> **Purpose:** Self-scoped agent dashboard (core-four metrics + effort + outcomes + team benchmarks) and
> manager roster (one pre-aggregated row per agent), backed entirely by SQL RPCs; plus the Phase-5 drill
> modals for calls / deals / leads with keyset pagination.

Back to [index](index.md). Conventions: [_conventions.md](_conventions.md).

---

## Entry points & data flow

- **Agent self-view** — `getAgentPerformanceSummary(period, from?, to?)` → RPC `get_agent_performance`
  (reads `auth.uid()`, no scope params). ONE round trip returns core-four + previous period + effort +
  outcomes + team benchmarks.
- **Agent pulse (today)** — `getAgentTodayPulse(...)` → RPC `get_agent_today_pulse`; the IST day boundary
  is passed in as an IST-midnight instant from `lib/utils/ist.ts`.
- **Manager roster** — `getAgentRosterPerformance(domain, from, to)` → RPC; the manager is pinned to their
  own domain in SQL. Admin/founder pass `domain: null`.
- **Domain health** — `getDomainHealthMetrics(domain)` → RPC `get_domain_health_cards`.
- **Drill modals (Phase 5)** — `DrillModalShell` is the reusable keyset-pagination frame:
  - `AgentCallsDrillModal` — keyset over `lead_notes WHERE call_outcome IS NOT NULL`, composite cursor `(created_at, id)`.
  - `AgentLeadsDrillModal` / `AgentDealsDrillModal` — reuse `getLeadsByRole` / `getDealsByRole` with `filters.agent_id`.

---

## Canonical helpers

- `getPeriodDateRange(period)` and the IST module (`lib/utils/ist.ts`) — never re-implement IST math inline.
- Rate math (touch rate, conversion, response time) + null-vs-zero semantics live in the service mappers.

---

## Invariants / gotchas

- **Aggregation lives in SQL** (audit D-2). Self-view is one RPC; manager roster is one pre-aggregated row
  per agent. Never reintroduce per-metric queries that ship cohort rows to Node and `.filter().length`.
- **No Redis caching** — the `perf:*` namespace never existed in code (stale doc, corrected 2026-06-11); always live.
- **IST boundary is passed in, not re-forked** — `getAgentTodayPulse` receives an IST-midnight instant.
- **Drill cursor is composite** `(created_at, id)` to handle nullable sort columns without dropping null rows.
- **Manager domain pinning is enforced at the RPC level**, not just in the client.

---

## File map

| File | Role |
|---|---|
| `src/lib/services/performance-service.ts` | RPC wrappers, period math, React `cache()` dedup |
| `src/lib/actions/performance.ts` | Schema + auth guard; detail/roster/pulse/drill dispatch |
| `src/lib/utils/ist.ts` | THE canonical IST boundary math |
| `src/components/performance/AgentPerformanceShell.tsx` | Agent page shell, tabs, drill stack |
| `src/components/performance/ManagerPerformancePanel.tsx` | Manager roster + drill entry |
| `src/app/(dashboard)/performance/FounderPerformanceShell.tsx` | Founder cross-domain deck (colocated with the route) |
| `src/components/performance/DomainOverviewPanel.tsx` | Founder per-domain overview cards |
| `src/components/performance/DomainTargetMeter.tsx` | Domain deals-closed target meter |
| `src/components/performance/DrillModalShell.tsx` | Reusable keyset-pagination drill frame |
| `src/components/performance/AgentCallsDrillModal.tsx` | Calls drill (keyset over `lead_notes`) |
| `src/components/performance/AgentLeadsDrillModal.tsx` | Leads drill (agent-scoped `getLeadsByRole`) |
| `src/components/performance/AgentDealsDrillModal.tsx` | Deals drill (agent-scoped `getDealsByRole`) |
| `src/components/performance/AgentDetailPanel.tsx` | Manager roster drill entry / agent selector |
