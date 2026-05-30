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
  agentId:  z.string().uuid(),
  domain:   z.string().min(1),
  period:   z.enum(['this_week', 'this_month', 'last_month', 'all_time']),
});

// ─────────────────────────────────────────────
// Action: getAgentDetailMetricsAction
// Called by AgentDetailPanel on agent selection change.
// Caller must be manager (own domain), admin, or founder.
// ─────────────────────────────────────────────

export async function getAgentDetailMetricsAction(
  agentId: string,
  domain:  AppDomain,
  period:  PerformancePeriod,
): Promise<ActionResult<AgentDetailMetrics>> {
  const parsed = GetAgentDetailSchema.safeParse({ agentId, domain, period });
  if (!parsed.success) {
    return { data: null, error: 'Invalid parameters.' };
  }

  const caller = await getCurrentProfile();
  if (!caller) return { data: null, error: 'Not authenticated.' };

  // Authorization: manager can only view agents in their own domain
  if (caller.role === 'agent' || caller.role === 'guest') {
    return { data: null, error: 'Access denied.' };
  }
  if (caller.role === 'manager' && caller.domain !== domain) {
    return { data: null, error: 'Access denied.' };
  }

  try {
    const { from, to } = getPeriodDateRange(period);
    const metrics = await getAgentDetailMetrics(agentId, domain, from, to);
    return { data: metrics, error: null };
  } catch {
    return { data: null, error: 'Failed to load agent metrics.' };
  }
}
