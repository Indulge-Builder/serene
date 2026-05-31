'use server';

import { z }                         from 'zod';
import { getCurrentProfile }         from '@/lib/services/profiles-service';
import {
  getAgentDetailMetrics,
  getPeriodDateRange,
  type PerformancePeriod,
} from '@/lib/services/performance-service';
import type { ActionResult, AgentDetailMetrics } from '@/lib/types/index';
import type { AppDomain }            from '@/lib/types/database';

// ─────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────

const GetAgentDetailSchema = z.object({
  agentId:    z.string().uuid(),
  domain:     z.string().min(1).nullable().optional(),
  period:     z.enum(['this_week', 'this_month', 'last_month', 'all_time', 'custom']),
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

  const caller = await getCurrentProfile();
  if (!caller) return { data: null, error: 'Not authenticated.' };

  // Authorization: manager can only view agents in their own domain.
  // Admin/founder pass domain=null (all-domains view) and are unrestricted.
  if (caller.role === 'agent' || caller.role === 'guest') {
    return { data: null, error: 'Access denied.' };
  }
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
