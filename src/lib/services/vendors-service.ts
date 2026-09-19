// vendors-service.ts — read-only vendor queries + THE ranker (migrations 0183–0185).
//
// SERVER ONLY. ADMIN member throughout (the revival-service / elaya-actions-service
// posture), NOT session+RLS like subscriptions-service: rankVendorsForRequest is
// also the body of Elaya's future find_vendors tool, which runs SESSIONLESS on the
// WhatsApp webhook (auth.uid() is NULL there — a session client would return []).
// So the CALLER is the trust boundary (Q-13): every entry here sits behind a
// requireProfile(['admin','founder'])-gated action (actions/vendors.ts) or the
// Elaya principal gate. The 0183–0185 SELECT policies (admin/founder) are the
// defence-in-depth mirror of that gate, not the gate itself.
//
// No Redis — internal-scale data (tens of thousands of vendors, a few thousand
// engagements a year); freshness via revalidatePath(VENDORS_PATH) on write.
// database.ts does not include these tables yet — rows are narrowed once per
// query to the hand-declared types in types/vendor.ts (the subscription.ts posture).
import { createAdminClient } from "@/lib/supabase/admin";
import { callAdminRpc, callAdminRpcAll, callAdminRpcChecked } from "@/lib/services/rpc-helpers";
import { mapRows } from "@/lib/utils/rows";
import { computeVendorScore, vendorFlags } from "@/lib/utils/vendor-score";
import { readVendorRequest, type VendorSearchIntent } from "@/lib/services/vendor-search-intent";
import {
  REVIEW_DIMENSIONS,
  VENDOR_LIST_PAGE_SIZE,
  VENDOR_INVOICE_PREVIEW,
  VENDOR_TOP_AGENTS,
  SCORE_WINDOW_MONTHS,
  RANK_DEFAULT_LIMIT,
  RANK_MAX_LIMIT,
  VENDOR_DETAIL_RECENT_ROWS,
  VENDOR_SEARCH_DEFAULT_LIMIT,
  VENDOR_SEARCH_MAX_LIMIT,
  type VendorStatus,
  type ReviewDimension,
  PREFERRED_BOOST,
} from "@/lib/constants/vendors";
import type {
  VendorAgentPreferenceRow,
  VendorAgentPreferenceWithAgent,
  VendorRow,
  VendorCapabilityRow,
  VendorEngagementRow,
  VendorReviewRow,
  VendorScoreInputs,
  VendorDetail,
  VendorListItem,
  VendorNoteWithAuthor,
  VendorAgentUsage,
  VendorCategoryUsage,
  VendorInvoice,
  RankedVendor,
} from "@/lib/types/vendor";

type AdminClient = ReturnType<typeof createAdminClient>;

// Interim until database.ts is regenerated after 0183–0185 land (the
// revival/suggestions posture) — the ONE cast in this file.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const from = (admin: AdminClient, table: string) => (admin as any).from(table);

const LOG = "[vendors-service]";

/** The rolling engagement window every score reads (SCORE_WINDOW_MONTHS back from `now`). */
export function scoreWindowStart(now: Date): Date {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - SCORE_WINDOW_MONTHS);
  return d;
}

// ── Score inputs (the one SQL rollup) ──────────────────────────────────────────

/** The get_vendor_score_inputs row exactly as PostgREST returns it. */
type ScoreInputsRpcRow = {
  vendor_id: string;
  total_used: number;
  engagement_count: number;
  category_count: number;
  city_count: number;
  completed_count: number;
  failed_count: number;
  cancelled_count: number;
  last_started_at: string | null;
  review_count: number;
  avg_speed: number | string | null;      // numeric — coerce (Q-09)
  avg_quality: number | string | null;
  avg_pricing: number | string | null;
  avg_reliability: number | string | null;
  preferred_count: number;                 // 0191
  avoid_count: number;
};

const num = (v: number | string | null): number | null => (v == null ? null : Number(v));

function mapScoreInputs(r: ScoreInputsRpcRow): VendorScoreInputs {
  return {
    vendorId: r.vendor_id,
    totalUsed: Number(r.total_used),
    engagementCount: Number(r.engagement_count),
    categoryCount: Number(r.category_count),
    cityCount: Number(r.city_count),
    completedCount: Number(r.completed_count),
    failedCount: Number(r.failed_count),
    cancelledCount: Number(r.cancelled_count),
    lastStartedAt: r.last_started_at,
    reviewCount: Number(r.review_count),
    avgSpeed: num(r.avg_speed),
    avgQuality: num(r.avg_quality),
    avgPricing: num(r.avg_pricing),
    avgReliability: num(r.avg_reliability),
    preferredCount: Number(r.preferred_count),
    avoidCount: Number(r.avoid_count),
  };
}

/** A vendor the rollup knows nothing about — zero signals, no recency. */
function emptyScoreInputs(vendorId: string): VendorScoreInputs {
  return {
    vendorId,
    totalUsed: 0,
    engagementCount: 0, categoryCount: 0, cityCount: 0,
    completedCount: 0, failedCount: 0, cancelledCount: 0,
    lastStartedAt: null,
    reviewCount: 0, avgSpeed: null, avgQuality: null, avgPricing: null, avgReliability: null,
    preferredCount: 0, avoidCount: 0,
  };
}

/**
 * THE score-inputs read — one `get_vendor_score_inputs` call (0185, Q-13 revoked
 * tier → admin client via callAdminRpc) for a set of vendors. Returns a Map so a
 * vendor missing from the answer (impossible — the RPC zero-fills — but cheap to
 * guard) falls back to emptyScoreInputs.
 */
export async function getVendorScoreInputs(
  vendorIds: string[],
  opts: { now: Date; category?: string | null; city?: string | null },
): Promise<Map<string, VendorScoreInputs>> {
  const map = new Map<string, VendorScoreInputs>();
  if (vendorIds.length === 0) return map;
  // At most 500 ids per call (0192): the rollup returns one row per id, and a
  // single RPC response is cut at PostgREST's 1,000 rows — the fallback path's
  // 5,957 dining candidates would have come back as 1,000 rows and 4,957
  // vendors scored as if they had no history. The chunks run in parallel.
  const CHUNK = 500;
  const chunks: string[][] = [];
  for (let i = 0; i < vendorIds.length; i += CHUNK) chunks.push(vendorIds.slice(i, i + CHUNK));
  const pages = await Promise.all(chunks.map((ids) =>
    callAdminRpc<ScoreInputsRpcRow, VendorScoreInputs>(
      "get_vendor_score_inputs",
      {
        p_vendor_ids: ids,
        p_since: scoreWindowStart(opts.now).toISOString(),
        p_category: opts.category ?? null,
        p_city: opts.city ?? null,
      },
      mapScoreInputs,
      LOG,
    ),
  ));
  for (const rows of pages) for (const r of rows) map.set(r.vendorId, r);
  return map;
}

// ── Spine reads ────────────────────────────────────────────────────────────────

export type VendorSearchFilters = {
  query?: string;
  category?: string | null;
  status?: VendorStatus | null;
  limit?: number;
};

/** Name ILIKE (trigram-indexed, 0183) or an exact alias hit; optional category / status. */
export async function searchVendors(filters: VendorSearchFilters = {}): Promise<VendorRow[]> {
  // search_vendors (0187) rather than a PostgREST ILIKE: it matches every typed
  // word in any order, ignores spacing ("lux drovia" = "LuxDrovia"), tolerates a
  // typo, and searches aliases/subcategory/city/phone as well as the name.
  return callAdminRpc<VendorRow, VendorRow>(
    "search_vendors",
    {
      p_query: filters.query?.trim() || null,
      p_category: filters.category ?? null,
      p_status: filters.status ?? null,
      p_limit: Math.min(filters.limit ?? VENDOR_SEARCH_DEFAULT_LIMIT, VENDOR_SEARCH_MAX_LIMIT),
      p_offset: 0,
    },
    (r) => r,
    LOG,
  );
}

export async function getVendorById(id: string): Promise<VendorRow | null> {
  const admin = createAdminClient();
  const { data, error } = await from(admin, "vendors").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error(`${LOG} getVendorById failed:`, error);
    return null;
  }
  return (data as VendorRow | null) ?? null;
}

export async function getVendorsByIds(ids: string[]): Promise<VendorRow[]> {
  if (ids.length === 0) return [];
  const admin = createAdminClient();
  const { data, error } = await from(admin, "vendors").select("*").in("id", ids);
  if (error) {
    console.error(`${LOG} getVendorsByIds failed:`, error);
    return [];
  }
  return mapRows<VendorRow, VendorRow>(data, (r) => r);
}

/** One ledger row — the close / review cores read this before writing. */
export async function getEngagementById(id: string): Promise<VendorEngagementRow | null> {
  const admin = createAdminClient();
  const { data, error } = await from(admin, "vendor_engagements").select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error(`${LOG} getEngagementById failed:`, error);
    return null;
  }
  return (data as VendorEngagementRow | null) ?? null;
}

// ── The /vendors list ───────────────────────────────────────────────────────────────────────

export type VendorListFilters = {
  search?: string | null;
  category?: string | null;
  page?: number;
};

/**
 * One page of the vendors list, each row carrying the two derived numbers the
 * table shows: all-time times-used and the computed score. Both come from the
 * ONE rollup call for the page's ids — never a per-row query.
 *
 * `score` is null for a vendor never used AND never rated: there is nothing to
 * score, and a 0 would read as "bad" rather than "unknown" (the table renders
 * an em dash). A blacklisted vendor still gets its score; the table shows the
 * status in its place, but the number underneath stays truthful.
 */
/**
 * How many vendors match — the pager total. `count_vendors` returns a scalar
 * bigint, not rows, so it cannot ride `callAdminRpc` (which maps an array);
 * it is the one place here that calls `.rpc` directly. Number() per Q-09.
 */
async function countVendors(search: string | null, category: string | null): Promise<number> {
  const admin = createAdminClient();
  // `?? undefined`, not null: every one of these params has a SQL DEFAULT, so
  // the generated types mark them optional. Omitting a param and passing NULL
  // mean the same thing to the function — the type just insists on the former.
  const { data, error } = await admin.rpc("count_vendors", {
    p_query: search ?? undefined,
    p_category: category ?? undefined,
  });
  if (error) {
    console.error(`${LOG} count_vendors failed:`, error);
    return 0;
  }
  return Number(data ?? 0);
}

export async function listVendors(
  filters: VendorListFilters = {},
): Promise<{ vendors: VendorListItem[]; totalCount: number }> {
  const page = Math.max(1, filters.page ?? 1);
  const offset = (page - 1) * VENDOR_LIST_PAGE_SIZE;
  const search = filters.search?.trim() || null;
  const category = filters.category ?? null;

  // The page and its total come from the SAME predicate (0187): count_vendors
  // delegates to search_vendors, so the pager can never disagree with the rows.
  const [rows, totalCount] = await Promise.all([
    callAdminRpc<VendorRow, VendorRow>(
      "search_vendors",
      {
        p_query: search,
        p_category: category,
        p_status: null,
        p_limit: VENDOR_LIST_PAGE_SIZE,
        p_offset: offset,
      },
      (r) => r,
      LOG,
    ),
    countVendors(search, category),
  ]);
  if (rows.length === 0) return { vendors: [], totalCount };

  const now = new Date();
  const inputs = await getVendorScoreInputs(rows.map((v) => v.id), { now });

  return {
    vendors: rows.map((vendor) => {
      const row = inputs.get(vendor.id) ?? emptyScoreInputs(vendor.id);
      const scored = computeVendorScore(row, { now });
      return {
        vendor,
        timesUsed: row.totalUsed,
        // null until someone has judged them — computeVendorScore decides.
        score: scored.score,
      };
    }),
    totalCount,
  };
}

/** Every category in use — the list page's Category filter options. */
export async function getVendorCategories(): Promise<string[]> {
  // get_vendor_categories (0187): a DISTINCT in SQL. This used to select the
  // column off every vendor row and de-duplicate here — PostgREST caps a select
  // at 1,000 rows and says nothing, so the filter list was whatever sorted into
  // the first thousand of 21,000.
  // 0192: ONE text[] in one row — a row-per-category result was itself subject
  // to PostgREST's 1,000-row response cap. Eleven today; the shape is the point.
  return callAdminRpc<string, string>("get_vendor_categories", {}, (r) => r, LOG);
}

/** Every city a capability covers, plus the cities vendors are based in — the
 *  find-a-vendor parser matches against these, so a city only exists once we
 *  actually serve it. */
export async function getVendorCities(): Promise<string[]> {
  // get_vendor_cities (0187): served cities ∪ home cities, distinct, in SQL.
  // The Node union read all 25,000 capability rows to get at their city arrays
  // — capped at 1,000, so a city served only by a vendor outside that window did
  // not exist as far as the find-a-vendor parser was concerned.
  // 0192: ONE text[] in one row. The row-per-city version returned exactly
  // 1,000 of 2,071 on production — the cap was waiting at the RPC layer too.
  return callAdminRpc<string, string>("get_vendor_cities", {}, (r) => r, LOG);
}

// ── Vendor-page reads ─────────────────────────────────────────────────────────────────

/** Notes on a vendor, newest first, with the author's name (migration 0186). */
export async function getVendorNotes(vendorId: string): Promise<VendorNoteWithAuthor[]> {
  const admin = createAdminClient();
  const { data, error } = await from(admin, "vendor_notes")
    .select("*, author:profiles(full_name)")
    .eq("vendor_id", vendorId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error(`${LOG} getVendorNotes failed:`, error);
    return [];
  }
  return mapRows<VendorNoteWithAuthor, VendorNoteWithAuthor>(data, (r) => r);
}

/**
 * Who on the team books this vendor most. Tallied in JS over one vendor's own
 * history (bounded), so it needs no GROUP BY RPC and no migration. A job run by
 * ex-staff keeps the raw archive name rather than vanishing from the count.
 */
export async function getVendorUsage(
  vendorId: string,
): Promise<{ topAgents: VendorAgentUsage[]; categories: VendorCategoryUsage[] }> {
  // Two GROUP BYs in SQL (0185). This used to pull the vendor's entire ledger
  // through PostgREST and tally it here — silently capped at 1,000 rows, so the
  // busiest vendors, the ones this panel is opened for, showed a partial count.
  // Ex-staff keep their raw name: the SQL falls back to agent_name_raw when the
  // profile is gone, so the tally is of people, not surviving accounts.
  const [topAgents, categories] = await Promise.all([
    callAdminRpc<{ agent_id: string | null; name: string; count: number }, VendorAgentUsage>(
      "get_vendor_agent_usage",
      { p_vendor_id: vendorId, p_limit: VENDOR_TOP_AGENTS },
      (r) => ({ agentId: r.agent_id ?? `raw:${r.name}`, name: r.name, count: Number(r.count) }),
      LOG,
    ),
    callAdminRpc<{ category: string; count: number }, VendorCategoryUsage>(
      "get_vendor_category_usage",
      { p_vendor_id: vendorId },
      (r) => ({ category: r.category, count: Number(r.count) }),
      LOG,
    ),
  ]);
  return { topAgents, categories };
}

/**
 * The vendor's invoices, newest first — flattened out of the jobs they were
 * filed against (an invoice IS a path on its engagement, 0184/0185), so each
 * one keeps its date, what it was for, and what we paid.
 */
export async function getVendorInvoices(
  vendorId: string,
  limit = VENDOR_INVOICE_PREVIEW,
): Promise<{ invoices: VendorInvoice[]; total: number }> {
  const admin = createAdminClient();
  const { data, error } = await from(admin, "vendor_engagements")
    .select("id, source_ref, invoice_paths, started_at, closed_at, category, city, amount_inr")
    .eq("vendor_id", vendorId)
    .not("invoice_paths", "eq", "{}")
    .order("started_at", { ascending: false })
    .limit(200);
  if (error) {
    console.error(`${LOG} getVendorInvoices failed:`, error);
    return { invoices: [], total: 0 };
  }
  type Row = Pick<
    VendorEngagementRow,
    "id" | "source_ref" | "invoice_paths" | "started_at" | "closed_at" | "category" | "city" | "amount_inr"
  >;
  const all: VendorInvoice[] = [];
  for (const e of mapRows<Row, Row>(data, (r) => r)) {
    for (const path of e.invoice_paths) {
      all.push({
        engagementId: e.id,
        ref: e.source_ref,
        path,
        date: e.closed_at ?? e.started_at,
        category: e.category,
        city: e.city,
        amountInr: e.amount_inr == null ? null : Number(e.amount_inr),
      });
    }
  }
  return { invoices: all.slice(0, limit), total: all.length };
}
// ── The dossier ────────────────────────────────────────────────────────────────

type ReviewJoinRow = VendorReviewRow & { reviewer: { full_name: string | null } | null };
type PreferenceJoinRow = VendorAgentPreferenceRow & { agent: { full_name: string | null } | null };

/** Everything about one vendor: spine + capabilities + recent ledger + reviews + score. */
export async function getVendorDetail(id: string, now = new Date()): Promise<VendorDetail | null> {
  const vendor = await getVendorById(id);
  if (!vendor) return null;

  const admin = createAdminClient();
  const [caps, engagements, reviews, inputs, notes, usage, invoices, prefs] = await Promise.all([
    from(admin, "vendor_capabilities").select("*").eq("vendor_id", id)
      .order("category", { ascending: true }).order("service", { ascending: true, nullsFirst: true }),
    from(admin, "vendor_engagements").select("*").eq("vendor_id", id)
      .order("started_at", { ascending: false }).limit(VENDOR_DETAIL_RECENT_ROWS),
    from(admin, "vendor_reviews").select("*, reviewer:profiles(full_name)").eq("vendor_id", id)
      // created_at only — vendor_reviews is APPEND-ONLY and has no updated_at.
      // The stray .order("updated_at") here made every reviews read fail with
      // 42703, so the dossier silently showed no reviews at all.
      .order("created_at", { ascending: false }).limit(VENDOR_DETAIL_RECENT_ROWS),
    getVendorScoreInputs([id], { now }),
    getVendorNotes(id),
    getVendorUsage(id),
    getVendorInvoices(id),
    from(admin, "vendor_agent_preferences").select("*, agent:profiles(full_name)").eq("vendor_id", id)
      .order("updated_at", { ascending: false }),
  ]);
  for (const [label, res] of [["capabilities", caps], ["engagements", engagements], ["reviews", reviews], ["preferences", prefs]] as const) {
    if (res.error) console.error(`${LOG} getVendorDetail ${label} failed:`, res.error);
  }

  const scoreInputs = inputs.get(id) ?? emptyScoreInputs(id);
  const reviewRows = mapRows<ReviewJoinRow, VendorDetail["reviews"][number]>(reviews.data, ({ reviewer, ...r }) => ({
    ...r,
    reviewer_name: reviewer?.full_name ?? null,
  }));

  // Per-dimension averages come from the rollup (latest-per-reviewer, all-time);
  // the count beside each star row is how many of those reviews filled it in.
  const averages: Record<ReviewDimension, number | null> = {
    speed: scoreInputs.avgSpeed,
    quality: scoreInputs.avgQuality,
    pricing: scoreInputs.avgPricing,
    reliability: scoreInputs.avgReliability,
  };
  const ratings = REVIEW_DIMENSIONS.map((dimension) => ({
    dimension,
    average: averages[dimension],
    count: reviewRows.filter((r) => r[dimension] != null).length,
  }));

  return {
    vendor,
    capabilities: mapRows<VendorCapabilityRow, VendorCapabilityRow>(caps.data, (r) => r),
    engagements: mapRows<VendorEngagementRow, VendorEngagementRow>(engagements.data, (r) => r),
    reviews: reviewRows,
    notes,
    preferences: mapRows<PreferenceJoinRow, VendorAgentPreferenceWithAgent>(prefs.data, ({ agent, ...r }) => ({
      ...r,
      agent_name: agent?.full_name ?? null,
    })),
    invoices: invoices.invoices,
    topAgents: usage.topAgents,
    categoriesUsed: usage.categories,
    ratings,
    reviewerCount: scoreInputs.reviewCount,
    timesUsed: scoreInputs.totalUsed,
    score: computeVendorScore(scoreInputs, { now }),
  };
}

// ── THE ranker ─────────────────────────────────────────────────────────────────

export type RankVendorsRequest = {
  /**
   * The request in the requester's own words. When present this is the PRIMARY
   * signal: it is searched against the ticket titles of past jobs, so "order
   * for black forest cake" finds whoever supplied cakes without anyone having
   * added the word "cake" to a vocabulary. The chips below only narrow it.
   */
  phrase?: string | null;
  /** NULL is legal when a `service` or a `phrase` is given. */
  category?: string | null;       // lower-cased slug / label (the schema lower-cases)
  service?: string | null;
  city?: string | null;           // lower-cased
  clientId?: string | null;
  /**
   * Whose sticky notes shape the answer (0191): their own `avoid` removes a
   * vendor, their own `preferred` lifts it. The action passes the caller;
   * Elaya passes the staff principal. Teammates' marks reach the answer
   * through the rollup regardless.
   */
  agentId?: string | null;
  limit?: number;
  now?: Date;
};


/** Empty cities = anywhere; otherwise the requested city must be listed. */

/**
 * Does an `offers` row make this vendor a candidate?
 *   - No specific service asked for → ANY offers row in the category counts.
 *     ("Who do we use for retail?" must surface the sourcing specialist, not
 *     only vendors carrying a whole-category row.)
 *   - `row.service === null` → the vendor offers the whole category, so it
 *     covers whatever service was asked for.
 *   - Otherwise the row must name exactly the service asked for.
 */

/**
 * Does a `declines` row exclude this vendor? Only when it actually COVERS the
 * request — the whole category (`row.service === null`), or exactly the service
 * asked for. A vendor who declines visas stays a candidate for a flights
 * request, and for a category-wide travel request, because they still do other
 * work in that category. (The spec's wording: no `declines` row *for it*.)
 */

/**
 * "Best vendor for this ticket" — the ONLY ranking in the codebase (R-01).
 * Elaya's find_vendors tool, the future Sia ticket screen and the Chrome
 * extension all call this; none of them re-rank.
 *
 *   1. Candidates: an `offers` capability covering the category (+ service, + city),
 *      no `declines` covering it, and vendors.status = 'active' (paused /
 *      blacklisted never appear — getVendorDetail says why when asked directly).
 *   2. Score each from the one rollup (computeVendorScore) + flags.
 *   4. Member layer: prior jobs for this member become a reason (Phase 2 grows
 *      this into the full member-match score — the column exists for it).
 *   5. Top N by score, ties by name.
 */
type HistoryMatchRow = {
  vendor_id: string;
  match_count: number;
  match_score: number;
  last_matched: string | null;
  sample_titles: string[] | null;
};

export type VendorHistoryMatch = {
  vendorId: string;
  matchCount: number;
  sampleTitles: string[];
};

/**
 * Vendors who have DONE this kind of job, found by searching the ticket titles
 * of the 47,441 past engagements (0189) rather than a keyword vocabulary.
 *
 * The vocabulary approach could only ever recognise words someone had thought
 * to type into the code — "order for black forest cake" and "need a
 * cardiologist" both matched nothing. Titles are the sentences the team
 * actually wrote, so the archive answers for itself.
 */
export async function findVendorsByHistory(
  phrase: string,
  opts: {
    /** Ordered most-important-first, from the model that read the request (0190). */
    terms?: string[] | null;
    category?: string | null; service?: string | null; city?: string | null; limit?: number;
  } = {},
): Promise<{ matches: VendorHistoryMatch[]; ok: boolean }> {
  const res = await callAdminRpcChecked<HistoryMatchRow, VendorHistoryMatch>(
    "find_vendors_by_history",
    {
      p_query: phrase,
      p_terms: opts.terms?.length ? opts.terms : null,
      p_category: opts.category ?? null,
      p_service: opts.service ?? null,
      p_city: opts.city ?? null,
      p_limit: Math.min(opts.limit ?? RANK_DEFAULT_LIMIT, RANK_MAX_LIMIT),
    },
    (r) => ({
      vendorId: r.vendor_id,
      matchCount: Number(r.match_count),
      sampleTitles: (r.sample_titles ?? []).filter(Boolean),
    }),
    LOG,
  );
  // `ok: false` is a search that died, not a search that found nothing. The
  // caller has to be able to tell — see callAdminRpcChecked.
  return { matches: res.rows, ok: res.ok };
}

export async function rankVendorsForRequest(req: RankVendorsRequest): Promise<RankedVendor[]> {
  const now = req.now ?? new Date();
  const service = req.service ?? null;
  const city = req.city ?? null;
  const limit = req.limit ?? RANK_DEFAULT_LIMIT;
  const admin = createAdminClient();

  // 1. Candidates, chosen in SQL (0188).
  //
  // This used to happen in Node: read the category's capability rows, decide
  // offers/declines here, then `.in("id", candidateIds)`. Every part of it
  // failed quietly at real volume — the capability read hit PostgREST's 1,000
  // row cap (dining has 6,034 rows, special-request 8,087, so the ranker saw a
  // sixth of the candidates), the `.in()` built a URI Kong rejects, and
  // `.eq("category", null)` matched nothing so a service-only request could
  // never return anyone. `offersApplies` / `declinesApplies` / `cityApplies`
  // were deleted with it rather than left beside the SQL: two statements of one
  // rule is exactly what drifts.
  // A PHRASE is the strongest signal we have — it is matched against what the
  // team actually wrote on past tickets, so it finds vendors no vocabulary
  // could name. The capability filter is the FALLBACK, used when the phrase
  // found nothing (or there was no phrase), because a capability row only says
  // what CATEGORY of work a vendor takes, never what the job was.
  const phrase = req.phrase?.trim() || null;

  // The model reads the sentence ONCE and returns what was actually asked for:
  // the subject, plus the words the team would plausibly have written for the
  // same thing. That is what makes "order for black forest cake" find the cake
  // suppliers and "pickup cash from the airport" find the car vendors — neither
  // shares a usable word with any vocabulary we could have written by hand.
  //
  // It NEVER names a vendor. Every vendor below is a row with real job history.
  //
  // Fails open: a missing key, a timeout or a torn reply returns null, and the
  // raw phrase is searched instead — degraded, never broken.
  const intent: VendorSearchIntent | null = phrase ? await readVendorRequest(phrase) : null;

  // A chip the CALLER supplied always wins — it is what the panel parsed or what
  // a person corrected by hand. The MODEL's category/service are deliberately
  // NOT used as filters: they are a guess, and a wrong guess is a hard filter
  // that empties the search. "Sweet Delivery" was read as `gifting`, which then
  // excluded Bombay Sweet Shop, whose tickets are filed under dining. The terms
  // already carry the meaning; the model's guesses are for DISPLAY only.
  const useCategory = req.category ?? null;
  const useService = service ?? null;
  // The city is the exception: a place name is a fact in the sentence, not an
  // interpretation, so the model's is trusted when the caller named none.
  const useCity = city ?? intent?.city ?? null;

  const history = phrase
    ? await findVendorsByHistory(phrase, {
        terms: intent?.terms ?? null,
        category: useCategory, service: useService, city: useCity, limit: Math.max(limit * 3, 15),
      })
    : { matches: [], ok: true };
  const historyById = new Map(history.matches.map((h) => [h.vendorId, h]));
  // The request was searched against past work and the search FAILED — not "found
  // nothing". The fallback below still runs, because a list ranked by usage beats a
  // blank page, but it is no longer presented as if it answered the question. 0224
  // made the timeout that caused this rare; this is what keeps the next one honest.
  const historyFailed = Boolean(phrase) && !history.ok;
  if (historyFailed) console.error(`${LOG} history search failed for "${phrase}" — ranking by usage instead`);

  let vendors: VendorRow[];
  if (historyById.size > 0) {
    vendors = await getVendorsByIds([...historyById.keys()]);
  } else {
    if (!useCategory && !useService) return [];   // nothing left to match on
    // Paged (0192): a broad category is thousands of candidates — dining is
    // 5,957, special-request 7,982 — and a single RPC response is cut at 1,000
    // without a word. The function ORDERs BY id for exactly this.
    vendors = await callAdminRpcAll<VendorRow, VendorRow>(
      "get_vendor_candidates",
      { p_category: useCategory, p_service: useService, p_city: useCity },
      (r) => r,
      LOG,
    );
  }
  if (vendors.length === 0) return [];
  const activeIds = vendors.map((v) => v.id);

  // 2–3. Signals: the rollup, this member's own history, and the asking
  // agent's own marks. The two side reads are keyed on the PERSON, never on
  // the candidate list: a `.in("vendor_id", activeIds)` puts every candidate id
  // in the request URI, and the capability fallback can return thousands — the
  // same "URI too long" that broke the old Node ranker. One member's jobs and
  // one agent's marks are each a short list; the candidate filter is in memory.
  const candidateIds = new Set(activeIds);
  const [inputs, memberHistory, agentMarks] = await Promise.all([
    getVendorScoreInputs(activeIds, { now, category: useCategory, city: useCity }),
    req.clientId
      ? from(admin, "vendor_engagements").select("vendor_id").eq("member_id", req.clientId)
      : Promise.resolve({ data: [], error: null }),
    req.agentId
      ? from(admin, "vendor_agent_preferences").select("vendor_id, stance, note").eq("agent_id", req.agentId)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (memberHistory.error) console.error(`${LOG} rankVendorsForRequest member history failed:`, memberHistory.error);
  if (agentMarks.error)    console.error(`${LOG} rankVendorsForRequest agent preferences failed:`, agentMarks.error);

  const memberJobsByVendor = new Map<string, number>();
  for (const e of mapRows<Pick<VendorEngagementRow, "vendor_id">, Pick<VendorEngagementRow, "vendor_id">>(memberHistory.data, (r) => r)) {
    if (!candidateIds.has(e.vendor_id)) continue;
    memberJobsByVendor.set(e.vendor_id, (memberJobsByVendor.get(e.vendor_id) ?? 0) + 1);
  }
  type MarkRow = Pick<VendorAgentPreferenceRow, "vendor_id" | "stance" | "note">;
  const myMarkByVendor = new Map<string, MarkRow>();
  for (const m of mapRows<MarkRow, MarkRow>(agentMarks.data, (r) => r)) {
    if (candidateIds.has(m.vendor_id)) myMarkByVendor.set(m.vendor_id, m);
  }

  // `ranking` rides along only to order the list; it is stripped on return.
  const ranked: (RankedVendor & { ranking: number })[] = [];
  for (const vendor of vendors) {
    // The agent layer (0191). The asking agent's own `avoid` is an exclusion —
    // not a caution, not a lower score: they said they do not want this vendor,
    // and the answer is theirs. Teammates' marks reach the answer through the
    // rollup instead (sentiment in the score, "N teammates avoid" in the flags)
    // — a caution to the rest of the floor, never a verdict for them.
    const mine = myMarkByVendor.get(vendor.id);
    if (mine?.stance === "avoid") continue;

    const row = inputs.get(vendor.id) ?? emptyScoreInputs(vendor.id);
    const scored = computeVendorScore(row, { now, category: useCategory, city: useCity });
    // `score` is the displayed verdict (null until judged); `ranking` always
    // has a value and is what orders the list.
    const score = scored.score;
    const match = historyById.get(vendor.id);
    // A title match outranks usage: 37 cake jobs beats 600 unrelated ones. The
    // raw score still orders vendors WITHIN the same match count.
    let ranking = match ? 1000 + match.matchCount * 10 + scored.ranking : scored.ranking;
    const reasons = [...scored.reasons];
    // Their own `preferred` lifts the vendor by a fixed step, inside whatever
    // match tier it already sits in, and says so — with the sticky note if
    // they left one.
    if (mine?.stance === "preferred") {
      ranking += PREFERRED_BOOST;
      reasons.push(mine.note ? `You prefer this vendor — "${mine.note}"` : "You prefer this vendor");
    }
    if (match) {
      // The evidence goes FIRST and quotes the real ticket, so the answer can
      // be judged rather than trusted.
      reasons.unshift(
        `${match.matchCount} matching job${match.matchCount === 1 ? "" : "s"}` +
          (match.sampleTitles[0] ? ` — "${match.sampleTitles[0]}"` : ""),
      );
    }
    const memberJobs = memberJobsByVendor.get(vendor.id) ?? 0;
    if (memberJobs > 0) reasons.push(`Used ${memberJobs} time${memberJobs === 1 ? "" : "s"} for this member before`);
      // Said out loud, at the top, on every row. A list ranked by usage is a
      // reasonable thing to show when the words could not be searched; passing it
      // off as a match is not, and that is what answered a power bank request with
      // airlines. The reader can now see which question was actually answered.
      if (historyFailed) reasons.unshift("Could not search past jobs for these words — ranked by how often each is used");

    ranked.push({
      vendor,
      score,
      ranking,
      reasons,
      flags: vendorFlags(row, vendor.identity_status === "verified"),
    });
  }

  ranked.sort((a, b) => b.ranking - a.ranking || a.vendor.name.localeCompare(b.vendor.name));
  // `ranking` is an internal ordering key, not part of the answer.
  return ranked.slice(0, limit).map(({ ranking: _ranking, ...r }) => r);
}
