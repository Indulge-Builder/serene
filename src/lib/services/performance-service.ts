// Performance page queries — single responsibility.
// Never add performance queries to leads-service.ts or dashboard-service.ts.
//
// Aggregation lives in SQL (perf audit D-2, migration 0101): the agent
// self-view is ONE get_agent_performance RPC round trip (core four + previous
// period + effort + outcomes + team benchmarks), and the manager/founder
// roster is ONE get_agent_roster_performance RPC returning a pre-aggregated
// row per agent. Never reintroduce per-metric queries that ship cohort lead
// rows to Node and aggregate with .filter().length — transfer must scale with
// the answer size, not the lead count.

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { mapRows } from "@/lib/utils/rows";
import {
  toISTMidnight,
  toISTEndOfDay,
  getISTMondayStart,
  getISTMonthStart,
  getISTPrevMonthRange,
} from "@/lib/utils/ist";
import type { AppDomain, CallOutcome } from "@/lib/types/database";
import type { AgentRosterRow, AgentDetailMetrics, DomainHealthCard } from "@/lib/types/index";

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type PerformancePeriod =
  | "today"
  | "this_week"
  | "this_month"
  | "last_month"
  | "all_time"
  | "custom";

export type DateRange = {
  from: string;
  to: string;
};

export type CoreFourMetrics = {
  leadsWon: number;
  touchRate: number | null;
  avgResponseTimeMinutes: number | null;
  conversionRate: number | null;
};

export type EffortMetrics = {
  callsLogged: number;
  notesWritten: number;
  inDiscussionCount: number;
  nurturingCount: number;
};

export type OutcomeBreakdownItem = {
  outcome: CallOutcome;
  count: number;
};

export type TeamBenchmarks = {
  avgTouchRate: number | null;
  avgConversionRate: number | null;
  avgResponseTimeMinutes: number | null;
  agentCount: number;
};

// ─────────────────────────────────────────────
// Pure utility — no DB call
// (IST boundary math lives in lib/utils/ist.ts — never re-fork it here)
// ─────────────────────────────────────────────

export function getPeriodDateRange(period: PerformancePeriod): DateRange {
  const now = new Date();

  switch (period) {
    case "today": {
      const from = toISTMidnight(now);
      return { from: from.toISOString(), to: now.toISOString() };
    }

    case "this_week": {
      const from = getISTMondayStart(now);
      return { from: from.toISOString(), to: now.toISOString() };
    }

    case "this_month": {
      const fromUtc = getISTMonthStart(now);
      return { from: fromUtc.toISOString(), to: now.toISOString() };
    }

    case "last_month": {
      const { from, to } = getISTPrevMonthRange(now);
      return { from: from.toISOString(), to: to.toISOString() };
    }

    case "all_time":
      return { from: "2024-01-01T00:00:00Z", to: now.toISOString() };

    case "custom":
      // Custom dates are passed directly by the caller — this case is a safe fallback
      // for any code path that calls getPeriodDateRange without custom date params.
      return getPeriodDateRange("this_month");
  }
}

/**
 * Returns the date range immediately preceding the given period (same length).
 * Returns null for 'all_time' — there is no meaningful prior period to compare.
 */
export function getPreviousPeriodDateRange(
  period: PerformancePeriod,
): DateRange | null {
  const now = new Date();

  switch (period) {
    case "today": {
      // Yesterday IST
      const todayStart = toISTMidnight(now);
      const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayEnd = new Date(todayStart.getTime() - 1);
      return { from: yesterdayStart.toISOString(), to: yesterdayEnd.toISOString() };
    }

    case "this_week": {
      const thisMonday = getISTMondayStart(now);
      const prevMonday = new Date(
        thisMonday.getTime() - 7 * 24 * 60 * 60 * 1000,
      );
      const prevSunday = new Date(thisMonday.getTime() - 1);
      return {
        from: prevMonday.toISOString(),
        to: toISTEndOfDay(prevSunday).toISOString(),
      };
    }

    case "this_month": {
      // last_month range IS the previous period for this_month
      return getPeriodDateRange("last_month");
    }

    case "last_month": {
      // Two months ago = the month before the previous month.
      // getISTPrevMonthRange composes: prev.from sits inside the previous
      // month, so applying it again yields the month before that.
      const prev = getISTPrevMonthRange(now);
      const { from, to } = getISTPrevMonthRange(prev.from);
      return { from: from.toISOString(), to: to.toISOString() };
    }

    case "all_time":
    case "custom":
      // No meaningful previous period exists for these cases.
      return null;
  }
}

// ─────────────────────────────────────────────
// Agent self-view — single RPC round trip (perf audit D-2)
//
// get_agent_performance (migration 0101) is SELF-SCOPED: the agent is always
// auth.uid() and the benchmark domain is always get_user_domain() inside the
// function — no caller-supplied identity, so an agent can never read another
// agent's metrics through it. Rate math (touched/total, won/closed) stays
// here so the null-vs-zero contract lives in one visible place.
//
// Benchmarks note: SECURITY DEFINER computes TRUE domain-wide averages. The
// previous session-client implementation was silently reduced by leads RLS to
// the calling agent's own rows — the "team benchmark" was never the team's.
// ─────────────────────────────────────────────

export type AgentPerformanceSummary = {
  core:       CoreFourMetrics;
  previous:   CoreFourMetrics | null;
  effort:     EffortMetrics;
  outcomes:   OutcomeBreakdownItem[];
  benchmarks: TeamBenchmarks;
};

/** Raw core-metrics jsonb shape returned by _agent_core_metrics (migration 0101). */
type AgentCoreJson = {
  leads_won?:            number | string | null;
  touch_total?:          number | string | null;
  touch_touched?:        number | string | null;
  won_count?:            number | string | null;
  lost_count?:           number | string | null;
  avg_response_minutes?: number | string | null;
};

function mapCoreMetrics(j: AgentCoreJson | null | undefined): CoreFourMetrics {
  const total   = Number(j?.touch_total ?? 0);
  const touched = Number(j?.touch_touched ?? 0);
  const won     = Number(j?.won_count ?? 0);
  const lost    = Number(j?.lost_count ?? 0);
  const closed  = won + lost;
  return {
    leadsWon:               Number(j?.leads_won ?? 0),
    touchRate:              total > 0 ? (touched / total) * 100 : null,
    avgResponseTimeMinutes: j?.avg_response_minutes == null ? null : Number(j.avg_response_minutes),
    conversionRate:         closed > 0 ? (won / closed) * 100 : null,
  };
}

function emptySummary(): AgentPerformanceSummary {
  return {
    core:       mapCoreMetrics(null),
    previous:   null,
    effort:     { callsLogged: 0, notesWritten: 0, inDiscussionCount: 0, nurturingCount: 0 },
    outcomes:   [],
    benchmarks: { avgTouchRate: null, avgConversionRate: null, avgResponseTimeMinutes: null, agentCount: 0 },
  };
}

/**
 * Everything the agent self-view renders, in one round trip.
 * React cache()-wrapped so the page header/footer and any Async child share
 * a single RPC call within one RSC render pass (A-1 pattern).
 * The previous period is never custom — getPreviousPeriodDateRange returns
 * null for all_time/custom and the RPC then returns previous: null.
 */
export const getAgentPerformanceSummary = cache(async (
  period: PerformancePeriod,
  customFrom?: string,
  customTo?: string,
): Promise<AgentPerformanceSummary> => {
  const supabase = await createClient();
  const range = getPeriodDateRange(period);
  const from = (period === 'custom' && customFrom) ? customFrom : range.from;
  const to   = (period === 'custom' && customTo)   ? customTo   : range.to;
  const prev = getPreviousPeriodDateRange(period);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("get_agent_performance", {
    p_date_from: from,
    p_date_to:   to,
    p_prev_from: prev?.from ?? null,
    p_prev_to:   prev?.to ?? null,
  });

  if (error || !data) {
    console.error("[performance-service] get_agent_performance failed:", error);
    return emptySummary();
  }

  const payload = data as {
    core?:     AgentCoreJson | null;
    previous?: AgentCoreJson | null;
    effort?: {
      calls_logged?:  number | string | null;
      notes_written?: number | string | null;
      in_discussion?: number | string | null;
      nurturing?:     number | string | null;
    } | null;
    outcomes?: { outcome: CallOutcome; count: number | string }[] | null;
    benchmarks?: {
      agent_count?:          number | string | null;
      avg_touch_rate?:       number | string | null;
      avg_conversion_rate?:  number | string | null;
      avg_response_minutes?: number | string | null;
    } | null;
  };

  const effort = payload.effort ?? {};
  const bench  = payload.benchmarks ?? {};
  const agentCount = Number(bench.agent_count ?? 0);

  return {
    core:     mapCoreMetrics(payload.core),
    previous: payload.previous ? mapCoreMetrics(payload.previous) : null,
    effort: {
      callsLogged:       Number(effort.calls_logged  ?? 0),
      notesWritten:      Number(effort.notes_written ?? 0),
      inDiscussionCount: Number(effort.in_discussion ?? 0),
      nurturingCount:    Number(effort.nurturing     ?? 0),
    },
    outcomes: (payload.outcomes ?? []).map((o) => ({
      outcome: o.outcome,
      count:   Number(o.count),
    })),
    // agentCount < 2 → all nulls: a benchmark from one agent is that agent's
    // own data, not a peer group. agentCount reflects the domain roster
    // (active agents per profiles), not period activity — kept from the
    // original implementation; the averages themselves only include agents
    // with period data (SQL-side WHERE total > 0 guards).
    benchmarks: agentCount < 2
      ? { avgTouchRate: null, avgConversionRate: null, avgResponseTimeMinutes: null, agentCount }
      : {
          avgTouchRate:           bench.avg_touch_rate       == null ? null : Number(bench.avg_touch_rate),
          avgConversionRate:      bench.avg_conversion_rate  == null ? null : Number(bench.avg_conversion_rate),
          avgResponseTimeMinutes: bench.avg_response_minutes == null ? null : Number(bench.avg_response_minutes),
          agentCount,
        },
  };
});

// ─────────────────────────────────────────────
// Team Benchmarks — computed inside get_agent_performance (migration 0101).
//
// ── Averaging method: mean of per-agent means (unweighted) ──────────────────
// All three benchmark metrics average per-agent averages, so each agent counts
// equally regardless of lead volume (a fast low-volume agent isn't buried by a
// slow high-volume one). This is NOT a pool-wide average (total touched /
// total assigned) — it is a design choice, not a bug; the SQL in migration
// 0101 implements exactly this (per-agent CTE rows → AVG over them). If
// weighted averaging is ever desired it must be a new field, not a change.
//
// ── agentCount: roster count, not activity count ────────────────────────────
// agentCount is active agents in the domain per profiles — an agent on leave
// all month still counts in the label. The averages themselves only include
// agents with period data. The < 2 null guard lives in
// getAgentPerformanceSummary above.
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// Agent Roster Performance — one RPC, one pre-aggregated row per agent
// (perf audit D-2, migration 0101). Role-gated in SQL: manager is pinned to
// their own domain via get_user_domain(); admin/founder pass null for all
// domains. Zero-activity agents still get a row (LEFT JOINs in the RPC).
// ─────────────────────────────────────────────

/** Raw row shape returned by get_agent_roster_performance (migration 0101). */
type AgentRosterRpcRow = {
  agent_id:             string;
  agent_name:           string;
  agent_avatar_url:     string | null;
  agent_domain:         AppDomain;
  total_leads:          number | string | null;
  won_count:            number | string | null;
  lost_count:           number | string | null;
  total_deal_amount:    number | string | null;
  avg_response_minutes: number | string | null;
};

export async function getAgentRosterPerformance(
  domain: AppDomain | null,
  dateFrom: string,
  dateTo: string,
): Promise<AgentRosterRow[]> {
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(
    "get_agent_roster_performance",
    {
      p_date_from: dateFrom,
      p_date_to:   dateTo,
      p_domain:    domain,
    },
  );

  if (error || !data) {
    if (error) {
      console.error("[performance-service] get_agent_roster_performance failed:", error);
    }
    return [];
  }

  const rows = mapRows<AgentRosterRpcRow, AgentRosterRow>(data, (row) => {
    const won    = Number(row.won_count  ?? 0);
    const lost   = Number(row.lost_count ?? 0);
    const closed = won + lost;
    return {
      id:              row.agent_id,
      full_name:       row.agent_name,
      avatar_url:      row.agent_avatar_url ?? null,
      domain:          row.agent_domain,
      totalLeads:      Number(row.total_leads ?? 0),
      leadsWon:        won,
      conversionRate:  closed > 0 ? (won / closed) * 100 : null,
      totalDealAmount: Number(row.total_deal_amount ?? 0),
      avgResponseTimeMinutes:
        row.avg_response_minutes == null ? null : Number(row.avg_response_minutes),
    };
  });

  // Sort: top performer first.
  // Primary: leadsWon DESC (null treated as 0 — zero wins, not absent data).
  // Secondary: conversionRate DESC (null → -Infinity so agents with no closed leads
  //   sort below agents with actual conversion data, never to the top).
  rows.sort((a, b) => {
    const wonDiff = (b.leadsWon ?? 0) - (a.leadsWon ?? 0);
    if (wonDiff !== 0) return wonDiff;
    const aRate = a.conversionRate ?? -Infinity;
    const bRate = b.conversionRate ?? -Infinity;
    return bRate - aRate;
  });

  return rows;
}

// ─────────────────────────────────────────────
// Agent Detail Metrics
// All metrics for a single agent in a given date range.
// Single Promise.all internally — never sequential awaits.
// All metrics scoped to dateFrom/dateTo — no IST-today override.
// ─────────────────────────────────────────────

export async function getAgentDetailMetrics(
  agentId: string,
  domain: AppDomain | null,
  dateFrom: string,
  dateTo: string,
): Promise<AgentDetailMetrics> {
  const supabase = await createClient();

  const [
    leadsData,
    wonDealsData,
    allAssignedData,
  ] = await Promise.all([
    // Cohort: leads created in the period — drives totalLeads and pipeline breakdown
    supabase
      .from("leads")
      .select("id, status")
      .eq("assigned_to", agentId)
      .is("archived_at", null)
      .gte("created_at", dateFrom)
      .lte("created_at", dateTo),

    // Won deals closed in the period — from public.deals filtered by won_at.
    // deal_type lives on the deal row directly (no form_data needed).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("deals")
      .select("deal_amount, deal_type")
      .eq("assigned_to", agentId)
      .is("archived_at", null)
      .gte("won_at", dateFrom)
      .lte("won_at", dateTo),

    // Cohort leads with call data — same date filter, drives totalCallsMade and breakdown
    supabase
      .from("leads")
      .select("call_count, last_call_outcome")
      .eq("assigned_to", agentId)
      .is("archived_at", null)
      .gte("created_at", dateFrom)
      .lte("created_at", dateTo),
  ]);

  const leads       = leadsData.data ?? [];
  const wonDeals    = (wonDealsData.data ?? []) as { deal_amount: number; deal_type: string }[];
  const allAssigned = allAssignedData.data ?? [];

  // totalLeads: cohort count — leads created in the selected period
  const totalLeads = leads.length;
  // totalCallsMade: SUM of call_count on cohort leads (created in period)
  const totalCallsMade = allAssigned.reduce(
    (s, l) => s + ((l.call_count ?? 0) as number),
    0,
  );

  // won / deal amount — from public.deals filtered by won_at
  const leadsWon = wonDeals.length;
  const totalDealAmount = wonDeals.reduce(
    (s, d) => s + ((d.deal_amount ?? 0) as number),
    0,
  );

  // deal type breakdown — deal_type is a direct column on public.deals
  const dealTypeMap: Record<string, { count: number; totalAmount: number }> =
    {};
  for (const d of wonDeals) {
    const dt = (d.deal_type as string | undefined) ?? "Other";
    if (!dealTypeMap[dt]) dealTypeMap[dt] = { count: 0, totalAmount: 0 };
    dealTypeMap[dt].count += 1;
    dealTypeMap[dt].totalAmount += (d.deal_amount ?? 0) as number;
  }
  const dealTypeBreakdown = Object.entries(dealTypeMap).map(
    ([dealType, v]) => ({
      dealType,
      count: v.count,
      totalAmount: v.totalAmount,
    }),
  );

  // pipeline breakdown — from the cohort (created_at filtered) leads
  const statusCountMap: Record<string, number> = {};
  for (const l of leads) {
    statusCountMap[l.status] = (statusCountMap[l.status] ?? 0) + 1;
  }
  const pipelineBreakdown = Object.entries(statusCountMap).map(
    ([status, count]) => ({ status, count }),
  );

  // Call outcome breakdown — latest outcome per lead (last_call_outcome column),
  // across all assigned leads. Groups by current outcome state, not historical notes.
  type CO = import("@/lib/types/database").CallOutcome;
  const countMap: Partial<Record<CO, number>> = {};
  for (const row of allAssigned) {
    const outcome = row.last_call_outcome as CO | null;
    if (!outcome) continue;
    countMap[outcome] = (countMap[outcome] ?? 0) + 1;
  }
  const callOutcomeBreakdown = Object.entries(countMap).map(
    ([outcome, count]) => ({
      outcome: outcome as CO,
      count: count as number,
    }),
  );

  return {
    callsToday: totalCallsMade,
    totalLeads,
    totalCallsMade,
    leadsWon,
    totalDealAmount,
    dealTypeBreakdown,
    pipelineBreakdown,
    callOutcomeBreakdown,
  };
}

// ─────────────────────────────────────────────
// Domains with leads
// Returns only domains that have ≥1 lead in the period.
// Used by FounderPerformanceShell to show only active domain tabs.
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// Domain Health Metrics
// Single RPC call — one row per domain regardless of lead count.
// p_domains drives the row set (UNNEST); zero-lead domains return all zeros.
// conversionRate is computed here: won + lost > 0 ? won / (won + lost) : null.
// All bigint fields cast through Number() before return (Q-09).
// ─────────────────────────────────────────────

export async function getDomainHealthMetrics(
  domains: AppDomain[],
  dateFrom: string,
  dateTo: string,
): Promise<DomainHealthCard[]> {
  if (domains.length === 0) return [];

  // get_domain_health_metrics returns exactly the requested domains with no
  // internal gate — EXECUTE revoked from `authenticated` (migration 0102, audit
  // F-1). Admin client only; callers pass the fixed GIA_DOMAINS list (Q-13).
  const supabase = createAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc(
    "get_domain_health_metrics",
    {
      p_domains:   domains,
      p_date_from: dateFrom,
      p_date_to:   dateTo,
    },
  );

  if (error || !data) return [];

  // RPC row shape (bigint aggregates arrive as number | string — Number() per Q-09)
  type DomainHealthRpcRow = {
    domain:           AppDomain;
    total_leads:      number | string | null;
    leads_won:        number | string | null;
    leads_lost:       number | string | null;
    calls_logged:     number | string | null;
    in_discussion:    number | string | null;
    nurturing:        number | string | null;
    total_calls_made: number | string | null;
    total_revenue:    number | string | null;
    total_deals:      number | string | null;
  };

  return mapRows<DomainHealthRpcRow, DomainHealthCard>(data, (row) => {
    const won    = Number(row.leads_won  ?? 0);
    const lost   = Number(row.leads_lost ?? 0);
    const closed = won + lost;
    return {
      domain:         row.domain,
      totalLeads:     Number(row.total_leads        ?? 0),
      leadsWon:       won,
      leadsLost:      lost,
      callsLogged:    Number(row.calls_logged       ?? 0),
      inDiscussion:   Number(row.in_discussion      ?? 0),
      nurturing:      Number(row.nurturing          ?? 0),
      conversionRate: closed > 0 ? (won / closed) * 100 : null,
      totalCallsMade: Number(row.total_calls_made   ?? 0),
      totalRevenue:   Number(row.total_revenue      ?? 0),
      totalDeals:     Number(row.total_deals        ?? 0),
    };
  });
}

// ─────────────────────────────────────────────
// Agent Today Pulse — one self-scoped RPC round trip (migration 0108).
// calls_today new/old split + 14-day call trend + period deals from
// public.deals. The IST day boundary is computed HERE via lib/utils/ist
// (never re-forked in SQL) and passed as p_today_start.
// ─────────────────────────────────────────────

export type AgentTodayPulse = {
  callsToday: { total: number; newLeads: number; oldLeads: number };
  /** ALL notes (plain + call) authored since IST midnight — a superset of
   *  callsToday.total. Backs the Overview "Today" strip Notes value. */
  notesToday: number;
  /** Oldest-first, 14 entries, day = IST calendar date (YYYY-MM-DD) */
  callTrend:  { day: string; count: number }[];
  deals:      { dealCount: number; revenue: number };
};

export async function getAgentTodayPulse(
  period: PerformancePeriod,
  customFrom?: string,
  customTo?: string,
): Promise<AgentTodayPulse> {
  const supabase = await createClient();
  const range = getPeriodDateRange(period);
  const from = (period === "custom" && customFrom) ? customFrom : range.from;
  const to   = (period === "custom" && customTo)   ? customTo   : range.to;
  const todayStart = toISTMidnight(new Date()).toISOString();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc("get_agent_today_pulse", {
    p_today_start: todayStart,
    p_date_from:   from,
    p_date_to:     to,
  });

  if (error || !data) {
    console.error("[performance-service] get_agent_today_pulse failed:", error);
    return {
      callsToday: { total: 0, newLeads: 0, oldLeads: 0 },
      notesToday: 0,
      callTrend:  [],
      deals:      { dealCount: 0, revenue: 0 },
    };
  }

  const payload = data as {
    calls_today?: { total?: number | string; new_leads?: number | string; old_leads?: number | string } | null;
    notes_today?: number | string | null;
    call_trend?:  { day: string; count: number | string }[] | null;
    deals?:       { deal_count?: number | string; revenue?: number | string } | null;
  };

  return {
    callsToday: {
      total:    Number(payload.calls_today?.total     ?? 0),
      newLeads: Number(payload.calls_today?.new_leads ?? 0),
      oldLeads: Number(payload.calls_today?.old_leads ?? 0),
    },
    notesToday: Number(payload.notes_today ?? 0),
    callTrend: (payload.call_trend ?? []).map((d) => ({
      day:   d.day,
      count: Number(d.count),
    })),
    deals: {
      dealCount: Number(payload.deals?.deal_count ?? 0),
      revenue:   Number(payload.deals?.revenue    ?? 0),
    },
  };
}

// ─────────────────────────────────────────────
// Agent recent lead activity — keyset "load more" (page ~15, no infinite
// scroll). Composite cursor (created_at, id) per the composite-cursor rule in
// src/lib/CLAUDE.md — created_at alone can tie on bulk writes.
// Scoped to the agent's leads via the !inner join; the leads RLS is the
// second layer for agent callers.
// ─────────────────────────────────────────────

export type AgentActivityCursor = { created_at: string; id: string };

/**
 * Activity-type filter for getAgentLeadActivityPage. 'all' = no predicate (the
 * agent self-view feed); 'call_logged' = calls only (the discriminator written
 * by add_lead_call_note — never inferred from details, which note_added also
 * carries; see migration 0030). The other two are exposed for completeness.
 */
export type AgentActivityFilter = "all" | "call_logged" | "note_added" | "status_changed";

export type AgentLeadActivityItem = {
  id:         string;
  leadId:     string;
  actionType: string;
  details:    Record<string, unknown> | null;
  createdAt:  string;
  leadName:   string;
  leadSlug:   string | null;
  /** Lead phone (E.164). Surfaced for the founder "Recent calls" drill-down. */
  phone:      string | null;
  /** Call outcome — read from the call_logged row's own details->>'outcome'
   *  (already written by the RPC); only meaningful for call_logged rows. */
  outcome:    string | null;
  /** Note body, correlated from lead_notes written in the same transaction. */
  note:       string | null;
};

export type AgentLeadActivityPage = {
  items:      AgentLeadActivityItem[];
  hasMore:    boolean;
  nextCursor: AgentActivityCursor | null;
};

const AGENT_ACTIVITY_PAGE_SIZE = 15;

export async function getAgentLeadActivityPage(
  agentId: string,
  cursor?: AgentActivityCursor,
  actionType: AgentActivityFilter = "all",
): Promise<AgentLeadActivityPage> {
  const supabase = await createClient();

  let query = supabase
    .from("lead_activities")
    .select(
      "id, lead_id, action_type, details, created_at, lead:leads!inner(first_name, last_name, slug, phone, assigned_to)",
    )
    .eq("lead.assigned_to", agentId);

  // action_type filter ANDs with the cursor .or() group below — it MUST be a
  // top-level .eq (PostgREST ANDs top-level filters with an .or() group). Never
  // fold it into the .or() string (that would OR it). 'call_logged' is the
  // correct single-row-per-call discriminator (note_added also carries the
  // outcome in details, so an outcome-based filter would double-count).
  if (actionType !== "all") query = query.eq("action_type", actionType);

  query = query
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(AGENT_ACTIVITY_PAGE_SIZE + 1);

  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error || !data) {
    if (error) {
      console.error("[performance-service] agent activity page failed:", error);
    }
    return { items: [], hasMore: false, nextCursor: null };
  }

  type ActivityRow = {
    id:          string;
    lead_id:     string;
    action_type: string;
    details:     Record<string, unknown> | null;
    created_at:  string;
    lead:        { first_name: string | null; last_name: string | null; slug: string | null; phone: string | null };
  };

  const hasMore = data.length > AGENT_ACTIVITY_PAGE_SIZE;
  const pageRows = (data as unknown as ActivityRow[]).slice(0, AGENT_ACTIVITY_PAGE_SIZE);

  // Note body correlation: lead_notes has no FK to lead_activities, so it can't
  // be PostgREST-embedded. The note row and the call_logged/note_added activity
  // row are INSERTed in the SAME transaction (RPC 0030), so they share
  // created_at to the microsecond. One batched query, then an exact
  // (lead_id|created_at) match first, falling back to most-recent-per-lead.
  const noteLeadIds = [
    ...new Set(
      pageRows
        .filter((r) => r.action_type === "call_logged" || r.action_type === "note_added")
        .map((r) => r.lead_id),
    ),
  ];

  const exactNote = new Map<string, string>();   // `${lead_id}|${created_at}` -> content
  const latestNote = new Map<string, string>();  // lead_id -> content (newest first)
  if (noteLeadIds.length > 0) {
    const { data: notes } = await supabase
      .from("lead_notes")
      .select("lead_id, content, created_at")
      .in("lead_id", noteLeadIds)
      .order("created_at", { ascending: false });
    for (const n of (notes ?? []) as { lead_id: string; content: string; created_at: string }[]) {
      exactNote.set(`${n.lead_id}|${n.created_at}`, n.content);
      if (!latestNote.has(n.lead_id)) latestNote.set(n.lead_id, n.content);
    }
  }

  const items = mapRows<ActivityRow, AgentLeadActivityItem>(pageRows, (row) => {
    const isNoteRow = row.action_type === "call_logged" || row.action_type === "note_added";
    const note = isNoteRow
      ? exactNote.get(`${row.lead_id}|${row.created_at}`) ?? latestNote.get(row.lead_id) ?? null
      : null;
    const outcome = (row.details?.["outcome"] as string | undefined) ?? null;
    return {
      id:         row.id,
      leadId:     row.lead_id,
      actionType: row.action_type,
      details:    row.details,
      createdAt:  row.created_at,
      leadName:   [row.lead?.first_name, row.lead?.last_name].filter(Boolean).join(" ") || "Unknown lead",
      leadSlug:   row.lead?.slug ?? null,
      phone:      row.lead?.phone ?? null,
      outcome,
      note,
    };
  });

  const last = items[items.length - 1];
  return {
    items,
    hasMore,
    nextCursor: hasMore && last ? { created_at: last.createdAt, id: last.id } : null,
  };
}

// ─────────────────────────────────────────────
// Agent calls page (founder/manager drill-down "Recent calls" modal).
// Queries lead_notes DIRECTLY with call_outcome IS NOT NULL — the same
// definition of "a call" as AgentDetailMetrics.callsToday / calls_logged
// (migration 0101). This is structurally one-row-per-call (the notes table is
// the call record), so it never double-counts the way filtering lead_activities
// could. Composite keyset cursor (created_at, id), page 15, button — no infinite
// scroll. Scoped by the agent's leads via the !inner join; the leads RLS is the
// manager/founder second layer (the action-layer domain guard is the first).
// No Redis (the performance service has none by design).
// ─────────────────────────────────────────────

export type AgentCallPageItem = {
  id:        string;
  leadId:    string;
  leadName:  string;
  leadSlug:  string | null;
  phone:     string | null;
  outcome:   string | null;
  note:      string;
  createdAt: string;
};

export type AgentCallsPage = {
  items:      AgentCallPageItem[];
  hasMore:    boolean;
  nextCursor: AgentActivityCursor | null;
};

export async function getAgentCallsPageForManager(
  agentId: string,
  cursor?: AgentActivityCursor,
): Promise<AgentCallsPage> {
  const supabase = await createClient();

  let query = supabase
    .from("lead_notes")
    .select(
      "id, lead_id, content, call_outcome, created_at, lead:leads!inner(first_name, last_name, slug, phone, assigned_to)",
    )
    .eq("lead.assigned_to", agentId)
    .not("call_outcome", "is", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(AGENT_ACTIVITY_PAGE_SIZE + 1);

  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`,
    );
  }

  const { data, error } = await query;
  if (error || !data) {
    if (error) {
      console.error("[performance-service] agent calls page failed:", error);
    }
    return { items: [], hasMore: false, nextCursor: null };
  }

  type CallNoteRow = {
    id:           string;
    lead_id:      string;
    content:      string;
    call_outcome: string | null;
    created_at:   string;
    lead:         { first_name: string | null; last_name: string | null; slug: string | null; phone: string | null };
  };

  const rows = data as unknown as CallNoteRow[];
  const hasMore = rows.length > AGENT_ACTIVITY_PAGE_SIZE;
  const pageRows = rows.slice(0, AGENT_ACTIVITY_PAGE_SIZE);

  const items = mapRows<CallNoteRow, AgentCallPageItem>(pageRows, (row) => ({
    id:        row.id,
    leadId:    row.lead_id,
    leadName:  [row.lead?.first_name, row.lead?.last_name].filter(Boolean).join(" ") || "Unknown lead",
    leadSlug:  row.lead?.slug ?? null,
    phone:     row.lead?.phone ?? null,
    outcome:   row.call_outcome ?? null,
    note:      row.content,
    createdAt: row.created_at,
  }));

  const last = items[items.length - 1];
  return {
    items,
    hasMore,
    nextCursor: hasMore && last ? { created_at: last.createdAt, id: last.id } : null,
  };
}

export async function getDomainsWithLeads(
  dateFrom: string,
  dateTo: string,
): Promise<AppDomain[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("leads")
    .select("domain")
    .gte("created_at", dateFrom)
    .lte("created_at", dateTo)
    .is("archived_at", null)
    .not("domain", "is", null);

  if (!data || data.length === 0) return [];

  const domainSet = new Set<AppDomain>();
  for (const row of data) {
    if (row.domain) domainSet.add(row.domain as AppDomain);
  }
  return [...domainSet].sort();
}
