import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isGiaDomain, type GiaDomain } from "@/lib/constants/domains";
import { COLD_LEAD_THRESHOLD_DAYS } from "@/lib/constants/leads";
import { redis } from "@/lib/redis";
import {
  REDIS_KEYS,
  REDIS_TTL,
  buildLeadListKey,
} from "@/lib/constants/redis-keys";
import type {
  Lead,
  LeadActivity,
  LeadNote,
  LeadRawPayload,
  Task,
  UserRole,
  AppDomain,
  LeadStatus,
  LeadFilters,
  CampaignFilters,
  CampaignMetrics,
  CampaignDetailMetrics,
  AgentDistributionRow,
  Profile,
} from "@/lib/types/database";

export type LeadNoteWithAuthor = LeadNote & { author: { full_name: string } };
export type LeadActivityWithActor = LeadActivity & {
  actor: { full_name: string } | null;
};
export type LeadWithAssignee = Lead & {
  assignee: { full_name: string } | null;
};

type LatestNote = { content: string; created_at: string; author_name: string | null };

export type LeadListItem = Pick<
  Lead,
  | 'id' | 'slug' | 'first_name' | 'last_name' | 'phone' | 'email'
  | 'domain' | 'assigned_to' | 'status' | 'lead_intent'
  | 'source' | 'medium' | 'utm_campaign' | 'call_count'
  | 'last_call_outcome' | 'created_at'
> & { latest_note: LatestNote | null };
export type LeadListItemWithAssignee = LeadListItem & {
  assignee: { full_name: string } | null;
};
export type LeadTaskForDossier = Task & { task_type: Task["task_type"] };

// ─────────────────────────────────────────────
// Query: single lead by ID
// ─────────────────────────────────────────────
export async function getLeadById(
  leadId: string,
): Promise<LeadWithAssignee | null> {
  const key = REDIS_KEYS.leadRowId(leadId);
  try {
    const cached = await redis.get<LeadWithAssignee>(key);
    if (cached) return cached;
  } catch {
    /* Redis unavailable — fall through to DB */
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select("*, assignee:profiles!leads_assigned_to_fkey(full_name)")
    .eq("id", leadId)
    .is("archived_at", null)
    .single();

  if (error || !data) return null;
  const result = data as LeadWithAssignee;
  try {
    await redis.setex(key, REDIS_TTL.LEAD_ROW, result);
  } catch {
    /* non-fatal */
  }
  return result;
}

// ─────────────────────────────────────────────
// Query: single lead by slug (human-readable URL)
// Indexed on idx_leads_slug — exact match only, never LIKE.
// ─────────────────────────────────────────────
export async function getLeadBySlug(
  slug: string,
): Promise<LeadWithAssignee | null> {
  const key = REDIS_KEYS.leadRowSlug(slug);
  try {
    const cached = await redis.get<LeadWithAssignee>(key);
    if (cached) return cached;
  } catch {
    /* Redis unavailable — fall through to DB */
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select("*, assignee:profiles!leads_assigned_to_fkey(full_name)")
    .eq("slug", slug)
    .is("archived_at", null)
    .single();

  if (error || !data) return null;
  const result = data as LeadWithAssignee;
  try {
    await redis.setex(key, REDIS_TTL.LEAD_ROW, result);
  } catch {
    /* non-fatal */
  }
  return result;
}

// ─────────────────────────────────────────────
// Query: leads for agent (only their own)
// ─────────────────────────────────────────────
export async function getLeadsForAgent(agentId: string): Promise<Lead[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("assigned_to", agentId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data as Lead[];
}

// ─────────────────────────────────────────────
// Query: leads for a domain (manager view)
// ─────────────────────────────────────────────
export async function getLeadsForDomain(domain: string): Promise<Lead[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .eq("domain", domain)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data as Lead[];
}

// ─────────────────────────────────────────────
// Query: all leads (admin / founder)
// ─────────────────────────────────────────────
export async function getAllLeads(): Promise<Lead[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data as Lead[];
}

// ─────────────────────────────────────────────
// Private helper: latest note per lead — single batch query, never per-row.
// Uses idx_lead_notes_lead_id (lead_id, created_at DESC) — first row per lead_id
// is the most recent because the query is ordered DESC and we skip duplicates.
// ─────────────────────────────────────────────
async function getLatestNotesForLeads(
  leadIds: string[],
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Map<string, LatestNote>> {
  if (leadIds.length === 0) return new Map();

  const { data } = await supabase
    .from("lead_notes")
    .select("lead_id, content, created_at, author:profiles!lead_notes_author_id_fkey(full_name)")
    .in("lead_id", leadIds)
    .order("created_at", { ascending: false });

  const map = new Map<string, LatestNote>();
  if (!data) return map;

  for (const row of data) {
    if (map.has(row.lead_id)) continue; // first occurrence = latest (DESC order)
    const author = row.author as { full_name: string } | null;
    map.set(row.lead_id, {
      content:    row.content,
      created_at: row.created_at,
      author_name: author?.full_name ?? null,
    });
  }

  return map;
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
  leads:        LeadListItemWithAssignee[];
  totalCount:   number;
  statusCounts: Partial<Record<LeadStatus, number>>;
};

export async function getLeadsByRole(
  role: UserRole,
  userId: string,
  domain: AppDomain,
  filters: LeadFilters = {
    status: null,
    last_call_outcome: null,
    domain: null,
    agent_id: null,
    source: null,
    campaign: null,
    date_from: null,
    date_to: null,
    search: null,
    page: 1,
    pageSize: 30,
  },
): Promise<LeadsResult> {
  // Redis cache-aside with version counter: read the domain version first so we
  // can build the correct versioned key. A version miss (null) defaults to 0,
  // which is a valid cache slot — the first INCR will bump it to 1.
  let version = 0;
  try {
    const v = await redis.get<number>(REDIS_KEYS.leadListVersion(role, domain));
    if (v !== null) version = v;
  } catch {
    /* Redis unavailable — version stays 0, fall through to DB */
  }

  const listKey = buildLeadListKey(role, domain, userId, filters, version);
  try {
    const cached = await redis.get<LeadsResult>(listKey);
    if (cached) return cached;
  } catch {
    /* Redis unavailable — fall through to DB */
  }

  const supabase = await createClient();

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, Math.min(200, filters.pageSize ?? 30));
  const offset = (page - 1) * pageSize;

  // Use count: 'exact' to get total matching rows in the same round trip
  let query = supabase
    .from("leads")
    .select(
      `id, slug, first_name, last_name, phone, email, domain, assigned_to,
       status, lead_intent, source, medium, utm_campaign,
       call_count, last_call_outcome, created_at,
       assignee:profiles!leads_assigned_to_fkey(full_name)`,
      { count: "exact", head: false },
    )
    .is("archived_at", null)
    .order("created_at", { ascending: filters.sort_order === "asc" });

  // Role-level constraints — applied before any filter, cannot be overridden
  if (role === "agent") {
    query = query.eq("assigned_to", userId);
    // agent_id filter intentionally NOT applied here — role constraint wins
  } else if (role === "manager") {
    query = query.eq("domain", domain);
    if (filters.agent_id) {
      query = query.eq("assigned_to", filters.agent_id);
    }
  } else {
    // admin / founder — optional domain slice (Gia domains only); agent_id honoured
    if (filters.domain && isGiaDomain(filters.domain)) {
      query = query.eq("domain", filters.domain);
    }
    if (filters.agent_id) {
      query = query.eq("assigned_to", filters.agent_id);
    }
  }

  // Optional filters
  if (filters.status && filters.status.length > 0) {
    query = query.in("status", filters.status);
  }

  if (filters.last_call_outcome && filters.last_call_outcome.length > 0) {
    query = query.in("last_call_outcome", filters.last_call_outcome);
  }

  if (filters.source) {
    query = query.eq("source", filters.source);
  }

  if (filters.campaign) {
    query = query.eq("utm_campaign", filters.campaign);
  }

  if (filters.date_from) {
    // IST midnight transform: bare YYYY-MM-DD → YYYY-MM-DDT00:00:00+05:30
    // Without this, PostgREST treats the bare date as UTC midnight, which is
    // 5.5 hours into the IST calendar day — leads created before 05:30 IST are excluded.
    const startOfDayIST = /T/.test(filters.date_from)
      ? filters.date_from
      : `${filters.date_from}T00:00:00+05:30`;
    query = query.gte("created_at", startOfDayIST);
  }

  if (filters.date_to) {
    // End-of-day transform: include all leads up to 23:59:59.999 on date_to
    const endOfDay = filters.date_to.replace(/T.*$/, "T23:59:59.999Z");
    query = query.lte("created_at", endOfDay);
  }

  if (filters.search) {
    // Trim and lowercase in the service — never trust raw client input
    const term = filters.search.trim().toLowerCase();
    if (term) {
      query = query.or(
        `first_name.ilike.%${term}%,last_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%,city.ilike.%${term}%`,
      );
    }
  }

  if (filters.health) {
    query = query.eq('lead_health', filters.health);
  }

  if (filters.going_cold) {
    // Threshold: last_activity_at older than COLD_LEAD_THRESHOLD_DAYS ago.
    // NULL last_activity_at leads are intentionally excluded by lt() — those are
    // handled by SLA-01A (never-contacted leads), not the going-cold preset.
    const threshold = new Date(Date.now() - COLD_LEAD_THRESHOLD_DAYS * 86_400_000).toISOString();
    query = query
      .lt("last_activity_at", threshold)
      .not("status", "in", `("won","lost","junk")`);
  }

  // Pagination — always applied, never conditional
  query = query.range(offset, offset + pageSize - 1);

  // Params mirror getLeadsByRole filter application — keep in sync.
  // When a new filter is added to LeadFilters, update both this RPC call and
  // the filter chain above simultaneously.
  const [queryResult, statusCountsResult] = await Promise.all([
    query,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as unknown as any).rpc("get_leads_status_counts", {
      p_agent_id:    role === "agent" ? userId : (filters.agent_id ?? null),
      p_date_from:   filters.date_from ?? null,
      p_date_to:     filters.date_to
        ? filters.date_to.replace(/T.*$/, "T23:59:59.999Z")
        : null,
      p_campaign:    filters.campaign ?? null,
      p_search:      filters.search ? filters.search.trim().toLowerCase() || null : null,
      p_health:      filters.health ?? null,
      p_going_cold:  filters.going_cold
        ? new Date(Date.now() - COLD_LEAD_THRESHOLD_DAYS * 86_400_000).toISOString()
        : null,
      p_source:      filters.source ?? null,
      p_outcomes:    (filters.last_call_outcome && filters.last_call_outcome.length > 0)
        ? filters.last_call_outcome
        : null,
      p_statuses:    (filters.status && filters.status.length > 0)
        ? filters.status
        : null,
    }),
  ]);

  const { data, error, count } = queryResult;
  if (error || !data) return { leads: [], totalCount: 0, statusCounts: {} };

  // Reduce RPC rows into Partial<Record<LeadStatus, number>>.
  // On error, return {} — pills show no counts rather than crashing (Q-09).
  const statusCounts: Partial<Record<LeadStatus, number>> = {};
  if (!statusCountsResult.error && Array.isArray(statusCountsResult.data)) {
    for (const row of statusCountsResult.data as { status: string; cnt: unknown }[]) {
      statusCounts[row.status as LeadStatus] = Number(row.cnt);
    }
  }

  // Batch-fetch latest note per lead — one extra query, never per-row (Invariant 29)
  const leadIds = (data as { id: string }[]).map((l) => l.id);
  const notesMap = await getLatestNotesForLeads(leadIds, supabase);

  const leads = (data as (Omit<LeadListItemWithAssignee, 'latest_note'> & { assignee: { full_name: string } | null })[]).map(
    (l) => ({ ...l, latest_note: notesMap.get(l.id) ?? null }),
  );

  const result: LeadsResult = {
    leads,
    totalCount:   count ?? 0,
    statusCounts,
  };

  // Cache the list result only — dossier row keys (leadRowId/leadRowSlug) are NOT
  // warmed here because this query selects a subset of columns. Storing a partial
  // object under those keys would corrupt getLeadById / getLeadBySlug reads.
  try {
    await redis.setex(listKey, REDIS_TTL.LEAD_LIST, result);
  } catch {
    /* non-fatal: list cache failure never blocks the response */
  }

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
  agents: Pick<Profile, "id" | "full_name">[];
};

export async function getLeadFilterOptions(
  role: UserRole,
  callerDomain: AppDomain,
  filterDomain: GiaDomain | null = null,
): Promise<LeadFilterOptions> {
  const key = REDIS_KEYS.leadFilterOptions(
    role,
    callerDomain,
    filterDomain ?? "",
  );
  try {
    const cached = await redis.get<LeadFilterOptions>(key);
    if (cached) return cached;
  } catch {
    /* Redis unavailable — fall through to DB */
  }

  const supabase = await createClient();

  // Distinct campaign names — uses idx_leads_utm_campaign partial index
  let campaignQuery = supabase
    .from("leads")
    .select("utm_campaign")
    .is("archived_at", null)
    .not("utm_campaign", "is", null)
    .order("utm_campaign", { ascending: true });

  if (role === "manager") {
    campaignQuery = campaignQuery.eq("domain", callerDomain);
  } else if (filterDomain) {
    campaignQuery = campaignQuery.eq("domain", filterDomain);
  }

  const { data: campaignRows } = await campaignQuery;

  const campaigns = [
    ...new Set(
      (campaignRows ?? [])
        .map((r) => r.utm_campaign)
        .filter((c): c is string => c !== null && c.trim() !== ""),
    ),
  ];

  // Agents — scoped to domain for manager; all domains for admin/founder
  let agentsQuery = supabase
    .from("profiles")
    .select("id, full_name")
    .eq("role", "agent")
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (role === "manager") {
    agentsQuery = agentsQuery.eq("domain", callerDomain);
  } else if (filterDomain) {
    agentsQuery = agentsQuery.eq("domain", filterDomain);
  }

  const { data: agentRows } = await agentsQuery;
  const agents = (agentRows ?? []) as Pick<Profile, "id" | "full_name">[];

  const result: LeadFilterOptions = { campaigns, agents };
  try {
    await redis.setex(key, REDIS_TTL.LEAD_FILTER_OPTIONS, result);
  } catch {
    /* non-fatal */
  }
  return result;
}

// ─────────────────────────────────────────────
// Query: lead activities timeline
// ─────────────────────────────────────────────
export async function getLeadActivities(
  leadId: string,
): Promise<LeadActivity[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_activities")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data as LeadActivity[];
}

// ─────────────────────────────────────────────
// Query: lead notes
// ─────────────────────────────────────────────
export async function getLeadNotes(leadId: string): Promise<LeadNote[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_notes")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  return data as LeadNote[];
}

// ─────────────────────────────────────────────
// Query: lead notes with author names — single joined query
// ─────────────────────────────────────────────
export async function getLeadNotesFull(
  leadId: string,
): Promise<LeadNoteWithAuthor[]> {
  const key = REDIS_KEYS.leadNotes(leadId);
  try {
    const cached = await redis.get<LeadNoteWithAuthor[]>(key);
    if (cached) return cached;
  } catch {
    /* Redis unavailable — fall through to DB */
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_notes")
    .select("*, author:profiles!lead_notes_author_id_fkey(full_name)")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  const result = data as LeadNoteWithAuthor[];
  try {
    await redis.setex(key, REDIS_TTL.LEAD_NOTES, result);
  } catch {
    /* non-fatal */
  }
  return result;
}

// ─────────────────────────────────────────────
// Query: lead activities with actor names — single joined query
// ─────────────────────────────────────────────
export async function getLeadActivitiesFull(
  leadId: string,
): Promise<LeadActivityWithActor[]> {
  const key = REDIS_KEYS.leadActivities(leadId);
  try {
    const cached = await redis.get<LeadActivityWithActor[]>(key);
    if (cached) return cached;
  } catch {
    /* Redis unavailable — fall through to DB */
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_activities")
    .select("*, actor:profiles!lead_activities_actor_id_fkey(full_name)")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });

  if (error || !data) return [];
  const result = data as LeadActivityWithActor[];
  try {
    await redis.setex(key, REDIS_TTL.LEAD_ACTIVITIES, result);
  } catch {
    /* non-fatal */
  }
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
    .from("tasks")
    .select("*, task_gia_meta!inner(lead_id)")
    .eq("task_gia_meta.lead_id", leadId)
    .eq("status", "to_do")
    .order("due_at", { ascending: true })
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
    .from("lead_raw_payloads")
    .select("*")
    .not("ingestion_error", "is", null)
    .order("received_at", { ascending: false });

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
    .from("profiles")
    .select("id, full_name")
    .eq("role", "agent")
    .eq("domain", domain as AppDomain)
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (error || !data) return [];
  return data as { id: string; full_name: string }[];
}

export async function getActiveUsersForDomain(
  domain: string,
): Promise<{ id: string; full_name: string; role: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("domain", domain as AppDomain)
    .eq("is_active", true)
    .neq("role", "guest")
    .order("full_name", { ascending: true });

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
    role === "manager" ? callerDomain : (filters.domain ?? null);

  const rows = await fetchCampaignMetricsFromRpc(effectiveDomain, filters);

  if (!filters.search) return rows;

  const term = filters.search.trim().toLowerCase();
  if (!term) return rows;

  return rows.filter((row) => row.campaign_name.toLowerCase().includes(term));
}

async function fetchCampaignMetricsFromRpc(
  effectiveDomain: string | null,
  filters: Pick<CampaignFilters, "date_from" | "date_to">,
): Promise<CampaignMetrics[]> {
  const supabase = await createClient();

  // date_to end-of-day transform — same rule as getLeadsByRole
  const dateTo = filters.date_to
    ? filters.date_to.replace(/T.*$/, "T23:59:59.999Z")
    : null;

  type CampaignRpcRow = {
    campaign_name: string;
    domain: string;
    total_leads: number;
    status_new: number;
    status_touched: number;
    status_in_discussion: number;
    status_won: number;
    status_nurturing: number;
    status_lost: number;
    status_junk: number;
    outcome_rnr: number;
    outcome_switched_off: number;
    outcome_converted: number;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as unknown as any).rpc(
    "get_campaign_metrics",
    {
      p_domain: effectiveDomain,
      p_date_from: filters.date_from ?? null,
      p_date_to: dateTo,
    },
  );

  if (error || !data) return [];

  return (data as CampaignRpcRow[]).map((row) => ({
    campaign_name: row.campaign_name,
    domain: row.domain as AppDomain,
    total_leads: Number(row.total_leads),
    new: Number(row.status_new),
    touched: Number(row.status_touched),
    in_discussion: Number(row.status_in_discussion),
    won: Number(row.status_won),
    nurturing: Number(row.status_nurturing),
    lost: Number(row.status_lost),
    junk: Number(row.status_junk),
    rnr: Number(row.outcome_rnr),
    switched_off: Number(row.outcome_switched_off),
    converted: Number(row.outcome_converted),
  }));
}

// ─────────────────────────────────────────────
// Query: campaign detail metrics — single RPC, single campaign
//
// Called only from the [id] detail page. Never from the list page.
// Returns null when the campaign has no matching leads.
// ─────────────────────────────────────────────
export async function getCampaignDetailMetrics(
  campaignName: string,
  filters: Pick<CampaignFilters, "date_from" | "date_to">,
): Promise<CampaignDetailMetrics | null> {
  const supabase = await createClient();

  const dateTo = filters.date_to
    ? filters.date_to.replace(/T.*$/, "T23:59:59.999Z")
    : null;

  type DetailRpcRow = {
    campaign_name: string;
    total_leads: number;
    status_new: number;
    status_touched: number;
    status_in_discussion: number;
    status_won: number;
    status_nurturing: number;
    status_lost: number;
    status_junk: number;
    outcome_rnr: number;
    outcome_switched_off: number;
    outcome_converted: number;
    avg_hours_to_first_touch: number | null;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as unknown as any).rpc(
    "get_campaign_detail_metrics",
    {
      p_campaign: campaignName,
      p_date_from: filters.date_from ?? null,
      p_date_to: dateTo,
    },
  );

  let result: CampaignDetailMetrics | null = null;

  if (!error && data && Array.isArray(data) && data.length > 0) {
    const row = data[0] as DetailRpcRow;
    result = {
      campaign_name: row.campaign_name,
      // domain not returned by this RPC — not needed on the detail page
      domain: "" as AppDomain,
      total_leads: Number(row.total_leads),
      new: Number(row.status_new),
      touched: Number(row.status_touched),
      in_discussion: Number(row.status_in_discussion),
      won: Number(row.status_won),
      nurturing: Number(row.status_nurturing),
      lost: Number(row.status_lost),
      junk: Number(row.status_junk),
      rnr: Number(row.outcome_rnr),
      switched_off: Number(row.outcome_switched_off),
      converted: Number(row.outcome_converted),
      avg_hours_to_first_touch:
        row.avg_hours_to_first_touch !== null
          ? Number(row.avg_hours_to_first_touch)
          : null,
    };
  }

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
  filters: Pick<CampaignFilters, "date_from" | "date_to">,
): Promise<AgentDistributionRow[]> {
  const supabase = await createClient();

  const dateTo = filters.date_to
    ? filters.date_to.replace(/T.*$/, "T23:59:59.999Z")
    : null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as unknown as any).rpc(
    "get_campaign_agent_distribution",
    {
      p_campaign: campaignName,
      p_date_from: filters.date_from ?? null,
      p_date_to: dateTo,
    },
  );

  const result: AgentDistributionRow[] =
    error || !data
      ? []
      : (
          data as Array<{
            agent_id: string;
            full_name: string;
            lead_count: number;
          }>
        ).map((row) => ({
          agent_id: row.agent_id,
          full_name: row.full_name,
          lead_count: Number(row.lead_count),
        }));

  return result;
}

// ─────────────────────────────────────────────
// Round-robin: next eligible agent in a domain
// ─────────────────────────────────────────────
export async function getNextRoundRobinAgent(
  domain: string,
): Promise<string | null> {
  // Must use admin client — this runs inside the webhook handler which has no
  // authenticated session. RLS would block all three queries with auth.uid() = null.
  const supabase = createAdminClient();

  // Fetch all active agents in this domain
  const { data: agents, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("domain", domain as AppDomain)
    .eq("role", "agent")
    .eq("is_active", true);

  if (error || !agents || agents.length === 0) return null;

  const agentIds = agents.map((a) => a.id);

  // Check which agents have an active routing config (holiday switch)
  const { data: routingConfigs } = await supabase
    .from("agent_routing_config")
    .select("agent_id")
    .in("agent_id", agentIds)
    .eq("is_active", true);

  const activeAgentIds = new Set((routingConfigs ?? []).map((r) => r.agent_id));

  const eligibleAgents = agentIds.filter((id) => activeAgentIds.has(id));
  if (eligibleAgents.length === 0) return null;

  // For each eligible agent, find their most recent lead assignment timestamp
  const { data: recentLeads } = await supabase
    .from("leads")
    .select("assigned_to, assigned_at")
    .in("assigned_to", eligibleAgents)
    .is("archived_at", null)
    .order("assigned_at", { ascending: false });

  // Build a map: agentId → most recent assigned_at
  const lastAssigned: Record<string, Date | null> = {};
  for (const agentId of eligibleAgents) {
    lastAssigned[agentId] = null;
  }
  if (recentLeads) {
    for (const lead of recentLeads) {
      if (
        lead.assigned_to &&
        lead.assigned_at &&
        lastAssigned[lead.assigned_to] === null
      ) {
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
  id: string;
  slug: string | null;
  first_name: string;
  last_name: string | null;
  phone: string | null;
  domain: AppDomain;
};

/**
 * Search leads by name or phone for the lead picker in CreateGiaTaskModal.
 * Scoped by caller role: agent sees only their assigned leads,
 * manager sees their domain, admin/founder see all.
 * Returns at most 8 results.
 */
export async function searchLeadsForTask(
  query: string,
  role: UserRole,
  domain: AppDomain,
  userId: string,
): Promise<LeadSearchResult[]> {
  const supabase = await createClient();
  const term = `%${query.trim().toLowerCase()}%`;

  let q = supabase
    .from("leads")
    .select("id, slug, first_name, last_name, phone, domain")
    .or(`first_name.ilike.${term},last_name.ilike.${term},phone.ilike.${term}`)
    .is("archived_at", null)
    .limit(8);

  if (role === "agent") {
    q = q.eq("assigned_to", userId);
  } else if (role === "manager") {
    q = q.eq("domain", domain);
  }
  // admin/founder: no domain constraint

  const { data, error } = await q.order("first_name", { ascending: true });

  if (error) {
    console.error("[leads-service] searchLeadsForTask error:", error);
    return [];
  }

  return (data ?? []) as LeadSearchResult[];
}

// ─────────────────────────────────────────────
// Export: full unpapered lead list — mirrors getLeadsByRole filter logic
// exactly, but with no .range() call and a hard server-side cap of 5000 rows.
// NEVER called from a client component (A-15).
// ─────────────────────────────────────────────
export type LeadExportItem = Pick<Lead,
  | 'id' | 'slug' | 'first_name' | 'last_name' | 'phone' | 'email'
  | 'domain' | 'assigned_to' | 'status' | 'lead_intent'
  | 'source' | 'medium' | 'utm_campaign' | 'call_count'
  | 'last_call_outcome' | 'created_at' | 'status_changed_at'
  | 'deal_amount' | 'deal_type' | 'deal_duration' | 'personal_details'
> & { assignee: { full_name: string } | null };

export type ExportResult = {
  leads: LeadExportItem[];
  totalCount: number;
};

export async function getLeadsForExport(
  role: UserRole,
  userId: string,
  domain: AppDomain,
  filters: LeadFilters,
  selectedIds?: string[],
): Promise<ExportResult> {
  const supabase = await createClient();

  let query = supabase
    .from("leads")
    .select(
      `id, slug, first_name, last_name, phone, email, domain, assigned_to,
       status, lead_intent, source, medium, utm_campaign,
       call_count, last_call_outcome, created_at, status_changed_at,
       deal_amount, deal_type, deal_duration, personal_details,
       assignee:profiles!leads_assigned_to_fkey(full_name)`,
      { count: "exact", head: false },
    )
    .is("archived_at", null)
    .order("created_at", { ascending: filters.sort_order === "asc" })
    .limit(5000);

  // When specific IDs are provided, ignore all other filters
  if (selectedIds && selectedIds.length > 0) {
    // Still enforce role-level access — agent can only export their own leads
    if (role === "agent") {
      query = query.eq("assigned_to", userId);
    } else if (role === "manager") {
      query = query.eq("domain", domain);
    }
    query = query.in("id", selectedIds);
  } else {
    // Role-level constraints — mirrors getLeadsByRole exactly
    if (role === "agent") {
      query = query.eq("assigned_to", userId);
    } else if (role === "manager") {
      query = query.eq("domain", domain);
      if (filters.agent_id) {
        query = query.eq("assigned_to", filters.agent_id);
      }
    } else {
      if (filters.domain && isGiaDomain(filters.domain)) {
        query = query.eq("domain", filters.domain);
      }
      if (filters.agent_id) {
        query = query.eq("assigned_to", filters.agent_id);
      }
    }

    if (filters.status && filters.status.length > 0) {
      query = query.in("status", filters.status);
    }
    if (filters.last_call_outcome && filters.last_call_outcome.length > 0) {
      query = query.in("last_call_outcome", filters.last_call_outcome);
    }
    if (filters.source) {
      query = query.eq("source", filters.source);
    }
    if (filters.campaign) {
      query = query.eq("utm_campaign", filters.campaign);
    }
    if (filters.date_from) {
      const startOfDayIST = /T/.test(filters.date_from)
        ? filters.date_from
        : `${filters.date_from}T00:00:00+05:30`;
      query = query.gte("created_at", startOfDayIST);
    }
    if (filters.date_to) {
      const endOfDay = filters.date_to.replace(/T.*$/, "T23:59:59.999Z");
      query = query.lte("created_at", endOfDay);
    }
    if (filters.search) {
      const term = filters.search.trim().toLowerCase();
      if (term) {
        query = query.or(
          `first_name.ilike.%${term}%,last_name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%,city.ilike.%${term}%`,
        );
      }
    }
    if (filters.health) {
      query = query.eq("lead_health", filters.health);
    }
    if (filters.going_cold) {
      const threshold = new Date(Date.now() - COLD_LEAD_THRESHOLD_DAYS * 86_400_000).toISOString();
      query = query
        .lt("last_activity_at", threshold)
        .not("status", "in", `("won","lost","junk")`);
    }
  }

  const { data, error, count } = await query;
  if (error || !data) return { leads: [], totalCount: 0 };

  return {
    leads: data as LeadExportItem[],
    totalCount: count ?? 0,
  };
}

// ─────────────────────────────────────────────
// Export: activities + notes for a set of lead IDs
// Single IN query on each table — never per-row.
// NEVER called from a client component (A-15).
// ─────────────────────────────────────────────
export type ExportActivitiesAndNotes = {
  activities: LeadActivityWithActor[];
  notes: LeadNoteWithAuthor[];
};

export async function getActivitiesAndNotesForExport(
  leadIds: string[],
): Promise<ExportActivitiesAndNotes> {
  if (leadIds.length === 0) return { activities: [], notes: [] };

  const supabase = await createClient();

  const [activitiesResult, notesResult] = await Promise.all([
    supabase
      .from("lead_activities")
      .select("*, actor:profiles!lead_activities_actor_id_fkey(full_name)")
      .in("lead_id", leadIds)
      .order("created_at", { ascending: true }),
    supabase
      .from("lead_notes")
      .select("*, author:profiles!lead_notes_author_id_fkey(full_name)")
      .in("lead_id", leadIds)
      .order("created_at", { ascending: true }),
  ]);

  return {
    activities: (activitiesResult.data ?? []) as LeadActivityWithActor[],
    notes: (notesResult.data ?? []) as LeadNoteWithAuthor[],
  };
}
