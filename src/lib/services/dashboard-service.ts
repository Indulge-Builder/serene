// Dashboard-specific queries.
// Never extend leads-service.ts for dashboard data — this file is the dedicated home.
//
// PRIMARY ENTRY POINT: getDashboardSummary() — single cached RPC, all summary widgets.
// Do not split back into individual service function calls for summary data.
// Individual functions below are kept for the period-toggle action and widget refresh buttons.
//
// Redis key inventory:
//   dashboard:agent-tasks:{userId}        — 30s TTL; invalidated by createPersonalTaskAction,
//                                           updateTaskStatusAction, createLeadTaskAction
//   dashboard:lead-status:{effectiveDomain} — 60s TTL; invalidated by updateLeadStatus,
//                                           createManualLead
//   dashboard:lead-volume:{role}:{domain}:{period} — 120s TTL; invalidated by createManualLead
//                                           (manager-scoped keys only; multi-domain keys: TTL-only)
//   dashboard:campaigns:{effectiveDomain} — 120s TTL; invalidated by updateLeadStatus,
//                                           createManualLead

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { redis } from '@/lib/redis';
import { REDIS_KEYS, REDIS_TTL } from '@/lib/constants/redis-keys';
import type { AppDomain, LeadStatus, UserRole } from '@/lib/types/database';
import type { DashboardSummary } from '@/lib/types';

// ─────────────────────────────────────────────
// getDashboardSummary — single RPC, per-request memoised
// Replaces 4 individual queries (agent_tasks, agent_activity, lead_status, campaigns).
//
// Uses React cache() (not unstable_cache) because createClient() reads cookies(),
// which cannot be called inside an unstable_cache closure (Next.js constraint).
// React cache() deduplicates within a single RSC render pass — the RPC fires once
// even if multiple components call getDashboardSummary with the same arguments.
// ─────────────────────────────────────────────

export const getDashboardSummary = cache(
  async (
    role:          UserRole,
    domain:        AppDomain,
    userId:        string,
    initialDomain?: AppDomain,
  ): Promise<DashboardSummary> => {
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('get_dashboard_summary', {
      p_role:           role,
      p_domain:         domain,
      p_user_id:        userId,
      p_initial_domain: initialDomain ?? null,
    });
    if (error) throw error;
    return data as DashboardSummary;
  },
);

// ─────────────────────────────────────────────
// Individual service functions below.
// NOT used for initial page load — getDashboardSummary() handles that.
// Used only for per-widget refresh buttons (user-initiated targeted refetch).
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// Agent Tasks Widget — refresh only (mirrors the RPC CTE shape)
// Redis cache-aside: dashboard:agent-tasks:{userId}, 30s TTL.
// Invalidated by createPersonalTaskAction, updateTaskStatusAction, createLeadTaskAction.
// ─────────────────────────────────────────────

export async function getAgentTasksSummary(agentId: string): Promise<import('@/lib/types').DashboardAgentTask[]> {
  const cacheKey = REDIS_KEYS.dashboardAgentTasks(agentId);

  try {
    const cached = await redis.get<import('@/lib/types').DashboardAgentTask[]>(cacheKey);
    if (cached !== null) return cached;
  } catch (e) {
    console.error('[dashboard-service] getAgentTasksSummary Redis get error:', e);
  }

  const supabase = await createClient();
  const now      = new Date().toISOString();

  const { data: taskRows } = await supabase
    .from('tasks')
    .select(`
      id, title, task_category, task_type, priority, status, due_at,
      task_gia_meta(lead_id, lead:leads!task_gia_meta_lead_id_fkey(first_name, last_name)),
      task_groups(title)
    `)
    .eq('assigned_to', agentId)
    .in('status', ['to_do', 'in_progress', 'in_review'])
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(30);

  type TaskCategory = 'personal' | 'group_subtask' | 'gia_followup';
  type Priority     = 'urgent' | 'high' | 'normal';
  type Status       = 'to_do' | 'in_progress' | 'in_review';

  const result = (taskRows ?? [])
    .map((row) => {
      const category = row.task_category as TaskCategory;
      const meta     = Array.isArray(row.task_gia_meta) ? row.task_gia_meta[0] : row.task_gia_meta;
      const group    = Array.isArray(row.task_groups) ? row.task_groups[0] : row.task_groups;
      const lead     = meta?.lead as { first_name: string; last_name: string | null } | null;

      let contextLabel: string | null = null;
      if (category === 'gia_followup' && lead) {
        contextLabel = [lead.first_name, lead.last_name].filter(Boolean).join(' ');
      } else if (category === 'group_subtask' && group) {
        contextLabel = (group as { title: string }).title;
      }

      return {
        id:            row.id,
        title:         row.title,
        task_category: category,
        task_type:     row.task_type as string,
        priority:      (row.priority as Priority) ?? 'normal',
        status:        row.status as Status,
        due_at:        row.due_at,
        is_overdue:    !!row.due_at && row.due_at < now,
        context_label: contextLabel,
        lead_id:       category === 'gia_followup' ? ((meta?.lead_id as string) ?? null) : null,
      };
    })
    .sort((a, b) => {
      const overdueA = a.is_overdue ? 0 : 1;
      const overdueB = b.is_overdue ? 0 : 1;
      if (overdueA !== overdueB) return overdueA - overdueB;
      const pOrder = { urgent: 1, high: 2, normal: 3 };
      const pDiff  = pOrder[a.priority] - pOrder[b.priority];
      if (pDiff !== 0) return pDiff;
      if (!a.due_at && !b.due_at) return 0;
      if (!a.due_at) return 1;
      if (!b.due_at) return -1;
      return a.due_at < b.due_at ? -1 : 1;
    });

  try {
    await redis.setex(cacheKey, REDIS_TTL.DASHBOARD_AGENT_TASKS, result);
  } catch (e) {
    console.error('[dashboard-service] getAgentTasksSummary Redis setex error:', e);
  }

  return result;
}

// ─────────────────────────────────────────────
// Agent Activity Widget
// Used as initial data; client subscribes to Realtime for updates.
// Role-scoped:
//   admin/founder → all activities (cross-domain)
//   manager       → activities on leads in their domain
//   agent         → only activities where actor_id = agentId
// ─────────────────────────────────────────────

export type AgentActivity = {
  id:          string;
  action_type: string;
  details:     Record<string, unknown> | null;
  created_at:  string;
  lead_id:     string | null;
  lead_name:   string | null;
};

export async function getAgentRecentActivity(
  agentId: string,
  role?: string,
  domain?: string,
): Promise<AgentActivity[]> {
  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('get_agent_recent_activity', {
    p_role:    role ?? 'agent',
    p_domain:  domain ?? null,
    p_user_id: agentId,
  });
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    id:          string;
    action_type: string;
    details:     Record<string, unknown> | null;
    created_at:  string;
    lead_id:     string | null;
    actor_id:    string | null;
    lead_name:   string | null;
  }>;
  return rows.map((row) => ({
    id:          row.id,
    action_type: row.action_type,
    details:     row.details,
    created_at:  row.created_at,
    lead_id:     row.lead_id,
    lead_name:   row.lead_name,
  }));
}

// ─────────────────────────────────────────────
// Manager Lead Status Widget
// Leads grouped by status — one query with GROUP BY simulation via Supabase.
// Returns total per status + per-agent breakdown.
// ─────────────────────────────────────────────

export type LeadStatusCount = {
  status: LeadStatus;
  count:  number;
};

export type AgentStatusBreakdown = {
  agent_id:   string;
  agent_name: string;
  counts:     Partial<Record<LeadStatus, number>>;
  total:      number;
};

export type LeadStatusSummary = {
  totals:   LeadStatusCount[];
  byAgent:  AgentStatusBreakdown[];
};

export async function getLeadStatusSummary(
  role: string,
  domain: AppDomain,
  targetDomain?: AppDomain,
): Promise<LeadStatusSummary> {
  // Key uses effectiveDomain so managers and admin/founder scoped to the same domain
  // share a cache entry. targetDomain narrows admin/founder to a specific domain.
  const effectiveDomain = (role === 'manager' ? domain : targetDomain ?? domain) as string;
  const cacheKey = REDIS_KEYS.dashboardLeadStatus(effectiveDomain);

  try {
    const cached = await redis.get<LeadStatusSummary>(cacheKey);
    if (cached !== null) return cached;
  } catch (e) {
    console.error('[dashboard-service] getLeadStatusSummary Redis get error:', e);
  }

  // Use the effective role/domain for the RPC call.
  // Admin/founder scoped to targetDomain: pass role='manager' so the RPC applies the domain filter.
  // Admin/founder with no targetDomain: pass role='admin' so the RPC skips the domain filter.
  const rpcRole   = (role === 'manager' || targetDomain) ? 'manager' : role;
  const rpcDomain = (role === 'manager' ? domain : targetDomain ?? domain) as AppDomain;

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('get_lead_pipeline_refresh', {
    p_role:   rpcRole,
    p_domain: rpcDomain,
  });

  if (error) throw error;

  const rpcData = data as { totals: LeadStatusCount[]; byAgent: AgentStatusBreakdown[] };
  const result: LeadStatusSummary = {
    totals:  rpcData.totals  ?? [],
    byAgent: rpcData.byAgent ?? [],
  };

  try {
    await redis.setex(cacheKey, REDIS_TTL.DASHBOARD_LEAD_STATUS, result);
  } catch (e) {
    console.error('[dashboard-service] getLeadStatusSummary Redis setex error:', e);
  }

  return result;
}

// ─────────────────────────────────────────────
// Manager Lead Volume Widget
// Incoming leads count over a time period.
// Returns both total count and a daily/weekly time series.
// ─────────────────────────────────────────────

export type VolumePeriod = 'today' | 'week' | 'month' | 'quarter';

export type VolumeDataPoint = {
  label: string;
  count: number;
};

export type LeadVolumeSummary = {
  total:  number;
  series: VolumeDataPoint[];
};

function getPeriodBounds(period: VolumePeriod): { from: Date; to: Date; bucketMs: number } {
  const now = new Date();
  const to  = new Date(now);
  to.setHours(23, 59, 59, 999);

  switch (period) {
    case 'today': {
      const from = new Date(now);
      from.setHours(0, 0, 0, 0);
      return { from, to, bucketMs: 3_600_000 }; // 1hr buckets
    }
    case 'week': {
      const from = new Date(now);
      from.setDate(from.getDate() - 6);
      from.setHours(0, 0, 0, 0);
      return { from, to, bucketMs: 86_400_000 }; // 1d buckets
    }
    case 'month': {
      const from = new Date(now);
      from.setDate(from.getDate() - 29);
      from.setHours(0, 0, 0, 0);
      return { from, to, bucketMs: 86_400_000 }; // 1d buckets
    }
    case 'quarter': {
      const from = new Date(now);
      from.setDate(from.getDate() - 89);
      from.setHours(0, 0, 0, 0);
      return { from, to, bucketMs: 86_400_000 * 7 }; // 7d buckets
    }
  }
}

function formatBucketLabel(date: Date, period: VolumePeriod): string {
  if (period === 'today') {
    return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  }
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export async function getLeadVolumeByPeriod(
  role: string,
  domain: AppDomain,
  period: VolumePeriod,
): Promise<LeadVolumeSummary> {
  // Role IS in the key — manager domain-locks the query; admin/founder may receive
  // a different scope (no domain restriction).
  const cacheKey = REDIS_KEYS.dashboardLeadVolume(role, domain as string, period);

  try {
    const cached = await redis.get<LeadVolumeSummary>(cacheKey);
    if (cached !== null) return cached;
  } catch (e) {
    console.error('[dashboard-service] getLeadVolumeByPeriod Redis get error:', e);
  }

  const supabase        = await createClient();
  const { from, to, bucketMs } = getPeriodBounds(period);

  let query = supabase
    .from('leads')
    .select('created_at')
    .is('archived_at', null)
    .gte('created_at', from.toISOString())
    .lte('created_at', to.toISOString());

  if (role === 'manager') {
    query = query.eq('domain', domain);
  }

  const { data } = await query;
  const rows = data ?? [];

  // Build time buckets
  const bucketMap: Record<string, number> = {};
  const cursor = new Date(from);

  while (cursor <= to) {
    const key = cursor.toISOString();
    bucketMap[key] = 0;
    cursor.setTime(cursor.getTime() + bucketMs);
  }

  for (const row of rows) {
    const ts        = new Date(row.created_at).getTime();
    const fromMs    = from.getTime();
    const bucketIdx = Math.floor((ts - fromMs) / bucketMs);
    const bucketStart = new Date(fromMs + bucketIdx * bucketMs);
    const key       = bucketStart.toISOString();
    if (key in bucketMap) {
      bucketMap[key] += 1;
    }
  }

  const series: VolumeDataPoint[] = Object.entries(bucketMap).map(([key, count]) => ({
    label: formatBucketLabel(new Date(key), period),
    count,
  }));

  const result: LeadVolumeSummary = { total: rows.length, series };

  try {
    await redis.setex(cacheKey, REDIS_TTL.DASHBOARD_LEAD_VOLUME, result);
  } catch (e) {
    console.error('[dashboard-service] getLeadVolumeByPeriod Redis setex error:', e);
  }

  return result;
}

// ─────────────────────────────────────────────
// Multi-domain Lead Volume
// Returns per-domain series so the widget can render 4 lines.
// Used by admin/founder domain-picker view; manager uses single-domain above.
// ─────────────────────────────────────────────

export type MultiDomainVolumePoint = {
  label:       string;
  [domain: string]: number | string; // domain keys are dynamic
};

export type MultiDomainVolumeSummary = {
  domains: AppDomain[];
  totals:  Record<AppDomain, number>;
  series:  MultiDomainVolumePoint[];
};

export async function getLeadVolumeByDomains(
  domains: AppDomain[],
  period: VolumePeriod,
): Promise<MultiDomainVolumeSummary> {
  const cacheKey = REDIS_KEYS.dashboardLeadVolumeMulti(domains as string[], period);

  try {
    const cached = await redis.get<MultiDomainVolumeSummary>(cacheKey);
    if (cached !== null) return cached;
  } catch (e) {
    console.error('[dashboard-service] getLeadVolumeByDomains Redis get error:', e);
  }

  const supabase = await createClient();
  const { from, to, bucketMs } = getPeriodBounds(period);

  const { data } = await supabase
    .from('leads')
    .select('created_at, domain')
    .is('archived_at', null)
    .gte('created_at', from.toISOString())
    .lte('created_at', to.toISOString())
    .in('domain', domains);

  const rows = (data ?? []) as { created_at: string; domain: string }[];

  // Build bucket keys
  const bucketKeys: string[] = [];
  const cursor = new Date(from);
  while (cursor <= to) {
    bucketKeys.push(cursor.toISOString());
    cursor.setTime(cursor.getTime() + bucketMs);
  }

  // Per-domain bucket maps
  const domainMaps: Record<string, Record<string, number>> = {};
  for (const d of domains) {
    domainMaps[d] = Object.fromEntries(bucketKeys.map((k) => [k, 0]));
  }

  for (const row of rows) {
    if (!domainMaps[row.domain]) continue;
    const ts        = new Date(row.created_at).getTime();
    const fromMs    = from.getTime();
    const bucketIdx = Math.floor((ts - fromMs) / bucketMs);
    const bucketStart = new Date(fromMs + bucketIdx * bucketMs);
    const key       = bucketStart.toISOString();
    if (key in domainMaps[row.domain]) {
      domainMaps[row.domain][key] += 1;
    }
  }

  const series: MultiDomainVolumePoint[] = bucketKeys.map((key) => {
    const point: MultiDomainVolumePoint = { label: formatBucketLabel(new Date(key), period) };
    for (const d of domains) {
      point[d] = domainMaps[d][key] ?? 0;
    }
    return point;
  });

  const totals = Object.fromEntries(
    domains.map((d) => [d, rows.filter((r) => r.domain === d).length]),
  ) as Record<AppDomain, number>;

  const result: MultiDomainVolumeSummary = { domains, totals, series };

  try {
    await redis.setex(cacheKey, REDIS_TTL.DASHBOARD_LEAD_VOLUME, result);
  } catch (e) {
    console.error('[dashboard-service] getLeadVolumeByDomains Redis setex error:', e);
  }

  return result;
}

// ─────────────────────────────────────────────
// Manager Campaign Widget
// Leads per utm_campaign, with status mix.
// ─────────────────────────────────────────────

export type CampaignStatusMix = {
  campaign: string;
  total:    number;
  mix:      Partial<Record<LeadStatus, number>>;
};

export async function getLeadsByCampaign(
  role: string,
  domain: AppDomain,
  targetDomain?: AppDomain,
): Promise<CampaignStatusMix[]> {
  const effectiveDomain = (role === 'manager' ? domain : targetDomain ?? domain) as string;
  const cacheKey = REDIS_KEYS.dashboardCampaigns(effectiveDomain);

  try {
    const cached = await redis.get<CampaignStatusMix[]>(cacheKey);
    if (cached !== null) return cached;
  } catch (e) {
    console.error('[dashboard-service] getLeadsByCampaign Redis get error:', e);
  }

  const rpcRole   = (role === 'manager' || targetDomain) ? 'manager' : role;
  const rpcDomain = (role === 'manager' ? domain : targetDomain ?? domain) as AppDomain;

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('get_campaign_pipeline_refresh', {
    p_role:   rpcRole,
    p_domain: rpcDomain,
  });

  if (error) throw error;

  const result = (data ?? []) as CampaignStatusMix[];

  try {
    await redis.setex(cacheKey, REDIS_TTL.DASHBOARD_CAMPAIGNS, result);
  } catch (e) {
    console.error('[dashboard-service] getLeadsByCampaign Redis setex error:', e);
  }

  return result;
}
