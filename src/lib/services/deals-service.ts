import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isGiaDomain } from '@/lib/constants/domains';
import type { UserRole, AppDomain, DealFilters, DealWithRelations, Deal } from '@/lib/types/database';

// ─────────────────────────────────────────────
// Result types
// ─────────────────────────────────────────────

export type { DealWithRelations };

export type DealsResult = {
  deals:      DealWithRelations[];
  totalCount: number;
};

export type DealsSummary = {
  total_deals:      number;
  total_revenue:    number;
  membership_count: number;
  retail_count:     number;
};

// ─────────────────────────────────────────────
// getDealsByRole — role-scoped deal rows from public.deals
//
// Security contract:
//   - agent: assigned_to = auth.uid() applied first, DealFilters.agent_id ignored
//   - manager: domain constraint applied before any filter
//   - admin/founder: optional domain/agent_id from DealFilters
//
// Structural constraints (never conditional):
//   - archived_at IS NULL (every deal row IS a deal — no status gate needed)
//
// Joins: lead(slug) — nullable (walk-ins have no lead); assignee(full_name) — nullable.
// Count: { count: 'exact', head: false } — one round trip, never two queries.
// ─────────────────────────────────────────────
export async function getDealsByRole(
  role:    UserRole,
  userId:  string,
  domain:  AppDomain,
  filters: DealFilters = {
    search:        null,
    domain:        null,
    deal_type:     null,
    deal_category: null,
    agent_id:      null,
    date_from:     null,
    date_to:       null,
    page:          1,
    pageSize:      50,
  },
  // Scope is enforced ENTIRELY by the explicit role/userId/domain .eq() filters
  // below — never auth.uid(). The session client is only a secondary RLS net, so a
  // caller in a sessionless context (Elaya/WhatsApp) may inject the admin client
  // and still get correctly-scoped results. Default keeps every existing caller
  // on the session client (getDealsByRoleForElaya passes the admin client).
  injectedClient?: Awaited<ReturnType<typeof createAdminClient>>,
): Promise<DealsResult> {
  const supabase = injectedClient ?? (await createClient());

  const page     = Math.max(1, filters.page ?? 1);
  const pageSize = Math.max(1, Math.min(200, filters.pageSize ?? 50));
  const offset   = (page - 1) * pageSize;

  let query = supabase
    .from('deals')
    .select(
      '*, lead:leads!deals_lead_id_fkey(slug), assignee:profiles!deals_assigned_to_fkey(full_name)',
      { count: 'exact', head: false },
    )
    .is('archived_at', null)
    .order('won_at', { ascending: false });

  // Role-level constraints — applied before any filter, cannot be overridden
  if (role === 'agent') {
    query = query.eq('assigned_to', userId);
    // DealFilters.agent_id intentionally NOT applied — role constraint wins
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
  if (filters.deal_type) {
    query = query.eq('deal_type', filters.deal_type);
  }

  if (filters.deal_category) {
    query = query.eq('deal_category', filters.deal_category);
  }

  if (filters.date_from) {
    query = query.gte('won_at', filters.date_from);
  }

  if (filters.date_to) {
    const endOfDay = filters.date_to.replace(/T.*$/, 'T23:59:59.999Z');
    query = query.lte('won_at', endOfDay);
  }

  if (filters.search) {
    const term = filters.search.trim().toLowerCase();
    if (term) {
      query = query.or(
        `contact_name.ilike.%${term}%,contact_phone.ilike.%${term}%,contact_email.ilike.%${term}%`,
      );
    }
  }

  // Pagination — always applied
  query = query.range(offset, offset + pageSize - 1);

  const { data, error, count } = await query;
  if (error || !data) return { deals: [], totalCount: 0 };
  return { deals: data as unknown as DealWithRelations[], totalCount: count ?? 0 };
}

// ─────────────────────────────────────────────
// getDealsByRoleForElaya — sessionless deal read for Elaya (in-app SSE after the
// cookie session is gone + WhatsApp webhook). Reuses getDealsByRole's EXACT query
// + role scoping (R-01 — no duplication) but injects the admin client, because the
// session client returns nothing without auth.uid() (the H1 silent-blank bug).
// Identity (role/userId/domain) is principal-derived, never model-supplied; the
// .eq() role filters inside getDealsByRole are the trust boundary, same as
// searchLeadsForElaya. The model only supplies filter values.
// ─────────────────────────────────────────────
export async function getDealsByRoleForElaya(
  role:    UserRole,
  userId:  string,
  domain:  AppDomain,
  filters: DealFilters,
): Promise<DealsResult> {
  return getDealsByRole(role, userId, domain, filters, createAdminClient());
}

// ─────────────────────────────────────────────
// getDealsSummary — calls get_deals_summary RPC (migrated to public.deals in 0074)
//
// Same role+filter constraints as getDealsByRole — the RPC mirrors them exactly.
// Date range applied to won_at.
// Returns aggregate counts for the DealsSummaryStrip.
// ─────────────────────────────────────────────
export async function getDealsSummary(
  role:    UserRole,
  userId:  string,
  domain:  AppDomain,
  filters: DealFilters,
): Promise<DealsSummary> {
  // get_deals_summary trusts p_role/p_caller_domain — EXECUTE revoked from
  // `authenticated` (migration 0102, audit F-1). Admin client only; the args
  // below must stay session-derived (Q-13: the caller is the trust boundary).
  const supabase = createAdminClient();

  // p_caller_domain — always the server-verified profile domain.
  // Used by the RPC for the manager role-gate: d.domain = p_caller_domain.
  // Never derived from filters — a tampered filter.domain cannot redirect this.
  const rpcCallerDomain: string = domain;

  // p_filter_domain — optional admin/founder domain slice from the URL filter.
  // Ignored by the RPC when p_role = 'manager' (already gated by p_caller_domain).
  const rpcFilterDomain: string | null =
    role !== 'agent' && role !== 'manager' && filters.domain && isGiaDomain(filters.domain)
      ? filters.domain
      : null;

  // For agent role, pass their own userId as the agent_id gate.
  const rpcAgentId = role === 'agent' ? userId : (filters.agent_id ?? null);

  const dateFrom = filters.date_from ?? null;
  const dateTo   = filters.date_to
    ? filters.date_to.replace(/T.*$/, 'T23:59:59.999Z')
    : null;

  // The generated RPC arg types model SQL-DEFAULT params as `string | undefined`,
  // but we pass explicit `null` for "no filter" (PostgREST sends JSON null; the
  // function's DEFAULT/null guards handle it). The cast bridges that gap — same
  // sanctioned convention as get_leads_status_counts in leads-service.ts (Q-13 /
  // src/lib/CLAUDE.md "RPC pattern"); the table selects above no longer need it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as unknown as any).rpc('get_deals_summary', {
    p_role:          role,
    p_caller_domain: rpcCallerDomain,
    p_filter_domain: rpcFilterDomain,
    p_agent_id:      rpcAgentId,
    p_deal_type:     filters.deal_type ?? null,
    p_date_from:     dateFrom,
    p_date_to:       dateTo,
  });

  if (error || !data || !Array.isArray(data) || data.length === 0) {
    return { total_deals: 0, total_revenue: 0, membership_count: 0, retail_count: 0 };
  }

  const row = data[0];
  return {
    total_deals:      Number(row.total_deals      ?? 0),
    total_revenue:    Number(row.total_revenue     ?? 0),
    membership_count: Number(row.membership_count  ?? 0),
    retail_count:     Number(row.retail_count      ?? 0),
  };
}

// ─────────────────────────────────────────────
// getLeadDeal — the single non-archived deal linked to a lead (won path).
//
// Uses the session client; RLS applies. An agent querying a deal they do not
// own (assigned_to mismatch) receives null — correct RLS behaviour, not a bug.
// Returns null on empty result or any Supabase error — never throws.
// Used by the lead dossier (/leads/[id]) to render the LeadDealCard.
// ─────────────────────────────────────────────
export async function getLeadDeal(leadId: string): Promise<Deal | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('deals')
    .select('*')
    .eq('lead_id', leadId)
    .is('archived_at', null)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as Deal;
}
