// Dashboard-specific queries.
// Never extend leads-service.ts for dashboard data — this file is the dedicated home.
//
// PRIMARY ENTRY POINT: getDashboardSummary() — single cached RPC, all summary widgets.
// Do not split back into individual service function calls for summary data.
// Individual functions below are kept for reference and the period-toggle action only.

import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
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
// Agent Tasks Widget — refresh only
// ─────────────────────────────────────────────

export type AgentTask = {
  id:           string;
  task_type:    string;
  due_at:       string | null;
  lead_id:      string;
  lead_name:    string;
  is_overdue:   boolean;
};

export type AgentTasksSummary = {
  tasks:          AgentTask[];
  newLeadsCount:  number;
};

export async function getAgentTasksSummary(agentId: string): Promise<AgentTasksSummary> {
  const supabase = await createClient();
  const now      = new Date().toISOString();
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const todayEndStr = todayEnd.toISOString();

  // Single query: tasks pending due today or overdue, joined to lead name via task_gia_meta
  const { data: taskRows } = await supabase
    .from('tasks')
    .select('id, task_type, due_at, task_gia_meta!inner(lead_id, lead:leads!task_gia_meta_lead_id_fkey(first_name, last_name))')
    .eq('assigned_to', agentId)
    .eq('status', 'to_do')
    .or(`due_at.lte.${todayEndStr},due_at.is.null`)
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(20);

  const tasks: AgentTask[] = (taskRows ?? []).map((row) => {
    const meta     = Array.isArray(row.task_gia_meta) ? row.task_gia_meta[0] : row.task_gia_meta;
    const lead     = meta?.lead as { first_name: string; last_name: string | null } | null;
    const leadName = lead ? [lead.first_name, lead.last_name].filter(Boolean).join(' ') : 'Unknown';
    return {
      id:         row.id,
      task_type:  row.task_type as string,
      due_at:     row.due_at,
      lead_id:    (meta?.lead_id as string) ?? '',
      lead_name:  leadName,
      is_overdue: !!row.due_at && row.due_at < now,
    };
  });

  // Count new leads — piggyback in the same server function call
  const { count } = await supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('assigned_to', agentId)
    .eq('status', 'new')
    .is('archived_at', null);

  return { tasks, newLeadsCount: count ?? 0 };
}

// ─────────────────────────────────────────────
// Agent Activity Widget
// Last 10 activities performed by the agent.
// Used as initial data; client subscribes to Realtime for updates.
// ─────────────────────────────────────────────

export type AgentActivity = {
  id:          string;
  action_type: string;
  details:     Record<string, unknown> | null;
  created_at:  string;
  lead_id:     string | null;
  lead_name:   string | null;
};

export async function getAgentRecentActivity(agentId: string): Promise<AgentActivity[]> {
  const supabase = await createClient();

  const { data } = await supabase
    .from('lead_activities')
    .select('id, action_type, details, created_at, lead_id, lead:leads!lead_activities_lead_id_fkey(first_name, last_name)')
    .eq('actor_id', agentId)
    .order('created_at', { ascending: false })
    .limit(10);

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
): Promise<LeadStatusSummary> {
  const supabase = await createClient();

  // Fetch all active leads with assigned agent and status in one query
  let query = supabase
    .from('leads')
    .select('status, assigned_to, assignee:profiles!leads_assigned_to_fkey(full_name)')
    .is('archived_at', null);

  if (role === 'manager') {
    query = query.eq('domain', domain);
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

  return { totals, byAgent };
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

  return { total: rows.length, series };
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
): Promise<CampaignStatusMix[]> {
  const supabase = await createClient();

  let query = supabase
    .from('leads')
    .select('utm_campaign, status')
    .is('archived_at', null)
    .not('utm_campaign', 'is', null);

  if (role === 'manager') {
    query = query.eq('domain', domain);
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

  return Object.values(campaignMap).sort((a, b) => b.total - a.total).slice(0, 12);
}
