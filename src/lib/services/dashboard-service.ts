// Dashboard-specific queries.
// Never extend leads-service.ts for dashboard data — this file is the dedicated home.
//
// PRIMARY ENTRY POINT: getDashboardSummary() — single cached RPC, all summary widgets.
// Do not split back into individual service function calls for summary data.
// Individual functions below are kept for reference and the period-toggle action only.

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
  async (role: UserRole, domain: AppDomain, userId: string): Promise<DashboardSummary> => {
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any).rpc('get_dashboard_summary', {
      p_role:    role,
      p_domain:  domain,
      p_user_id: userId,
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
// ─────────────────────────────────────────────

export async function getAgentTasksSummary(agentId: string): Promise<import('@/lib/types').DashboardAgentTask[]> {
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

  return (taskRows ?? [])
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

  // For manager: fetch lead IDs in their domain first, then filter activities.
  // For admin/founder: no filter. For agent: filter by actor_id.
  let leadIdFilter: string[] | null = null;
  if (role === 'manager' && domain) {
    const { data: domainLeads } = await supabase
      .from('leads')
      .select('id')
      .eq('domain', domain as AppDomain)
      .is('archived_at', null)
      .limit(1000);
    leadIdFilter = (domainLeads ?? []).map((r) => r.id);
  }

  let query = supabase
    .from('lead_activities')
    .select('id, action_type, details, created_at, lead_id, lead:leads!lead_activities_lead_id_fkey(first_name, last_name)')
    .order('created_at', { ascending: false })
    .limit(25);

  if (role === 'admin' || role === 'founder') {
    // no additional filter — all activities visible
  } else if (role === 'manager' && leadIdFilter) {
    if (leadIdFilter.length === 0) return [];
    query = query.in('lead_id', leadIdFilter);
  } else {
    query = query.eq('actor_id', agentId);
  }

  const { data } = await query;

  return (data ?? []).map((row) => {
    const lead     = row.lead as { first_name: string; last_name: string | null } | null;
    const leadName = lead ? [lead.first_name, lead.last_name].filter(Boolean).join(' ') : null;
    return {
      id:          row.id,
      action_type: row.action_type as string,
      details:     row.details as Record<string, unknown> | null,
      created_at:  row.created_at,
      lead_id:     row.lead_id,
      lead_name:   leadName,
    };
  });
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
  // Role is not in the key — managers/admins/founders in the same domain see
  // identical lead status data. Manager uses `domain`; admin/founder use `targetDomain`
  // (which, when set, narrows to the same domain). Result is domain-equivalent.
  const effectiveDomain = (role === 'manager' ? domain : targetDomain ?? domain) as string;
  const cacheKey = REDIS_KEYS.dashboardLeadStatus(effectiveDomain);

  try {
    const cached = await redis.get<LeadStatusSummary>(cacheKey);
    if (cached !== null) return cached;
  } catch (e) {
    console.error('[dashboard-service] getLeadStatusSummary Redis get error:', e);
  }

  const supabase = await createClient();

  // Fetch all active leads with assigned agent and status in one query
  let query = supabase
    .from('leads')
    .select('status, assigned_to, assignee:profiles!leads_assigned_to_fkey(full_name)')
    .is('archived_at', null);

  if (role === 'manager') {
    query = query.eq('domain', domain);
  } else if (targetDomain) {
    query = query.eq('domain', targetDomain);
  }

  const { data } = await query;
  const rows = (data ?? []) as Array<{
    status:     string;
    assigned_to: string | null;
    assignee:   { full_name: string } | null;
  }>;

  // Aggregate totals
  const totalMap: Partial<Record<LeadStatus, number>> = {};
  for (const row of rows) {
    const s = row.status as LeadStatus;
    totalMap[s] = (totalMap[s] ?? 0) + 1;
  }

  const statusOrder: LeadStatus[] = ['new', 'touched', 'in_discussion', 'nurturing', 'won', 'lost', 'junk'];
  const totals: LeadStatusCount[] = statusOrder
    .map((s) => ({ status: s, count: totalMap[s] ?? 0 }))
    .filter((s) => s.count > 0);

  // Per-agent breakdown
  const agentMap: Record<string, AgentStatusBreakdown> = {};
  for (const row of rows) {
    if (!row.assigned_to) continue;
    if (!agentMap[row.assigned_to]) {
      agentMap[row.assigned_to] = {
        agent_id:   row.assigned_to,
        agent_name: row.assignee?.full_name ?? 'Unknown',
        counts:     {},
        total:      0,
      };
    }
    const s = row.status as LeadStatus;
    agentMap[row.assigned_to].counts[s] = (agentMap[row.assigned_to].counts[s] ?? 0) + 1;
    agentMap[row.assigned_to].total += 1;
  }

  const byAgent = Object.values(agentMap).sort((a, b) => b.total - a.total);

  const result: LeadStatusSummary = { totals, byAgent };

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

  const supabase = await createClient();

  let query = supabase
    .from('leads')
    .select('utm_campaign, status')
    .is('archived_at', null)
    .not('utm_campaign', 'is', null);

  if (role === 'manager') {
    query = query.eq('domain', domain);
  } else if (targetDomain) {
    query = query.eq('domain', targetDomain);
  }

  const { data } = await query;
  const rows = (data ?? []) as Array<{ utm_campaign: string | null; status: string }>;

  const campaignMap: Record<string, CampaignStatusMix> = {};
  for (const row of rows) {
    const campaign = row.utm_campaign;
    if (!campaign) continue;
    if (!campaignMap[campaign]) {
      campaignMap[campaign] = { campaign, total: 0, mix: {} };
    }
    const s = row.status as LeadStatus;
    campaignMap[campaign].mix[s] = (campaignMap[campaign].mix[s] ?? 0) + 1;
    campaignMap[campaign].total += 1;
  }

  const result = Object.values(campaignMap).sort((a, b) => b.total - a.total).slice(0, 12);

  try {
    await redis.setex(cacheKey, REDIS_TTL.DASHBOARD_CAMPAIGNS, result);
  } catch (e) {
    console.error('[dashboard-service] getLeadsByCampaign Redis setex error:', e);
  }

  return result;
}
