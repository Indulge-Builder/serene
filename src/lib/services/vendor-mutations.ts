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
//   • vendor_engagements is append-only. closeEngagementCore is the ONE
//     sanctioned write on an existing row — closed_at / outcome / amount_inr /
//     invoice_paths / note, on an OPEN row, exactly once (the resolve-once
//     posture of revival_candidates; documented in the 0185 COMMENT).
//   • vendor_reviews is append-only. A changed mind is a new row.
//   • A review on an engagement takes vendor_id FROM the engagement — the two
//     can never disagree.
import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEngagementById } from "@/lib/services/vendors-service";
import type { MutationActor } from "@/lib/services/lead-mutations";
import type {
  CreateVendorInput,
  UpdateVendorInput,
  UpsertCapabilityInput,
  LogEngagementInput,
  CloseEngagementInput,
  AddReviewInput,
  AddVendorNoteInput,
  SetAgentPreferenceInput,
} from "@/lib/validations/vendor-schema";
import type { VendorStatus } from "@/lib/constants/vendors";
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
export async function createVendorCore(
  actor: MutationActor,
  input: CreateVendorInput,
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
      identity_status: "verified",
      sources: ["manual"],
      import_raw: { manual: { created_by: actor.userId } },
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

// ── Capabilities (editable config) ─────────────────────────────────────────────

/**
 * Insert-or-update on the (vendor, category, COALESCE(service,'')) key. The
 * unique index is an EXPRESSION index, which PostgREST's onConflict cannot
 * name — so: one lookup, then update or insert (race-safe under the index:
 * a concurrent insert surfaces as 23505 → `duplicate`, the caller retries).
 */
export async function upsertCapabilityCore(
  actor: MutationActor,
  input: UpsertCapabilityInput,
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
    set_by: actor.userId,
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
export async function logEngagementCore(
  actor: MutationActor,
  input: LogEngagementInput,
): Promise<VendorMutationResult<VendorEngagementRow>> {
  const id = randomUUID();
  const admin = createAdminClient();
  const { data, error } = await from(admin, "vendor_engagements")
    .insert({
      id,
      vendor_id: input.vendor_id,
      member_id: input.member_id,
      lead_id: input.lead_id,
      agent_id: input.agent_id ?? actor.userId,
      agent_name_raw: null,
      category: input.category,
      service: input.service,
      city: input.city,
      source: "manual",
      source_ref: id,
      started_at: input.started_at,
      closed_at: input.closed_at,
      outcome: input.outcome,
      amount_inr: input.amount_inr,
      invoice_paths: [],
      note: input.note,
      created_by: actor.userId,
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
