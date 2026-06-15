# src/components/performance/ — CLAUDE.md

## Recharts loading rule (perf audit G-3)

`CoreFourGrid`, `CallOutcomeBar`, `DomainOverviewPanel` (which mounts `DomainTargetMeter`), and `AgentCallTrendChart` import Recharts, so
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
| `AgentDetailPanel.tsx` | Manager / founder agent detail: stats, pipeline, outcomes. The four `StatAtom` tiles are tap targets that open the deck's three drill modals (Total Calls→calls, Leads→leads, Won+Revenue→deals); same props the deck passes, fetch-on-open, `drill` state resets on agent switch |
| `StatAtom.tsx` | Single pastel stat tile (`AgentDetailPanel` stats row + `DomainOverviewPanel` health cards). Optional `onClick` → pressable `motion.button` (`.serene-pressable` press-scale + cursor + focus ring, matching the deck's `DeckTile`); absent → original static `motion.div`. **`DomainOverviewPanel` passes no `onClick`, so its tiles stay byte-identical — never add a tap affordance there** |
| `DomainOverviewPanel.tsx` | Founder Domains tab — 4 stats per domain (incl. Deals Closed) + month-pinned `DomainTargetMeter` + founder/admin inline target edit (`upsertDomainTargetAction`); mobile = CSS scroll-snap carousel (no library) |
| `DomainTargetMeter.tsx` | Radial deals-vs-target meter (Recharts `RadialBarChart`, 2 colours via `useChartTokens`); target null/0 → `EmptyState` inline "No target set." — never a division |
| `AgentCallTrendChart.tsx` | 14-day daily-calls area chart — composes `ChartFrame` + `cartesianDefaults` (Cartesian frame rule); loaded via `next/dynamic` from the shell |
| `AgentRecentActivityList.tsx` | Agent Today view — keyset "load more" (composite cursor, page 15, button not infinite scroll) via `getAgentRecentLeadActivityAction` |
| `DrillModalShell.tsx` | THE nested-modal shell for the founder deck drill-downs — `document.body` portal + `--z-modal-overlay`/`--z-modal-nested` (stacks ABOVE the deck's `--z-modal` full `Dialog`). A vanilla `<Dialog>` hardcodes `--z-overlay`/`--z-modal` and would render co-planar with the deck, so the three drill modals share this thin shell instead. Display-only chrome; caller owns body + fetch |
| `AgentCallsDrillModal.tsx` | "Recent calls" drill-down — fetch-on-open, keyset load-more via `getAgentCallsForManagerAction`. **Count contract:** title is the literal "Recent calls"; subtitle is `items.length` / "showing N most recent" — NEVER the card's `totalCallsMade`. One row per call (the source query is `lead_notes WHERE call_outcome IS NOT NULL`, so no `note_added` duplicates) |
| `AgentLeadsDrillModal.tsx` | Agent's assigned leads — fetch-on-open, page load-more via `getAgentLeadsScopedAction` (existing `getLeadsByRole` path, `filters.agent_id`) |
| `AgentDealsDrillModal.tsx` | Agent's won deals — fetch-on-open, page load-more via `getAgentDealsScopedAction` (existing `getDealsByRole` path, `filters.agent_id`) |

**The three drill modals have TWO mount sites (2026-06-15):** `FounderDrillDownDeck` (deck tiles) **and** `AgentDetailPanel` (the four `StatAtom` tiles). Both pass the identical `{ open, agentId, agentName, domain, onClose }` props — keep the prop contract stable so both stay in lockstep. Never fork a per-surface copy (R-01).

(`FounderDrillDownDeck.tsx` lives in `src/app/(dashboard)/performance/` — see the deck section below. The generic `Carousel` primitive it composes is `src/components/ui/Carousel.tsx`.)

---

## Founder drill-down deck (Phase 5)

`src/app/(dashboard)/performance/FounderDrillDownDeck.tsx` — full-screen swipeable per-agent
card deck, mounted from `ManagerPerformancePanel` on the **founder/admin `allDomains` path only**
(a "Deck view" trigger; `next/dynamic`, `ssr:false` — Heavy-modal rule). It is a `Dialog size="full"`
(which opts OUT of the `<md` bottom-sheet) wrapping the generic `<Carousel>` (`ui/Carousel.tsx`).

**Zero per-swipe fetch (invariant).** Each slide is a `DeckAgentCard` rendering ONLY in-memory
`AgentRosterRow` fields (the roster array `ManagerPerformancePanel` already holds — the deck is
passed `visibleAgents`, respecting the client-side domain filter). Swiping changes the controlled
`index` and fires NO network request. **Never** add a fetch keyed on the active card.

**`AgentRosterRow` has no `totalCallsMade`** — so the card's "Total Calls" tile is a **label-only**
tap target ("View"), never a number. Showing a real call count would require a per-agent fetch and
break the zero-per-swipe-fetch rule. The call COUNT exists only inside the Recent-calls modal
(`items.length`), never on the card — this is the structural side of the count contract.

**Tapping a tile** opens one of the three drill modals via `DrillModalShell` (nested z above the
deck). Modals fetch ON OPEN only. The `domain` passed to the modals/actions is the deck's active
domain filter (null for the all-domains view) — the action's manager-domain guard re-validates it.

**Authz:** all four drill actions go through `assertDrillAccess` in `actions/performance.ts`, which
mirrors `getAgentDetailMetricsAction` exactly — `requireProfile(['manager','admin','founder'])` then
a manager must pass `domain === caller.domain`. Leads/deals reuse `getLeadsByRole`/`getDealsByRole`
with `filters.agent_id` (no new service query); calls use `getAgentCallsPageForManager` (the only new
read fn — `lead_notes` for phone+outcome+note fidelity). Deck trigger is founder-only to avoid the
manager domain-pass ambiguity.

---

## AgentPerformanceShell — the ONE pulse fetch (Today tab + Overview strip)

`AgentPerformanceShell` fetches the Today pulse (`getAgentPulseAction` → `get_agent_today_pulse`,
since-IST-midnight) exactly **once** per period/date change, and that single fetch feeds **both**
surfaces:

- the **Today tab** (calls split, 14-day trend, Notes Today hero, period deals), and
- the **Overview "Today" strip** (Calls / Notes / Won "since midnight IST").

The strip MUST read `pulse.callsToday.total` / `pulse.notesToday` / `pulse.deals.dealCount` — the
genuine since-midnight source — **never** the period-scoped `data.effort.*` / `data.core.*` fields
(those are wrong under the "since midnight IST" label when period ≠ today; this was the bug fixed
2026-06-15 / migration 0122 which added `notes_today`).

**Invariant — one pulse fetch path.** The fetch gate is a single boolean (`needsPulse` = Today tab
visible **or** Overview strip visible). To make the strip's data available on the Overview tab you
**widen this boolean** — never add a second `getAgentPulseAction` call. Because one of the two
conditions is always true at the current period, `needsPulse` does not flip on a tab switch, so the
effect does not re-run and **a tab switch fires no new network request**. The fetch stays a plain
`.then()/.catch()` chain with a `cancelled` ref (no `startTransition` — it would defer
`setPulse(null)`). Skeleton-while-`null`/`undefined` on every pulse value.

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

### Tappable stat tiles → shared drill modals (2026-06-15)

The panel's four `StatAtom` tiles open the **same three drill modals the founder deck mounts** —
`AgentCallsDrillModal` / `AgentLeadsDrillModal` / `AgentDealsDrillModal` — with the identical
`{ open, agentId, agentName, domain, onClose }` prop shape, fetch-on-open behaviour, and
`assertDrillAccess` authz. Won **and** Revenue both open the deals modal (deck parity); there is no
fourth modal. **No new modal, action, or query was added** — both surfaces (deck + detail panel)
now share one drill layer (R-01).

- A `DrillKind = 'calls' | 'leads' | 'deals'` + `const [drill, setDrill]` mirror the deck's
  `DrillTarget` state. Tiles set it via `StatAtom onClick`; modals are conditional-mounted
  (`drill === 'calls' && …`) below the panel body.
- **`StatAtom` is opt-in pressable:** the new optional `onClick` prop turns the tile into a
  `motion.button` (`.serene-pressable` + cursor + focus ring); without it the tile is the original
  static `motion.div`. `DomainOverviewPanel`'s four tiles pass no `onClick` and are unchanged.
- **Drill state resets on agent switch** (`setDrill(null)` in the agent-switch branch of the fetch
  effect) so a modal can't carry the prior agent's data — defensive even though `key={agent.id}`
  already remounts on agent change.
- The modals portal to `document.body`, so they stay interactive through the period-refetch dim
  (the panel body sets `pointerEvents:'none'` while `isRefetching`) — close works during and after a
  refetch. They are rendered OUTSIDE that dimmed body div for clarity, but the portal is what
  guarantees it.
