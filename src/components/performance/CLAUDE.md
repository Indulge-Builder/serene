# src/components/performance/ — CLAUDE.md

## Recharts loading rule (perf audit G-3)

`CoreFourGrid`, `CallOutcomeBar`, and `DomainOverviewPanel` import Recharts, so
their call sites (`AgentPerformanceShell`, `AgentDetailPanel`,
`FounderPerformanceShell`) load them via `next/dynamic` with same-shape
`.skeleton` placeholders — the chart chunk stays out of the `/performance`
initial bundle. Import these three statically only from another lazy chunk.

## Component inventory

| File | Role |
| --- | --- |
| `PerformanceFilters.tsx` | Unified period + custom date filter bar |
| `CoreFourGrid.tsx` | Agent KPI row (leads, calls, conversion, response time) |
| `EffortGrid.tsx` | Agent effort metric cards |
| `CallOutcomeBar.tsx` | Donut + legend (agent self-view and detail panel) |
| `ManagerPerformancePanel.tsx` | Two-column shell — roster left, detail right |
| `AgentDetailPanel.tsx` | Manager / founder agent detail: stats, pipeline, outcomes |

---

## AgentDetailPanel — fetch pattern

`AgentDetailPanel` always fetches on mount via `getAgentDetailMetricsAction`. There is no
server-side seed prefetch — `ManagerPerformanceAsync` fetches only the roster, and the panel
fetches its own detail data client-side after mounting.

### `isLoading` state — not `useTransition`

The fetch block uses a plain Promise `.then()/.catch()` chain with a `cancelled` ref.
`startTransition(async fn)` is **banned** in this module — it defers `setMetrics(null)` inside
React's transition batch, which causes the skeleton to never appear on re-fetch.

```ts
// ✅ Correct
let cancelled = false;
setMetrics(null);
setError(null);
setIsLoading(true);
getAgentDetailMetricsAction(...)
  .then((result) => { if (cancelled) return; setIsLoading(false); ... })
  .catch(() => { if (cancelled) return; setIsLoading(false); ... });
return () => { cancelled = true; };

// ✗ Wrong — never use in this component
startTransition(async () => { ... });
```

`isLoading` initialises to `true` so the skeleton renders on first paint without a micro-flash
before the effect fires.

The container `opacity` dims to 0.55 only when `isLoading && !!metrics` — i.e., re-loading
over existing data (e.g. custom date change on the same agent). For initial loads the skeleton
carries the perceived loading signal at full opacity.

### Component remount contract

`AgentDetailPanel` remounts cleanly on agent change (`key={selectedAgent.id}` in
`ManagerPerformancePanel`) and on period change (`key={period}` on `ManagerPerformancePanel`
in `ManagerPerformanceAsync`). Each remount runs a fresh fetch with the new props. The
`cancelled` flag in the effect cleanup handles in-flight requests from the previous mount.
