# src/components/performance/ — CLAUDE.md

## Recharts loading rule (perf audit G-3)

`CoreFourGrid`, `CallOutcomeBar`, `DomainOverviewPanel` (which mounts `DomainTargetMeter`), and `AgentCallTrendChart` import Recharts, so
their call sites (`AgentPerformanceShell`, `AgentDetailPanel`,
`FounderPerformanceShell`, `FounderDrillDownDeck`) load them via `next/dynamic` with same-shape
`.skeleton` placeholders — the chart chunk stays out of the `/performance`
initial bundle. Import these three statically only from another lazy chunk.
`PipelineBar` (the status-mode breakdown) is pure divs — no Recharts — so it imports statically.

## Component inventory

| File | Role |
| --- | --- |
| `PerformanceFilters.tsx` | THE shared filter bar for ALL performance roles (and `/budget`). Composes `<FilterBar dateRange>` (Range presets + custom Dates, `date_from`/`date_to` — the `/leads` contract) + `useUrlFilters`; props are just `{ showSearch }`. No bespoke Period dropdown / DatePicker. The page derives `PerformancePeriod` from the params via `resolvePerformanceDateParams` |
| `CoreFourGrid.tsx` | Agent KPI row (leads, calls, conversion, response time) |
| `EffortGrid.tsx` | Agent effort metric cards |
| `CallOutcomeBar.tsx` | Donut + legend (agent self-view, detail panel, AND the deck card's "Call outcome" breakdown mode). Optional `onSliceClick(outcome)` (2026-06-24) turns each legend row into a tap target opening `AgentLeadsPredicateDrillModal` (distinct leads whose LATEST call was that outcome); absent → display-only. Loaded via `next/dynamic` from each Recharts call site (perf G-3) |
| `PipelineBar.tsx` | THE segmented lead-status breakdown bar + compact legend chips. **Extracted from `AgentDetailPanel`'s former private `PipelineSection`** (2026-06-15) so the detail-panel "Lead Pipeline" section AND the deck card's "Lead status" breakdown mode render an identical bar — never copy-paste a second status chart (R-01). Owns its own `STATUS_FILL`/`STATUS_ORDER`; takes `{ status, count }[]`. Optional `onSegmentClick(status)` (2026-06-24) turns each segment + legend chip into a tap target opening `AgentLeadsPredicateDrillModal`; absent → display-only. Display-only otherwise (A-06), no Recharts (pure divs, so it needs no lazy split) |
| `ManagerPerformancePanel.tsx` | Two-column shell — roster left, detail right |
| `AgentDetailPanel.tsx` | Manager / founder agent detail: stats, pipeline, outcomes. The four `StatAtom` tiles are tap targets that open the deck's three drill modals (Total Calls→calls, Leads→leads, Won+Revenue→deals); same props the deck passes, fetch-on-open, `drill` state resets on agent switch |
| `StatAtom.tsx` | Single pastel stat tile (`AgentDetailPanel` stats row + `DomainOverviewPanel` health cards). Optional `onClick` → pressable `motion.button` (`.serene-pressable` press-scale + cursor + focus ring, matching the deck's `DeckTile`); absent → original static `motion.div`. **BOTH mount sites now pass `onClick`** — `AgentDetailPanel`'s four tiles open the agent drill modals; `DomainOverviewPanel`'s four tiles open `DomainLeadsDrillModal` (2026-06-24). A static (no-`onClick`) consumer still renders the byte-identical `motion.div`. |
| `FirstTouchScorecard.tsx` | Display-only (A-06) first-touch SPEED card below `CallOutcomeBar` in `AgentDetailPanel`. Buckets the period cohort by how fast each lead's first call note arrived, in BUSINESS minutes per the agent's shift (`< 15m / 15–30m / ≤ 1h / 1–3h / 3h+`, `FIRST_TOUCH_BUCKETS` in `lib/constants/performance.ts`). **Five labeled horizontal-bar rows (2026-06-20)** — one row per bucket (all five always shown, zeros dimmed): label column + a proportional fill bar **scaled to the peak bucket** (tallest bar fills its row → the distribution shape reads at a glance) + `count · pct`; bars animate width in. (Replaced the old single thin segmented line + chip legend, which was unreadable.) Takes the resolved `FirstTouchScorecard` data — all math is server-side (`getAgentFirstTouchScorecard`, React `cache()`, `businessMinutesBetween`); untouched cohort leads (no call yet) shown as a footnote, never a bucket. **Bars drill to their leads (2026-06-24):** the optional `onBucketClick(bucketId)` prop turns each non-empty bar into a `.serene-pressable` tap target that opens `AgentFirstTouchDrillModal` (the leads behind that bucket's count, for the same agent/period). Absent → bars stay display-only (backward-safe). Both mount sites wire it. **TWO mount sites (2026-06-16):** `AgentDetailPanel` (below `CallOutcomeBar`) AND the `FounderDrillDownDeck` card (below the breakdown toggle). On the deck it is a **gated lazy read** — fetched in the same per-agent `Promise.all` as the breakdown, cached per agent, best-effort (its `getAgentFirstTouchScorecardAction` failure → card omits it, breakdown still renders). This does NOT break the deck's zero-per-swipe-fetch rule: that rule governs the **tiles** (in-memory roster fields only); the scorecard, like the breakdown, is a separate once-per-agent fetch |
| `DomainOverviewPanel.tsx` | Founder Domains tab — 4 stats per domain (incl. Deals Closed) + month-pinned `DomainTargetMeter` + founder/admin inline target edit (`upsertDomainTargetAction`); mobile = CSS scroll-snap carousel (no library). The comparative BarChart's Leads/Calls/Revenue toggle is the shared `TabSelector` (variant `accent`, `indicatorLayoutId="domain-metric-toggle"` — distinct from the founder shell's `founder-perf-tabs` pill, which is co-mounted). **The 4 stat tiles are tap targets (2026-06-24):** each passes `StatAtom onClick` → `DomainLeadsDrillModal` (Leads→all · Calls→called · Deals Closed/Revenue→won leads); ONE modal at the panel level, drill state in the panel, mirrors `AgentDetailPanel` |
| `DomainLeadsDrillModal.tsx` | The leads behind ONE clicked DOMAIN-card tile (Domains tab, 2026-06-24) — a thin caller of `LeadDrillModal` supplying `getDomainLeadsDrillAction`. `kind: 'all' \| 'calls' \| 'won'` maps the tile to the slice; domain-scoped (no agent). Rows link to the dossier — the domain twin of `AgentLeadsPredicateDrillModal`. No fetch lifecycle/row/chrome of its own. **Per-kind `renderMeta` (the row's calm secondary line):** `all` → assignee chip (`xs` `Avatar` initials + name, "Unassigned" italic-tertiary when null); `calls` → last call outcome (quiet `PhoneCall` glyph + `CALL_OUTCOME_LABELS`); `won` → none (the Won status pill carries it). Token-only, no accent pill — the status pill stays the row's single coloured element |
| `DomainTargetMeter.tsx` | Radial deals-vs-target meter (Recharts `RadialBarChart`, 2 colours via `useChartTokens`); target null/0 → `EmptyState` inline "No target set." — never a division |
| `AgentCallTrendChart.tsx` | 14-day daily-calls area chart — composes `ChartFrame` + `cartesianDefaults` (Cartesian frame rule); loaded via `next/dynamic` from the shell |
| `AgentRecentActivityList.tsx` | Agent Today view — keyset "load more" (composite cursor, page 15, button not infinite scroll) via `getAgentRecentLeadActivityAction` |
| `DrillModalShell.tsx` | THE nested-modal shell for the founder deck drill-downs — `document.body` portal + `--z-modal-overlay`/`--z-modal-nested` (stacks ABOVE the deck's `--z-modal` full `Dialog`). A vanilla `<Dialog>` hardcodes `--z-overlay`/`--z-modal` and would render co-planar with the deck, so the four drill modals share this thin shell instead. Display-only chrome; caller owns body + fetch |
| `LeadDrillRow.tsx` | THE single lead row (name + phone + status pill) for the performance drill-down modals. Extracted from `AgentLeadsDrillModal` (2026-06-24) so the First-Touch bucket drill renders an identical row — never copy-paste a second drill lead row (R-01). The whole row is a `Link` to `/leads/${slug ?? id}?from=/performance` (the LeadsTable nav convention; the route change unmounts the portaled modal, dossier back-arrow returns to `/performance`) — both drill modals get the click-through for free. `.serene-pressable` hover/press. **Optional `meta?: ReactNode`** (2026-06-24) — a calm secondary line below name/phone the CALLER supplies (the domain Calls drill renders the last call outcome, the Leads drill renders the assignee chip); omitted → byte-identical original row, so every existing caller is unchanged |
| `LeadDrillModal.tsx` | THE generic fetch-on-open lead-list drill (flat, bounded, no load-more — one agent × one slice is a small set). Caller supplies `title` + `fetcher` + `fetchKey` (re-fetch on slice change) + optional **`renderMeta?: (lead) => ReactNode`** (threaded to `LeadDrillRow.meta` per row); renders `Spinner → LeadDrillRow list → EmptyState`, composes `DrillModalShell`. Every chart/metric flat-list drill is just a different fetcher (R-01 — one modal, one row, one fetch lifecycle). Fetch-on-open only |
| `AgentFirstTouchDrillModal.tsx` | The leads behind ONE clicked First-Touch Speed bar — a thin caller of `LeadDrillModal` supplying `getFirstTouchBucketLeadsAction` (reuses the scorecard's own bucket classification, so the list length equals the bar's count). No fetch lifecycle/row/chrome of its own. TWO mount sites (`AgentDetailPanel` + `FounderDrillDownDeck`), same `assertDrillAccess` authz |
| `AgentLeadsPredicateDrillModal.tsx` | The leads behind ONE clicked Lead-Pipeline segment OR Call-Outcome slice (2026-06-24) — a thin caller of `LeadDrillModal` supplying `getAgentLeadsByPredicateAction`. `predicate` is a `{ kind: 'status' \| 'outcome' }` discriminated union, so one modal serves BOTH chart drills (R-01). Outcome = distinct leads whose latest call was that outcome (subtitle says "leads", never donut-event parity). TWO mount sites (`AgentDetailPanel` + `FounderDrillDownDeck`) |
| `AgentCallsDrillModal.tsx` | "Recent calls" drill-down — fetch-on-open, keyset load-more via `getAgentCallsForManagerAction`. **Count contract:** title is the literal "Recent calls"; subtitle is `items.length` / "showing N most recent" — NEVER the card's `totalCallsMade`. One row per call (the source query is `lead_notes WHERE call_outcome IS NOT NULL`, so no `note_added` duplicates) |
| `AgentLeadsDrillModal.tsx` | Agent's assigned leads — fetch-on-open, page load-more via `getAgentLeadsScopedAction` (existing `getLeadsByRole` path, `filters.agent_id`) |
| `AgentDealsDrillModal.tsx` | Agent's won deals — fetch-on-open, page load-more via `getAgentDealsScopedAction` (existing `getDealsByRole` path, `filters.agent_id`) |

**The three drill modals have TWO mount sites (2026-06-15):** `FounderDrillDownDeck` (deck tiles) **and** `AgentDetailPanel` (the four `StatAtom` tiles). Both pass the identical `{ open, agentId, agentName, domain, onClose }` props — keep the prop contract stable so both stay in lockstep. Never fork a per-surface copy (R-01).

(`FounderDrillDownDeck.tsx` lives in `src/app/(dashboard)/performance/` — see the deck section below. The generic `Carousel` primitive it composes is `src/components/ui/Carousel.tsx`.)

---

## Founder drill-down deck (Phase 5)

`src/app/(dashboard)/performance/FounderDrillDownDeck.tsx` — full-screen swipeable per-agent
card deck, mounted from `ManagerPerformancePanel` on the **founder/admin `allDomains` path only**
(`next/dynamic`, `ssr:false` — Heavy-modal rule). It is a `Dialog size="full"`
(which opts OUT of the `<md` bottom-sheet) wrapping the generic `<Carousel>` (`ui/Carousel.tsx`).

**Mobile = the GENUINE view (2026-06-15; flash fix 2026-06-20).** Desktop/tablet behaviour is
unchanged — the deck stays a trigger-driven overlay opened from the "Deck view" button, layered over
the roster/detail list. On a **phone** (`isMobileDeck = useMediaQuery(MQ.mobile) && allDomains`),
`ManagerPerformancePanel` takes an **early-return branch that renders the deck ONLY** — the two-column
list is never in the tree. The deck auto-opens once per mount via an `autoOpenedDeck` ref latch (a
manual close is respected — the latch never reopens it); a **closed** deck shows a calm inline
"Open agent deck" prompt (`EmptyState` + reopen button), **never** the list. The founder shell also
suppresses the hoisted "Deck view" trigger on mobile (the tab row is just the full-width tabs there).

**Why deck-only, not auto-open-an-overlay (the 2026-06-20 fix):** `useMediaQuery` is `false` on SSR +
first client paint, so the old "auto-open a `Dialog` over the list" approach painted the list, then
hydration flipped `isMobile → true` and the deck **slammed over the already-painted list** (the visible
list→deck shift). Not rendering the list on mobile at all removes the slam — the deck *replaces* the
list. The residual one-frame pre-hydration list paint is the same `useMediaQuery` hydration window the
whole app accepts; the deck is `ssr:false` so a pure-CSS swap isn't possible. **Never** revert to
auto-opening the deck as an overlay on top of a rendered mobile list. **Never** auto-open on
desktop/tablet, and never auto-open for managers (the branch is gated on `allDomains`).

**Card layout — avatar + 2×2 scorecards (2026-06-20).** The active agent's **name + domain** live in
the Dialog **title bar** (name in the serif page-title style, domain as the subtitle — the card body
no longer repeats an identity block). `DeckAgentCard` leads with the **avatar on the left + a
`grid grid-cols-2` of four tap targets on the right**: **Recent calls · Leads · Won · Revenue**. The
left column is a `stretch` flex column with the avatar **vertically centered** (`justify-content:
center`) so the space above/below it stays balanced against the taller grid. The breakdown toggle
(Call outcome / Lead status) is a
**full-width** tray (`display: flex; width: 100%`, each tab `flex: 1`) — never the content-sized
`inline-flex` (it read as cramped on mobile). The
**Won** tile (`agent.leadsWon`, `formatCount`) is the fourth, re-added 2026-06-20 (it was dropped to
3 tiles on 2026-06-15); Revenue stays the compact `formatCurrencyCompact` ₹k/L amount. Tiles render
ONLY in-memory `AgentRosterRow` fields (zero per-swipe fetch for the tiles). Tap behaviour: Recent
calls→`calls`, Leads→`leads`, Won→`deals`, Revenue→`deals`. Below the scorecards: the toggleable
breakdown, then the First-Touch graph.

**`AgentRosterRow` has no `totalCallsMade`** — so the card's "Recent calls" tile is a **label-only**
tap target ("View"), never a number. The call COUNT exists only inside the Recent-calls modal
(`items.length`), never on the card — this is the structural side of the count contract.

**Leads tile ⇄ drill-modal consistency (2026-06-20).** The Leads tile shows `agent.totalLeads` — a
**period-scoped** count (roster RPC counts `leads.created_at` in the active range). The
`AgentLeadsDrillModal` it opens is passed the deck's `period/customFrom/customTo` so
`getAgentLeadsScopedAction` filters `created_at` on the SAME window — the front number and the opened
total agree. Never drop the period props from the leads-modal mount (the deck AND `AgentDetailPanel`
both pass them); a null period reverts to the old all-time list and re-opens the inconsistency.

**Tapping a tile** opens one of the three drill modals (the deck reuses `AgentCallsDrillModal` /
`AgentLeadsDrillModal` / `AgentDealsDrillModal` directly, which portal above the full Dialog via the
nested-modal z contract). Modals fetch ON OPEN only. The `domain` passed to the modals/actions is the
deck's active domain filter (null for the all-domains view) — the action's manager-domain guard
re-validates it.

**Toggleable breakdown — lazy, once per card (2026-06-15).** Below the tiles each card carries a
breakdown chart with a deck-level mode toggle: **Call outcome** (reuses `CallOutcomeBar` — the
same donut, via `next/dynamic`) ↔ **Lead status** (reuses the extracted `PipelineBar`). Both modes
are fed by **one** `getAgentDetailMetricsAction` call (`callOutcomeBreakdown` + `pipelineBreakdown`
— **no new RPC**), fetched LAZILY the first time a card becomes active and cached per agent in a
deck-level `breakdowns` state map keyed by agent id. A `requested` ref-Set gates the fetch so it
fires **exactly once per agent** across swipes and re-renders (the cache map alone would re-enter
between request and `setState`). A period/date/domain change clears both the cache and the guard so
the active card refetches against the new range; cards never seen never fetch. The mode toggle is
shared across the deck (flipping it on one card carries to the next). The tile-level
zero-per-swipe-fetch rule is intact; the breakdown is a separate, gated, cached read.

**First-Touch Speed on the deck (2026-06-16).** Below the breakdown each card also renders
`FirstTouchScorecard` (deck parity with the desktop panel's order). It rides the SAME per-agent lazy
fetch — `getAgentFirstTouchScorecardAction` runs in the breakdown effect's `Promise.all` and its
result is folded into the cached `breakdowns[agentId]` ready state (`scorecard: … | null`). The
breakdown drives the error state; the scorecard is best-effort (null → the card simply omits it).
Still once per agent, still cached — the two gated reads share one settle.

**Authz:** all four drill actions go through `assertDrillAccess` in `actions/performance.ts`, which
mirrors `getAgentDetailMetricsAction` exactly — `requireProfile(['manager','admin','founder'])` then
a manager must pass `domain === caller.domain`. Leads/deals reuse `getLeadsByRole`/`getDealsByRole`
with `filters.agent_id` (no new service query); calls use `getAgentCallsPageForManager` (the only new
read fn — `lead_notes` for phone+outcome+note fidelity). Deck trigger is founder-only to avoid the
manager domain-pass ambiguity.

---

## AgentPerformanceShell — the ONE pulse fetch (Today tab + Overview strip)

**URL-driven since 2026-06-16.** The shell no longer owns period state or a `PeriodSelector` —
`period`/`customFrom`/`customTo` arrive as **props** derived from the `date_from`/`date_to` URL
params (the shared `PerformanceFilters` bar, rendered by the page above the shell). The page
**key-remounts** the shell per range (`key={period:from:to}`) with server-fetched `initialData`, so
there is **no client metrics refetch effect** — `data = initialData` (one-RPC-per-view, D-2). The
only client fetch left is the Today pulse below; "today" is detected as `period === 'today'`.

`AgentPerformanceShell` fetches the Today pulse (`getAgentPulseAction` → `get_agent_today_pulse`,
since-IST-midnight) exactly **once** per range (remount), and that single fetch feeds **both**
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

`AgentDetailPanel` fetches its metrics + first-touch scorecard on mount (one `Promise.all` of
`getAgentDetailMetricsAction` + `getAgentFirstTouchScorecardAction`). There is no server-side
seed prefetch — `ManagerPerformanceAsync` fetches only the roster.

**Per-slice memory cache (2026-06-24).** A module-level `detailSliceCache` Map keyed by
`agent|domain|period|from|to` holds each fetched `{ metrics, scorecard }` for the session
(the founder-deck `breakdowns` pattern, R-01). The component seeds state synchronously from it
(lazy `useState` init) and the effect returns early on a hit — so a back-nav from a lead
dossier (which restores `?agent=<id>` and remounts the panel) paints instantly, no skeleton, no
round-trip. A miss fetches and writes the whole slice. In-memory only (cleared on full reload);
a period change is a new key, so the cache never serves the wrong window.

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

`isLoading` initialises to `true` **only on a cache miss** (lazy init reads `detailSliceCache`;
a hit seeds `false` + the data), so the skeleton renders on first paint without a micro-flash
on a genuine load, while a cached slice paints instantly with no skeleton at all.

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
- **`StatAtom` is opt-in pressable:** the optional `onClick` prop turns the tile into a
  `motion.button` (`.serene-pressable` + cursor + focus ring); without it the tile is the original
  static `motion.div`. `DomainOverviewPanel`'s four tiles ALSO pass `onClick` now (2026-06-24) —
  they open `DomainLeadsDrillModal` (the domain-scoped twin of this drill).
- **Drill state resets on agent switch** (`setDrill(null)` in the agent-switch branch of the fetch
  effect) so a modal can't carry the prior agent's data — defensive even though `key={agent.id}`
  already remounts on agent change.
- The modals portal to `document.body`, so they stay interactive through the period-refetch dim
  (the panel body sets `pointerEvents:'none'` while `isRefetching`) — close works during and after a
  refetch. They are rendered OUTSIDE that dimmed body div for clarity, but the portal is what
  guarantees it.
