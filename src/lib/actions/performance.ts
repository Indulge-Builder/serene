'use server';

import { z }                         from 'zod';
import { requireProfile }            from '@/lib/actions/_auth';
import {
  getAgentPerformanceSummary,
  getAgentDetailMetrics,
  getAgentRosterPerformance,
  getDomainHealthMetrics,
  getAgentTodayPulse,
  getAgentLeadActivityPage,
  getPeriodDateRange,
  type PerformancePeriod,
  type AgentPerformanceSummary,
  type AgentTodayPulse,
  type AgentLeadActivityPage,
} from '@/lib/services/performance-service';
import { upsertDomainTarget }        from '@/lib/services/domain-targets-service';
import { GIA_DOMAINS, GIA_DOMAIN_ENUM } from '@/lib/constants/domains';
import type { ActionResult, AgentDetailMetrics, AgentRosterRow, DomainHealthCard, DomainTarget } from '@/lib/types/index';
import type { AppDomain }            from '@/lib/types/database';

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
// Action: getAgentSelfMetricsAction
// Agent self-view only. Returns all data needed for the performance shell.
// ─────────────────────────────────────────────

// Shape alias kept for the client shell's import — the payload now arrives
// from the single get_agent_performance RPC (perf audit D-2).
export type AgentSelfMetrics = AgentPerformanceSummary;

export async function getAgentSelfMetricsAction(
  period:      PerformancePeriod,
  customFrom?: string,
  customTo?:   string,
): Promise<ActionResult<AgentSelfMetrics>> {
  const parsed = GetAgentSelfSchema.safeParse({ period, customFrom, customTo });
  if (!parsed.success) return { data: null, error: 'Invalid parameters.' };

  // The RPC is self-scoped (auth.uid() inside) — the role gate here is the
  // action-layer check; no caller id is passed anywhere.
  const auth = await requireProfile(['agent']);
  if (!auth.ok) return auth.result;

  try {
    const data = await getAgentPerformanceSummary(period, customFrom, customTo);
    return { data, error: null };
  } catch {
    return { data: null, error: 'Failed to load performance data.' };
  }
}

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
