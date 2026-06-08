// Performance page queries — single responsibility.
// Never add performance queries to leads-service.ts or dashboard-service.ts.
// All five functions accept (agentId, period) and run in parallel via Promise.all.
//
// N+1 pre-mortem: the response time query joins lead_activities → leads in one
// query and uses Postgres AVG(EXTRACT(EPOCH ...)) — never loops over leads.
//
// Benchmark query: 3 flat queries scoped to assigned_to IN (agentIds) — constant
// round trips regardless of domain size. Never loops over agents.

import { createClient } from "@/lib/supabase/server";
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
// ─────────────────────────────────────────────

// IST offset: +05:30 = 330 minutes
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function toISTMidnight(d: Date): Date {
  // Build a Date whose UTC time corresponds to IST midnight of d's IST date
  const istMs = d.getTime() + IST_OFFSET_MS;
  const istDate = new Date(istMs);
  istDate.setUTCHours(0, 0, 0, 0);
  // Back to UTC: subtract offset
  return new Date(istDate.getTime() - IST_OFFSET_MS);
}

function toISTEndOfDay(d: Date): Date {
  const istMs = d.getTime() + IST_OFFSET_MS;
  const istDate = new Date(istMs);
  istDate.setUTCHours(23, 59, 59, 999);
  return new Date(istDate.getTime() - IST_OFFSET_MS);
}

/** Returns the most recent Monday at IST midnight */
function getISTMondayStart(now: Date): Date {
  const istMs = now.getTime() + IST_OFFSET_MS;
  const istDate = new Date(istMs);
  const dow = istDate.getUTCDay(); // 0=Sun … 6=Sat
  const daysBack = dow === 0 ? 6 : dow - 1;
  istDate.setUTCDate(istDate.getUTCDate() - daysBack);
  istDate.setUTCHours(0, 0, 0, 0);
  return new Date(istDate.getTime() - IST_OFFSET_MS);
}

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
      const istNow = new Date(now.getTime() + IST_OFFSET_MS);
      const first = new Date(istNow);
      first.setUTCDate(1);
      first.setUTCHours(0, 0, 0, 0);
      const fromUtc = new Date(first.getTime() - IST_OFFSET_MS);
      return { from: fromUtc.toISOString(), to: now.toISOString() };
    }

    case "last_month": {
      const istNow = new Date(now.getTime() + IST_OFFSET_MS);
      const firstThisMonth = new Date(istNow);
      firstThisMonth.setUTCDate(1);
      firstThisMonth.setUTCHours(0, 0, 0, 0);

      // Last day of previous month = day before first of this month
      const lastDayPrev = new Date(firstThisMonth.getTime() - 1); // still in IST frame
      // First of previous month
      const firstPrev = new Date(lastDayPrev);
      firstPrev.setUTCDate(1);
      firstPrev.setUTCHours(0, 0, 0, 0);

      const fromUtc = new Date(firstPrev.getTime() - IST_OFFSET_MS);
      const toUtc = toISTEndOfDay(
        new Date(lastDayPrev.getTime() - IST_OFFSET_MS),
      );
      return { from: fromUtc.toISOString(), to: toUtc.toISOString() };
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
      // Two months ago
      const istNow = new Date(now.getTime() + IST_OFFSET_MS);
      const firstThisMonth = new Date(istNow);
      firstThisMonth.setUTCDate(1);
      firstThisMonth.setUTCHours(0, 0, 0, 0);

      const lastDayPrev = new Date(firstThisMonth.getTime() - 1);
      const firstPrev = new Date(lastDayPrev);
      firstPrev.setUTCDate(1);
      firstPrev.setUTCHours(0, 0, 0, 0);

      const lastDayPrevPrev = new Date(firstPrev.getTime() - 1);
      const firstPrevPrev = new Date(lastDayPrevPrev);
      firstPrevPrev.setUTCDate(1);
      firstPrevPrev.setUTCHours(0, 0, 0, 0);

      const fromUtc = new Date(firstPrevPrev.getTime() - IST_OFFSET_MS);
      const toUtc = toISTEndOfDay(
        new Date(lastDayPrevPrev.getTime() - IST_OFFSET_MS),
      );
      return { from: fromUtc.toISOString(), to: toUtc.toISOString() };
    }

    case "all_time":
    case "custom":
      // No meaningful previous period exists for these cases.
      return null;
  }
}

// ─────────────────────────────────────────────
// Core Four Metrics
// ─────────────────────────────────────────────

export async function getCoreFourMetrics(
  agentId: string,
  period: PerformancePeriod,
  customFrom?: string,
  customTo?: string,
): Promise<CoreFourMetrics> {
  const range = getPeriodDateRange(period);
  const from = (period === 'custom' && customFrom) ? customFrom : range.from;
  const to   = (period === 'custom' && customTo)   ? customTo   : range.to;
  return _getCoreFourMetricsForRange(agentId, { from, to });
}

/** Shared inner implementation — accepts a computed DateRange directly. */
export async function _getCoreFourMetricsForRange(
  agentId: string,
  range: DateRange,
): Promise<CoreFourMetrics> {
  const supabase = await createClient();
  const { from, to } = range;

  const [
    { count: leadsWon },
    { data: touchRows },
    { data: responseRows },
    { data: closedRows },
  ] = await Promise.all([
    // ── 1. leadsWon — filter by status_changed_at (when lead became won) ──
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("assigned_to", agentId)
      .eq("status", "won")
      .is("archived_at", null)
      .gte("status_changed_at", from)
      .lte("status_changed_at", to),

    // ── 2. touchRate — cohort: leads created in period, what % moved past 'new'? ──
    supabase
      .from("leads")
      .select("status")
      .eq("assigned_to", agentId)
      .is("archived_at", null)
      .gte("created_at", from)
      .lte("created_at", to),

    // ── 3. avgResponseTimeMinutes — first-touch activities joined to leads ──
    supabase
      .from("lead_activities")
      .select("created_at, lead:leads!lead_activities_lead_id_fkey(created_at)")
      .eq("actor_id", agentId)
      .eq("action_type", "status_changed")
      .filter("details->>new_status", "eq", "touched")
      .gte("created_at", from)
      .lte("created_at", to),

    // ── 4. conversionRate — closed leads filtered by status_changed_at ──
    supabase
      .from("leads")
      .select("status")
      .eq("assigned_to", agentId)
      .is("archived_at", null)
      .in("status", ["won", "lost"])
      .gte("status_changed_at", from)
      .lte("status_changed_at", to),
  ]);

  const totalAssigned = touchRows?.length ?? 0;
  const touched = touchRows?.filter((r) => r.status !== "new").length ?? 0;
  const touchRate = totalAssigned > 0 ? (touched / totalAssigned) * 100 : null;

  let avgResponseTimeMinutes: number | null = null;
  if (responseRows && responseRows.length > 0) {
    const diffs: number[] = [];
    for (const row of responseRows) {
      const lead = Array.isArray(row.lead) ? row.lead[0] : row.lead;
      if (!lead?.created_at) continue;
      const activityTs = new Date(row.created_at).getTime();
      const leadTs = new Date(lead.created_at).getTime();
      const diffMs = activityTs - leadTs;
      if (diffMs >= 0) {
        diffs.push(diffMs / 60000);
      }
    }
    if (diffs.length > 0) {
      avgResponseTimeMinutes = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    }
  }

  const won_count = closedRows?.filter((r) => r.status === "won").length ?? 0;
  const lost_count = closedRows?.filter((r) => r.status === "lost").length ?? 0;
  const closed_count = won_count + lost_count;
  const conversionRate = closed_count > 0 ? (won_count / closed_count) * 100 : null;

  return {
    leadsWon: leadsWon ?? 0,
    touchRate,
    avgResponseTimeMinutes,
    conversionRate,
  };
}

// ─────────────────────────────────────────────
// Previous Period Core Metrics (for deltas)
// ─────────────────────────────────────────────

export async function getPreviousPeriodCoreMetrics(
  agentId: string,
  period: PerformancePeriod,
): Promise<CoreFourMetrics | null> {
  const range = getPreviousPeriodDateRange(period);
  if (range === null) return null;
  return _getCoreFourMetricsForRange(agentId, range);
}

// ─────────────────────────────────────────────
// Effort Metrics
// ─────────────────────────────────────────────

export async function getEffortMetrics(
  agentId: string,
  period: PerformancePeriod,
  customFrom?: string,
  customTo?: string,
): Promise<EffortMetrics> {
  const supabase = await createClient();
  const range = getPeriodDateRange(period);
  const from = (period === 'custom' && customFrom) ? customFrom : range.from;
  const to   = (period === 'custom' && customTo)   ? customTo   : range.to;

  const [
    { count: callsLogged },
    { count: notesWritten },
    { count: inDiscussionCount },
    { count: nurturingCount },
  ] = await Promise.all([
    // callsLogged: notes with a call_outcome set
    supabase
      .from("lead_notes")
      .select("id", { count: "exact", head: true })
      .eq("author_id", agentId)
      .not("call_outcome", "is", null)
      .gte("created_at", from)
      .lte("created_at", to),

    // notesWritten: all notes by agent in period
    supabase
      .from("lead_notes")
      .select("id", { count: "exact", head: true })
      .eq("author_id", agentId)
      .gte("created_at", from)
      .lte("created_at", to),

    // Live pipeline counts — no period filter (inDiscussionCount, nurturingCount)
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("assigned_to", agentId)
      .eq("status", "in_discussion")
      .is("archived_at", null),

    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("assigned_to", agentId)
      .eq("status", "nurturing")
      .is("archived_at", null),
  ]);

  return {
    callsLogged: callsLogged ?? 0,
    notesWritten: notesWritten ?? 0,
    inDiscussionCount: inDiscussionCount ?? 0,
    nurturingCount: nurturingCount ?? 0,
  };
}

// ─────────────────────────────────────────────
// Call Outcome Breakdown
// ─────────────────────────────────────────────

export async function getCallOutcomeBreakdown(
  agentId: string,
  period: PerformancePeriod,
  customFrom?: string,
  customTo?: string,
): Promise<OutcomeBreakdownItem[]> {
  const supabase = await createClient();
  const range = getPeriodDateRange(period);
  const from = (period === 'custom' && customFrom) ? customFrom : range.from;
  const to   = (period === 'custom' && customTo)   ? customTo   : range.to;

  const { data } = await supabase
    .from("lead_notes")
    .select("call_outcome")
    .eq("author_id", agentId)
    .not("call_outcome", "is", null)
    .gte("created_at", from)
    .lte("created_at", to);

  if (!data || data.length === 0) return [];

  const countMap: Partial<Record<CallOutcome, number>> = {};
  for (const row of data) {
    const outcome = row.call_outcome as CallOutcome | null;
    if (!outcome) continue;
    countMap[outcome] = (countMap[outcome] ?? 0) + 1;
  }

  return Object.entries(countMap).map(([outcome, count]) => ({
    outcome: outcome as CallOutcome,
    count: count as number,
  }));
}

// ─────────────────────────────────────────────
// Team Benchmarks
// Domain-wide averages for touch rate, response time, and conversion rate.
// leadsWon is intentionally excluded — absolute count, not a rate.
//
// Query strategy: 3 flat queries scoped to assigned_to IN (agentIds).
// Constant round trips regardless of domain size. Never loops over agents.
// agentCount < 2 → all nulls; a benchmark from one agent is that agent's own data.
//
// ── Averaging method: mean of per-agent means (unweighted) ──────────────────
// All three metrics use per-agent averages first, then average those averages.
// This means each agent counts equally regardless of lead volume.
// An agent with 2 leads at 100% touch rate contributes as much as one with 50 leads.
//
// This is intentional for all three metrics:
//   - Touch rate / conversion rate: volume advantages shouldn't dominate the benchmark.
//     We want each agent to count once, not their lead count.
//   - Response time: a fast low-volume agent shouldn't be buried by a slow high-volume one.
//
// This is NOT the same as a pool-wide average (total touched / total assigned).
// Do not change it to weighted averaging thinking it's a bug — it is a design choice.
// If weighting is ever desired, it should be a separate function, not a replacement.
//
// ── agentCount: roster count, not activity count ────────────────────────────
// agentCount is the number of active agents in the domain per profiles — it is
// NOT the number of agents who actually had leads in the period. An agent on leave
// for the entire month counts toward agentCount as 3 even if only 2 agents worked.
// This is intentional for the < 2 guard (roster-based: one active agent means no
// meaningful peer group regardless of period), but means the UI label "across N agents"
// reflects the domain roster, not period activity. The averages themselves are computed
// only from agents who had leads (the .filter(d.total > 0) guards below), so an
// inactive agent doesn't distort the averages — but they do show up in the count label.
// If this distinction ever matters, derive agentCount from the keys of touchByAgent
// (agents who had period activity) instead of agentIds.length.
// ─────────────────────────────────────────────

export async function getTeamBenchmarks(
  callerDomain: AppDomain,
  period: PerformancePeriod,
  customFrom?: string,
  customTo?: string,
): Promise<TeamBenchmarks> {
  const supabase = await createClient();

  // ── 1. Peer pool: all active agents in the domain (roster count) ─────────
  // agentCount reflects domain roster, not period activity — see comment block above.
  // agentRows must resolve before the IN clause below can be built.
  const { data: agentRows } = await supabase
    .from("profiles")
    .select("id")
    .eq("domain", callerDomain)
    .eq("role", "agent")
    .eq("is_active", true);

  const agentIds = (agentRows ?? []).map((r) => r.id as string);
  const agentCount = agentIds.length;

  if (agentCount < 2) {
    return {
      avgTouchRate: null,
      avgConversionRate: null,
      avgResponseTimeMinutes: null,
      agentCount,
    };
  }

  const range = getPeriodDateRange(period);
  const from = (period === 'custom' && customFrom) ? customFrom : range.from;
  const to   = (period === 'custom' && customTo)   ? customTo   : range.to;

  // ── 2–4. Touch, closed, response — all independent, run in parallel ──────
  const [
    { data: touchRows },
    { data: closedRows },
    { data: responseRows },
  ] = await Promise.all([
    // Touch rate: leads assigned to peer agents created in the period
    supabase
      .from("leads")
      .select("assigned_to, status")
      .in("assigned_to", agentIds)
      .is("archived_at", null)
      .gte("created_at", from)
      .lte("created_at", to),

    // Conversion rate: won+lost leads closed in the period (status_changed_at)
    supabase
      .from("leads")
      .select("assigned_to, status")
      .in("assigned_to", agentIds)
      .is("archived_at", null)
      .in("status", ["won", "lost"])
      .gte("status_changed_at", from)
      .lte("status_changed_at", to),

    // Avg response time: first-touch activities across all peer agents
    supabase
      .from("lead_activities")
      .select(
        "actor_id, created_at, lead:leads!lead_activities_lead_id_fkey(created_at)",
      )
      .in("actor_id", agentIds)
      .eq("action_type", "status_changed")
      .filter("details->>new_status", "eq", "touched")
      .gte("created_at", from)
      .lte("created_at", to),
  ]);

  const touchData = touchRows ?? [];

  // Per-agent touch rate → unweighted mean of means (see comment block above)
  const touchByAgent: Record<string, { total: number; touched: number }> = {};
  for (const row of touchData) {
    const aid = row.assigned_to as string;
    if (!touchByAgent[aid]) touchByAgent[aid] = { total: 0, touched: 0 };
    touchByAgent[aid].total += 1;
    if (row.status !== "new") touchByAgent[aid].touched += 1;
  }

  // .filter(d.total > 0) excludes agents with no leads in the period from the average
  const agentTouchRates = Object.values(touchByAgent)
    .filter((d) => d.total > 0)
    .map((d) => (d.touched / d.total) * 100);

  const avgTouchRate =
    agentTouchRates.length > 0
      ? agentTouchRates.reduce((a, b) => a + b, 0) / agentTouchRates.length
      : null;

  const closedData = closedRows ?? [];
  const closedByAgent: Record<string, { won: number; lost: number }> = {};
  for (const row of closedData) {
    const aid = row.assigned_to as string;
    if (!closedByAgent[aid]) closedByAgent[aid] = { won: 0, lost: 0 };
    if (row.status === "won") closedByAgent[aid].won += 1;
    if (row.status === "lost") closedByAgent[aid].lost += 1;
  }

  // .filter(d.won + d.lost > 0) excludes agents with no closed leads from the average
  const agentConvRates = Object.values(closedByAgent)
    .filter((d) => d.won + d.lost > 0)
    .map((d) => (d.won / (d.won + d.lost)) * 100);

  const avgConversionRate =
    agentConvRates.length > 0
      ? agentConvRates.reduce((a, b) => a + b, 0) / agentConvRates.length
      : null;

  // Per-agent response diffs → unweighted mean of means (see comment block above)
  const diffsByAgent: Record<string, number[]> = {};
  for (const row of responseRows ?? []) {
    const aid = row.actor_id as string;
    const lead = Array.isArray(row.lead) ? row.lead[0] : row.lead;
    if (!lead?.created_at) continue;
    const diffMs =
      new Date(row.created_at).getTime() - new Date(lead.created_at).getTime();
    if (diffMs < 0) continue;
    if (!diffsByAgent[aid]) diffsByAgent[aid] = [];
    diffsByAgent[aid].push(diffMs / 60000);
  }

  const agentResponseAvgs = Object.values(diffsByAgent)
    .filter((diffs) => diffs.length > 0)
    .map((diffs) => diffs.reduce((a, b) => a + b, 0) / diffs.length);

  const avgResponseTimeMinutes =
    agentResponseAvgs.length > 0
      ? agentResponseAvgs.reduce((a, b) => a + b, 0) / agentResponseAvgs.length
      : null;

  return {
    avgTouchRate,
    avgConversionRate,
    avgResponseTimeMinutes,
    agentCount,
  };
}

// ─────────────────────────────────────────────
// Agent Roster Performance
// Single query joining profiles + lead aggregates for manager / founder view.
// Never N+1: one flat Supabase query with JavaScript aggregation on the result.
// agentCount < 1 → returns empty array immediately (nothing to show).
// ─────────────────────────────────────────────

export async function getAgentRosterPerformance(
  domain: AppDomain | null,
  dateFrom: string,
  dateTo: string,
): Promise<AgentRosterRow[]> {
  const supabase = await createClient();

  // ── 1. Agent roster ──────────────────────────────────────────────────────
  // When domain is null (founder/admin all-domains view), fetch all agents.
  let agentQuery = supabase
    .from("profiles")
    .select("id, full_name, avatar_url, domain")
    .eq("role", "agent")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (domain !== null) {
    agentQuery = agentQuery.eq("domain", domain);
  }

  const { data: agentRows } = await agentQuery;

  const agents = agentRows ?? [];
  if (agents.length === 0) return [];

  const agentIds = agents.map((a) => a.id as string);

  // ── 2. All leads assigned to any agent in the domain in the period ───────
  // Uses created_at for the cohort (touch rate denominator).
  const { data: leadRows } = await supabase
    .from("leads")
    .select("id, assigned_to, status")
    .in("assigned_to", agentIds)
    .is("archived_at", null)
    .gte("created_at", dateFrom)
    .lte("created_at", dateTo);

  // Won/lost leads closed in the period — filtered by status_changed_at.
  // Used for conversion rate (lead lifecycle metric — stays on leads).
  const { data: closedRows } = await supabase
    .from("leads")
    .select("id, assigned_to, status")
    .in("assigned_to", agentIds)
    .is("archived_at", null)
    .in("status", ["won", "lost"])
    .gte("status_changed_at", dateFrom)
    .lte("status_changed_at", dateTo);

  // Deal revenue — read from public.deals filtered by won_at.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: dealRows } = await (supabase as any)
    .from("deals")
    .select("assigned_to, deal_amount")
    .in("assigned_to", agentIds)
    .is("archived_at", null)
    .gte("won_at", dateFrom)
    .lte("won_at", dateTo);

  const leads = leadRows ?? [];
  const closed = closedRows ?? [];
  const deals = (dealRows ?? []) as { assigned_to: string; deal_amount: number }[];

  // ── 3. First-touch response times for all agents ─────────────────────────
  const { data: responseRows } = await supabase
    .from("lead_activities")
    .select(
      "actor_id, created_at, lead:leads!lead_activities_lead_id_fkey(created_at)",
    )
    .in("actor_id", agentIds)
    .eq("action_type", "status_changed")
    .filter("details->>new_status", "eq", "touched")
    .gte("created_at", dateFrom)
    .lte("created_at", dateTo);

  // Per-agent aggregation
  type AgentAgg = {
    total: number;
    won: number;
    dealAmount: number;
    wonCount: number;
    lostCount: number;
    responseDiffs: number[];
    domain: AppDomain;
  };

  const agg: Record<string, AgentAgg> = {};
  for (const a of agents) {
    agg[a.id as string] = {
      total: 0,
      won: 0,
      dealAmount: 0,
      wonCount: 0,
      lostCount: 0,
      responseDiffs: [],
      domain: a.domain as AppDomain,
    };
  }

  // Cohort total — leads created in the period (touch rate denominator)
  for (const lead of leads) {
    const aid = lead.assigned_to as string;
    if (!agg[aid]) continue;
    agg[aid].total += 1;
  }

  // Won/lost — leads closed in the period (status_changed_at filter, lead lifecycle)
  for (const lead of closed) {
    const aid = lead.assigned_to as string;
    if (!agg[aid]) continue;
    if (lead.status === "won") {
      agg[aid].won += 1;
      agg[aid].wonCount += 1;
    }
    if (lead.status === "lost") {
      agg[aid].lostCount += 1;
    }
  }

  // Deal revenue — from public.deals filtered by won_at
  for (const deal of deals) {
    const aid = deal.assigned_to as string;
    if (!agg[aid]) continue;
    agg[aid].dealAmount += (deal.deal_amount ?? 0) as number;
  }

  for (const row of responseRows ?? []) {
    const aid = row.actor_id as string;
    const lead = Array.isArray(row.lead) ? row.lead[0] : row.lead;
    if (!lead?.created_at || !agg[aid]) continue;
    const diffMs =
      new Date(row.created_at).getTime() - new Date(lead.created_at).getTime();
    if (diffMs >= 0) agg[aid].responseDiffs.push(diffMs / 60000);
  }

  const rows = agents.map((a) => {
    const data = agg[a.id as string];
    const closed = data.wonCount + data.lostCount;
    const conversionRate = closed > 0 ? (data.wonCount / closed) * 100 : null;
    const avgResponseTimeMinutes =
      data.responseDiffs.length > 0
        ? data.responseDiffs.reduce((s, v) => s + v, 0) /
          data.responseDiffs.length
        : null;
    return {
      id: a.id as string,
      full_name: a.full_name as string,
      avatar_url: (a.avatar_url as string | null) ?? null,
      domain: data.domain,
      totalLeads: data.total,
      leadsWon: data.won,
      conversionRate,
      totalDealAmount: data.dealAmount,
      avgResponseTimeMinutes,
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

  const supabase = await createClient();

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

  return (data as Record<string, unknown>[]).map((row) => {
    const won    = Number(row.leads_won  ?? 0);
    const lost   = Number(row.leads_lost ?? 0);
    const closed = won + lost;
    return {
      domain:         row.domain as AppDomain,
      totalLeads:     Number(row.total_leads        ?? 0),
      leadsWon:       won,
      leadsLost:      lost,
      callsLogged:    Number(row.calls_logged       ?? 0),
      inDiscussion:   Number(row.in_discussion      ?? 0),
      nurturing:      Number(row.nurturing          ?? 0),
      conversionRate: closed > 0 ? (won / closed) * 100 : null,
      totalCallsMade: Number(row.total_calls_made   ?? 0),
      totalRevenue:   Number(row.total_revenue      ?? 0),
    };
  });
}

// ─────────────────────────────────────────────
// Agent Lead Health Breakdown
// Single query grouped by lead_health for one agent.
// Excludes: archived leads, terminal statuses, null health (not yet evaluated).
// Performance boundary: this service owns this query. Never add to leads-service.ts.
// ─────────────────────────────────────────────

export type LeadHealthBreakdown = {
  healthy:          number;
  needs_attention:  number;
  at_risk:          number;
};

export async function getAgentLeadHealthBreakdown(
  agentId: string,
): Promise<LeadHealthBreakdown> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('leads')
    .select('lead_health')
    .eq('assigned_to', agentId)
    .is('archived_at', null)
    .not('status', 'in', '(won,lost,junk)')
    .not('lead_health', 'is', null);

  const rows = data ?? [];

  const result: LeadHealthBreakdown = { healthy: 0, needs_attention: 0, at_risk: 0 };
  for (const row of rows) {
    const h = row.lead_health as keyof LeadHealthBreakdown | null;
    if (h && h in result) result[h] = Number(result[h]) + 1;
  }
  return result;
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
