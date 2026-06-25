# Agent `/performance` → lean single-page self-scorecard (2026-06-25)

## Context

The agent self-view has barely changed since Phase 8 (2026-05-28) while
manager/founder/oversight/escalations were modernised heavily over June 2026. It
had accumulated real clutter: a two-tab (Overview / Today) shell with heavy
cross-tab metric duplication, a conceptually muddy "Today strip on Overview", and
**fabricated sparklines** (`makeSpark` interpolated a 6-point curve from just two
numbers — current + previous — so the cards *looked* like trend data but weren't).

Decision (product): make it a **lean, honest self-scorecard** — "how am I doing
this period" — single scroll, no tabs, real trend data only, duplicates cut hard.

## Final layout (one scrollable column)

```
Your Performance.                                       [date range filter]
──────────────────────────────────────────────────────────────────────────
① TODAY · since midnight IST          Calls 12   Notes 30   Won 1
② THIS PERIOD — the honest four        Leads Won · Conversion · Avg Response · Touch Rate
                                       value + delta vs last period + domain benchmark
                                       Leads Won card → REAL daily sparkline; rate cards → none
③ ACTIVITY OVER TIME                   real daily trend (Calls · Notes · Won) for the period
   + pipeline line                     In Discussion N · Nurturing N · Revenue ₹X
④ CALL OUTCOME MIX                     donut + legend (ONCE, display-only)
⑤ RECENT LEAD ACTIVITY                 load-more list → dossier links
   "You've closed 3 leads this month."  ← Elaya footer (kept)
```

## Cut / reframed

- **Overview/Today tab system deleted** — `TodayTab` / `OverviewTab` collapse into one
  column; `needsPulse` / `effectiveTab` / `showOverviewTodayRow` branching removed (the
  pulse is simply fetched once per mount).
- **`CallOutcomeBar` renders once** (was in both tabs).
- **Today-tab pipeline pills removed** (Leads Won / In Discussion / Nurturing / Revenue
  duplicated the KPI + effort blocks). Revenue — the only net-new — folds into ③'s line.
- **`EffortGrid` retired** from the agent view (its only mount). Calls/Notes move into the
  trend chart; In Discussion/Nurturing become the small inline pipeline line.
- **`makeSpark` deleted** — synthetic sparklines gone.

## Real trend (the data-layer addition)

`get_agent_performance_trend(p_date_from, p_date_to)` — self-scoped (`auth.uid()`),
`GRANT authenticated` (the `get_agent_today_pulse` 0108 posture, not the revoked tier).
Returns a daily IST series `[{ day, leads_won, calls, notes }]` over the selected period
via `generate_series`. Additive — touches no existing function.

Honest by construction: **count** metrics (leads won, calls, notes) get real daily series;
**rate** metrics (conversion / touch / response) get *no* sparkline — a daily rate off
0–2 closes is noise. Only the **Leads Won** KPI card carries a real sparkline.

`period === 'today'` → the daily series is one point, so ③ falls back to the pulse's
existing 14-day call trend (data already fetched; zero waste).

## File-by-file

| File | Change |
|---|---|
| `supabase/migrations/20260625000146_agent_performance_trend.sql` | **new** self-scoped trend RPC |
| `src/lib/services/performance-service.ts` | +`AgentTrendPoint` type, +`getAgentPerformanceTrend()` (React `cache()`, `mapRows`, `Number()`) |
| `src/app/(dashboard)/performance/page.tsx` | `AgentPerformanceAsync` fetches trend in parallel with the summary; passes `trend` prop |
| `src/components/performance/AgentPerformanceShell.tsx` | rewrite: single column, tabs removed, pulse fetched once, pipeline line + trend |
| `src/components/performance/CoreFourGrid.tsx` | delete `makeSpark`; sparkline opt-in (`wonTrend` prop) on the Leads Won card only |
| `src/components/performance/AgentCallTrendChart.tsx` → `AgentActivityTrendChart.tsx` | rename + multi-series (Calls/Notes/Won) with single-series 14-day fallback; still composes `ChartFrame`+`cartesianDefaults` |
| `src/components/performance/EffortGrid.tsx` | **deleted** (no other importer) |
| `src/components/admin/usage/UsageHistoryChart.tsx` | comment reference to the renamed chart updated |
| docs / `CLAUDE.md` (perf page + components) | layout + inventory updated |
| `docs/changelog.md` | new entry (Rule 12) |

No new dependency. Manager/founder/admin branches untouched. `get_agent_performance` and
`get_agent_today_pulse` untouched. Donut stays **display-only** (lean self-scorecard, not
the actionable-cockpit drill direction — no new agent-side gated action).

## Rollout / caveats

1. Apply `…146` (`supabase migration up`) → regenerate `database.ts`, or keep the interim
   `(supabase as any).rpc` cast (house convention until regen).
2. `pnpm typecheck` + `pnpm lint`.
3. Manual: agent login across range presets (today/week/month/custom); reduced-motion;
   a non-Earth theme (token check); mobile.
4. `graphify update .`.
5. **Migration-ledger drift:** many migrations are "NOT yet applied to prod" (Docker-down
   history), incl. `get_agent_today_pulse` (0108/0122) which the Today strip + 'today'
   fallback depend on. `…146` is additive + self-scoped (low risk) but must be explicitly
   applied; the `as any` cast stands until `database.ts` regen.
