// ticket-vendor.ts — THE link between a ticket and the vendor who does the job
// (member-ticket-plan.md T6; the schema was ready for it: sia.tickets.vendor_id, and
// vendor_engagements.source = 'ticket', 0185).
//
//   suggest   the ONE vendor ranking (rankVendorsForRequest), asked with the ticket's own words
//             and the member, so past jobs for this member become a reason. Never re-ranked here.
//   choose    the vendor goes on the ticket (event vendor_chosen) AND the job is opened on the
//             vendor's ledger through logEngagementCore with provenance ticket:<ticket_no>, so a
//             re-pick of the same vendor refines that row and never doubles it.
//   close     when the ticket reaches resolved / closed / dropped, its open job is closed through
//             closeEngagementCore with the outcome the ticket's resolution implies. That is what
//             feeds the vendor's score: the ticket decides the outcome, nobody types it twice.
//
// A teammate sees a TRIMMED vendor here (name, city, category, phone, score, reasons): enough to
// pick and to call. The vendor dossier stays admin/founder. The caller gates by the ticket.
//
// Free of `server-only`: closing runs inside moveTicketStatusCore, which the sentinel calls
// from Trigger.dev.

import { createAdminClient } from "@/lib/supabase/admin";
import { rankVendorsForRequest, searchVendors, getVendorById } from "@/lib/services/vendors-service";
import { logEngagementCore, closeEngagementCore } from "@/lib/services/vendor-mutations";
import { TICKET_CATEGORIES } from "@/lib/constants/tickets";
import type { MutationActor } from "@/lib/services/lead-mutations";
import type { TicketRow } from "@/lib/types/ticket";
import type { EngagementOutcome } from "@/lib/constants/vendors";
import type { VendorRow } from "@/lib/types/vendor";

const LOG = "[ticket-vendor]";
/** Closing a job when a ticket ends is the system's act, whoever (or whatever) ended the ticket. closeEngagementCore ignores the actor. */
const SYSTEM_ACTOR: MutationActor = { userId: "", role: "admin", domain: "concierge", fullName: "Serene" };
const tickets = () => createAdminClient().schema("sia");

export type TicketVendorOption = { id: string; name: string; category: string | null; city: string | null; phone: string | null; score: number | null; reasons: string[]; flags: string[] };

const trim = (v: VendorRow, extra?: { score: number | null; reasons: string[]; flags: string[] }): TicketVendorOption =>
  ({ id: v.id, name: v.name, category: v.subcategory ?? v.category, city: v.home_city, phone: v.primary_phone, score: extra?.score ?? null, reasons: extra?.reasons ?? [], flags: extra?.flags ?? [] });

/** What the ticket is asking for, in its own words: the phrase the ranker searches past jobs with. */
function ticketPhrase(t: TicketRow): string {
  const b = (t.brief ?? {}) as Record<string, unknown>;
  return [t.title, b.product_details, b.event_name, b.preferred_vendor, b.gift_specifications].filter((x): x is string => typeof x === "string" && x.trim().length > 0).join(". ").slice(0, 400);
}

function ticketCity(t: TicketRow): string | null {
  const b = (t.brief ?? {}) as Record<string, unknown>;
  const raw = [b.to_location, b.from_location].find((x): x is string => typeof x === "string" && x.trim().length > 0);
  return raw ? raw.split(",")[0].trim().toLowerCase().slice(0, 60) : null;
}

export async function suggestVendorsForTicket(t: TicketRow, callerId: string): Promise<TicketVendorOption[]> {
  const ranked = await rankVendorsForRequest({ phrase: ticketPhrase(t), category: null, city: ticketCity(t), clientId: t.member_id, agentId: callerId, limit: 5 });
  return ranked.map((r) => trim(r.vendor, r));
}

export async function searchVendorsForTicket(query: string): Promise<TicketVendorOption[]> {
  const rows = await searchVendors({ query, status: "active", limit: 8 });
  return rows.map((v) => trim(v));
}

export async function getTicketVendor(vendorId: string): Promise<TicketVendorOption | null> {
  const v = await getVendorById(vendorId);
  return v ? trim(v) : null;
}

type Result<T> = { data: T; error: null } | { data: null; error: string };

/** Put a vendor on the ticket (or take it off with null) and open the job on the vendor's ledger. */
export async function setTicketVendorCore(ticketId: string, vendorId: string | null, actor: MutationActor): Promise<Result<TicketRow>> {
  const db = tickets();
  const { data: cur } = await db.from("tickets").select("*").eq("id", ticketId).maybeSingle();
  if (!cur) return { data: null, error: "Ticket not found." };
  const t = cur as unknown as TicketRow;
  if ((t.vendor_id ?? null) === vendorId) return { data: t, error: null };
  const vendor = vendorId ? await getVendorById(vendorId) : null;
  if (vendorId && (!vendor || vendor.status !== "active")) return { data: null, error: "That vendor is not available." };

  // The job changes hands: the previous vendor's open job for this ticket is closed as cancelled.
  if (t.vendor_id) await closeTicketEngagement(t, "cancelled", "The ticket moved to another vendor.");

  const { data, error } = await db.rpc("apply_ticket_change", {
    p_ticket_id: ticketId, p_patch: { vendor_id: vendorId ?? "" },
    p_event: { actor_kind: "human", actor_id: actor.userId, event_type: "vendor_chosen", body: vendor ? vendor.name : "Vendor removed", meta: { vendor_id: vendorId, previous_vendor_id: t.vendor_id ?? null } },
  });
  if (error) { console.error(`${LOG} set vendor failed`, error.message); return { data: null, error: "Could not set the vendor." }; }

  if (vendor) {
    const money = (t.money ?? {}) as { cost_inr?: number };
    const res = await logEngagementCore(actor, {
      vendor_id: vendor.id, member_id: t.member_id, lead_id: null, agent_id: t.assignee_id ?? actor.userId,
      category: TICKET_CATEGORIES.labels[t.category].toLowerCase(), service: null, city: ticketCity(t),
      started_at: new Date().toISOString(), closed_at: null, outcome: "unknown", amount_inr: typeof money.cost_inr === "number" ? money.cost_inr : null, note: null,
    }, { source: "ticket", sourceRef: t.ticket_no, title: t.title });
    // The ticket already carries the vendor; a ledger hiccup must not undo the human's choice.
    if (!res.ok) console.error(`${LOG} job not opened on the vendor's ledger for ${t.ticket_no}:`, res.error);
  }
  return { data: data as unknown as TicketRow, error: null };
}

/** Close the ticket's open vendor job. Safe to call when there is none. Never throws. */
export async function closeTicketEngagement(t: Pick<TicketRow, "ticket_no" | "vendor_id" | "money">, outcome: EngagementOutcome, note: string | null): Promise<void> {
  if (!t.vendor_id) return;
  try {
    const { data } = await createAdminClient().from("vendor_engagements").select("id").eq("vendor_id", t.vendor_id).eq("source", "ticket").eq("source_ref", t.ticket_no).is("closed_at", null).maybeSingle();
    const id = (data as { id: string } | null)?.id;
    if (!id) return;
    const money = (t.money ?? {}) as { cost_inr?: number };
    const res = await closeEngagementCore(SYSTEM_ACTOR, { id, closed_at: new Date().toISOString(), outcome, amount_inr: typeof money.cost_inr === "number" ? money.cost_inr : null, invoice_paths: [], note });
    if (!res.ok) console.error(`${LOG} job not closed for ${t.ticket_no}:`, res.error);
  } catch (e) { console.error(`${LOG} close failed for ${t.ticket_no}:`, e instanceof Error ? e.message : e); }
}

/** The outcome a ticket's ending implies for the vendor who did the job. */
export function outcomeForResolution(status: string, resolution: string | null): EngagementOutcome {
  if (status === "dropped" || resolution === "cancelled_by_member" || resolution === "duplicate" || resolution === "not_a_request") return "cancelled";
  if (resolution === "could_not_source") return "failed";
  return "completed";
}
