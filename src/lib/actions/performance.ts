'use server';

import { z }                         from 'zod';
import { requireProfile }            from '@/lib/actions/_auth';
import {
  getAgentDetailMetrics,
  getAgentRosterPerformance,
  getDomainHealthMetrics,
  getAgentTodayPulse,
  getAgentLeadActivityPage,
  getAgentCallsPageForManager,
  getAgentFirstTouchScorecard,
  getPeriodDateRange,
  type PerformancePeriod,
  type AgentPerformanceSummary,
  type AgentTodayPulse,
  type AgentLeadActivityPage,
  type AgentCallsPage,
  type FirstTouchScorecard,
} from '@/lib/services/performance-service';
import { getLeadsByRole, type LeadsResult }   from '@/lib/services/leads-service';
import { getDealsByRole, type DealsResult }   from '@/lib/services/deals-service';
import { upsertDomainTarget }        from '@/lib/services/domain-targets-service';
import { GIA_DOMAINS, GIA_DOMAIN_ENUM } from '@/lib/constants/domains';
import type { ActionResult, AgentDetailMetrics, AgentRosterRow, DomainHealthCard, DomainTarget } from '@/lib/types/index';
import type { AppDomain, LeadFilters, DealFilters } from '@/lib/types/database';

// ─────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────

const PERIOD_VALUES = ['today', 'this_week', 'this_month', 'last_month', 'all_time', 'custom'] as const;

const GetAgentDetailSchema = z.object({
  agentId:    z.string().uuid(),
  domain:     z.string().min(1).nullable().optional(),
  period:     z.enum(['today', 'this_week', 'this_month', 'last_month', 'all_time', 'custom']),
  customFrom: z.string().datetime().optional(),
  customTo:   z.string().datetime().optional(),
});

const GetAgentSelfSchema = z.object({
  period:     z.enum(PERIOD_VALUES),
  customFrom: z.string().datetime().optional(),
  customTo:   z.string().datetime().optional(),
});

// ─────────────────────────────────────────────
// Action: getAgentDetailMetricsAction
// Called by AgentDetailPanel on agent selection change.
// Caller must be manager (own domain), admin, or founder.
// ─────────────────────────────────────────────

export async function getAgentDetailMetricsAction(
  agentId:    string,
  domain:     AppDomain | null,
  period:     PerformancePeriod,
  customFrom?: string,
  customTo?:   string,
): Promise<ActionResult<AgentDetailMetrics>> {
  const parsed = GetAgentDetailSchema.safeParse({ agentId, domain, period, customFrom, customTo });
  if (!parsed.success) {
    return { data: null, error: 'Invalid parameters.' };
  }

  // Authorization: manager can only view agents in their own domain.
  // Admin/founder pass domain=null (all-domains view) and are unrestricted.
  const auth = await requireProfile(['manager', 'admin', 'founder']);
  if (!auth.ok) return auth.result;
  const caller = auth.profile;
  if (caller.role === 'manager') {
    // Manager must supply their own domain; reject null or mismatched domain.
    if (!domain || caller.domain !== domain) {
      return { data: null, error: 'Access denied.' };
    }
  }

  try {
    const range  = getPeriodDateRange(period);
    const from   = (period === 'custom' && customFrom) ? customFrom : range.from;
    const to     = (period === 'custom' && customTo)   ? customTo   : range.to;
    const metrics = await getAgentDetailMetrics(agentId, domain, from, to);
    return { data: metrics, error: null };
  } catch {
    return { data: null, error: 'Failed to load agent metrics.' };
  }
}

// ─────────────────────────────────────────────
// Action: getAgentFirstTouchScorecardAction
// Called by FirstTouchScorecard (in AgentDetailPanel) on agent/period change.
// Same authz as the deck drill-downs (assertDrillAccess): manager own-domain,
// admin/founder unrestricted. The bucketed aggregate is computed once in the
// service (React cache(), business-minute math per the agent's shift).
// ─────────────────────────────────────────────

export async function getAgentFirstTouchScorecardAction(
  agentId:    string,
  domain:     AppDomain | null,
  period:     PerformancePeriod,
  customFrom?: string,
  customTo?:   string,
): Promise<ActionResult<FirstTouchScorecard>> {
  const parsed = GetAgentDetailSchema.safeParse({ agentId, domain, period, customFrom, customTo });
  if (!parsed.success) return { data: null, error: 'Invalid parameters.' };

  const access = await assertDrillAccess(domain);
  if (!access.ok) return access.result;

  try {
    const range = getPeriodDateRange(period);
    const from  = (period === 'custom' && customFrom) ? customFrom : range.from;
    const to    = (period === 'custom' && customTo)   ? customTo   : range.to;
    const data  = await getAgentFirstTouchScorecard(agentId, from, to);
    return { data, error: null };
  } catch {
    return { data: null, error: 'Failed to load first-touch scorecard.' };
  }
}

// Shape alias kept for the client shell's import — the agent self-view payload
// arrives from the single get_agent_performance RPC (perf audit D-2), fetched
// server-side in the page (the shell key-remounts per range, so there is no
// client-side self-metrics refetch action; the pulse stays a client action).
export type AgentSelfMetrics = AgentPerformanceSummary;

// ─────────────────────────────────────────────
// Action: getManagerRosterAction
// Called by ManagerPerformancePanel on period change (client-side refetch).
// Manager: domain enforced from profile. Founder/admin: allDomains=true, domain ignored.
// ─────────────────────────────────────────────

const GetManagerRosterSchema = z.object({
  period:     z.enum(['today', 'this_week', 'this_month', 'last_month', 'all_time', 'custom']),
  customFrom: z.string().datetime().optional(),
  customTo:   z.string().datetime().optional(),
  allDomains: z.boolean().optional(),
});

export async function getManagerRosterAction(
  period:      PerformancePeriod,
  allDomains:  boolean,
  customFrom?: string,
  customTo?:   string,
): Promise<ActionResult<AgentRosterRow[]>> {
  const parsed = GetManagerRosterSchema.safeParse({ period, allDomains, customFrom, customTo });
  if (!parsed.success) return { data: null, error: 'Invalid parameters.' };

  const auth = await requireProfile(['manager', 'admin', 'founder']);
  if (!auth.ok) return auth.result;
  const caller = auth.profile;

  try {
    const range = getPeriodDateRange(period);
    const from  = (period === 'custom' && customFrom) ? customFrom : range.from;
    const to    = (period === 'custom' && customTo)   ? customTo   : range.to;

    const rosterDomain = (allDomains || caller.role !== 'manager') ? null : caller.domain;
    const agentRoster  = await getAgentRosterPerformance(rosterDomain, from, to);

    return { data: agentRoster, error: null };
  } catch {
    return { data: null, error: 'Failed to load roster data.' };
  }
}

// ─────────────────────────────────────────────
// Action: getDomainHealthMetricsAction
// Called by DomainOverviewPanel on period change (founder Domains tab).
// ─────────────────────────────────────────────

const GetDomainHealthSchema = z.object({
  period:     z.enum(['today', 'this_week', 'this_month', 'last_month', 'all_time', 'custom']),
  customFrom: z.string().datetime().optional(),
  customTo:   z.string().datetime().optional(),
});

export async function getDomainHealthMetricsAction(
  period:      PerformancePeriod,
  customFrom?: string,
  customTo?:   string,
): Promise<ActionResult<DomainHealthCard[]>> {
  const parsed = GetDomainHealthSchema.safeParse({ period, customFrom, customTo });
  if (!parsed.success) return { data: null, error: 'Invalid parameters.' };

  const auth = await requireProfile(['manager', 'admin', 'founder']);
  if (!auth.ok) return auth.result;

  try {
    const range = getPeriodDateRange(period);
    const from  = (period === 'custom' && customFrom) ? customFrom : range.from;
    const to    = (period === 'custom' && customTo)   ? customTo   : range.to;

    const cards = await getDomainHealthMetrics([...GIA_DOMAINS] as AppDomain[], from, to);
    return { data: cards, error: null };
  } catch {
    return { data: null, error: 'Failed to load domain metrics.' };
  }
}

// ─────────────────────────────────────────────
// Action: getAgentPulseAction
// Agent self-view Today tab — calls-today new/old split, 14-day call trend,
// period deals. The RPC is self-scoped (auth.uid() inside).
// ─────────────────────────────────────────────

export async function getAgentPulseAction(
  period:      PerformancePeriod,
  customFrom?: string,
  customTo?:   string,
): Promise<ActionResult<AgentTodayPulse>> {
  const parsed = GetAgentSelfSchema.safeParse({ period, customFrom, customTo });
  if (!parsed.success) return { data: null, error: 'Invalid parameters.' };

  const auth = await requireProfile(['agent']);
  if (!auth.ok) return auth.result;

  try {
    const data = await getAgentTodayPulse(period, customFrom, customTo);
    return { data, error: null };
  } catch {
    return { data: null, error: 'Failed to load today data.' };
  }
}

// ─────────────────────────────────────────────
// Action: getAgentRecentLeadActivityAction
// Keyset "load more" over the agent's lead activities (page ~15).
// The agent id always comes from the verified profile — never the client.
// ─────────────────────────────────────────────

const ActivityCursorSchema = z
  .object({
    created_at: z.string().datetime({ offset: true }),
    id:         z.string().uuid(),
  })
  .optional();

export async function getAgentRecentLeadActivityAction(
  cursor?: { created_at: string; id: string },
): Promise<ActionResult<AgentLeadActivityPage>> {
  const parsed = ActivityCursorSchema.safeParse(cursor);
  if (!parsed.success) return { data: null, error: 'Invalid parameters.' };

  const auth = await requireProfile(['agent']);
  if (!auth.ok) return auth.result;

  try {
    const page = await getAgentLeadActivityPage(auth.profile.id, parsed.data);
    return { data: page, error: null };
  } catch {
    return { data: null, error: 'Failed to load activity.' };
  }
}

// ─────────────────────────────────────────────
// Action: upsertDomainTargetAction
// Founder/admin set a monthly deals-closed target from the domain card's
// edit affordance. Zod first (S-01); RLS write policy is the second layer.
// ─────────────────────────────────────────────

const UpsertDomainTargetSchema = z.object({
  domain: z.enum(GIA_DOMAIN_ENUM),
  targetValue: z
    .number()
    .nonnegative()
    .max(100_000, 'target_too_large'),
});

export async function upsertDomainTargetAction(
  domain:      AppDomain,
  targetValue: number,
): Promise<ActionResult<DomainTarget>> {
  const parsed = UpsertDomainTargetSchema.safeParse({ domain, targetValue });
  if (!parsed.success) {
    return { data: null, error: 'Enter a valid target (a non-negative number).' };
  }

  const auth = await requireProfile(['admin', 'founder']);
  if (!auth.ok) return auth.result;

  const result = await upsertDomainTarget(
    parsed.data.domain,
    parsed.data.targetValue,
    auth.profile.id,
  );
  if (!result.ok) {
    return { data: null, error: 'The target could not be saved. Please try again.' };
  }

  return {
    data: {
      domain:       parsed.data.domain,
      metric:       'deals_closed',
      target_value: parsed.data.targetValue,
      period:       'month',
    },
    error: null,
  };
}

// ─────────────────────────────────────────────
// Founder/manager drill-down actions (Phase 5 deck).
//
// All three mirror getAgentDetailMetricsAction's authz EXACTLY: a manager may
// only drill into an agent in their OWN domain (the `domain` param is a checked
// param — a manager can only ever pass their own domain, else the guard fails
// CLOSED at caller.domain !== domain); admin/founder pass domain=null and are
// unrestricted. The deck holds the roster in memory and passes the target
// agent's domain, which the manager branch re-validates. No client-supplied
// scope is ever trusted (Q-13). These are pure reads — no cache writes.
//
// Leads/deals reuse the EXISTING getLeadsByRole / getDealsByRole service paths
// with filters.agent_id = targetAgentId: those paths already honour agent_id on
// the manager/founder branch (the agent-caller branch ignores it, but these
// actions are gated to manager+, so that branch is unreachable). No service
// query change — only these gated wrappers.
// ─────────────────────────────────────────────

const DrillCursorSchema = z
  .object({
    created_at: z.string().datetime({ offset: true }),
    id:         z.string().uuid(),
  })
  .optional();

const GetAgentDrillSchema = z.object({
  agentId: z.string().uuid(),
  domain:  z.string().min(1).nullable(),
  page:    z.number().int().positive().max(1000).optional(),
  cursor:  DrillCursorSchema,
  // Optional period scoping — when supplied, the leads drill mirrors the deck
  // card's period-scoped count (created_at within the resolved range) so the
  // front tile number and the opened list stay consistent.
  period:     z.enum(PERIOD_VALUES).optional(),
  customFrom: z.string().datetime().optional(),
  customTo:   z.string().datetime().optional(),
});

/** Shared authz preamble — returns the verified caller or an ActionResult error.
 *  Manager may only target an agent in their own domain. */
async function assertDrillAccess(domain: AppDomain | null) {
  const auth = await requireProfile(['manager', 'admin', 'founder']);
  if (!auth.ok) return { ok: false as const, result: auth.result };
  const caller = auth.profile;
  if (caller.role === 'manager') {
    if (!domain || caller.domain !== domain) {
      return { ok: false as const, result: { data: null, error: 'Access denied.' } };
    }
  }
  return { ok: true as const, caller };
}

/** "Recent calls" drill-down — keyset load-more over the agent's call notes.
 *  Called by AgentCallsDrillModal on open. */
export async function getAgentCallsForManagerAction(
  agentId: string,
  domain:  AppDomain | null,
  cursor?: { created_at: string; id: string },
): Promise<ActionResult<AgentCallsPage>> {
  const parsed = GetAgentDrillSchema.safeParse({ agentId, domain, cursor });
  if (!parsed.success) return { data: null, error: 'Invalid parameters.' };

  const access = await assertDrillAccess(domain);
  if (!access.ok) return access.result;

  try {
    const page = await getAgentCallsPageForManager(agentId, parsed.data.cursor);
    return { data: page, error: null };
  } catch {
    return { data: null, error: 'Failed to load calls.' };
  }
}

/** Full activity feed for an agent (all action types) — drill-down reuse of
 *  getAgentLeadActivityPage with the founder/manager authz gate. */
export async function getAgentActivityForManagerAction(
  agentId: string,
  domain:  AppDomain | null,
  cursor?: { created_at: string; id: string },
): Promise<ActionResult<AgentLeadActivityPage>> {
  const parsed = GetAgentDrillSchema.safeParse({ agentId, domain, cursor });
  if (!parsed.success) return { data: null, error: 'Invalid parameters.' };

  const access = await assertDrillAccess(domain);
  if (!access.ok) return access.result;

  try {
    const page = await getAgentLeadActivityPage(agentId, parsed.data.cursor, 'all');
    return { data: page, error: null };
  } catch {
    return { data: null, error: 'Failed to load activity.' };
  }
}

/** Leads assigned to the target agent — drill-down via the existing
 *  getLeadsByRole path scoped by filters.agent_id. Called by AgentLeadsDrillModal. */
export async function getAgentLeadsScopedAction(
  agentId:     string,
  domain:      AppDomain | null,
  page?:       number,
  period?:     PerformancePeriod,
  customFrom?: string,
  customTo?:   string,
): Promise<ActionResult<LeadsResult>> {
  const parsed = GetAgentDrillSchema.safeParse({ agentId, domain, page, period, customFrom, customTo });
  if (!parsed.success) return { data: null, error: 'Invalid parameters.' };

  const access = await assertDrillAccess(domain);
  if (!access.ok) return access.result;
  const caller = access.caller;

  try {
    // Resolve the period range the SAME way getAgentDetailMetricsAction does, so
    // this list filters leads.created_at on exactly the window the roster RPC
    // counted for the card's totalLeads — the front tile and the opened list agree.
    // No period supplied (legacy callers) → no date filter (all-time, prior behaviour).
    let dateFrom: string | null = null;
    let dateTo:   string | null = null;
    if (parsed.data.period) {
      const range = getPeriodDateRange(parsed.data.period);
      dateFrom = (parsed.data.period === 'custom' && parsed.data.customFrom) ? parsed.data.customFrom : range.from;
      dateTo   = (parsed.data.period === 'custom' && parsed.data.customTo)   ? parsed.data.customTo   : range.to;
    }

    const filters: LeadFilters = {
      status:            null,
      last_call_outcome: null,
      domain:            null,
      agent_id:          agentId,
      source:            null,
      campaign:          null,
      date_from:         dateFrom,
      date_to:           dateTo,
      search:            null,
      page:              parsed.data.page ?? 1,
      pageSize:          30,
    };
    // Caller's verified role/domain scope the query; agent_id narrows to the
    // target agent within that scope (honoured on the manager/founder branch).
    const result = await getLeadsByRole(caller.role, caller.id, caller.domain, filters);
    return { data: result, error: null };
  } catch {
    return { data: null, error: 'Failed to load leads.' };
  }
}

/** Deals assigned to the target agent — drill-down via the existing
 *  getDealsByRole path scoped by filters.agent_id. Called by AgentDealsDrillModal. */
export async function getAgentDealsScopedAction(
  agentId: string,
  domain:  AppDomain | null,
  page?:   number,
): Promise<ActionResult<DealsResult>> {
  const parsed = GetAgentDrillSchema.safeParse({ agentId, domain, page });
  if (!parsed.success) return { data: null, error: 'Invalid parameters.' };

  const access = await assertDrillAccess(domain);
  if (!access.ok) return access.result;
  const caller = access.caller;

  try {
    const filters: DealFilters = {
      search:        null,
      domain:        null,
      deal_type:     null,
      deal_category: null,
      agent_id:      agentId,
      date_from:     null,
      date_to:       null,
      page:          parsed.data.page ?? 1,
      pageSize:      50,
    };
    // getDealsByRole requires a non-null AppDomain — pass caller.domain (always
    // non-null on a Profile), never the nullable checked `domain` param.
    const result = await getDealsByRole(caller.role, caller.id, caller.domain, filters);
    return { data: result, error: null };
  } catch {
    return { data: null, error: 'Failed to load deals.' };
  }
}
