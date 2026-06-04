// Dashboard-specific queries.
// Never extend leads-service.ts for dashboard data — this file is the dedicated home.
//
// PRIMARY ENTRY POINT: getDashboardSummary() — single cached RPC, all summary widgets.
// Do not split back into individual service function calls for summary data.
// Individual functions below are kept for the period-toggle action and widget refresh buttons.
//
// Redis key inventory (all date-range namespaced — from/to in key, 'all' when no filter):
//   dashboard:agent-tasks:{userId}                    — 30s TTL
//   dashboard:lead-status:{domain}:{from}:{to}        — 60s TTL
//   dashboard:lead-volume:{role}:{domain}:{from}:{to} — 120s TTL
//   dashboard:lead-volume:multi:{domains}:{from}:{to} — 120s TTL
//   dashboard:campaigns:{domain}:{from}:{to}          — 120s TTL
//
// Invalidation: TTL-only for dashboard data. A new lead bumps the TTL-based stale window.
// For lead-status and campaigns: any date range with the same domain shares a slot —
// changing the range produces a new key, so no cross-range bleed.

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { redis } from '@/lib/redis';
import { REDIS_KEYS, REDIS_TTL } from '@/lib/constants/redis-keys';
import type { AppDomain, LeadStatus, UserRole } from '@/lib/types/database';
import type { DashboardSummary } from '@/lib/types';
import type { DateRange } from '@/lib/utils/date-range';

// ─────────────────────────────────────────────
// getDashboardSummary — single RPC, per-request memoised
// Replaces 4 individual queries (agent_tasks, agent_activity, lead_status, campaigns).
//
// Uses React cache() (not unstable_cache) because createClient() reads cookies(),
// which cannot be called inside an unstable_cache closure (Next.js constraint).
// React cache() deduplicates within a single RSC render pass — the RPC fires once
// even if multiple components call getDashboardSummary with the same arguments.
//
// dateRange is passed through to the lead_status + campaigns CTEs only.
// agent_tasks and agent_activity are always "live" and ignore the range.
// ─────────────────────────────────────────────

export const getDashboardSummary = cache(
  async (
    role:          UserRole,
    domain:        AppDomain,
    userId:        string,
    initialDomain?: AppDomain,
    dateRange?:    DateRange,
  ): Promise<DashboardSummary> => {
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('get_dashboard_summary', {
      p_role:           role,
      p_domain:         domain,
      p_user_id:        userId,
      p_initial_domain: initialDomain ?? null,
      p_date_from:      dateRange?.from ?? null,
      p_date_to:        dateRange?.to   ?? null,
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
// Returns total per status + per-agent breakdown.
// dateRange filters by leads.created_at (intake/cohort date).
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
  role:          string,
  domain:        AppDomain,
  targetDomain?: AppDomain,
  dateRange?:    DateRange,
): Promise<LeadStatusSummary> {
  const effectiveDomain = (role === 'manager' ? domain : targetDomain ?? domain) as string;
  const cacheKey = REDIS_KEYS.dashboardLeadStatus(effectiveDomain, dateRange?.from, dateRange?.to);

  try {
    const cached = await redis.get<LeadStatusSummary>(cacheKey);
    if (cached !== null) return cached;
  } catch (e) {
    console.error('[dashboard-service] getLeadStatusSummary Redis get error:', e);
  }

  const rpcRole   = (role === 'manager' || targetDomain) ? 'manager' : role;
  const rpcDomain = (role === 'manager' ? domain : targetDomain ?? domain) as AppDomain;

  const supabase = await createClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('get_lead_pipeline_refresh', {
    p_role:      rpcRole,
    p_domain:    rpcDomain,
    p_date_from: dateRange?.from ?? null,
    p_date_to:   dateRange?.to   ?? null,
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
// Incoming leads count over a time window (defined by DateRange, not a preset).
// Granularity is inferred from the span so chart labels are always meaningful.
// dateRange filters by leads.created_at.
// ─────────────────────────────────────────────

export type VolumeDataPoint = {
  label: string;
  count: number;
};

export type LeadVolumeSummary = {
  total:  number;
  series: VolumeDataPoint[];
};

// Keep VolumePeriod for backwards compat — actions/widgets no longer use it for the
// global date filter, but the type may still be referenced elsewhere.
export type VolumePeriod = 'today' | 'week' | 'month' | 'quarter';

function inferBucketMs(from: Date, to: Date): number {
  const spanMs = to.getTime() - from.getTime();
  const day    = 86_400_000;
  if (spanMs <= 2 * day)     return 3_600_000;    // ≤ 2 days  → hourly
  if (spanMs <= 60 * day)    return day;           // ≤ 60 days → daily
  if (spanMs <= 366 * day)   return 7 * day;       // ≤ 1 year  → weekly
  return 30 * day;                                 // else      → ~monthly
}

function formatBucketLabel(date: Date, bucketMs: number): string {
  if (bucketMs <= 3_600_000) {
    // Hourly — show HH:MM AM/PM
    return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  }
  if (bucketMs >= 30 * 86_400_000) {
    // Monthly
    return date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
  }
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export async function getLeadVolumeByRange(
  role:      string,
  domain:    AppDomain,
  dateRange: DateRange,
): Promise<LeadVolumeSummary> {
  const cacheKey = REDIS_KEYS.dashboardLeadVolume(role, domain as string, dateRange.from, dateRange.to);

  try {
    const cached = await redis.get<LeadVolumeSummary>(cacheKey);
    if (cached !== null) return cached;
  } catch (e) {
    console.error('[dashboard-service] getLeadVolumeByRange Redis get error:', e);
  }

  const supabase = await createClient();
  const from     = new Date(dateRange.from);
  const to       = new Date(dateRange.to);
  const bucketMs = inferBucketMs(from, to);

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

  // Build zero-filled time buckets
  const bucketMap: Record<string, number> = {};
  const cursor = new Date(from);
  while (cursor <= to) {
    bucketMap[cursor.toISOString()] = 0;
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
    label: formatBucketLabel(new Date(key), bucketMs),
    count,
  }));

  const result: LeadVolumeSummary = { total: rows.length, series };

  try {
    await redis.setex(cacheKey, REDIS_TTL.DASHBOARD_LEAD_VOLUME, result);
  } catch (e) {
    console.error('[dashboard-service] getLeadVolumeByRange Redis setex error:', e);
  }

  return result;
}

// ─────────────────────────────────────────────
// Multi-domain Lead Volume (admin/founder)
// dateRange filters by leads.created_at.
// ─────────────────────────────────────────────

export type MultiDomainVolumePoint = {
  label:       string;
  [domain: string]: number | string;
};

export type MultiDomainVolumeSummary = {
  domains: AppDomain[];
  totals:  Record<AppDomain, number>;
  series:  MultiDomainVolumePoint[];
};

export async function getLeadVolumeByDomains(
  domains:   AppDomain[],
  dateRange: DateRange,
): Promise<MultiDomainVolumeSummary> {
  const cacheKey = REDIS_KEYS.dashboardLeadVolumeMulti(domains as string[], dateRange.from, dateRange.to);

  try {
    const cached = await redis.get<MultiDomainVolumeSummary>(cacheKey);
    if (cached !== null) return cached;
  } catch (e) {
    console.error('[dashboard-service] getLeadVolumeByDomains Redis get error:', e);
  }

  const supabase = await createClient();
  const from     = new Date(dateRange.from);
  const to       = new Date(dateRange.to);
  const bucketMs = inferBucketMs(from, to);

  const { data } = await supabase
    .from('leads')
    .select('created_at, domain')
    .is('archived_at', null)
    .gte('created_at', from.toISOString())
    .lte('created_at', to.toISOString())
    .in('domain', domains);

  const rows = (data ?? []) as { created_at: string; domain: string }[];

  const bucketKeys: string[] = [];
  const cursor = new Date(from);
  while (cursor <= to) {
    bucketKeys.push(cursor.toISOString());
    cursor.setTime(cursor.getTime() + bucketMs);
  }

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
    const point: MultiDomainVolumePoint = { label: formatBucketLabel(new Date(key), bucketMs) };
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

// Single-domain volume for admin/founder drill-down tab
export async function getLeadVolumeForDomain(
  domain:    AppDomain,
  dateRange: DateRange,
): Promise<LeadVolumeSummary> {
  // Reuse getLeadVolumeByRange scoped to a single domain (role='manager' applies the filter)
  return getLeadVolumeByRange('manager', domain, dateRange);
}

// ─────────────────────────────────────────────
// Manager Campaign Widget
// dateRange filters by leads.created_at.
// ─────────────────────────────────────────────

export type CampaignStatusMix = {
  campaign: string;
  total:    number;
  mix:      Partial<Record<LeadStatus, number>>;
};

export async function getLeadsByCampaign(
  role:          string,
  domain:        AppDomain,
  targetDomain?: AppDomain,
  dateRange?:    DateRange,
): Promise<CampaignStatusMix[]> {
  const effectiveDomain = (role === 'manager' ? domain : targetDomain ?? domain) as string;
  const cacheKey = REDIS_KEYS.dashboardCampaigns(effectiveDomain, dateRange?.from, dateRange?.to);

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
    p_role:      rpcRole,
    p_domain:    rpcDomain,
    p_date_from: dateRange?.from ?? null,
    p_date_to:   dateRange?.to   ?? null,
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
