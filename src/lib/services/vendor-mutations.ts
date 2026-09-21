// vendor-mutations.ts — SERVER ONLY.
//
// THE shared, context-free body of every vendor write (the lead-mutations /
// task-mutations posture): both actions/vendors.ts (session caller) AND a future
// Elaya write tool (admin client, no session) call the SAME core, so a
// tool-driven write is byte-identical to a form-driven one (R-01). Each core
// takes an explicit MutationActor (principal-derived identity, never a session)
// and writes on the admin client — the 0183–0185 tables have NO user write
// policies by design (the deals posture). The CALLER gates (requireProfile /
// the Elaya principal); the cores stay ungated (Q-13). revalidatePath is
// request-context-only and stays in the caller. No Redis (internal scale).
//
// Ledger rules enforced HERE, because RLS cannot restrict columns:
//   • vendor_engagements is append-only. TWO sanctioned writes on an existing row:
//       closeEngagementCore — closed_at / outcome / amount_inr / invoice_paths /
//         note, on an OPEN row, exactly once (the resolve-once posture of
//         revival_candidates; documented in the 0185 COMMENT).
//       refineEngagement (inside logEngagementCore, provenance path only) — a
//         machine re-reading the same outside job fills what is still EMPTY and
//         changes nothing that is set. Never outcome, never closed_at, never id.
//         (Decision Log 2026-09-18.)
//   • vendor_reviews is append-only. A changed mind is a new row.
//   • A review on an engagement takes vendor_id FROM the engagement — the two
//     can never disagree.
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEngagementById } from "@/lib/services/vendors-service";
import type { MutationActor } from "@/lib/services/lead-mutations";
import type {
  CreateVendorInput,
  MergeVendorsInput,
  SetVendorDeletedInput,
  UpdateVendorInput,
  UpsertCapabilityInput,
  LogEngagementInput,
  CloseEngagementInput,
  AddReviewInput,
  AddVendorNoteInput,
  SetAgentPreferenceInput,
} from "@/lib/validations/vendor-schema";
import type { VendorSource, VendorStatus } from "@/lib/constants/vendors";
import type {
  VendorRow,
  VendorCapabilityRow,
  VendorEngagementRow,
  VendorReviewRow,
  VendorNoteRow,
  VendorAgentPreferenceRow,
} from "@/lib/types/vendor";

type AdminClient = ReturnType<typeof createAdminClient>;

// Interim until database.ts is regenerated after 0183–0185 land — the ONE cast here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const from = (admin: AdminClient, table: string) => (admin as any).from(table);

const LOG = "[vendor-mutations]";

/** Why a core refused — the action maps each to formErrors copy. */
export type VendorMutationError =
  | "duplicate"       // vendors.name_key already exists
  | "not_found"       // the target row is gone / never existed
  | "already_closed"  // closeEngagementCore on a closed ledger row
  | "mismatch"        // review engagement belongs to another vendor
  | "invalid"         // a DB CHECK rejected the write (e.g. closed_at < started_at)
  | "db";

export type VendorMutationResult<T> = { ok: true; row: T } | { ok: false; error: VendorMutationError };

/** Postgres error codes the cores translate; everything else is `db`. */
function classify(error: { code?: string } | null): VendorMutationError {
  switch (error?.code) {
    case "23505": return "duplicate";
    case "23503": return "not_found";   // FK target missing
    case "23514": return "invalid";     // CHECK violation
    default:      return "db";
  }
}

// ── Spine ──────────────────────────────────────────────────────────────────────

/** A vendor entered by staff — born verified (a human just confirmed it), source `manual`. */
/**
 * Where a vendor row came from, when a person did not type it in.
 *
 * A hand-entered vendor is born `verified` — a human just confirmed it exists.
 * A machine-extracted one must not be: it is a reading of a sentence, and the
 * whole point of `identity_status` is to say which of those you are looking at.
 * `import_raw` keeps the evidence so any row this creates can be traced back to
 * the note it came from, and undone as a set if the extraction turns out wrong.
 */
export type VendorProvenance = {
  /** Every machine source. `manual` is what the ABSENCE of provenance means. */
  source: Exclude<VendorSource, "manual">;
  /** Filed under this key inside `import_raw` — the ticket id, the note id, the quote. */
  evidence: Record<string, unknown>;
};

export async function createVendorCore(
  actor: MutationActor,
  input: CreateVendorInput,
  provenance?: VendorProvenance,
): Promise<VendorMutationResult<VendorRow>> {
  const admin = createAdminClient();
  const { data, error } = await from(admin, "vendors")
    .insert({
      name: input.name,
      aliases: input.aliases,
      category: input.category,
      subcategory: input.subcategory,
      category_source: input.category_source ?? (input.category ? "hand" : null),
      contacts: input.contacts,
      primary_phone: input.primary_phone,
      home_city: input.home_city,
      notes: input.notes,
      identity_status: provenance ? "unverified" : "verified",
      sources: [provenance?.source ?? "manual"],
      import_raw: provenance
        ? { [provenance.source]: provenance.evidence }
        : { manual: { created_by: actor.userId } },
    })
    .select("*")
    .single();
  if (error || !data) {
    console.error(`${LOG} createVendorCore failed:`, error);
    return { ok: false, error: classify(error) };
  }
  return { ok: true, row: data as VendorRow };
}

/** Patch the spine — only the keys present in the input change (explicit null clears). */
export async function updateVendorCore(
  actor: MutationActor,
  input: UpdateVendorInput,
): Promise<VendorMutationResult<VendorRow>> {
  const { id, ...rest } = input;
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
  if (patch.category !== undefined && patch.category_source === undefined && patch.category) {
    patch.category_source = "hand";
  }
  void actor; // identity is not stamped on the spine (no created_by/updated_by column, per 0181)

  const admin = createAdminClient();
  const { data, error } = await from(admin, "vendors")
    .update(patch)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) {
    console.error(`${LOG} updateVendorCore failed:`, error);
    return { ok: false, error: classify(error) };
  }
  if (!data) return { ok: false, error: "not_found" };
  return { ok: true, row: data as VendorRow };
}

/** active / paused / blacklisted — the ranker reads this on every request. */
export async function setVendorStatusCore(
  actor: MutationActor,
  id: string,
  status: VendorStatus,
): Promise<VendorMutationResult<VendorRow>> {
  void actor;
  const admin = createAdminClient();
  const { data, error } = await from(admin, "vendors")
    .update({ status })
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) {
    console.error(`${LOG} setVendorStatusCore failed:`, error);
    return { ok: false, error: classify(error) };
  }
  if (!data) return { ok: false, error: "not_found" };
  return { ok: true, row: data as VendorRow };
}

/**
 * Restore a removed vendor, or hide one outright (0227).
 *
 * Since 0230 the Remove BUTTON goes through removeVendorCore, which decides between
 * deleting and hiding. This stays the plain setter: it is what Restore calls, and it
 * is the way to hide a vendor deliberately without asking for that decision.
 *
 * Not a DELETE, and not a status. The ledger is ON DELETE RESTRICT, so a vendor
 * with any history cannot be hard-deleted at all -- and should not be: those rows
 * record money that moved, and someone having filed them under the wrong name
 * does not make them untrue. Setting `deleted_at` takes the row out of
 * search_vendors, count_vendors and get_vendor_candidates and leaves every fact
 * where it is, which is what makes the button safe to put in front of people.
 */
/** What Remove actually did. `deleted` means the spine row is gone (0230). */
export type VendorRemoveResult = {
  mode: "deleted" | "hidden";
  vendor_id: string;
  vendor_name: string;
  history: { jobs: number; reviews: number; notes: number };
};

/**
 * Remove a vendor: genuinely delete it when nothing is attached, hide it when
 * something is (0230).
 *
 * The decision is NOT taken here and never in the browser. `remove_vendor` counts
 * the engagements, reviews and notes inside its own transaction under a row lock,
 * so a job written between the page rendering and the click still wins. The page
 * shows the same counts only so the warning can say which of the two is coming.
 */
export async function removeVendorCore(
  actor: MutationActor,
  input: { id: string },
): Promise<VendorMutationResult<VendorRemoveResult>> {
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).rpc("remove_vendor", {
    p_vendor: input.id,
    p_actor: actor.userId || null,
  });
  if (error || !data) {
    console.error(`${LOG} removeVendorCore failed:`, error);
    return { ok: false, error: error?.code === "P0002" ? "not_found" : classify(error ?? null) };
  }
  return { ok: true, row: data as VendorRemoveResult };
}

export async function setVendorDeletedCore(
  actor: MutationActor,
  input: SetVendorDeletedInput,
): Promise<VendorMutationResult<VendorRow>> {
  const admin = createAdminClient();
  const { data, error } = await from(admin, "vendors")
    .update(
      input.deleted
        ? { deleted_at: new Date().toISOString(), deleted_by: actor.userId || null }
        : { deleted_at: null, deleted_by: null },
    )
    .eq("id", input.id)
    .select("*")
    .maybeSingle();
  if (error) {
    console.error(`${LOG} setVendorDeletedCore failed:`, error);
    return { ok: false, error: classify(error) };
  }
  if (!data) return { ok: false, error: "not_found" };
  return { ok: true, row: data as VendorRow };
}

/** What a merge moved, as the RPC reports it back. Every number is a row count. */
export type VendorMergeResult = {
  kept_vendor_id: string;
  merged_vendor_id: string;
  merged_name: string;
  engagements_moved: number;
  engagements_folded: number;
  capabilities_moved: number;
  capabilities_folded: number;
  reviews: number;
  notes: number;
  preferences_moved: number;
  preferences_dropped: number;
  tickets: number;
  wa_groups: number;
  wa_contacts: number;
};

/**
 * Two rows, one supplier: fold `merge_id` into `keep_id` (0227).
 *
 * The whole thing is one SQL function on purpose. Seven tables point at a vendor
 * id and three of them carry a UNIQUE the move can collide with, so a merge run
 * as a series of calls from here could fail on the sixth table with five already
 * moved -- leaving jobs under a vendor that no longer exists. `merge_vendors`
 * does it in one transaction or not at all, and writes a `vendor_merges` row
 * holding the deleted spine row.
 *
 * The keeper only ever absorbs: every fold is a COALESCE, so nothing it already
 * knew is replaced by the duplicate's version. The loser's NAME becomes an alias,
 * which is what stops the live extractor recreating it on the next note.
 */
export async function mergeVendorsCore(
  actor: MutationActor,
  input: MergeVendorsInput,
): Promise<VendorMutationResult<VendorMergeResult>> {
  if (input.keep_id === input.merge_id) return { ok: false, error: "invalid" };
  const admin = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).rpc("merge_vendors", {
    p_keep: input.keep_id,
    p_merge: input.merge_id,
    // NULL is the honest value for a machine caller; the column allows it.
    p_actor: actor.userId || null,
  });
  if (error || !data) {
    console.error(`${LOG} mergeVendorsCore failed:`, error);
    // P0002 is the function's own "one of these vendors is gone" (see 0227).
    return { ok: false, error: error?.code === "P0002" ? "not_found" : classify(error ?? null) };
  }
  return { ok: true, row: data as VendorMergeResult };
}

// ── Capabilities (editable config) ─────────────────────────────────────────────

/**
 * Insert-or-update on the (vendor, category, COALESCE(service,'')) key. The
 * unique index is an EXPRESSION index, which PostgREST's onConflict cannot
 * name — so: one lookup, then update or insert (race-safe under the index:
 * a concurrent insert surfaces as 23505 → `duplicate`, the caller retries).
 */
/**
 * Who set a capability, when it was not a person.
 *
 * `set_by` is a uuid FK to profiles. A machine caller has no user, and the
 * extractor's ticket agent often has no Serene profile at all -- so the honest
 * value is NULL, not a fabricated one. Without this the whole write fails on an
 * invalid uuid, and it fails QUIETLY unless the caller checks the result: seven
 * vendors landed with zero capability rows before this argument existed.
 */
export type CapabilityProvenance = { setBy: string | null };

export async function upsertCapabilityCore(
  actor: MutationActor,
  input: UpsertCapabilityInput,
  provenance?: CapabilityProvenance,
): Promise<VendorMutationResult<VendorCapabilityRow>> {
  const admin = createAdminClient();
  let lookup = from(admin, "vendor_capabilities")
    .select("id")
    .eq("vendor_id", input.vendor_id)
    .eq("category", input.category);
  lookup = input.service == null ? lookup.is("service", null) : lookup.eq("service", input.service);
  const { data: existing, error: lookupError } = await lookup.maybeSingle();
  if (lookupError) {
    console.error(`${LOG} upsertCapabilityCore lookup failed:`, lookupError);
    return { ok: false, error: "db" };
  }

  const fields = {
    stance: input.stance,
    cities: input.cities,
    note: input.note,
    set_by: provenance ? provenance.setBy : actor.userId,
  };
  const query = existing
    ? from(admin, "vendor_capabilities").update(fields).eq("id", (existing as { id: string }).id)
    : from(admin, "vendor_capabilities").insert({
        vendor_id: input.vendor_id,
        category: input.category,
        service: input.service,
        ...fields,
      });
  const { data, error } = await query.select("*").single();
  if (error || !data) {
    console.error(`${LOG} upsertCapabilityCore write failed:`, error);
    return { ok: false, error: classify(error) };
  }
  return { ok: true, row: data as VendorCapabilityRow };
}

export async function deleteCapabilityCore(
  actor: MutationActor,
  id: string,
): Promise<VendorMutationResult<{ id: string }>> {
  void actor;
  const admin = createAdminClient();
  const { data, error } = await from(admin, "vendor_capabilities")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error(`${LOG} deleteCapabilityCore failed:`, error);
    return { ok: false, error: "db" };
  }
  if (!data) return { ok: false, error: "not_found" };
  return { ok: true, row: { id } };
}

// ── Engagements (the append-only ledger) ───────────────────────────────────────

/**
 * Log a job we did with a vendor. `source = 'manual'`, `source_ref` = the row's
 * own id (the (source, source_ref) UNIQUE needs a ref; the id is the honest one).
 * The runner defaults to the actor; `created_by` is always the actor.
 */
/**
 * Where a ledger row came from, when it was not a person filling in the form.
 *
 * A hand-logged job is `source: 'manual'` with a generated `source_ref`, because
 * there is no outside record to point at. A job the extractor read off a
 * Freshdesk ticket has one, and it matters: `(vendor_id, source, source_ref)` is
 * UNIQUE, so passing the ticket id makes the write IDEMPOTENT — the same ticket
 * read twice updates one row instead of minting a second. That is the whole
 * reason the key exists (0185), and a machine caller cannot use it without this.
 */
export type EngagementProvenance = {
  /** Every machine source. `manual` is what the ABSENCE of provenance means. */
  source: Exclude<VendorSource, "manual">;
  /** The outside system's id for this job — a Freshdesk ticket id, say. */
  sourceRef: string;
  /** The ticket subject. THE discriminator find_vendors_by_history searches (0189). */
  title?: string | null;
  /** Kept when the handling agent has no Serene profile (the 0185 ex-staff contract). */
  agentNameRaw?: string | null;
  /** Bucket paths, never urls (0184). */
  invoicePaths?: string[];
};

export async function logEngagementCore(
  actor: MutationActor,
  input: LogEngagementInput,
  provenance?: EngagementProvenance,
): Promise<VendorMutationResult<VendorEngagementRow>> {
  const admin = createAdminClient();

  // A provenance write may be a REPEAT -- the same outside job, read again from
  // a later note -- so the existing row is looked up first and REFINED. This is
  // deliberately not PostgREST's upsert: an upsert sends the whole payload, so a
  // second note that merely mentioned the vendor would null the amount the first
  // note's bill supplied (and the score reads that row), and the fresh random id
  // in that payload would change the row's id and orphan any review linked to
  // it. Found by the reviewer, 2026-09-18, by reading how upserts work.
  if (provenance) {
    const { data: existing, error: lookupError } = await from(admin, "vendor_engagements")
      .select("*")
      .eq("vendor_id", input.vendor_id)
      .eq("source", provenance.source)
      .eq("source_ref", provenance.sourceRef)
      .maybeSingle();
    if (lookupError) {
      console.error(`${LOG} logEngagementCore lookup failed:`, lookupError);
      return { ok: false, error: "db" };
    }
    if (existing) return refineEngagement(admin, existing as VendorEngagementRow, input, provenance);
  }

  const id = randomUUID();
  const { data, error } = await from(admin, "vendor_engagements")
    .insert({
      id,
      vendor_id: input.vendor_id,
      member_id: input.member_id,
      lead_id: input.lead_id,
      // `?? actor.userId` only holds for a person: a machine caller passes the
      // ticket's own agent, and null is a legal answer when they have no profile.
      agent_id: provenance ? input.agent_id : (input.agent_id ?? actor.userId),
      agent_name_raw: provenance?.agentNameRaw ?? null,
      title: provenance?.title ?? null,
      category: input.category,
      service: input.service,
      city: input.city,
      source: provenance?.source ?? "manual",
      source_ref: provenance?.sourceRef ?? id,
      started_at: input.started_at,
      closed_at: input.closed_at,
      outcome: input.outcome,
      amount_inr: input.amount_inr,
      invoice_paths: provenance?.invoicePaths ?? [],
      note: input.note,
      created_by: provenance ? null : actor.userId,
    })
    .select("*")
    .single();
  if (error || !data) {
    console.error(`${LOG} logEngagementCore failed:`, error);
    return { ok: false, error: classify(error) };
  }
  return { ok: true, row: data as VendorEngagementRow };
}

/**
 * The second sanctioned write on an existing ledger row (see the header).
 *
 * Fill what is still EMPTY; change nothing that is set. Note 1 carried the bill
 * (9,700 rupees); note 2 on the same ticket names the vendor again with no
 * amount -- the amount stays. Note 3 brings the city -- the city lands. The id
 * is never in the payload, so a review linked to this row stays linked.
 *
 * Outcome and closed_at are NOT refined here. They belong to closeEngagementCore,
 * the resolve-once close, which the extractor's settle pass calls when the
 * mirrored ticket is actually resolved. One place decides a job is over.
 */
async function refineEngagement(
  admin: AdminClient,
  existing: VendorEngagementRow,
  input: LogEngagementInput,
  provenance: EngagementProvenance,
): Promise<VendorMutationResult<VendorEngagementRow>> {
  const patch: Record<string, unknown> = {};
  const fill = (key: keyof VendorEngagementRow, next: unknown) => {
    if (existing[key] == null && next != null && next !== "") patch[key] = next;
  };
  fill("member_id", input.member_id);
  fill("lead_id", input.lead_id);
  fill("agent_id", input.agent_id);
  fill("agent_name_raw", provenance.agentNameRaw ?? null);
  fill("title", provenance.title ?? null);
  fill("service", input.service);
  fill("city", input.city);
  fill("amount_inr", input.amount_inr);
  fill("note", input.note);
  if (existing.invoice_paths.length === 0 && (provenance.invoicePaths?.length ?? 0) > 0) {
    patch.invoice_paths = provenance.invoicePaths;
  }
  // Nothing new to say: the existing row IS the answer, and no write happens.
  if (Object.keys(patch).length === 0) return { ok: true, row: existing };

  const { data, error } = await from(admin, "vendor_engagements")
    .update(patch)
    .eq("id", existing.id)
    .select("*")
    .single();
  if (error || !data) {
    console.error(`${LOG} refineEngagement failed:`, error);
    return { ok: false, error: classify(error) };
  }
  return { ok: true, row: data as VendorEngagementRow };
}

/**
 * THE one sanctioned write on a ledger row: close an OPEN engagement exactly
 * once (`WHERE closed_at IS NULL` — the resolve-once guard). Column set is fixed
 * here; nothing else on the row is ever touched.
 */
export async function closeEngagementCore(
  actor: MutationActor,
  input: CloseEngagementInput,
): Promise<VendorMutationResult<VendorEngagementRow>> {
  void actor;
  const admin = createAdminClient();
  const { data, error } = await from(admin, "vendor_engagements")
    .update({
      closed_at: input.closed_at,
      outcome: input.outcome,
      amount_inr: input.amount_inr,
      invoice_paths: input.invoice_paths,
      note: input.note,
    })
    .eq("id", input.id)
    .is("closed_at", null)
    .select("*")
    .maybeSingle();
  if (error) {
    console.error(`${LOG} closeEngagementCore failed:`, error);
    return { ok: false, error: classify(error) };
  }
  if (data) return { ok: true, row: data as VendorEngagementRow };
  // Zero rows: either already closed or never existed — say which.
  const existing = await getEngagementById(input.id);
  return { ok: false, error: existing ? "already_closed" : "not_found" };
}

// ── Reviews (append-only) ──────────────────────────────────────────────────────

/** A new review row; on an engagement, vendor_id is taken FROM that engagement. */
export async function addReviewCore(
  actor: MutationActor,
  input: AddReviewInput,
): Promise<VendorMutationResult<VendorReviewRow>> {
  let vendorId = input.vendor_id;
  if (input.engagement_id) {
    const engagement = await getEngagementById(input.engagement_id);
    if (!engagement) return { ok: false, error: "not_found" };
    if (engagement.vendor_id !== input.vendor_id) return { ok: false, error: "mismatch" };
    vendorId = engagement.vendor_id;
  }

  const admin = createAdminClient();
  const { data, error } = await from(admin, "vendor_reviews")
    .insert({
      vendor_id: vendorId,
      engagement_id: input.engagement_id,
      reviewer_id: actor.userId,
      speed: input.speed,
      quality: input.quality,
      pricing: input.pricing,
      reliability: input.reliability,
      comment: input.comment,
    })
    .select("*")
    .single();
  if (error || !data) {
    console.error(`${LOG} addReviewCore failed:`, error);
    return { ok: false, error: classify(error) };
  }
  return { ok: true, row: data as VendorReviewRow };
}

// ── Notes (migration 0186, append-only) ───────────────────────────────────────

/** One note on a vendor, authored by the actor. A correction is a new note. */
export async function addVendorNoteCore(
  actor: MutationActor,
  input: AddVendorNoteInput,
): Promise<VendorMutationResult<VendorNoteRow>> {
  const admin = createAdminClient();
  const { data, error } = await from(admin, "vendor_notes")
    .insert({
      vendor_id: input.vendor_id,
      author_id: actor.userId,
      content: input.content,
    })
    .select("*")
    .single();
  if (error || !data) {
    console.error(`${LOG} addVendorNoteCore failed:`, error);
    return { ok: false, error: classify(error) };
  }
  return { ok: true, row: data as VendorNoteRow };
}

// ── Preferences — the sticky note (0191) ───────────────────────────────────────

/**
 * Set a teammate's stance on a vendor — preferred / avoid, with an optional
 * note. An UPSERT on (vendor, agent): unlike the ledger this is an opinion
 * about now, so a changed mind replaces rather than appends. `agent_id`
 * defaults to the actor; an admin may set it for someone else.
 */
export async function setAgentPreferenceCore(
  actor: MutationActor,
  input: SetAgentPreferenceInput,
): Promise<VendorMutationResult<VendorAgentPreferenceRow>> {
  const admin = createAdminClient();
  const { data, error } = await from(admin, "vendor_agent_preferences")
    .upsert(
      {
        vendor_id: input.vendor_id,
        agent_id: input.agent_id ?? actor.userId,
        stance: input.stance,
        note: input.note,
      },
      { onConflict: "vendor_id,agent_id" },
    )
    .select("*")
    .single();
  if (error || !data) {
    console.error(`${LOG} setAgentPreferenceCore failed:`, error);
    return { ok: false, error: classify(error) };
  }
  return { ok: true, row: data as VendorAgentPreferenceRow };
}

/** Clear a teammate's stance. `not_found` when there was nothing to clear. */
export async function removeAgentPreferenceCore(
  actor: MutationActor,
  vendorId: string,
  agentId: string | null,
): Promise<VendorMutationResult<{ vendor_id: string; agent_id: string }>> {
  const agent = agentId ?? actor.userId;
  const admin = createAdminClient();
  const { data, error } = await from(admin, "vendor_agent_preferences")
    .delete()
    .eq("vendor_id", vendorId)
    .eq("agent_id", agent)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error(`${LOG} removeAgentPreferenceCore failed:`, error);
    return { ok: false, error: "db" };
  }
  if (!data) return { ok: false, error: "not_found" };
  return { ok: true, row: { vendor_id: vendorId, agent_id: agent } };
}
