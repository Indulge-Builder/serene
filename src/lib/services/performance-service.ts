// Performance page queries — single responsibility.
// Never add performance queries to leads-service.ts or dashboard-service.ts.
// All five functions accept (agentId, period) and run in parallel via Promise.all.
//
// N+1 pre-mortem: the response time query joins lead_activities → leads in one
// query and uses Postgres AVG(EXTRACT(EPOCH ...)) — never loops over leads.
//
// Benchmark query: 3 flat queries scoped to assigned_to IN (agentIds) — constant
// round trips regardless of domain size. Never loops over agents.

import { createClient } from '@/lib/supabase/server';
import type { AppDomain, CallOutcome } from '@/lib/types/database';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type PerformancePeriod = 'this_week' | 'this_month' | 'last_month' | 'all_time';

export type DateRange = {
  from: string;
  to:   string;
};

export type CoreFourMetrics = {
  leadsWon:               number;
  touchRate:              number | null;
  avgResponseTimeMinutes: number | null;
  conversionRate:         number | null;
};

export type EffortMetrics = {
  callsLogged:      number;
  notesWritten:     number;
  inDiscussionCount: number;
  nurturingCount:   number;
};

export type OutcomeBreakdownItem = {
  outcome: CallOutcome;
  count:   number;
};

export type TeamBenchmarks = {
  avgTouchRate:           number | null;
  avgConversionRate:      number | null;
  avgResponseTimeMinutes: number | null;
  agentCount:             number;
};

// ─────────────────────────────────────────────
// Pure utility — no DB call
// ─────────────────────────────────────────────

// IST offset: +05:30 = 330 minutes
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function toISTMidnight(d: Date): Date {
  // Build a Date whose UTC time corresponds to IST midnight of d's IST date
  const istMs    = d.getTime() + IST_OFFSET_MS;
  const istDate  = new Date(istMs);
  istDate.setUTCHours(0, 0, 0, 0);
  // Back to UTC: subtract offset
  return new Date(istDate.getTime() - IST_OFFSET_MS);
}

function toISTEndOfDay(d: Date): Date {
  const istMs   = d.getTime() + IST_OFFSET_MS;
  const istDate = new Date(istMs);
  istDate.setUTCHours(23, 59, 59, 999);
  return new Date(istDate.getTime() - IST_OFFSET_MS);
}

/** Returns the most recent Monday at IST midnight */
function getISTMondayStart(now: Date): Date {
  const istMs   = now.getTime() + IST_OFFSET_MS;
  const istDate = new Date(istMs);
  const dow     = istDate.getUTCDay(); // 0=Sun … 6=Sat
  const daysBack = dow === 0 ? 6 : dow - 1;
  istDate.setUTCDate(istDate.getUTCDate() - daysBack);
  istDate.setUTCHours(0, 0, 0, 0);
  return new Date(istDate.getTime() - IST_OFFSET_MS);
}

export function getPeriodDateRange(period: PerformancePeriod): DateRange {
  const now = new Date();

  switch (period) {
    case 'this_week': {
      const from = getISTMondayStart(now);
      return { from: from.toISOString(), to: now.toISOString() };
    }

    case 'this_month': {
      const istNow  = new Date(now.getTime() + IST_OFFSET_MS);
      const first   = new Date(istNow);
      first.setUTCDate(1);
      first.setUTCHours(0, 0, 0, 0);
      const fromUtc = new Date(first.getTime() - IST_OFFSET_MS);
      return { from: fromUtc.toISOString(), to: now.toISOString() };
    }

    case 'last_month': {
      const istNow     = new Date(now.getTime() + IST_OFFSET_MS);
      const firstThisMonth = new Date(istNow);
      firstThisMonth.setUTCDate(1);
      firstThisMonth.setUTCHours(0, 0, 0, 0);

      // Last day of previous month = day before first of this month
      const lastDayPrev = new Date(firstThisMonth.getTime() - 1); // still in IST frame
      // First of previous month
      const firstPrev   = new Date(lastDayPrev);
      firstPrev.setUTCDate(1);
      firstPrev.setUTCHours(0, 0, 0, 0);

      const fromUtc = new Date(firstPrev.getTime() - IST_OFFSET_MS);
      const toUtc   = toISTEndOfDay(new Date(lastDayPrev.getTime() - IST_OFFSET_MS));
      return { from: fromUtc.toISOString(), to: toUtc.toISOString() };
    }

    case 'all_time':
      return { from: '2024-01-01T00:00:00Z', to: now.toISOString() };
  }
}

/**
 * Returns the date range immediately preceding the given period (same length).
 * Returns null for 'all_time' — there is no meaningful prior period to compare.
 */
export function getPreviousPeriodDateRange(period: PerformancePeriod): DateRange | null {
  const now = new Date();

  switch (period) {
    case 'this_week': {
      const thisMonday = getISTMondayStart(now);
      const prevMonday = new Date(thisMonday.getTime() - 7 * 24 * 60 * 60 * 1000);
      const prevSunday = new Date(thisMonday.getTime() - 1);
      return {
        from: prevMonday.toISOString(),
        to:   toISTEndOfDay(prevSunday).toISOString(),
      };
    }

    case 'this_month': {
      // last_month range IS the previous period for this_month
      return getPeriodDateRange('last_month');
    }

    case 'last_month': {
      // Two months ago
      const istNow = new Date(now.getTime() + IST_OFFSET_MS);
      const firstThisMonth = new Date(istNow);
      firstThisMonth.setUTCDate(1);
      firstThisMonth.setUTCHours(0, 0, 0, 0);

      const lastDayPrev    = new Date(firstThisMonth.getTime() - 1);
      const firstPrev      = new Date(lastDayPrev);
      firstPrev.setUTCDate(1);
      firstPrev.setUTCHours(0, 0, 0, 0);

      const lastDayPrevPrev  = new Date(firstPrev.getTime() - 1);
      const firstPrevPrev    = new Date(lastDayPrevPrev);
      firstPrevPrev.setUTCDate(1);
      firstPrevPrev.setUTCHours(0, 0, 0, 0);

      const fromUtc = new Date(firstPrevPrev.getTime() - IST_OFFSET_MS);
      const toUtc   = toISTEndOfDay(new Date(lastDayPrevPrev.getTime() - IST_OFFSET_MS));
      return { from: fromUtc.toISOString(), to: toUtc.toISOString() };
    }

    case 'all_time':
      // No meaningful previous period exists. Return null so the caller
      // can suppress delta rendering entirely rather than show a 0% comparison.
      return null;
  }
}

// ─────────────────────────────────────────────
// Core Four Metrics
// ─────────────────────────────────────────────

export async function getCoreFourMetrics(
  agentId: string,
  period:  PerformancePeriod,
): Promise<CoreFourMetrics> {
  return _getCoreFourMetricsForRange(agentId, getPeriodDateRange(period));
}

/** Shared inner implementation — accepts a computed DateRange directly. */
export async function _getCoreFourMetricsForRange(
  agentId: string,
  range:   DateRange,
): Promise<CoreFourMetrics> {
  const supabase = await createClient();
  const { from, to } = range;

  // ── 1. leadsWon ─────────────────────────────────────────────────────────
  const { count: leadsWon } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('assigned_to', agentId)
    .eq('status', 'won')
    .is('archived_at', null)
    .gte('created_at', from)
    .lte('created_at', to);

  // ── 2. touchRate ─────────────────────────────────────────────────────────
  // total assigned in period vs those with status != 'new'
  const { data: touchRows } = await supabase
    .from('leads')
    .select('status')
    .eq('assigned_to', agentId)
    .is('archived_at', null)
    .gte('created_at', from)
    .lte('created_at', to);

  const totalAssigned = touchRows?.length ?? 0;
  const touched       = touchRows?.filter((r) => r.status !== 'new').length ?? 0;
  const touchRate     = totalAssigned > 0 ? (touched / totalAssigned) * 100 : null;

  // ── 3. avgResponseTimeMinutes ────────────────────────────────────────────
  // One query: lead_activities (type='status_changed', new_status='touched', actor=agent)
  // joined to leads to get leads.created_at; Postgres computes the diff in seconds.
  // Using the PostgREST syntax: select with embedded relationship.
  const { data: responseRows } = await supabase
    .from('lead_activities')
    .select('created_at, lead:leads!lead_activities_lead_id_fkey(created_at)')
    .eq('actor_id', agentId)
    .eq('action_type', 'status_changed')
    .filter('details->>new_status', 'eq', 'touched')
    .gte('created_at', from)
    .lte('created_at', to);

  let avgResponseTimeMinutes: number | null = null;
  if (responseRows && responseRows.length > 0) {
    const diffs: number[] = [];
    for (const row of responseRows) {
      const lead = Array.isArray(row.lead) ? row.lead[0] : row.lead;
      if (!lead?.created_at) continue;
      const activityTs = new Date(row.created_at).getTime();
      const leadTs     = new Date(lead.created_at).getTime();
      const diffMs     = activityTs - leadTs;
      if (diffMs >= 0) {
        diffs.push(diffMs / 60000); // convert to minutes
      }
    }
    if (diffs.length > 0) {
      avgResponseTimeMinutes = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    }
  }

  // ── 4. conversionRate ────────────────────────────────────────────────────
  const { data: closedRows } = await supabase
    .from('leads')
    .select('status')
    .eq('assigned_to', agentId)
    .is('archived_at', null)
    .in('status', ['won', 'lost'])
    .gte('created_at', from)
    .lte('created_at', to);

  const won_count  = closedRows?.filter((r) => r.status === 'won').length  ?? 0;
  const lost_count = closedRows?.filter((r) => r.status === 'lost').length ?? 0;
  const closed     = won_count + lost_count;
  const conversionRate = closed > 0 ? (won_count / closed) * 100 : null;

  return {
    leadsWon:               leadsWon ?? 0,
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
  period:  PerformancePeriod,
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
  period:  PerformancePeriod,
): Promise<EffortMetrics> {
  const supabase = await createClient();
  const { from, to } = getPeriodDateRange(period);

  // callsLogged: notes with a call_outcome set
  const { count: callsLogged } = await supabase
    .from('lead_notes')
    .select('id', { count: 'exact', head: true })
    .eq('author_id', agentId)
    .not('call_outcome', 'is', null)
    .gte('created_at', from)
    .lte('created_at', to);

  // notesWritten: all notes by agent in period
  const { count: notesWritten } = await supabase
    .from('lead_notes')
    .select('id', { count: 'exact', head: true })
    .eq('author_id', agentId)
    .gte('created_at', from)
    .lte('created_at', to);

  // Live pipeline counts — no period filter
  const { count: inDiscussionCount } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('assigned_to', agentId)
    .eq('status', 'in_discussion')
    .is('archived_at', null);

  const { count: nurturingCount } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('assigned_to', agentId)
    .eq('status', 'nurturing')
    .is('archived_at', null);

  return {
    callsLogged:       callsLogged       ?? 0,
    notesWritten:      notesWritten      ?? 0,
    inDiscussionCount: inDiscussionCount ?? 0,
    nurturingCount:    nurturingCount    ?? 0,
  };
}

// ─────────────────────────────────────────────
// Call Outcome Breakdown
// ─────────────────────────────────────────────

export async function getCallOutcomeBreakdown(
  agentId: string,
  period:  PerformancePeriod,
): Promise<OutcomeBreakdownItem[]> {
  const supabase = await createClient();
  const { from, to } = getPeriodDateRange(period);

  const { data } = await supabase
    .from('lead_notes')
    .select('call_outcome')
    .eq('author_id', agentId)
    .not('call_outcome', 'is', null)
    .gte('created_at', from)
    .lte('created_at', to);

  if (!data || data.length === 0) return [];

  const countMap: Partial<Record<CallOutcome, number>> = {};
  for (const row of data) {
    const outcome = row.call_outcome as CallOutcome | null;
    if (!outcome) continue;
    countMap[outcome] = (countMap[outcome] ?? 0) + 1;
  }

  return Object.entries(countMap).map(([outcome, count]) => ({
    outcome: outcome as CallOutcome,
    count:   count as number,
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
  period:       PerformancePeriod,
): Promise<TeamBenchmarks> {
  const supabase = await createClient();

  // ── 1. Peer pool: all active agents in the domain (roster count) ─────────
  // agentCount reflects domain roster, not period activity — see comment block above.
  const { data: agentRows } = await supabase
    .from('profiles')
    .select('id')
    .eq('domain', callerDomain)
    .eq('role', 'agent')
    .eq('is_active', true);

  const agentIds   = (agentRows ?? []).map((r) => r.id as string);
  const agentCount = agentIds.length;

  if (agentCount < 2) {
    return {
      avgTouchRate:           null,
      avgConversionRate:      null,
      avgResponseTimeMinutes: null,
      agentCount,
    };
  }

  const { from, to } = getPeriodDateRange(period);

  // ── 2. Touch rate: all leads assigned to any peer agent in the period ────
  const { data: touchRows } = await supabase
    .from('leads')
    .select('assigned_to, status')
    .in('assigned_to', agentIds)
    .is('archived_at', null)
    .gte('created_at', from)
    .lte('created_at', to);

  const touchData = touchRows ?? [];

  // Per-agent touch rate → unweighted mean of means (see comment block above)
  const touchByAgent: Record<string, { total: number; touched: number }> = {};
  for (const row of touchData) {
    const aid = row.assigned_to as string;
    if (!touchByAgent[aid]) touchByAgent[aid] = { total: 0, touched: 0 };
    touchByAgent[aid].total  += 1;
    if (row.status !== 'new') touchByAgent[aid].touched += 1;
  }

  // .filter(d.total > 0) excludes agents with no leads in the period from the average
  const agentTouchRates = Object.values(touchByAgent)
    .filter((d) => d.total > 0)
    .map((d) => (d.touched / d.total) * 100);

  const avgTouchRate = agentTouchRates.length > 0
    ? agentTouchRates.reduce((a, b) => a + b, 0) / agentTouchRates.length
    : null;

  // ── 3. Conversion rate: won+lost leads per peer agent in the period ──────
  const { data: closedRows } = await supabase
    .from('leads')
    .select('assigned_to, status')
    .in('assigned_to', agentIds)
    .is('archived_at', null)
    .in('status', ['won', 'lost'])
    .gte('created_at', from)
    .lte('created_at', to);

  const closedData = closedRows ?? [];
  const closedByAgent: Record<string, { won: number; lost: number }> = {};
  for (const row of closedData) {
    const aid = row.assigned_to as string;
    if (!closedByAgent[aid]) closedByAgent[aid] = { won: 0, lost: 0 };
    if (row.status === 'won')  closedByAgent[aid].won  += 1;
    if (row.status === 'lost') closedByAgent[aid].lost += 1;
  }

  // .filter(d.won + d.lost > 0) excludes agents with no closed leads from the average
  const agentConvRates = Object.values(closedByAgent)
    .filter((d) => d.won + d.lost > 0)
    .map((d) => (d.won / (d.won + d.lost)) * 100);

  const avgConversionRate = agentConvRates.length > 0
    ? agentConvRates.reduce((a, b) => a + b, 0) / agentConvRates.length
    : null;

  // ── 4. Avg response time: first-touch activities across all peer agents ──
  // One query on lead_activities for all peer agents, joined to leads.
  const { data: responseRows } = await supabase
    .from('lead_activities')
    .select('actor_id, created_at, lead:leads!lead_activities_lead_id_fkey(created_at)')
    .in('actor_id', agentIds)
    .eq('action_type', 'status_changed')
    .filter('details->>new_status', 'eq', 'touched')
    .gte('created_at', from)
    .lte('created_at', to);

  // Per-agent response diffs → unweighted mean of means (see comment block above)
  // .filter(diffs.length > 0) excludes agents who touched no leads in the period
  const diffsByAgent: Record<string, number[]> = {};
  for (const row of responseRows ?? []) {
    const aid  = row.actor_id as string;
    const lead = Array.isArray(row.lead) ? row.lead[0] : row.lead;
    if (!lead?.created_at) continue;
    const diffMs = new Date(row.created_at).getTime() - new Date(lead.created_at).getTime();
    if (diffMs < 0) continue;
    if (!diffsByAgent[aid]) diffsByAgent[aid] = [];
    diffsByAgent[aid].push(diffMs / 60000);
  }

  const agentResponseAvgs = Object.values(diffsByAgent)
    .filter((diffs) => diffs.length > 0)
    .map((diffs) => diffs.reduce((a, b) => a + b, 0) / diffs.length);

  const avgResponseTimeMinutes = agentResponseAvgs.length > 0
    ? agentResponseAvgs.reduce((a, b) => a + b, 0) / agentResponseAvgs.length
    : null;

  return {
    avgTouchRate,
    avgConversionRate,
    avgResponseTimeMinutes,
    agentCount,
  };
}
