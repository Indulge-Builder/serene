'use server';

import { z }                         from 'zod';
import { requireProfile }            from '@/lib/actions/_auth';
import {
  getAgentPerformanceSummary,
  getAgentDetailMetrics,
  getAgentRosterPerformance,
  getDomainHealthMetrics,
  getPeriodDateRange,
  type PerformancePeriod,
  type AgentPerformanceSummary,
} from '@/lib/services/performance-service';
import { GIA_DOMAINS }               from '@/lib/constants/domains';
import type { ActionResult, AgentDetailMetrics, AgentRosterRow, DomainHealthCard } from '@/lib/types/index';
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
