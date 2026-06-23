import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isGiaDomain, type GiaDomain } from "@/lib/constants/domains";
import { goingColdCutoff } from "@/lib/constants/leads";
import { ROUTING_POOL_ROLES } from "@/lib/constants/roles";
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
import type { WithAuthor, WithAssignee, WithActor } from "@/lib/types";

export type LeadNoteWithAuthor   = WithAuthor<LeadNote>;
export type LeadActivityWithActor = WithActor<LeadActivity>;
export type LeadWithAssignee     = WithAssignee<Lead>;

type LatestNote = { content: string; created_at: string; author_name: string | null };

export type LeadListItem = Pick<
  Lead,
  | 'id' | 'slug' | 'first_name' | 'last_name' | 'phone' | 'email'
  | 'domain' | 'assigned_to' | 'status' | 'lead_intent'
  | 'source' | 'medium' | 'utm_campaign' | 'call_count'
  | 'last_call_outcome' | 'created_at'
> & { latest_note: LatestNote | null };
export type LeadListItemWithAssignee = WithAssignee<LeadListItem>;
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
export async function getLeadsForDomain(domain: AppDomain): Promise<Lead[]> {
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
//   Default page=1, pageSize=30. An unfiltered first load fetches exactly
//   30 rows — never the full table.
//
// Count: totalCount = sum of get_leads_status_counts rows (perf audit C-1) —
//   the RPC runs the identical predicate once, in Promise.all with the
//   paginated query. The paginated query carries NO count option; never
//   re-add { count: 'exact' } (second full scan) or a separate COUNT(*).
// ─────────────────────────────────────────────
export type LeadsResult = {
  leads:        LeadListItemWithAssignee[];
  totalCount:   number;
  statusCounts: Partial<Record<LeadStatus, number>>;
};

// Envelope stored at the lead-list key (perf audit C-3): `v` is the
// leadListVersion counter value the entry was written under. A read is a hit
// only when `v` matches the live counter fetched in the same MGET.
type VersionedLeadsResult = { v: number; result: LeadsResult };

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
  // Revival review predicate (Phase R1): the list filtered to leads that hold an
  // OPEN revival_candidate. This is a cross-table subquery the status-counts RPC
  // can't express (C-1), so it takes its own path: resolve the candidate lead_ids
  // (RLS-scoped on the session client — agent sees own, manager sees domain), then
  // .in('id', ids). Redis list cache is bypassed deliberately — a freshness-
  // sensitive, low-volume review surface, like the going_cold preset.
  if (filters.revival) {
    return getRevivalCandidateLeads(role, userId, domain, filters);
  }

  // Redis cache-aside, version-validated (perf audit C-3): ONE MGET fetches the
  // role+domain version counter and the list entry together — Upstash is HTTP,
  // so the old version-read-then-list-read shape paid 2×RTT on every load.
  // A hit requires the entry's stored `v` to match the live counter, so an INCR
  // in lead-cache.ts still atomically voids all prior pages. A version miss
  // (null) defaults to 0 — the first INCR bumps it to 1 and voids v:0 entries.
  let version = 0;
  const listKey = buildLeadListKey(role, domain, userId, filters);
  try {
    const [v, cached] = await redis.mget<[number | null, VersionedLeadsResult | null]>(
      REDIS_KEYS.leadListVersion(role, domain),
      listKey,
    );
    if (v !== null) version = v;
    if (cached && cached.v === version) return cached.result;
  } catch {
    /* Redis unavailable — version stays 0, fall through to DB */
  }

  const supabase = await createClient();

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, Math.min(200, filters.pageSize ?? 30));
  const offset = (page - 1) * pageSize;

  // Filter values computed ONCE and shared verbatim by the paginated query and
  // the get_leads_status_counts RPC below. totalCount is derived from the RPC
  // (sum of per-status counts), so the two predicates must never drift — any
  // new filter must be applied to both in the same change.
  //
  // date_from IST midnight transform: bare YYYY-MM-DD → YYYY-MM-DDT00:00:00+05:30.
  // Without this, PostgREST treats the bare date as UTC midnight, which is
  // 5.5 hours into the IST calendar day — leads created before 05:30 IST are excluded.
  const dateFrom = filters.date_from
    ? (/T/.test(filters.date_from) ? filters.date_from : `${filters.date_from}T00:00:00+05:30`)
    : null;
  // End-of-day transform: include all leads up to 23:59:59.999 on date_to
  const dateTo = filters.date_to
    ? filters.date_to.replace(/T.*$/, "T23:59:59.999Z")
    : null;
  // Trim and lowercase in the service — never trust raw client input
  const searchTerm = filters.search ? filters.search.trim().toLowerCase() || null : null;
  // Going-cold threshold: last_activity_at older than the cold window (the ONE
  // cutoff helper — shared verbatim with the count RPC's p_going_cold below).
  const goingColdThreshold = filters.going_cold ? goingColdCutoff() : null;
  // Admin/founder Gia domain slice — agent/manager scoping never comes from filters
  const domainSlice =
    role !== "agent" && role !== "manager" && filters.domain && isGiaDomain(filters.domain)
      ? filters.domain
      : null;

  // totalCount comes from the status-counts RPC (one predicate scan) — never
  // re-add { count: 'exact' } here, it forces a second full scan per load (C-1)
  let query = supabase
    .from("leads")
    .select(
      `id, slug, first_name, last_name, phone, email, domain, assigned_to,
       status, lead_intent, source, medium, utm_campaign,
       call_count, last_call_outcome, created_at,
       assignee:profiles!leads_assigned_to_fkey(full_name)`,
    )
    .is("archived_at", null)
    .order("created_at", { ascending: filters.sort_order === "asc" });

  // Role-level constraints — applied before any filter, cannot be overridden
  if (role === "agent") {
    query = query.eq("assigned_to", userId);
    // agent_id filter intentionally NOT applied here — role constraint wins
  } else if (role === "manager") {
    query = query.eq("domain", domain);
    // "My Leads" view — force-scope the manager to their own assigned leads.
    // Composes with the domain constraint above; the explicit agent_id filter
    // only applies in the "All Leads" view (the My-Leads scope is the manager's
    // own id, so an agent_id filter would be contradictory / always-empty).
    if (filters.view === "mine") {
      query = query.eq("assigned_to", userId);
    } else if (filters.agent_id) {
      query = query.eq("assigned_to", filters.agent_id);
    }
  } else {
    // admin / founder — optional domain slice (Gia domains only); agent_id honoured
    if (domainSlice) {
      query = query.eq("domain", domainSlice);
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

  if (dateFrom) {
    query = query.gte("created_at", dateFrom);
  }

  if (dateTo) {
    query = query.lte("created_at", dateTo);
  }

  if (searchTerm) {
    // Single ILIKE over the generated search_text column (migration 0098) —
    // served by idx_leads_search_trgm. Never revert to a per-column .or()
    // ILIKE chain: it bypasses the index and drifts from the count RPC.
    query = query.filter("search_text", "ilike", `%${searchTerm}%`);
  }

  if (goingColdThreshold) {
    // NULL last_activity_at leads are intentionally excluded by lt() — those are
    // handled by SLA-01A (never-contacted leads), not the going-cold preset.
    query = query
      .lt("last_activity_at", goingColdThreshold)
      .not("status", "in", `("won","lost","junk")`);
  }

  // Pagination — always applied, never conditional
  query = query.range(offset, offset + pageSize - 1);

  // Params mirror getLeadsByRole filter application — keep in sync.
  // When a new filter is added to LeadFilters, update both this RPC call and
  // the filter chain above simultaneously (the hoisted values above exist so
  // both sides receive identical bounds).
  const [queryResult, statusCountsResult] = await Promise.all([
    query,
    // The generated RPC arg types model SQL-DEFAULT params as `string | undefined`,
    // but we pass explicit `null` for "no filter" (PostgREST sends JSON null; the
    // function's DEFAULT/empty-array guards handle it). The cast bridges that gap —
    // see src/lib/CLAUDE.md "RPC pattern" (sanctioned, not interim).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as unknown as any).rpc("get_leads_status_counts", {
      // p_agent_id must mirror the paginated query's assigned_to constraint
      // exactly (param-sync rule): agent → own id; manager in "My Leads" view →
      // own id; otherwise the explicit agent_id filter (null when absent).
      p_agent_id:
        role === "agent" || (role === "manager" && filters.view === "mine")
          ? userId
          : (filters.agent_id ?? null),
      p_date_from:   dateFrom,
      p_date_to:     dateTo,
      p_campaign:    filters.campaign ?? null,
      p_search:      searchTerm,
      p_going_cold:  goingColdThreshold,
      p_domain:      domainSlice,
      p_source:      filters.source ?? null,
      p_outcomes:    (filters.last_call_outcome && filters.last_call_outcome.length > 0)
        ? filters.last_call_outcome
        : null,
      p_statuses:    (filters.status && filters.status.length > 0)
        ? filters.status
        : null,
    }),
  ]);

  const { data, error } = queryResult;
  if (error || !data) return { leads: [], totalCount: 0, statusCounts: {} };

  // Reduce RPC rows into Partial<Record<LeadStatus, number>> and derive
  // totalCount as their sum — the RPC scans the identical predicate once,
  // replacing the second { count: 'exact' } scan (perf audit C-1).
  // On RPC error: pills show no counts (Q-09) and totalCount degrades to a
  // floor derived from the fetched page (pagination hides rather than lies).
  const statusCounts: Partial<Record<LeadStatus, number>> = {};
  let totalCount = 0;
  if (!statusCountsResult.error && Array.isArray(statusCountsResult.data)) {
    for (const row of statusCountsResult.data as { status: string; cnt: unknown }[]) {
      const n = Number(row.cnt);
      statusCounts[row.status as LeadStatus] = n;
      totalCount += n;
    }
  } else {
    console.warn(
      "[leads-service] get_leads_status_counts failed — totalCount degraded to page floor",
      statusCountsResult.error,
    );
    totalCount = offset + (data as unknown[]).length;
  }

  // Batch-fetch latest note per lead — one extra query, never per-row (Invariant 29)
  const leadIds = (data as { id: string }[]).map((l) => l.id);
  const notesMap = await getLatestNotesForLeads(leadIds, supabase);

  const leads = (data as (Omit<LeadListItemWithAssignee, 'latest_note'> & { assignee: { full_name: string } | null })[]).map(
    (l) => ({ ...l, latest_note: notesMap.get(l.id) ?? null }),
  );

  const result: LeadsResult = {
    leads,
    totalCount,
    statusCounts,
  };

  // Cache the list result only — dossier row keys (leadRowId/leadRowSlug) are NOT
  // warmed here because this query selects a subset of columns. Storing a partial
  // object under those keys would corrupt getLeadById / getLeadBySlug reads.
  // `v` is the counter read before the DB query: if a mutation INCRed it while we
  // were querying, the entry is born stale-marked and the next read misses (C-3).
  try {
    await redis.setex(listKey, REDIS_TTL.LEAD_LIST, { v: version, result } satisfies VersionedLeadsResult);
  } catch {
    /* non-fatal: list cache failure never blocks the response */
  }

  return result;
}

// ─────────────────────────────────────────────
// Revival review predicate — leads holding an OPEN revival_candidate.
//
// Reuses the SAME column subset + assignee join + ordering as getLeadsByRole so
// LeadsTable renders identically; the only difference is the row set (scoped to
// open candidates) and the count (derived from the resolved set, not the
// status-counts RPC). Session client throughout — RLS on revival_candidates AND
// leads double-scopes by role/domain (agent → own, manager → domain, admin/founder
// → all), matching the going_cold preset's reliance on RLS.
// ─────────────────────────────────────────────
async function getRevivalCandidateLeads(
  role: UserRole,
  userId: string,
  domain: AppDomain,
  filters: LeadFilters,
): Promise<LeadsResult> {
  const supabase = await createClient();
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, Math.min(200, filters.pageSize ?? 30));

  // Resolve the visible open-candidate lead_ids (RLS-scoped). Bounded — the review
  // tab is a small surface; the partial index idx_revival_candidates_open serves it.
  // RLS scopes the rows on the session client (the review-tab access boundary).
  const { data: candidateRows, error: candErr } = await supabase
    .from("revival_candidates")
    .select("lead_id")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (candErr || !candidateRows || candidateRows.length === 0) {
    return { leads: [], totalCount: 0, statusCounts: {} };
  }

  // Dedup (the one-open guard means ≤1 per lead, but stay defensive).
  const leadIds = Array.from(
    new Set((candidateRows as Array<{ lead_id: string }>).map((r) => r.lead_id)),
  );
  const totalCount = leadIds.length;

  // Page over the resolved id set, then fetch those leads (RLS re-scopes — an agent
  // can never see a candidate's lead outside their assignment even if the id leaked).
  const pageIds = leadIds.slice((page - 1) * pageSize, page * pageSize);
  const leads = await fetchLeadsByIds(role, userId, domain, pageIds, filters.sort_order === "asc");

  // statusCounts left empty — the status pills are meaningless for a candidate view
  // (these leads are scattered across touched/in_discussion/nurturing by design).
  return { leads, totalCount, statusCounts: {} };
}

// ─────────────────────────────────────────────
// Resolve a bounded set of lead ids → LeadsResult-shaped rows, scoped by role.
//
// THE id-set → list-rows reader. Selects the SAME column subset + assignee join +
// latest-note batch as getLeadsByRole so LeadsTable / the drill modals render
// identically. Role constraints are defence-in-depth alongside RLS on the session
// client (agent → own, manager → domain, admin/founder → all). Used by the revival
// review predicate AND the first-touch bucket drill-down — never re-inline an
// id-set lead fetch (R-01). No Redis (the caller owns its own freshness posture).
// ─────────────────────────────────────────────
async function fetchLeadsByIds(
  role:   UserRole,
  userId: string,
  domain: AppDomain,
  ids:    string[],
  ascending = false,
): Promise<LeadListItemWithAssignee[]> {
  if (ids.length === 0) return [];

  const supabase = await createClient();

  let query = supabase
    .from("leads")
    .select(
      `id, slug, first_name, last_name, phone, email, domain, assigned_to,
       status, lead_intent, source, medium, utm_campaign,
       call_count, last_call_outcome, created_at,
       assignee:profiles!leads_assigned_to_fkey(full_name)`,
    )
    .in("id", ids)
    .is("archived_at", null)
    .order("created_at", { ascending });

  // Role constraints — defense in depth alongside RLS (mirrors getLeadsByRole).
  if (role === "agent") query = query.eq("assigned_to", userId);
  else if (role === "manager") query = query.eq("domain", domain);

  const { data, error } = await query;
  if (error || !data) return [];

  const fetchedIds = (data as { id: string }[]).map((l) => l.id);
  const notesMap = await getLatestNotesForLeads(fetchedIds, supabase);
  return (data as (Omit<LeadListItemWithAssignee, "latest_note"> & {
    assignee: { full_name: string } | null;
  })[]).map((l) => ({ ...l, latest_note: notesMap.get(l.id) ?? null }));
}

// Public wrapper for the first-touch bucket drill-down — resolves the bucket's
// lead ids (computed in performance-service via the shared classification) into
// LeadsResult rows. Session client + role scope = the same access boundary as the
// revival review predicate; the gated action (assertDrillAccess) is the first layer.
export async function getLeadsByIds(
  role:   UserRole,
  userId: string,
  domain: AppDomain,
  ids:    string[],
): Promise<LeadListItemWithAssignee[]> {
  return fetchLeadsByIds(role, userId, domain, ids);
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
//
// SESSION-CLIENT ONLY (createClient() + RLS). A sessionless caller (Trigger.dev
// job, WhatsApp webhook, Elaya brain after the cookie session is off the request)
// gets 0 rows → must use the admin-client twin getLeadNotesFullForElaya instead.
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
// Elaya read path — principal-scoped, ADMIN-CLIENT reads (sessionless contexts)
//
// Why these exist: the Elaya WhatsApp staff channel runs in the webhook's
// after() with NO cookie/session. getLeadsByRole / getLeadBySlug / getLeadNotesFull
// call createClient() (cookie-based) — RLS then returns ZERO rows, and Elaya tells
// the staff member their leads are "not in the database" (the bug that prompted
// this). These functions read via the ADMIN client so they work in any context,
// and replicate EXACTLY the role/domain/assigned_to scoping that getLeadsByRole
// enforces in code (the sanctioned Q-13 trust-boundary pattern: RLS bypass requires
// explicit, principal-derived code-side scoping). The CALLER (Elaya read tool) is
// the trust boundary — it always passes role/userId/domain derived from the VERIFIED
// principal, never model output. Per-resource access stays the tool's canAccessLead
// gate. Counts are derived from the page (the self-scoped get_leads_status_counts
// RPC reads auth.uid() and returns zeros under the admin client — never call it here).
// ─────────────────────────────────────────────

/**
 * Elaya search_leads source — the same column subset + assignee join as
 * getLeadsByRole, scoped in code, read via the admin client so it works in the
 * sessionless WhatsApp context. statusCounts are derived from the returned page
 * (NOT the self-scoped RPC). NOT Redis-cached: the list keys embed a session-
 * scoped shape, and this path is low-volume.
 */
export async function searchLeadsForElaya(
  role: UserRole,
  userId: string,
  domain: AppDomain,
  opts: { search: string | null; statuses: LeadStatus[] | null; page: number; pageSize: number },
): Promise<LeadsResult> {
  const admin = createAdminClient();
  const page = Math.max(1, opts.page);
  const pageSize = Math.max(1, Math.min(50, opts.pageSize));
  const offset = (page - 1) * pageSize;

  let query = admin
    .from("leads")
    .select(
      `id, slug, first_name, last_name, phone, email, domain, assigned_to,
       status, lead_intent, source, medium, utm_campaign,
       call_count, last_call_outcome, created_at,
       assignee:profiles!leads_assigned_to_fkey(full_name)`,
    )
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  // Hard role scope — RLS-equivalent, code-enforced (the trust boundary).
  // Mirrors getLeadsByRole exactly: agent → own assigned leads; manager → own
  // domain; admin/founder → no pre-constraint. Never weaken this.
  if (role === "agent") {
    query = query.eq("assigned_to", userId);
  } else if (role === "manager") {
    query = query.eq("domain", domain);
  }

  if (opts.statuses && opts.statuses.length > 0) {
    query = query.in("status", opts.statuses);
  }
  if (opts.search) {
    query = query.filter("search_text", "ilike", `%${opts.search.trim().toLowerCase()}%`);
  }
  query = query.range(offset, offset + pageSize - 1);

  const { data, error } = await query;
  if (error || !data) return { leads: [], totalCount: 0, statusCounts: {} };

  const leads = data as unknown as LeadListItemWithAssignee[];
  // Counts derived from the returned page (sessionless RPC would return zeros).
  const statusCounts: Partial<Record<LeadStatus, number>> = {};
  for (const l of leads) {
    statusCounts[l.status] = (statusCounts[l.status] ?? 0) + 1;
  }
  return { leads, totalCount: leads.length, statusCounts };
}

/**
 * Elaya get_lead_details source — one lead by slug, via the admin client (works
 * sessionless). The CALLER must still run canAccessLead on the result before
 * surfacing it (this returns the row for ANY slug — scoping is the tool's gate,
 * exactly as with the session getLeadBySlug + the existing canAccessLead check).
 */
export async function getLeadBySlugForElaya(slug: string): Promise<LeadWithAssignee | null> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("leads")
    .select("*, assignee:profiles!leads_assigned_to_fkey(full_name)")
    .eq("slug", slug)
    .is("archived_at", null)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as LeadWithAssignee;
}

/**
 * Elaya note-history source — the 5-most-recent notes for an already-access-
 * checked lead, via the admin client (works sessionless). Caller gates access on
 * the lead FIRST (canAccessLead), so scoping is by the verified leadId.
 */
export async function getLeadNotesFullForElaya(leadId: string): Promise<LeadNoteWithAuthor[]> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("lead_notes")
    .select("*, author:profiles!lead_notes_author_id_fkey(full_name)")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data as LeadNoteWithAuthor[];
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
  // The generated row types attachments as Json; Task narrows it to ChecklistItem[]
  // (the tasks_attachments_is_array CHECK guarantees the array shape) — cross once.
  return data[0] as unknown as Task;
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
  // get_campaign_metrics has no internal scope gate (p_domain=NULL → all
  // domains) — EXECUTE revoked from `authenticated` (migration 0102, audit
  // F-1). Admin client only; getCampaignMetrics pins managers to their own
  // domain before calling (Q-13: the caller is the trust boundary).
  const supabase = createAdminClient();

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
  // No internal scope gate (filters only by utm_campaign) — EXECUTE revoked
  // from `authenticated` (0102, F-1). Admin client; reachable only via the
  // auth-gated campaign detail page (Q-13).
  const supabase = createAdminClient();

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
  // No internal scope gate (filters only by utm_campaign) — EXECUTE revoked
  // from `authenticated` (0102, F-1). Admin client; reachable only via the
  // auth-gated campaign detail page (Q-13).
  const supabase = createAdminClient();

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
// Round-robin: next eligible pool member in a domain
// Pool = ROUTING_POOL_ROLES (agents + managers), one fair queue.
//
// THE picker is the atomic SQL `get_next_round_robin_agent` (migration
// 0007/0124): it selects the oldest-assigned eligible member under
// `FOR UPDATE OF arc SKIP LOCKED`, so two concurrent ingests can never pick
// the SAME agent (audit #5 — the previous JS implementation read an
// `assigned_at` snapshot with no lock and handed two simultaneous leads to one
// agent). The SQL is also the single source of eligibility truth — it filters
// `is_on_leave = false`, which the old JS path silently ignored.
//
// The JS scan below is a DEFENSIVE FALLBACK, used only if the RPC itself errors
// (e.g. not yet deployed). It is NOT race-safe — it exists purely so ingestion
// degrades to a best-effort pick rather than always-unassigned on RPC failure.
// ─────────────────────────────────────────────
export async function getNextRoundRobinAgent(
  domain: string,
): Promise<string | null> {
  // Must use admin client — this runs inside the webhook handler which has no
  // authenticated session, and the RPC's EXECUTE is service-role only.
  const supabase = createAdminClient();

  const { data, error } = await supabase.rpc("get_next_round_robin_agent", {
    p_domain: domain,
  });

  if (!error) {
    // RPC succeeded — `data` is the chosen uuid or null (empty pool). This is
    // the atomic, race-safe path and the only one used in normal operation.
    return (data as string | null) ?? null;
  }

  console.error(
    "[leads-service] get_next_round_robin_agent RPC failed, using non-atomic JS fallback:",
    error.message,
  );
  return getNextRoundRobinAgentFallback(supabase, domain);
}

// Non-atomic best-effort fallback (RPC-error path only). Mirrors the RPC's
// eligibility (active pool member, active routing config, oldest assignment
// first) but WITHOUT locking and WITHOUT the is_on_leave filter the SQL owns.
async function getNextRoundRobinAgentFallback(
  supabase: ReturnType<typeof createAdminClient>,
  domain: string,
): Promise<string | null> {
  const { data: agents, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("domain", domain as AppDomain)
    .in("role", ROUTING_POOL_ROLES)
    .eq("is_active", true);

  if (error || !agents || agents.length === 0) return null;

  const agentIds = agents.map((a) => a.id);

  const { data: routingConfigs } = await supabase
    .from("agent_routing_config")
    .select("agent_id")
    .in("agent_id", agentIds)
    .eq("is_active", true);

  const activeAgentIds = new Set((routingConfigs ?? []).map((r) => r.agent_id));

  const eligibleAgents = agentIds.filter((id) => activeAgentIds.has(id));
  if (eligibleAgents.length === 0) return null;

  const { data: recentLeads } = await supabase
    .from("leads")
    .select("assigned_to, assigned_at")
    .in("assigned_to", eligibleAgents)
    .is("archived_at", null)
    .order("assigned_at", { ascending: false });

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
    // search_text (migration 0098) — indexed, and immune to .or() syntax
    // injection from commas/parens in the typed query
    .filter("search_text", "ilike", term)
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
  | 'personal_details'
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
       personal_details,
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
      // "My Leads" view scopes the export to the manager's own leads, exactly
      // like the list. agent_id only applies in the "All Leads" view.
      if (filters.view === "mine") {
        query = query.eq("assigned_to", userId);
      } else if (filters.agent_id) {
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
        // Same search_text predicate as getLeadsByRole (migration 0098) —
        // the export must return exactly the rows the filtered list shows.
        query = query.filter("search_text", "ilike", `%${term}%`);
      }
    }
    if (filters.going_cold) {
      query = query
        .lt("last_activity_at", goingColdCutoff())
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
