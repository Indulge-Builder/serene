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
import { createAdminClient } from '@/lib/supabase/admin';
import { redis } from '@/lib/redis';
import { REDIS_KEYS, REDIS_TTL } from '@/lib/constants/redis-keys';
import type { AppDomain, LeadStatus, UserRole } from '@/lib/types/database';
import type { DashboardSummary } from '@/lib/types';
import type { DateRange } from '@/lib/utils/date-range';

// ─────────────────────────────────────────────
// getDashboardSummary — single RPC, per-request memoised
// Replaces 4 individual queries (agent_tasks, agent_activity, lead_status, campaigns).
//
// Uses React cache() for per-request dedup — the RPC fires once even if multiple
// components call getDashboardSummary with the same arguments in one RSC pass.
// (unstable_cache stays off the table: the result is per-user, not shareable.)
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
    // get_dashboard_summary trusts p_role/p_domain — EXECUTE revoked from
    // `authenticated` (migration 0102, audit F-1). Admin client only; every
    // caller passes session-derived scope (Q-13: the caller is the trust boundary).
    const supabase = createAdminClient();
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
    const summary = data as DashboardSummary;
    return {
      ...summary,
      lead_status: normalizeLeadStatusSummary(summary.lead_status),
    };
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

  type TaskCategory = 'personal' | 'group_subtask';
  type Priority     = 'urgent' | 'high' | 'normal';
  type Status       = 'to_do' | 'in_progress' | 'in_review';

  const result = (taskRows ?? [])
    .map((row) => {
      const category = row.task_category as TaskCategory;
      const meta     = Array.isArray(row.task_gia_meta) ? row.task_gia_meta[0] : row.task_gia_meta;
      const group    = Array.isArray(row.task_groups) ? row.task_groups[0] : row.task_groups;
      const lead     = meta?.lead as { first_name: string; last_name: string | null } | null;

      // A task_gia_meta row exists IFF the task is a lead follow-up (single-writer
      // invariant) — meta-presence is the lead-task signal, replacing the retired
      // task_category='gia_followup' check (a lead task is now category 'personal').
      const isLeadTask = meta != null;

      let contextLabel: string | null = null;
      if (isLeadTask && lead) {
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
        lead_id:       isLeadTask ? ((meta?.lead_id as string) ?? null) : null,
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
// Recent Lead Activity Widget (migration 0132 — lead rollup, NOT an event stream)
// One card per lead, most-recently-worked first: status + latest call outcome +
// latest note. Sourced from `leads` (denormalised). Used as initial data; the
// widget re-fetches on scope toggle / refresh.
// Scope:
//   'mine' → leads assigned to the caller, any role.
//   'team' → agent: own leads; manager: own domain; admin/founder: targetDomain
//            when set, else all-org.
// ─────────────────────────────────────────────

export type RecentLeadScope = 'mine' | 'team';

export type AgentActivity = {
  lead_id:           string;
  lead_slug:         string | null;
  lead_name:         string | null;
  lead_domain:       string | null;
  status:            string;
  last_call_outcome: string | null;
  last_activity_at:  string | null;
  assigned_to:       string | null;
  assignee_name:     string | null;
  note_body:         string | null;
};

export async function getAgentRecentActivity(
  agentId: string,
  role?: string,
  domain?: string,
  targetDomain?: AppDomain,
  scope: RecentLeadScope = 'team',
): Promise<AgentActivity[]> {
  // 'team' is role-scoped in SQL (agent → own, manager → domain, admin/founder →
  // targetDomain or all). For a manager, p_domain is always their own domain;
  // admin/founder pass the global-selector targetDomain (null = all-org). 'mine'
  // ignores domain entirely — it is assignee-scoped to p_user_id in SQL.
  const rpcDomain = role === 'manager' ? (domain ?? null) : (targetDomain ?? null);

  // EXECUTE revoked from `authenticated` (0102/0132, Q-13) — admin client; scope
  // args are session-derived by the dashboard action/page (caller = trust boundary).
  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('get_recent_lead_activity', {
    p_role:    role ?? 'agent',
    p_domain:  rpcDomain,
    p_user_id: agentId,
    p_scope:   scope,
  });
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    lead_id:           string;
    lead_slug:         string | null;
    lead_name:         string | null;
    lead_domain:       string | null;
    status:            string;
    last_call_outcome: string | null;
    last_activity_at:  string | null;
    assigned_to:       string | null;
    assignee_name:     string | null;
    note_body:         string | null;
  }>;
  return rows.map((row) => ({
    lead_id:           row.lead_id,
    lead_slug:         row.lead_slug,
    lead_name:         row.lead_name,
    lead_domain:       row.lead_domain,
    status:            row.status,
    last_call_outcome: row.last_call_outcome,
    last_activity_at:  row.last_activity_at,
    assigned_to:       row.assigned_to,
    assignee_name:     row.assignee_name,
    note_body:         row.note_body,
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

/** Coerce jsonb counts to numbers and derive agent totals from status mix (RPC SUM fix + stale Redis). */
export function normalizeLeadStatusSummary(raw: LeadStatusSummary): LeadStatusSummary {
  const totals = (raw.totals ?? []).map((t) => ({
    status: t.status,
    count:  Number(t.count),
  }));

  const byAgent = (raw.byAgent ?? [])
    .map((agent) => {
      const counts = Object.fromEntries(
        Object.entries(agent.counts ?? {}).map(([status, n]) => [status, Number(n)]),
      ) as Partial<Record<LeadStatus, number>>;
      const total = Object.values(counts).reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0);
      return {
        agent_id:   agent.agent_id,
        agent_name: agent.agent_name,
        counts,
        total,
      };
    })
    .sort((a, b) => b.total - a.total);

  return { totals, byAgent };
}

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
    if (cached !== null) return normalizeLeadStatusSummary(cached);
  } catch (e) {
    console.error('[dashboard-service] getLeadStatusSummary Redis get error:', e);
  }

  const rpcRole   = (role === 'manager' || targetDomain) ? 'manager' : role;
  const rpcDomain = (role === 'manager' ? domain : targetDomain ?? domain) as AppDomain;

  // EXECUTE revoked from `authenticated` (0102, F-1) — admin client; scope args
  // are session-derived by the dashboard action/page (Q-13).
  const supabase = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any).rpc('get_lead_pipeline_refresh', {
    p_role:      rpcRole,
    p_domain:    rpcDomain,
    p_date_from: dateRange?.from ?? null,
    p_date_to:   dateRange?.to   ?? null,
  });

  if (error) throw error;

  const rpcData = data as { totals: LeadStatusCount[]; byAgent: AgentStatusBreakdown[] };
  const result = normalizeLeadStatusSummary({
    totals:  rpcData.totals  ?? [],
    byAgent: rpcData.byAgent ?? [],
  });

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

/** Align a timestamp to the start of its bucket (same math for init + assignment). */
function bucketStartMs(fromMs: number, bucketMs: number, tsMs: number): number {
  return fromMs + Math.floor((tsMs - fromMs) / bucketMs) * bucketMs;
}

function bucketKey(fromMs: number, bucketMs: number, tsMs: number): string {
  return new Date(bucketStartMs(fromMs, bucketMs, tsMs)).toISOString();
}

/** Chronological bucket keys from `from` through `to` (inclusive of the bucket containing `to`). */
function buildBucketKeys(fromMs: number, toMs: number, bucketMs: number): string[] {
  const keys: string[] = [];
  let ms = fromMs;
  while (ms <= toMs) {
    keys.push(new Date(ms).toISOString());
    ms += bucketMs;
  }
  const endKey = bucketKey(fromMs, bucketMs, toMs);
  if (!keys.includes(endKey)) keys.push(endKey);
  return keys;
}

const LEAD_VOLUME_PAGE_SIZE = 1000;

type VolumeLeadRow = { created_at: string; domain?: string };

/** Paginate past PostgREST's default 1000-row cap — same intake window as pipeline RPCs. */
async function fetchVolumeLeads(
  dateRange: DateRange,
  opts: { role: string; domain?: AppDomain; domains?: AppDomain[] },
): Promise<VolumeLeadRow[]> {
  const supabase = await createClient();
  const rows: VolumeLeadRow[] = [];
  let offset = 0;

  while (true) {
    let query = supabase
      .from('leads')
      .select('created_at, domain')
      .is('archived_at', null)
      .gte('created_at', dateRange.from)
      .lt('created_at', dateRange.to)
      .order('created_at', { ascending: true })
      .range(offset, offset + LEAD_VOLUME_PAGE_SIZE - 1);

    if (opts.role === 'manager' && opts.domain) {
      query = query.eq('domain', opts.domain);
    }
    if (opts.domains?.length) {
      query = query.in('domain', opts.domains);
    }

    const { data, error } = await query;
    if (error) throw error;
    const page = (data ?? []) as VolumeLeadRow[];
    rows.push(...page);
    if (page.length < LEAD_VOLUME_PAGE_SIZE) break;
    offset += LEAD_VOLUME_PAGE_SIZE;
  }

  return rows;
}

function buildVolumeSeries(
  rows: VolumeLeadRow[],
  fromMs: number,
  toMs: number,
  bucketMs: number,
): { total: number; series: VolumeDataPoint[] } {
  const bucketKeys = buildBucketKeys(fromMs, toMs, bucketMs);
  const bucketMap = Object.fromEntries(bucketKeys.map((k) => [k, 0]));

  for (const row of rows) {
    const tsMs = new Date(row.created_at).getTime();
    if (tsMs < fromMs || tsMs >= toMs) continue;
    const key = bucketKey(fromMs, bucketMs, tsMs);
    bucketMap[key] = (bucketMap[key] ?? 0) + 1;
  }

  const series: VolumeDataPoint[] = bucketKeys
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
    .map((key) => ({
      label: formatBucketLabel(new Date(key), bucketMs),
      count: bucketMap[key] ?? 0,
    }));

  return { total: rows.length, series };
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

  const from     = new Date(dateRange.from);
  const to       = new Date(dateRange.to);
  const fromMs   = from.getTime();
  const toMs     = to.getTime();
  const bucketMs = inferBucketMs(from, to);

  const rows = await fetchVolumeLeads(dateRange, {
    role,
    domain: role === 'manager' ? domain : undefined,
  });

  const result: LeadVolumeSummary = buildVolumeSeries(rows, fromMs, toMs, bucketMs);

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

  const from     = new Date(dateRange.from);
  const to       = new Date(dateRange.to);
  const fromMs   = from.getTime();
  const toMs     = to.getTime();
  const bucketMs = inferBucketMs(from, to);

  const rows = await fetchVolumeLeads(dateRange, { role: 'admin', domains });

  const bucketKeys = buildBucketKeys(fromMs, toMs, bucketMs);

  const domainMaps: Record<string, Record<string, number>> = {};
  for (const d of domains) {
    domainMaps[d] = Object.fromEntries(bucketKeys.map((k) => [k, 0]));
  }

  for (const row of rows) {
    if (!row.domain || !domainMaps[row.domain]) continue;
    const tsMs = new Date(row.created_at).getTime();
    if (tsMs < fromMs || tsMs >= toMs) continue;
    const key = bucketKey(fromMs, bucketMs, tsMs);
    domainMaps[row.domain][key] = (domainMaps[row.domain][key] ?? 0) + 1;
  }

  const series: MultiDomainVolumePoint[] = bucketKeys
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
    .map((key) => {
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

  // EXECUTE revoked from `authenticated` (0102, F-1) — admin client; scope args
  // are session-derived by the dashboard action/page (Q-13).
  const supabase = createAdminClient();
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
