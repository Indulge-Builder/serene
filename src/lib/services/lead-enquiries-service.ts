/**
 * lead-enquiries-service.ts
 * THE lead_product_enquiries access (migration 0180).
 *
 * One lead holds many product enquiries. Phone stays the lead identity; the
 * products accumulate here. See the migration header for why that split exists.
 *
 * Client split follows Q-13:
 *   • recordProductEnquiry — ADMIN client. Runs in the webhook ingestion path,
 *     which has no session at all. The table has no INSERT policy by design.
 *   • getLeadProductEnquiries — SESSION client. RLS scopes the read to whoever
 *     can see the parent lead, so the dossier card needs no role logic of its own.
 */

import { createClient } from "@/lib/supabase/server";
import { giaDb } from "@/lib/supabase/schemas";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ProductEnquiryPayload } from "@/lib/leads/adapters";
import type { LeadProductEnquiry } from "@/lib/types/database";

/**
 * PostgreSQL unique-violation. Here it means the external_lead_id is already
 * recorded — a redelivery, not a new enquiry. The shop retries 3x automatically
 * (1s/4s/9s backoff) plus unlimited manual retries from its admin panel, and every
 * attempt carries the same Mongo ObjectId, so this path is expected traffic rather
 * than an error condition.
 */
const PG_UNIQUE_VIOLATION = "23505";

export type RecordEnquiryResult =
  /** A new enquiry row was written. */
  | { ok: true; duplicate: false }
  /** This external_lead_id was already recorded — nothing written, nothing wrong. */
  | { ok: true; duplicate: true }
  /** The write genuinely failed; the caller decides whether that is fatal. */
  | { ok: false; duplicate: false };

/**
 * Append one product enquiry to a lead. Idempotent on external_lead_id.
 *
 * Never throws: the lead row is the source of truth and must stand even if the
 * enquiry ledger write fails. Callers log and continue.
 */
export async function recordProductEnquiry(
  leadId: string,
  source: string,
  enquiry: ProductEnquiryPayload,
): Promise<RecordEnquiryResult> {
  const supabase = createAdminClient();

  const { error } = await giaDb(supabase).from("lead_product_enquiries").insert({
    lead_id:           leadId,
    external_lead_id:  enquiry.external_id,
    source,
    product_id:        enquiry.product_id,
    product_name:      enquiry.product_name,
    product_url:       enquiry.product_url,
    product_image_url: enquiry.product_image_url,
    brand:             enquiry.brand,
    price:             enquiry.price,
    currency:          enquiry.currency,
    price_region:      enquiry.price_region,
    sold_out:          enquiry.sold_out,
    price_on_request:  enquiry.price_on_request,
    enquiry_type:      enquiry.enquiry_type,
    note:              enquiry.note,
    member_role:       enquiry.member_role,
    admin_member_url:  enquiry.admin_member_url,
    enquired_at:       enquiry.enquired_at,
  });

  if (error) {
    if (error.code === PG_UNIQUE_VIOLATION) {
      console.warn(
        `[lead-enquiries] Redelivery of external_lead_id ${enquiry.external_id} — already recorded`,
      );
      return { ok: true, duplicate: true };
    }
    console.error("[lead-enquiries] Enquiry insert failed:", error.message);
    return { ok: false, duplicate: false };
  }

  return { ok: true, duplicate: false };
}

/**
 * Every product enquiry on one lead, newest first — the dossier card's only read.
 * Returns [] on error: a failed ledger read must render an empty card, never break
 * the dossier. Deliberately uncached (like getCasesForLead): at most a handful of
 * rows per lead, and staleness here would hide a brand-new enquiry from the agent
 * who was just notified about it.
 */
export async function getLeadProductEnquiries(
  leadId: string,
): Promise<LeadProductEnquiry[]> {
  const supabase = await createClient();

  const { data, error } = await giaDb(supabase)
    .from("lead_product_enquiries")
    .select("*")
    .eq("lead_id", leadId)
    .order("enquired_at", { ascending: false });

  if (error) {
    console.error("[lead-enquiries] Read failed:", error.message);
    return [];
  }

  return data ?? [];
}
