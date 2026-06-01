import { cache } from 'react';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isGiaDomain, type GiaDomain } from '@/lib/constants/domains';
import { redis } from '@/lib/redis';
import {
  REDIS_KEYS,
  REDIS_TTL,
  buildLeadListKey,
  CAMPAIGN_LIST_TTL,
  CAMPAIGN_DETAIL_TTL,
  CAMPAIGN_DISTRIBUTION_TTL,
} from '@/lib/constants/redis-keys';
import type { Lead, LeadActivity, LeadNote, LeadRawPayload, Task, UserRole, AppDomain, LeadFilters, CampaignFilters, CampaignMetrics, CampaignDetailMetrics, AgentDistributionRow, Profile } from '@/lib/types/database';

export type LeadNoteWithAuthor = LeadNote & { author: { full_name: string } };
export type LeadActivityWithActor = LeadActivity & { actor: { full_name: string } | null };
export type LeadWithAssignee = Lead & { assignee: { full_name: string } | null };
export type LeadTaskForDossier = Task & { task_type: Task['task_type'] };

// ─────────────────────────────────────────────
// Query: single lead by ID
// ─────────────────────────────────────────────
export async function getLeadById(leadId: string): Promise<LeadWithAssignee | null> {
  const key = REDIS_KEYS.leadRowId(leadId);
  try {
    const cached = await redis.get<LeadWithAssignee>(key);
    if (cached) return cached;
  } catch { /* Redis unavailable — fall through to DB */ }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('leads')
    .select('*, assignee:profiles!leads_assigned_to_fkey(full_name)')
    .eq('id', leadId)
    .is('archived_at', null)
    .single();

  if (error || !data) return null;
  const result = data as LeadWithAssignee;
  try { await redis.setex(key, REDIS_TTL.LEAD_ROW, result); } catch { /* non-fatal */ }
  return result;
}

// ─────────────────────────────────────────────
// Query: single lead by slug (human-readable URL)
// Indexed on idx_leads_slug — exact match only, never LIKE.
// ─────────────────────────────────────────────
export async function getLeadBySlug(slug: string): Promise<LeadWithAssignee | null> {
  const key = REDIS_KEYS.leadRowSlug(slug);
  try {
    const cached = await redis.get<LeadWithAssignee>(key);
    if (cached) return cached;
  } catch { /* Redis unavailable — fall through to DB */ }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('leads')
    .select('*, assignee:profiles!leads_assigned_to_fkey(full_name)')
    .eq('slug', slug)
    .is('archived_at', null)
    .single();

  if (error || !data) return null;
  const result = data as LeadWithAssignee;
  try { await redis.setex(key, REDIS_TTL.LEAD_ROW, result); } catch { /* non-fatal */ }
  return result;
}

// ─────────────────────────────────────────────
// Query: leads for agent (only their own)
// ─────────────────────────────────────────────
export async function getLeadsForAgent(agentId: string): Promise<Lead[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('assigned_to', agentId)
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data as Lead[];
}

// ─────────────────────────────────────────────
// Query: leads for a domain (manager view)
// ─────────────────────────────────────────────
export async function getLeadsForDomain(domain: string): Promise<Lead[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('domain', domain)
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data as Lead[];
}

// ─────────────────────────────────────────────
// Query: all leads (admin / founder)
// ─────────────────────────────────────────────
export async function getAllLeads(): Promise<Lead[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data as Lead[];
}

// ─────────────────────────────────────────────
// Query: role-aware lead list with server-side filters + pagination
//
// Security contract:
//   - agent role: assigned_to = auth.uid() is enforced unconditionally.
//     LeadFilters.agent_id is silently ignored for agents — their role
//     constraint cannot be overridden by a URL param.
//   - manager role: domain constraint applied before any filters.
//   - admin / founder: no pre-constraint.
//
// Pagination: .range() is always applied, regardless of filter presence.
//   Default page=1, pageSize=50. An unfiltered first load fetches exactly
//   50 rows — never the full table.
//
// Count: returned in the same round trip via { count: 'exact', head: false }.
//   Never two separate queries.
// ─────────────────────────────────────────────
export type LeadsResult = {
  leads:      LeadWithAssignee[];
  totalCount: number;
};

export async function getLeadsByRole(
  role: UserRole,
  userId: string,
  domain: AppDomain,
  filters: LeadFilters = {
    status:            null,
    last_call_outcome: null,
    domain:            null,
    agent_id:          null,
    source:            null,
    campaign:          null,
    date_from:         null,
    date_to:           null,
    search:            null,
    page:              1,
    pageSize:          30,
  },
): Promise<LeadsResult> {
  // Redis cache-aside: try cache first; DB on miss; warm individual dossier caches after DB hit
  // domain (caller's verified profile domain) is always the second segment so managers in
  // different domains with identical filter args never share a cache slot.
  const listKey = buildLeadListKey(role, domain, userId, filters);
  try {
    const cached = await redis.get<LeadsResult>(listKey);
    if (cached) return cached;
  } catch { /* Redis unavailable — fall through to DB */ }

  const supabase = await createClient();

  const page     = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, Math.min(200, filters.pageSize ?? 30));
  const offset   = (page - 1) * pageSize;

  // Use count: 'exact' to get total matching rows in the same round trip
  let query = supabase
    .from('leads')
    .select('*, assignee:profiles!leads_assigned_to_fkey(full_name)', { count: 'exact', head: false })
    .is('archived_at', null)
    .order('created_at', { ascending: false });

  // Role-level constraints — applied before any filter, cannot be overridden
  if (role === 'agent') {
    query = query.eq('assigned_to', userId);
    // agent_id filter intentionally NOT applied here — role constraint wins
  } else if (role === 'manager') {
    query = query.eq('domain', domain);
    if (filters.agent_id) {
      query = query.eq('assigned_to', filters.agent_id);
    }
  } else {
    // admin / founder — optional domain slice (Gia domains only); agent_id honoured
    if (filters.domain && isGiaDomain(filters.domain)) {
      query = query.eq('domain', filters.domain);
    }
    if (filters.agent_id) {
      query = query.eq('assigned_to', filters.agent_id);
    }
  }

  // Optional filters
  if (filters.status && filters.status.length > 0) {
    query = query.in('status', filters.status);
  }

  if (filters.last_call_outcome && filters.last_call_outcome.length > 0) {
    query = query.in('last_call_outcome', filters.last_call_outcome);
  }

  if (filters.source) {
    query = query.eq('utm_source', filters.source);
  }

  if (filters.campaign) {
    query = query.eq('utm_campaign', filters.campaign);
  }

  if (filters.date_from) {
    query = query.gte('created_at', filters.date_from);
  }

  if (filters.date_to) {
    // End-of-day transform: include all leads up to 23:59:59.999 on date_to
    const endOfDay = filters.date_to.replace(/T.*$/, 'T23:59:59.999Z');
    query = query.lte('created_at', endOfDay);
  }

  if (filters.search) {
    // Trim and lowercase in the service — never trust raw client input
    const term = filters.search.trim().toLowerCase();
    if (term) {
      query = query.or(
        `first_name.ilike.%${term}%,last_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`,
      );
    }
  }

  // Pagination — always applied, never conditional
  query = query.range(offset, offset + pageSize - 1);

  const { data, error, count } = await query;
  if (error || !data) return { leads: [], totalCount: 0 };

  const result: LeadsResult = { leads: data as LeadWithAssignee[], totalCount: count ?? 0 };

  // Cache the list result and warm individual dossier caches as a single fire-and-forget batch
  try {
    await redis.setex(listKey, REDIS_TTL.LEAD_LIST, result);
    void (async () => {
      try {
        await Promise.all(
          result.leads.flatMap((lead) => {
            const ops = [redis.setex(REDIS_KEYS.leadRowId(lead.id), REDIS_TTL.LEAD_ROW, lead)];
            if (lead.slug) ops.push(redis.setex(REDIS_KEYS.leadRowSlug(lead.slug), REDIS_TTL.LEAD_ROW, lead));
            return ops;
          }),
        );
      } catch { /* non-fatal: warming failure never blocks the list */ }
    })();
  } catch { /* non-fatal: list cache failure never blocks the response */ }

  return result;
}

/** Deduped per-request — safe to call from page header and LeadsTableAsync. */
export const getLeadsByRoleCached = cache(getLeadsByRole);

// ─────────────────────────────────────────────
// Query: filter option lists for the LeadsFilters component
// Called ONCE at page level — never inside filter components.
// ─────────────────────────────────────────────
export type LeadFilterOptions = {
  campaigns: string[];
  agents:    Pick<Profile, 'id' | 'full_name'>[];
};

export async function getLeadFilterOptions(
  role: UserRole,
  callerDomain: AppDomain,
  filterDomain: GiaDomain | null = null,
): Promise<LeadFilterOptions> {
  const key = REDIS_KEYS.leadFilterOptions(role, callerDomain, filterDomain ?? '');
  try {
    const cached = await redis.get<LeadFilterOptions>(key);
    if (cached) return cached;
  } catch { /* Redis unavailable — fall through to DB */ }

  const supabase = await createClient();

  // Distinct campaign names — uses idx_leads_utm_campaign partial index
  let campaignQuery = supabase
    .from('leads')
    .select('utm_campaign')
    .is('archived_at', null)
    .not('utm_campaign', 'is', null)
    .order('utm_campaign', { ascending: true });

  if (role === 'manager') {
    campaignQuery = campaignQuery.eq('domain', callerDomain);
  } else if (filterDomain) {
    campaignQuery = campaignQuery.eq('domain', filterDomain);
  }

  const { data: campaignRows } = await campaignQuery;

  const campaigns = [
    ...new Set(
      (campaignRows ?? [])
        .map((r) => r.utm_campaign)
        .filter((c): c is string => c !== null && c.trim() !== ''),
    ),
  ];

  // Agents — scoped to domain for manager; all domains for admin/founder
  let agentsQuery = supabase
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'agent')
    .eq('is_active', true)
    .order('full_name', { ascending: true });

  if (role === 'manager') {
    agentsQuery = agentsQuery.eq('domain', callerDomain);
  } else if (filterDomain) {
    agentsQuery = agentsQuery.eq('domain', filterDomain);
  }

  const { data: agentRows } = await agentsQuery;
  const agents = (agentRows ?? []) as Pick<Profile, 'id' | 'full_name'>[];

  const result: LeadFilterOptions = { campaigns, agents };
  try { await redis.setex(key, REDIS_TTL.LEAD_FILTER_OPTIONS, result); } catch { /* non-fatal */ }
  return result;
}

// ─────────────────────────────────────────────
// Query: lead activities timeline
// ─────────────────────────────────────────────
export async function getLeadActivities(leadId: string): Promise<LeadActivity[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('lead_activities')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data as LeadActivity[];
}

// ─────────────────────────────────────────────
// Query: lead notes
// ─────────────────────────────────────────────
export async function getLeadNotes(leadId: string): Promise<LeadNote[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('lead_notes')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  return data as LeadNote[];
}

// ─────────────────────────────────────────────
// Query: lead notes with author names — single joined query
// ─────────────────────────────────────────────
export async function getLeadNotesFull(leadId: string): Promise<LeadNoteWithAuthor[]> {
  const key = REDIS_KEYS.leadNotes(leadId);
  try {
    const cached = await redis.get<LeadNoteWithAuthor[]>(key);
    if (cached) return cached;
  } catch { /* Redis unavailable — fall through to DB */ }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('lead_notes')
    .select('*, author:profiles!lead_notes_author_id_fkey(full_name)')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  const result = data as LeadNoteWithAuthor[];
  try { await redis.setex(key, REDIS_TTL.LEAD_NOTES, result); } catch { /* non-fatal */ }
  return result;
}

// ─────────────────────────────────────────────
// Query: lead activities with actor names — single joined query
// ─────────────────────────────────────────────
export async function getLeadActivitiesFull(leadId: string): Promise<LeadActivityWithActor[]> {
  const key = REDIS_KEYS.leadActivities(leadId);
  try {
    const cached = await redis.get<LeadActivityWithActor[]>(key);
    if (cached) return cached;
  } catch { /* Redis unavailable — fall through to DB */ }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('lead_activities')
    .select('*, actor:profiles!lead_activities_actor_id_fkey(full_name)')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });

  if (error || !data) return [];
  const result = data as LeadActivityWithActor[];
  try { await redis.setex(key, REDIS_TTL.LEAD_ACTIVITIES, result); } catch { /* non-fatal */ }
  return result;
}

// ─────────────────────────────────────────────
// Query: next pending task for a lead (Gia module) — single joined query
//
// Starts from `tasks` (native column filters: status, due_at), joins inward
// to `task_gia_meta` with !inner to filter by lead_id. This is required
// because PostgREST / Supabase JS client silently drops dot-notation filters
// on joined tables (e.g. `.eq('tasks.status', ...)` when starting from
// task_gia_meta) — they never reach the WHERE clause.
// ─────────────────────────────────────────────
export async function getNextLeadTask(leadId: string): Promise<Task | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('tasks')
    .select('*, task_gia_meta!inner(lead_id)')
    .eq('task_gia_meta.lead_id', leadId)
    .eq('status', 'to_do')
    .order('due_at', { ascending: true })
    .limit(1);

  if (error || !data || data.length === 0) return null;
  return data[0] as Task;
}

// ─────────────────────────────────────────────
// Query: errored raw payloads (admin / founder)
// ─────────────────────────────────────────────
export async function getErroredPayloads(): Promise<LeadRawPayload[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('lead_raw_payloads')
    .select('*')
    .not('ingestion_error', 'is', null)
    .order('received_at', { ascending: false });

  if (error || !data) return [];
  return data as LeadRawPayload[];
}

// ─────────────────────────────────────────────
// Query: active agents in a domain (for assignment dropdown)
// ─────────────────────────────────────────────
export async function getAgentsForDomain(
  domain: string,
): Promise<{ id: string; full_name: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'agent')
    .eq('domain', domain as AppDomain)
    .eq('is_active', true)
    .order('full_name', { ascending: true });

  if (error || !data) return [];
  return data as { id: string; full_name: string }[];
}

export async function getActiveUsersForDomain(
  domain: string,
): Promise<{ id: string; full_name: string; role: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('domain', domain as AppDomain)
    .eq('is_active', true)
    .neq('role', 'guest')
    .order('full_name', { ascending: true });

  if (error || !data) return [];
  return data as { id: string; full_name: string; role: string }[];
}

// ─────────────────────────────────────────────
// Query: campaign analytics — single RPC call, one round trip
//
// Security contract (mirrors getLeadsByRole):
//   - manager: caller MUST pass their own domain as filters.domain before
//     calling — never pass null for a manager. Enforced in service, not RPC.
//   - admin / founder: filters.domain === null → all domains returned.
// ─────────────────────────────────────────────
export async function getCampaignMetrics(
  role: UserRole,
  callerDomain: AppDomain,
  filters: CampaignFilters,
): Promise<CampaignMetrics[]> {
  // Manager constraint: always scope to their domain, regardless of what filters.domain says
  const effectiveDomain: string | null =
    role === 'manager'
      ? callerDomain
      : (filters.domain ?? null);

  const normalizedDateFrom = filters.date_from ?? '';
  const normalizedDateTo = filters.date_to ?? '';

  const cacheKey = REDIS_KEYS.campaign.campaignList(
    effectiveDomain ?? 'all',
    normalizedDateFrom,
    normalizedDateTo,
  );

  let rows: CampaignMetrics[];

  try {
    const cached = await redis.get<CampaignMetrics[]>(cacheKey);
    if (cached) {
      rows = cached;
    } else {
      rows = await fetchCampaignMetricsFromRpc(effectiveDomain, filters);
      void redis.setex(cacheKey, CAMPAIGN_LIST_TTL, rows).catch(() => {});
    }
  } catch {
    rows = await fetchCampaignMetricsFromRpc(effectiveDomain, filters);
  }

  if (!filters.search) return rows;

  const term = filters.search.trim().toLowerCase();
  if (!term) return rows;

  return rows.filter((row) => row.campaign_name.toLowerCase().includes(term));
}

async function fetchCampaignMetricsFromRpc(
  effectiveDomain: string | null,
  filters: Pick<CampaignFilters, 'date_from' | 'date_to'>,
): Promise<CampaignMetrics[]> {
  const supabase = await createClient();

  // date_to end-of-day transform — same rule as getLeadsByRole
  const dateTo = filters.date_to
    ? filters.date_to.replace(/T.*$/, 'T23:59:59.999Z')
    : null;

  type CampaignRpcRow = {
    campaign_name:        string;
    domain:               string;
    total_leads:          number;
    status_new:           number;
    status_touched:       number;
    status_in_discussion: number;
    status_won:           number;
    status_nurturing:     number;
    status_lost:          number;
    status_junk:          number;
    outcome_rnr:          number;
    outcome_switched_off: number;
    outcome_converted:    number;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as unknown as any).rpc('get_campaign_metrics', {
    p_domain:    effectiveDomain,
    p_date_from: filters.date_from ?? null,
    p_date_to:   dateTo,
  });

  if (error || !data) return [];

  return (data as CampaignRpcRow[]).map((row) => ({
    campaign_name: row.campaign_name,
    domain:        row.domain as AppDomain,
    total_leads:   Number(row.total_leads),
    new:           Number(row.status_new),
    touched:       Number(row.status_touched),
    in_discussion: Number(row.status_in_discussion),
    won:           Number(row.status_won),
    nurturing:     Number(row.status_nurturing),
    lost:          Number(row.status_lost),
    junk:          Number(row.status_junk),
    rnr:           Number(row.outcome_rnr),
    switched_off:  Number(row.outcome_switched_off),
    converted:     Number(row.outcome_converted),
  }));
}

// ─────────────────────────────────────────────
// Query: campaign detail metrics — single RPC, single campaign
//
// Called only from the [id] detail page. Never from the list page.
// Returns null when the campaign has no matching leads.
// ─────────────────────────────────────────────
type CampaignDetailCacheEntry = { payload: CampaignDetailMetrics | null };

export async function getCampaignDetailMetrics(
  campaignName: string,
  filters: Pick<CampaignFilters, 'date_from' | 'date_to'>,
): Promise<CampaignDetailMetrics | null> {
  const campaignKey = campaignName.toLowerCase().trim();
  const normalizedDateFrom = filters.date_from ?? '';
  const normalizedDateTo = filters.date_to ?? '';
  const cacheKey = REDIS_KEYS.campaign.campaignDetail(
    campaignKey,
    normalizedDateFrom,
    normalizedDateTo,
  );

  try {
    const cached = await redis.get<CampaignDetailCacheEntry>(cacheKey);
    if (cached !== null && cached !== undefined) return cached.payload;
  } catch { /* fall through to DB */ }

  const supabase = await createClient();

  const dateTo = filters.date_to
    ? filters.date_to.replace(/T.*$/, 'T23:59:59.999Z')
    : null;

  type DetailRpcRow = {
    campaign_name:           string;
    total_leads:             number;
    status_new:              number;
    status_touched:          number;
    status_in_discussion:    number;
    status_won:              number;
    status_nurturing:        number;
    status_lost:             number;
    status_junk:             number;
    outcome_rnr:             number;
    outcome_switched_off:    number;
    outcome_converted:       number;
    avg_hours_to_first_touch: number | null;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as unknown as any).rpc(
    'get_campaign_detail_metrics',
    {
      p_campaign:  campaignName,
      p_date_from: filters.date_from ?? null,
      p_date_to:   dateTo,
    },
  );

  let result: CampaignDetailMetrics | null = null;

  if (!error && data && Array.isArray(data) && data.length > 0) {
    const row = data[0] as DetailRpcRow;
    result = {
      campaign_name: row.campaign_name,
      // domain not returned by this RPC — not needed on the detail page
      domain:        '' as AppDomain,
      total_leads:   Number(row.total_leads),
      new:           Number(row.status_new),
      touched:       Number(row.status_touched),
      in_discussion: Number(row.status_in_discussion),
      won:           Number(row.status_won),
      nurturing:     Number(row.status_nurturing),
      lost:          Number(row.status_lost),
      junk:          Number(row.status_junk),
      rnr:           Number(row.outcome_rnr),
      switched_off:  Number(row.outcome_switched_off),
      converted:     Number(row.outcome_converted),
      avg_hours_to_first_touch:
        row.avg_hours_to_first_touch !== null
          ? Number(row.avg_hours_to_first_touch)
          : null,
    };
  }

  void redis
    .setex(cacheKey, CAMPAIGN_DETAIL_TTL, { payload: result } satisfies CampaignDetailCacheEntry)
    .catch(() => {});

  return result;
}

// ─────────────────────────────────────────────
// Query: campaign agent distribution — single GROUP BY, never N+1
//
// Returns one row per assigned agent. Unassigned leads are excluded.
// Called only from the [id] detail page alongside getCampaignDetailMetrics.
// ─────────────────────────────────────────────
export async function getCampaignAgentDistribution(
  campaignName: string,
  filters: Pick<CampaignFilters, 'date_from' | 'date_to'>,
): Promise<AgentDistributionRow[]> {
  const campaignKey = campaignName.toLowerCase().trim();
  const normalizedDateFrom = filters.date_from ?? '';
  const normalizedDateTo = filters.date_to ?? '';
  const cacheKey = REDIS_KEYS.campaign.campaignDistribution(
    campaignKey,
    normalizedDateFrom,
    normalizedDateTo,
  );

  try {
    const cached = await redis.get<AgentDistributionRow[]>(cacheKey);
    if (cached) return cached;
  } catch { /* fall through to DB */ }

  const supabase = await createClient();

  const dateTo = filters.date_to
    ? filters.date_to.replace(/T.*$/, 'T23:59:59.999Z')
    : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as unknown as any).rpc(
    'get_campaign_agent_distribution',
    {
      p_campaign:  campaignName,
      p_date_from: filters.date_from ?? null,
      p_date_to:   dateTo,
    },
  );

  const result: AgentDistributionRow[] =
    error || !data
      ? []
      : (data as Array<{ agent_id: string; full_name: string; lead_count: number }>).map(
          (row) => ({
            agent_id:   row.agent_id,
            full_name:  row.full_name,
            lead_count: Number(row.lead_count),
          }),
        );

  void redis.setex(cacheKey, CAMPAIGN_DISTRIBUTION_TTL, result).catch(() => {});

  return result;
}

// ─────────────────────────────────────────────
// Round-robin: next eligible agent in a domain
// ─────────────────────────────────────────────
export async function getNextRoundRobinAgent(domain: string): Promise<string | null> {
  // Must use admin client — this runs inside the webhook handler which has no
  // authenticated session. RLS would block all three queries with auth.uid() = null.
  const supabase = createAdminClient();

  // Fetch all active agents in this domain
  const { data: agents, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('domain', domain as AppDomain)
    .eq('role', 'agent')
    .eq('is_active', true);

  if (error || !agents || agents.length === 0) return null;

  const agentIds = agents.map((a) => a.id);

  // Check which agents have an active routing config (holiday switch)
  const { data: routingConfigs } = await supabase
    .from('agent_routing_config')
    .select('agent_id')
    .in('agent_id', agentIds)
    .eq('is_active', true);

  const activeAgentIds = new Set((routingConfigs ?? []).map((r) => r.agent_id));

  const eligibleAgents = agentIds.filter((id) => activeAgentIds.has(id));
  if (eligibleAgents.length === 0) return null;

  // For each eligible agent, find their most recent lead assignment timestamp
  const { data: recentLeads } = await supabase
    .from('leads')
    .select('assigned_to, assigned_at')
    .in('assigned_to', eligibleAgents)
    .is('archived_at', null)
    .order('assigned_at', { ascending: false });

  // Build a map: agentId → most recent assigned_at
  const lastAssigned: Record<string, Date | null> = {};
  for (const agentId of eligibleAgents) {
    lastAssigned[agentId] = null;
  }
  if (recentLeads) {
    for (const lead of recentLeads) {
      if (lead.assigned_to && lead.assigned_at && lastAssigned[lead.assigned_to] === null) {
        lastAssigned[lead.assigned_to] = new Date(lead.assigned_at);
      }
    }
  }

  // Sort: agents with no previous assignment first (null), then by oldest assignment
  eligibleAgents.sort((a, b) => {
    const aTime = lastAssigned[a];
    const bTime = lastAssigned[b];
    if (!aTime && !bTime) return 0;
    if (!aTime) return -1;
    if (!bTime) return 1;
    return aTime.getTime() - bTime.getTime();
  });

  return eligibleAgents[0];
}

// ─────────────────────────────────────────────
// Lead search for task creation
// ─────────────────────────────────────────────

export type LeadSearchResult = {
  id:         string;
  slug:       string | null;
  first_name: string;
  last_name:  string | null;
  phone:      string | null;
  domain:     AppDomain;
};

/**
 * Search leads by name or phone for the lead picker in CreateGiaTaskModal.
 * Scoped by caller role: agent sees only their assigned leads,
 * manager sees their domain, admin/founder see all.
 * Returns at most 8 results.
 */
export async function searchLeadsForTask(
  query:   string,
  role:    UserRole,
  domain:  AppDomain,
  userId:  string,
): Promise<LeadSearchResult[]> {
  const supabase = await createClient();
  const term = `%${query.trim().toLowerCase()}%`;

  let q = supabase
    .from('leads')
    .select('id, slug, first_name, last_name, phone, domain')
    .or(`first_name.ilike.${term},last_name.ilike.${term},phone.ilike.${term}`)
    .is('archived_at', null)
    .limit(8);

  if (role === 'agent') {
    q = q.eq('assigned_to', userId);
  } else if (role === 'manager') {
    q = q.eq('domain', domain);
  }
  // admin/founder: no domain constraint

  const { data, error } = await q.order('first_name', { ascending: true });

  if (error) {
    console.error('[leads-service] searchLeadsForTask error:', error);
    return [];
  }

  return (data ?? []) as LeadSearchResult[];
}
